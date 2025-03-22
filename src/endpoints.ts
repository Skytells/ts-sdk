export const API_BASE_URL = "https://api.skytells.ai/v1"

export const ENDPOINTS = {
  PREDICT: "/predict",
  MODELS: "/models",
  PREDICTION_BY_ID: (id: string) => `/predictions/${id}`,
  STREAM_PREDICTION_BY_ID: (id: string) => `/predictions/${id}/stream`,
  CANCEL_PREDICTION_BY_ID: (id: string) => `/predictions/${id}/cancel`,
  DELETE_PREDICTION_BY_ID: (id: string) => `/predictions/${id}/delete`,
} 