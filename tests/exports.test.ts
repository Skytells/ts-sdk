import Skytells, {
  SkytellsClient,
  Prediction,
  PredictionsAPI,
  ModelsAPI,
  SkytellsError,
  createClient,
  API_BASE_URL,
  ORCHESTRATOR_BASE_URL,
  Orchestrator,
  Chat,
  Completions,
  Responses,
  Embeddings,
  Safety,
  resolvePredictionResourceUrl,
  PREFETCHED_MODEL_CACHE_TTL_MS,
  PREFETCHED_MODEL_CACHE_MAX_SLUGS,
  EDGE_DEFAULT_REQUEST_TIMEOUT_MS,
  EDGE_PREFETCH_MAX_SLUGS,
  HTTP_DEFAULT_REQUEST_TIMEOUT_MS,
  Webhook,
  WebhookEvent,
  WebhookListener,
  createWebhookListener,
  verifySkytellsWebhookSignature,
  SKYTELLS_WEBHOOK_SIGNATURE_HEADER,
} from '../src';
import { PredictionStatus, PredictionType } from '../src/types/predict.types';
import { ApiErrorId } from '../src/types/shared.types';

describe('Exports', () => {
  test('default export is the Skytells function', () => {
    expect(typeof Skytells).toBe('function');
  });

  test('createClient is exported and logs a one-time migration hint', () => {
    jest.isolateModules(() => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createClient: isolatedCreate } = require('../src');
      expect(typeof isolatedCreate).toBe('function');
      isolatedCreate('sk-test');
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/import Skytells from/));
      warn.mockRestore();
    });
    expect(typeof createClient).toBe('function');
  });

  test('SkytellsClient class is exported', () => {
    expect(SkytellsClient).toBeDefined();
  });

  test('SkytellsClient.prediction aliases .predictions', () => {
    const client = Skytells('sk-test');
    expect(client.prediction).toBe(client.predictions);
  });

  test('SkytellsClient.webhookListener returns WebhookListener', () => {
    const client = Skytells('sk-test');
    const hooks = client.webhookListener({ mode: 'general' });
    expect(hooks).toBeInstanceOf(WebhookListener);
  });

  test('SkytellsClient.listen aliases webhookListener', () => {
    const client = Skytells('sk-test');
    expect(client.listen()).toBeInstanceOf(WebhookListener);
  });

  test('webhook module exports', () => {
    expect(WebhookEvent.COMPLETED).toBe('completed');
    expect(SKYTELLS_WEBHOOK_SIGNATURE_HEADER).toBe('x-skytells-signature');
    expect(typeof verifySkytellsWebhookSignature).toBe('function');
    expect(typeof createWebhookListener).toBe('function');
    expect(new Webhook('https://a', [WebhookEvent.FAILED]).toJSON().events).toEqual(['failed']);
  });

  test('Prediction class is exported', () => {
    expect(Prediction).toBeDefined();
  });

  test('PredictionsAPI class is exported', () => {
    expect(PredictionsAPI).toBeDefined();
  });

  test('ModelsAPI class is exported', () => {
    expect(ModelsAPI).toBeDefined();
  });

  test('SkytellsError class is exported', () => {
    expect(SkytellsError).toBeDefined();
  });

  test('API_BASE_URL is exported', () => {
    expect(API_BASE_URL).toBe('https://api.skytells.ai/v1');
  });

  test('Orchestrator base URL and class are exported', () => {
    expect(ORCHESTRATOR_BASE_URL).toBe('https://orchestrator.skytells.ai');
    expect(Orchestrator).toBeDefined();
  });

  test('resolvePredictionResourceUrl is exported', () => {
    expect(typeof resolvePredictionResourceUrl).toBe('function');
    const u = resolvePredictionResourceUrl(
      'get',
      'abc',
      { get: 'https://x.test/p' },
      'https://api.skytells.ai/v1',
    );
    expect(u).toBe('https://x.test/p');
  });

  test('PREFETCHED_MODEL_CACHE_TTL_MS is exported (10 minutes)', () => {
    expect(PREFETCHED_MODEL_CACHE_TTL_MS).toBe(10 * 60 * 1000);
  });

  test('PREFETCHED_MODEL_CACHE_MAX_SLUGS is exported', () => {
    expect(PREFETCHED_MODEL_CACHE_MAX_SLUGS).toBe(64);
  });

  test('runtime / HTTP timing constants are exported', () => {
    expect(EDGE_DEFAULT_REQUEST_TIMEOUT_MS).toBe(25_000);
    expect(EDGE_PREFETCH_MAX_SLUGS).toBe(16);
    expect(HTTP_DEFAULT_REQUEST_TIMEOUT_MS).toBe(60_000);
  });

  test('prediction / API enums are exported with expected string values', () => {
    expect(PredictionStatus.SUCCEEDED).toBe('succeeded');
    expect(PredictionType.INFERENCE).toBe('inference');
    expect(ApiErrorId.SDK_ERROR).toBe('SDK_ERROR');
  });

  test('Inference API classes are exported', () => {
    expect(Chat).toBeDefined();
    expect(Completions).toBeDefined();
    expect(Responses).toBeDefined();
    expect(Embeddings).toBeDefined();
    expect(Safety).toBeDefined();
  });
});
