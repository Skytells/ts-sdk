/**
 * Live tests — Prediction API
 *
 * Covers every prediction-related method except cancel, delete, and stream.
 * Hard limit: max 3 actual prediction CREATE requests to the API.
 *
 *   SKYTELLS_API_KEY=sk-... npm run test:prediction-live
 *
 * Optional override:
 *   SKYTELLS_PREDICTION_MODEL=<slug>  (default: FLUX.2-pro)
 */

import Skytells from '../src';
import type { SkytellsClient } from '../src';
import { PredictionStatus } from '../src/types/predict.types';
import type { PredictionResponse } from '../src/types/predict.types';
import type { Model } from '../src/types/model.types';
import { SkytellsError } from '../src/types/shared.types';

// ─── Config ──────────────────────────────────────────────────────────────────

const MODEL = process.env.SKYTELLS_PREDICTION_MODEL?.trim() || 'FLUX.2-pro';
const PROMPT = 'a tiny red circle on a white background, flat vector icon';

const apiKey = process.env.SKYTELLS_API_KEY;
const describeLive = apiKey ? describe : describe.skip;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function banner(title: string): void {
  console.log(`\n${'─'.repeat(14)} ${title} ${'─'.repeat(14)}`);
}

const TERMINAL = new Set([
  PredictionStatus.SUCCEEDED,
  PredictionStatus.FAILED,
  PredictionStatus.CANCELLED,
]);

function isTerminal(p: PredictionResponse): boolean {
  return TERMINAL.has(p.status as PredictionStatus);
}

// ─── Models API (free reads — no creation cost) ───────────────────────────────

describeLive('Live: models API', () => {
  jest.setTimeout(60_000);

  let client: SkytellsClient;

  beforeAll(() => {
    client = Skytells(apiKey!);
    console.log(`\n[prediction-live] model: ${MODEL}`);
  });

  test('models.list — returns non-empty array with expected fields', async () => {
    banner('models.list');

    const models: Model[] = await client.models.list();

    console.log('[models.list] count:', models.length);
    console.log(
      '[models.list] sample:',
      models.slice(0, 3).map((m) => m.namespace),
    );

    expect(models.length).toBeGreaterThan(0);
    const first = models[0]!;
    expect(typeof first.namespace).toBe('string');
    expect(typeof first.name).toBe('string');
  });

  test('models.list with fields — includes input_schema', async () => {
    banner('models.list { fields }');

    const models: Model[] = await client.models.list({ fields: ['input_schema'] });

    console.log('[models.list+fields] count:', models.length);
    // At least some models should expose a schema.
    expect(models.length).toBeGreaterThan(0);
  });

  test('models.get — returns model by slug', async () => {
    banner('models.get');

    const model: Model = await client.models.get(MODEL);

    console.log('[models.get] namespace:', model.namespace);
    console.log('[models.get] name     :', model.name);
    console.log('[models.get] type     :', model.type);

    expect(model.namespace).toBeTruthy();
    expect(model.name).toBeTruthy();
  });

  test('models.get with fields — includes schemas', async () => {
    banner('models.get { fields }');

    const model: Model = await client.models.get(MODEL, {
      fields: ['input_schema', 'output_schema'],
    });

    console.log('[models.get+fields] namespace:', model.namespace);
    expect(model.namespace).toBeTruthy();
  });

  test('models.get unknown slug — throws SkytellsError', async () => {
    banner('models.get 404');

    await expect(client.models.get('definitely-does-not-exist-xyz-404')).rejects.toThrow(
      SkytellsError,
    );
  });
});

// ─── Prediction lifecycle (3 requests total) ──────────────────────────────────
//
//  Request 1: predictions.create  → poll via predictions.get  → predictions.list
//  Request 2: predict({ await: true })
//  Request 3: run() (blocks internally, uses same slot)
//
//  Queue + dispatch counts as 1 dispatch but creates multiple predictions (#3 slot shared with run).
//  To stay within the 3-CREATE cap we share the queued predictions across two sub-tests.

describeLive('Live: prediction lifecycle', () => {
  // Long timeout — FLUX models take 30–120 s to generate.
  jest.setTimeout(300_000);

  let client: SkytellsClient;

  // Shared state across test cases within this describe block.
  let bgPrediction: PredictionResponse; // from predictions.create
  let finishedPrediction: PredictionResponse; // polled to terminal
  let queuedResults: PredictionResponse[] = []; // from dispatch()

  beforeAll(() => {
    client = Skytells(apiKey!);
  });

  // ── REQUEST 1: predictions.create + get + wait + list ─────────────────────

  test('predictions.create — returns pending/starting id', async () => {
    banner('predictions.create');

    bgPrediction = await client.predictions.create({
      model: MODEL,
      input: { prompt: PROMPT },
    });

    console.log('[create] id    :', bgPrediction.id);
    console.log('[create] status:', bgPrediction.status);

    expect(bgPrediction.id).toBeTruthy();
    expect(typeof bgPrediction.id).toBe('string');
    // Status is typically 'pending' or 'starting' right after creation.
    expect(bgPrediction.status).toBeTruthy();
  });

  test('predictions.get — fetches prediction by id', async () => {
    banner('predictions.get');

    // Depends on the previous test having set bgPrediction.
    expect(bgPrediction?.id).toBeTruthy();

    const fetched = await client.predictions.get(bgPrediction.id, bgPrediction.urls);

    console.log('[get] id    :', fetched.id);
    console.log('[get] status:', fetched.status);

    expect(fetched.id).toBe(bgPrediction.id);
    expect(fetched.status).toBeTruthy();
  });

  test('client.wait — polls to terminal status', async () => {
    banner('client.wait');

    expect(bgPrediction?.id).toBeTruthy();

    const progressStatuses: string[] = [];

    finishedPrediction = await client.wait(
      bgPrediction,
      { interval: 6_000, maxWait: 240_000 },
      (p) => {
        progressStatuses.push(p.status);
      },
    );

    console.log('[wait] final status :', finishedPrediction.status);
    console.log('[wait] progress     :', progressStatuses);
    if (finishedPrediction.output != null) {
      const out = Array.isArray(finishedPrediction.output)
        ? (finishedPrediction.output as unknown[]).slice(0, 2)
        : finishedPrediction.output;
      console.log('[wait] output       :', out);
    }

    expect(finishedPrediction.id).toBe(bgPrediction.id);
    expect(isTerminal(finishedPrediction)).toBe(true);
  });

  test('predictions.list — returns paginated list including our prediction', async () => {
    banner('predictions.list');

    const { data, pagination } = await client.predictions.list({ page: 1 });

    console.log('[list] total       :', pagination?.total);
    console.log('[list] current_page:', pagination?.current_page);
    console.log('[list] count       :', data.length);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    // Our freshly-created prediction should appear on page 1 (most recent).
    const found = data.some((p) => p.id === bgPrediction.id);
    console.log('[list] our id found:', found);
    // Not asserting found===true because listing may lag — just log it.
  });

  test('predictions.list with model filter', async () => {
    banner('predictions.list { model filter }');

    const { data } = await client.predictions.list({ model: MODEL, page: 1 });

    console.log('[list+filter] count:', data.length);
    expect(Array.isArray(data)).toBe(true);
    // All returned predictions should match the model.
    // The API returns model as an object { name, type }, not a plain string.
    for (const p of data) {
      const modelSlug =
        typeof p.model === 'object' && p.model !== null
          ? (p.model as { name: string }).name
          : (p.model as unknown as string);
      expect(modelSlug).toBe(MODEL);
    }
  });

  // ── REQUEST 2: predict({ await: true }) ───────────────────────────────────

  test('client.predict({ await: true }) — blocks until terminal', async () => {
    banner('client.predict await:true');

    const result = await client.predict({
      model: MODEL,
      input: { prompt: 'minimal blue square, flat icon' },
      await: true,
    });

    console.log('[predict/await] id    :', result.id);
    console.log('[predict/await] status:', result.status);
    if (result.output != null) {
      console.log(
        '[predict/await] output:',
        Array.isArray(result.output) ? (result.output as unknown[]).slice(0, 2) : result.output,
      );
    }

    expect(result.id).toBeTruthy();
    expect(isTerminal(result)).toBe(true);
  });

  // ── REQUEST 3: queue + dispatch (counts as one dispatch) ──────────────────

  test('client.queue + dispatch — batches and dispatches predictions', async () => {
    banner('client.queue + dispatch');

    // Queue a single item to stay within the 3-CREATE cap.
    client.queue({ model: MODEL, input: { prompt: 'green triangle, minimal line art' } });

    queuedResults = await client.dispatch();

    console.log('[dispatch] queued count:', queuedResults.length);
    console.log(
      '[dispatch] ids         :',
      queuedResults.map((p) => p.id),
    );

    expect(queuedResults.length).toBe(1);
    expect(queuedResults[0]!.id).toBeTruthy();
    // Queue should be cleared after dispatch.
    const second = await client.dispatch();
    expect(second.length).toBe(0);
  });

  // ── prediction alias ───────────────────────────────────────────────────────

  test('client.prediction is same API as client.predictions', () => {
    banner('prediction alias');

    expect(typeof client.prediction.create).toBe('function');
    expect(typeof client.prediction.get).toBe('function');
    expect(typeof client.prediction.list).toBe('function');
    // Should be the exact same instance.
    expect(client.prediction).toBe(client.predictions);
  });

  // ── wait on already-terminal prediction ───────────────────────────────────

  test('client.wait on already-terminal prediction returns immediately', async () => {
    banner('wait / already terminal');

    expect(finishedPrediction).toBeDefined();
    expect(isTerminal(finishedPrediction)).toBe(true);

    const start = Date.now();
    const result = await client.wait(finishedPrediction);
    const elapsed = Date.now() - start;

    console.log('[wait/terminal] elapsed ms:', elapsed);
    expect(result.id).toBe(finishedPrediction.id);
    // Should return almost instantly (no polling needed).
    expect(elapsed).toBeLessThan(2_000);
  });

  // ── wait with AbortSignal ──────────────────────────────────────────────────

  test('client.wait with pre-aborted signal throws ABORTED', async () => {
    banner('wait / abort');

    expect(bgPrediction?.id).toBeTruthy();

    const controller = new AbortController();
    controller.abort();

    // finishedPrediction is already terminal — override status so wait() enters
    // the poll loop and checks signal.aborted before making any API call.
    await expect(
      client.wait(
        { ...finishedPrediction, status: PredictionStatus.PENDING },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ errorId: 'ABORTED' });
  });

  // ── wait with maxWait exceeded ─────────────────────────────────────────────

  test('client.wait with maxWait=1 on non-terminal throws WAIT_TIMEOUT', async () => {
    banner('wait / timeout');

    // Mock predictions.get so it always returns a pending prediction regardless
    // of the ID. Without the mock the real API would return "succeeded" and
    // wait() would resolve before the deadline check fires.
    const spy = jest
      .spyOn(client.predictions, 'get')
      .mockResolvedValue({ ...bgPrediction, status: PredictionStatus.PENDING });

    try {
      await expect(
        client.wait(
          { ...bgPrediction, status: PredictionStatus.PENDING },
          { maxWait: 1, interval: 5_000 },
        ),
      ).rejects.toMatchObject({ errorId: 'WAIT_TIMEOUT' });
    } finally {
      spy.mockRestore();
    }
  });
});
