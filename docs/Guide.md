# Getting Started

This guide walks you through installing the Skytells JS SDK, configuring a client, and running your first prediction, chat completion, and embedding.

---

## Installation

```bash
npm install skytells
# or
yarn add skytells
# or
pnpm add skytells
```

**Requirements**: Node.js 18+ (for `fetch` and `crypto.subtle`). Works in Deno, Bun, Cloudflare Workers, Vercel Edge, and any runtime with the Web Fetch API.

---

## Obtain an API Key

Sign up at [skytells.ai](https://skytells.ai) and copy your API key from the dashboard. It starts with `sk-`.

Store it in an environment variable — never hard-code it:

```bash
# .env
SKYTELLS_API_KEY=sk-your-api-key-here
```

---

## Create a Client

```ts
import Skytells from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY);
```

You can also use the named class:

```ts
import { SkytellsClient } from 'skytells';

const client = new SkytellsClient(process.env.SKYTELLS_API_KEY);
```

Both are identical. The `Skytells()` factory is the conventional approach.

### Client Options

```ts
const client = Skytells(process.env.SKYTELLS_API_KEY, {
  // Request timeout in ms (default: 60 000)
  timeout: 30_000,

  // Retry on transient failures (default: 0 retries)
  retry: {
    retries: 3,
    retryDelay: 1000, // linear backoff: 1s, 2s, 3s
    retryOn: [429, 500, 502, 503, 504],
  },

  // Custom headers added to every request
  headers: { 'X-App-Version': '1.0.0' },

  // Custom fetch (e.g. disable Next.js caching)
  fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),

  // Runtime hint: tightens timeouts for serverless/edge
  runtime: 'edge',
});
```

See [SDKReference.md](./SDKReference.md) for all `ClientOptions` fields.

---

## Your First Prediction

```ts
import Skytells from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY);

// run() submits the prediction and waits for it to complete
const prediction = await client.run('flux-pro', {
  input: { prompt: 'An astronaut riding a unicorn through a galaxy' },
});

console.log(prediction.outputs()); // → ["https://cdn.skytells.ai/..."]
```

`run()` returns a `Prediction` object. Call `.outputs()` to get the result (normalises single-item arrays automatically), or `.raw()` to get the full `PredictionResponse`.

---

## Your First Chat Completion

```ts
const completion = await client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [
    { role: 'system', content: 'You are a concise assistant.' },
    { role: 'user', content: 'What is the capital of France?' },
  ],
});

console.log(completion.choices[0].message.content); // → "Paris"
```

### Streaming Chat

```ts
const stream = client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [{ role: 'user', content: 'Write a haiku about the sea.' }],
  stream: true,
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content ?? '';
  process.stdout.write(delta);
}
```

---

## Your First Embedding

```ts
const result = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'The quick brown fox jumps over the lazy dog',
});

const vector = result.data[0].embedding; // number[]
console.log(`Dimensions: ${vector.length}`);
```

---

## Background Prediction (Non-blocking)

If you don't want to block while the model runs, create a prediction and poll it yourself:

```ts
// Submit — returns immediately with status: "pending"
const pending = await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'A serene mountain lake at dawn' },
});

console.log(pending.id);     // "pred_abc123"
console.log(pending.status); // "pending"

// Poll until done
const result = await client.wait(pending);
console.log(result.output); // → "https://..."
```

---

## Batch Multiple Predictions

Use `queue()` + `dispatch()` to fire multiple predictions concurrently:

```ts
client.queue({ model: 'flux-pro', input: { prompt: 'A wolf in the forest' } });
client.queue({ model: 'flux-pro', input: { prompt: 'A dragon over a castle' } });
client.queue({ model: 'flux-pro', input: { prompt: 'A robot in a meadow' } });

const results = await client.dispatch();
// results: PredictionResponse[] — all fired concurrently
```

---

## Using Orchestrator

Orchestrator requires a separate `wfb_…` key:

```ts
const client = Skytells(process.env.SKYTELLS_API_KEY, {
  orchestratorApiKey: process.env.ORCHESTRATOR_API_KEY, // wfb_…
});

// List your workflows
const workflows = await client.orchestrator.workflows.list();

// Trigger a workflow via webhook
const result = await client.orchestrator.webhooks.execute('workflow-id', {
  inputKey: 'inputValue',
});
```

---

## TypeScript

The SDK is written in TypeScript and ships full type declarations. Everything is typed — no extra `@types` package needed.

```ts
import Skytells, { type PredictionResponse, type SkytellsError } from 'skytells';
```

---

## Error Handling

All SDK errors are `SkytellsError` instances with a machine-readable `errorId`:

```ts
import { SkytellsError } from 'skytells';

try {
  const prediction = await client.run('flux-pro', { input: { prompt: '...' } });
} catch (e) {
  if (e instanceof SkytellsError) {
    console.error(e.errorId);   // e.g. "RATE_LIMIT_EXCEEDED"
    console.error(e.httpStatus); // e.g. 429
    console.error(e.message);
  }
  throw e;
}
```

See [Errors.md](./Errors.md) for a complete reference of all error IDs.

---

## Next Steps

| Topic | Document |
|-------|----------|
| Predictions in depth | [Prediction.md](./Prediction.md) |
| Chat completions | [Chat.md](./Chat.md) |
| Responses API | [Responses.md](./Responses.md) |
| Embeddings | [Embeddings.md](./Embeddings.md) |
| Safety checks | [Safety.md](./Safety.md) |
| Webhooks | [Webhooks.md](./Webhooks.md) |
| Orchestrator | [Orchestrator.md](./Orchestrator.md) |
| Error reference | [Errors.md](./Errors.md) |
| Timeout & retry | [Reliability.md](./Reliability.md) |
| Full API reference | [SDKReference.md](./SDKReference.md) |
| SDK internals | [Architecture.md](./Architecture.md) |
