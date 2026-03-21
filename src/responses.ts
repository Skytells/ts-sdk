/**
 * Responses API — Skytells `/v1/responses` endpoint (OpenAI-compatible).
 *
 * Follows the OpenAI Responses API schema. Safety `content_filters` (Skytells-specific) are
 * present in the response when the API returns them and are fully typed.
 *
 * @module responses
 */

import type { HTTP } from './http.js';
import { ENDPOINTS } from './endpoints.js';
import type {
  ResponsesCreateParams,
  ResponsesResponse,
  ResponsesStreamEvent,
} from './types/inference.types.js';

export type { ResponsesCreateParams, ResponsesResponse, ResponsesStreamEvent };

/**
 * Sub-resource for the Responses API. Mirrors OpenAI-style `client.responses` / `client.chat.responses` usage.
 */
export class Responses {
  constructor(private readonly http: HTTP) {}

  /**
   * Creates a response via `POST /v1/responses`.
   *
   * **Non-streaming** (`stream` omitted or `false`): returns a full {@link ResponsesResponse}.
   *
   * **Streaming** (`stream: true`): returns an `AsyncIterable<ResponsesStreamEvent>` directly.
   * Consume with `for await…of` — no extra `await` needed.
   *
   * @param params - Request body. See {@link ResponsesCreateParams} for all fields.
   * @returns `Promise<ResponsesResponse>` or `AsyncIterable<ResponsesStreamEvent>`.
   * @throws {SkytellsError} On API errors, timeouts, or stream failures.
   *
   * @example Non-streaming:
   * ```ts
   * const response = await client.responses.create({
   *   model: 'gpt-5.3-codex',
   *   input: [{ role: 'user', content: 'Explain recursion simply.' }],
   *   instructions: 'You are a helpful tutor.',
   * });
   * console.log(response.output[0].content[0].text);
   * ```
   *
   * @example Streaming:
   * ```ts
   * for await (const event of client.responses.create({
   *   model: 'gpt-5.3-codex',
   *   input: [{ role: 'user', content: 'Explain recursion simply.' }],
   *   stream: true,
   * })) {
   *   if (event.type === 'response.output_text.delta') {
   *     process.stdout.write(event.delta);
   *   }
   * }
   * ```
   */
  create(params: ResponsesCreateParams & { stream: true }): AsyncIterable<ResponsesStreamEvent>;
  create(params: ResponsesCreateParams & { stream?: false | null }): Promise<ResponsesResponse>;
  create(
    params: ResponsesCreateParams,
  ): Promise<ResponsesResponse> | AsyncIterable<ResponsesStreamEvent>;
  create(
    params: ResponsesCreateParams,
  ): Promise<ResponsesResponse> | AsyncIterable<ResponsesStreamEvent> {
    if (params.stream === true) {
      return this.http.requestStream<ResponsesStreamEvent>(
        ENDPOINTS.RESPONSES,
        params as unknown as Record<string, unknown>,
      );
    }
    return this.http.request<ResponsesResponse>(
      'POST',
      ENDPOINTS.RESPONSES,
      params as unknown as Record<string, unknown>,
    );
  }
}
