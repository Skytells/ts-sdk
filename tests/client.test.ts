import { createClient, SkytellsClient } from '../src';
import { API_BASE_URL } from '../src/endpoints';

// Mock fetch
global.fetch = jest.fn();

describe('SkytellsClient', () => {
  let client: SkytellsClient;
  const mockApiKey = 'test-api-key';
  
  beforeEach(() => {
    jest.resetAllMocks();
    client = createClient(mockApiKey);
    
    // Default mock response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: jest.fn().mockReturnValue('application/json')
      },
      json: jest.fn().mockResolvedValue({ status: true, id: 'test-id' })
    });
  });

  test('should initialize client with API key', () => {
    expect(client).toBeInstanceOf(SkytellsClient);
  });

  test('should be able to create client without API key', () => {
    const unauthenticatedClient = createClient();
    expect(unauthenticatedClient).toBeInstanceOf(SkytellsClient);
  });

  test('should make predict request with correct parameters', async () => {
    const payload = {
      model: 'test-model',
      input: { prompt: 'test prompt' }
    };

    await client.predict(payload);

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/predict`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-api-key': mockApiKey
        }),
        body: JSON.stringify(payload)
      })
    );
  });

  test('should handle error responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 422,
      headers: {
        get: jest.fn().mockReturnValue('application/json')
      },
      json: jest.fn().mockResolvedValue({
        status: false, 
        response: "The input field is required.",
        error: {
          http_status: 422,
          message: "The input field is required.",
          details: "The input field is required.",
          error_id: "VALIDATION_ERROR"
        }
      })
    });

    try {
      await client.listModels();
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.errorId).toBe('VALIDATION_ERROR');
      expect(error.httpStatus).toBe(422);
    }
  });
}); 