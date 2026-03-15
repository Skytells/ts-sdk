import { HTTP } from './http.js';
import { ENDPOINTS } from './endpoints.js';
import {
  PredictionRequest,
  PredictionResponse,
  PredictionStatus,
  RunOptions,
  PredictionsListOptions,
  OnProgressCallback,
  WaitOptions,
  QueueItem,
  PaginatedResponse,
  Model,
  ModelFieldsOptions,
  ClientOptions,
} from './types/index.js';
import { SkytellsError } from './types/shared.types.js';

const DEFAULT_POLL_INTERVAL = 5000;

/**
 * Terminal prediction statuses — polling stops when the prediction reaches one of these.
 */
const TERMINAL_STATUSES: Set<PredictionStatus> = new Set([
  PredictionStatus.SUCCEEDED,
  PredictionStatus.FAILED,
  PredictionStatus.CANCELLED,
]);

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
    if (!this.data.output) return undefined;
    if (typeof this.data.output === 'string') return this.data.output;
    if (this.data.output.length === 1) return this.data.output[0];
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
    return this.http.request<PredictionResponse>('POST', ENDPOINTS.CANCEL_PREDICTION_BY_ID(this.data.id));
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
    return this.http.request<PredictionResponse>('DELETE', ENDPOINTS.DELETE_PREDICTION_BY_ID(this.data.id));
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

  /** @internal */
  constructor(http: HTTP) {
    this.http = http;
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
  async create(payload: PredictionRequest): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('POST', ENDPOINTS.PREDICT, {
      ...payload,
      await: false,
    } as unknown as Record<string, unknown>);
  }

  /**
   * Fetches a prediction by its ID.
   *
   * @param id - The prediction ID.
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
  async get(id: string): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('GET', ENDPOINTS.PREDICTION_BY_ID(id));
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
    if (options?.page) params.set('page', String(options.page));
    if (options?.since) params.set('from', options.since);
    if (options?.until) params.set('to', options.until);
    if (options?.model) params.set('model', options.model);
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
  private _queue: QueueItem[] = [];

  /**
   * Sub-API for managing predictions.
   * Provides `.create()`, `.get()`, and `.list()` methods.
   *
   * @example
   * ```ts
   * const prediction = await client.predictions.create({ model: "flux-pro", input: { prompt: "..." } });
   * const fetched = await client.predictions.get(prediction.id);
   * const { data } = await client.predictions.list({ model: "flux-pro" });
   * ```
   */
  public readonly predictions: PredictionsAPI;

  /**
   * Sub-API for browsing and fetching models.
   * Provides `.list()` and `.get()` methods.
   *
   * @example
   * ```ts
   * const allModels = await client.models.list();
   * const model = await client.models.get("flux-pro", { fields: ["input_schema"] });
   * ```
   */
  public readonly models: ModelsAPI;

  /**
   * Creates a new Skytells API client.
   *
   * @param apiKey - Your Skytells API key (starts with `sk-`). Required for authenticated endpoints.
   * @param options - Client configuration options.
   * @param options.baseUrl - Override the default API base URL.
   * @param options.timeout - Request timeout in milliseconds (default: 60000).
   * @param options.headers - Custom headers to include in every request.
   * @param options.retry - Retry configuration: `retries`, `retryDelay`, `retryOn` status codes.
   * @param options.fetch - Custom `fetch` implementation (useful for testing, proxying, or
   *   disabling Next.js fetch caching).
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
   * ```
   */
  constructor(apiKey?: string, options: ClientOptions = {}) {
    this.http = new HTTP(
      apiKey,
      options.baseUrl,
      options.timeout,
      options.headers,
      options.retry,
      options.fetch,
    );
    this.predictions = new PredictionsAPI(this.http);
    this.models = new ModelsAPI(this.http);
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
  async predict(payload: PredictionRequest): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('POST', ENDPOINTS.PREDICT, payload as unknown as Record<string, unknown>);
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
  async run(model: string, options: RunOptions, onProgress?: OnProgressCallback): Promise<Prediction> {
    let data: PredictionResponse;

    if (onProgress) {
      // Create in background and poll with progress
      data = await this.predictions.create({
        model,
        ...options,
      });
      data = await this.wait(data, {}, onProgress);
    } else {
      // Direct await
      data = await this.predict({
        model,
        ...options,
        await: true,
      });
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
   * @param onProgress - Optional callback invoked on each poll with the latest prediction state.
   * @returns The final prediction response.
   * @throws {SkytellsError} If `maxWait` is exceeded (`WAIT_TIMEOUT`).
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
  async wait(prediction: PredictionResponse, options?: WaitOptions, onProgress?: OnProgressCallback): Promise<PredictionResponse> {
    const interval = options?.interval ?? DEFAULT_POLL_INTERVAL;
    const maxWait = options?.maxWait;
    const startTime = Date.now();

    let current = prediction;

    while (!TERMINAL_STATUSES.has(current.status)) {
      if (maxWait && (Date.now() - startTime) >= maxWait) {
        throw new SkytellsError(
          `Prediction ${current.id} did not complete within ${maxWait}ms`,
          'WAIT_TIMEOUT',
          `Timed out after ${maxWait}ms. Last status: ${current.status}`,
          408,
        );
      }

      await this.delay(interval);
      current = await this.predictions.get(current.id);

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
  queue(payload: PredictionRequest): void {
    this._queue.push({ request: payload });
  }

  /**
   * Dispatches all queued predictions, sending them to the API concurrently.
   *
   * Clears the queue after dispatching. Each prediction is created in the background
   * (non-blocking). Use {@link wait} on individual results if you need to wait for completion.
   *
   * @returns An array of prediction responses, one for each queued item.
   * @throws {SkytellsError} If any prediction request fails (all are attempted regardless).
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
      items.map(item => this.predictions.create(item.request)),
    );
    return results;
  }

  /**
   * Retrieves the streaming endpoint for a prediction.
   *
   * @param id - The prediction ID to stream.
   * @returns The prediction response with streaming URL info.
   * @throws {SkytellsError} If the prediction is not found or streaming is not available.
   *
   * @example
   * ```ts
   * const stream = await client.streamPrediction("pred_abc123");
   * console.log(stream.urls?.stream);
   * ```
   */
  async streamPrediction(id: string): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('GET', ENDPOINTS.STREAM_PREDICTION_BY_ID(id));
  }

  /**
   * Cancels a running prediction by its ID.
   *
   * Only predictions with status `pending`, `starting`, `started`, or `processing` can be cancelled.
   *
   * @param id - The prediction ID to cancel.
   * @returns The updated prediction response with `status: 'cancelled'`.
   * @throws {SkytellsError} If the prediction cannot be cancelled or is not found.
   *
   * @example
   * ```ts
   * await client.cancelPrediction("pred_abc123");
   * ```
   */
  async cancelPrediction(id: string): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('POST', ENDPOINTS.CANCEL_PREDICTION_BY_ID(id));
  }

  /**
   * Deletes a prediction and its associated output/assets.
   *
   * @param id - The prediction ID to delete.
   * @returns The prediction response confirming deletion.
   * @throws {SkytellsError} If the prediction is not found or the request fails.
   *
   * @example
   * ```ts
   * await client.deletePrediction("pred_abc123");
   * ```
   */
  async deletePrediction(id: string): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('DELETE', ENDPOINTS.DELETE_PREDICTION_BY_ID(id));
  }

  /** @internal */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
  async getPrediction(id: string): Promise<PredictionResponse> {
    return this.predictions.get(id);
  }

  /**
   * @deprecated Use {@link models}.get() instead. This method will be removed in a future version.
   */
  async getModel(slug: string, options?: ModelFieldsOptions): Promise<Model> {
    return this.models.get(slug, options);
  }
} 