import { HTTP } from './http.js';
import { ENDPOINTS } from './endpoints.js';
import { PredictionRequest, PredictionResponse, Model, ClientOptions } from './types/index.js';

export class SkytellsClient {
  private http: HTTP;

  /**
   * Creates a new Skytells client
   * @param apiKey Your Skytells API key
   * @param options Configuration options
   */
  constructor(apiKey?: string, options: ClientOptions = {}) {
    this.http = new HTTP(apiKey, options.baseUrl, options.timeout);
  }

  /**
   * Send a prediction request to the Skytells API
   * @param payload The prediction request parameters
   * @returns A promise that resolves to the prediction response
   */
  async predict(payload: PredictionRequest): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('POST', ENDPOINTS.PREDICT, payload as unknown as Record<string, unknown>);
  }

  /**
   * Get a prediction by ID
   * @param id The prediction ID
   * @returns A promise that resolves to the prediction response
   */
  async getPrediction(id: string): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('GET', ENDPOINTS.PREDICTION_BY_ID(id));
  }

  /**
   * List all available models
   * @returns A promise that resolves to an array of models
   */
  async listModels(): Promise<Model[]> {
    return this.http.request<Model[]>('GET', ENDPOINTS.MODELS);
  }

  /**
   * Stream a prediction by ID
   * @param id The prediction ID
   * @returns A promise that resolves to the prediction response
   */
  async streamPrediction(id: string): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('GET', ENDPOINTS.STREAM_PREDICTION_BY_ID(id));
  }

  /**
   * Cancel a prediction by ID
   * @param id The prediction ID
   * @returns A promise that resolves to the prediction response
   */
  async cancelPrediction(id: string): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('POST', ENDPOINTS.CANCEL_PREDICTION_BY_ID(id));
  }

  /**
   * Delete a prediction by ID
   * @param id The prediction ID
   * @returns A promise that resolves to the prediction response
   */
  async deletePrediction(id: string): Promise<PredictionResponse> {
    return this.http.request<PredictionResponse>('DELETE', ENDPOINTS.DELETE_PREDICTION_BY_ID(id));
  }
} 