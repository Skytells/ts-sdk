import { API_BASE_URL, ENDPOINTS } from '../src/endpoints';

describe('Endpoints', () => {
  test('API_BASE_URL is correct', () => {
    expect(API_BASE_URL).toBe('https://api.skytells.ai/v1');
  });

  test('static endpoints', () => {
    expect(ENDPOINTS.PREDICT).toBe('/predict');
    expect(ENDPOINTS.PREDICTIONS).toBe('/predictions');
    expect(ENDPOINTS.MODELS).toBe('/models');
  });

  test('MODEL_BY_SLUG builds correct path', () => {
    expect(ENDPOINTS.MODEL_BY_SLUG('flux-pro')).toBe('/model/flux-pro');
    expect(ENDPOINTS.MODEL_BY_SLUG('truefusion')).toBe('/model/truefusion');
  });

  test('PREDICTION_BY_ID builds correct path', () => {
    expect(ENDPOINTS.PREDICTION_BY_ID('pred_123')).toBe('/predictions/pred_123');
  });

  test('STREAM_PREDICTION_BY_ID builds correct path', () => {
    expect(ENDPOINTS.STREAM_PREDICTION_BY_ID('pred_123')).toBe('/predictions/pred_123/stream');
  });

  test('CANCEL_PREDICTION_BY_ID builds correct path', () => {
    expect(ENDPOINTS.CANCEL_PREDICTION_BY_ID('pred_123')).toBe('/predictions/pred_123/cancel');
  });

  test('DELETE_PREDICTION_BY_ID builds correct path', () => {
    expect(ENDPOINTS.DELETE_PREDICTION_BY_ID('pred_123')).toBe('/predictions/pred_123/delete');
  });
});
