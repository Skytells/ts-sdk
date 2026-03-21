export interface ApiError {
  status: boolean;
  response: string;
  error: {
    http_status: number;
    message: string;
    /** May be a plain string or a structured object (e.g. `{ category: 'inference' }`). */
    details: string | Record<string, unknown>;
    error_id: string;
    type?: string;
    code?: string;
    request_id?: string;
    status?: number;
  };
}

export interface RetryOptions {
  /** Number of retry attempts for failed requests (default: 0) */
  retries?: number;
  /** Delay in milliseconds between retries (default: 1000) */
  retryDelay?: number;
  /** HTTP status codes that should trigger a retry (default: [429, 500, 502, 503, 504]) */
  retryOn?: number[];
}

/**
 * Where the SDK runs. **`edge`** tightens defaults (timeout, memory) and may log one-time hints.
 * **`node`** / **`browser`** are explicit labels only (same behavior as **`default`** today).
 */
export type SkytellsRuntime = 'default' | 'edge' | 'node' | 'browser';

/**
 * Configuration for the **`Skytells()`** factory and **`SkytellsClient`**.
 *
 * Use a **single client** for both products when needed: pass the platform key as the first argument (`sk-…`)
 * and set **`orchestratorApiKey`** (`wfb_…`) here. Predictions, chat, embeddings, etc. use the Skytells base URL
 * and `x-api-key` + Bearer; **`client.orchestrator`** uses the Orchestrator host and Bearer-only — the SDK
 * wires this from `ClientOptions` (no separate “auth mode” to set).
 */
export interface ClientOptions {
  /** Custom base URL for the API */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 60000; with `runtime: 'edge'` default becomes 25000 if omitted) */
  timeout?: number;
  /**
   * Merged into **every** request on **both** transports: main Skytells API (`sk-…`, `x-api-key` + Bearer)
   * and, when set, Orchestrator (`wfb_…`, Bearer only). Avoid putting `x-api-key` here expecting it only on
   * Skytells — Orchestrator requests strip `x-api-key` so keys stay separated.
   * @see https://learn.skytells.ai/docs/products/orchestrator/api-keys
   */
  headers?: Record<string, string>;
  /** Retry configuration for failed requests */
  retry?: RetryOptions;
  /** Custom fetch implementation (e.g. for testing or proxying) */
  fetch?: typeof fetch;
  /**
   * Target runtime. Use **`edge`** in Vercel Edge, Cloudflare Workers, Netlify Edge, etc.
   * Applies a shorter default timeout, a smaller inference-compat model cache, and one-time console hints.
   */
  runtime?: SkytellsRuntime;
  /**
   * [Orchestrator API key](https://learn.skytells.ai/docs/products/orchestrator/api-keys) (`wfb_…`).
   * **Not interchangeable** with the Skytells platform key (`sk-…`): webhook execution uses
   * `Authorization: Bearer wfb_…` only ([webhooks](https://learn.skytells.ai/docs/products/orchestrator/webhooks)).
   * Required for **`client.orchestrator`**. The SDK never sends this value on `api.skytells.ai` requests.
   * @see https://learn.skytells.ai/docs/products/orchestrator/api-reference
   */
  orchestratorApiKey?: string;
  /** Override Orchestrator API host (default `https://orchestrator.skytells.ai`). */
  orchestratorBaseUrl?: string;
}

export interface Pagination {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export enum ApiErrorId {
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  INVALID_DATE_FORMAT = 'INVALID_DATE_FORMAT',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SDK_ERROR = 'SDK_ERROR',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_REQUEST = 'INVALID_REQUEST',
  RATE_LIMITED = 'RATE_LIMITED',
  INFERENCE_RATE_LIMITED = 'INFERENCE_RATE_LIMITED',
  INFERENCE_TIMEOUT = 'INFERENCE_TIMEOUT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INFERENCE_ERROR = 'INFERENCE_ERROR',
  CONTENT_POLICY_VIOLATION = 'CONTENT_POLICY_VIOLATION',
  ENDPOINT_NOT_FOUND = 'ENDPOINT_NOT_FOUND',
  /** Client-side abort of {@link SkytellsClient.wait} / {@link SkytellsClient.run} polling via `AbortSignal`. */
  ABORTED = 'ABORTED',
  /** Inbound webhook: {@link verifySkytellsWebhookSignature} / {@link WebhookListener.handle} rejected the signature. */
  WEBHOOK_SIGNATURE_INVALID = 'WEBHOOK_SIGNATURE_INVALID',
  /** Rare internal guard after retry loop (should not surface in normal operation). */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  /** Generic HTTP failure when the body does not match the structured API error shape. */
  HTTP_ERROR = 'HTTP_ERROR',
  /** Simple API error envelope (`response` string). */
  API_ERROR = 'API_ERROR',
  /** Non-JSON or unexpected successful body / missing stream. */
  SERVER_ERROR = 'SERVER_ERROR',
  /** Response body was not valid JSON when JSON was expected. */
  INVALID_JSON = 'INVALID_JSON',
  /** Request aborted by client timeout (`AbortController`). */
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  /** Fetch failed or non-Skytells error before a response was parsed. */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** {@link SkytellsClient.wait} exceeded `maxWait`. */
  WAIT_TIMEOUT = 'WAIT_TIMEOUT',
  /** Terminal prediction status `failed` from {@link SkytellsClient.run}. */
  PREDICTION_FAILED = 'PREDICTION_FAILED',
}

/**
 * Thrown by the SDK on API failures, timeouts, invalid JSON, webhook verification failures, and some client-side guards.
 *
 * - **`instanceof SkytellsError`** — reliable in modern JS/TS (`Object.setPrototypeOf` applied).
 * - **`errorId`** — machine code; compare to {@link ApiErrorId} where applicable, or handle unknown strings from the API.
 * - **`httpStatus`** — HTTP status when the error came from a response; `0` for network/timeout/SDK-only errors.
 * - **`requestId`** — Correlation id from Skytells when the API returned it (support tickets).
 *
 * @example
 * ```ts
 * try {
 *   await client.predict({ model: 'x', input: {} });
 * } catch (e) {
 *   if (e instanceof SkytellsError && e.errorId === 'MODEL_NOT_FOUND') { /* … *\/ }
 * }
 * ```
 */
export class SkytellsError extends Error {
  /** API or SDK error code (e.g. `RATE_LIMIT_EXCEEDED`, `SDK_ERROR`). */
  errorId: string;
  /**
   * Longer technical detail; safe to log, not always user-facing copy.
   * May be a plain string or a structured object when the API returns one
   * (e.g. `{ category: 'inference' }`).
   */
  details: string | Record<string, unknown>;
  /** HTTP status from the failing response, or `0` if not applicable. */
  httpStatus: number;
  /** Unique request ID from the API (for support/debugging). Present on Inference API errors. */
  requestId?: string;
  /**
   * High-level error category returned by the API (e.g. `"server_error"`, `"invalid_request_error"`).
   * Present when the API error envelope includes a `type` field.
   */
  errorType?: string;
  /**
   * Machine-readable error code returned by the API (e.g. `"service_error"`, `"model_not_found"`).
   * Complements {@link errorId}; present when the API error envelope includes a `code` field.
   */
  errorCode?: string;

  /**
   * @param message - Human-readable summary (also `Error.message`).
   * @param errorId - Stable id for branching (`MODEL_NOT_FOUND`, `WEBHOOK_SIGNATURE_INVALID`, …).
   * @param details - Extra context for logs (string or structured object).
   * @param httpStatus - Optional HTTP status; defaults to `0`.
   * @param requestId - Optional upstream request id.
   */
  constructor(
    message: string,
    errorId: string,
    details: string | Record<string, unknown>,
    httpStatus?: number,
    requestId?: string,
  ) {
    super(message);
    this.name = 'SkytellsError';
    this.errorId = errorId;
    this.details = details;
    this.httpStatus = httpStatus || 0;
    this.requestId = requestId;

    Object.setPrototypeOf(this, SkytellsError.prototype);
  }
}
