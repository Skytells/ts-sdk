# Reliability

This document covers timeout configuration, retry logic, polling options for `wait()`, `AbortSignal` support, and edge/serverless considerations.

---

## Timeouts

Every request uses an `AbortController`-based timeout that is **always cleared** in a `finally` block — no timer leaks in serverless or edge environments.

### Default timeouts

| Context | Default timeout |
|---------|----------------|
| Default / Node / Browser | 60 000 ms (60 s) |
| Edge runtime (`runtime: 'edge'`) | 25 000 ms (25 s) |

The edge default only applies when `timeout` is **not explicitly set** in `ClientOptions`.

### Setting a custom timeout

```ts
const client = Skytells(apiKey, {
  timeout: 30_000, // 30 seconds
});
```

### Timeout errors

When the client-side timeout fires:
- `errorId: 'REQUEST_TIMEOUT'`
- `httpStatus: 408`
- `message: "Request timed out after Xms"`

```ts
import { SkytellsError } from 'skytells';

try {
  await client.run('flux-pro', { input: { prompt: '...' } });
} catch (e) {
  if (e instanceof SkytellsError && e.errorId === 'REQUEST_TIMEOUT') {
    // Increase timeout or use background mode (predict + wait)
  }
}
```

### Timer overflow guard

The SDK caps the timeout at `2_147_483_647 ms` (max 32-bit signed int) to prevent `setTimeout` overflow bugs on platforms that treat values above this as `0`.

---

## Retries

Retries apply **only** to non-streaming requests (`request()`, `requestText()`, `requestBuffer()`). Streaming calls (`requestStream()`, `requestNdjsonStream()`) are **never retried**.

### Default retry behavior

By default, `retries: 0` — no automatic retries.

### Configuring retries

```ts
const client = Skytells(apiKey, {
  retry: {
    retries: 3,       // number of retry attempts after first failure
    retryDelay: 1000, // base delay in ms
    retryOn: [429, 500, 502, 503, 504], // HTTP status codes that trigger retry
  },
});
```

### Backoff strategy

The SDK uses **linear backoff**:

```
delay = retryDelay × (attempt + 1)
```

| Attempt | Delay (retryDelay=1000) |
|---------|------------------------|
| 1st retry | 1 000 ms |
| 2nd retry | 2 000 ms |
| 3rd retry | 3 000 ms |

There is no jitter or exponential backoff built in. If your use case needs exponential backoff with jitter, implement it at the application layer.

### Per-request retry override

There is no per-request retry override — `retry` is set at the client level. If you need different retry policies for different APIs (e.g. no retry for predictions, 3 retries for embeddings), create separate clients.

### Rate limit retries

For `429 Too Many Requests`, add `429` to `retryOn` (already in the default). Combine with `retryDelay` large enough to let the rate limit reset:

```ts
const client = Skytells(apiKey, {
  retry: {
    retries: 2,
    retryDelay: 5000, // 5s, 10s between retries
    retryOn: [429, 500, 502, 503, 504],
  },
});
```

---

## `wait()` Polling

`client.wait(prediction, options?)` polls `GET /predictions/{id}` until the prediction reaches a terminal status (`succeeded`, `failed`, `cancelled`).

### Options

```ts
interface WaitOptions {
  interval?: number;   // poll interval in ms (default: 5000)
  maxWait?: number;    // total wait timeout in ms (throws WAIT_TIMEOUT if exceeded)
  signal?: AbortSignal; // abort with ABORTED error
}
```

### Example

```ts
const pending = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: '...' },
});

const result = await client.wait(pending, {
  interval: 2000,      // poll every 2 seconds
  maxWait: 120_000,    // give up after 2 minutes
});
```

### `WAIT_TIMEOUT`

If the prediction does not finish within `maxWait`:

```ts
try {
  const result = await client.wait(pending, { maxWait: 60_000 });
} catch (e) {
  if (e instanceof SkytellsError && e.errorId === 'WAIT_TIMEOUT') {
    // Prediction is still running — consider switching to webhooks
    console.log('Still running:', pending.id);
  }
}
```

### `PREDICTION_FAILED`

If the prediction terminates with `status: 'failed'` during a `run()` call:

```ts
try {
  const prediction = await client.run('flux-pro', { input: { prompt: '...' } });
} catch (e) {
  if (e instanceof SkytellsError && e.errorId === 'PREDICTION_FAILED') {
    console.error('Model returned failed status:', e.message);
  }
}
```

---

## `AbortSignal` — Cancelling Waits

Pass an `AbortSignal` to immediately stop polling and throw `SkytellsError('ABORTED')`:

### With `wait()`

```ts
const controller = new AbortController();

// Cancel after 10 seconds from the user's perspective
const timer = setTimeout(() => controller.abort(), 10_000);

try {
  const result = await client.wait(pending, {
    signal: controller.signal,
  });
  clearTimeout(timer);
  return result;
} catch (e) {
  if (e instanceof SkytellsError && e.errorId === 'ABORTED') {
    console.log('User cancelled — prediction', pending.id, 'may still be running server-side');
  }
  throw e;
}
```

### With `run()` + `onProgress`

```ts
const controller = new AbortController();

const prediction = await client.run(
  'flux-pro',
  {
    input: { prompt: '...' },
    interval: 3000,
    maxWait: 120_000,
    signal: controller.signal,
  },
  (progress) => {
    console.log(progress.status, progress.metrics?.progress);
    if (userClickedCancel) {
      controller.abort();
    }
  },
);
```

### Important: abort stops polling, not the server prediction

Aborting the signal stops the SDK's polling loop. The prediction **continues running on the Skytells servers** unless you separately call `predictions.cancel()` or `prediction.cancel()`.

To cancel both:

```ts
controller.abort(); // stop SDK polling

// Also cancel server-side
await client.predictions.get(pending.id).then(p => {
  // Use the cancel URL from urls.cancel
});
```

---

## Edge and Serverless Environments

### `runtime: 'edge'`

```ts
const client = Skytells(apiKey, {
  runtime: 'edge',
  // timeout defaults to 25 000ms automatically
});
```

Edge mode applies:
1. **Shorter default timeout**: 25 000 ms (fits within Vercel/Cloudflare ~30s wall-clock limit).
2. **Smaller compat cache**: 16 slug entries (vs 64) — conserves memory.
3. **Console hints**: Logged once per process on initialization.

### Recommendations for edge/serverless

- **Always set `maxWait`** when using `wait()` — edge functions have hard wall-clock limits.
- **Always pass `signal`** in `wait()` / `run()` with `onProgress` — connect it to the request lifecycle so polls stop if the client disconnects.
- **Avoid `wait()` on long jobs**: For jobs taking >10s, use `predict()` to submit, store the ID, and use webhooks for notification.
- **Retries**: Keep `retry.retries` low (0–2). Each retry adds delay; multiple retries can easily exceed a 30s edge limit.

### Next.js App Router example

```ts
// app/api/predict/route.ts
import { NextRequest } from 'next/server';
import Skytells from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY!, {
  runtime: 'edge',
  timeout: 20_000,
  // Use no-store to bypass Next.js fetch caching
  fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
});

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();

  // Submit prediction
  const pending = await client.predictions.create({
    model: 'flux-pro',
    input: { prompt },
  });

  // Wait with AbortSignal tied to request
  const result = await client.wait(pending, {
    maxWait: 15_000,                     // under the edge time limit
    signal: req.signal,                  // abort if client disconnects
  });

  return Response.json({ output: result.output });
}
```

### Cloudflare Workers

```ts
import Skytells from 'skytells';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const client = Skytells(env.SKYTELLS_API_KEY, {
      runtime: 'edge',
      timeout: 20_000,
    });

    const result = await client.run('flux-pro', {
      input: { prompt: 'A futuristic city' },
    });

    return new Response(JSON.stringify({ output: result.outputs() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
```

---

## Streaming Reliability

Streaming calls (`chat.completions.create({ stream: true })`, `responses.create({ stream: true })`) have specific reliability characteristics:

- **Not retried**: If a stream fails mid-way, the SDK will not restart it.
- **Cleanup on abandon**: If you break out of a `for await...of` loop early, the SDK still calls `reader.cancel()` in the `finally` block — the response body is released.
- **Timeout applies**: The same `timeout` setting applies to streaming requests. For long generations, increase the timeout.

```ts
// Handle stream errors
try {
  for await (const chunk of client.chat.completions.create({
    model: 'deepbrain-router',
    messages: [{ role: 'user', content: '...' }],
    stream: true,
  })) {
    process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
  }
} catch (e) {
  if (e instanceof SkytellsError) {
    if (e.errorId === 'REQUEST_TIMEOUT') {
      // Stream took too long — increase timeout
    } else if (e.errorId === 'NETWORK_ERROR') {
      // Connection dropped — streams are not auto-retried
    }
  }
}
```

---

## Custom Fetch

Inject a custom `fetch` for advanced scenarios:

### Proxy all requests

```ts
const client = Skytells(apiKey, {
  fetch: (url, opts) =>
    globalThis.fetch(url.toString().replace('api.skytells.ai', 'my-proxy.example.com'), opts),
});
```

### Add request logging

```ts
const client = Skytells(apiKey, {
  fetch: async (url, opts) => {
    console.log('→', opts?.method ?? 'GET', url);
    const res = await globalThis.fetch(url, opts);
    console.log('←', res.status, url);
    return res;
  },
});
```

### Mock for testing

```ts
const mockFetch = jest.fn().mockResolvedValue(
  new Response(JSON.stringify({ id: 'pred_test', status: 'succeeded', output: ['url'] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }),
);

const client = Skytells('sk-test', { fetch: mockFetch });
```

---

## Configuration Reference

| Option | Default (default/node) | Default (edge) | Notes |
|--------|----------------------|----------------|-------|
| `timeout` | 60 000 ms | 25 000 ms | Per-request client timeout |
| `retry.retries` | 0 | 0 | Non-streaming only |
| `retry.retryDelay` | 1 000 ms | 1 000 ms | Linear: `delay × attempt` |
| `retry.retryOn` | `[429,500,502,503,504]` | same | Status codes triggering retry |
| `wait.interval` | 5 000 ms | 5 000 ms | Poll frequency |
| `wait.maxWait` | undefined (no limit) | **set explicitly!** | Total wait budget |
| Cache TTL | 600 000 ms (10 min) | same | Model compat cache |
| Cache max slugs | 64 | 16 | Model compat cache size |
