import Skytells, { SkytellsError, ORCHESTRATOR_BASE_URL } from '../src';

function jsonResponse(data: unknown) {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(data),
  };
}

describe('Orchestrator', () => {
  test('orchestrator getter throws without orchestratorApiKey', () => {
    const client = Skytells('sk-test');
    expect(() => client.orchestrator).toThrow(SkytellsError);
    try {
      void client.orchestrator;
    } catch (e) {
      expect(e).toBeInstanceOf(SkytellsError);
      expect((e as SkytellsError).errorId).toBe('SDK_ERROR');
    }
  });

  test('strips x-api-key from shared ClientOptions.headers on Orchestrator requests', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ executionId: 'exec_1', status: 'running' }));
    const client = Skytells('sk-main', {
      orchestratorApiKey: 'wfb_secret',
      headers: { 'x-api-key': 'sk-should-not-reach-orchestrator' },
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.orchestrator.webhooks.execute('wf_abc', {});
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const h = new Headers(init.headers);
    expect(h.get('x-api-key')).toBeNull();
    expect(h.get('Authorization')).toBe('Bearer wfb_secret');
  });

  test('main Skytells requests still use sk key when orchestratorApiKey is set', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => '[]',
      })
      .mockResolvedValueOnce(jsonResponse({ executionId: 'e', status: 'running' }));
    const client = Skytells('sk-main-key', {
      orchestratorApiKey: 'wfb_orch',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.models.list();
    await client.orchestrator.webhooks.execute('wf', {});
    const hMain = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    const hOrch = new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers);
    expect(hMain.get('x-api-key')).toBe('sk-main-key');
    expect(hMain.get('Authorization')).toBe('Bearer sk-main-key');
    expect(hOrch.get('x-api-key')).toBeNull();
    expect(hOrch.get('Authorization')).toBe('Bearer wfb_orch');
  });

  test('webhooks.execute uses Bearer orchestrator key only (no x-api-key)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ executionId: 'exec_1', status: 'running' }));
    const client = Skytells('sk-main', {
      orchestratorApiKey: 'wfb_secret',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await client.orchestrator.webhooks.execute('wf_abc', { foo: 1 });
    expect(res.executionId).toBe('exec_1');
    expect(fetchMock).toHaveBeenCalledWith(
      `${ORCHESTRATOR_BASE_URL}/api/workflows/wf_abc/webhook`,
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const h = new Headers(init.headers);
    expect(h.get('Authorization')).toBe('Bearer wfb_secret');
    expect(h.get('x-api-key')).toBeNull();
  });

  test('respects orchestratorBaseUrl', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse([]));
    const client = Skytells(undefined, {
      orchestratorApiKey: 'wfb_x',
      orchestratorBaseUrl: 'https://orch.example.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.orchestrator.workflows.list();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://orch.example.test/api/workflows',
      expect.any(Object),
    );
  });

  test('workflows.update uses PATCH', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = Skytells('sk', {
      orchestratorApiKey: 'wfb_x',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.orchestrator.workflows.update('wf_1', { name: 'N' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${ORCHESTRATOR_BASE_URL}/api/workflows/wf_1`,
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
