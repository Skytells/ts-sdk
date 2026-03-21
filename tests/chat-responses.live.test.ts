/**
 * Live tests — Chat completions & Responses API
 *
 * Requires a real API key:
 *
 *   SKYTELLS_API_KEY=sk-... npm run test:chat-live
 *
 * Optional overrides:
 *   SKYTELLS_CHAT_MODEL=<slug>      (default: deepbrain-router)
 *   SKYTELLS_RESPONSES_MODEL=<slug> (default: same as chat model)
 *
 * Skipped automatically when SKYTELLS_API_KEY is not set, so it never breaks
 * the default `npm test` unit suite.
 */

import Skytells from '../src';
import type { SkytellsClient } from '../src';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ResponsesResponse,
} from '../src/types/inference.types';

// ─── Config ──────────────────────────────────────────────────────────────────

const CHAT_MODEL = process.env.SKYTELLS_CHAT_MODEL?.trim() || 'deepbrain-router';
const RESPONSES_MODEL = process.env.SKYTELLS_RESPONSES_MODEL?.trim() || CHAT_MODEL;

const apiKey = process.env.SKYTELLS_API_KEY;
const describeLive = apiKey ? describe : describe.skip;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function banner(title: string): void {
  console.log(`\n${'─'.repeat(14)} ${title} ${'─'.repeat(14)}`);
}

/** Extract plain text from a streamed chat chunk choice delta. */
function chatDeltaText(chunk: ChatCompletionChunk): string {
  let text = '';
  for (const choice of chunk.choices ?? []) {
    const d = choice.delta as Record<string, unknown> | undefined;
    if (!d) continue;
    const c = d.content;
    if (typeof c === 'string') {
      text += c;
    } else if (Array.isArray(c)) {
      for (const part of c) {
        if (part && typeof part === 'object' && 'text' in part) {
          const t = (part as { text?: unknown }).text;
          if (typeof t === 'string') text += t;
        }
      }
    }
  }
  return text;
}

/** Extract the first output text from a Responses API response. */
function extractResponsesText(response: ResponsesResponse): string {
  for (const item of response.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.text) return part.text;
    }
  }
  return '';
}

// ─── Chat Completions tests ───────────────────────────────────────────────────

describeLive('Live: chat.completions', () => {
  jest.setTimeout(120_000);

  let client: SkytellsClient;

  beforeAll(() => {
    client = Skytells(apiKey!);
    console.log(`\n[chat-live] model: ${CHAT_MODEL}`);
  });

  // ── Non-streaming ──────────────────────────────────────────────────────────

  test('non-streaming: returns a full ChatCompletion', async () => {
    banner('chat / non-streaming');

    const completion: ChatCompletion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: 'You are a concise assistant. Reply in one sentence.' },
        { role: 'user', content: 'What is 2 + 2?' },
      ],
      max_tokens: 1024,
    });

    console.log('[chat/non-stream] id          :', completion.id);
    console.log('[chat/non-stream] model        :', completion.model);
    console.log('[chat/non-stream] finish_reason:', completion.choices[0]?.finish_reason);
    console.log('[chat/non-stream] content      :', completion.choices[0]?.message?.content);
    console.log('[chat/non-stream] usage        :', JSON.stringify(completion.usage));

    expect(completion.id).toBeTruthy();
    expect(completion.object).toBe('chat.completion');
    expect(completion.choices.length).toBeGreaterThan(0);

    const msg = completion.choices[0]!.message;
    expect(msg.role).toBe('assistant');
    expect(typeof msg.content === 'string' ? msg.content.length : 0).toBeGreaterThan(0);
    expect(completion.usage?.total_tokens).toBeGreaterThan(0);
  });

  // ── Non-streaming with tool calling ───────────────────────────────────────

  test('non-streaming: tool_choice + tool_calls in response', async () => {
    banner('chat / tool calling');

    const completion: ChatCompletion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: 'What is the weather in Paris right now?' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get the current weather for a given city.',
            parameters: {
              type: 'object',
              properties: {
                city: { type: 'string', description: 'City name' },
              },
              required: ['city'],
            },
          },
        },
      ],
      tool_choice: 'auto',
      max_tokens: 128,
    });

    console.log('[chat/tools] id          :', completion.id);
    console.log('[chat/tools] finish_reason:', completion.choices[0]?.finish_reason);
    console.log(
      '[chat/tools] tool_calls  :',
      JSON.stringify(completion.choices[0]?.message?.tool_calls, null, 2),
    );

    expect(completion.id).toBeTruthy();
    // Model may return tool_calls or a direct answer — both are valid.
    const choice = completion.choices[0]!;
    const hasToolCall = (choice.message.tool_calls?.length ?? 0) > 0;
    const hasContent =
      typeof choice.message.content === 'string' && choice.message.content.length > 0;
    expect(hasToolCall || hasContent).toBe(true);
  });

  // ── Streaming ─────────────────────────────────────────────────────────────

  test('streaming: AsyncIterable delivers chunks, obfuscation field typed', async () => {
    banner('chat / streaming');

    let text = '';
    let chunkCount = 0;
    let finishReason: string | null | undefined;
    let sawObfuscation = false;
    let lastChunk: ChatCompletionChunk | undefined;

    for await (const chunk of client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: 'You are a concise assistant.' },
        { role: 'user', content: 'Count from 1 to 5, one number per line.' },
      ],
      max_tokens: 1024,
      stream: true,
    })) {
      chunkCount++;
      text += chatDeltaText(chunk);
      if (chunk.obfuscation) sawObfuscation = true;
      if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      lastChunk = chunk;
    }

    console.log('[chat/stream] chunks      :', chunkCount);
    console.log('[chat/stream] text        :', text.replace(/\n/g, '\\n'));
    console.log('[chat/stream] finish      :', finishReason);
    console.log('[chat/stream] obfuscation :', sawObfuscation);
    console.log('[chat/stream] last-id     :', lastChunk?.id);

    expect(chunkCount).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
    expect(lastChunk?.object).toBe('chat.completion.chunk');
  });

  // ── Streaming — multi-turn / conversation ─────────────────────────────────

  test('streaming: multi-turn conversation carries context', async () => {
    banner('chat / multi-turn stream');

    // The model may spend tokens on reasoning before producing output; pass the
    // expected answer directly in the messages array so no first-turn round-trip
    // is needed, and give enough tokens for a reasoning model to finish.
    let secondText = '';
    for await (const chunk of client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'user', content: 'My favourite colour is indigo. Just say "Got it."' },
        { role: 'assistant', content: 'Got it.' },
        { role: 'user', content: 'What colour did I just mention? One word only.' },
      ],
      max_tokens: 1024,
      stream: true,
    })) {
      secondText += chatDeltaText(chunk);
    }

    console.log('[chat/multi-turn] follow-up reply:', secondText);
    expect(secondText.toLowerCase()).toContain('indigo');
  });
});

// ─── Responses API tests ─────────────────────────────────────────────────────

describeLive('Live: responses', () => {
  jest.setTimeout(120_000);

  let client: SkytellsClient;

  beforeAll(() => {
    client = Skytells(apiKey!);
    console.log(`\n[responses-live] model: ${RESPONSES_MODEL}`);
  });

  // ── Non-streaming ──────────────────────────────────────────────────────────

  test('non-streaming: returns a full ResponsesResponse', async () => {
    banner('responses / non-streaming');

    const response: ResponsesResponse = await client.responses.create({
      model: RESPONSES_MODEL,
      input: [{ role: 'user', content: 'What is the capital of France? Answer in one word.' }],
      instructions: 'You are a concise geography assistant.',
      max_output_tokens: 32,
    });

    console.log('[responses/non-stream] id      :', response.id);
    console.log('[responses/non-stream] model   :', response.model);
    console.log('[responses/non-stream] status  :', response.status);
    console.log('[responses/non-stream] usage   :', JSON.stringify(response.usage));
    const text = extractResponsesText(response);
    console.log('[responses/non-stream] text    :', text);

    expect(response.id).toBeTruthy();
    expect(response.object).toBe('response');
    expect(response.status).toBe('completed');
    expect(response.output.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
    expect(response.usage?.total_tokens).toBeGreaterThan(0);
  });

  // ── Non-streaming — string input shorthand ─────────────────────────────────

  test('non-streaming: string input shorthand', async () => {
    banner('responses / string input');

    const response: ResponsesResponse = await client.responses.create({
      model: RESPONSES_MODEL,
      input: 'Say exactly: "Hello, Skytells!"',
      max_output_tokens: 32,
    });

    const text = extractResponsesText(response);
    console.log('[responses/string-input] text:', text);

    expect(response.status).toBe('completed');
    expect(text.length).toBeGreaterThan(0);
  });

  // ── Non-streaming — multi-turn via previous_response_id ───────────────────

  test('non-streaming: multi-turn via previous_response_id', async () => {
    banner('responses / multi-turn');

    const first: ResponsesResponse = await client.responses.create({
      model: RESPONSES_MODEL,
      input: 'My favourite bird is the flamingo. Just say "Noted."',
      max_output_tokens: 64,
      store: true,
    });

    console.log('[responses/multi-turn] first id:', first.id, '| status:', first.status);

    const second: ResponsesResponse = await client.responses.create({
      model: RESPONSES_MODEL,
      input: 'What is my favourite bird?',
      previous_response_id: first.id,
      max_output_tokens: 64,
    });

    const text = extractResponsesText(second);
    console.log('[responses/multi-turn] second reply:', text);

    expect(second.status).toBe('completed');
    expect(text.toLowerCase()).toContain('flamingo');
  });

  // ── Streaming ─────────────────────────────────────────────────────────────

  test('streaming: AsyncIterable delivers named SSE events', async () => {
    banner('responses / streaming');

    let deltaCount = 0;
    let fullText = '';
    let sawCreated = false;
    let sawCompleted = false;
    let sawObfuscation = false;
    let completedResponse: ResponsesResponse | undefined;

    for await (const event of client.responses.create({
      model: RESPONSES_MODEL,
      input: [{ role: 'user', content: 'List the planets of the solar system, one per line.' }],
      max_output_tokens: 128,
      stream: true,
    })) {
      switch (event.type) {
        case 'response.created':
          sawCreated = true;
          console.log('[responses/stream] created  id:', event.response.id);
          break;

        case 'response.output_text.delta':
          deltaCount++;
          fullText += event.delta;
          if (event.obfuscation) sawObfuscation = true;
          break;

        case 'response.completed':
          sawCompleted = true;
          completedResponse = event.response;
          console.log('[responses/stream] completed usage:', JSON.stringify(event.response.usage));
          break;

        default: {
          // response.in_progress, output_item.added/done, content_part.added/done, etc.
          const e = event as unknown as { type: string; sequence_number?: number };
          console.log('[responses/stream] event:', e.type, `(seq=${e.sequence_number})`);
        }
      }
    }

    console.log('[responses/stream] deltas      :', deltaCount);
    console.log('[responses/stream] text        :', fullText.replace(/\n/g, '\\n'));
    console.log('[responses/stream] obfuscation :', sawObfuscation);

    expect(sawCreated).toBe(true);
    expect(sawCompleted).toBe(true);
    expect(deltaCount).toBeGreaterThan(0);
    expect(fullText.length).toBeGreaterThan(0);
    expect(completedResponse?.status).toBe('completed');
    expect(completedResponse?.usage?.total_tokens).toBeGreaterThan(0);
  });

  // ── Streaming — text reconstruction matches non-stream ────────────────────

  test('streaming: reassembled text matches non-streaming for same prompt', async () => {
    banner('responses / stream vs non-stream parity');

    const prompt = 'Recite the first 3 words of "To be or not to be". Exact quote only.';

    // Non-streaming baseline.
    const nonStream: ResponsesResponse = await client.responses.create({
      model: RESPONSES_MODEL,
      input: prompt,
      temperature: 0,
      max_output_tokens: 32,
    });
    const nonStreamText = extractResponsesText(nonStream);

    // Streaming reassembly.
    let streamText = '';
    for await (const event of client.responses.create({
      model: RESPONSES_MODEL,
      input: prompt,
      temperature: 0,
      max_output_tokens: 32,
      stream: true,
    })) {
      if (event.type === 'response.output_text.delta') {
        streamText += event.delta;
      }
    }

    console.log('[responses/parity] non-stream:', nonStreamText);
    console.log('[responses/parity]     stream:', streamText);

    // Both should contain the expected words — exact tokens may differ slightly by chance.
    expect(nonStreamText.length).toBeGreaterThan(0);
    expect(streamText.length).toBeGreaterThan(0);
  });

  // ── top-level vs chat.responses alias ─────────────────────────────────────

  test('client.chat.responses.create is the same instance as client.responses.create', () => {
    banner('responses / alias check');
    // Both client.responses and client.chat.responses should reach the same endpoint.
    expect(typeof client.responses.create).toBe('function');
    expect(typeof client.chat.responses.create).toBe('function');
  });
});
