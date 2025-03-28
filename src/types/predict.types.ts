export interface PredictionRequest {
  /**
   * Model to use for the prediction
   */
  model: string;
  /**
   * Input to the prediction
   */
  input: Record<string, any>;
  /**
   * Webhook to receive prediction events
   */
  webhook?: {
    url: string;
    events: string[];
  };
  /**
   * Whether to wait for the prediction to complete
   * @default false
   */
  await?: boolean;
  /**
   * Whether to stream the prediction events
   * @default false
   */
  stream?: boolean;
}

export enum PredictionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  STARTING = 'starting',
  STARTED = 'started',
}
export enum PredictionType {
  INFERENCE = 'inference',
  TRAINING = 'training',
}

export enum PredictionSource {
  API = 'api',
  CLI = 'cli',
  WEB = 'web',
}
export interface PredictionResponse {
  status: PredictionStatus;
  id: string;
  type: PredictionType;
  response: string;
  stream: boolean;
  input: Record<string, any>;
  output?: string[];
  created_at: string;
  started_at: string;
  completed_at: string;
  updated_at: string;
  privacy: string;
  source?: PredictionSource;
  model?: {
    name: string;
    type: string;
  };
  webhook?: {
    url: string;
    events: string[];
  };
  metrics?: {
    image_count: number;
    predict_time: number;
  };
  metadata?: {
    billing?: {
      credits_used: number;
    };
    storage?: {
      files: {
        name: string;
        type: string;
        size: number;
        url: string;
      }[];
    };
  };
  urls?: {
    get?: string;
    cancel?: string;
    stream?: string;
    delete?: string;
  };
} 