# Webhooks

Webhooks let Skytells notify your server about prediction lifecycle events via HTTP POST — instead of polling. They are especially useful for long-running predictions (image/video/audio generation) where holding a connection open is impractical.

---

## Overview

There are two sides to webhooks:

| Side | Purpose | SDK feature |
|------|---------|-------------|
| **Outbound** | Attach a callback URL to a prediction request | `Webhook` class, `WebhookEvent` enum |
| **Inbound** | Receive and verify Skytells's HTTP POSTs on your server | `WebhookListener`, `verifySkytellsWebhookSignature` |

---

## Outbound Webhooks — Subscribing to Events

### Using the `Webhook` class

```ts
import Skytells, { Webhook, WebhookEvent } from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY);

await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: 'An astronaut on Mars' },
  webhook: new Webhook(
    'https://api.example.com/hooks/skytells',
    [WebhookEvent.COMPLETED, WebhookEvent.FAILED],
  ).toJSON(),
});
```

You can also pass a plain object (the client normalizes both):

```ts
await client.predictions.create({
  model: 'flux-pro',
  input: { prompt: '...' },
  webhook: {
    url: 'https://api.example.com/hooks/skytells',
    events: ['completed', 'failed', 'started'],
  },
});
```

### Webhook events

```ts
enum WebhookEvent {
  COMPLETED = 'completed', // prediction.status === 'succeeded'
  FAILED    = 'failed',    // prediction.status === 'failed'
  CANCELED  = 'canceled',  // prediction.status === 'cancelled'
  STARTED   = 'started',   // prediction.status === 'started' or 'starting'
}
```

### `Webhook` class

```ts
const webhook = new Webhook(
  'https://api.example.com/hooks/skytells', // HTTPS endpoint
  [WebhookEvent.COMPLETED, WebhookEvent.FAILED],
);

webhook.url;    // "https://api.example.com/hooks/skytells"
webhook.events; // readonly ["completed", "failed"]
webhook.toJSON(); // { url: '...', events: ['completed', 'failed'] }
```

---

## Inbound Webhooks — Receiving Events

Skytells POSTs the prediction JSON to your URL and includes an `X-Skytells-Signature` header for HMAC verification.

### Signature header

```
X-Skytells-Signature: <hex encoded HMAC-SHA256>
```

**Must verify against the raw body string** — do not re-serialize the parsed JSON. Re-serializing changes whitespace and key order, breaking the HMAC check.

---

## `WebhookListener` — Framework-agnostic Handler

`WebhookListener` handles the full inbound pipeline: signature verification → JSON parse → handler dispatch.

### Setup

```ts
import Skytells, { createWebhookListener, WebhookEvent } from 'skytells';

const listener = createWebhookListener({
  mode: 'general',        // 'general' (default) or 'enterprise'
  apiKey: process.env.SKYTELLS_API_KEY, // for mode: 'general'
  verifySignature: true,  // always true in production (default)
});

// Register handlers
listener.on(WebhookEvent.COMPLETED, async (prediction) => {
  console.log('Prediction completed:', prediction.id);
  console.log('Output:', prediction.output);
  await saveToDatabase(prediction);
});

listener.on(WebhookEvent.FAILED, async (prediction) => {
  console.error('Prediction failed:', prediction.id, prediction.response);
});
```

Or use the client factory (defaults `apiKey` from the client's platform key):

```ts
const client = Skytells(process.env.SKYTELLS_API_KEY);

const listener = client.webhookListener({ mode: 'general' });
// apiKey is automatically set from client's key
```

### Framework integration

#### Next.js App Router

```ts
// app/api/webhooks/skytells/route.ts
import { createWebhookListener, WebhookEvent } from 'skytells';

const listener = createWebhookListener({
  mode: 'general',
  apiKey: process.env.SKYTELLS_API_KEY!,
});

listener.on(WebhookEvent.COMPLETED, async (prediction) => {
  // handle completed prediction
});

export async function POST(req: Request): Promise<Response> {
  return listener.handleRequest(req);
}
```

#### Express

```ts
import express from 'express';
import { createWebhookListener, WebhookEvent } from 'skytells';

const app = express();
const listener = createWebhookListener({
  mode: 'general',
  apiKey: process.env.SKYTELLS_API_KEY!,
});

listener.on(WebhookEvent.COMPLETED, async (prediction) => {
  console.log('Done:', prediction.id, prediction.output);
});

// IMPORTANT: Use raw body — do NOT parse body as JSON before passing to listener
app.post('/hooks/skytells', express.raw({ type: '*/*' }), async (req, res) => {
  const rawBody = req.body.toString('utf8');
  try {
    await listener.handle(rawBody, req.headers as Record<string, string>);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof SkytellsError) {
      res.status(e.httpStatus || 400).json({ error: e.message, errorId: e.errorId });
    } else {
      throw e;
    }
  }
});
```

#### Hono / Cloudflare Workers / Bun

```ts
import { Hono } from 'hono';
import { createWebhookListener, WebhookEvent } from 'skytells';

const app = new Hono();
const listener = createWebhookListener({
  mode: 'general',
  apiKey: process.env.SKYTELLS_API_KEY!,
});

listener.on(WebhookEvent.COMPLETED, async (prediction) => { ... });

app.post('/hooks/skytells', async (c) => {
  return listener.handleRequest(c.req.raw);
});
```

---

## Route Matching

`WebhookListener.on()` (alias: `listen()`) accepts four route patterns:

| Pattern | Fires on |
|---------|---------|
| `WebhookEvent.COMPLETED` = `'completed'` | `status === 'succeeded'` |
| `WebhookEvent.FAILED` = `'failed'` | `status === 'failed'` |
| `WebhookEvent.CANCELED` = `'canceled'` | `status === 'cancelled'` |
| `WebhookEvent.STARTED` = `'started'` | `status === 'started'` or `'starting'` |
| `'prediction.succeeded'` | Exact status string match |
| `'prediction.failed'` | Exact status string match |
| `'prediction.cancelled'` | Exact status string match |
| `'prediction.pending'` | Exact status string match |
| `'prediction.*'` | Any prediction status change |
| `'*'` | All events |

Multiple handlers on the same route run **sequentially** in registration order:

```ts
listener.on('*', async (p) => { await logToAuditLog(p); });
listener.on(WebhookEvent.COMPLETED, async (p) => { await processOutput(p); });
listener.on(WebhookEvent.FAILED, async (p) => { await alertOps(p); });
```

### Remove a handler

```ts
const handler = async (p: PredictionResponse) => { ... };
listener.on(WebhookEvent.COMPLETED, handler);

// Later:
listener.off(WebhookEvent.COMPLETED, handler);
```

---

## Manual: `listener.handle()`

Use `handle()` when you need to process the body and headers yourself:

```ts
const prediction = await listener.handle(rawBodyString, headers);
// Returns the parsed PredictionResponse after all handlers complete
```

Throws:
- `SkytellsError('WEBHOOK_SIGNATURE_INVALID')` if signature doesn't match
- `SkytellsError('INVALID_JSON')` if body is not valid JSON

---

## `listener.dispatch()` — Skip Verification

If you've already verified the body externally, call `dispatch()` directly:

```ts
// No signature check — only use in trusted, pre-verified contexts
await listener.dispatch(prediction);
```

---

## Manual Signature Verification

Use `verifySkytellsWebhookSignature` standalone if you're not using `WebhookListener`:

```ts
import { verifySkytellsWebhookSignature } from 'skytells';

const isValid = await verifySkytellsWebhookSignature(
  rawBodyString,            // exact bytes as received
  req.headers['x-skytells-signature'],
  { mode: 'general', apiKey: process.env.SKYTELLS_API_KEY! },
);

if (!isValid) {
  return res.status(401).json({ error: 'Invalid signature' });
}

const prediction = JSON.parse(rawBodyString);
```

### Verification modes

| Mode | HMAC key |
|------|----------|
| `'general'` | Your `sk-…` API key |
| `'enterprise'` | Dashboard webhook secret (different value) |

---

## Signature Verification Implementation

The SDK uses Web Crypto (`crypto.subtle`) for HMAC-SHA256. This requires:
- **Node.js 19+** (built-in `crypto.subtle`)
- **Node.js 18** with `--experimental-global-webcrypto` flag
- **Edge runtimes** (Cloudflare Workers, Vercel Edge) — natively supported
- **Browser** — natively supported (`window.crypto.subtle`)

If `crypto.subtle` is not available, `verifySkytellsWebhookSignature` throws `SkytellsError('SDK_ERROR', 'crypto.subtle is not available')`.

The hex comparison is **timing-safe** to prevent timing attacks:

```ts
// Internal implementation — character-by-character XOR comparison
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) {
    x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return x === 0;
}
```

---

## `handleRequest()` Response Codes

`WebhookListener.handleRequest(req: Request): Promise<Response>` returns:

| Condition | Status | Body |
|-----------|--------|------|
| Handlers completed | 200 | `{ ok: true }` |
| Invalid signature | 401 | `{ error, errorId: 'WEBHOOK_SIGNATURE_INVALID' }` |
| Invalid JSON body | 400 | `{ error, errorId: 'INVALID_JSON' }` |
| Other `SkytellsError` | `httpStatus` | `{ error, errorId }` |
| Other errors | Re-thrown | — |

---

## Security Best Practices

- **Always verify signatures in production** — `verifySignature: false` is only for local development.
- **Read the raw body before any middleware parses it** — body parsers (JSON, form) consume the stream. Pass the raw bytes/string to the listener.
- **Never re-serialize**: `JSON.stringify(JSON.parse(rawBody))` will break HMAC because key order and whitespace may differ from the original.
- **HTTPS only**: Webhook endpoints must be reachable via HTTPS in production.
- **Treat handler failures as retryable**: If your handler throws, Skytells may retry the webhook. Make handlers idempotent (safe to call multiple times with the same payload).
- **Note the timing in `outputs`**: The prediction in the webhook payload may have `output` only when `status === 'succeeded'`.
