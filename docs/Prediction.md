# Predictions

The Predictions API is the core of Skytells — it lets you run AI models (image generation, video, audio, and more) on the Skytells platform. The SDK provides several ways to submit and manage predictions depending on your use case.

---

## Quick Reference

| Method | Description |
|--------|-------------|
| `client.run(model, options)` | Submit a prediction and wait for it to complete |
| `client.predict(payload)` | Submit and return immediately (`status: "pending"`) |
| `client.predictions.create(payload)` | Same as `predict()` (explicit sub-API form) |
| `client.predictions.get(id)` | Fetch a prediction by ID |
| `client.predictions.list(options?)` | List predictions with optional filters |
| `client.wait(prediction, options?)` | Poll until a prediction reaches a terminal status |
| `client.queue(payload)` | Add a prediction to the in-memory queue |
| `client.dispatch()` | Fire all queued predictions concurrently |

---

## `client.run()` — Submit and Wait

The simplest way to run a model. Submits the prediction and waits for it to finish, then returns a `Prediction` wrapper object.

```ts
import Skytells from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY);

const prediction = await client.run('flux-pro', {
  input: {
    prompt: 'A photorealistic astronaut riding a horse on Mars',
    aspect_ratio: '16:9',
    num_outputs: 1,
  },
});

console.log(prediction.status);   // "succeeded"
console.log(prediction.outputs()); // ["https://cdn.skytells.ai/..."]
console.log(prediction.raw());     // full PredictionResponse
```

### With progress tracking

When you pass an `onProgress` callback, `run()` switches to background mode: submits the prediction, then polls using `wait()` until completion.

```ts
const prediction = await client.run(
  'flux-pro',
  { input: { prompt: 'A forest at sunset' } },
  (progress) => {
    console.log(`Status: ${progress.status} — ${progress.metrics?.progress ?? 0}%`);
  },
);
```

---

## `Prediction` Class

`run()` returns a `Prediction` instance which wraps the `PredictionResponse`:

```ts
interface Prediction {
  id: string;                          // prediction ID
  status: PredictionStatus;            // current status
  output: string | string[] | undefined; // raw output field

  outputs(): string | string[] | undefined; // normalised (collapses single-item arrays)
  raw(): PredictionResponse;           // full response object

  stream(): Promise<PredictionResponse>;  // wait for stream completion
  cancel(): Promise<PredictionResponse>;  // cancel the prediction
  delete(): Promise<PredictionResponse>;  // delete the prediction record
}
```

### `outputs()` normalisation

`outputs()` is a convenience that collapses `["url"]` (single-item array) to `"url"` for models that always return a single output. Use `.raw().output` if you need the unmodified API value.

---

## Background Prediction + Manual Polling

Use `predictions.create()` and `wait()` when you need the prediction ID before waiting:

```ts
// Submit immediately — returns with status: "pending"
const pending = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A cyberpunk cityscape at night' },
});

console.log(pending.id);     // "pred_abc123"
console.log(pending.status); // "pending"

// Store the ID somewhere, then poll when ready
const result = await client.wait(pending);
console.log(result.status); // "succeeded"
console.log(result.output); // "https://..."
```

### `wait()` options

```ts
const result = await client.wait(pending, {
  interval: 2000,    // poll every 2 seconds (default: 5000)
  maxWait: 120_000,  // timeout after 2 minutes (throws WAIT_TIMEOUT)
  signal: abortController.signal, // abort with ABORTED error
});
```

See [Reliability.md](./Reliability.md) for full timeout/retry documentation.

---

## Prediction Request Payload

```ts
interface PredictionRequest {
  model: string;                 // Required: model slug
  input: Record<string, any>;   // Required: model-specific inputs

  // Optional
  await?: boolean;               // Block until completion (default: false)
  stream?: boolean;              // Enable streaming output
  webhook?: Webhook | {
    url: string;
    events: string[];            // "completed", "failed", "canceled", "started"
  };
}
```

---

## `client.predict()` — Low-level Shorthand

```ts
// Equivalent to predictions.create() — returns PredictionResponse (not Prediction wrapper)
const response = await client.predict({
  model: 'flux-pro',
  input: { prompt: 'A sunset over the ocean' },
  await: true, // block until done
});

console.log(response.status);  // "succeeded"
console.log(response.output);  // "https://..."
```

---

## `predictions.get()` — Fetch by ID

```ts
const prediction = await client.predictions.get('pred_abc123');
console.log(prediction.status); // "processing"
console.log(prediction.metrics?.progress); // 42
```

---

## `predictions.list()` — Browse History

```ts
// All predictions
const { data, pagination } = await client.predictions.list();

// With filters
const filtered = await client.predictions.list({
  model: 'flux-pro',
  since: '2026-01-01',     // YYYY-MM-DD
  until: '2026-03-31',
  page: 2,
});

console.log(pagination.total);        // Total count
console.log(pagination.current_page); // 2
console.log(pagination.last_page);    // 5
```

---

## `client.queue()` + `client.dispatch()` — Batch Mode

Queue multiple predictions and fire them all concurrently with a single call:

```ts
client.queue({ model: 'flux-pro', input: { prompt: 'A wolf in the snow' } });
client.queue({ model: 'flux-pro', input: { prompt: 'A dragon over a mountain' } });
client.queue({ model: 'flux-pro', input: { prompt: 'A ship in a storm' } });

// Fires all 3 concurrently via Promise.all
const results = await client.dispatch();
// results: PredictionResponse[] — in queue order
```

> **Note**: `dispatch()` clears the queue after firing. Call `queue()` again for the next batch.

---

## Prediction Response Shape

```ts
interface PredictionResponse {
  id: string;                // "pred_abc123"
  status: PredictionStatus;  // see status values below
  type: PredictionType;      // "inference" | "training"
  stream: boolean;
  input: Record<string, any>;
  output?: string | string[]; // available after succeeded
  response?: string;          // human-readable message (errors etc.)
  created_at: string;         // ISO 8601
  started_at: string;
  completed_at: string;
  updated_at: string;
  privacy: string;
  source?: PredictionSource;  // "api" | "cli" | "web"
  model?: { name: string; type: string };

  // Webhooks
  webhook?: { url: string | null; events: string[] };

  // Performance metrics (after completion)
  metrics?: {
    image_count?: number;
    predict_time?: number;   // seconds of inference time
    total_time?: number;     // wall-clock seconds
    asset_count?: number;
    progress?: number;       // 0–100 during processing
  };

  // Billing and storage (after completion)
  metadata?: {
    billing?: { credits_used: number };
    storage?: {
      files: Array<{
        name: string;   // "output.png"
        type: string;   // "image/png"
        size: number;   // bytes
        url: string;    // download URL
      }>;
    };
    data_available?: boolean;
  };

  // API URLs for lifecycle (use these when present over path templates)
  urls?: {
    get?: string;
    cancel?: string;
    stream?: string;
    delete?: string;
  };
}
```

---

## Prediction Status Values

```ts
enum PredictionStatus {
  PENDING     = 'pending',    // queued, not yet started
  STARTING    = 'starting',   // allocating resources
  STARTED     = 'started',    // resources allocated
  PROCESSING  = 'processing', // actively running
  SUCCEEDED   = 'succeeded',  // complete, output available
  FAILED      = 'failed',     // error — check response field
  CANCELLED   = 'cancelled',  // user-cancelled
}
```

**Terminal statuses**: `succeeded`, `failed`, `cancelled` — polling (`wait()`) stops on any of these.

---

## Webhooks on Predictions

Receive prediction lifecycle events at your server instead of polling:

```ts
import { Webhook, WebhookEvent } from 'skytells';

await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'An abstract painting' },
  webhook: new Webhook('https://api.example.com/hooks/skytells', [
    WebhookEvent.COMPLETED,
    WebhookEvent.FAILED,
  ]).toJSON(),
});
```

See [Webhooks.md](./Webhooks.md) for how to handle incoming webhooks securely.

---

## Cancelling a Prediction

```ts
const prediction = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A long video generation...' },
});

// Cancel while running
const cancelled = await client.predictions.get(prediction.id);
// Use the urls from the prediction response for the cancel URL
```

With the `Prediction` wrapper from `run()`:

```ts
const prediction = await client.run('flux-pro', { input: { prompt: '...' } });
// If you need to cancel while running: hold a reference before await completes
// or use background mode with a signal
const controller = new AbortController();
const prediction = await client.run('flux-pro',
  { input: { prompt: '...' }, signal: controller.signal },
  onProgress,
);
controller.abort(); // throws SkytellsError with errorId: 'ABORTED'
```

---

## Compatibility Check

Pass `compatibilityCheck: true` to validate the model type before submitting. The client fetches model metadata and warns/throws if the model is chat-only:

```ts
await client.predictions.create(
  { model: 'deepbrain-router', input: { prompt: '...' } },
  { compatibilityCheck: true },
);
// May throw SDK_ERROR: "Use client.chat.completions for this model"
```

Model metadata is cached per-client (10 min TTL, 64 slugs max / 16 in edge mode).

---

## Error Handling

```ts
import { SkytellsError } from 'skytells';

try {
  const prediction = await client.run('flux-pro', { input: { prompt: '...' } });
} catch (e) {
  if (e instanceof SkytellsError) {
    switch (e.errorId) {
      case 'MODEL_NOT_FOUND':
        console.error('Invalid model slug');
        break;
      case 'WAIT_TIMEOUT':
        console.error('Model took too long — increase maxWait or use background mode');
        break;
      case 'PREDICTION_FAILED':
        console.error('Prediction failed on the server');
        break;
      case 'INSUFFICIENT_CREDITS':
        console.error('Top up your Skytells credits');
        break;
      case 'RATE_LIMIT_EXCEEDED':
        console.error('Rate limited — slow down or add retries');
        break;
    }
  }
}
```

---

## Best Practices

- **Use `run()`** for simple synchronous workflows where you want to block and get output.
- **Use `predict()` + `wait()`** when you need to save the prediction ID before polling (e.g. store ID in a database, resume later).
- **Use `queue()` + `dispatch()`** for generating multiple assets in parallel.
- **Use webhooks** when predictions take >30s and you don't want to hold a connection open.
- **Set `maxWait`** in `WaitOptions` to avoid waiting indefinitely on edge/serverless runtimes.
- **Check `prediction.status === 'failed'`** and `prediction.response` for failure messages.
- **Prefer `prediction.urls.*`** over constructed paths — the API returns canonical URLs for each operation.
