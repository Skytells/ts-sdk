/**
 * Embeddings API — OpenAI-compatible embeddings.
 * Same API surface as OpenAI: client.embeddings.create()
 *
 * @module embeddings
 */

import type { HTTP } from './http.js';
import { ENDPOINTS } from './endpoints.js';
import type { CreateEmbeddingResponse, EmbeddingCreateParams } from './types/inference.types.js';

/**
 * Embeddings resource. Creates vector representations of text.
 * Mirrors OpenAI's client.embeddings API.
 */
export class Embeddings {
  constructor(private http: HTTP) {}

  /**
   * Creates an embedding vector representing the input text.
   * Same as OpenAI's client.embeddings.create().
   *
   * @param params - model, input (string or string[]), and optional encoding_format, dimensions, user
   * @returns The embedding response with data array, model, and usage
   *
   * @example
   * ```ts
   * const embedding = await client.embeddings.create({
   *   model: 'text-embedding-3-small',
   *   input: 'The quick brown fox',
   * });
   * console.log(embedding.data[0].embedding);
   *
   * const multi = await client.embeddings.create({
   *   model: 'text-embedding-3-small',
   *   input: ['First text', 'Second text'],
   * });
   * ```
   */
  async create(params: EmbeddingCreateParams): Promise<CreateEmbeddingResponse> {
    return this.http.request<CreateEmbeddingResponse>(
      'POST',
      ENDPOINTS.EMBEDDINGS,
      params as unknown as Record<string, unknown>,
    );
  }
}
