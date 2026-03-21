/**
 * Webhooks — attach URLs to predictions and verify/handle incoming POSTs on your server.
 *
 * - **Outbound:** use {@link Webhook} (or `webhook.toJSON()`) on `predict` / `predictions.create` / `run`.
 * - **Inbound:** use {@link WebhookListener} or {@link createWebhookListener} with {@link verifySkytellsWebhookSignature}.
 *
 * @see https://docs.skytells.ai/webhooks/ — schema, events, `X-Skytells-Signature` (Enterprise vs General HMAC).
 * @module webhooks
 */

import { SkytellsError } from './types/shared.types.js';
import type { PredictionResponse } from './types/predict.types.js';
import { PredictionStatus } from './types/predict.types.js';

/** HTTP header Skytells sends with webhook POSTs (lowercase in fetch `Headers`). */
export const SKYTELLS_WEBHOOK_SIGNATURE_HEADER = 'x-skytells-signature';

/**
 * Event names accepted in `webhook.events` on prediction requests.
 * Maps to prediction status transitions per Skytells docs (`completed` ↔ succeeded, etc.).
 */
export enum WebhookEvent {
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
  STARTED = 'started',
}

/** JSON shape sent to `POST /predict` inside `webhook`. */
export interface WebhookPayload {
  url: string;
  events: string[];
}

/** Optional metadata for {@link Webhook} (reserved for future SDK fields). */
export interface WebhookOptions {
  // e.g. idempotency, labels
}

/**
 * Typed webhook config for predictions. Pass {@link Webhook.toJSON()} into `PredictionRequest.webhook`, or pass the
 * `Webhook` instance directly — the client normalizes it for `POST /predict`.
 *
 * @example
 * ```ts
 * await client.predictions.create({
 *   model: 'truefusion',
 *   input: { prompt: '…' },
 *   webhook: new Webhook('https://api.example.com/hooks/skytells', [
 *     WebhookEvent.COMPLETED,
 *     WebhookEvent.FAILED,
 *   ]).toJSON(),
 * });
 * ```
 */
export class Webhook {
  readonly url: string;
  readonly events: readonly WebhookEvent[];

  constructor(
    url: string,
    events: WebhookEvent[],
    public readonly options?: WebhookOptions,
  ) {
    this.url = url;
    this.events = Object.freeze([...events]);
  }

  /** Plain object for `PredictionRequest.webhook` / JSON body. */
  toJSON(): WebhookPayload {
    return { url: this.url, events: [...this.events] };
  }
}

export type WebhookVerifyMode = 'general' | 'enterprise';

export interface WebhookVerifyOptions {
  mode: WebhookVerifyMode;
  /** Enterprise: dashboard `SKYTELLS_WEBHOOK_SECRET`. */
  secret?: string;
  /** General: HMAC key is your API key (`sk-…`), same as `x-api-key` on outbound calls. */
  apiKey?: string;
}

export interface WebhookListenerOptions {
  /**
   * `general` — HMAC with API key. `enterprise` — HMAC with dashboard secret.
   * @default 'general'
   */
  mode?: WebhookVerifyMode;
  /**
   * Verify `X-Skytells-Signature` before parsing. Set `false` only in trusted dev environments.
   * @default true
   */
  verifySignature?: boolean;
  /** Enterprise: dashboard webhook secret. */
  secret?: string;
  /** General: same as Skytells `x-api-key`. */
  apiKey?: string;
}

export type WebhookRoute = WebhookEvent | `prediction.${PredictionStatus}` | 'prediction.*' | '*';

export type WebhookListenerHandler = (prediction: PredictionResponse) => void | Promise<void>;

function getHeader(
  headers: Headers | Record<string, string | string[] | undefined | null>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get(name) ?? headers.get(lower) ?? undefined;
  }
  const o = headers as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k.toLowerCase() === lower) {
      const v = o[k];
      if (typeof v === 'string') {
        return v;
      }
      if (Array.isArray(v) && typeof v[0] === 'string') {
        return v[0];
      }
    }
  }
  return undefined;
}

function hexFromBuffer(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < u8.length; i++) {
    const b = u8[i];
    out += (b >> 4).toString(16);
    out += (b & 15).toString(16);
  }
  return out;
}

async function hmacSha256Hex(keyUtf8: string, messageUtf8: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.importKey !== 'function') {
    throw new SkytellsError(
      'Webhook HMAC requires Web Crypto (crypto.subtle). Use Node 19+, Edge, or a runtime with SubtleCrypto.',
      'SDK_ERROR',
      'crypto.subtle is not available',
      0,
    );
  }
  const enc = new TextEncoder();
  const cryptoKey = await subtle.importKey(
    'raw',
    enc.encode(keyUtf8),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', cryptoKey, enc.encode(messageUtf8));
  return hexFromBuffer(sig);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let x = 0;
  for (let i = 0; i < a.length; i++) {
    x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return x === 0;
}

/**
 * Verify the `X-Skytells-Signature` header for a raw webhook body (**exact bytes/string** as received — do not re-serialize JSON).
 *
 * - **Enterprise:** HMAC-SHA256(body, `secret`) using dashboard secret.
 * - **General:** HMAC-SHA256(body, `apiKey`) using your `sk-…` key.
 *
 * @param rawBody - Unmodified POST body string.
 * @param signatureHeader - Value of `x-skytells-signature` (hex).
 * @param options - `mode` plus `secret` (enterprise) or `apiKey` (general). Missing key → `false`.
 * @returns `true` if signature matches (timing-safe compare), else `false`.
 * @throws {SkytellsError} `SDK_ERROR` if `crypto.subtle` is unavailable (very old Node without polyfill).
 *
 * @see https://docs.skytells.ai/webhooks/
 */
export async function verifySkytellsWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  options: WebhookVerifyOptions,
): Promise<boolean> {
  if (!signatureHeader?.trim()) {
    return false;
  }
  const key = options.mode === 'enterprise' ? options.secret : options.apiKey;
  if (!key) {
    return false;
  }
  const expected = await hmacSha256Hex(key, rawBody);
  return timingSafeEqualHex(expected.toLowerCase(), signatureHeader.trim().toLowerCase());
}

function predictionStatusToWebhookEvent(status: PredictionStatus): WebhookEvent | null {
  switch (status) {
    case PredictionStatus.SUCCEEDED:
      return WebhookEvent.COMPLETED;
    case PredictionStatus.FAILED:
      return WebhookEvent.FAILED;
    case PredictionStatus.CANCELLED:
      return WebhookEvent.CANCELED;
    case PredictionStatus.STARTED:
    case PredictionStatus.STARTING:
      return WebhookEvent.STARTED;
    default:
      return null;
  }
}

/**
 * Compute **all route keys** that should fire for a prediction payload (used by {@link WebhookListener.dispatch}).
 *
 * Includes `*`, `prediction.*`, `prediction.{status}`, and the mapped {@link WebhookEvent} when applicable.
 *
 * @param prediction - Parsed webhook JSON (must include `status`).
 * @returns Deduplicated list of route strings.
 */
export function webhookRoutesForPrediction(prediction: PredictionResponse): string[] {
  const keys = new Set<string>();
  keys.add('*');
  keys.add('prediction.*');
  keys.add(`prediction.${prediction.status}`);
  const ev = predictionStatusToWebhookEvent(prediction.status);
  if (ev) {
    keys.add(ev);
  }
  return [...keys];
}

/**
 * Discord-style inbound webhook router: verify signature, parse prediction JSON, invoke `.on` / `.listen` handlers.
 *
 * @example
 * ```ts
 * const listener = createWebhookListener({ mode: 'general', apiKey: process.env.SKYTELLS_API_KEY! });
 * listener.on(WebhookEvent.COMPLETED, async (p) => { console.log('done', p.id, p.output); });
 * listener.on('prediction.succeeded', async (p) => { /* duplicate route for status-based naming *\/ });
 *
 * // Next.js / fetch
 * export async function POST(req: Request) {
 *   return listener.handleRequest(req);
 * }
 * ```
 */
/**
 * Inbound webhook router: optional HMAC verification, JSON parse, then fan-out to `.on()` / `.listen()` handlers.
 *
 * - **Handlers** run **sequentially** per route key; multiple handlers on the same route are awaited in registration order (snapshot if &gt;1).
 * - **No persistent server** — you call {@link WebhookListener.handle} or {@link WebhookListener.handleRequest} from your framework.
 *
 * Prefer {@link SkytellsClient.webhookListener} so `apiKey` defaults from the client in `general` mode.
 */
export class WebhookListener {
  private readonly handlers = new Map<string, Set<WebhookListenerHandler>>();
  private readonly verifyOpts: WebhookVerifyOptions;
  private readonly verifySignature: boolean;

  /**
   * @param options - Verification mode, keys, and whether to verify signatures (default `true`).
   */
  constructor(options: WebhookListenerOptions) {
    this.verifyOpts = {
      mode: options.mode ?? 'general',
      secret: options.secret,
      apiKey: options.apiKey,
    };
    this.verifySignature = options.verifySignature !== false;
  }

  /** Subscribe to a {@link WebhookEvent}, `prediction.{status}` (e.g. `prediction.succeeded`), `prediction.*`, or `*`. */
  listen(to: WebhookRoute, handler: WebhookListenerHandler): this {
    return this.on(to, handler);
  }

  /** Alias of {@link WebhookListener.listen}. */
  on(to: WebhookRoute, handler: WebhookListenerHandler): this {
    const key = String(to);
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(handler);
    return this;
  }

  off(to: WebhookRoute, handler: WebhookListenerHandler): this {
    this.handlers.get(String(to))?.delete(handler);
    return this;
  }

  private async invoke(key: string, prediction: PredictionResponse): Promise<void> {
    const set = this.handlers.get(key);
    if (!set || set.size === 0) {
      return;
    }

    // Single handler: iterate once — no snapshot array (common case).
    if (set.size === 1) {
      for (const h of set) {
        await h(prediction);
      }
      return;
    }

    // Multiple handlers: snapshot so .off() / .on() during await cannot skip or double-fire.
    const list = new Array<WebhookListenerHandler>(set.size);
    let i = 0;
    for (const h of set) {
      list[i++] = h;
    }
    for (let j = 0; j < list.length; j++) {
      await list[j](prediction);
    }
  }

  /**
   * Invoke handlers for every route in {@link webhookRoutesForPrediction} — **no signature check**.
   *
   * @param prediction - Already-parsed {@link PredictionResponse}.
   */
  async dispatch(prediction: PredictionResponse): Promise<void> {
    for (const k of webhookRoutesForPrediction(prediction)) {
      await this.invoke(k, prediction);
    }
  }

  /**
   * Full pipeline: verify `X-Skytells-Signature` (if enabled), `JSON.parse`, {@link dispatch}, return the prediction.
   *
   * @param rawBody - Raw POST body string.
   * @param headers - `Headers` or plain object; signature header resolved case-insensitively.
   * @returns Parsed {@link PredictionResponse} after handlers complete.
   * @throws {SkytellsError} `WEBHOOK_SIGNATURE_INVALID`, `INVALID_JSON`, or `SDK_ERROR` from crypto.
   */
  async handle(
    rawBody: string,
    headers: Headers | Record<string, string | string[] | undefined | null>,
  ): Promise<PredictionResponse> {
    const sig = getHeader(headers, SKYTELLS_WEBHOOK_SIGNATURE_HEADER);
    if (this.verifySignature) {
      const ok = await verifySkytellsWebhookSignature(rawBody, sig, this.verifyOpts);
      if (!ok) {
        throw new SkytellsError(
          'Invalid or missing webhook signature',
          'WEBHOOK_SIGNATURE_INVALID',
          'Expected X-Skytells-Signature to match HMAC-SHA256(rawBody, key). See https://docs.skytells.ai/webhooks/',
          401,
        );
      }
    }
    let prediction: PredictionResponse;
    try {
      prediction = JSON.parse(rawBody) as PredictionResponse;
    } catch {
      throw new SkytellsError(
        'Webhook body is not valid JSON',
        'INVALID_JSON',
        'Could not parse prediction JSON',
        400,
      );
    }
    await this.dispatch(prediction);
    return prediction;
  }

  /**
   * Adapter for `fetch` `Request`: reads body with {@link Request.text}, calls {@link handle}, returns JSON {@link Response}.
   *
   * @param request - Standard Web `Request` (e.g. Next.js App Router `POST`).
   * @returns `200` `{ ok: true }` on success; `4xx` JSON `{ error, errorId }` on {@link SkytellsError}; rethrows unexpected errors.
   */
  async handleRequest(request: Request): Promise<Response> {
    const rawBody = await request.text();
    try {
      await this.handle(rawBody, request.headers);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      if (e instanceof SkytellsError) {
        return new Response(JSON.stringify({ error: e.message, errorId: e.errorId }), {
          status: e.httpStatus || 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw e;
    }
  }
}

/**
 * Factory for {@link WebhookListener} when you do not have a {@link SkytellsClient} instance.
 *
 * @param options - Same as {@link WebhookListener} constructor; default `mode: 'general'`, `verifySignature: true`.
 */
export function createWebhookListener(options: WebhookListenerOptions = {}): WebhookListener {
  return new WebhookListener(options);
}
