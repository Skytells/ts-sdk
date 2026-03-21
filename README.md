# Skytells JavaScript/TypeScript SDK

[![npm version](https://img.shields.io/npm/v/skytells.svg?style=flat-square)](https://www.npmjs.com/package/skytells)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Docs](https://img.shields.io/badge/docs-skytells.ai-blueviolet?style=flat-square)](https://docs.skytells.ai/sdks/ts/)
[![Skytells Learn | Docs](https://img.shields.io/badge/skytells-learn-blue?style=flat-square)](https://learn.skytells.ai/sdks/ts/)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square)](docs/Architecture.md)

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

## Import

```ts
// Recommended: factory (default export)
import Skytells from 'skytells';

// Direct class import
import { SkytellsClient } from 'skytells';

// Both in one import
import Skytells, { SkytellsClient } from 'skytells';
```

Optionally, you may use the named factory:

```ts
import { createClient } from 'skytells';

const client = createClient('sk-your-api-key');
// equivalent to: Skytells('sk-your-api-key') and new SkytellsClient('sk-your-api-key')
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

**Orchestrator** (workflows / webhook triggers) uses a separate `wfb_…` key. Optional **`orchestratorApiKey`** on the same client keeps both products in one place — the SDK applies the right auth per API ([Orchestrator.md](docs/Orchestrator.md)):

```typescript
const client = Skytells('sk-…', { orchestratorApiKey: 'wfb_…' });
await client.orchestrator.webhooks.execute(workflowId, { /* JSON body */ });
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
```

### Server-side Await

For image models, pass `await: true` to have the server block and return the final output in one request — no polling required:

```typescript
// Explicit server-side wait (image models only; video models ignore this)
const response = await skytells.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A cat' },
  await: true,
});
console.log(response.output); // already populated

// Or let the SDK detect the model type automatically:
const response = await skytells.predictions.create(
  { model: 'flux-pro', input: { prompt: 'A cat' } },
  { compatibilityCheck: true, autoAwait: true }, // sets await:true only for image models
);
console.log(response.output);

// Or with a timeout and progress (first GET is immediate; then every interval)
const result = await skytells.wait(response, {
  interval: 2000,   // delay between polls after the first refresh
  maxWait: 120000,  // wall-clock limit → WAIT_TIMEOUT
  // signal: ac.signal, // optional AbortSignal → ABORTED
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
// Cancel a running prediction (works while status is pending/starting/processing)
await prediction.cancel();

// Delete a prediction and all its output assets from storage
await prediction.delete();

// Fetch stream metadata for a prediction
const stream = await prediction.stream();
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
  timeout: 30000, // Omit for defaults: 60000 normally, 25000 when runtime: 'edge'
  headers: { 'X-Custom-Header': 'value' }, // Extra headers on every request
  retry: {
    retries: 3, // Retry failed requests (default: 0)
    retryDelay: 1000, // Base delay; actual wait is retryDelay * (attempt + 1) per retry
    retryOn: [429, 500, 502, 503, 504],
  },
  fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
  // runtime: 'edge', // Vercel Edge / Workers: shorter default timeout, smaller compat cache, one-time hints
});
```

Inspect resolved settings: **`skytells.config`** (`requestTimeoutMs`, `prefetchMaxSlugs`, `runtime`) and **`skytells.runtime`**.

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

This SDK works in any environment with **Fetch** and (for **webhook HMAC verification**) **`crypto.subtle`** (Web Crypto):

- **Cloudflare Workers & Pages**
- **Vercel Edge Functions**
- **Netlify Edge Functions**
- **Deno Deploy**
- **Node.js** — use **19+** for global `crypto.subtle`, or verify webhooks in an environment that provides it
- **Browsers**

Pass **`{ runtime: 'edge' }`** when constructing the client on edge/serverless so the SDK uses a **25s default request timeout** (if you don’t set `timeout`) and a **smaller** inference-compat model cache; see **`EDGE_DEFAULT_REQUEST_TIMEOUT_MS`** / **`EDGE_PREFETCH_MAX_SLUGS`** in the package exports.

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
| `ABORTED` | `wait()` / `run` polling stopped via `AbortSignal` |
| `SDK_ERROR` | Client guard (OpenAI-compat model + `compatibilityCheck`, missing `prediction.id`, webhook crypto unavailable, …) |
| `REQUEST_TIMEOUT` | HTTP request timed out |
| `NETWORK_ERROR` | Connection issue |
| `SERVER_ERROR` | Non-JSON response from server |
| `INVALID_JSON` | Declared JSON but body failed `JSON.parse` |

## TypeScript

Full type definitions are included. Key types:

```typescript
import type {
  PredictionRequest,
  PredictionSdkOptions,
  PredictionResponse,
  PredictionStatus,
  RunOptions,
  WaitOptions,
  Model,
  ClientOptions,
  SkytellsRuntime,
  PaginatedResponse,
} from 'skytells';
```

Inference guard: pass **`{ compatibilityCheck: true }`** as the **second** argument to **`predict`** / **`predictions.create`**, **fourth** to **`run`** (use `undefined` for `onProgress` if unused), or **second** to **`queue`** — never inside the JSON body.

Auto server-side await for image models: also pass **`autoAwait: true`** alongside `compatibilityCheck: true` in `predictions.create()`.

## Safety

Proactive content moderation and response parsing via `client.safety`:

```typescript
import Skytells, { SafetyTemplates } from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY);

// Check user input before sending to a model
const check = await client.safety.checkText(userInput, {
  template: SafetyTemplates.MODERATE,
});
if (!check.passed) {
  throw new Error(`Blocked: ${check.failedCategories.join(', ')}`);
}

// Evaluate generated prediction output (image URLs are auto-detected)
const prediction = await client.run('flux-pro', { input: { prompt: userInput } });
const eval = await client.safety.evaluate(prediction.output, SafetyTemplates.STRICT);
if (!eval.passed) {
  await prediction.delete();
  throw new Error(`Output blocked: ${eval.failedCategories.join(', ')}`);
}

// Parse content_filter_results from an existing chat completion (no extra API call)
const completion = await client.chat.completions.create({ ... });
if (client.safety.wasFiltered(completion)) {
  const categories = client.safety.getFilteredCategories(completion);
  console.warn('Filtered:', categories);
}
```

See [Safety.md](docs/Safety.md) for templates, all input types, and integration patterns.

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

`createClient` is still exported for compatibility; the first call logs a console hint to prefer `import Skytells from 'skytells'`.

> The old method names still work but log deprecation warnings and will be removed in a future version.

## Documentation

- See [Official Docs](https://docs.skytells.ai/sdks/ts/) for hosted documentation.
- **[Client.md](docs/Client.md)** — `SkytellsClient` in full: options, every method, sub-APIs
- **[SDKReference.md](docs/SDKReference.md)** — Low-level reference: every class, method, type, constant
- [Guide.md](docs/Guide.md) — Getting started walkthroughs
- [Architecture.md](docs/Architecture.md) — Request pipeline, retries, streams, model cache
- [Reliability.md](docs/Reliability.md) — Timeouts, retries, AbortSignal, edge/serverless patterns
- [Errors.md](docs/Errors.md) — `SkytellsError` catalog
- [Prediction.md](docs/Prediction.md) — Predictions: run, wait, queue, cancel, delete
- [Chat.md](docs/Chat.md) — Chat completions (streaming + tools)
- [Responses.md](docs/Responses.md) — Responses API (SSE events, multi-turn)
- [Embeddings.md](docs/Embeddings.md) — Embeddings, semantic search, RAG
- [Safety.md](docs/Safety.md) — Content moderation, templates, prediction evaluation
- [Webhooks.md](docs/Webhooks.md) — Inbound webhooks, framework integrations, HMAC
- [Orchestrator.md](docs/Orchestrator.md) — Orchestrator workflows (`wfb_…` key)

### Non-JSON Response Handling

The SDK automatically handles cases when the server doesn't respond with valid JSON:

```typescript
try {
  const models = await skytells.models.list();
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

## Documentation in this repo

| File | Description |
|------|-------------|
| [docs/Client.md](docs/Client.md) | `SkytellsClient`: options, methods, sub-APIs, best practices |
| [docs/SDKReference.md](docs/SDKReference.md) | Low-level reference: every export, class, type, and constant |
| [docs/Guide.md](docs/Guide.md) | Getting started — first prediction, chat, embeddings |
| [docs/Architecture.md](docs/Architecture.md) | Request pipeline, retries, streaming, model cache |
| [docs/Reliability.md](docs/Reliability.md) | Timeouts, retries, AbortSignal, edge/serverless |
| [docs/Errors.md](docs/Errors.md) | `SkytellsError` fields and all `errorId` values |
| [docs/Prediction.md](docs/Prediction.md) | Predictions: run, wait, queue, dispatch, cancel, webhooks |
| [docs/Chat.md](docs/Chat.md) | Chat completions, streaming, tools, vision |
| [docs/Responses.md](docs/Responses.md) | Responses API, SSE events, multi-turn |
| [docs/Embeddings.md](docs/Embeddings.md) | Embeddings, semantic search, RAG |
| [docs/Safety.md](docs/Safety.md) | Safety checks, templates, prediction output evaluation |
| [docs/Webhooks.md](docs/Webhooks.md) | Inbound webhooks, HMAC verification, framework integrations |
| [docs/Orchestrator.md](docs/Orchestrator.md) | Orchestrator: workflows, executions, integrations |
| [docs/.env.example](docs/.env.example) | All environment variables for local dev and CI |

Hosted: [Skytells TS SDK docs](https://docs.skytells.ai/sdks/ts/).

## License

MIT 
