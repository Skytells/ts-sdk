# Architecture

This document describes the internal architecture of the Skytells JS SDK — module structure, transport layers, auth separation, lazy initialization, runtime adaptation, and the request lifecycle.

---

## Module Map

```
skytells (npm package)
└── src/
    ├── index.ts          ← public entry point, factory, re-exports
    ├── client.ts         ← SkytellsClient, Prediction, PredictionsAPI, ModelsAPI
    ├── http.ts           ← HTTP transport, retries, SSE/NDJSON streams, auth
    ├── endpoints.ts      ← API_BASE_URL, ORCHESTRATOR_BASE_URL, ENDPOINTS constants
    ├── chat.ts           ← Chat, Completions
    ├── responses.ts      ← Responses
    ├── embeddings.ts     ← Embeddings
    ├── safety.ts         ← Safety
    ├── orchestrator.ts   ← Orchestrator + 7 sub-resources
    ├── webhooks.ts       ← Webhook, WebhookListener, verifySkytellsWebhookSignature
    └── types/
        ├── index.ts             ← barrel re-export
        ├── shared.types.ts      ← SkytellsError, ClientOptions, ApiErrorId, Pagination
        ├── inference.types.ts   ← Chat, Responses, Embeddings, Safety types
        ├── predict.types.ts     ← PredictionRequest/Response, PredictionStatus, WaitOptions
        ├── model.types.ts       ← Model, Vendor
        └── orchestrator.types.ts ← Orchestrator body/response types
```

---

## Two Products, Two Transports

The SDK wraps two independent Skytells product lines. They share a single `SkytellsClient` instance but use **entirely separate HTTP stacks**:

| Product       | Key prefix | Base URL                          | Auth on the wire                          |
|---------------|------------|-----------------------------------|-------------------------------------------|
| **Inference** | `sk-…`     | `https://api.skytells.ai/v1`      | `x-api-key: sk-…` + `Authorization: Bearer sk-…` |
| **Orchestrator** | `wfb_…` | `https://orchestrator.skytells.ai` | `Authorization: Bearer wfb_…` only        |

**The SDK enforces this separation automatically.** The `HTTP` class has a `transport` discriminator:

- `transport: 'skytells'` — sends both `x-api-key` and `Authorization` headers.
- `transport: 'orchestrator'` — sends `Authorization: Bearer` only; any `x-api-key` in shared `ClientOptions.headers` is **stripped** by `applyAuthHeaders()` before the request leaves the client.

This means the Orchestrator (`wfb_…`) key is never sent to `api.skytells.ai`, and the platform (`sk-…`) key is never sent to `orchestrator.skytells.ai`.

---

## The `HTTP` Class

`src/http.ts` is the single internal transport layer. It is not exported as public API.

### Core methods

| Method | Retried? | Streaming? | Purpose |
|--------|----------|------------|---------|
| `request<T>()` | ✅ | ❌ | JSON REST requests (GET/POST/PATCH/DELETE) |
| `requestText()` | ✅ | ❌ | Plain text responses (e.g. TypeScript code export) |
| `requestBuffer()` | ✅ | ❌ | Binary responses (e.g. ZIP file download) |
| `requestStream<T>()` | ❌ | ✅ SSE | Server-Sent Events streaming |
| `requestNdjsonStream<T>()` | ❌ | ✅ NDJSON | Newline-delimited JSON streaming |
| `requestOptions()` | ❌ | ❌ | OPTIONS / CORS preflight |

### Retry logic

Only non-streaming requests are retried. The strategy is **linear backoff**:

```
delay = retryDelay × (attempt + 1)
```

Default `retryOn` status codes: `[429, 500, 502, 503, 504]`.  
Default `retryDelay`: 1000 ms. Default `retries`: 0 (no retry unless configured).

### Timeout

Every request uses an `AbortController` with `setTimeout`. The timer is **always cleared** in a `finally` block regardless of outcome, preventing timer leaks in serverless/edge environments.

Maximum safe timer value is capped at `2_147_483_647 ms` (32-bit signed int limit) to prevent `setTimeout` overflow.

### SSE / NDJSON streaming

Streams use the `ReadableStream` / `ReadableStreamDefaultReader` Web API. The parser uses a scanning loop (`while (nl >= 0)`) over an accumulated buffer — never `buffer.split('\n')` — so large chunks with many newlines are handled without splitting mid-message. The `finally` block cancels the reader and releases the response body.

### Auth headers

```ts
// transport: 'skytells'
headers['x-api-key'] = apiKey;
headers['Authorization'] = `Bearer ${apiKey}`;

// transport: 'orchestrator'
headers['Authorization'] = `Bearer ${orchestratorKey}`;
// x-api-key is stripped even if present in ClientOptions.headers
```

---

## `SkytellsClient` — Core Concepts

### Lazy singletons

All sub-resource accessors (`predictions`, `models`, `chat`, `responses`, `embeddings`, `safety`, `orchestrator`) are **lazy singletons**: an instance is created the first time the getter is accessed and cached for the lifetime of the client. This avoids allocating objects for APIs you never use.

```ts
// First access — allocates PredictionsAPI
client.predictions.create(...)

// Second access — returns cached instance
client.predictions.list()
```

The `orchestrator` getter additionally throws `SkytellsError('SDK_ERROR')` if `orchestratorApiKey` was not provided, giving a clear error at the usage site rather than at construction time.

### Edge runtime adaptation

When `runtime: 'edge'` is set, the SDK applies two changes automatically:

1. **Shorter default timeout**: 25 000 ms instead of 60 000 ms (only when the caller did not set `timeout` explicitly).
2. **Smaller compat model cache**: 16 slugs (`EDGE_PREFETCH_MAX_SLUGS`) instead of 64 (`PREFETCHED_MODEL_CACHE_MAX_SLUGS`).

One-time console hints are also logged (once per process) informing about edge-specific behaviors.

### Model compatibility cache

When `PredictionSdkOptions.compatibilityCheck: true` is passed on a `predictions.create` / `run` / `queue` call, the client fetches `GET /model/{slug}` before submitting the prediction. The result is cached in an in-memory `Map` keyed by slug with:

- **TTL**: 10 minutes (`PREFETCHED_MODEL_CACHE_TTL_MS = 600 000 ms`)
- **Max entries**: 64 (or 16 in edge mode) — oldest entries are evicted when the cap is reached

The check warns or throws if the model is chat-only (should use `client.chat.completions.create` instead of `client.predictions.create`).

---

## Prediction Lifecycle

```
client.predict()          → POST /predict (await: false) → PredictionResponse (status: pending)
client.predictions.create() → same as above

client.wait(response)     → polls GET /predictions/{id} until terminal status
                            (succeeded / failed / cancelled)

client.run(model, opts)   → POST /predict (await: true) → single awaited PredictionResponse
                            When onProgress given: POST + wait loop

client.queue() + client.dispatch() → accumulates PredictionRequests, then fires all concurrently
```

**Terminal statuses**: `succeeded`, `failed`, `cancelled` — polling stops on any of these.

**Default poll interval**: 5 000 ms.

The `Prediction` wrapper class (returned by `run`) holds a `PredictionResponse` reference and exposes convenience methods (`stream()`, `cancel()`, `delete()`). It resolves URLs from the `urls` field in the response when available, falling back to path templates.

---

## Webhook Architecture

```
Outbound (your server → Skytells):
  Webhook class → toJSON() → { url, events } in PredictionRequest.webhook

Inbound (Skytells → your server):
  POST arrives with X-Skytells-Signature header
  WebhookListener.handleRequest(req)
    → request.text()               (raw body preserved)
    → verifySkytellsWebhookSignature(rawBody, sig, options)
       HMAC-SHA256(body, key)      (Web Crypto / SubtleCrypto)
       timing-safe hex compare
    → JSON.parse(rawBody)          (only after verify)
    → webhookRoutesForPrediction() (computes route keys)
    → dispatch() to registered handlers
```

**Critical**: HMAC is computed over the **raw body bytes/string** as received. Re-serializing (e.g. `JSON.stringify(JSON.parse(body))`) will break verification because key order and whitespace may differ.

**Two modes**:
- `general` — HMAC key is your `sk-…` API key.
- `enterprise` — HMAC key is the dashboard-provisioned webhook secret.

---

## Entry Point and Factory

`src/index.ts` exports the `Skytells()` default factory:

```ts
export default function Skytells(apiKey?: string, options?: ClientOptions): SkytellsClient {
  return new SkytellsClient(apiKey, options);
}
```

The factory is the recommended entry point. `new SkytellsClient(...)` works identically — both are exported.

A deprecated `createClient()` alias is also exported for backward compatibility.

---

## Environment Variables

The SDK does **not** read environment variables directly. Call the factory with your key:

```ts
const client = Skytells(process.env.SKYTELLS_API_KEY);
```

---

## TypeScript ESM Build

The SDK is built as **ESM** with TypeScript source. Imports inside the source use `.js` extensions (ESM-compatible Node resolution). The compiled `dist/` contains:

- `dist/index.js` — ESM entry
- `dist/index.d.ts` — bundled type declarations

`tsconfig.json` targets `ES2022`+ with `"moduleResolution": "bundler"` / `"NodeNext"` depending on the build step. See `build.js` for the esbuild configuration.
