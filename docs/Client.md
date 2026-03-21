# SkytellsClient

`SkytellsClient` is the main entry point for all Skytells API features. This document covers instantiation, all configuration options, every method and property, lazy sub-APIs, and practical patterns.

---

## Import

```ts
// Recommended: factory (default export)
import Skytells from 'skytells';

// Direct class import
import { SkytellsClient } from 'skytells';

// Both in one import
import Skytells, { SkytellsClient } from 'skytells';
```

Optionally, You may import it that way:

```ts
import { createClient } from 'skytells`;
```

---

## Creating a client

### Factory (recommended)

```ts
const client = Skytells('sk-your-api-key');
```

OR

```ts
const skytells = createClient('sk-your-api-key');
```

Equivalent to `new SkytellsClient('sk-your-api-key')` and `createClient('sk-your-api-key')`. 

All return the same object.

### With options

```ts
const client = Skytells('sk-your-api-key', {
  timeout: 30_000,
  retry: { retries: 3, retryDelay: 1000 },
  headers: { 'X-App-Version': '1.0.0' },
});
```

OR

```ts
const skytells = createClient('sk-your-api-key', {
  timeout: 30_000,
  retry: { retries: 3, retryDelay: 1000 },
  headers: { 'X-App-Version': '1.0.0' },
});
```

### Environment variable pattern

```ts
// SKYTELLS_API_KEY is read in your application startup
const client = Skytells(process.env.SKYTELLS_API_KEY);
```

### Next.js App Router (disable fetch caching)

```ts
const client = Skytells(process.env.SKYTELLS_API_KEY, {
  fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
});
```

### Edge / serverless (Cloudflare Workers, Vercel Edge)

```ts
const client = Skytells(process.env.SKYTELLS_API_KEY, {
  runtime: 'edge',
  // timeout defaults to 25000ms in edge mode (vs 60000ms in default mode)
});
```

### Both Inference and Orchestrator

```ts
const client = Skytells('sk-your-api-key', {
  orchestratorApiKey: 'wfb_your-orchestrator-key',
});

// Now client.orchestrator is available
const workflows = await client.orchestrator.workflows.list();
```

---

## `ClientOptions`

All options are optional.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `https://api.skytells.ai/v1` | Override the Inference API base URL |
| `timeout` | `number` | `60000` (`25000` in `edge` mode) | Request timeout in milliseconds. Applied to every HTTP request |
| `headers` | `Record<string, string>` | — | Custom headers merged into every request |
| `retry` | `RetryOptions` | — | Retry config (non-streaming requests only) |
| `fetch` | `typeof fetch` | global `fetch` | Custom fetch implementation |
| `runtime` | `SkytellsRuntime` | `'default'` | Request environment. Use `'edge'` for Workers / Vercel Edge |
| `orchestratorApiKey` | `string` | — | `wfb_…` key. Required to use `client.orchestrator` |
| `orchestratorBaseUrl` | `string` | `https://orchestrator.skytells.ai` | Override the Orchestrator base URL |

### `RetryOptions`

```ts
interface RetryOptions {
  retries?: number;    // Number of retry attempts after the first failure (default: 0)
  retryDelay?: number; // Base delay in ms. Multiplied linearly: delay × (attempt + 1) (default: 1000)
  retryOn?: number[];  // HTTP status codes to retry on (default: [429, 500, 502, 503, 504])
}
```

**Important**: Retries are applied to non-streaming requests only (`predict`, `run`, `chat.completions.create`, `embeddings.create`, etc.). Streaming requests are never auto-retried.

---

## Constructor

```ts
new SkytellsClient(apiKey?: string, options?: ClientOptions)
```

When `runtime: 'edge'` is set and no custom `timeout` is provided, the client automatically uses a 25-second timeout (appropriate for Cloudflare Workers and Vercel Edge). A one-time warning is printed to the console with edge-specific tips.

---

## Properties

### `client.config`

```ts
client.config: Readonly<{
  runtime: SkytellsRuntime;
  requestTimeoutMs: number;
  prefetchMaxSlugs: number;
}>
```

Read-only resolved settings. Useful for debugging.

```ts
console.log(client.config.runtime);          // 'default' | 'edge' | ...
console.log(client.config.requestTimeoutMs); // 60000 (or 25000 in edge mode)
console.log(client.config.prefetchMaxSlugs); // 64 (or 16 in edge mode)
```

### `client.runtime`

```ts
client.runtime: SkytellsRuntime
```

The runtime from `ClientOptions.runtime`. Returns `'default'` when not set.

---

## Sub-APIs (lazy singletons)

Sub-APIs are instantiated on first access and reused. There is no overhead for having them on the client unless you actually use them.

| Property | Type | Description |
|----------|------|-------------|
| `client.predictions` | `PredictionsAPI` | Create, fetch, list predictions |
| `client.prediction` | `PredictionsAPI` | Alias of `predictions` |
| `client.models` | `ModelsAPI` | Browse the model catalog |
| `client.chat` | `Chat` | Chat completions and Responses API |
| `client.responses` | `Responses` | Responses API (also `client.chat.responses`) |
| `client.embeddings` | `Embeddings` | Text embeddings |
| `client.safety` | `Safety` | Content moderation |
| `client.orchestrator` | `Orchestrator` | Workflow automation (requires `orchestratorApiKey`) |

---

## Methods

### `client.predict(payload, sdk?)`

```ts
predict(payload: PredictionRequest, sdk?: PredictionSdkOptions): Promise<PredictionResponse>
```

Low-level prediction submit. Returns immediately (status `"pending"` or `"starting"`) unless `payload.await: true` is set.

```ts
// Background — returns with status 'pending'
const response = await client.predict({
  model: 'flux-pro',
  input: { prompt: 'A sunset over mountains' },
});
console.log(response.id, response.status); // "pending"

// Blocking — returns when complete
const result = await client.predict({
  model: 'flux-pro',
  input: { prompt: 'A sunset over mountains' },
  await: true,
});
console.log(result.output); // ["https://..."]
```

**Parameters**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `payload.model` | `string` | Yes | Model slug (e.g. `'flux-pro'`) |
| `payload.input` | `Record<string, any>` | Yes | Input parameters for the model |
| `payload.await` | `boolean` | No | Block until completion (default: `false`) |
| `payload.stream` | `boolean` | No | Enable streaming output (default: `false`) |
| `payload.webhook` | `Webhook \| { url, events }` | No | Webhook for prediction events |
| `sdk.compatibilityCheck` | `boolean` | No | Pre-validate model is inference-type before posting |

---

### `client.run(model, options, onProgress?, sdk?)`

```ts
run(
  model: string,
  options: RunOptions,
  onProgress?: OnProgressCallback,
  sdk?: PredictionSdkOptions,
): Promise<Prediction>
```

The recommended way to generate content. Runs the model and waits for completion. Returns a `Prediction` wrapper with convenience methods.

**Without `onProgress`**: Uses `predict({ await: true })` — single blocking HTTP call.  
**With `onProgress`**: Creates a background prediction, polls every `interval` ms, fires `onProgress` on each poll.

```ts
// Simple — blocks until done
const prediction = await client.run('flux-pro', {
  input: { prompt: 'An astronaut on Mars' },
});
const [imageUrl] = prediction.output;

// With progress tracking
const prediction = await client.run('flux-pro', {
  input: { prompt: 'An astronaut on Mars' },
  interval: 3000,  // poll every 3s
  maxWait: 120_000, // timeout after 2 min
}, (current) => {
  console.log(`Status: ${current.status}, Progress: ${current.metrics?.progress ?? 'n/a'}%`);
});

// With AbortSignal
const controller = new AbortController();
setTimeout(() => controller.abort(), 60_000);

const prediction = await client.run('flux-pro', {
  input: { prompt: 'A landscape' },
  signal: controller.signal,
}, (p) => console.log(p.status));
```

**`RunOptions`**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `input` | `Record<string, any>` | Required | Model input parameters |
| `webhook` | `Webhook \| { url, events }` | — | Webhook config (background mode only) |
| `stream` | `boolean` | `false` | Enable streaming output |
| `interval` | `number` | `5000` | Poll interval ms (background mode, when `onProgress` is set) |
| `maxWait` | `number` | — | Max wait ms. Throws `WAIT_TIMEOUT` when exceeded |
| `signal` | `AbortSignal` | — | Cancels polling when aborted |

**Throws** `SkytellsError` with `errorId: 'PREDICTION_FAILED'` if the prediction returns a failed status.

---

### `client.wait(prediction, options?, onProgress?)`

```ts
wait(
  prediction: PredictionResponse,
  options?: WaitOptions,
  onProgress?: OnProgressCallback,
): Promise<PredictionResponse>
```

Polls `GET /predictions/{id}` until a terminal status (`succeeded`, `failed`, or `cancelled`) is reached.

```ts
const bg = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A cat in space' },
});

// Basic wait
const result = await client.wait(bg);
console.log(result.output);

// With options
const result = await client.wait(bg, {
  interval: 2000,
  maxWait: 90_000,
}, (p) => console.log(p.status, p.metrics?.progress));
```

**`WaitOptions`**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `interval` | `number` | `5000` | Polling interval in ms |
| `maxWait` | `number` | — | Max total wait in ms. Throws `WAIT_TIMEOUT` if exceeded |
| `signal` | `AbortSignal` | — | Stop polling if aborted. Throws `ABORTED` |

---

### `client.queue(payload, sdk?)`

```ts
queue(payload: PredictionRequest, sdk?: PredictionSdkOptions): void
```

Adds a prediction to the in-memory queue without firing a request. Call `dispatch()` to submit all queued items at once.

```ts
client.queue({ model: 'flux-pro', input: { prompt: 'Cat' } });
client.queue({ model: 'flux-pro', input: { prompt: 'Dog' } });
client.queue({ model: 'flux-pro', input: { prompt: 'Bird' } });
```

---

### `client.dispatch()`

```ts
dispatch(): Promise<PredictionResponse[]>
```

Fires all queued predictions concurrently via `Promise.all`. Clears the queue. If any single prediction fails, the entire `dispatch()` rejects.

```ts
client.queue({ model: 'flux-pro', input: { prompt: 'Cat' } });
client.queue({ model: 'flux-pro', input: { prompt: 'Dog' } });

const responses = await client.dispatch();

// Responses are background (status: 'pending'). Wait for all:
const completed = await Promise.all(responses.map((r) => client.wait(r)));
for (const r of completed) {
  console.log(r.output);
}
```

---

### `client.webhookListener(options?)`

```ts
webhookListener(options?: WebhookListenerOptions): WebhookListener
```

Creates a `WebhookListener` for handling inbound prediction webhook events. In `general` mode (default), the client's API key is used as the HMAC secret automatically — you don't need to pass `apiKey` again.

```ts
const hooks = client.webhookListener();

hooks.on('prediction.succeeded', async (prediction) => {
  console.log('Done:', prediction.id, prediction.output);
});

// Next.js App Router
export async function POST(req: Request) {
  return hooks.handleRequest(req);
}
```

See [Webhooks.md](./Webhooks.md) for full framework examples.

---

### `client.listen(options?)`

Alias of `client.webhookListener()`. Same return type, same behaviour.

---

### `client.purgePrefetchedModelCache(modelSlug?)`

```ts
purgePrefetchedModelCache(modelSlug?: string): void
```

Clears the in-memory model metadata cache used by `compatibilityCheck`. If `modelSlug` is omitted, the entire cache is cleared.

```ts
// Evict one slug (e.g. after a model is updated on the platform)
client.purgePrefetchedModelCache('flux-pro');

// Clear all
client.purgePrefetchedModelCache();
```

---

## `Prediction` class

Returned by `client.run()`. Wraps a `PredictionResponse` with convenience methods.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `prediction.id` | `string` | Unique prediction ID |
| `prediction.status` | `PredictionStatus` | Current status |
| `prediction.output` | `string \| string[] \| undefined` | Raw output from the API |
| `prediction.response` | `PredictionResponse` | Full raw response object |

### `prediction.outputs()`

```ts
outputs(): string | string[] | undefined
```

Normalized output:
- `undefined` if not available
- `string` if a single item
- `string[]` if multiple items
- Single-element arrays are unwrapped to a plain `string`

```ts
const url = prediction.outputs() as string;
// or
const [first] = prediction.output as string[];
```

### `prediction.raw()`

```ts
raw(): PredictionResponse
```

Returns the full raw `PredictionResponse` including all fields (`metrics`, `metadata`, `urls`, etc.).

### `prediction.stream()`

```ts
stream(): Promise<PredictionResponse>
```

Fetches stream metadata (uses `urls.stream` when available).

### `prediction.cancel()`

```ts
cancel(): Promise<PredictionResponse>
```

Cancels a running prediction. Only succeeds if the prediction is still in a non-terminal state. Returns the updated response with `status: 'cancelled'`.

```ts
const prediction = await client.run('flux-pro', { input: { prompt: '...' } });

// Cancel immediately (useful if you changed your mind)
await prediction.cancel();
```

### `prediction.delete()`

```ts
delete(): Promise<PredictionResponse>
```

Deletes the prediction and all associated output assets from storage.

```ts
const prediction = await client.run('flux-pro', { input: { prompt: '...' } });
const [imageUrl] = prediction.output as string[];

// Use the image...

// Then delete assets when no longer needed
await prediction.delete();
```

---

## `PredictionsAPI`

Access via `client.predictions` or `client.prediction`.

### `predictions.create(payload, sdk?)`

```ts
create(payload: PredictionRequest, sdk?: PredictionSdkOptions): Promise<PredictionResponse>
```

Submits a background prediction (does not wait for completion). The returned prediction will have `status: 'pending'` or `'starting'`.

```ts
const response = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A cat' },
});
console.log(response.id); // "pred_abc123"

// Poll until done
const result = await client.wait(response);
console.log(result.output);
```

### `predictions.get(id, urls?)`

```ts
get(id: string, urls?: PredictionResponse['urls']): Promise<PredictionResponse>
```

Fetches a prediction's current state. Pass `urls` from a stored response to use the API's preferred URL.

```ts
const prediction = await client.predictions.get('pred_abc123');
console.log(prediction.status, prediction.output);
```

### `predictions.list(options?)`

```ts
list(options?: PredictionsListOptions): Promise<PaginatedResponse<PredictionResponse>>
```

Lists your predictions with optional filters.

```ts
// All predictions
const { data, pagination } = await client.predictions.list();

// Filtered by model and date range
const { data } = await client.predictions.list({
  model: 'flux-pro',
  since: '2026-01-01',
  until: '2026-03-21',
  page: 2,
});
```

**`PredictionsListOptions`**

| Field | Type | Description |
|-------|------|-------------|
| `page` | `number` | Page number (default: `1`) |
| `since` | `string` | From date `YYYY-MM-DD` (inclusive) |
| `until` | `string` | To date `YYYY-MM-DD` (inclusive) |
| `model` | `string` | Filter by model slug |

---

## `ModelsAPI`

Access via `client.models`.

### `models.list(options?)`

```ts
list(options?: ModelFieldsOptions): Promise<Model[]>
```

```ts
const models = await client.models.list();
for (const m of models) {
  console.log(m.name, m.type);
}

// Include input/output schemas
const detailed = await client.models.list({ fields: ['input_schema', 'output_schema'] });
```

### `models.get(slug, options?)`

```ts
get(slug: string, options?: ModelFieldsOptions): Promise<Model>
```

```ts
const model = await client.models.get('flux-pro');
console.log(model.name, model.pricing);

// With schema
const withSchema = await client.models.get('flux-pro', { fields: ['input_schema'] });
```

---

## Compatibility Check

When `sdk.compatibilityCheck: true` is passed to `predict`, `run`, or `predictions.create`, the client first fetches model metadata to verify the model supports inference (not just chat completions). If the model is OpenAI-compatible (chat-only), a `SkytellsError` with `errorId: 'SDK_ERROR'` is thrown before any inference request is made.

Model metadata is cached per slug with a 10-minute TTL (64 slugs max, 16 in edge mode).

```ts
// This will throw SDK_ERROR if 'deepbrain-router' is a chat-only model
const result = await client.run(
  'deepbrain-router',
  { input: { prompt: '...' } },
  undefined,
  { compatibilityCheck: true },
);
```

---

## Error Handling

All client methods throw `SkytellsError` on failure.

```ts
import Skytells, { SkytellsError } from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY);

try {
  const prediction = await client.run('flux-pro', {
    input: { prompt: 'A cat' },
  });
} catch (e) {
  if (e instanceof SkytellsError) {
    console.error(`[${e.errorId}] ${e.message}`);
    // e.httpStatus — HTTP status code (0 for SDK-level errors)
    // e.requestId  — upstream correlation ID for support
    // e.details    — additional context
  }
}
```

Common `errorId` values:

| errorId | Cause |
|---------|-------|
| `UNAUTHORIZED` | Invalid or missing API key |
| `MODEL_NOT_FOUND` | Model slug does not exist |
| `INSUFFICIENT_CREDITS` | Account has no credits |
| `PREDICTION_FAILED` | Prediction ended in failed state |
| `WAIT_TIMEOUT` | `wait()` exceeded `maxWait` |
| `ABORTED` | `AbortSignal` was fired |
| `SDK_ERROR` | SDK-level error (bad args, Orchestrator key missing, etc.) |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `NETWORK_ERROR` | Network or DNS failure |

See [Errors.md](./Errors.md) for the full list.

---

## Best Practices

### Use `run()` for typical generation

`run()` is the simplest and most robust path: it submits, waits, validates, and wraps the result. Use `predict()` or `predictions.create()` only when you need fine-grained control.

```ts
// Good
const prediction = await client.run('flux-pro', { input: { prompt: '...' } });

// Only when you need background / manual polling
const bg = await client.predictions.create({ model: 'flux-pro', input: { ... } });
```

### Always handle `SkytellsError`

```ts
try {
  const prediction = await client.run(model, options);
} catch (e) {
  if (e instanceof SkytellsError && e.errorId === 'INSUFFICIENT_CREDITS') {
    // prompt user to top up
  }
}
```

### Use `AbortSignal` in serverless / edge environments

Background polling with `wait()` or `run(..., onProgress)` uses `setTimeout`. Always bound it with `maxWait` or an `AbortSignal` to prevent the runtime from hanging.

```ts
const controller = new AbortController();
const prediction = await client.run('flux-pro', {
  input: { prompt: '...' },
  maxWait: 30_000,
  signal: controller.signal,
}, (p) => console.log(p.status));
```

### Batch with `queue` + `dispatch`

When you need multiple predictions and don't need to wait for each individually, use the queue for a single concurrent dispatch:

```ts
const prompts = ['Cat', 'Dog', 'Bird', 'Fish'];
for (const prompt of prompts) {
  client.queue({ model: 'flux-pro', input: { prompt } });
}
const responses = await client.dispatch();
const completed = await Promise.all(responses.map((r) => client.wait(r)));
```

### Reuse one client per application

Creating a `SkytellsClient` is cheap, but sub-APIs are lazily allocated singletons. Reuse one instance across your app rather than creating a new client per request.

```ts
// module-level singleton (Node.js / server)
export const skytells = Skytells(process.env.SKYTELLS_API_KEY);
```

### Clean up after yourself

Delete predictions and assets when they are no longer needed to keep your storage clean:

```ts
const prediction = await client.run('flux-pro', { input: { prompt: '...' } });
// ... use prediction.output ...
await prediction.delete();
```

---

## Full example

```ts
import Skytells, { SkytellsError, SafetyTemplates, WebhookEvent } from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY, {
  timeout: 45_000,
  retry: { retries: 2, retryDelay: 1500 },
});

async function generateImage(prompt: string): Promise<string> {
  // Optional: check the prompt first
  const safety = await client.safety.checkText(prompt, {
    template: SafetyTemplates.MODERATE,
  });
  if (!safety.passed) {
    throw new Error(`Blocked: ${safety.failedCategories.join(', ')}`);
  }

  const prediction = await client.run('flux-pro', {
    input: { prompt, width: 1024, height: 1024 },
  });

  const url = prediction.outputs() as string;

  // clean up assets after use
  await prediction.delete();

  return url;
}

// Chat
const completion = await client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
});
console.log(completion.choices[0].message.content);

// Embeddings
const emb = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: ['hello world'],
});
console.log(emb.data[0].embedding);

// Webhook listener
const hooks = client.webhookListener();
hooks.on(WebhookEvent.COMPLETED, async (pred) => {
  console.log('Completed:', pred.id, pred.output);
});
// export async function POST(req: Request) { return hooks.handleRequest(req); }
```
