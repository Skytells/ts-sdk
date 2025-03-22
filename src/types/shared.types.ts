export interface ApiError {
  status: boolean;
  response: string;
  error: {
    http_status: number;
    message: string;
    details: string;
    error_id: string;
  };
}

export interface ClientOptions {
  baseUrl?: string;
  timeout?: number;
}

export class SkytellsError extends Error {
  errorId: string;
  details: string;
  httpStatus: number;

  constructor(message: string, errorId: string, details: string, httpStatus?: number) {
    super(message);
    this.name = 'SkytellsError';
    this.errorId = errorId;
    this.details = details;
    this.httpStatus = httpStatus || 0;
    
    // This is needed for proper instanceof checks in some environments
    Object.setPrototypeOf(this, SkytellsError.prototype);
  }
} 