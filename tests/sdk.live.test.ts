/**
 * Simple live SDK smoke test (real API).
 *
 *   SKYTELLS_API_KEY=sk-... npm run test:sdk-live
 *
 * Models (fixed):
 *   Prediction: FLUX.2-pro
 *   Chat:       deepbrain-router
 *
 * Note: `client.prediction` is an alias for `client.predictions` (same `.create()` / `.get()` / `.list()`).
 */

import Skytells from '../src';
import type { SkytellsClient } from '../src';
import type { ChatCompletionChunk, ChatCompletionChunkChoice } from '../src/types/inference.types';
import { PredictionStatus } from '../src/types/predict.types';

/** Merge stream deltas — handles string `content` and array content parts `{ text }` (some routers). */
function mergeStreamDeltas(chunks: ChatCompletionChunk[]): string {
  let merged = '';
  for (const chunk of chunks) {
    for (const ch of chunk.choices ?? []) {
      merged += deltaTextFromChoice(ch);
    }
  }
  return merged;
}

function deltaTextFromChoice(ch: ChatCompletionChunkChoice): string {
  const d = ch.delta as Record<string, unknown> | undefined;
  if (!d) return '';
  const c = d.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    let s = '';
    for (const part of c) {
      if (part && typeof part === 'object' && part !== null && 'text' in part) {
        const t = (part as { text?: unknown }).text;
        if (typeof t === 'string') s += t;
      }
    }
    return s;
  }
  if (typeof d.refusal === 'string' && d.refusal) return d.refusal;
  return '';
}

/** Prediction model slug */
const PREDICTION_MODEL = 'FLUX.2-pro';
/** Chat model slug */
const CHAT_MODEL = 'deepbrain-router';

/**
 * `deepbrain-router` may use part of the budget before the worker model streams text.
 * Too-low `max_tokens` yields `finish_reason: length` with empty `message.content`.
 */
const CHAT_MAX_TOKENS = 512;

const apiKey = process.env.SKYTELLS_API_KEY;
const describeLive = apiKey ? describe : describe.skip;

function banner(title: string) {
  console.log(`\n${'='.repeat(12)} ${title} ${'='.repeat(12)}`);
}

describeLive('SDK live (simple)', () => {
  jest.setTimeout(300_000);

  let client: SkytellsClient;

  beforeAll(() => {
    client = Skytells(apiKey!);
  });

  test('models.list', async () => {
    banner('models.list');
    const models = await client.models.list();
    console.log('count:', models.length);
    expect(models.length).toBeGreaterThan(0);
  });

  test('prediction: client.prediction.create — id + output (wait until done or timeout)', async () => {
    banner('client.prediction.create');
    const created = await client.prediction.create({
      model: PREDICTION_MODEL,
      input: { prompt: 'a tiny red circle on white background, flat icon' },
    });

    console.log('id:', created.id);
    console.log('status (create):', created.status);
    if (created.output != null) {
      console.log('output (create):', created.output);
    }

    const done = await client.wait(created, {
      interval: 5_000,
      maxWait: 240_000,
    });

    console.log('status (final):', done.status);
    if (done.output != null) {
      console.log('output:', done.output);
    } else {
      console.log('output: (none)');
    }
    expect(done.id).toBe(created.id);
  });

  test('prediction: client.predict({ await: true }) — server blocks until terminal', async () => {
    banner('client.predict await:true');
    const result = await client.predict({
      model: PREDICTION_MODEL,
      input: { prompt: 'minimal blue square icon, flat' },
      await: true,
    });

    console.log('id:', result.id);
    console.log('status:', result.status);
    if (result.output != null) {
      console.log('output:', result.output);
    } else {
      console.log('output: (none)');
    }

    expect(result.id).toBeDefined();
    expect([
      PredictionStatus.SUCCEEDED,
      PredictionStatus.FAILED,
      PredictionStatus.CANCELLED,
    ] as const).toContain(result.status);
  });

  test('chat: first choice (non-streaming)', async () => {
    banner('chat (non-stream)');
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: 'Reply with exactly one word: ok' }],
      max_tokens: CHAT_MAX_TOKENS,
    });

    const first = completion.choices?.[0];
    const text = first?.message?.content ?? '';
    console.log('completion id:', completion.id);
    console.log('first choice:', JSON.stringify(first, null, 2));
    console.log('assistant text (trimmed):', JSON.stringify(text.trim()));
    expect(first?.message).toBeDefined();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('chat: streaming — full choices parsed + merged text', async () => {
    banner('chat (stream)');
    const stream = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: 'Count from 1 to 3 separated by commas. Be brief.' }],
      stream: true,
      max_tokens: CHAT_MAX_TOKENS,
    });

    const chunks: ChatCompletionChunk[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const merged = mergeStreamDeltas(chunks);

    console.log('chunk count:', chunks.length);
    console.log(
      'parsed choices (all chunks):',
      JSON.stringify(
        chunks.map((c) => ({
          id: c.id,
          choices: (c.choices ?? []).map((ch) => ({
            index: ch.index,
            delta: ch.delta,
            finish_reason: ch.finish_reason,
          })),
        })),
        null,
        2,
      ),
    );
    console.log('merged assistant text:', JSON.stringify(merged));
    expect(chunks.length).toBeGreaterThan(0);
    expect(merged.trim().length).toBeGreaterThan(0);
  });
});

describe('SDK live guard', () => {
  test('run with SKYTELLS_API_KEY', () => {
    if (!process.env.SKYTELLS_API_KEY) {
      console.info('Skipped sdk.live: set SKYTELLS_API_KEY and run: npm run test:sdk-live');
    }
    expect(true).toBe(true);
  });
});
