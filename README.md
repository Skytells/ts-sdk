# Skytells JavaScript/TypeScript SDK

The official JavaScript/TypeScript SDK for interacting with the [Skytells](https://skytells.ai) API. Edge-compatible with Cloudflare Workers, Vercel Edge Functions, Netlify Edge Functions, and more.

Generate text, photos, videos, avatars, audio, music, and more using Skytells' own models and partner models — all through a single API. [Explore models →](https://skytells.ai/explore/models)

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
import Skytells from 'skytells';

const skytells = Skytells('your-api-key');

// Run a model and get the result
const prediction = await skytells.run('truefusion', {
  input: { prompt: 'A cat wearing sunglasses' },
});

console.log(prediction.outputs()); // "https://delivery.skytells.cloud/..."
```

### Obtaining an API Key

1. Log in at [Skytells Portal](https://www.skytells.ai/auth/signin) or [Create an Account](https://www.skytells.ai/auth/signup)
2. Go to [Dashboard → API Keys](https://www.skytells.ai/dashboard/api-keys)
3. Click **Generate New API Key** and copy it immediately

## Usage

### Running a Prediction

`skytells.run()` sends a prediction, waits for completion, and returns a `Prediction` object:

```typescript
import Skytells from 'skytells';

const skytells = Skytells('your-api-key');

const prediction = await skytells.run('truefusion', {
  input: { prompt: 'A sunset over mountains' },
});

// Access output
console.log(prediction.id);        // "pred_abc123"
console.log(prediction.status);    // "succeeded"
console.log(prediction.output);    // Raw: ["https://..."] or "https://..."
console.log(prediction.outputs()); // Normalized: "https://..." (unwraps single-element arrays)

// Full raw response
const raw = prediction.raw();
console.log(raw.metrics);          // { predict_time: 3.86, total_time: 3.86, ... }
console.log(raw.metadata);         // { billing: { credits_used: 0 }, storage: { ... } }
```

### Progress Tracking

Pass an `onProgress` callback to track prediction status during polling:

```typescript
const prediction = await skytells.run('beatfusion-2.0', {
  input: { prompt: 'rap, romantic', lyrics: 'Let me introduce the voice you hear, Beatfusion by Skytells making it clear..' },
}, (p) => {
  console.log(`Status: ${p.status}, Progress: ${p.metrics?.progress ?? 'n/a'}`);
});
// [... song url ]
```

### Background Predictions

Create a prediction without waiting for it to finish:

```typescript
// Create in background (returns immediately)
const response = await skytells.predictions.create({
  model: 'truefusion',
  input: { prompt: 'A cat' },
});
console.log(response.id, response.status); // "pred_..." "pending"

// Poll until complete
const result = await skytells.wait(response);
console.log(result.output);

// Or with a timeout and progress
const result = await skytells.wait(response, {
  interval: 2000,   // poll every 2s
  maxWait: 120000,  // timeout after 2 min
}, (p) => console.log(p.status));
```

### Queue & Dispatch

Batch multiple predictions and dispatch them concurrently:

```typescript
skytells.queue({ model: 'truefusion-pro', input: { prompt: 'Cat' } });
skytells.queue({ model: 'truefusion-x', input: { prompt: 'Dog' } });
skytells.queue({ model: 'FLUX-2.0', input: { prompt: 'Bird' } });
skytells.queue({ model: 'sora-2', input: { prompt: 'A stunning video....' } });
skytells.queue({ model: 'beatfusion-2.0', input: { lyrics:' Wherever you are I go In every beat every sound Your love is all around....', prompt: 'Romantic, Love' } });


const results = await skytells.dispatch();
// results: PredictionResponse[] — one per queued item

// Wait for all to complete
const completed = await Promise.all(results.map(r => skytells.wait(r)));
```

### Prediction Lifecycle

```typescript
// Cancel a running prediction
await prediction.cancel();
// or by ID
await skytells.cancelPrediction('pred_abc123');

// Delete a prediction and its assets
await prediction.delete();
// or by ID
await skytells.deletePrediction('pred_abc123');

// Stream endpoint
const stream = await skytells.streamPrediction('pred_abc123');
console.log(stream.urls?.stream);
```

### Models

```typescript
// List all models
const models = await skytells.models.list();
for (const m of models) {
  console.log(m.name, m.type, m.pricing?.amount);
}

// Get a specific model
const model = await skytells.models.get('truefusion');

// Include schemas
const detailed = await skytells.models.get('truefusion', {
  fields: ['input_schema', 'output_schema'],
});
```

### Predictions API

```typescript
// List predictions with filters
const { data, pagination } = await skytells.predictions.list({
  model: 'truefusion',
  since: '2026-01-01',
  until: '2026-03-15',
  page: 2,
});

// Get a prediction by ID
const prediction = await skytells.predictions.get('pred_abc123');
```

## Client Options

```typescript
import Skytells from 'skytells';

const skytells = Skytells('your-api-key', {
  baseUrl: 'https://your-proxy.example.com/v1', // Custom API URL
  timeout: 30000,                                // Request timeout in ms (default: 60000)
  headers: { 'X-Custom-Header': 'value' },       // Extra headers on every request
  retry: {
    retries: 3,                                  // Retry failed requests (default: 0)
    retryDelay: 1000,                            // Delay between retries in ms (default: 1000)
    retryOn: [429, 500, 502, 503, 504],          // Status codes to retry (default)
  },
  fetch: (url, opts) =>                          // Custom fetch (e.g. Next.js cache workaround)
    fetch(url, { ...opts, cache: 'no-store' }),
});
```

## The Prediction Object

When you call `skytells.run()`, you get a `Prediction` object:

| Property / Method | Returns | Description |
|---|---|---|
| `.id` | `string` | Unique prediction ID |
| `.status` | `PredictionStatus` | `pending`, `starting`, `started`, `processing`, `succeeded`, `failed`, `cancelled` |
| `.output` | `string \| string[] \| undefined` | Raw output from the API |
| `.response` | `PredictionResponse` | Full response object |
| `.outputs()` | `string \| string[] \| undefined` | Normalized output — unwraps single-element arrays |
| `.raw()` | `PredictionResponse` | Full raw response |
| `.cancel()` | `Promise<PredictionResponse>` | Cancel the prediction |
| `.delete()` | `Promise<PredictionResponse>` | Delete the prediction and its assets |

### `outputs()` Behavior

| API returns | `outputs()` returns |
|---|---|
| `undefined` | `undefined` |
| `"https://..."` | `"https://..."` |
| `["https://..."]` | `"https://..."` (unwrapped) |
| `["a", "b"]` | `["a", "b"]` (kept as array) |

## Edge Compatibility

This SDK works in any environment with Fetch API support:

- **Cloudflare Workers & Pages**
- **Vercel Edge Functions**
- **Netlify Edge Functions**
- **Deno Deploy**
- **Node.js 18+**
- **Browsers**

## Error Handling

All methods throw `SkytellsError` on failure:

```typescript
import Skytells, { SkytellsError } from 'skytells';

try {
  const prediction = await skytells.run('truefusion', {
    input: { prompt: 'A cat' },
  });
} catch (error) {
  if (error instanceof SkytellsError) {
    console.error(error.message);    // Human-readable message
    console.error(error.errorId);    // e.g. "VALIDATION_ERROR"
    console.error(error.details);    // Detailed info
    console.error(error.httpStatus); // e.g. 422
  }
}
```

### Error IDs

| Error ID | Description |
|---|---|
| `UNAUTHORIZED` | Invalid or missing API key |
| `VALIDATION_ERROR` | Request parameters failed validation |
| `MODEL_NOT_FOUND` | Model slug not found |
| `INSUFFICIENT_CREDITS` | Not enough credits |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `PREDICTION_FAILED` | Prediction completed with failure |
| `WAIT_TIMEOUT` | Polling exceeded `maxWait` |
| `REQUEST_TIMEOUT` | HTTP request timed out |
| `NETWORK_ERROR` | Connection issue |
| `SERVER_ERROR` | Non-JSON response from server |
| `INVALID_JSON` | Server returned invalid JSON |

## TypeScript

Full type definitions are included. Key types:

```typescript
import type {
  PredictionRequest,
  PredictionResponse,
  PredictionStatus,
  RunOptions,
  WaitOptions,
  Model,
  ClientOptions,
  PaginatedResponse,
} from 'skytells';
```

## Migration from v1.0.2

```diff
- import { createClient } from 'skytells';
- const client = createClient('key');
+ import Skytells from 'skytells';
+ const skytells = Skytells('key');

- const models = await client.listModels();
+ const models = await skytells.models.list();

- const model = await client.getModel('truefusion');
+ const model = await skytells.models.get('truefusion');

- const pred = await client.getPrediction(id);
+ const pred = await skytells.predictions.get(id);
```

> The old method names still work but log deprecation warnings and will be removed in a future version.

## Documentation

- See [Official Docs](https://docs.skytells.ai/sdks/ts/) for the latest documentation.
- [SDK API Reference](docs/SDK.md) — Full method signatures, parameter tables, and examples
- [Developer Guide](docs/Guide.md) — Step-by-step walkthroughs and patterns

### Non-JSON Response Handling

The SDK automatically handles cases when the server doesn't respond with valid JSON:

```typescript
try {
  const models = await skytells.listModels();
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

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the latest changes.

## SDK Docs

See [SDK Docs](https://docs.skytells.ai/sdks/ts/) for the latest documentation.

## License

MIT 
