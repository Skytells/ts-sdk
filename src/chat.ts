/**
 * Chat API — OpenAI-compatible chat completions.
 * Same API surface as OpenAI: client.chat.completions.create()
 *
 * @module chat
 */

import type { HTTP } from './http.js';
import { ENDPOINTS } from './endpoints.js';
import { Responses } from './responses.js';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from './types/inference.types.js';

/**
 * Completions sub-resource. Exposes create() for chat completions.
 * Mirrors OpenAI's client.chat.completions API.
 */
export class Completions {
  constructor(private readonly http: HTTP) {}

  /**
   * Creates a chat completion. Same as OpenAI's `client.chat.completions.create()`.
   *
   * When `stream` is `false` or omitted: returns `Promise<ChatCompletion>`.
   * When `stream` is `true`: returns an `AsyncIterable<ChatCompletionChunk>` directly;
   * consume with `for await…of` — no extra `await` needed.
   *
   * @param params - model, messages, and optional stream, tools, max_tokens, temperature, etc.
   * @returns `Promise<ChatCompletion>` or `AsyncIterable<ChatCompletionChunk>`.
   *
   * @example Non-streaming:
   * ```ts
   * const completion = await client.chat.completions.create({
   *   model: 'deepbrain-router',
   *   messages: [{ role: 'user', content: 'Hello' }],
   * });
   * console.log(completion.choices[0].message.content);
   * ```
   *
   * @example Streaming:
   * ```ts
   * for await (const chunk of client.chat.completions.create({
   *   model: 'deepbrain-router',
   *   messages: [{ role: 'user', content: 'Hello' }],
   *   stream: true,
   * })) {
   *   process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
   * }
   * ```
   *
   * @example Tool calling:
   * ```ts
   * const result = await client.chat.completions.create({
   *   model: 'deepbrain-router',
   *   messages: [{ role: 'user', content: 'What is the weather in London?' }],
   *   tools: [{
   *     type: 'function',
   *     function: {
   *       name: 'get_weather',
   *       description: 'Get current weather for a location.',
   *       parameters: {
   *         type: 'object',
   *         properties: { location: { type: 'string' } },
   *         required: ['location'],
   *       },
   *     },
   *   }],
   *   tool_choice: 'auto',
   * });
   * const toolCall = result.choices[0].message.tool_calls?.[0];
   * ```
   */
  create(params: ChatCompletionCreateParamsStreaming): AsyncIterable<ChatCompletionChunk>;
  create(params: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion>;
  create(
    params: ChatCompletionCreateParams,
  ): Promise<ChatCompletion> | AsyncIterable<ChatCompletionChunk> {
    if (params.stream === true) {
      return this.http.requestStream<ChatCompletionChunk>(
        ENDPOINTS.CHAT_COMPLETIONS,
        params as unknown as Record<string, unknown>,
      );
    }
    return this.http.request<ChatCompletion>(
      'POST',
      ENDPOINTS.CHAT_COMPLETIONS,
      params as unknown as Record<string, unknown>,
    );
  }
}

/**
 * Chat resource. Exposes completions and responses sub-APIs.
 * Mirrors OpenAI's client.chat structure.
 */
export class Chat {
  /** Chat completions. Same as OpenAI's `client.chat.completions` */
  readonly completions: Completions;

  /** Responses API (`POST /v1/responses`). Same surface as OpenAI-style `client.responses`. */
  readonly responses: Responses;

  constructor(http: HTTP) {
    this.completions = new Completions(http);
    this.responses = new Responses(http);
  }
}
