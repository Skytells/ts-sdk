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

export interface RetryOptions {
  /** Number of retry attempts for failed requests (default: 0) */
  retries?: number;
  /** Delay in milliseconds between retries (default: 1000) */
  retryDelay?: number;
  /** HTTP status codes that should trigger a retry (default: [429, 500, 502, 503, 504]) */
  retryOn?: number[];
}

export interface ClientOptions {
  /** Custom base URL for the API */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Custom headers to include in every request */
  headers?: Record<string, string>;
  /** Retry configuration for failed requests */
  retry?: RetryOptions;
  /** Custom fetch implementation (e.g. for testing or proxying) */
  fetch?: typeof fetch;
}

export interface Pagination {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export enum ApiErrorId {
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  INVALID_DATE_FORMAT = 'INVALID_DATE_FORMAT',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
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