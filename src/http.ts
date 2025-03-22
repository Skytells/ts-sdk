import { API_BASE_URL } from './endpoints.js';
import { SkytellsError } from './types/shared.types.js';

// Default timeout in milliseconds
// 60 seconds
const DEFAULT_TIMEOUT = 60000;

export class HTTP {
  private apiKey?: string;
  private baseUrl: string;
  private timeout: number;

  constructor(apiKey?: string, baseUrl: string = API_BASE_URL, timeout: number = DEFAULT_TIMEOUT) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, data?: Record<string, unknown>): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (method === 'POST' && data) {
      options.body = JSON.stringify(data);
    }

    // Add AbortController for timeout handling
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) {
      options.signal = controller.signal;
    }

    // Set up timeout if AbortController is available
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (controller) {
      timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeout);
    }

    try {
      // Use native fetch which is available in modern browsers and edge environments
      const response = await fetch(`${this.baseUrl}${path}`, options);
      
      // Get the response content type to check if it's JSON
      const contentType = response.headers.get('content-type') || '';
      const isJsonResponse = contentType.includes('application/json');
      
      // Handle non-JSON responses properly
      if (!isJsonResponse) {
        // If not JSON, get the text for error details
        let responseText = '';
        try {
          responseText = await response.text();
          // Truncate if too long to avoid huge error messages
          if (responseText.length > 500) {
            responseText = responseText.substring(0, 500) + '... [truncated]';
          }
        } catch (textError) {
          responseText = 'Could not read response body';
        }
        
        throw new SkytellsError(
          `Server responded with non-JSON content (${contentType})`,
          'SERVER_ERROR',
          `Status: ${response.status}, Content: ${responseText}`,
          response.status
        );
      }
      
      // Try to parse as JSON
      let responseData: any;
      try {
        responseData = await response.json();
      } catch (error) {
        // Get response text for better error details
        let responseText = '';
        try {
          // Need to clone response since we already tried to read it as JSON
          responseText = await response.clone().text();
          if (responseText.length > 500) {
            responseText = responseText.substring(0, 500) + '... [truncated]';
          }
        } catch (textError) {
          responseText = 'Could not read response body';
        }
        
        throw new SkytellsError(
          'Invalid JSON response',
          'INVALID_JSON',
          `The server returned invalid JSON. Status: ${response.status}, Content: ${responseText}`,
          response.status
        );
      }

      // Check if the response indicates an error
      if (!response.ok || (responseData && responseData.status === false)) {
        if (responseData && responseData.error) {
          // API returned a structured error
          throw new SkytellsError(
            responseData.error.message || responseData.response || 'API error occurred',
            responseData.error.error_id || 'UNKNOWN_ERROR',
            responseData.error.details || responseData.response || 'No additional details',
            responseData.error.http_status || response.status
          );
        } else if (responseData && responseData.response) {
          // Simple error with just a response message
          throw new SkytellsError(
            responseData.response,
            'API_ERROR',
            responseData.response,
            response.status
          );
        } else {
          // Generic HTTP error
          throw new SkytellsError(
            `HTTP error ${response.status}`,
            'HTTP_ERROR',
            `The server returned status code ${response.status}`,
            response.status
          );
        }
      }

      return responseData as T;
    } catch (error) {
      // Check if it's an abort error (timeout)
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        throw new SkytellsError(
          `Request timed out after ${this.timeout}ms`,
          'REQUEST_TIMEOUT',
          `The request took longer than ${this.timeout}ms to complete`,
          408 // Request Timeout status code
        );
      }
      
      // Re-throw original error
      if (error instanceof SkytellsError) {
        throw error;
      }
      
      // Network or other errors
      throw new SkytellsError(
        error instanceof Error ? error.message : 'Network error occurred',
        'NETWORK_ERROR',
        'A network error occurred while communicating with the API',
        0 // No HTTP status for network errors
      );
    } finally {
      // Clear timeout if it was set
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }
} 