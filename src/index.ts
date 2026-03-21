/**
 * **Skytells JavaScript SDK** — inference (predict, chat, embeddings, responses), predictions lifecycle, models,
 * safety, inbound webhooks, and optional **Orchestrator** (`wfb_…` key on the same {@link SkytellsClient}).
 *
 * ### Import surface
 * - **Default:** `import Skytells from "skytells"` → {@link Skytells}(apiKey?, options?)
 * - **Named:** {@link SkytellsClient}, {@link SkytellsError}, webhook helpers, constants (`API_BASE_URL`, …)
 *
 * ### Error model
 * Most failures are {@link SkytellsError} with `errorId`, `message`, `details`, `httpStatus`, optional `requestId`.
 * Use `instanceof SkytellsError` (prototype is fixed in the constructor).
 *
 * ### Docs for humans & LLMs
 * - `docs/SDK.md`, `docs/SDKReference.md`, `docs/Reliability.md`, `docs/Orchestrator.md`
 * - Repo root **`AGENTS.md`** — how to extend the SDK without breaking transports
 *
 * @packageDocumentation
 */

import { SkytellsClient } from './client.js';
import type { ClientOptions } from './types/shared.types.js';

/**
 * Preferred factory: returns a {@link SkytellsClient} configured with your API key and options.
 *
 * @param apiKey - Skytells API key (`sk-…`), or omit for unauthenticated calls if the endpoint allows it.
 * @param options - See {@link ClientOptions} (`baseUrl`, `timeout`, `retry`, `fetch`, `runtime`, `orchestratorApiKey`, …).
 *
 * @example Both platform and Orchestrator on one client:
 * ```ts
 * const client = Skytells('sk-…', { orchestratorApiKey: 'wfb-…' });
 * await client.models.list();
 * await client.orchestrator.webhooks.execute(workflowId, { event: 'order.created' }); // wfb_… key from options
 * ```
 */
export function Skytells(apiKey?: string, options: ClientOptions = {}): SkytellsClient {
  return new SkytellsClient(apiKey, options);
}

let createClientWarned = false;

/**
 * Same as {@link Skytells}. Prefer `import Skytells from "skytells"` and call `Skytells(apiKey, options)`.
 * @deprecated Use the default export {@link Skytells} instead.
 */
export function createClient(apiKey?: string, options: ClientOptions = {}): SkytellsClient {
  if (!createClientWarned) {
    createClientWarned = true;
    console.warn(
      '[skytells] createClient() is deprecated; use: import Skytells from "skytells" then Skytells(apiKey, options).',
    );
  }
  return new SkytellsClient(apiKey, options);
}

export * from './types/index.js';
export {
  SkytellsClient,
  Prediction,
  PredictionsAPI,
  ModelsAPI,
  PREFETCHED_MODEL_CACHE_TTL_MS,
  PREFETCHED_MODEL_CACHE_MAX_SLUGS,
  EDGE_DEFAULT_REQUEST_TIMEOUT_MS,
  EDGE_PREFETCH_MAX_SLUGS,
} from './client.js';
export { HTTP_DEFAULT_REQUEST_TIMEOUT_MS } from './http.js';
export { Chat, Completions } from './chat.js';
export {
  Responses,
  type ResponsesCreateParams,
  type ResponsesResponse,
  type ResponsesStreamEvent,
} from './responses.js';
export { Embeddings } from './embeddings.js';
export { Safety } from './safety.js';
export { API_BASE_URL, ORCHESTRATOR_BASE_URL } from './endpoints.js';
export {
  Orchestrator,
  OrchestratorWorkflows,
  OrchestratorExecutions,
  OrchestratorWebhooks,
  OrchestratorIntegrations,
  OrchestratorApiKeys,
  OrchestratorAi,
  OrchestratorUser,
} from './orchestrator.js';
export { resolvePredictionResourceUrl, type PredictionResourceKey } from './prediction-urls.js';
export { SkytellsError } from './types/shared.types.js';
export {
  Webhook,
  WebhookListener,
  WebhookEvent,
  createWebhookListener,
  verifySkytellsWebhookSignature,
  webhookRoutesForPrediction,
  SKYTELLS_WEBHOOK_SIGNATURE_HEADER,
  type WebhookPayload,
  type WebhookOptions,
  type WebhookVerifyOptions,
  type WebhookVerifyMode,
  type WebhookListenerOptions,
  type WebhookRoute,
  type WebhookListenerHandler,
} from './webhooks.js';

export default Skytells;
