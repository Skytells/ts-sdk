# Skytells JavaScript/TypeScript SDK

The official JavaScript/TypeScript SDK for interacting with the [Skytells](https://skytells.ai) API. Edge-compatible with Cloudflare Pages, Vercel Edge Functions, and more.

## Installation

```bash
npm install skytells
# or
yarn add skytells
# or
pnpm add skytells
```

## Quick Start

```typescript
import { createClient } from 'skytells';

// Initialize the client with your API key
const skytells = createClient('your-api-key-here');

// Make a prediction
async function makePrediction() {
  try {
    const prediction = await skytells.predict({
      model: 'model-name',
      input: {
        prompt: 'Your prompt here'
      }
    });
    
    console.log('Prediction ID:', prediction.id);
    console.log('Status:', prediction.status);
    console.log('Output:', prediction.output);
  } catch (error) {
    console.error('Error making prediction:', error);
  }
}

// List available models
async function listModels() {
  try {
    const models = await skytells.listModels();
    console.log('Available models:', models);
  } catch (error) {
    console.error('Error listing models:', error);
  }
}

// Get a prediction by ID
async function getPrediction(id) {
  try {
    const prediction = await skytells.getPrediction(id);
    console.log('Prediction:', prediction);
  } catch (error) {
    console.error('Error getting prediction:', error);
  }
}
```

## Edge Compatibility

This SDK is fully compatible with edge environments including:

- Cloudflare Workers and Pages
- Vercel Edge Functions
- Netlify Edge Functions
- Deno Deploy
- Any environment with Fetch API support

To use a custom API endpoint or proxy:

```typescript
import { createClient } from 'skytells';

// Use a custom API endpoint or proxy
const client = createClient('your-api-key', {
  baseUrl: 'https://your-proxy.example.com/v1'
});
```

## API Reference

### Creating a Client

```typescript
import { createClient } from 'skytells';

// With API key (authenticated)
const client = createClient('your-api-key');

// Without API key (unauthenticated, limited functionality)
const unauthenticatedClient = createClient();

// With options
const clientWithOptions = createClient('your-api-key', {
  baseUrl: 'https://api.skytells.ai/v1', // Custom API URL
  timeout: 30000 // Custom timeout in ms
});
```

### Predictions

#### Make a Prediction

```typescript
const prediction = await client.predict({
  model: 'model-name',
  input: {
    // Model-specific inputs
    prompt: 'Your prompt here',
    // Other parameters...
  }
});
```

#### Get a Prediction by ID

```typescript
const prediction = await client.getPrediction('prediction-id');
```

#### Stream a Prediction

```typescript
const prediction = await client.streamPrediction('prediction-id');
```

#### Cancel a Prediction

```typescript
const prediction = await client.cancelPrediction('prediction-id');
```

#### Delete a Prediction

```typescript
const prediction = await client.deletePrediction('prediction-id');
```

### Models

#### List All Models

```typescript
const models = await client.listModels();
```

## TypeScript Support

This SDK is built with TypeScript and provides full type definitions for all methods and responses.

## Error Handling

All API methods return promises that may reject with a `SkytellsError`. The SDK parses API error responses into this structured format:

```typescript
import { createClient, SkytellsError } from 'skytells';

try {
  const prediction = await client.predict({
    model: 'model-name',
    input: { prompt: 'Your prompt' }
  });
} catch (error) {
  if (error instanceof SkytellsError) {
    console.error('Error message:', error.message);
    console.error('Error ID:', error.errorId);      // Example: "VALIDATION_ERROR"
    console.error('Error details:', error.details);  // Detailed error information
    console.error('HTTP status:', error.httpStatus); // HTTP status code (e.g., 422)
  } else {
    console.error('Unknown error:', error);
  }
}
```

### Common Error IDs

- `VALIDATION_ERROR` - Request parameters failed validation
- `AUTHENTICATION_ERROR` - Invalid or missing API key
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `RESOURCE_NOT_FOUND` - The requested resource doesn't exist
- `NETWORK_ERROR` - Connection issue with the API
- `REQUEST_TIMEOUT` - Request took too long to complete
- `SERVER_ERROR` - The server responded with a non-JSON response (e.g., HTML error page)
- `INVALID_JSON` - The server returned invalid JSON content

### Non-JSON Response Handling

The SDK automatically handles cases when the server doesn't respond with valid JSON:

```typescript
try {
  const models = await client.listModels();
} catch (error) {
  if (error instanceof SkytellsError) {
    if (error.errorId === 'SERVER_ERROR') {
      console.error('The server returned a non-JSON response:', error.message);
      console.error('Response content excerpt:', error.details);
      // This could indicate a server outage or maintenance
    } else if (error.errorId === 'INVALID_JSON') {
      console.error('The server returned malformed JSON:', error.message);
      console.error('Response content excerpt:', error.details);
      // This could indicate an API bug or server issue
    }
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

## License

MIT 