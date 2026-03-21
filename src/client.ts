/**
 * Skytells prediction client: models catalog, create/poll/wait predictions, queue batching, and
 * optional per-request inference compatibility guard (second argument `{ compatibilityCheck: true }` on `predict` / `create`, fourth on `run`).
 *
 * **Memory / lifecycle (for long‑lived servers):**
 * - Sub-APIs (`chat`, `embeddings`, …) are created lazily on first access.
 * - When a call passes `{ compatibilityCheck: true }`, model metadata is cached per slug with TTL
 *   {@link PREFETCHED_MODEL_CACHE_TTL_MS} and a cap from {@link SkytellsClient.config | config.prefetchMaxSlugs}
 *   (smaller when {@link ClientOptions.runtime} is `"edge"`).
 * - {@link SkytellsClient.wait} / `run(..., onProgress)` use `setTimeout` between polls; pass {@link WaitOptions.signal}
 *   (or `RunOptions.signal` with `onProgress`) to abort and stop scheduling further delays.
 * - {@link Prediction} holds the shared {@link HTTP} client and a snapshot of the API response (expected).
 * - {@link SkytellsClient.queue} is an unbounded in-memory array — call {@link SkytellsClient.dispatch} or avoid piling
 *   requests if you need a hard limit (enforce in your app).
 * - Timeouts, stream cleanup, and polling guards: see **Reliability.md** in the repo docs.
 *
 * @module client
 */

import { HTTP, HTTP_DEFAULT_REQUEST_TIMEOUT_MS } from './http.js';
import { ENDPOINTS, ORCHESTRATOR_BASE_URL } from './endpoints.js';
import { Orchestrator } from './orchestrator.js';
import { resolvePredictionResourceUrl } from './prediction-urls.js';
import { Chat } from './chat.js';
import { Responses } from './responses.js';
import { Embeddings } from './embeddings.js';
import { Safety } from './safety.js';
import type {
  PredictionRequest,
  PredictionResponse,
  RunOptions,
  PredictionsListOptions,
  OnProgressCallback,
  WaitOptions,
  QueueItem,
  PredictionSdkOptions,
  PaginatedResponse,
  Model,
  ModelFieldsOptions,
  ClientOptions,
  SkytellsRuntime,
  RetryOptions,
} from './types/index.js';
import { PredictionStatus } from './types/index.js';
import type { WebhookListener } from './webhooks.js';
import { Webhook, createWebhookListener, type WebhookListenerOptions } from './webhooks.js';
import { SkytellsError } from './types/shared.types.js';

const DEFAULT_POLL_INTERVAL = 5000;

/**
 * Time-to-live for in-memory cache of `GET /model/{slug}` responses used when
 * a guarded predict/create/run uses `compatibilityCheck: true`. After this interval the next guarded request refetches the model.
 */
export const PREFETCHED_MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Max distinct model slugs kept in the compatibility-check cache. Oldest entries are removed (FIFO) when exceeded.
 * Prevents unbounded growth if callers use many unique `model` strings over time.
 */
export const PREFETCHED_MODEL_CACHE_MAX_SLUGS = 64;

/**
 * Default request timeout when {@link ClientOptions.runtime} is `"edge"` and `timeout` is omitted
 * (aligns with common ~25–30s serverless / edge ceilings).
 */
export const EDGE_DEFAULT_REQUEST_TIMEOUT_MS = 25_000;

/** Max model slugs in the inference-compat cache when `runtime` is `"edge"` (lower memory). */
export const EDGE_PREFETCH_MAX_SLUGS = 16;

let edgeRuntimeHintLogged = false;
let orchestratorKeyFormatWarned = false;

function logEdgeRuntimeHints(params: {
  requestTimeoutMs: number;
  retryRetries: number;
  userSetTimeout: boolean;
  prefetchMaxSlugs: number;
}): void {
  if (edgeRuntimeHintLogged) {
    return;
  }
  edgeRuntimeHintLogged = true;
  const lines = [
    '[skytells] ClientOptions.runtime "edge" — edge-oriented defaults and tips:',
    `  • Request timeout: ${params.requestTimeoutMs}ms${
      params.userSetTimeout
        ? ''
        : ' (edge default when timeout omitted; pass timeout in options to override)'
    }.`,
    `  • Inference compat cache: max ${params.prefetchMaxSlugs} slug(s).`,
    '  • For wait()/run(…, onProgress): pass AbortSignal and maxWait to stay within wall-clock limits.',
    '  • Webhook HMAC: Web Crypto (crypto.subtle) only.',
  ];
  if (params.retryRetries > 2) {
    lines.push(
      `  • retry.retries=${params.retryRetries} stacks delay on failures — keep low on edge.`,
    );
  }
  if (params.userSetTimeout && params.requestTimeoutMs > 30_000) {
    lines.push(
      `  • timeout ${params.requestTimeoutMs}ms may exceed typical edge limits (~25–30s); consider lowering.`,
    );
  }
  console.warn(lines.join('\n'));
}

const DEPRECATED_PREDICTION_METHOD_HINTS: Record<
  'streamPrediction' | 'cancelPrediction' | 'deletePrediction',
  string
> = {
  streamPrediction:
    'Use prediction.stream() on the Prediction instance returned from client.run(), or pass prediction response urls when needed.',
  cancelPrediction: 'Use prediction.cancel() on the Prediction from client.run().',
  deletePrediction: 'Use prediction.delete() on the Prediction from client.run().',
};

function deprecateSkytellsClientPredictionMethod(
  name: 'streamPrediction' | 'cancelPrediction' | 'deletePrediction',
): void {
  console.warn(
    `[skytells] SkytellsClient.${name}() is deprecated and will be removed in a future major version. ${DEPRECATED_PREDICTION_METHOD_HINTS[name]}`,
  );
}

/**
 * Terminal prediction statuses — polling stops when the prediction reaches one of these.
 */
const TERMINAL_STATUSES: Set<PredictionStatus> = new Set([
  PredictionStatus.SUCCEEDED,
  PredictionStatus.FAILED,
  PredictionStatus.CANCELLED,
]);

/** JSON body for `POST /predict` — normalizes {@link Webhook} to plain `webhook`. */
function predictionBodyForHttp(
  payload: PredictionRequest,
  overrides?: Partial<Pick<PredictionRequest, 'await' | 'stream'>>,
): Record<string, unknown> {
  const { webhook, ...rest } = payload;
  const webhookJson =
    webhook === undefined ? undefined : webhook instanceof Webhook ? webhook.toJSON() : webhook;
  return {
    ...rest,
    ...(webhookJson ? { webhook: webhookJson } : {}),
    ...overrides,
  } as Record<string, unknown>;
}

/**
 * Represents a completed prediction with convenience methods for accessing output
 * and managing the prediction lifecycle (cancel, delete).
 *
 * Returned by {@link SkytellsClient.run}. Wraps a {@link PredictionResponse} and
 * exposes `.output` to get results as a normalized `string[]`, plus `.cancel()`
 * and `.delete()` for lifecycle management.
 *
 * @example
 * ```ts
 * const prediction = await client.run("flux-pro", { input: { prompt: "a cat" } });
 * const [imageUrl] = prediction.output;
 * console.log(prediction.id, prediction.status);
 * const streamMeta = await prediction.stream(); // stream endpoint info (uses urls.stream)
 * // Clean up when done
 * await prediction.delete();
 * ```
 */
export class Prediction {
  private http: HTTP;
  private data: PredictionResponse;

  /** @internal Use {@link SkytellsClient.run} to create a Prediction. */
  constructor(http: HTTP, data: PredictionResponse) {
    this.http = http;
    this.data = data;
  }

  /**
   * The full prediction response object from the API.
   * Contains all fields: status, id, input, output, metrics, metadata, urls, etc.
   */
  get response(): PredictionResponse {
    return this.data;
  }

  /**
   * The unique prediction identifier.
   * Use this to fetch, cancel, or delete the prediction later via the client.
   */
  get id(): string {
    return this.data.id;
  }

  /**
   * The current status of the prediction.
   * Possible values: `pending`, `starting`, `started`, `processing`, `succeeded`, `failed`, `cancelled`.
   */
  get status(): PredictionStatus {
    return this.data.status;
  }

  /**
   * The raw prediction output as returned by the API.
   *
   * Can be a single `string`, a `string[]`, or `undefined` if incomplete.
   *
   * @example
   * ```ts
   * // Single output (string)
   * console.log(prediction.output); // "https://..."
   *
   * // Multiple outputs (string[])
   * console.log(prediction.output[0]); // "https://..."
   *
   * // Check type
   * if (Array.isArray(prediction.output)) {
   *   for (const item of prediction.output) { console.log(item); }
   * }
   * ```
   */
  get output(): string | string[] | undefined {
    return this.data.output;
  }

  /**
   * Returns the output, normalized to a single value:
   *
   * - `undefined` / `null` → `undefined`
   * - `"https://..."` → `"https://..."`
   * - `["https://..."]` → `"https://..."` (single-element array unwrapped)
   * - `["a", "b"]` → `["a", "b"]` (multi-element array kept as-is)
   *
   * @example
   * ```ts
   * const result = prediction.outputs();
   * // string if single output, string[] if multiple, undefined if none
   * ```
   */
  outputs(): string | string[] | undefined {
    if (!this.data.output) {
      return undefined;
    }
    if (typeof this.data.output === 'string') {
      return this.data.output;
    }
    if (this.data.output.length === 1) {
      return this.data.output[0];
    }
    return this.data.output;
  }

  /**
   * Returns the full raw prediction response as a plain JSON object.
   *
   * @returns The raw `PredictionResponse` data from the API.
   *
   * @example
   * ```ts
   * const prediction = await client.run("flux-pro", { input: { prompt: "a cat" } });
   * const json = prediction.raw();
   * console.log(json.id, json.status, json.output, json.metrics);
   * ```
   */
  raw(): PredictionResponse {
    return this.data;
  }

  /**
   * Fetches streaming metadata for this prediction (`GET` using `urls.stream` when present).
   * Same behavior as the deprecated {@link SkytellsClient.streamPrediction} with this prediction’s id and urls.
   *
   * @returns The prediction response from the stream-info endpoint (includes `urls`, etc.).
   */
  async stream(): Promise<PredictionResponse> {
    const url = resolvePredictionResourceUrl(
      'stream',
      this.data.id,
      this.data.urls,
      this.http.getBaseUrl(),
    );
    return this.http.request<PredictionResponse>('GET', url);
  }

  /**
   * Cancels this prediction. Only works if the prediction is still in progress
   * (status is `pending`, `starting`, `started`, or `processing`).
   *
   * @returns The updated prediction response with `status: 'cancelled'`.
   * @throws {SkytellsError} If the prediction cannot be cancelled or the request fails.
   *
   * @example
   * ```ts
   * const prediction = await client.run("flux-pro", { input: { prompt: "a cat" } });
   * await prediction.cancel();
   * ```
   */
  async cancel(): Promise<PredictionResponse> {
    const url = resolvePredictionResourceUrl(
      'cancel',
      this.data.id,
      this.data.urls,
      this.http.getBaseUrl(),
    );
    return this.http.request<PredictionResponse>('POST', url);
  }

  /**
   * Deletes this prediction and its associated output/assets from storage.
   *
   * @returns The prediction response confirming deletion.
   * @throws {SkytellsError} If the prediction cannot be deleted or the request fails.
   *
   * @example
   * ```ts
   * const prediction = await client.run("flux-pro", { input: { prompt: "a cat" } });
   * const [url] = prediction.output;
   * // ... use the output ...
   * await prediction.delete(); // clean up
   * ```
   */
  async delete(): Promise<PredictionResponse> {
    const url = resolvePredictionResourceUrl(
      'delete',
      this.data.id,
      this.data.urls,
      this.http.getBaseUrl(),
    );
    return this.http.request<PredictionResponse>('DELETE', url);
  }
}

/**
 * Sub-API for managing predictions. Accessible via `client.predictions`.
 *
 * Provides methods to create predictions in the background, fetch them by ID,
 * and list them with filters.
 *
 * @example
 * ```ts
 * // Create a background prediction
 * const prediction = await client.predictions.create({
 *   model: "flux-pro",
 *   input: { prompt: "A sunset" },
 * });
 *
 * // Fetch it later
 * const result = await client.predictions.get(prediction.id);
 *
 * // List recent predictions by model
 * const { data } = await client.predictions.list({ model: "flux-pro", since: "2026-01-01" });
 * ```
 */
export class PredictionsAPI {
  private http: HTTP;
  private onBeforePredict?: (
    payload: PredictionRequest,
    sdk?: PredictionSdkOptions,
  ) => Promise<void>;

  /** @internal */
  constructor(
    http: HTTP,
    onBeforePredict?: (payload: PredictionRequest, sdk?: PredictionSdkOptions) => Promise<void>,
  ) {
    this.http = http;
    this.onBeforePredict = onBeforePredict;
  }

  /**
   * Creates a prediction in the background (does not wait for completion).
   *
   * The prediction starts processing asynchronously. Use {@link get} to poll,
   * or {@link SkytellsClient.wait} to block until it finishes.
   *
   * @param payload - The prediction request parameters.
   * @param payload.model - The model slug (e.g. `"flux-pro"`).
   * @param payload.input - Key-value input parameters for the model.
   * @param payload.webhook - Optional webhook to receive events.
   * @param payload.stream - Enable streaming (default: `false`).
   * @param sdk - SDK-only options (not sent in JSON). When `sdk.compatibilityCheck === true`, runs inference compatibility guard before POST.
   * @returns The initial prediction response with `status: 'pending'` or `'starting'`.
   * @throws {SkytellsError} On API errors (invalid input, model not found, insufficient credits).
   *
   * @example
   * ```ts
   * const prediction = await client.predictions.create({
   *   model: "flux-pro",
   *   input: { prompt: "An astronaut riding a unicorn" },
   * });
   * console.log(prediction.id, prediction.status); // "pending"
   *
   * // Wait for it to finish
   * const result = await client.wait(prediction);
   * console.log(result.output);
   * ```
   */
  async create(
    payload: PredictionRequest,
    sdk?: PredictionSdkOptions,
  ): Promise<PredictionResponse> {
    if (this.onBeforePredict) {
      await this.onBeforePredict(payload, sdk);
    }
    return this.http.request<PredictionResponse>(
      'POST',
      ENDPOINTS.PREDICT,
      predictionBodyForHttp(payload, { await: false }),
    );
  }

  /**
   * Fetches a prediction by its ID.
   *
   * @param id - The prediction ID.
   * @param urls - Optional `urls` from a prior `PredictionResponse`. When `urls.get` is set, that absolute URL is used (API protocol); otherwise `GET {baseUrl}/predictions/{id}`.
   * @returns The prediction response with current status, output, metrics, etc.
   * @throws {SkytellsError} If the prediction is not found or the request fails.
   *
   * @example
   * ```ts
   * const prediction = await client.predictions.get("pred_abc123");
   * if (prediction.status === "succeeded") {
   *   console.log(prediction.output);
   * }
   * ```
   */
  async get(id: string, urls?: PredictionResponse['urls']): Promise<PredictionResponse> {
    const url = resolvePredictionResourceUrl('get', id, urls, this.http.getBaseUrl());
    return this.http.request<PredictionResponse>('GET', url);
  }

  /**
   * Lists predictions with optional filters and pagination.
   *
   * @param options - Filter and pagination options.
   * @param options.page - Page number (default: 1).
   * @param options.since - Only include predictions created on or after this date (`YYYY-MM-DD`).
   * @param options.until - Only include predictions created on or before this date (`YYYY-MM-DD`).
   * @param options.model - Filter by model slug.
   * @returns A paginated response with `data` (predictions array) and `pagination` metadata.
   * @throws {SkytellsError} On authentication failure or invalid parameters.
   *
   * @example
   * ```ts
   * // List all predictions
   * const { data, pagination } = await client.predictions.list();
   *
   * // Filter by model and date range
   * const filtered = await client.predictions.list({
   *   model: "flux-pro",
   *   since: "2026-01-01",
   *   until: "2026-03-15",
   *   page: 2,
   * });
   * ```
   */
  async list(options?: PredictionsListOptions): Promise<PaginatedResponse<PredictionResponse>> {
    const params = new URLSearchParams();
    if (options?.page) {
      params.set('page', String(options.page));
    }
    if (options?.since) {
      params.set('from', options.since);
    }
    if (options?.until) {
      params.set('to', options.until);
    }
    if (options?.model) {
      params.set('model', options.model);
    }
    const query = params.toString();
    const path = query ? `${ENDPOINTS.PREDICTIONS}?${query}` : ENDPOINTS.PREDICTIONS;
    return this.http.request<PaginatedResponse<PredictionResponse>>('GET', path);
  }
}

/**
 * Sub-API for browsing and fetching models. Accessible via `client.models`.
 *
 * Provides `.list()` to get all models and `.get()` to fetch a single model by slug.
 *
 * @example
 * ```ts
 * const allModels = await client.models.list();
 * const model = await client.models.get("flux-pro", { fields: ["input_schema"] });
 * ```
 */
export class ModelsAPI {
  private http: HTTP;

  /** @internal */
  constructor(http: HTTP) {
    this.http = http;
  }

  /**
   * Lists all available models on the Skytells platform.
   *
   * @param options - Optional configuration.
   * @param options.fields - Additional fields to include in the response
   *   (e.g. `["input_schema", "output_schema"]`). By default, schemas are not included.
   * @returns An array of model objects with name, type, pricing, metadata, etc.
   * @throws {SkytellsError} On authentication failure or server error.
   *
   * @example
   * ```ts
   * const allModels = await client.models.list();
   * for (const m of allModels) {
   *   console.log(m.name, m.type);
   * }
   *
   * // Include input schemas
   * const withSchemas = await client.models.list({ fields: ["input_schema"] });
   * ```
   */
  async list(options?: ModelFieldsOptions): Promise<Model[]> {
    let path = ENDPOINTS.MODELS;
    if (options?.fields?.length) {
      path += `?fields=${options.fields.join(',')}`;
    }
    return this.http.request<Model[]>('GET', path);
  }

  /**
   * Fetches a single model by its slug.
   *
   * @param slug - The model slug identifier (e.g. `"flux-pro"`, `"truefusion"`, `"beatfusion"`).
   * @param options - Optional configuration.
   * @param options.fields - Additional fields to include (e.g. `["input_schema", "output_schema"]`).
   * @returns The model object with name, type, pricing, metadata, and optionally schemas.
   * @throws {SkytellsError} If the model is not found (`MODEL_NOT_FOUND`) or the request fails.
   *
   * @example
   * ```ts
   * const model = await client.models.get("flux-pro");
   * console.log(model.name, model.pricing);
   *
   * // With schemas
   * const detailed = await client.models.get("flux-pro", {
   *   fields: ["input_schema", "output_schema"],
   * });
   * console.log(detailed.input_schema);
   * ```
   */
  async get(slug: string, options?: ModelFieldsOptions): Promise<Model> {
    let path = ENDPOINTS.MODEL_BY_SLUG(slug);
    if (options?.fields?.length) {
      path += `?fields=${options.fields.join(',')}`;
    }
    return this.http.request<Model>('GET', path);
  }
}

/**
 * The main Skytells API client. Provides methods to run predictions, list models,
 * and manage prediction lifecycle.
 *
 * Create an instance using {@link Skytells} or the constructor directly.
 *
 * @example
 * ```ts
 * import Skytells from "skytells";
 *
 * const client = Skytells("sk-your-api-key", {
 *   timeout: 30000,
 *   retry: { retries: 2 },
 * });
 *
 * // Run a model and get output
 * const prediction = await client.run("flux-pro", {
 *   input: { prompt: "An astronaut riding a unicorn" },
 * });
 * const [imageUrl] = prediction.output;
 *
 * // List and fetch models
 * const allModels = await client.models.list();
 * const model = await client.models.get("flux-pro");
 *
 * // Background prediction
 * const bg = await client.predictions.create({
 *   model: "flux-pro",
 *   input: { prompt: "A sunset" },
 * });
 * const result = await client.wait(bg);
 *
 * // Queue multiple predictions
 * client.queue({ model: "flux-pro", input: { prompt: "Cat" } });
 * client.queue({ model: "flux-pro", input: { prompt: "Dog" } });
 * const results = await client.dispatch();
 * ```
 */
export class SkytellsClient {
  private http: HTTP;
  private readonly _runtime: SkytellsRuntime;
  private readonly _requestTimeoutMs: number;
  private readonly _prefetchCap: number;
  private _queue: QueueItem[] = [];

  private _predictions?: PredictionsAPI;
  private _models?: ModelsAPI;
  private _chat?: Chat;
  private _responses?: Responses;
  private _embeddings?: Embeddings;
  private _safety?: Safety;
  private _orchestrator?: Orchestrator;
  private readonly _orchestratorApiKey?: string;
  private readonly _orchestratorBaseUrl: string;
  private readonly _orchestratorHttpBundle: {
    timeout: number;
    headers: Record<string, string>;
    retry: RetryOptions;
    fetch?: typeof fetch;
  };

  /**
   * Sub-API for managing predictions.
   * Provides `.create()`, `.get()`, and `.list()` methods.
   */
  public get predictions(): PredictionsAPI {
    if (!this._predictions) {
      this._predictions = new PredictionsAPI(this.http, (p, sdk) =>
        this._maybeCompatibilityGuard(p.model, sdk?.compatibilityCheck),
      );
    }
    return this._predictions;
  }

  /**
   * Alias of {@link predictions} (singular). Same instance — use whichever reads best.
   *
   * @example
   * ```ts
   * await client.prediction.create({ model: 'flux-pro', input: { prompt: '…' } });
   * // same as client.predictions.create(...)
   * ```
   */
  public get prediction(): PredictionsAPI {
    return this.predictions;
  }

  /**
   * Sub-API for browsing and fetching models.
   * Provides `.list()` and `.get()` methods.
   */
  public get models(): ModelsAPI {
    if (!this._models) {
      this._models = new ModelsAPI(this.http);
    }
    return this._models;
  }

  /**
   * Chat completions. Same as OpenAI's client.chat.completions.
   *
   * @example
   * ```ts
   * const completion = await client.chat.completions.create({
   *   model: 'deepbrain-router',
   *   messages: [{ role: 'user', content: 'Hello' }],
   * });
   * ```
   */
  public get chat(): Chat {
    if (!this._chat) {
      this._chat = new Chat(this.http);
    }
    return this._chat;
  }

  /**
   * Responses API (`POST /v1/responses`). Same as `client.chat.responses`.
   *
   * Follows the OpenAI Responses API schema. Supports both non-streaming and streaming modes.
   *
   * @example Non-streaming:
   * ```ts
   * const response = await client.responses.create({
   *   model: 'gpt-5.3-codex',
   *   input: [{ role: 'user', content: 'Explain recursion simply.' }],
   *   instructions: 'You are a helpful tutor.',
   * });
   * console.log(response.output[0].content[0].text);
   * ```
   *
   * @example Streaming:
   * ```ts
   * const stream = await client.responses.create({
   *   model: 'gpt-5.3-codex',
   *   input: [{ role: 'user', content: 'Explain recursion simply.' }],
   *   stream: true,
   * });
   * for await (const event of stream) {
   *   console.log(event.type, event);
   * }
   * ```
   */
  public get responses(): Responses {
    if (!this._responses) {
      this._responses = new Responses(this.http);
    }
    return this._responses;
  }

  /**
   * Embeddings. Same as OpenAI's client.embeddings.
   *
   * @example
   * ```ts
   * const embedding = await client.embeddings.create({
   *   model: 'text-embedding-3-small',
   *   input: 'Hello world',
   * });
   * ```
   */
  public get embeddings(): Embeddings {
    if (!this._embeddings) {
      this._embeddings = new Embeddings(this.http);
    }
    return this._embeddings;
  }

  /**
   * Safety checks. Proactive (checkText, checkImage) and response parsing (wasFiltered, evaluate).
   * evaluate() accepts text, image URLs, choices, completions, prediction results, or arrays of any.
   *
   * @example
   * ```ts
   * const result = await client.safety.checkText('user input');
   * if (client.safety.wasFiltered(completion)) { ... }
   * const evalResult = await client.safety.evaluate('user text', SafetyTemplates.STRICT);
   * ```
   */
  public get safety(): Safety {
    if (!this._safety) {
      this._safety = new Safety(this.http);
    }
    return this._safety;
  }

  /**
   * [Skytells Orchestrator](https://learn.skytells.ai/docs/products/orchestrator/api-reference) — workflows,
   * executions, webhook triggers, integrations, etc.
   *
   * Requires **`ClientOptions.orchestratorApiKey`** (`wfb_…`). Uses an internal HTTP stack aimed at the Orchestrator
   * host ({@link ORCHESTRATOR_BASE_URL}): Bearer only, no `x-api-key`. Same `timeout`, `headers`, `retry`, and
   * `fetch` as the main Skytells client — pass both keys on one {@link SkytellsClient} when you need both products.
   *
   * @throws {SkytellsError} `SDK_ERROR` if `orchestratorApiKey` was not set.
   */
  public get orchestrator(): Orchestrator {
    if (!this._orchestratorApiKey) {
      throw new SkytellsError(
        'client.orchestrator requires ClientOptions.orchestratorApiKey (Orchestrator wfb_… key). It is not your Skytells sk-… platform key.',
        'SDK_ERROR',
        'https://learn.skytells.ai/docs/products/orchestrator/api-keys',
        0,
      );
    }
    if (!this._orchestrator) {
      const b = this._orchestratorHttpBundle;
      this._orchestrator = new Orchestrator(
        new HTTP(
          this._orchestratorApiKey,
          this._orchestratorBaseUrl,
          b.timeout,
          b.headers,
          b.retry,
          b.fetch,
          'orchestrator',
        ),
      );
    }
    return this._orchestrator;
  }

  /**
   * Target runtime from {@link ClientOptions.runtime} (`"default"` when omitted).
   */
  get runtime(): SkytellsRuntime {
    return this._runtime;
  }

  /**
   * Read-only resolved settings (timeouts, cache cap) for debugging and tests.
   */
  get config(): Readonly<{
    runtime: SkytellsRuntime;
    requestTimeoutMs: number;
    prefetchMaxSlugs: number;
  }> {
    return {
      runtime: this._runtime,
      requestTimeoutMs: this._requestTimeoutMs,
      prefetchMaxSlugs: this._prefetchCap,
    };
  }

  /**
   * In-memory `GET /model/{slug}` results for the per-prediction guard. Lazy-allocated; bounded by
   * {@link SkytellsClient.config | config.prefetchMaxSlugs} and TTL {@link PREFETCHED_MODEL_CACHE_TTL_MS}.
   */
  private _prefetchedModelCache: Map<string, { model: Model; expiresAt: number }> | null = null;

  /**
   * Creates a new Skytells API client.
   *
   * @param apiKey - Your Skytells API key (starts with `sk-`). Required for authenticated endpoints.
   * @param options - Client configuration options.
   * @param options.baseUrl - Override the default API base URL.
   * @param options.timeout - Request timeout in milliseconds (default: 60000, or 25000 when `runtime: "edge"` and omitted).
   * @param options.headers - Custom headers to include in every request.
   * @param options.retry - Retry configuration: `retries`, `retryDelay`, `retryOn` status codes.
   * @param options.fetch - Custom `fetch` implementation (useful for testing, proxying, or
   *   disabling Next.js fetch caching).
   * @param options.runtime - `"edge"` for Workers / Vercel Edge / etc.: shorter default timeout, smaller compat cache, one-time hints.
   *
   * @example
   * ```ts
   * const client = new SkytellsClient("sk-your-api-key");
   *
   * // With options:
   * const client = new SkytellsClient("sk-your-api-key", {
   *   timeout: 30000,
   *   retry: { retries: 3, retryDelay: 1000 },
   *   headers: { "X-Custom-Header": "value" },
   * });
   *
   * // Next.js App Router — disable fetch caching:
   * const client = new SkytellsClient("sk-your-api-key", {
   *   fetch: (url, opts) => fetch(url, { ...opts, cache: "no-store" }),
   * });
   *
   * // Edge / serverless:
   * const edge = new SkytellsClient("sk-…", { runtime: "edge" });
   *
   * // Skytells + Orchestrator (optional wfb_… key — same client):
   * const both = new SkytellsClient("sk-…", { orchestratorApiKey: "wfb_…" });
   * ```
   */
  constructor(apiKey?: string, options: ClientOptions = {}) {
    const runtime: SkytellsRuntime = options.runtime ?? 'default';
    const isEdge = runtime === 'edge';
    const userSetTimeout = options.timeout !== undefined;
    const requestTimeoutMs = userSetTimeout
      ? options.timeout!
      : isEdge
        ? EDGE_DEFAULT_REQUEST_TIMEOUT_MS
        : HTTP_DEFAULT_REQUEST_TIMEOUT_MS;
    const prefetchCap = isEdge ? EDGE_PREFETCH_MAX_SLUGS : PREFETCHED_MODEL_CACHE_MAX_SLUGS;

    this._runtime = runtime;
    this._requestTimeoutMs = requestTimeoutMs;
    this._prefetchCap = prefetchCap;

    if (isEdge) {
      logEdgeRuntimeHints({
        requestTimeoutMs,
        retryRetries: options.retry?.retries ?? 0,
        userSetTimeout,
        prefetchMaxSlugs: prefetchCap,
      });
    }

    this.http = new HTTP(
      apiKey,
      options.baseUrl,
      requestTimeoutMs,
      options.headers,
      options.retry,
      options.fetch,
    );

    this._orchestratorApiKey = options.orchestratorApiKey?.trim() || undefined;
    if (this._orchestratorApiKey && !this._orchestratorApiKey.startsWith('wfb_')) {
      if (!orchestratorKeyFormatWarned) {
        orchestratorKeyFormatWarned = true;
        console.warn(
          '[skytells] orchestratorApiKey normally starts with "wfb_" (Orchestrator webhook key, separate from sk-…). See https://learn.skytells.ai/docs/products/orchestrator/api-keys',
        );
      }
    }
    this._orchestratorBaseUrl = options.orchestratorBaseUrl?.trim() || ORCHESTRATOR_BASE_URL;
    this._orchestratorHttpBundle = {
      timeout: requestTimeoutMs,
      headers: options.headers ?? {},
      retry: options.retry ?? {},
      fetch: options.fetch,
    };
  }

  /**
   * Build a {@link WebhookListener} for your HTTP server. Verifies `X-Skytells-Signature` per
   * [Skytells webhooks](https://docs.skytells.ai/webhooks/).
   *
   * - **`mode: 'general'`** (default): HMAC key is your API key — omitted `apiKey` uses this client’s key.
   * - **`mode: 'enterprise'`**: pass `secret` from the dashboard.
   *
   * @example
   * ```ts
   * const hooks = client.webhookListener({ mode: 'general' });
   * hooks.on(WebhookEvent.COMPLETED, async (p) => console.log(p.id));
   * // Next.js: export async function POST(req: Request) { return hooks.handleRequest(req); }
   * ```
   */
  webhookListener(options: WebhookListenerOptions = {}): WebhookListener {
    const apiKey = options.apiKey ?? this.http.getApiKey();
    return createWebhookListener({ ...options, apiKey });
  }

  /**
   * Alias of {@link SkytellsClient.webhookListener}. Chain handlers: `client.listen().on(WebhookEvent.COMPLETED, fn)`.
   */
  listen(options?: WebhookListenerOptions): WebhookListener {
    return this.webhookListener(options);
  }

  /**
   * Clears cached model metadata used when guarded predict/create/run passes `compatibilityCheck: true`.
   *
   * @param modelSlug - If set, only evicts that slug; otherwise clears the entire cache.
   *
   * @example
   * ```ts
   * // After a model was updated server-side, force the next predict to refetch metadata:
   * client.purgePrefetchedModelCache("flux-pro");
   *
   * // Clear all cached slugs
   * client.purgePrefetchedModelCache();
   * ```
   */
  purgePrefetchedModelCache(modelSlug?: string): void {
    const cache = this._prefetchedModelCache;
    if (!cache) {
      return;
    }
    if (modelSlug !== undefined) {
      cache.delete(modelSlug);
      if (cache.size === 0) {
        this._prefetchedModelCache = null;
      }
    } else {
      this._prefetchedModelCache = null;
    }
  }

  /**
   * Returns model metadata for the inference compatibility check, using {@link _prefetchedModelCache} when fresh.
   */
  private async _getModelForCompatibilityCheck(slug: string): Promise<Model> {
    const now = Date.now();
    if (!this._prefetchedModelCache) {
      this._prefetchedModelCache = new Map();
    }
    const cache = this._prefetchedModelCache;
    const cached = cache.get(slug);
    if (cached && cached.expiresAt > now) {
      // Move to end of Map iteration order so FIFO eviction keeps recently used slugs.
      cache.delete(slug);
      cache.set(slug, cached);
      return cached.model;
    }
    if (cached) {
      cache.delete(slug);
    }
    const model = await this.models.get(slug);
    cache.set(slug, {
      model,
      expiresAt: now + PREFETCHED_MODEL_CACHE_TTL_MS,
    });
    while (cache.size > this._prefetchCap) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      cache.delete(oldest);
    }
    return model;
  }

  /**
   * @internal When `compatibilityCheck === true`, throws SDK_ERROR if the model is chat-only here.
   */
  private async _maybeCompatibilityGuard(
    modelSlug: string,
    compatibilityCheck?: boolean,
  ): Promise<void> {
    if (compatibilityCheck !== true) {
      return;
    }
    try {
      const modelData = await this._getModelForCompatibilityCheck(modelSlug);
      if (modelData.metadata?.openai_compatible) {
        throw new SkytellsError(
          `This model supports the OpenAI Chat Completions API. Did you mean client.chat.completions.create()? Use it for chat-style inference.`,
          'SDK_ERROR',
          `Model "${modelData.namespace}" is OpenAI-compatible. Use client.chat.completions.create() instead of predict() or run().`,
          0,
        );
      }
    } catch (e) {
      if (e instanceof SkytellsError && e.errorId === 'SDK_ERROR') {
        throw e;
      }
      // If model fetch fails (e.g. MODEL_NOT_FOUND), let the predict request proceed
    }
  }

  /**
   * Sends a prediction request to the Skytells API.
   *
   * This is the low-level prediction method. For most use cases, prefer {@link run}
   * which waits for completion and returns a {@link Prediction} object with convenience methods.
   *
   * @param payload - The prediction request parameters.
   * @param payload.model - The model slug to run (e.g. `"flux-pro"`, `"truefusion"`).
   * @param payload.input - Key-value input parameters for the model (e.g. `{ prompt: "..." }`).
   * @param payload.await - If `true`, the request blocks until the prediction completes (default: `false`).
   * @param payload.stream - If `true`, enables streaming for the prediction (default: `false`).
   * @param payload.webhook - Optional webhook configuration to receive prediction events.
   * @param sdk - SDK-only options (not sent in JSON). When `sdk.compatibilityCheck === true`, runs inference compatibility guard before POST.
   * @returns The prediction response object.
   * @throws {SkytellsError} On API errors (invalid input, model not found, insufficient credits, etc.).
   *
   * @example
   * ```ts
   * // Fire-and-forget (returns immediately with status: "pending")
   * const response = await client.predict({
   *   model: "flux-pro",
   *   input: { prompt: "A sunset over mountains" },
   * });
   * console.log(response.id); // use predictions.get(id) to poll
   *
   * // Wait for completion
   * const result = await client.predict({
   *   model: "flux-pro",
   *   input: { prompt: "A sunset over mountains" },
   *   await: true,
   * });
   * console.log(result.output); // ["https://..."]
   * ```
   */
  async predict(
    payload: PredictionRequest,
    sdk?: PredictionSdkOptions,
  ): Promise<PredictionResponse> {
    await this._maybeCompatibilityGuard(payload.model, sdk?.compatibilityCheck);
    return this.http.request<PredictionResponse>(
      'POST',
      ENDPOINTS.PREDICT,
      predictionBodyForHttp(payload),
    );
  }

  /**
   * Runs a model, waits for completion, and returns a {@link Prediction} object.
   *
   * This is the recommended way to generate content. It automatically sets `await: true`,
   * checks for failures, and returns a `Prediction` with `.output`, `.cancel()`, and `.delete()`.
   *
   * If an `onProgress` callback is provided, the prediction is created in the background
   * and polled every 5 seconds. The callback is invoked on each poll with the latest
   * prediction state, allowing you to track progress.
   *
   * @param model - The model slug to run (e.g. `"flux-pro"`, `"truefusion"`, `"beatfusion"`).
   * @param options - Run options.
   * @param options.input - Key-value input parameters for the model.
   * @param options.stream - If `true`, enables streaming (default: `false`).
   * @param options.webhook - Optional webhook configuration.
   * @param onProgress - Optional callback invoked on each poll with the current prediction state.
   * @param sdk - SDK-only options. When `sdk.compatibilityCheck === true`, runs inference guard before predict/create. Use `undefined` for `onProgress` when you only need `sdk` (e.g. `run(m, o, undefined, { compatibilityCheck: true })`).
   * @remarks With `onProgress`, uses `predictions.create` + {@link wait}. Then {@link RunOptions.interval},
   *   {@link RunOptions.maxWait}, and {@link RunOptions.signal} apply (same as {@link WaitOptions}).
   * @returns A {@link Prediction} object with output and lifecycle methods.
   * @throws {SkytellsError} On API errors or if the prediction fails (`PREDICTION_FAILED`).
   *
   * @example
   * ```ts
   * // Simple run (blocks until complete)
   * const prediction = await client.run("flux-pro", {
   *   input: { prompt: "An astronaut riding a rainbow unicorn" },
   * });
   * const [imageUrl] = prediction.output;
   *
   * // With progress tracking
   * const prediction = await client.run("flux-pro", {
   *   input: { prompt: "An astronaut riding a unicorn" },
   * }, (p) => {
   *   // Note: metrics.progress may not be available during early processing stages
   *   console.log(`Status: ${p.status}, Progress: ${p.metrics?.progress ?? 'n/a'}`);
   * });
   * ```
   */
  async run(
    model: string,
    options: RunOptions,
    onProgress?: OnProgressCallback,
    sdk?: PredictionSdkOptions,
  ): Promise<Prediction> {
    const { input, webhook, stream, interval, maxWait, signal } = options;
    const predictionBody = { input, webhook, stream };
    let data: PredictionResponse;

    if (onProgress) {
      data = await this.predictions.create({ model, ...predictionBody }, sdk);
      data = await this.wait(data, { interval, maxWait, signal }, onProgress);
    } else {
      data = await this.predict({ model, ...predictionBody, await: true }, sdk);
    }

    if (data.status === PredictionStatus.FAILED) {
      throw new SkytellsError(
        data.response || 'Prediction failed',
        'PREDICTION_FAILED',
        `Prediction ${data.id} failed`,
      );
    }

    return new Prediction(this.http, data);
  }

  /**
   * Polls a prediction until it reaches a terminal status (`succeeded`, `failed`, or `cancelled`).
   *
   * @param prediction - The prediction response to wait on (must have an `id`).
   * @param options - Polling options.
   * @param options.interval - Polling interval in milliseconds (default: 5000).
   * @param options.maxWait - Maximum wait time in milliseconds. Throws if exceeded.
   * @param options.signal - If aborted, stops polling and throws `ABORTED` (no further poll timers scheduled).
   * @param onProgress - Optional callback invoked on each poll with the latest prediction state.
   * @returns The final prediction response.
   * @throws {SkytellsError} If `maxWait` is exceeded (`WAIT_TIMEOUT`) or `signal` is aborted (`ABORTED`).
   *
   * @example
   * ```ts
   * const bg = await client.predictions.create({
   *   model: "flux-pro",
   *   input: { prompt: "A cat" },
   * });
   *
   * const result = await client.wait(bg);
   * console.log(result.output);
   *
   * // With progress and timeout
   * const result = await client.wait(bg, { interval: 2000, maxWait: 120000 }, (p) => {
   *   console.log(p.status, p.metrics?.progress);
   * });
   * ```
   */
  async wait(
    prediction: PredictionResponse,
    options?: WaitOptions,
    onProgress?: OnProgressCallback,
  ): Promise<PredictionResponse> {
    const id = prediction?.id;
    if (id == null || id === '') {
      throw new SkytellsError(
        'Cannot wait on a prediction without an id',
        'SDK_ERROR',
        'PredictionResponse.id is required for polling',
        0,
      );
    }

    const rawInterval = options?.interval ?? DEFAULT_POLL_INTERVAL;
    const interval =
      typeof rawInterval === 'number' && Number.isFinite(rawInterval) && rawInterval >= 0
        ? rawInterval
        : DEFAULT_POLL_INTERVAL;
    const rawMax = options?.maxWait;
    const maxWaitMs =
      typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax >= 0 ? rawMax : undefined;
    const signal = options?.signal;
    const startTime = Date.now();
    const deadline = typeof maxWaitMs === 'number' ? startTime + maxWaitMs : null;

    let current = prediction;

    if (TERMINAL_STATUSES.has(current.status)) {
      return current;
    }

    let firstPoll = true;

    while (!TERMINAL_STATUSES.has(current.status)) {
      if (signal?.aborted) {
        throw SkytellsClient.abortWaitError();
      }
      const now = Date.now();
      if (deadline !== null && now >= deadline) {
        throw new SkytellsError(
          `Prediction ${current.id} did not complete within ${maxWaitMs}ms`,
          'WAIT_TIMEOUT',
          `Timed out after ${maxWaitMs}ms. Last status: ${current.status}`,
          408,
        );
      }

      if (!firstPoll) {
        const remaining = deadline !== null ? deadline - Date.now() : interval;
        if (deadline !== null && remaining <= 0) {
          throw new SkytellsError(
            `Prediction ${current.id} did not complete within ${maxWaitMs}ms`,
            'WAIT_TIMEOUT',
            `Timed out after ${maxWaitMs}ms. Last status: ${current.status}`,
            408,
          );
        }
        const sleepMs = Math.min(interval, Math.max(0, remaining));
        await this.delay(sleepMs, signal);
        if (signal?.aborted) {
          throw SkytellsClient.abortWaitError();
        }
        if (deadline !== null && Date.now() >= deadline) {
          throw new SkytellsError(
            `Prediction ${current.id} did not complete within ${maxWaitMs}ms`,
            'WAIT_TIMEOUT',
            `Timed out after ${maxWaitMs}ms. Last status: ${current.status}`,
            408,
          );
        }
      }
      firstPoll = false;

      current = await this.predictions.get(current.id, current.urls);

      if (onProgress) {
        onProgress(current);
      }
    }

    return current;
  }

  /**
   * Adds a prediction request to the local queue.
   *
   * Queued items are not sent to the API until {@link dispatch} is called.
   * Useful for batching multiple predictions together.
   *
   * @param payload - The prediction request to queue.
   * @param sdk - Optional SDK options for this item (e.g. `{ compatibilityCheck: true }`), forwarded to {@link PredictionsAPI.create} on {@link dispatch}.
   *
   * @example
   * ```ts
   * client.queue({ model: "flux-pro", input: { prompt: "Cat" } });
   * client.queue({ model: "flux-pro", input: { prompt: "Dog" } });
   * client.queue({ model: "flux-pro", input: { prompt: "Bird" } });
   *
   * const results = await client.dispatch();
   * // results is an array of PredictionResponse for each queued item
   * ```
   */
  queue(payload: PredictionRequest, sdk?: PredictionSdkOptions): void {
    this._queue.push({ request: payload, sdk });
  }

  /**
   * Dispatches all queued predictions, sending them to the API concurrently.
   *
   * Clears the queue after dispatching. Each prediction is created in the background
   * (non-blocking). Use {@link wait} on individual results if you need to wait for completion.
   *
   * @returns An array of prediction responses, one for each queued item.
   * @throws {SkytellsError} Uses **`Promise.all`**: if **any** `predictions.create` rejects, the whole
   *   `dispatch()` rejects with that error (fail-fast). Partial successes are not returned.
   *
   * @example
   * ```ts
   * client.queue({ model: "flux-pro", input: { prompt: "Cat" } });
   * client.queue({ model: "flux-pro", input: { prompt: "Dog" } });
   *
   * const results = await client.dispatch();
   * for (const pred of results) {
   *   console.log(pred.id, pred.status);
   * }
   *
   * // Wait for all to complete
   * const completed = await Promise.all(results.map(p => client.wait(p)));
   * ```
   */
  async dispatch(): Promise<PredictionResponse[]> {
    const items = this._queue.splice(0);
    const results = await Promise.all(
      items.map((item) => this.predictions.create(item.request, item.sdk)),
    );
    return results;
  }

  /**
   * Retrieves the streaming endpoint for a prediction.
   *
   * @deprecated Use {@link Prediction.stream} on the {@link Prediction} from {@link SkytellsClient.run} instead,
   * or pass `urls` from a stored `PredictionResponse` when calling without a `Prediction` instance.
   *
   * @param id - The prediction ID to stream.
   * @param urls - Optional `urls` from a prior `PredictionResponse`. When `urls.stream` is set, that URL is used.
   * @returns The prediction response with streaming URL info.
   * @throws {SkytellsError} If the prediction is not found or streaming is not available.
   *
   * @example
   * ```ts
   * const stream = await client.streamPrediction("pred_abc123");
   * console.log(stream.urls?.stream);
   * ```
   */
  async streamPrediction(
    id: string,
    urls?: PredictionResponse['urls'],
  ): Promise<PredictionResponse> {
    deprecateSkytellsClientPredictionMethod('streamPrediction');
    const url = resolvePredictionResourceUrl('stream', id, urls, this.http.getBaseUrl());
    return this.http.request<PredictionResponse>('GET', url);
  }

  /**
   * Cancels a running prediction by its ID.
   *
   * @deprecated Use {@link Prediction.cancel} on the {@link Prediction} from {@link SkytellsClient.run} instead.
   * Only predictions with status `pending`, `starting`, `started`, or `processing` can be cancelled.
   *
   * @param id - The prediction ID to cancel.
   * @param urls - Optional `urls` from a prior `PredictionResponse`. When `urls.cancel` is set, that URL is used.
   * @returns The updated prediction response with `status: 'cancelled'`.
   * @throws {SkytellsError} If the prediction cannot be cancelled or is not found.
   *
   * @example
   * ```ts
   * await client.cancelPrediction("pred_abc123");
   * ```
   */
  async cancelPrediction(
    id: string,
    urls?: PredictionResponse['urls'],
  ): Promise<PredictionResponse> {
    deprecateSkytellsClientPredictionMethod('cancelPrediction');
    const url = resolvePredictionResourceUrl('cancel', id, urls, this.http.getBaseUrl());
    return this.http.request<PredictionResponse>('POST', url);
  }

  /**
   * Deletes a prediction and its associated output/assets.
   *
   * @deprecated Use {@link Prediction.delete} on the {@link Prediction} from {@link SkytellsClient.run} instead.
   *
   * @param id - The prediction ID to delete.
   * @param urls - Optional `urls` from a prior `PredictionResponse`. When `urls.delete` is set, that URL is used.
   * @returns The prediction response confirming deletion.
   * @throws {SkytellsError} If the prediction is not found or the request fails.
   *
   * @example
   * ```ts
   * await client.deletePrediction("pred_abc123");
   * ```
   */
  async deletePrediction(
    id: string,
    urls?: PredictionResponse['urls'],
  ): Promise<PredictionResponse> {
    deprecateSkytellsClientPredictionMethod('deletePrediction');
    const url = resolvePredictionResourceUrl('delete', id, urls, this.http.getBaseUrl());
    return this.http.request<PredictionResponse>('DELETE', url);
  }

  /** Stops {@link wait} polling when `signal` aborts; clears the pending timer so nothing keeps firing. */
  private static abortWaitError(): SkytellsError {
    return new SkytellsError(
      'Wait aborted',
      'ABORTED',
      'Polling stopped because the AbortSignal was aborted.',
      0,
    );
  }

  /**
   * @param signal - When present and aborted, the promise rejects with `ABORTED` and the timer is cleared.
   */
  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    const d = Math.max(0, ms);
    if (!signal) {
      return new Promise((resolve) => setTimeout(resolve, d));
    }
    if (signal.aborted) {
      return Promise.reject(SkytellsClient.abortWaitError());
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(tid);
        signal.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = () => {
        finish(() => reject(SkytellsClient.abortWaitError()));
      };
      signal.addEventListener('abort', onAbort);
      const tid = setTimeout(() => {
        finish(() => resolve());
      }, d);
    });
  }

  // ── Deprecated aliases ──────────────────────────────────────────────

  /**
   * @deprecated Use {@link predictions}.list() instead. This method will be removed in a future version.
   */
  async listPredictions(page?: number): Promise<PaginatedResponse<PredictionResponse>> {
    return this.predictions.list({ page });
  }

  /**
   * @deprecated Use {@link models}.list() instead. This method will be removed in a future version.
   */
  async listModels(options?: ModelFieldsOptions): Promise<Model[]> {
    return this.models.list(options);
  }

  /**
   * @deprecated Use {@link predictions}.get() instead. This method will be removed in a future version.
   */
  async getPrediction(id: string, urls?: PredictionResponse['urls']): Promise<PredictionResponse> {
    return this.predictions.get(id, urls);
  }

  /**
   * @deprecated Use {@link models}.get() instead. This method will be removed in a future version.
   */
  async getModel(slug: string, options?: ModelFieldsOptions): Promise<Model> {
    return this.models.get(slug, options);
  }
}
