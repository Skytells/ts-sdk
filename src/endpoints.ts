/**
 * Default HTTP origins and path fragments for the **Skytells Inference API** (`api.skytells.ai/v1`).
 *
 * - **`API_BASE_URL`** — merged with relative paths in {@link SkytellsClient} / internal {@link HTTP}.
 * - **`ORCHESTRATOR_BASE_URL`** — separate host for {@link SkytellsClient.orchestrator}; not a suffix of `API_BASE_URL`.
 * - **`ENDPOINTS`** — no leading slash duplication: callers join as `` `${baseUrl}${ENDPOINTS.PREDICT}` `` (base has no trailing slash).
 *
 * @module endpoints
 */

/** Default Skytells REST API origin (v1). Override via {@link ClientOptions.baseUrl}. */
export const API_BASE_URL = 'https://api.skytells.ai/v1';

/** Default [Orchestrator](https://learn.skytells.ai/docs/products/orchestrator/api-reference) host. Override via {@link ClientOptions.orchestratorBaseUrl}. */
export const ORCHESTRATOR_BASE_URL = 'https://orchestrator.skytells.ai';

/** Relative paths under `API_BASE_URL` for predictions, models, chat, responses, embeddings. */
export const ENDPOINTS = {
  PREDICT: '/predict',
  PREDICTIONS: '/predictions',
  MODELS: '/models',
  MODEL_BY_SLUG: (slug: string): string => `/model/${encodeURIComponent(slug)}`,
  PREDICTION_BY_ID: (id: string): string => `/predictions/${encodeURIComponent(id)}`,
  STREAM_PREDICTION_BY_ID: (id: string): string => `/predictions/${encodeURIComponent(id)}/stream`,
  CANCEL_PREDICTION_BY_ID: (id: string): string => `/predictions/${encodeURIComponent(id)}/cancel`,
  DELETE_PREDICTION_BY_ID: (id: string): string => `/predictions/${encodeURIComponent(id)}/delete`,
  CHAT_COMPLETIONS: '/chat/completions',
  RESPONSES: '/responses',
  EMBEDDINGS: '/embeddings',
};
