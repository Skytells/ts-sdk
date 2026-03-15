import { Skytells, SkytellsClient, Prediction, PredictionsAPI, ModelsAPI } from '../src';
import { API_BASE_URL } from '../src/endpoints';
import { SkytellsError } from '../src/types/shared.types';
import { PredictionStatus } from '../src/types/predict.types';

// Mock fetch
global.fetch = jest.fn();

// ─── Helpers ──────────────────────────────────────────────────────────

function mockFetch(data: any, options: { ok?: boolean; status?: number; contentType?: string } = {}) {
  const { ok = true, status = 200, contentType = 'application/json' } = options;
  (global.fetch as jest.Mock).mockResolvedValue({
    ok,
    status,
    headers: { get: jest.fn().mockReturnValue(contentType) },
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(JSON.stringify(data)),
    clone: jest.fn().mockReturnValue({
      text: jest.fn().mockResolvedValue(JSON.stringify(data)),
    }),
  });
}

function mockFetchSequence(responses: Array<{ data: any; ok?: boolean; status?: number }>) {
  const mock = global.fetch as jest.Mock;
  responses.forEach((r) => {
    mock.mockResolvedValueOnce({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      headers: { get: jest.fn().mockReturnValue('application/json') },
      json: jest.fn().mockResolvedValue(r.data),
      text: jest.fn().mockResolvedValue(JSON.stringify(r.data)),
      clone: jest.fn().mockReturnValue({
        text: jest.fn().mockResolvedValue(JSON.stringify(r.data)),
      }),
    });
  });
}

function makePredictionResponse(overrides: Record<string, any> = {}): any {
  return {
    status: PredictionStatus.SUCCEEDED,
    id: 'pred_123',
    type: 'inference',
    stream: false,
    input: { prompt: 'a cat' },
    output: ['https://example.com/image.png'],
    created_at: '2026-01-01T00:00:00Z',
    started_at: '2026-01-01T00:00:01Z',
    completed_at: '2026-01-01T00:00:05Z',
    updated_at: '2026-01-01T00:00:05Z',
    privacy: 'public',
    ...overrides,
  };
}

// ─── SkytellsClient instantiation ─────────────────────────────────────

describe('SkytellsClient', () => {
  let client: SkytellsClient;
  const API_KEY = 'sk-test-key';

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells(API_KEY);
  });

  test('Skytells() returns a SkytellsClient instance', () => {
    expect(client).toBeInstanceOf(SkytellsClient);
  });

  test('works without an API key', () => {
    const unauthClient = Skytells();
    expect(unauthClient).toBeInstanceOf(SkytellsClient);
  });

  test('exposes models sub-API', () => {
    expect(client.models).toBeInstanceOf(ModelsAPI);
  });

  test('exposes predictions sub-API', () => {
    expect(client.predictions).toBeInstanceOf(PredictionsAPI);
  });
});

// ─── client.predict() ─────────────────────────────────────────────────

describe('client.predict()', () => {
  let client: SkytellsClient;
  const API_KEY = 'sk-test-key';

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells(API_KEY);
  });

  test('sends POST to /predict with payload', async () => {
    const responseData = makePredictionResponse();
    mockFetch(responseData);

    await client.predict({
      model: 'flux-pro',
      input: { prompt: 'a cat' },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/predict`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        }),
      }),
    );

    // Verify body contains the payload
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe('flux-pro');
    expect(body.input.prompt).toBe('a cat');
  });

  test('returns the prediction response', async () => {
    const responseData = makePredictionResponse();
    mockFetch(responseData);

    const result = await client.predict({
      model: 'flux-pro',
      input: { prompt: 'a cat' },
    });

    expect(result.id).toBe('pred_123');
    expect(result.status).toBe(PredictionStatus.SUCCEEDED);
  });

  test('includes await flag when set', async () => {
    mockFetch(makePredictionResponse());

    await client.predict({
      model: 'flux-pro',
      input: { prompt: 'a cat' },
      await: true,
    });

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.await).toBe(true);
  });
});

// ─── client.run() ─────────────────────────────────────────────────────

describe('client.run()', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  test('returns a Prediction object on success', async () => {
    mockFetch(makePredictionResponse());

    const prediction = await client.run('flux-pro', { input: { prompt: 'a cat' } });

    expect(prediction).toBeInstanceOf(Prediction);
    expect(prediction.id).toBe('pred_123');
    expect(prediction.status).toBe(PredictionStatus.SUCCEEDED);
  });

  test('sends await:true when no onProgress callback', async () => {
    mockFetch(makePredictionResponse());

    await client.run('flux-pro', { input: { prompt: 'test' } });

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.await).toBe(true);
  });

  test('polls with onProgress callback', async () => {
    jest.useFakeTimers();

    const pending = makePredictionResponse({ status: PredictionStatus.PENDING, output: undefined });
    const processing = makePredictionResponse({ status: PredictionStatus.PROCESSING, output: undefined });
    const succeeded = makePredictionResponse({ status: PredictionStatus.SUCCEEDED });

    mockFetchSequence([
      { data: pending },
      { data: processing },
      { data: succeeded },
    ]);

    const progressCalls: any[] = [];
    const promise = client.run(
      'flux-pro',
      { input: { prompt: 'a cat' } },
      (p) => progressCalls.push(p),
    );

    // Advance through both polling cycles
    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(5000);

    const prediction = await promise;

    expect(prediction).toBeInstanceOf(Prediction);
    expect(progressCalls.length).toBe(2); // processing + succeeded

    jest.useRealTimers();
  });

  test('throws SkytellsError when prediction fails', async () => {
    const failedResponse = makePredictionResponse({
      status: PredictionStatus.FAILED,
      response: 'Model inference error',
      output: undefined,
    });
    mockFetch(failedResponse);

    await expect(
      client.run('flux-pro', { input: { prompt: 'fail test' } }),
    ).rejects.toThrow(SkytellsError);

    try {
      mockFetch(failedResponse);
      await client.run('flux-pro', { input: { prompt: 'fail test' } });
    } catch (e: any) {
      expect(e.errorId).toBe('PREDICTION_FAILED');
    }
  });
});

// ─── client.wait() ────────────────────────────────────────────────────

describe('client.wait()', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  test('returns immediately if prediction is already terminal', async () => {
    const data = makePredictionResponse({ status: PredictionStatus.SUCCEEDED });

    const result = await client.wait(data);

    expect(result.status).toBe(PredictionStatus.SUCCEEDED);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('polls until succeeded', async () => {
    const initial = makePredictionResponse({ status: PredictionStatus.PROCESSING, output: undefined });

    mockFetchSequence([
      { data: makePredictionResponse({ status: PredictionStatus.PROCESSING, output: undefined }) },
      { data: makePredictionResponse({ status: PredictionStatus.SUCCEEDED }) },
    ]);

    const result = await client.wait(initial, { interval: 10 });
    expect(result.status).toBe(PredictionStatus.SUCCEEDED);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('invokes onProgress on each poll', async () => {
    const initial = makePredictionResponse({ status: PredictionStatus.PENDING, output: undefined });

    mockFetchSequence([
      { data: makePredictionResponse({ status: PredictionStatus.PROCESSING, output: undefined }) },
      { data: makePredictionResponse({ status: PredictionStatus.SUCCEEDED }) },
    ]);

    const callbacks: any[] = [];
    await client.wait(initial, { interval: 10 }, (p) => callbacks.push(p.status));

    expect(callbacks).toEqual([PredictionStatus.PROCESSING, PredictionStatus.SUCCEEDED]);
  });

  test('throws WAIT_TIMEOUT when maxWait exceeded', async () => {
    const initial = makePredictionResponse({ status: PredictionStatus.PROCESSING, output: undefined });

    // Never resolves to terminal — keep returning processing
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue('application/json') },
      json: jest.fn().mockResolvedValue(
        makePredictionResponse({ status: PredictionStatus.PROCESSING, output: undefined }),
      ),
    });

    await expect(
      client.wait(initial, { interval: 10, maxWait: 50 }),
    ).rejects.toThrow(SkytellsError);

    try {
      await client.wait(initial, { interval: 10, maxWait: 50 });
    } catch (e: any) {
      expect(e.errorId).toBe('WAIT_TIMEOUT');
    }
  });

  test('stops polling on cancelled status', async () => {
    const initial = makePredictionResponse({ status: PredictionStatus.PENDING, output: undefined });

    mockFetchSequence([
      { data: makePredictionResponse({ status: PredictionStatus.CANCELLED, output: undefined }) },
    ]);

    const result = await client.wait(initial, { interval: 10 });
    expect(result.status).toBe(PredictionStatus.CANCELLED);
  });

  test('stops polling on failed status', async () => {
    const initial = makePredictionResponse({ status: PredictionStatus.PENDING, output: undefined });

    mockFetchSequence([
      { data: makePredictionResponse({ status: PredictionStatus.FAILED, output: undefined }) },
    ]);

    const result = await client.wait(initial, { interval: 10 });
    expect(result.status).toBe(PredictionStatus.FAILED);
  });
});

// ─── client.queue() & client.dispatch() ───────────────────────────────

describe('client.queue() & client.dispatch()', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  test('queue() does not make any API calls', () => {
    client.queue({ model: 'flux-pro', input: { prompt: 'Cat' } });
    client.queue({ model: 'flux-pro', input: { prompt: 'Dog' } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('dispatch() sends all queued predictions concurrently', async () => {
    const r1 = makePredictionResponse({ id: 'pred_1' });
    const r2 = makePredictionResponse({ id: 'pred_2' });
    mockFetchSequence([{ data: r1 }, { data: r2 }]);

    client.queue({ model: 'flux-pro', input: { prompt: 'Cat' } });
    client.queue({ model: 'flux-pro', input: { prompt: 'Dog' } });

    const results = await client.dispatch();

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('pred_1');
    expect(results[1].id).toBe('pred_2');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('dispatch() clears the queue', async () => {
    mockFetch(makePredictionResponse());
    client.queue({ model: 'flux-pro', input: { prompt: 'Cat' } });
    await client.dispatch();

    jest.resetAllMocks();
    mockFetch(makePredictionResponse());
    const results = await client.dispatch();
    expect(results).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('dispatch() with empty queue returns empty array', async () => {
    const results = await client.dispatch();
    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─── client.streamPrediction() ────────────────────────────────────────

describe('client.streamPrediction()', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  test('sends GET to /predictions/:id/stream', async () => {
    const responseData = makePredictionResponse({
      urls: { stream: 'https://stream.example.com/pred_123' },
    });
    mockFetch(responseData);

    const result = await client.streamPrediction('pred_123');

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/predictions/pred_123/stream`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.urls?.stream).toBe('https://stream.example.com/pred_123');
  });
});

// ─── client.cancelPrediction() ────────────────────────────────────────

describe('client.cancelPrediction()', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  test('sends POST to /predictions/:id/cancel', async () => {
    mockFetch(makePredictionResponse({ status: PredictionStatus.CANCELLED }));

    const result = await client.cancelPrediction('pred_123');

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/predictions/pred_123/cancel`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.status).toBe(PredictionStatus.CANCELLED);
  });
});

// ─── client.deletePrediction() ────────────────────────────────────────

describe('client.deletePrediction()', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  test('sends DELETE to /predictions/:id/delete', async () => {
    mockFetch(makePredictionResponse());

    await client.deletePrediction('pred_123');

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/predictions/pred_123/delete`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

// ─── Prediction class ─────────────────────────────────────────────────

describe('Prediction', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  async function makePrediction(overrides: Record<string, any> = {}): Promise<Prediction> {
    mockFetch(makePredictionResponse(overrides));
    return client.run('flux-pro', { input: { prompt: 'test' } });
  }

  test('.id returns the prediction ID', async () => {
    const p = await makePrediction({ id: 'pred_abc' });
    expect(p.id).toBe('pred_abc');
  });

  test('.status returns the prediction status', async () => {
    const p = await makePrediction({ status: PredictionStatus.SUCCEEDED });
    expect(p.status).toBe(PredictionStatus.SUCCEEDED);
  });

  test('.response returns the full PredictionResponse', async () => {
    const p = await makePrediction();
    expect(p.response).toBeDefined();
    expect(p.response.id).toBe('pred_123');
    expect(p.response.status).toBe(PredictionStatus.SUCCEEDED);
  });

  // ── output getter ────────────────────────────────────

  test('.output returns string[] when API returns array', async () => {
    const p = await makePrediction({ output: ['https://img1.png', 'https://img2.png'] });
    expect(p.output).toEqual(['https://img1.png', 'https://img2.png']);
  });

  test('.output returns string when API returns string', async () => {
    const p = await makePrediction({ output: 'https://single.png' });
    expect(p.output).toBe('https://single.png');
  });

  test('.output returns undefined when no output', async () => {
    const p = await makePrediction({ output: undefined });
    expect(p.output).toBeUndefined();
  });

  // ── outputs() method ─────────────────────────────────

  test('.outputs() unwraps single-element array to string', async () => {
    const p = await makePrediction({ output: ['https://single.png'] });
    expect(p.outputs()).toBe('https://single.png');
    expect(typeof p.outputs()).toBe('string');
  });

  test('.outputs() keeps multi-element array as array', async () => {
    const p = await makePrediction({ output: ['https://a.png', 'https://b.png'] });
    const result = p.outputs();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(['https://a.png', 'https://b.png']);
  });

  test('.outputs() returns string when output is string', async () => {
    const p = await makePrediction({ output: 'hello world' });
    expect(p.outputs()).toBe('hello world');
  });

  test('.outputs() returns undefined when output is undefined', async () => {
    const p = await makePrediction({ output: undefined });
    expect(p.outputs()).toBeUndefined();
  });

  // ── raw() method ──────────────────────────────────────

  test('.raw() returns the full PredictionResponse', async () => {
    const p = await makePrediction({ id: 'pred_raw' });
    const raw = p.raw();
    expect(raw.id).toBe('pred_raw');
    expect(raw.status).toBe(PredictionStatus.SUCCEEDED);
    expect(raw.input).toEqual({ prompt: 'a cat' });
  });

  // ── cancel() ──────────────────────────────────────────

  test('.cancel() sends POST to cancel endpoint', async () => {
    const p = await makePrediction({ id: 'pred_cancel' });
    jest.resetAllMocks();
    mockFetch(makePredictionResponse({ id: 'pred_cancel', status: PredictionStatus.CANCELLED }));

    const result = await p.cancel();

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/predictions/pred_cancel/cancel`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.status).toBe(PredictionStatus.CANCELLED);
  });

  // ── delete() ──────────────────────────────────────────

  test('.delete() sends DELETE to delete endpoint', async () => {
    const p = await makePrediction({ id: 'pred_del' });
    jest.resetAllMocks();
    mockFetch(makePredictionResponse({ id: 'pred_del' }));

    await p.delete();

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/predictions/pred_del/delete`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

// ─── PredictionsAPI ───────────────────────────────────────────────────

describe('PredictionsAPI', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  test('.create() sends POST to /predict with await:false', async () => {
    mockFetch(makePredictionResponse({ status: PredictionStatus.PENDING }));

    const result = await client.predictions.create({
      model: 'flux-pro',
      input: { prompt: 'a cat' },
    });

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.await).toBe(false);
    expect(result.status).toBe(PredictionStatus.PENDING);
  });

  test('.get() sends GET to /predictions/:id', async () => {
    mockFetch(makePredictionResponse({ id: 'pred_get' }));

    const result = await client.predictions.get('pred_get');

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/predictions/pred_get`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.id).toBe('pred_get');
  });

  test('.list() sends GET to /predictions', async () => {
    const paginatedResponse = {
      data: [makePredictionResponse()],
      pagination: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    };
    mockFetch(paginatedResponse);

    const result = await client.predictions.list();

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/predictions`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.pagination.current_page).toBe(1);
  });

  test('.list() builds query params from options', async () => {
    mockFetch({ data: [], pagination: { current_page: 2, per_page: 20, total: 0, last_page: 1 } });

    await client.predictions.list({
      page: 2,
      since: '2026-01-01',
      until: '2026-03-15',
      model: 'flux-pro',
    });

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('from=2026-01-01');
    expect(calledUrl).toContain('to=2026-03-15');
    expect(calledUrl).toContain('model=flux-pro');
  });
});

// ─── ModelsAPI ────────────────────────────────────────────────────────

describe('ModelsAPI', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  test('.list() sends GET to /models', async () => {
    const models = [{ name: 'flux-pro', namespace: 'flux-pro', type: 'image' }];
    mockFetch(models);

    const result = await client.models.list();

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/models`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('flux-pro');
  });

  test('.list() appends fields query parameter', async () => {
    mockFetch([]);

    await client.models.list({ fields: ['input_schema', 'output_schema'] });

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(calledUrl).toContain('fields=input_schema,output_schema');
  });

  test('.get() sends GET to /model/:slug', async () => {
    const model = { name: 'flux-pro', namespace: 'flux-pro', type: 'image' };
    mockFetch(model);

    const result = await client.models.get('flux-pro');

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/model/flux-pro`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.name).toBe('flux-pro');
  });

  test('.get() appends fields query parameter', async () => {
    mockFetch({ name: 'flux-pro' });

    await client.models.get('flux-pro', { fields: ['input_schema'] });

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(calledUrl).toContain('fields=input_schema');
  });
});

// ─── Error handling ───────────────────────────────────────────────────

describe('Error handling', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  test('structured API error is thrown as SkytellsError', async () => {
    mockFetch(
      {
        status: false,
        response: 'The input field is required.',
        error: {
          http_status: 422,
          message: 'The input field is required.',
          details: 'The input field is required.',
          error_id: 'VALIDATION_ERROR',
        },
      },
      { ok: false, status: 422 },
    );

    try {
      await client.models.list();
      fail('Expected SkytellsError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(SkytellsError);
      expect(e.errorId).toBe('VALIDATION_ERROR');
      expect(e.httpStatus).toBe(422);
      expect(e.message).toBe('The input field is required.');
    }
  });

  test('simple error response is thrown as SkytellsError', async () => {
    mockFetch(
      { status: false, response: 'Unauthorized' },
      { ok: false, status: 401 },
    );

    try {
      await client.models.list();
      fail('Expected SkytellsError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(SkytellsError);
      expect(e.errorId).toBe('API_ERROR');
      expect(e.httpStatus).toBe(401);
    }
  });

  test('non-JSON response throws SERVER_ERROR', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: jest.fn().mockReturnValue('text/html') },
      text: jest.fn().mockResolvedValue('<html>Bad Gateway</html>'),
    });

    try {
      await client.models.list();
      fail('Expected SkytellsError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(SkytellsError);
      expect(e.errorId).toBe('SERVER_ERROR');
    }
  });

  test('generic HTTP error without error body', async () => {
    mockFetch({}, { ok: false, status: 500 });

    try {
      await client.models.list();
      fail('Expected SkytellsError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(SkytellsError);
      expect(e.errorId).toBe('HTTP_ERROR');
      expect(e.httpStatus).toBe(500);
    }
  });

  test('network error throws NETWORK_ERROR', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('fetch failed'));

    try {
      await client.models.list();
      fail('Expected SkytellsError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(SkytellsError);
      expect(e.errorId).toBe('NETWORK_ERROR');
    }
  });

  test('timeout error throws REQUEST_TIMEOUT', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValue(abortError);

    try {
      await client.models.list();
      fail('Expected SkytellsError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(SkytellsError);
      expect(e.errorId).toBe('REQUEST_TIMEOUT');
      expect(e.httpStatus).toBe(408);
    }
  });
});

// ─── Retry logic ──────────────────────────────────────────────────────

describe('Retry logic', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('retries on retryable status codes', async () => {
    const client = Skytells('sk-test', { retry: { retries: 2, retryDelay: 10 } });

    // 1st: 500, 2nd: 500, 3rd: 200
    const mock = global.fetch as jest.Mock;
    mock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue({
          status: false,
          error: { http_status: 500, message: 'Server error', details: '', error_id: 'INTERNAL_ERROR' },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue({
          status: false,
          error: { http_status: 500, message: 'Server error', details: '', error_id: 'INTERNAL_ERROR' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue([{ name: 'flux-pro' }]),
      });

    const result = await client.models.list();
    expect(mock).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(1);
  });

  test('does not retry on non-retryable status codes', async () => {
    const client = Skytells('sk-test', { retry: { retries: 2, retryDelay: 10 } });

    mockFetch(
      {
        status: false,
        error: { http_status: 422, message: 'Bad input', details: '', error_id: 'VALIDATION_ERROR' },
      },
      { ok: false, status: 422 },
    );

    await expect(client.models.list()).rejects.toThrow(SkytellsError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ─── Custom options ───────────────────────────────────────────────────

describe('Client options', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('custom headers are sent with requests', async () => {
    const client = Skytells('sk-test', {
      headers: { 'X-Custom': 'value' },
    });
    mockFetch([]);

    await client.models.list();

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    expect(callArgs[1].headers['X-Custom']).toBe('value');
  });

  test('custom fetch function is used', async () => {
    const customFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue('application/json') },
      json: jest.fn().mockResolvedValue([]),
    });

    const client = Skytells('sk-test', { fetch: customFetch as any });
    await client.models.list();

    expect(customFetch).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('custom baseUrl is used', async () => {
    const client = Skytells('sk-test', { baseUrl: 'https://custom.api.com/v2' });
    mockFetch([]);

    await client.models.list();

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(calledUrl).toContain('https://custom.api.com/v2');
  });

  test('no API key means no x-api-key header', async () => {
    const client = Skytells();
    mockFetch([]);

    await client.models.list();

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    expect(callArgs[1].headers['x-api-key']).toBeUndefined();
  });
});

// ─── Deprecated methods ───────────────────────────────────────────────

describe('Deprecated methods', () => {
  let client: SkytellsClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = Skytells('sk-test');
  });

  test('listModels() delegates to models.list()', async () => {
    mockFetch([{ name: 'flux-pro' }]);
    const result = await client.listModels();
    expect(result).toHaveLength(1);
  });

  test('getModel() delegates to models.get()', async () => {
    mockFetch({ name: 'flux-pro' });
    const result = await client.getModel('flux-pro');
    expect(result.name).toBe('flux-pro');
  });

  test('listPredictions() delegates to predictions.list()', async () => {
    mockFetch({ data: [], pagination: { current_page: 1, per_page: 20, total: 0, last_page: 1 } });
    const result = await client.listPredictions();
    expect(result.data).toEqual([]);
  });

  test('getPrediction() delegates to predictions.get()', async () => {
    mockFetch(makePredictionResponse({ id: 'pred_dep' }));
    const result = await client.getPrediction('pred_dep');
    expect(result.id).toBe('pred_dep');
  });
}); 