import { createHmac } from 'crypto';
import {
  Webhook,
  WebhookEvent,
  WebhookListener,
  verifySkytellsWebhookSignature,
  webhookRoutesForPrediction,
  SKYTELLS_WEBHOOK_SIGNATURE_HEADER,
} from '../src/webhooks';
import { PredictionStatus, PredictionType } from '../src/types/predict.types';
import { Skytells } from '../src';
import { API_BASE_URL } from '../src/endpoints';

describe('Webhook', () => {
  test('toJSON() returns API-shaped payload', () => {
    const w = new Webhook('https://example.com/hook', [
      WebhookEvent.COMPLETED,
      WebhookEvent.FAILED,
    ]);
    expect(w.toJSON()).toEqual({
      url: 'https://example.com/hook',
      events: ['completed', 'failed'],
    });
  });
});

describe('verifySkytellsWebhookSignature', () => {
  test('general mode accepts valid HMAC-SHA256 hex', async () => {
    const raw = '{"id":"p1","status":"succeeded"}';
    const apiKey = 'sk-test-key';
    const expected = createHmac('sha256', apiKey).update(raw, 'utf8').digest('hex');
    await expect(
      verifySkytellsWebhookSignature(raw, expected, { mode: 'general', apiKey }),
    ).resolves.toBe(true);
  });

  test('rejects wrong signature', async () => {
    const raw = '{}';
    await expect(
      verifySkytellsWebhookSignature(raw, 'deadbeef', { mode: 'general', apiKey: 'sk-x' }),
    ).resolves.toBe(false);
  });

  test('enterprise mode uses secret', async () => {
    const raw = '{"x":1}';
    const secret = 'whsec_enterprise';
    const sig = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
    await expect(
      verifySkytellsWebhookSignature(raw, sig, { mode: 'enterprise', secret }),
    ).resolves.toBe(true);
  });
});

describe('WebhookListener', () => {
  test('handle verifies and dispatches to matching routes', async () => {
    const raw = JSON.stringify({
      id: 'pred_x',
      status: PredictionStatus.SUCCEEDED,
      type: PredictionType.INFERENCE,
      stream: false,
      input: {},
      created_at: '2026-01-01T00:00:00Z',
      started_at: '2026-01-01T00:00:01Z',
      completed_at: '2026-01-01T00:00:05Z',
      updated_at: '2026-01-01T00:00:05Z',
      privacy: 'public',
    });
    const apiKey = 'sk-listener';
    const sig = createHmac('sha256', apiKey).update(raw, 'utf8').digest('hex');

    const listener = new WebhookListener({ mode: 'general', apiKey });
    const completed: string[] = [];
    const succeeded: string[] = [];
    const star: string[] = [];

    listener.on(WebhookEvent.COMPLETED, (p) => {
      completed.push(p.id);
    });
    listener.on('prediction.succeeded', (p) => {
      succeeded.push(p.id);
    });
    listener.on('*', (p) => {
      star.push(p.id);
    });

    await listener.handle(raw, { [SKYTELLS_WEBHOOK_SIGNATURE_HEADER]: sig });

    expect(completed).toEqual(['pred_x']);
    expect(succeeded).toEqual(['pred_x']);
    expect(star).toEqual(['pred_x']);
  });

  test('handle throws WEBHOOK_SIGNATURE_INVALID when verify fails', async () => {
    const listener = new WebhookListener({ mode: 'general', apiKey: 'sk-a' });
    listener.on('*', () => {});
    await expect(
      listener.handle('{}', { [SKYTELLS_WEBHOOK_SIGNATURE_HEADER]: 'bad' }),
    ).rejects.toMatchObject({
      errorId: 'WEBHOOK_SIGNATURE_INVALID',
    });
  });
});

describe('webhookRoutesForPrediction', () => {
  test('includes status and mapped event', () => {
    const routes = webhookRoutesForPrediction({
      id: '1',
      status: PredictionStatus.SUCCEEDED,
      type: PredictionType.INFERENCE,
      stream: false,
      input: {},
      created_at: '',
      started_at: '',
      completed_at: '',
      updated_at: '',
      privacy: 'public',
    });
    expect(routes).toContain('completed');
    expect(routes).toContain('prediction.succeeded');
    expect(routes).toContain('*');
  });
});

describe('predictions.create with Webhook instance', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  test('serializes Webhook to JSON body (no class in POST)', async () => {
    const predBody = JSON.stringify({
      id: 'p1',
      status: 'pending',
      type: 'inference',
      stream: false,
      input: {},
      created_at: '',
      started_at: '',
      completed_at: '',
      updated_at: '',
      privacy: 'public',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(JSON.parse(predBody)),
      text: () => Promise.resolve(predBody),
    });

    const client = Skytells('sk-x');
    await client.predictions.create({
      model: 'flux-pro',
      input: { prompt: 'x' },
      webhook: new Webhook('https://hook.example/skytells', [WebhookEvent.COMPLETED]),
    });

    const predictCall = (global.fetch as jest.Mock).mock.calls.find(
      (c) =>
        c[1]?.body != null &&
        String(c[0]).includes(`${API_BASE_URL}/predict`) &&
        !String(c[0]).includes('/predictions'),
    );
    expect(predictCall).toBeDefined();
    const body = JSON.parse((predictCall![1] as RequestInit).body as string);
    expect(body.webhook).toEqual({ url: 'https://hook.example/skytells', events: ['completed'] });
    expect(body.webhook).not.toHaveProperty('options');
  });
});
