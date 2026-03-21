/**
 * Resolve canonical prediction resource URLs: prefer `PredictionResponse.urls` from the API,
 * fall back to `{baseUrl}{ENDPOINTS...}`.
 *
 * @module prediction-urls
 */

import { ENDPOINTS } from './endpoints.js';
import type { PredictionResponse } from './types/predict.types.js';

export type PredictionResourceKey = 'get' | 'cancel' | 'stream' | 'delete';

/**
 * Resolve the URL for **get / cancel / stream / delete** on a prediction.
 *
 * @param key - Which resource: `get` (poll), `cancel`, `stream`, `delete`.
 * @param id - Prediction id from {@link PredictionResponse.id}.
 * @param urls - Optional `urls` map from API response; **absolute URLs win** when present.
 * @param baseUrl - Same origin as the client (typically {@link SkytellsClient}'s resolved base, no trailing slash).
 * @returns Absolute URL string suitable for `fetch` or {@link HTTP.request}.
 */
export function resolvePredictionResourceUrl(
  key: PredictionResourceKey,
  id: string,
  urls: PredictionResponse['urls'] | undefined,
  baseUrl: string,
): string {
  const fromBody = urls?.[key];
  if (typeof fromBody === 'string' && fromBody.length > 0) {
    return fromBody;
  }
  let path: string;
  switch (key) {
    case 'get':
      path = ENDPOINTS.PREDICTION_BY_ID(id);
      break;
    case 'cancel':
      path = ENDPOINTS.CANCEL_PREDICTION_BY_ID(id);
      break;
    case 'stream':
      path = ENDPOINTS.STREAM_PREDICTION_BY_ID(id);
      break;
    case 'delete':
      path = ENDPOINTS.DELETE_PREDICTION_BY_ID(id);
      break;
  }
  return `${baseUrl}${path}`;
}
