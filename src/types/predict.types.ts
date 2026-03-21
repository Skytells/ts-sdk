import type { Webhook } from '../webhooks.js';

/**
 * Payload for creating a prediction via the Skytells API.
 *
 * Used by {@link SkytellsClient.predict} and {@link PredictionsAPI.create}.
 *
 * @example
 * ```ts
 * const response = await client.predict({
 *   model: "flux-pro",
 *   input: { prompt: "A sunset over mountains" },
 *   await: true,
 * });
 * ```
 */
export interface PredictionRequest {
  /** Model slug to run (e.g. `"flux-pro"`, `"truefusion"`, `"beatfusion"`). */
  model: string;
  /** Key-value input parameters for the model (e.g. `{ prompt: "..." }`). */
  input: Record<string, any>;
  /**
   * Webhook configuration — Skytells POSTs the prediction JSON to `url` on subscribed events.
   * Prefer `new Webhook(url, [...]).toJSON()` or pass a `Webhook` instance (client normalizes for JSON).
   * @see https://docs.skytells.ai/webhooks/
   */
  webhook?:
    | Webhook
    | {
        /** HTTPS endpoint that accepts POST (raw JSON body + `X-Skytells-Signature`). */
        url: string;
        /** Event names: `completed`, `failed`, `canceled`, `started` — see `WebhookEvent`. */
        events: ReadonlyArray<string>;
      };
  /**
   * If `true`, the API blocks until the prediction completes and returns the final result.
   * If `false` (default), returns immediately with status `"pending"`.
   * @default false
   */
  await?: boolean;
  /**
   * If `true`, enables streaming for the prediction.
   * @default false
   */
  stream?: boolean;
}

/**
 * SDK-only options for {@link SkytellsClient.predict}, {@link PredictionsAPI.create},
 * {@link SkytellsClient.run}, and {@link SkytellsClient.queue} — never sent in `POST /predict` JSON.
 */
export interface PredictionSdkOptions {
  /**
   * When `true`, before the request the client calls `GET /model/{slug}` and may throw `SDK_ERROR` if the
   * model is OpenAI-chat-only (use `client.chat.completions.create` instead). Metadata is cached per client
   * for {@link PREFETCHED_MODEL_CACHE_TTL_MS}; max distinct slugs is `client.config.prefetchMaxSlugs`
   * (smaller when `runtime: "edge"`).
   */
  compatibilityCheck?: boolean;
  /**
   * When `true`, automatically sets `await: true` on the request if the model type is `image`
   * (or `image_megapixel`), causing the server to block and return the final output in one response.
   *
   * **Requires `compatibilityCheck: true`** — the model type is read from the same cached `GET /model/{slug}`
   * call made by the compatibility guard. Silently falls back to `await: false` if the model fetch fails
   * or the type is not an image type (e.g. video models ignore server-side await).
   *
   * `payload.await` always takes priority: if you explicitly set `await: true` or `await: false` on the
   * request, `autoAwait` is ignored.
   *
   * @example
   * ```ts
   * const prediction = await client.predictions.create(
   *   { model: 'flux-pro', input: { prompt: '...' } },
   *   { compatibilityCheck: true, autoAwait: true },
   * );
   * // For image models: prediction.output is already populated
   * // For video/audio models: prediction.status is 'pending', poll with client.wait()
   * ```
   */
  autoAwait?: boolean;
}

/**
 * Options for {@link SkytellsClient.run}.
 *
 * Same as {@link PredictionRequest} but without `model` (passed separately) and `await` (handled internally).
 *
 * @example
 * ```ts
 * const prediction = await client.run("flux-pro", {
 *   input: { prompt: "A cat wearing sunglasses" },
 *   webhook: { url: "https://example.com/hook", events: ["completed"] },
 * });
 * ```
 */
export interface RunOptions {
  /** Key-value input parameters for the model. */
  input: Record<string, any>;
  /**
   * Optional webhook configuration to receive prediction lifecycle events.
   */
  webhook?:
    | Webhook
    | {
        url: string;
        events: ReadonlyArray<string>;
      };
  /**
   * If `true`, enables streaming for the prediction.
   * @default false
   */
  stream?: boolean;
  /**
   * Poll interval in ms while waiting — **only** when {@link SkytellsClient.run} is used **with** `onProgress`
   * (background `predictions.create` + {@link SkytellsClient.wait}). Ignored for the default blocking `run()` path.
   * @default 5000
   */
  interval?: number;
  /**
   * Max time before `WAIT_TIMEOUT` — **only** with `onProgress`; see {@link WaitOptions.maxWait}.
   */
  maxWait?: number;
  /**
   * Abort background wait/polling — **only** with `onProgress`. Throws `SkytellsError` with `errorId: 'ABORTED'`.
   */
  signal?: AbortSignal;
}

/**
 * Options for listing predictions with filters and pagination.
 *
 * @example
 * ```ts
 * const { data } = await client.predictions.list({
 *   model: "flux-pro",
 *   since: "2026-01-01",
 *   until: "2026-03-15",
 *   page: 2,
 * });
 * ```
 */
export interface PredictionsListOptions {
  /** Page number for pagination (default: 1). */
  page?: number;
  /** Include predictions created on or after this date (`YYYY-MM-DD`). */
  since?: string;
  /** Include predictions created on or before this date (`YYYY-MM-DD`). */
  until?: string;
  /** Filter by model slug (e.g. `"flux-pro"`). */
  model?: string;
}

/**
 * Progress callback invoked on each poll during {@link SkytellsClient.run} or {@link SkytellsClient.wait}.
 *
 * @param prediction - The latest prediction response from the API, including current status and metrics.
 *
 * @example
 * ```ts
 * const prediction = await client.run("flux-pro", { input: { prompt: "..." } }, (p) => {
 *   console.log(p.status, p.metrics?.progress);
 * });
 * ```
 */
export type OnProgressCallback = (prediction: PredictionResponse) => void;

/**
 * Options for {@link SkytellsClient.wait} to control polling behavior.
 *
 * @example
 * ```ts
 * const result = await client.wait(prediction, {
 *   interval: 2000,   // poll every 2 seconds
 *   maxWait: 120000,  // timeout after 2 minutes
 * });
 * ```
 */
export interface WaitOptions {
  /** Polling interval in milliseconds (default: 5000). */
  interval?: number;
  /** Maximum time to wait in milliseconds. Throws `WAIT_TIMEOUT` error if exceeded. */
  maxWait?: number;
  /**
   * When aborted, stops polling and throws `SkytellsError` with `errorId: 'ABORTED'`.
   * Use with `AbortController` to cancel waits when a user navigates away or a job is superseded.
   */
  signal?: AbortSignal;
}

/**
 * An item in the local prediction queue, created by {@link SkytellsClient.queue}
 * and dispatched by {@link SkytellsClient.dispatch}.
 */
export interface QueueItem {
  /** The prediction request payload to dispatch. */
  request: PredictionRequest;
  /** Per-item SDK options (e.g. {@link PredictionSdkOptions.compatibilityCheck}) passed to {@link PredictionsAPI.create}. */
  sdk?: PredictionSdkOptions;
}

/**
 * Lifecycle status of a prediction.
 *
 * - `pending` — Queued, waiting to start.
 * - `starting` — Allocating resources.
 * - `started` — Resources allocated, about to process.
 * - `processing` — Actively running.
 * - `succeeded` — Completed successfully (output available).
 * - `failed` — Completed with an error.
 * - `cancelled` — Cancelled by the user.
 */
export enum PredictionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  STARTING = 'starting',
  STARTED = 'started',
}

/**
 * The type of prediction workload.
 */
export enum PredictionType {
  /** Standard inference (generating output from input). */
  INFERENCE = 'inference',
  /** Model training/fine-tuning. */
  TRAINING = 'training',
}

/**
 * The source that created the prediction.
 */
export enum PredictionSource {
  /** Created via the REST API or SDK. */
  API = 'api',
  /** Created via the Skytells CLI. */
  CLI = 'cli',
  /** Created via the Skytells web interface. */
  WEB = 'web',
}

/**
 * The full prediction response returned by the Skytells API.
 *
 * Contains the prediction status, input/output, timing, metrics, billing,
 * storage information, and API URLs for lifecycle management.
 *
 * @example
 * ```ts
 * const response = await client.predict({
 *   model: "flux-pro",
 *   input: { prompt: "A sunset" },
 *   await: true,
 * });
 *
 * console.log(response.id);            // "pred_abc123"
 * console.log(response.status);        // "succeeded"
 * console.log(response.output);        // "https://..." or ["https://...", ...]
 * console.log(response.metrics);       // { predict_time: 2.3, total_time: 5.1, ... }
 * console.log(response.metadata);      // { billing: { credits_used: 1 }, ... }
 * ```
 */
export interface PredictionResponse {
  /** Current lifecycle status of the prediction. */
  status: PredictionStatus;
  /**
   * Unique prediction identifier (opaque string; often a UUID from the API).
   * Present on every prediction API response payload.
   */
  id: string;
  /** Type of prediction workload (`"inference"` or `"training"`). */
  type: PredictionType;
  /** Whether streaming was enabled for this prediction. */
  stream: boolean;
  /** The input parameters that were sent to the model. */
  input: Record<string, any>;
  /** Human-readable response message (e.g. error details on failure). */
  response?: string;
  /**
   * The prediction output. Can be:
   * - A single `string` (e.g. an image URL or text completion).
   * - A `string[]` array (e.g. multiple image URLs).
   * - `undefined` if the prediction hasn't completed yet.
   */
  output?: string | string[];
  /** ISO 8601 timestamp when the prediction was created. */
  created_at: string;
  /** ISO 8601 timestamp when processing started. */
  started_at: string;
  /** ISO 8601 timestamp when the prediction completed (succeeded/failed/cancelled). */
  completed_at: string;
  /** ISO 8601 timestamp of the last status update. */
  updated_at: string;
  /** Privacy level of the prediction. */
  privacy: string;
  /** The source that created this prediction (API, CLI, or web). */
  source?: PredictionSource;
  /** The model used for this prediction. */
  model?: {
    /** Model display name. */
    name: string;
    /** Model type (e.g. `"image"`, `"video"`). */
    type: string;
  };
  /** Webhook configuration, if set. */
  webhook?: {
    /** The webhook URL, or `null` if not configured. */
    url: string | null;
    /** Events the webhook is subscribed to. */
    events: string[];
  };
  /**
   * Performance and usage metrics for the prediction.
   * Available after the prediction completes.
   */
  metrics?: {
    /** Number of images generated. */
    image_count?: number;
    /** Time spent on model inference (seconds). */
    predict_time?: number;
    /** Total wall-clock time including queue and overhead (seconds). */
    total_time?: number;
    /** Number of output assets (files) generated. */
    asset_count?: number;
    /** Progress percentage (0–100), available during processing. */
    progress?: number;
  };
  /**
   * Metadata including billing and storage information.
   */
  metadata?: {
    /** Billing details for this prediction. */
    billing?: {
      /** Number of credits consumed. */
      credits_used: number;
    };
    /** Storage details for generated output files. */
    storage?: {
      /** Array of generated files with download URLs. */
      files: {
        /** File name (e.g. `"output.png"`). */
        name: string;
        /** MIME type (e.g. `"image/png"`). */
        type: string;
        /** File size in bytes. */
        size: number;
        /** Download URL for the file. */
        url: string;
      }[];
    };
    /** Whether output data is still available for download. */
    data_available?: boolean;
  };
  /**
   * API URLs for managing this prediction's lifecycle.
   */
  urls?: {
    /** URL to fetch the prediction status. */
    get?: string;
    /** URL to cancel the prediction. */
    cancel?: string;
    /** URL for the streaming endpoint. */
    stream?: string;
    /** URL to delete the prediction. */
    delete?: string;
  };
}
