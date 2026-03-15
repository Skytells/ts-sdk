# Skytells SDK — Complete Guide

## Table of Contents

1. [Introduction](#1-introduction)
2. [Installation](#2-installation)
3. [Quick Start](#3-quick-start)
4. [Client Configuration](#4-client-configuration)
5. [Models API](#5-models-api)
6. [Predictions API](#6-predictions-api)
7. [Running Predictions](#7-running-predictions)
8. [The Prediction Object](#8-the-prediction-object)
9. [Waiting & Polling](#9-waiting--polling)
10. [Queue & Dispatch](#10-queue--dispatch)
11. [Streaming](#11-streaming)
12. [Error Handling](#12-error-handling)
13. [Next.js / Edge / Serverless](#13-nextjs--edge--serverless)
14. [TypeScript Reference](#14-typescript-reference)
15. [Migration from v1.0.2](#15-migration-from-v102)
16. [FAQ](#16-faq)
17. [Support & Resources](#17-support--resources)

---

## 1. Introduction

The Skytells SDK is an official JavaScript/TypeScript client for the [Skytells AI](https://skytells.com) platform. It works in Node.js, browsers, and edge runtimes (Cloudflare Workers, Vercel Edge, Netlify Edge).

Key features:
- Run AI models (image, video, audio, music, text, code, multimodal)
- Background predictions with progress polling
- Queue/dispatch for batch workloads
- Built-in retry, timeout, and error handling
- Fully typed TypeScript API
- Custom `fetch` support for Next.js App Router

---

## 2. Installation

```bash
npm install skytells
```

The SDK ships ESM and CJS builds. TypeScript declarations are included.

---

## 3. Quick Start

```typescript
import Skytells from 'skytells';

// Create a client with your API key
const client = Skytells('sk-your-api-key');

// Run a prediction and get the output
const prediction = await client.run('flux-pro', {
  input: { prompt: 'An astronaut riding a unicorn' },
});

console.log(prediction.output); // string or string[]
```

---

## 4. Client Configuration

### Basic

```typescript
const client = Skytells('sk-your-api-key');
```

### With Options

```typescript
const client = Skytells('sk-your-api-key', {
  // Custom API base URL (default: https://api.skytells.ai/v1)
  baseUrl: 'https://api.skytells.ai/v1',

  // Request timeout in milliseconds (default: 60000)
  timeout: 30000,

  // Custom headers included in every request
  headers: {
    'X-Custom-Header': 'value',
  },

  // Retry configuration
  retry: {
    retries: 3,            // number of retry attempts (default: 0)
    retryDelay: 1000,      // delay between retries in ms (default: 1000)
    retryOn: [429, 500, 502, 503, 504], // HTTP codes that trigger retry
  },

  // Custom fetch implementation (see Next.js section)
  fetch: customFetchFn,
});
```

### All ClientOptions

| Option    | Type                    | Default                          | Description                           |
|-----------|-------------------------|----------------------------------|---------------------------------------|
| `baseUrl` | `string`                | `https://api.skytells.ai/v1`     | API base URL                          |
| `timeout` | `number`                | `60000`                          | Request timeout (ms)                  |
| `headers` | `Record<string,string>` | `{}`                             | Custom headers for every request      |
| `retry`   | `RetryOptions`          | `{ retries: 0, retryDelay: 1000 }` | Retry configuration               |
| `fetch`   | `typeof fetch`          | `globalThis.fetch`               | Custom fetch implementation           |

---

## 5. Models API

Access models via `client.models`.

### List All Models

```typescript
const models = await client.models.list();

for (const model of models) {
  console.log(model.name, model.type, model.vendor.name);
}
```

### List Models with Schemas

```typescript
const models = await client.models.list({
  fields: ['input_schema', 'output_schema'],
});

for (const model of models) {
  console.log(model.name, model.input_schema);
}
```

### Get a Single Model

```typescript
const model = await client.models.get('flux-pro');
console.log(model.name);           // "Flux Pro"
console.log(model.type);           // "image"
console.log(model.vendor.name);    // vendor name
console.log(model.pricing);        // { amount, currency, unit, ... }
console.log(model.capabilities);   // ["text-to-image", ...]
```

### Get a Model with Schemas

```typescript
const model = await client.models.get('flux-pro', {
  fields: ['input_schema', 'output_schema'],
});
console.log(model.input_schema?.properties);
```

### Model Object Shape

```typescript
interface Model {
  name: string;
  description?: string;
  namespace: string;
  type: ModelType;       // 'image' | 'video' | 'audio' | 'music' | 'text' | 'code' | 'multimodal'
  privacy: ModelPrivacy; // 'public' | 'private'
  img_url?: string | null;
  vendor: Vendor;        // { name, description, image_url, verified, slug, metadata }
  billable?: boolean;
  pricing?: Pricing;     // { amount, currency, unit, criterias?, formula? }
  capabilities: string[];
  metadata?: ModelMetadata;
  status: string;
  service?: Service;
  input_schema?: ModelInputSchema | null;
  output_schema?: ModelOutputSchema | null;
}
```

---

## 6. Predictions API

Access predictions via `client.predictions`.

### Create a Background Prediction

```typescript
const prediction = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A sunset over mountains' },
});

console.log(prediction.id);     // "pred_abc123"
console.log(prediction.status); // "pending"
```

### Get a Prediction by ID

```typescript
const prediction = await client.predictions.get('pred_abc123');

if (prediction.status === 'succeeded') {
  console.log(prediction.output); // ["https://..."]
}
```

### List Predictions

```typescript
// List all predictions (paginated)
const { data, pagination } = await client.predictions.list();

for (const pred of data) {
  console.log(pred.id, pred.status, pred.model?.name);
}
```

### List with Filters

```typescript
const { data } = await client.predictions.list({
  model: 'flux-pro',
  since: '2026-01-01',
  until: '2026-03-15',
  page: 2,
});
```

### PredictionsListOptions

| Option  | Type     | Description                                       |
|---------|----------|---------------------------------------------------|
| `page`  | `number` | Page number (default: 1)                          |
| `since` | `string` | Include predictions from this date (`YYYY-MM-DD`) |
| `until` | `string` | Include predictions up to this date (`YYYY-MM-DD`)|
| `model` | `string` | Filter by model slug                              |

---

## 7. Running Predictions

### Basic Run (Waits for Completion)

`client.run()` sends a prediction, waits for it to complete, and returns a `Prediction` object.

```typescript
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A cat wearing sunglasses' },
});

console.log(prediction.output);    // string | string[] | undefined
console.log(prediction.output[0]); // first output if array
console.log(prediction.id);        // "pred_abc123"
console.log(prediction.status);    // "succeeded"
```

### Run with Progress Tracking

Pass a callback as the third argument to `run()`. The SDK creates the prediction in the background and polls every 5 seconds, invoking the callback on each poll.

```typescript
const prediction = await client.run(
  'flux-pro',
  { input: { prompt: 'A detailed landscape painting' } },
  (p) => {
    console.log(`Status: ${p.status}`);
    if (p.metrics?.progress !== undefined) {
      console.log(`Progress: ${p.metrics.progress}%`);
    }
  },
);

console.log(prediction.output);
```

### Run with Webhook

```typescript
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A robot' },
  webhook: {
    url: 'https://your-server.com/webhook',
    events: ['completed', 'failed'],
  },
});
```

### Low-Level: predict()

For fire-and-forget or full control, use `client.predict()` directly:

```typescript
// Fire-and-forget (returns immediately, status: "pending")
const response = await client.predict({
  model: 'flux-pro',
  input: { prompt: 'A sunset' },
});

// Or wait inline
const response = await client.predict({
  model: 'flux-pro',
  input: { prompt: 'A sunset' },
  await: true,
});
console.log(response.output);
```

---

## 8. The Prediction Object

`client.run()` returns a `Prediction` instance wrapping the raw API response. All properties are getters that return the raw JSON values.

### Properties

| Property   | Type                             | Description                              |
|------------|----------------------------------|------------------------------------------|
| `id`       | `string`                         | Unique prediction ID                     |
| `status`   | `PredictionStatus`               | Current lifecycle status                 |
| `output`   | `string \| string[] \| undefined` | Raw output (string, array, or undefined) |
| `response` | `PredictionResponse`             | Full API response object                 |

### output

The raw prediction output. Can be a single `string` (e.g. a URL), a `string[]` (multiple URLs), or `undefined` if not yet complete.

```typescript
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A cat' },
});

// Raw value — matches JSON response
console.log(prediction.output); // "https://..." or ["https://...", ...]

// Access by index (when array)
console.log(prediction.output[0]);

// Type check
if (Array.isArray(prediction.output)) {
  for (const item of prediction.output) {
    console.log(item);
  }
} else if (typeof prediction.output === 'string') {
  console.log(prediction.output);
}

// Destructure (when array)
const [first, second] = prediction.output as string[];
```

### outputs()

Returns the output normalized to a single value. Unwraps single-element arrays to a plain string.

- `undefined` / no output → `undefined`
- `"https://..."` (string) → `"https://..."`
- `["https://..."]` (single-element array) → `"https://..."` (unwrapped)
- `["a", "b"]` (multi-element array) → `["a", "b"]` (kept as-is)

```typescript
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A cat' },
});

const result = prediction.outputs();

// Single output → string
if (typeof result === 'string') {
  console.log(result); // "https://..."
}

// Multiple outputs → string[]
if (Array.isArray(result)) {
  for (const url of result) {
    console.log(url);
  }
}

// No output yet → undefined
if (result === undefined) {
  console.log('Prediction has no output');
}
```

### raw()

Returns the full raw `PredictionResponse` object as a plain JSON-like object. Useful for serialization, logging, or accessing all fields at once.

```typescript
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A cat' },
});

const json = prediction.raw();
console.log(json.id);                   // "pred_abc123"
console.log(json.status);               // "succeeded"
console.log(json.output);               // "https://..." or ["https://...", ...]
console.log(json.metrics?.predict_time); // 2.3
console.log(json.metrics?.total_time);   // 5.1
console.log(json.metadata?.billing?.credits_used); // 1
console.log(json.created_at);            // "2026-03-15T12:00:00Z"
console.log(json.model?.name);           // "Flux Pro"

// Serialize to JSON string
const serialized = JSON.stringify(prediction.raw());
```

### cancel()

Cancels a running prediction. Only works if the prediction is still in progress (`pending`, `starting`, `started`, or `processing`).

```typescript
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A very slow image' },
});

// Cancel if no longer needed
const cancelled = await prediction.cancel();
console.log(cancelled.status); // "cancelled"
```

### delete()

Deletes the prediction and its associated output/assets from storage.

```typescript
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A cat' },
});

console.log(prediction.output); // use the output first

// Clean up when done
await prediction.delete();
```

---

## 9. Waiting & Polling

### client.wait()

Polls a prediction until it reaches a terminal status (`succeeded`, `failed`, or `cancelled`).

```typescript
// Create in background
const bg = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A landscape' },
});

// Wait for completion (polls every 5 seconds by default)
const result = await client.wait(bg);
console.log(result.status); // "succeeded"
console.log(result.output); // ["https://..."]
```

### Custom Polling Interval

```typescript
const result = await client.wait(bg, {
  interval: 2000, // poll every 2 seconds
});
```

### Timeout

```typescript
try {
  const result = await client.wait(bg, {
    interval: 2000,
    maxWait: 120000, // timeout after 2 minutes
  });
} catch (error) {
  // error.errorId === 'WAIT_TIMEOUT'
  console.error('Prediction timed out');
}
```

### Progress Callback with wait()

```typescript
const result = await client.wait(bg, { interval: 3000 }, (p) => {
  console.log(`${p.status} — progress: ${p.metrics?.progress ?? 'n/a'}`);
});
```

### WaitOptions

| Option     | Type     | Default | Description                                    |
|------------|----------|---------|------------------------------------------------|
| `interval` | `number` | `5000`  | Polling interval in milliseconds               |
| `maxWait`  | `number` | —       | Max wait time (ms). Throws `WAIT_TIMEOUT` if exceeded |

---

## 10. Queue & Dispatch

For batch workloads, queue multiple predictions and dispatch them concurrently.

### Queue Items

```typescript
client.queue({ model: 'flux-pro', input: { prompt: 'Cat' } });
client.queue({ model: 'flux-pro', input: { prompt: 'Dog' } });
client.queue({ model: 'flux-pro', input: { prompt: 'Bird' } });
```

### Dispatch All

```typescript
const results = await client.dispatch();

for (const pred of results) {
  console.log(pred.id, pred.status); // all "pending" initially
}
```

### Wait for All to Complete

```typescript
client.queue({ model: 'flux-pro', input: { prompt: 'Cat' } });
client.queue({ model: 'flux-pro', input: { prompt: 'Dog' } });

const dispatched = await client.dispatch();

// Wait for all predictions to finish
const completed = await Promise.all(
  dispatched.map((pred) => client.wait(pred)),
);

for (const result of completed) {
  console.log(result.output);
}
```

### Full Batch Pipeline Example

```typescript
const prompts = ['A sunset', 'A forest', 'An ocean', 'A mountain'];

// Queue all
for (const prompt of prompts) {
  client.queue({ model: 'flux-pro', input: { prompt } });
}

// Dispatch concurrently
const predictions = await client.dispatch();

// Wait for all and collect outputs
const results = await Promise.all(
  predictions.map((p) => client.wait(p)),
);

const urls = results
  .filter((r) => r.status === 'succeeded')
  .flatMap((r) => r.output ?? []);

console.log('Generated:', urls);
```

---

## 11. Streaming

### Get Stream URL

```typescript
const bg = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A landscape' },
  stream: true,
});

const stream = await client.streamPrediction(bg.id);
console.log(stream.urls?.stream); // streaming endpoint URL
```

---

## 12. Error Handling

### SkytellsError

All API errors throw `SkytellsError` with structured fields:

```typescript
import { SkytellsError } from 'skytells';

try {
  const prediction = await client.run('nonexistent-model', {
    input: { prompt: 'test' },
  });
} catch (error) {
  if (error instanceof SkytellsError) {
    console.error(error.message);    // Human-readable message
    console.error(error.errorId);    // e.g. "MODEL_NOT_FOUND"
    console.error(error.details);    // Detailed description
    console.error(error.httpStatus); // HTTP status code (e.g. 404)
  }
}
```

### Error IDs

| Error ID                | HTTP Status | Description                         |
|-------------------------|-------------|-------------------------------------|
| `UNAUTHORIZED`          | 401         | Invalid or missing API key          |
| `INVALID_PARAMETER`     | 400         | Invalid request parameter           |
| `INVALID_INPUT`         | 400         | Invalid model input                 |
| `MODEL_NOT_FOUND`       | 404         | Model slug not found                |
| `INSUFFICIENT_CREDITS`  | 402         | Not enough credits                  |
| `PAYMENT_REQUIRED`      | 402         | Payment required                    |
| `ACCOUNT_SUSPENDED`     | 403         | Account suspended                   |
| `SECURITY_VIOLATION`    | 403         | Content policy violation            |
| `RATE_LIMIT_EXCEEDED`   | 429         | Too many requests                   |
| `INTERNAL_ERROR`        | 500         | Server error                        |
| `PREDICTION_FAILED`     | —           | Prediction completed with failure   |
| `WAIT_TIMEOUT`          | 408         | `wait()` exceeded `maxWait`         |

### Retry Behavior

The HTTP layer automatically retries on `429`, `500`, `502`, `503`, `504` by default. Configure via `retry` option:

```typescript
const client = Skytells('sk-key', {
  retry: {
    retries: 3,
    retryDelay: 2000,
    retryOn: [429, 500, 502, 503, 504],
  },
});
```

Retry uses exponential backoff: `retryDelay * (attempt + 1)`.

---

## 13. Next.js / Edge / Serverless

### Next.js App Router (Disable Fetch Cache)

Next.js caches `fetch` calls by default. Use a custom `fetch` to opt out:

```typescript
const client = Skytells('sk-key', {
  fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
});
```

### Vercel Edge Functions

```typescript
import Skytells from 'skytells';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const client = Skytells('sk-key');
  const prediction = await client.run('flux-pro', {
    input: { prompt: 'Hello from the edge' },
  });
  const [url] = prediction.output;
  return new Response(JSON.stringify({ url }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Cloudflare Workers

```typescript
import Skytells from 'skytells';

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const client = Skytells(env.SKYTELLS_API_KEY);
    const prediction = await client.run('flux-pro', {
      input: { prompt: 'Hello from Cloudflare' },
    });
    const [url] = prediction.output;
    return Response.json({ url });
  },
};
```

---

## 14. TypeScript Reference

### Imports

```typescript
// Default import
import Skytells from 'skytells';

// Named imports
import {
  Skytells,
  SkytellsClient,
  Prediction,
  PredictionsAPI,
  ModelsAPI,
  SkytellsError,
  API_BASE_URL,
} from 'skytells';

// Type imports
import type {
  Model,
  ModelType,
  ModelPrivacy,
  Vendor,
  Pricing,
  PricingCriteria,
  ClientOptions,
  RetryOptions,
  PredictionRequest,
  PredictionResponse,
  PredictionStatus,
  RunOptions,
  WaitOptions,
  PredictionsListOptions,
  OnProgressCallback,
  QueueItem,
  PaginatedResponse,
  Pagination,
  ModelFieldsOptions,
  ModelInputSchema,
  ModelOutputSchema,
} from 'skytells';
```

### PredictionStatus Enum

```typescript
enum PredictionStatus {
  PENDING     = 'pending',
  STARTING    = 'starting',
  STARTED     = 'started',
  PROCESSING  = 'processing',
  SUCCEEDED   = 'succeeded',
  FAILED      = 'failed',
  CANCELLED   = 'cancelled',
}
```

### PredictionResponse Shape

```typescript
interface PredictionResponse {
  id: string;
  status: PredictionStatus;
  type: PredictionType;       // 'inference' | 'training'
  stream: boolean;
  input: Record<string, any>;
  response?: string;
  output?: string | string[];
  created_at: string;
  started_at: string;
  completed_at: string;
  updated_at: string;
  privacy: string;
  source?: PredictionSource;  // 'api' | 'cli' | 'web'
  model?: { name: string; type: string };
  webhook?: { url: string | null; events: string[] };
  metrics?: {
    image_count?: number;
    predict_time?: number;
    total_time?: number;
    asset_count?: number;
    progress?: number;
  };
  metadata?: {
    billing?: { credits_used: number };
    storage?: { files: { name: string; type: string; size: number; url: string }[] };
    data_available?: boolean;
  };
  urls?: {
    get?: string;
    cancel?: string;
    stream?: string;
    delete?: string;
  };
}
```

---

## 15. Migration from v1.0.2

### Renamed Methods

| Old (deprecated)     | New                      |
|----------------------|--------------------------|
| `client.listModels()`      | `client.models.list()`    |
| `client.getModel(slug)`    | `client.models.get(slug)` |
| `client.listPredictions()` | `client.predictions.list()` |
| `client.getPrediction(id)` | `client.predictions.get(id)` |
| `createClient(key)`        | `Skytells(key)`           |

The old methods still work but print deprecation warnings. They will be removed in a future release.

### New Import Style

```typescript
// Before (v1.0.2)
import { createClient } from 'skytells';
const client = createClient('sk-key');

// After (v1.0.3)
import Skytells from 'skytells';
const client = Skytells('sk-key');

// Named import also works
import { Skytells } from 'skytells';
```

### New Features in v1.0.3

- `client.predictions.create()` — background prediction
- `client.wait()` — poll until completion with optional progress callback
- `client.queue()` / `client.dispatch()` — batch predictions
- `client.streamPrediction()` — get streaming endpoint
- `Prediction` object with `.output`, `.cancel()`, `.delete()`
- `SkytellsError` with `errorId`, `details`, `httpStatus`
- Full `RetryOptions` config

---

## 16. FAQ

**Q: How do I run a prediction in the background?**
Use `predictions.create()` to start it, then `wait()` to poll:
```typescript
const bg = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A cat' },
});
const result = await client.wait(bg);
```

**Q: How do I track progress during a run?**
Pass a callback as the third argument to `run()`:
```typescript
const prediction = await client.run('flux-pro', { input: { prompt: '...' } }, (p) => {
  console.log(p.status, p.metrics?.progress);
});
```

**Q: Can I cancel a prediction?**
Yes, via the Prediction object or by ID:
```typescript
await prediction.cancel();
// or
await client.cancelPrediction('pred_abc123');
```

**Q: How do I handle rate limits?**
Configure retries — the client will retry on 429 automatically:
```typescript
const client = Skytells('sk-key', { retry: { retries: 3, retryDelay: 2000 } });
```

**Q: Does it work without an API key?**
The API key is optional in the constructor, but most endpoints require authentication.

**Q: What model types are available?**
`image`, `video`, `audio`, `music`, `text`, `code`, `multimodal` — use `models.list()` to see all.

**Q: How do I use it with CommonJS (require)?**
```javascript
const { Skytells } = require('skytells');
const client = Skytells('sk-key');
```

---

## 17. Support & Resources

- **GitHub**: [github.com/skytells/ts-sdk](https://github.com/skytells/ts-sdk)
- **Issues**: [github.com/skytells/ts-sdk/issues](https://github.com/skytells/ts-sdk/issues)
- **Skytells Platform**: [skytells.com](https://skytells.com)
- **API Docs**: [skytells.com/docs](https://skytells.com/docs)
- **Changelog**: [CHANGELOG.md](../CHANGELOG.md)
