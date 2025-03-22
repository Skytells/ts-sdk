import { SkytellsClient } from './client.js';
import { ClientOptions } from './types/shared.types.js';

/**
 * Create a new Skytells API client
 * @param apiKey Optional API key for authenticated requests
 * @param options Optional client configuration
 * @returns A new Skytells client instance
 */
export function createClient(apiKey?: string, options: ClientOptions = {}): SkytellsClient {
  return new SkytellsClient(apiKey, options);
}

export * from './types/index.js';
export { SkytellsClient } from './client.js';
export { API_BASE_URL } from './endpoints.js';
export { SkytellsError } from './types/shared.types.js'; 