export const API_BASE_URL = "https://api.skytells.ai/v1"

export const ENDPOINTS = {
  PREDICT: "/predict",
  PREDICTIONS: "/predictions",
  MODELS: "/models",
  MODEL_BY_SLUG: (slug: string): string => `/model/${slug}`,
  PREDICTION_BY_ID: (id: string): string => `/predictions/${id}`,
  STREAM_PREDICTION_BY_ID: (id: string): string => `/predictions/${id}/stream`,
  CANCEL_PREDICTION_BY_ID: (id: string): string => `/predictions/${id}/cancel`,
  DELETE_PREDICTION_BY_ID: (id: string): string => `/predictions/${id}/delete`,
} 