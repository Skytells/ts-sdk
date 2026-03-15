# Skytells SDK — API Reference

> For the complete guide with examples, see [Guide.md](./Guide.md).

## Exports

```typescript
// Default export
import Skytells from 'skytells';

// Named exports
import { Skytells, SkytellsClient, Prediction, PredictionsAPI, ModelsAPI, SkytellsError, API_BASE_URL } from 'skytells';

// Legacy (deprecated)
import { createClient } from 'skytells';
```

---

## Skytells(apiKey?, options?)

Creates a `SkytellsClient` instance.

| Param     | Type            | Default | Description                 |
|-----------|-----------------|---------|-----------------------------|
| `apiKey`  | `string?`       | —       | API key (starts with `sk-`) |
| `options` | `ClientOptions?`| `{}`    | Client configuration        |

```typescript
const client = Skytells('sk-key');

const client = Skytells('sk-key', {
  timeout: 30000,
  retry: { retries: 2, retryDelay: 1000 },
  headers: { 'X-Custom': 'value' },
  fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
});
```

### ClientOptions

| Option    | Type                    | Default                             | Description                         |
|-----------|-------------------------|-------------------------------------|-------------------------------------|
| `baseUrl` | `string`                | `https://api.skytells.ai/v1`        | API base URL                        |
| `timeout` | `number`                | `60000`                             | Request timeout (ms)                |
| `headers` | `Record<string,string>` | `{}`                                | Custom headers for every request    |
| `retry`   | `RetryOptions`          | `{ retries:0, retryDelay:1000 }`    | Retry configuration                 |
| `fetch`   | `typeof fetch`          | `globalThis.fetch`                  | Custom fetch implementation         |

### RetryOptions

| Option       | Type       | Default                       | Description                               |
|--------------|------------|-------------------------------|-------------------------------------------|
| `retries`    | `number`   | `0`                           | Number of retry attempts                  |
| `retryDelay` | `number`   | `1000`                        | Base delay between retries (ms)           |
| `retryOn`    | `number[]` | `[429, 500, 502, 503, 504]`   | HTTP status codes that trigger retry      |

---

## SkytellsClient Methods

### client.run(model, options, onProgress?)

Runs a model, waits for completion, and returns a `Prediction` object.

This is **the recommended method** for generating content.

| Param        | Type                  | Description                                   |
|--------------|-----------------------|-----------------------------------------------|
| `model`      | `string`              | Model slug (e.g. `"flux-pro"`)                |
| `options`    | `RunOptions`          | `{ input, stream?, webhook? }`                |
| `onProgress` | `OnProgressCallback?` | Called on each poll with latest status         |

Returns: `Promise<Prediction>`  
Throws: `SkytellsError` on API error or `PREDICTION_FAILED`

```typescript
// Basic run — blocks until complete
const prediction = await client.run('flux-pro', {
  input: { prompt: 'An astronaut riding a unicorn' },
});
console.log(prediction.output);    // "https://..." or ["https://...", ...]
console.log(prediction.output[0]); // first output
console.log(prediction.id);        // "pred_abc123"
console.log(prediction.status);    // "succeeded"

// With progress tracking — polls in background
const prediction = await client.run('flux-pro',
  { input: { prompt: 'A landscape' } },
  (p) => {
    console.log(`Status: ${p.status}, Progress: ${p.metrics?.progress ?? 'n/a'}`);
  },
);

// With webhook
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A robot' },
  webhook: { url: 'https://example.com/hook', events: ['completed', 'failed'] },
});

// With streaming
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A sunset' },
  stream: true,
});
```

---

### client.predict(payload)

Low-level prediction. Returns the raw `PredictionResponse` (no `Prediction` wrapper).

| Param     | Type                | Description                                      |
|-----------|---------------------|--------------------------------------------------|
| `payload` | `PredictionRequest` | `{ model, input, await?, stream?, webhook? }`    |

Returns: `Promise<PredictionResponse>`

```typescript
// Fire-and-forget (returns immediately, status "pending")
const response = await client.predict({
  model: 'flux-pro',
  input: { prompt: 'A sunset' },
});
console.log(response.id, response.status); // "pred_...", "pending"

// Wait for completion inline
const result = await client.predict({
  model: 'flux-pro',
  input: { prompt: 'A sunset' },
  await: true,
});
console.log(result.output); // "https://..." or ["https://...", ...]
```

---

### client.wait(prediction, options?, onProgress?)

Polls a prediction until it reaches a terminal status (`succeeded`, `failed`, `cancelled`).

| Param        | Type                  | Description                          |
|--------------|-----------------------|--------------------------------------|
| `prediction` | `PredictionResponse`  | The prediction to poll (needs `id`)  |
| `options`    | `WaitOptions?`        | `{ interval?, maxWait? }`           |
| `onProgress` | `OnProgressCallback?` | Called on each poll                  |

Returns: `Promise<PredictionResponse>`  
Throws: `SkytellsError` with `WAIT_TIMEOUT` if `maxWait` exceeded

```typescript
const bg = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A cat' },
});

// Default polling (every 5 seconds)
const result = await client.wait(bg);
console.log(result.output);

// Custom interval
const result = await client.wait(bg, { interval: 2000 });

// With timeout
try {
  const result = await client.wait(bg, { interval: 2000, maxWait: 120000 });
} catch (e) {
  // e.errorId === 'WAIT_TIMEOUT'
}

// With progress callback
const result = await client.wait(bg, { interval: 3000 }, (p) => {
  console.log(`${p.status} — ${p.metrics?.progress ?? '?'}%`);
});
```

#### WaitOptions

| Option     | Type     | Default | Description                                      |
|------------|----------|---------|--------------------------------------------------|
| `interval` | `number` | `5000`  | Polling interval (ms)                            |
| `maxWait`  | `number` | —       | Max wait time (ms). Throws `WAIT_TIMEOUT` if hit |

---

### client.queue(payload)

Adds a prediction request to the local queue. Items are NOT sent until `dispatch()` is called.

| Param     | Type                | Description              |
|-----------|---------------------|--------------------------|
| `payload` | `PredictionRequest` | The request to queue     |

Returns: `void`

```typescript
client.queue({ model: 'flux-pro', input: { prompt: 'Cat' } });
client.queue({ model: 'flux-pro', input: { prompt: 'Dog' } });
client.queue({ model: 'flux-pro', input: { prompt: 'Bird' } });
```

---

### client.dispatch()

Dispatches all queued predictions concurrently. Clears the queue after dispatch.

Returns: `Promise<PredictionResponse[]>`

```typescript
client.queue({ model: 'flux-pro', input: { prompt: 'Cat' } });
client.queue({ model: 'flux-pro', input: { prompt: 'Dog' } });

const results = await client.dispatch();
for (const pred of results) {
  console.log(pred.id, pred.status); // "pending"
}

// Wait for all to complete
const completed = await Promise.all(results.map(p => client.wait(p)));
for (const r of completed) {
  console.log(r.output);
}
```

---

### client.streamPrediction(id)

Retrieves the streaming endpoint for a prediction.

| Param | Type     | Description    |
|-------|----------|----------------|
| `id`  | `string` | Prediction ID  |

Returns: `Promise<PredictionResponse>`

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

### client.cancelPrediction(id)

Cancels a running prediction by ID.

| Param | Type     | Description    |
|-------|----------|----------------|
| `id`  | `string` | Prediction ID  |

Returns: `Promise<PredictionResponse>`

```typescript
await client.cancelPrediction('pred_abc123');
```

---

### client.deletePrediction(id)

Deletes a prediction and its output/assets by ID.

| Param | Type     | Description    |
|-------|----------|----------------|
| `id`  | `string` | Prediction ID  |

Returns: `Promise<PredictionResponse>`

```typescript
await client.deletePrediction('pred_abc123');
```

---

## client.models (ModelsAPI)

### models.list(options?)

Lists all available models.

| Param            | Type                                     | Description                |
|------------------|------------------------------------------|----------------------------|
| `options`        | `ModelFieldsOptions?`                    | Optional fields config     |
| `options.fields` | `('input_schema' \| 'output_schema')[]?` | Extra fields to include    |

Returns: `Promise<Model[]>`

```typescript
// List all models
const models = await client.models.list();
for (const m of models) {
  console.log(m.name, m.type, m.vendor.name);
}

// Include schemas
const models = await client.models.list({ fields: ['input_schema', 'output_schema'] });
for (const m of models) {
  console.log(m.name, m.input_schema?.properties);
}
```

---

### models.get(slug, options?)

Fetches a single model by slug.

| Param     | Type                  | Description                |
|-----------|-----------------------|----------------------------|
| `slug`    | `string`              | Model slug (e.g. `"flux-pro"`) |
| `options` | `ModelFieldsOptions?` | Extra fields to include    |

Returns: `Promise<Model>`  
Throws: `SkytellsError` with `MODEL_NOT_FOUND` if slug doesn't exist

```typescript
const model = await client.models.get('flux-pro');
console.log(model.name);         // "Flux Pro"
console.log(model.type);         // "image"
console.log(model.vendor.name);  // vendor name
console.log(model.pricing);      // { amount, currency, unit }
console.log(model.capabilities); // ["text-to-image", ...]

// With schemas
const model = await client.models.get('flux-pro', {
  fields: ['input_schema', 'output_schema'],
});
console.log(model.input_schema);
console.log(model.output_schema);
```

---

## client.predictions (PredictionsAPI)

### predictions.create(payload)

Creates a background prediction (does not wait for completion).

| Param     | Type                | Description              |
|-----------|---------------------|--------------------------|
| `payload` | `PredictionRequest` | The prediction request   |

Returns: `Promise<PredictionResponse>`

```typescript
const prediction = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'An astronaut' },
});
console.log(prediction.id, prediction.status); // "pred_...", "pending"

// Wait for it to finish
const result = await client.wait(prediction);
console.log(result.output);
```

---

### predictions.get(id)

Fetches a prediction by ID.

| Param | Type     | Description    |
|-------|----------|----------------|
| `id`  | `string` | Prediction ID  |

Returns: `Promise<PredictionResponse>`

```typescript
const prediction = await client.predictions.get('pred_abc123');
console.log(prediction.status);
if (prediction.status === 'succeeded') {
  console.log(prediction.output);
}
```

---

### predictions.list(options?)

Lists predictions with optional filters and pagination.

| Param           | Type      | Description                        |
|-----------------|-----------|------------------------------------|
| `options.page`  | `number?` | Page number (default: 1)           |
| `options.since` | `string?` | From date (`YYYY-MM-DD`)           |
| `options.until` | `string?` | To date (`YYYY-MM-DD`)             |
| `options.model` | `string?` | Filter by model slug               |

Returns: `Promise<PaginatedResponse<PredictionResponse>>`

```typescript
// List all
const { data, pagination } = await client.predictions.list();
console.log(pagination.total, pagination.current_page, pagination.last_page);

// With filters
const { data } = await client.predictions.list({
  model: 'flux-pro',
  since: '2026-01-01',
  until: '2026-03-15',
  page: 2,
});

for (const pred of data) {
  console.log(pred.id, pred.status, pred.model?.name);
}
```

---

## Prediction Object

Returned by `client.run()`. Wraps `PredictionResponse` with getters and lifecycle methods.

### Properties (Getters)

| Member       | Type                              | Description                              |
|--------------|-----------------------------------|------------------------------------------|
| `.id`        | `string`                          | Prediction ID                            |
| `.status`    | `PredictionStatus`                | Current lifecycle status                 |
| `.output`    | `string \| string[] \| undefined` | Raw output (matches API JSON)            |
| `.response`  | `PredictionResponse`              | Full API response object                 |

### Methods

| Method       | Returns                           | Description                              |
|--------------|-----------------------------------|------------------------------------------|
| `.outputs()`  | `string \| string[] \| undefined` | Normalized output (unwraps single-element arrays) |
| `.raw()`     | `PredictionResponse`              | Full raw response as plain object        |
| `.cancel()`  | `Promise<PredictionResponse>`     | Cancel the prediction                    |
| `.delete()`  | `Promise<PredictionResponse>`     | Delete the prediction and its assets     |

```typescript
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A cat' },
});

// Properties
prediction.id;       // "pred_abc123"
prediction.status;   // "succeeded"
prediction.output;   // "https://..." or ["https://...", ...]
prediction.output[0] // first output when array
prediction.response; // full PredictionResponse

// outputs() — normalized output, unwraps single-element arrays
prediction.outputs(); // "https://..." (string if single), ["a","b"] (array if multiple), undefined (if none)

// raw() — full response for logging/serialization
const json = prediction.raw();
console.log(json.metrics?.predict_time);       // 2.3
console.log(json.metadata?.billing?.credits_used); // 1
console.log(JSON.stringify(prediction.raw())); // serialize

// cancel()
const cancelled = await prediction.cancel();
console.log(cancelled.status); // "cancelled"

// delete()
await prediction.delete();
```

---

## SkytellsError

Thrown by all API methods on error.

| Property     | Type     | Description              |
|--------------|----------|--------------------------|
| `message`    | `string` | Human-readable message   |
| `errorId`    | `string` | Error identifier         |
| `details`    | `string` | Detailed description     |
| `httpStatus` | `number` | HTTP status code         |

```typescript
import { SkytellsError } from 'skytells';

try {
  await client.run('bad-model', { input: {} });
} catch (error) {
  if (error instanceof SkytellsError) {
    console.error(error.errorId);    // "MODEL_NOT_FOUND"
    console.error(error.message);    // "Model not found"
    console.error(error.details);    // "..."
    console.error(error.httpStatus); // 404
  }
}
```

### Error IDs (ApiErrorId)

| Error ID                | HTTP | Description                     |
|-------------------------|------|---------------------------------|
| `UNAUTHORIZED`          | 401  | Invalid or missing API key      |
| `INVALID_PARAMETER`     | 400  | Invalid request parameter       |
| `INVALID_DATE_FORMAT`   | 400  | Invalid date format             |
| `INVALID_DATE_RANGE`    | 400  | Invalid date range              |
| `INVALID_INPUT`         | 400  | Invalid model input             |
| `MODEL_NOT_FOUND`       | 404  | Model slug not found            |
| `INSUFFICIENT_CREDITS`  | 402  | Not enough credits              |
| `PAYMENT_REQUIRED`      | 402  | Payment required                |
| `ACCOUNT_SUSPENDED`     | 403  | Account suspended               |
| `SECURITY_VIOLATION`    | 403  | Content policy violation        |
| `RATE_LIMIT_EXCEEDED`   | 429  | Too many requests               |
| `INTERNAL_ERROR`        | 500  | Server error                    |
| `PREDICTION_FAILED`     | —    | Prediction completed with error |
| `WAIT_TIMEOUT`          | 408  | `wait()` exceeded `maxWait`     |

---

## Types Quick Reference

### RunOptions
```typescript
{ input: Record<string, any>, stream?: boolean, webhook?: { url: string, events: string[] } }
```

### PredictionRequest
```typescript
{ model: string, input: Record<string, any>, await?: boolean, stream?: boolean, webhook?: { url: string, events: string[] } }
```

### WaitOptions
```typescript
{ interval?: number, maxWait?: number }
```

### PredictionsListOptions
```typescript
{ page?: number, since?: string, until?: string, model?: string }
```

### ModelFieldsOptions
```typescript
{ fields?: ('input_schema' | 'output_schema')[] }
```

### PaginatedResponse\<T\>
```typescript
{ data: T[], pagination: { current_page: number, per_page: number, total: number, last_page: number } }
```

### PredictionResponse
Full shape — see [Guide.md — TypeScript Reference](./Guide.md#14-typescript-reference).

### Model
Full shape — see [Guide.md — Models API](./Guide.md#5-models-api).

---

## Enums

| Enum                | Values                                                                        |
|---------------------|-------------------------------------------------------------------------------|
| `PredictionStatus`  | `pending`, `starting`, `started`, `processing`, `succeeded`, `failed`, `cancelled` |
| `PredictionType`    | `inference`, `training`                                                       |
| `PredictionSource`  | `api`, `cli`, `web`                                                           |
| `ModelType`         | `image`, `video`, `audio`, `music`, `text`, `code`, `multimodal`              |
| `ModelPrivacy`      | `public`, `private`                                                           |
| `PricingUnit`       | `image`, `video`, `second`, `prediction`, `gpu`, `image_megapixel`, `computing_second`, `audio_second`, `video_second`, `token`, `5 seconds`, `minute` |
| `PricingOperator`   | `equals`, `==`                                                                |

---

## Deprecated Methods

| Method               | Replacement               |
|----------------------|---------------------------|
| `createClient()`     | `Skytells()`              |
| `listModels()`       | `models.list()`           |
| `listPredictions()`  | `predictions.list()`      |
| `getPrediction()`    | `predictions.get()`       |
| `getModel()`         | `models.get()`            |
