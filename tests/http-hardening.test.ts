import { HTTP, HTTP_DEFAULT_REQUEST_TIMEOUT_MS } from '../src/http';
import { API_BASE_URL } from '../src/endpoints';
import { SkytellsError } from '../src/types/shared.types';

describe('HTTP hardening', () => {
  test('non-JSON-serializable body throws SDK_ERROR', async () => {
    const fetchMock = jest.fn();
    const http = new HTTP(
      'sk-test',
      API_BASE_URL,
      HTTP_DEFAULT_REQUEST_TIMEOUT_MS,
      {},
      { retries: 0 },
      fetchMock as unknown as typeof fetch,
    );
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(http.request('POST', '/predict', circular)).rejects.toMatchObject({
      errorId: 'SDK_ERROR',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('negative retries clamp to single attempt', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () =>
        JSON.stringify({
          error: { message: 'err', error_id: 'E', status: 500 },
        }),
    });
    const http = new HTTP(
      'sk-test',
      API_BASE_URL,
      HTTP_DEFAULT_REQUEST_TIMEOUT_MS,
      {},
      { retries: -3, retryOn: [500] },
      fetchMock as unknown as typeof fetch,
    );
    await expect(http.request('GET', '/models')).rejects.toBeInstanceOf(SkytellsError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
