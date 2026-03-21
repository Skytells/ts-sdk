/**
 * Internal HTTP transport: JSON REST, retries, per-request timeouts, SSE chat streams, NDJSON, raw text/binary.
 *
 * **Not a public import** — use {@link SkytellsClient} (`Skytells()` factory). This module documents behavior for
 * maintainers, LLMs, and IDE hover.
 *
 * | Concern | Behavior |
 * |--------|------------|
 * | **Timeouts** | `AbortController` + `clearTimeout` in `finally` (no orphaned timers). |
 * | **Retries** | Only non-streaming JSON/text/buffer helpers; linear delay `retryDelay * (attempt + 1)`. |
 * | **Streams** | `ReadableStream` reader `cancel()` in `finally`; body `cancel()` if `getReader()` missing. |
 * | **Auth** | `skytells`: `x-api-key` + `Authorization`. `orchestrator`: Bearer only (see `transport`). |
 * | **Errors** | Throws {@link SkytellsError} (`errorId`, `httpStatus`, optional `requestId`). |
 *
 * @see docs/Reliability.md — resource and option clamping.
 * @module http
 */

import { API_BASE_URL } from './endpoints.js';
import type { RetryOptions } from './types/shared.types.js';
import { SkytellsError } from './types/shared.types.js';

/** Default request timeout (ms) for JSON and SSE requests. */
export const HTTP_DEFAULT_REQUEST_TIMEOUT_MS = 60000;

/**
 * Which product this {@link HTTP} instance calls. Set only by {@link SkytellsClient} — app code uses
 * `Skytells('sk-…', { orchestratorApiKey: 'wfb_…' })`; the client wires the correct transport per API.
 *
 * - **`skytells`** — platform API (`sk-…`): `x-api-key` + `Authorization: Bearer`
 * - **`orchestrator`** — Orchestrator (`wfb_…`): `Authorization: Bearer` only (no `x-api-key`)
 *
 * @internal
 */
type HttpTransport = 'skytells' | 'orchestrator';

type HttpJsonMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';

const DEFAULT_RETRY_ON = [429, 500, 502, 503, 504];

/** `setTimeout` is capped in practice (~2^31-1 ms); avoid overflow / infinite timers. */
const MAX_TIMER_MS = 2_147_483_647;

function isAbsoluteHttpUrl(pathOrUrl: string): boolean {
  return pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');
}

/** Fetch / `AbortController` timeout — same `name` in browsers, Node, and Edge runtimes. */
function isAbortError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    (error as Error).name === 'AbortError'
  );
}

/**
 * Append a decoded chunk, return complete `\n`-terminated lines (strip trailing `\r`) and the leftover tail.
 * Avoids `split('\n')` on the full buffer each chunk (CPU + allocations on long SSE / NDJSON streams).
 */
function appendAndExtractCompleteLines(
  buffer: string,
  chunk: string,
): { lines: string[]; rest: string } {
  const buf = buffer.length > 0 ? buffer + chunk : chunk;
  const lines: string[] = [];
  let start = 0;
  let nl = buf.indexOf('\n', start);
  while (nl >= 0) {
    let line = buf.slice(start, nl);
    if (line.endsWith('\r')) {
      line = line.slice(0, -1);
    }
    lines.push(line);
    start = nl + 1;
    nl = buf.indexOf('\n', start);
  }
  return { lines, rest: start === 0 ? buf : buf.slice(start) };
}

/**
 * Fetch-based client for one API origin (`baseUrl`) and one auth policy (`transport`).
 *
 * @internal Constructed only by {@link SkytellsClient} (and Orchestrator sub-client).
 */
export class HTTP {
  private apiKey?: string;
  private baseUrl: string;
  private timeout: number;
  private customHeaders: Record<string, string>;
  private retry: Required<RetryOptions>;
  private fetchFn: typeof fetch;
  private transport: HttpTransport;

  /**
   * @param apiKey - Platform `sk-…` or Orchestrator `wfb_…` depending on `transport`.
   * @param baseUrl - API origin (`api.skytells.ai/v1` or `orchestrator.skytells.ai`).
   * @param timeout - Per-request/stream abort time in ms.
   * @param headers - Merged into every request (JSON and SSE).
   * @param retry - Retries only for non-streaming {@link HTTP.request}.
   * @param fetchFn - Inject mock/proxy/`cache: 'no-store'` fetch.
   * @param transport - **`orchestrator`** for `client.orchestrator` only; default **`skytells`** for predictions/inference.
   */
  constructor(
    apiKey?: string,
    baseUrl: string = API_BASE_URL,
    timeout: number = HTTP_DEFAULT_REQUEST_TIMEOUT_MS,
    headers: Record<string, string> = {},
    retry: RetryOptions = {},
    fetchFn?: typeof fetch,
    transport: HttpTransport = 'skytells',
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.timeout =
      timeout === Infinity
        ? MAX_TIMER_MS
        : Number.isFinite(timeout) && timeout >= 0
          ? Math.min(timeout, MAX_TIMER_MS)
          : HTTP_DEFAULT_REQUEST_TIMEOUT_MS;
    this.customHeaders = headers;
    this.transport = transport;
    const rawRetries = retry.retries ?? 0;
    const rawDelay = retry.retryDelay ?? 1000;
    this.retry = {
      retries: Math.max(0, Math.min(Math.floor(rawRetries), 100)),
      retryDelay: Math.max(0, Math.min(Number.isFinite(rawDelay) ? rawDelay : 1000, MAX_TIMER_MS)),
      retryOn:
        Array.isArray(retry.retryOn) && retry.retryOn.length > 0 ? retry.retryOn : DEFAULT_RETRY_ON,
    };
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Orchestrator transport must not send `x-api-key` — only `Authorization: Bearer wfb_…` per
   * [Orchestrator webhooks](https://learn.skytells.ai/docs/products/orchestrator/webhooks). Strip any
   * `x-api-key` copied from shared **`ClientOptions.headers`** so the Skytells `sk-…` key is never
   * forwarded to `orchestrator.skytells.ai`.
   */
  private applyAuthHeaders(headers: Record<string, string>): void {
    if (this.transport === 'orchestrator') {
      delete headers['x-api-key'];
    }
    if (!this.apiKey) {
      return;
    }
    if (this.transport === 'skytells') {
      headers['x-api-key'] = this.apiKey;
    }
    headers['Authorization'] = `Bearer ${this.apiKey}`;
  }

  /**
   * Resolved API origin (no trailing slash), e.g. `https://api.skytells.ai/v1`.
   *
   * @returns Same string passed to the constructor (or default {@link API_BASE_URL}).
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * API key for this instance (`sk-…` or `wfb_…`), if any.
   *
   * @returns `undefined` for unauthenticated clients. Used by {@link SkytellsClient.webhookListener} for General HMAC.
   */
  getApiKey(): string | undefined {
    return this.apiKey;
  }

  /**
   * Non-streaming JSON `fetch`: read `response.text()` once, `JSON.parse`, map API errors to {@link SkytellsError}.
   *
   * @typeParam T - Expected successful JSON body shape (caller-supplied; not validated at runtime).
   * @param method - HTTP verb. Body sent only for `POST`, `PATCH`, `PUT`.
   * @param path - Relative to `baseUrl`, or absolute `http(s)://…`.
   * @param data - Serializable JSON object. **Circular references** → `SDK_ERROR`. Omit for GET/DELETE.
   * @returns Parsed response JSON.
   * @throws {SkytellsError} `REQUEST_TIMEOUT`, `NETWORK_ERROR`, `INVALID_JSON`, `SERVER_ERROR`, or API `error.error_id`.
   * @remarks Retries when `httpStatus` is in `retry.retryOn` and attempts remain. Skytells prediction “queued” envelopes are normalized inside the internal fetch path.
   */
  async request<T>(
    method: HttpJsonMethod,
    path: string,
    data?: Record<string, unknown>,
  ): Promise<T> {
    let lastError: SkytellsError | undefined;

    for (let attempt = 0; attempt <= this.retry.retries; attempt++) {
      try {
        return await this.executeRequest<T>(method, path, data);
      } catch (error) {
        if (error instanceof SkytellsError) {
          lastError = error;
          const isRetryable = this.retry.retryOn.includes(error.httpStatus);
          if (isRetryable && attempt < this.retry.retries) {
            await this.delay(Math.min(this.retry.retryDelay * (attempt + 1), MAX_TIMER_MS));
            continue;
          }
        }
        throw error;
      }
    }

    throw (
      lastError ??
      new SkytellsError('Request failed after retries', 'UNKNOWN_ERROR', 'No error details', 0)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }

  private async executeRequest<T>(
    method: HttpJsonMethod,
    path: string,
    data?: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };
    this.applyAuthHeaders(headers);

    const options: RequestInit = {
      method,
      headers,
    };

    if ((method === 'POST' || method === 'PATCH' || method === 'PUT') && data !== undefined) {
      try {
        options.body = JSON.stringify(data);
      } catch {
        throw new SkytellsError(
          'Request body could not be serialized to JSON',
          'SDK_ERROR',
          'Remove circular references or non-JSON values from the payload.',
          0,
        );
      }
    }

    // Add AbortController for timeout handling
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) {
      options.signal = controller.signal;
    }

    // Set up timeout if AbortController is available
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (controller) {
      timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeout);
    }

    try {
      const fetchUrl = isAbsoluteHttpUrl(path) ? path : `${this.baseUrl}${path}`;
      // Use native fetch which is available in modern browsers and edge environments
      const response = await this.fetchFn(fetchUrl, options);

      const contentType = response.headers.get('content-type') || '';
      const isJsonResponse = contentType.includes('application/json');
      const bodyText = await response.text();

      if (!isJsonResponse) {
        const responseText =
          bodyText.length > 500 ? `${bodyText.slice(0, 500)}... [truncated]` : bodyText;
        throw new SkytellsError(
          `Server responded with non-JSON content (${contentType})`,
          'SERVER_ERROR',
          `Status: ${response.status}, Content: ${responseText || '(empty)'}`,
          response.status,
        );
      }

      let responseData: Record<string, unknown> | null;
      try {
        responseData =
          bodyText.length === 0 ? null : (JSON.parse(bodyText) as Record<string, unknown>);
      } catch {
        const preview =
          bodyText.length > 500 ? `${bodyText.slice(0, 500)}... [truncated]` : bodyText;
        throw new SkytellsError(
          'Invalid JSON response',
          'INVALID_JSON',
          `The server returned invalid JSON. Status: ${response.status}, Content: ${preview}`,
          response.status,
        );
      }

      /**
       * Prediction endpoints always return a prediction object with `id`. Some responses also set
       * top-level `status: false` with `error.message` while the job is still queued — treat as success
       * when HTTP is OK and `id` is present (matches dashboard `processing` / `started`).
       */
      const data = responseData as { status?: boolean; id?: string; error?: unknown } | null;
      if (
        this.transport === 'skytells' &&
        response.ok &&
        data &&
        data.status === false &&
        typeof data.id === 'string' &&
        data.id.length > 0
      ) {
        return responseData as T;
      }

      // Check if the response indicates an error
      if (!response.ok || (responseData && responseData.status === false)) {
        const errObj = responseData?.error as
          | {
              status?: number;
              http_status?: number;
              request_id?: string;
              message?: string;
              error_id?: string;
              /** String or structured object (e.g. `{ category: 'inference' }`). */
              details?: string | Record<string, unknown>;
              /** High-level category, e.g. `"server_error"`. */
              type?: string;
              /** Machine-readable code, e.g. `"service_error"`. */
              code?: string;
            }
          | undefined;
        if (responseData && errObj) {
          const httpStatus = errObj.status ?? errObj.http_status ?? response.status;
          const requestId = errObj.request_id;
          const err = new SkytellsError(
            errObj.message || (responseData.response as string) || 'API error occurred',
            errObj.error_id || 'UNKNOWN_ERROR',
            errObj.details ?? (responseData.response as string) ?? 'No additional details',
            httpStatus,
            requestId,
          );
          if (errObj.type) {
            err.errorType = errObj.type;
          }
          if (errObj.code) {
            err.errorCode = errObj.code;
          }
          throw err;
        } else if (responseData?.response) {
          // Simple error with just a response message
          const msg = String(responseData.response);
          throw new SkytellsError(msg, 'API_ERROR', msg, response.status);
        } else {
          // Generic HTTP error
          throw new SkytellsError(
            `HTTP error ${response.status}`,
            'HTTP_ERROR',
            `The server returned status code ${response.status}`,
            response.status,
          );
        }
      }

      return responseData as T;
    } catch (error) {
      // Check if it's an abort error (timeout)
      if (isAbortError(error)) {
        throw new SkytellsError(
          `Request timed out after ${this.timeout}ms`,
          'REQUEST_TIMEOUT',
          `The request took longer than ${this.timeout}ms to complete`,
          408, // Request Timeout status code
        );
      }

      // Re-throw original error
      if (error instanceof SkytellsError) {
        throw error;
      }

      // Network or other errors
      throw new SkytellsError(
        error instanceof Error ? error.message : 'Network error occurred',
        'NETWORK_ERROR',
        'A network error occurred while communicating with the API',
        0, // No HTTP status for network errors
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * **SSE** streaming `POST`: parses `data: …` lines as JSON (chat completions when `stream: true`).
   *
   * @typeParam T - Usually {@link ChatCompletionChunk} from inference types.
   * @param path - e.g. `/chat/completions`.
   * @param data - Must include `stream: true`. Must be JSON-serializable or throws `SDK_ERROR`.
   * @returns Async iterable; consume with `for await`. Malformed lines skipped; `[DONE]` ignored.
   * @throws {SkytellsError} Non-OK HTTP, timeout (`REQUEST_TIMEOUT`), or missing body reader.
   * @remarks **Not retried.** Abandoning the loop still runs `reader.cancel()` in `finally`. Timeout cleared in outer `finally`.
   */
  async *requestStream<T>(path: string, data: Record<string, unknown>): AsyncIterable<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...this.customHeaders,
    };
    this.applyAuthHeaders(headers);

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let bodyJson: string;
    try {
      bodyJson = JSON.stringify(data);
    } catch {
      throw new SkytellsError(
        'Request body could not be serialized to JSON',
        'SDK_ERROR',
        'Remove circular references or non-JSON values from the payload.',
        0,
      );
    }
    const options: RequestInit = {
      method: 'POST',
      headers,
      body: bodyJson,
      signal: controller?.signal,
    };

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), this.timeout);
    }

    try {
      const fetchUrl = isAbsoluteHttpUrl(path) ? path : `${this.baseUrl}${path}`;
      const response = await this.fetchFn(fetchUrl, options);

      if (!response.ok) {
        const text = await response.text();
        let errData: {
          error?: { message?: string; error_id?: string; status?: number; request_id?: string };
        };
        try {
          errData = JSON.parse(text) as typeof errData;
        } catch {
          throw new SkytellsError(
            `HTTP ${response.status}: ${text.slice(0, 200)}`,
            'HTTP_ERROR',
            text.slice(0, 500),
            response.status,
          );
        }
        if (errData?.error) {
          throw new SkytellsError(
            errData.error.message || 'API error',
            errData.error.error_id || 'UNKNOWN_ERROR',
            errData.error.message || '',
            errData.error.status ?? response.status,
            errData.error.request_id,
          );
        }
        throw new SkytellsError(
          `HTTP error ${response.status}`,
          'HTTP_ERROR',
          text.slice(0, 500),
          response.status,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        try {
          await response.body?.cancel();
        } catch {
          /* ignore */
        }
        throw new SkytellsError('No response body', 'SERVER_ERROR', 'Stream not available', 0);
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const { lines, rest } = appendAndExtractCompleteLines(
            buffer,
            decoder.decode(value, { stream: true }),
          );
          buffer = rest;
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') {
                continue;
              }
              try {
                yield JSON.parse(payload) as T;
              } catch {
                // Skip malformed lines
              }
            }
          }
        }
        // Flush any remaining buffered data after the stream closes (handles servers that omit
        // the final newline — rare in SSE but safe to handle uniformly with requestNdjsonStream).
        if (buffer.startsWith('data: ')) {
          const payload = buffer.slice(6).trim();
          if (payload && payload !== '[DONE]') {
            try {
              yield JSON.parse(payload) as T;
            } catch {
              // ignore incomplete trailing data
            }
          }
        }
      } finally {
        try {
          await reader.cancel();
        } catch {
          // Reader may already be closed; ignore
        }
      }
    } catch (error) {
      if (error instanceof SkytellsError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new SkytellsError(
          `Request timed out after ${this.timeout}ms`,
          'REQUEST_TIMEOUT',
          'Stream timeout',
          408,
        );
      }
      throw new SkytellsError(
        error instanceof Error ? error.message : 'Stream error',
        'NETWORK_ERROR',
        'Stream failed',
        0,
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Successful response read as **plain text** (not JSON-validated). Used for code export, etc.
   *
   * @param method - Currently **`GET`** only in SDK call sites.
   * @param path - Relative or absolute URL.
   * @returns Full response body string.
   * @throws {SkytellsError} Same families as {@link HTTP.request} for HTTP/network/timeout errors.
   * @remarks Uses same **retry** policy as {@link HTTP.request}.
   */
  async requestText(method: 'GET', path: string): Promise<string> {
    let lastError: SkytellsError | undefined;
    for (let attempt = 0; attempt <= this.retry.retries; attempt++) {
      try {
        return await this.executeRequestRawText(method, path);
      } catch (error) {
        if (error instanceof SkytellsError) {
          lastError = error;
          const isRetryable = this.retry.retryOn.includes(error.httpStatus);
          if (isRetryable && attempt < this.retry.retries) {
            await this.delay(Math.min(this.retry.retryDelay * (attempt + 1), MAX_TIMER_MS));
            continue;
          }
        }
        throw error;
      }
    }
    throw (
      lastError ??
      new SkytellsError('Request failed after retries', 'UNKNOWN_ERROR', 'No error details', 0)
    );
  }

  /**
   * Successful response as **binary** (`arrayBuffer()`), e.g. ZIP downloads.
   *
   * @param method - **`GET`** in practice.
   * @param path - Relative or absolute URL.
   * @returns Raw bytes.
   * @throws {SkytellsError} On HTTP error, timeout, or network failure.
   * @remarks Same **retry** policy as {@link HTTP.request}.
   */
  async requestBuffer(method: 'GET', path: string): Promise<ArrayBuffer> {
    let lastError: SkytellsError | undefined;
    for (let attempt = 0; attempt <= this.retry.retries; attempt++) {
      try {
        return await this.executeRequestRawBuffer(method, path);
      } catch (error) {
        if (error instanceof SkytellsError) {
          lastError = error;
          const isRetryable = this.retry.retryOn.includes(error.httpStatus);
          if (isRetryable && attempt < this.retry.retries) {
            await this.delay(Math.min(this.retry.retryDelay * (attempt + 1), MAX_TIMER_MS));
            continue;
          }
        }
        throw error;
      }
    }
    throw (
      lastError ??
      new SkytellsError('Request failed after retries', 'UNKNOWN_ERROR', 'No error details', 0)
    );
  }

  /**
   * Fire **`OPTIONS`** (CORS preflight for Orchestrator webhooks). **No retries.**
   *
   * @param path - Full path under `baseUrl`.
   * @throws {SkytellsError} If `!response.ok`, timeout, or network error.
   */
  async requestOptions(path: string): Promise<void> {
    const headers: Record<string, string> = { ...this.customHeaders };
    this.applyAuthHeaders(headers);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const options: RequestInit = {
      method: 'OPTIONS',
      headers,
      signal: controller?.signal ?? undefined,
    };
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), this.timeout);
    }
    try {
      const fetchUrl = isAbsoluteHttpUrl(path) ? path : `${this.baseUrl}${path}`;
      const response = await this.fetchFn(fetchUrl, options);
      if (!response.ok) {
        const text = await response.text();
        throw new SkytellsError(
          `HTTP error ${response.status}`,
          'HTTP_ERROR',
          text.slice(0, 500) || `Status ${response.status}`,
          response.status,
        );
      }
    } catch (error) {
      if (error instanceof SkytellsError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new SkytellsError(
          `Request timed out after ${this.timeout}ms`,
          'REQUEST_TIMEOUT',
          'OPTIONS request timed out',
          408,
        );
      }
      throw new SkytellsError(
        error instanceof Error ? error.message : 'Network error',
        'NETWORK_ERROR',
        'OPTIONS request failed',
        0,
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * **NDJSON / JSONL** `POST`: one JSON object per line (Orchestrator AI workflow generation).
   *
   * @typeParam T - Line shape; default `Record<string, unknown>`.
   * @param path - e.g. `/api/ai/generate`.
   * @param data - Serialized as JSON body; circular data → `SDK_ERROR`.
   * @returns Async iterable of parsed lines; invalid JSON lines skipped.
   * @throws {SkytellsError} HTTP error, timeout, or missing stream body.
   * @remarks **Not retried** after bytes flow. Reader/body cleanup same as {@link HTTP.requestStream}.
   */
  async *requestNdjsonStream<T = Record<string, unknown>>(
    path: string,
    data: Record<string, unknown>,
  ): AsyncIterable<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson, application/jsonlines+json, text/plain, */*',
      ...this.customHeaders,
    };
    this.applyAuthHeaders(headers);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let ndjsonBody: string;
    try {
      ndjsonBody = JSON.stringify(data);
    } catch {
      throw new SkytellsError(
        'Request body could not be serialized to JSON',
        'SDK_ERROR',
        'Remove circular references or non-JSON values from the payload.',
        0,
      );
    }
    const options: RequestInit = {
      method: 'POST',
      headers,
      body: ndjsonBody,
      signal: controller?.signal,
    };
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), this.timeout);
    }
    try {
      const fetchUrl = isAbsoluteHttpUrl(path) ? path : `${this.baseUrl}${path}`;
      const response = await this.fetchFn(fetchUrl, options);
      if (!response.ok) {
        const text = await response.text();
        let errData: {
          error?: { message?: string; error_id?: string; status?: number; request_id?: string };
        };
        try {
          errData = JSON.parse(text) as typeof errData;
        } catch {
          throw new SkytellsError(
            `HTTP ${response.status}: ${text.slice(0, 200)}`,
            'HTTP_ERROR',
            text.slice(0, 500),
            response.status,
          );
        }
        if (errData?.error) {
          throw new SkytellsError(
            errData.error.message || 'API error',
            errData.error.error_id || 'UNKNOWN_ERROR',
            errData.error.message || '',
            errData.error.status ?? response.status,
            errData.error.request_id,
          );
        }
        throw new SkytellsError(
          `HTTP error ${response.status}`,
          'HTTP_ERROR',
          text.slice(0, 500),
          response.status,
        );
      }
      const reader = response.body?.getReader();
      if (!reader) {
        try {
          await response.body?.cancel();
        } catch {
          /* ignore */
        }
        throw new SkytellsError('No response body', 'SERVER_ERROR', 'Stream not available', 0);
      }
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const { lines, rest } = appendAndExtractCompleteLines(
            buffer,
            decoder.decode(value, { stream: true }),
          );
          buffer = rest;
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              continue;
            }
            try {
              yield JSON.parse(trimmed) as T;
            } catch {
              // skip malformed JSONL line
            }
          }
        }
        const tail = buffer.trim();
        if (tail) {
          try {
            yield JSON.parse(tail) as T;
          } catch {
            // ignore trailing garbage
          }
        }
      } finally {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      if (error instanceof SkytellsError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new SkytellsError(
          `Request timed out after ${this.timeout}ms`,
          'REQUEST_TIMEOUT',
          'NDJSON stream timeout',
          408,
        );
      }
      throw new SkytellsError(
        error instanceof Error ? error.message : 'Stream error',
        'NETWORK_ERROR',
        'NDJSON stream failed',
        0,
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async executeRequestRawText(method: 'GET', path: string): Promise<string> {
    const headers: Record<string, string> = { Accept: '*/*', ...this.customHeaders };
    this.applyAuthHeaders(headers);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const options: RequestInit = { method, headers, signal: controller?.signal };
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), this.timeout);
    }
    try {
      const fetchUrl = isAbsoluteHttpUrl(path) ? path : `${this.baseUrl}${path}`;
      const response = await this.fetchFn(fetchUrl, options);
      const bodyText = await response.text();
      if (!response.ok) {
        this.throwFromTextErrorResponse(response.status, bodyText);
      }
      return bodyText;
    } catch (error) {
      if (error instanceof SkytellsError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new SkytellsError(
          `Request timed out after ${this.timeout}ms`,
          'REQUEST_TIMEOUT',
          `The request took longer than ${this.timeout}ms to complete`,
          408,
        );
      }
      throw new SkytellsError(
        error instanceof Error ? error.message : 'Network error occurred',
        'NETWORK_ERROR',
        'A network error occurred while communicating with the API',
        0,
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async executeRequestRawBuffer(method: 'GET', path: string): Promise<ArrayBuffer> {
    const headers: Record<string, string> = { Accept: '*/*', ...this.customHeaders };
    this.applyAuthHeaders(headers);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const options: RequestInit = { method, headers, signal: controller?.signal };
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), this.timeout);
    }
    try {
      const fetchUrl = isAbsoluteHttpUrl(path) ? path : `${this.baseUrl}${path}`;
      const response = await this.fetchFn(fetchUrl, options);
      if (!response.ok) {
        const text = await response.text();
        this.throwFromTextErrorResponse(response.status, text);
      }
      return await response.arrayBuffer();
    } catch (error) {
      if (error instanceof SkytellsError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new SkytellsError(
          `Request timed out after ${this.timeout}ms`,
          'REQUEST_TIMEOUT',
          `The request took longer than ${this.timeout}ms to complete`,
          408,
        );
      }
      throw new SkytellsError(
        error instanceof Error ? error.message : 'Network error occurred',
        'NETWORK_ERROR',
        'A network error occurred while communicating with the API',
        0,
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  private throwFromTextErrorResponse(status: number, bodyText: string): never {
    let responseData: Record<string, unknown> | null = null;
    try {
      responseData =
        bodyText.length === 0 ? null : (JSON.parse(bodyText) as Record<string, unknown>);
    } catch {
      throw new SkytellsError(
        `HTTP error ${status}`,
        'HTTP_ERROR',
        bodyText.slice(0, 500) || `Status ${status}`,
        status,
      );
    }
    const errObj = responseData?.error as
      | {
          status?: number;
          http_status?: number;
          request_id?: string;
          message?: string;
          error_id?: string;
          details?: string;
        }
      | undefined;
    if (responseData && errObj) {
      const httpStatus = errObj.status ?? errObj.http_status ?? status;
      throw new SkytellsError(
        errObj.message || (responseData.response as string) || 'API error occurred',
        errObj.error_id || 'UNKNOWN_ERROR',
        errObj.details || (responseData.response as string) || 'No additional details',
        httpStatus,
        errObj.request_id,
      );
    }
    if (responseData?.response) {
      const msg = String(responseData.response);
      throw new SkytellsError(msg, 'API_ERROR', msg, status);
    }
    throw new SkytellsError(
      `HTTP error ${status}`,
      'HTTP_ERROR',
      bodyText.slice(0, 500) || `The server returned status code ${status}`,
      status,
    );
  }
}
