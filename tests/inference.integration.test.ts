/**
 * Live integration tests against api.skytells.ai.
 *
 * Requires a real API key. Do not commit keys.
 *
 *   SKYTELLS_API_KEY=sk-... npm run test:integration
 *
 * Optional (defaults match Skytells integration defaults):
 *   SKYTELLS_CHAT_MODEL=deepbrain-router
 *   SKYTELLS_PREDICTION_MODEL=truefusion
 *   SKYTELLS_EMBEDDING_MODEL=your-embedding-model-slug
 *
 * Excluded from default `npm test` (see jest.config.cjs) so unit tests that mock
 * `fetch` do not break this suite.
 *
 * Request/response logging (stdout):
 *   Enabled by default. Disable: SKYTELLS_INTEGRATION_LOG=0 npm run test:integration
 *
 * Quick demo (prediction id + chat id/message), always prints banners:
 *   npm run test:integration -- -t "demo: visible ids"
 */

import Skytells from '../src';
import { API_BASE_URL, ENDPOINTS } from '../src/endpoints';
import type { SkytellsClient } from '../src';
import { SkytellsError } from '../src/types/shared.types';
import { SafetyTemplates } from '../src/types/inference.types';
import { PredictionStatus } from '../src/types/predict.types';
import type { Model } from '../src/types/model.types';
import { ModelType } from '../src/types/model.types';

/** Default models for this integration suite (Skytells-recommended test slugs). */
const DEFAULT_CHAT_MODEL = 'deepbrain-router';
const DEFAULT_PREDICTION_MODEL = 'truefusion';

const apiKey = process.env.SKYTELLS_API_KEY;
const CHAT_MODEL = process.env.SKYTELLS_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;

/**
 * Pick a model for POST /predict: env override, else `truefusion` if listed, else first non–OpenAI-compatible catalog model.
 */
function resolvePredictionModelSlug(models: readonly Model[]): string | undefined {
  const env = process.env.SKYTELLS_PREDICTION_MODEL?.trim();
  if (env) {
    const match = models.find((m) => m.namespace === env);
    if (match && match.metadata?.openai_compatible === true) {
      console.warn(
        `[integration] SKYTELLS_PREDICTION_MODEL=${env} is OpenAI-compatible; use chat.completions or pass { compatibilityCheck: true } as the second argument to predict()/predictions.create() to get SDK_ERROR early. Pick a non-chat model for predict().`,
      );
    }
    return env;
  }

  if (models.some((m) => m.namespace === DEFAULT_PREDICTION_MODEL)) {
    return DEFAULT_PREDICTION_MODEL;
  }

  const forPredict = models.filter((m) => m.metadata?.openai_compatible !== true);
  const preferred =
    forPredict.find((m) => m.type === ModelType.IMAGE || m.type === ModelType.VIDEO) ??
    forPredict.find((m) => m.type === ModelType.MULTIMODAL) ??
    forPredict.find((m) => m.type === ModelType.AUDIO || m.type === ModelType.MUSIC) ??
    forPredict[0];

  return preferred?.namespace;
}

const describeLive = apiKey ? describe : describe.skip;

/** Print request/response to console during integration runs (set `SKYTELLS_INTEGRATION_LOG=0` to hide). */
const VERBOSE = process.env.SKYTELLS_INTEGRATION_LOG !== '0';

function logLine(...args: unknown[]) {
  if (!VERBOSE) return;
  console.log('[integration]', ...args);
}

function logJson(label: string, data: unknown) {
  if (!VERBOSE) return;
  const summarized = summarizeEmbeddingsForLog(data);
  try {
    console.log(`[integration] ${label}\n`, JSON.stringify(summarized, null, 2));
  } catch {
    console.log(`[integration] ${label}`, summarized);
  }
}

/** Shorten huge embedding vectors in logged JSON. */
function summarizeEmbeddingsForLog(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const clone = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  if (clone.data && Array.isArray(clone.data)) {
    clone.data = (clone.data as Record<string, unknown>[]).map((item) => {
      if (item && typeof item.embedding === 'object' && Array.isArray(item.embedding)) {
        const arr = item.embedding as number[];
        return {
          ...item,
          embedding: `[${arr.length} dimensions] sample: [${arr.slice(0, 4).join(', ')}${arr.length > 4 ? ', …' : ''}]`,
        };
      }
      return item;
    });
  }
  return clone;
}

describeLive('Integration: Skytells API (live)', () => {
  let client: SkytellsClient;

  beforeAll(() => {
    client = Skytells(apiKey!);
    logLine(`Base URL: ${API_BASE_URL} (verbose logging: ${VERBOSE ? 'on' : 'off'})`);
  });

  test('models.list returns non-empty array', async () => {
    logLine(`REQ GET ${API_BASE_URL}${ENDPOINTS.MODELS}`);
    const models = await client.models.list();
    logJson(`RES GET ${ENDPOINTS.MODELS} (first 3 slugs)`, {
      count: models.length,
      sample: models.slice(0, 3).map((m) => ({ namespace: m.namespace, type: m.type })),
    });
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('namespace');
  });

  describe('predictions', () => {
    let predictionSlug: string | undefined;

    beforeAll(async () => {
      const models = await client.models.list();
      predictionSlug = resolvePredictionModelSlug(models);
      if (!predictionSlug) {
        console.warn(
          '[integration] No prediction model resolved; set SKYTELLS_PREDICTION_MODEL or ensure catalog has a non–OpenAI-compatible model.',
        );
      }
    });

    test('predictions.create returns a prediction id (background job)', async () => {
      if (!predictionSlug) {
        expect(true).toBe(true);
        return;
      }

      const predBody = {
        model: predictionSlug,
        input: { prompt: 'integration test tiny icon, minimal' },
      };
      logLine(`REQ POST ${API_BASE_URL}${ENDPOINTS.PREDICT}`);
      logJson('  body', predBody);
      const created = await client.predictions.create(predBody);

      logJson(`RES POST ${ENDPOINTS.PREDICT}`, {
        id: created.id,
        status: created.status,
        type: created.type,
        model: created.model,
        response: created.response,
      });
      expect(created.id).toBeDefined();
      expect(typeof created.id).toBe('string');
      expect(Object.values(PredictionStatus)).toContain(created.status);
    });

    test('predictions.get round-trips after create', async () => {
      if (!predictionSlug) {
        expect(true).toBe(true);
        return;
      }

      const predBody = { model: predictionSlug, input: { prompt: 'integration test' } };
      logLine(`REQ POST ${API_BASE_URL}${ENDPOINTS.PREDICT}`);
      logJson('  body', predBody);
      const created = await client.predictions.create(predBody);

      logJson(`RES POST ${ENDPOINTS.PREDICT}`, { id: created.id, status: created.status });

      logLine(`REQ GET ${API_BASE_URL}${ENDPOINTS.PREDICTION_BY_ID(created.id)}`);
      const fetched = await client.predictions.get(created.id);
      logJson(`RES GET ${ENDPOINTS.PREDICTION_BY_ID(':id')}`, {
        id: fetched.id,
        status: fetched.status,
        model: fetched.model,
      });
      expect(fetched.id).toBe(created.id);
      expect(fetched.model?.name ?? fetched.status).toBeDefined();
    });
  });

  describe('chat (completions)', () => {
    test('non-streaming: returns ChatCompletion shape', async () => {
      const chatBody = {
        model: CHAT_MODEL,
        messages: [{ role: 'user' as const, content: 'Say the word ok and nothing else.' }],
        max_tokens: 16,
      };
      logLine(`REQ POST ${API_BASE_URL}${ENDPOINTS.CHAT_COMPLETIONS}`);
      logJson('  body', chatBody);
      const completion = await client.chat.completions.create(chatBody);

      logJson(`RES POST ${ENDPOINTS.CHAT_COMPLETIONS}`, {
        id: completion.id,
        object: completion.object,
        model: completion.model,
        choices: completion.choices?.map((c) => ({
          index: c.index,
          finish_reason: c.finish_reason,
          message: c.message,
        })),
        usage: completion.usage,
      });
      expect(completion.object).toBe('chat.completion');
      expect(completion.choices?.length).toBeGreaterThan(0);
      expect(completion.choices[0].message).toBeDefined();
    });

    test('streaming: yields chunks with choices', async () => {
      const chatBody = {
        model: CHAT_MODEL,
        messages: [{ role: 'user' as const, content: 'Say hi.' }],
        stream: true as const,
        max_tokens: 32,
      };
      logLine(`REQ POST ${API_BASE_URL}${ENDPOINTS.CHAT_COMPLETIONS} (stream SSE)`);
      logJson('  body', chatBody);
      const stream = await client.chat.completions.create(chatBody);

      let sawChoice = false;
      let chunkIndex = 0;
      const chunkSamples: unknown[] = [];
      for await (const chunk of stream) {
        if (chunkIndex < 5) {
          chunkSamples.push({
            object: chunk.object,
            choices: chunk.choices?.map((c) => ({
              index: c.index,
              delta: c.delta,
              finish_reason: c.finish_reason,
            })),
          });
        }
        chunkIndex += 1;
        if (chunk.object) {
          expect(chunk.object).toBe('chat.completion.chunk');
        }
        if (chunk.choices?.length) {
          sawChoice = true;
          break;
        }
      }
      logJson(`RES SSE ${ENDPOINTS.CHAT_COMPLETIONS} (first chunks)`, {
        chunksIterated: chunkIndex,
        stoppedEarly: sawChoice,
        sample: chunkSamples,
      });
      expect(sawChoice).toBe(true);
    });
  });

  describe('responses', () => {
    test('chat.responses.create — success JSON or SkytellsError', async () => {
      const resBody = { model: CHAT_MODEL, input: 'Hello' };
      logLine(`REQ POST ${API_BASE_URL}${ENDPOINTS.RESPONSES}`);
      logJson('  body', resBody);
      try {
        const out = await client.chat.responses.create(resBody as Record<string, unknown>);
        logJson(`RES POST ${ENDPOINTS.RESPONSES}`, out);
        expect(out).toBeDefined();
      } catch (e) {
        logJson('RES error (SkytellsError)', {
          message: e instanceof Error ? e.message : e,
          ...(e instanceof SkytellsError
            ? {
                errorId: e.errorId,
                details: e.details,
                httpStatus: e.httpStatus,
                requestId: e.requestId,
              }
            : {}),
        });
        expect(e).toBeInstanceOf(SkytellsError);
        const err = e as SkytellsError;
        expect(err.errorId).toBeDefined();
        expect(typeof err.httpStatus).toBe('number');
      }
    });
  });

  describe('embeddings', () => {
    test('embeddings.create returns embedding vectors (set SKYTELLS_EMBEDDING_MODEL if this is skipped)', async () => {
      const models = await client.models.list();
      const fromCatalog = models.find(
        (m) =>
          m.capabilities?.some((c) => /embed/i.test(String(c))) ||
          /embed/i.test(m.namespace) ||
          /embed/i.test(m.name),
      )?.namespace;

      const envModel = process.env.SKYTELLS_EMBEDDING_MODEL;
      const candidates = [
        ...new Set([envModel, fromCatalog].filter((s): s is string => Boolean(s))),
      ];

      let lastErr: unknown;
      for (const model of candidates) {
        try {
          const embBody = { model, input: 'integration test' };
          logLine(`REQ POST ${API_BASE_URL}${ENDPOINTS.EMBEDDINGS}`);
          logJson('  body', embBody);
          const res = await client.embeddings.create(embBody);
          logJson(`RES POST ${ENDPOINTS.EMBEDDINGS}`, summarizeEmbeddingsForLog(res));
          expect(res.object).toBe('list');
          expect(res.data?.length).toBeGreaterThan(0);
          expect(Array.isArray(res.data[0].embedding)).toBe(true);
          expect(res.data[0].embedding.length).toBeGreaterThan(0);
          return;
        } catch (e) {
          lastErr = e;
        }
      }

      if (envModel) {
        throw new Error(
          `embeddings.create failed for SKYTELLS_EMBEDDING_MODEL=${envModel}: ${lastErr}`,
        );
      }

      console.warn(
        '[integration] Embeddings not run: no embedding model in catalog. Set SKYTELLS_EMBEDDING_MODEL to your account slug.',
      );
      expect(true).toBe(true);
    });
  });

  describe('safety', () => {
    test('checkText returns SafetyCheckResult', async () => {
      logLine(`REQ POST ${API_BASE_URL}${ENDPOINTS.CHAT_COMPLETIONS} (via safety.checkText)`);
      logJson('  body (conceptual)', {
        messages: [{ role: 'user', content: '…' }],
        max_tokens: 16,
      });
      const result = await client.safety.checkText('Hello, this is a neutral message.');
      logJson('RES safety.checkText', {
        passed: result.passed,
        failedCategories: result.failedCategories,
        template: result.template,
      });
      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.failedCategories)).toBe(true);
    });

    test('evaluate(text) returns SafetyEvaluationResult', async () => {
      logLine('safety.evaluate (uses chat completions internally for text)');
      const result = await client.safety.evaluate('Short benign text.', SafetyTemplates.MINIMAL);
      logJson('RES safety.evaluate', {
        passed: result.passed,
        template: result.template,
        failedCategories: result.failedCategories,
        detailsAnyFiltered: result.details?.anyFiltered,
      });
      expect(typeof result.passed).toBe('boolean');
      expect(result.details).toBeDefined();
      expect(typeof result.details.anyFiltered).toBe('boolean');
    });
  });

  /**
   * Single place to see prediction `id` + chat completion in one run.
   *   SKYTELLS_API_KEY=sk-... npm run test:integration -- -t "demo: visible ids"
   */
  describe('demo: visible ids (prediction + chat)', () => {
    test('prints prediction id from create and chat completion id + message', async () => {
      const models = await client.models.list();
      const predictionSlug = resolvePredictionModelSlug(models);
      if (!predictionSlug) {
        console.warn(
          '[integration] Skip demo: no prediction model slug; set SKYTELLS_PREDICTION_MODEL',
        );
        expect(true).toBe(true);
        return;
      }

      const created = await client.predictions.create({
        model: predictionSlug,
        input: { prompt: 'integration demo: reply with one word' },
      });

      // Printed even when SKYTELLS_INTEGRATION_LOG=0 so you always see the demo lines
      console.log('\n========== PREDICTION (predictions.create) ==========');
      console.log('prediction id:', created.id);
      console.log('prediction status:', created.status);
      console.log('======================================================\n');

      const completion = await client.chat.completions.create({
        model: CHAT_MODEL,
        messages: [{ role: 'user', content: 'Say the word ok and nothing else.' }],
        max_tokens: 24,
      });

      console.log('\n========== CHAT (chat.completions.create) ==========');
      console.log('chat completion id:', completion.id);
      console.log('model:', completion.model);
      console.log(
        'assistant message:',
        completion.choices?.[0]?.message?.content ?? '(no content)',
      );
      console.log('====================================================\n');

      expect(created.id).toBeDefined();
      expect(typeof created.id).toBe('string');
      expect(completion.id).toBeDefined();
      expect(completion.choices?.[0]?.message).toBeDefined();
    });
  });
});

describe('Integration suite guard', () => {
  test('documents how to run live tests', () => {
    expect(true).toBe(true);
    if (!process.env.SKYTELLS_API_KEY) {
      console.info('[integration] Skipped: set SKYTELLS_API_KEY and run: npm run test:integration');
    }
  });
});
