# Errors

All SDK errors are instances of `SkytellsError`. This document covers the error class, all error IDs, error levels (SDK vs API vs network), and how to handle each category.

---

## `SkytellsError`

```ts
import { SkytellsError } from 'skytells';

class SkytellsError extends Error {
  errorId: string;          // machine-readable code — use for branching
  message: string;          // human-readable summary (also Error.message)
  details: string | Record<string, unknown>; // extra context for logging
  httpStatus: number;       // HTTP status code, or 0 for non-HTTP errors
  requestId?: string;       // Skytells request correlation ID (for support)
  errorType?: string;       // API error.type (e.g. "server_error")
  errorCode?: string;       // API error.code (e.g. "service_error")
}
```

### Checking for `SkytellsError`

`SkytellsError` uses `Object.setPrototypeOf` so `instanceof` works reliably across module boundaries and `require`:

```ts
try {
  const result = await client.run('flux-pro', { input: { prompt: '...' } });
} catch (e) {
  if (e instanceof SkytellsError) {
    // SDK or API error — handle by errorId
    switch (e.errorId) {
      case 'RATE_LIMIT_EXCEEDED':
        // retry after delay
        break;
      case 'MODEL_NOT_FOUND':
        // invalid model slug
        break;
      default:
        throw e; // rethrow unexpected errors
    }
  }
  throw e; // non-SkytellsError: rethrow
}
```

---

## Error Levels

Errors fall into three levels based on their origin:

### SDK-level errors (`httpStatus: 0`)

These originate inside the SDK itself — no HTTP response was received, or the error is client-side logic.

| `errorId` | When |
|-----------|------|
| `SDK_ERROR` | Generic SDK guard (e.g. `orchestratorApiKey` not set, unexpected state) |
| `ABORTED` | `AbortSignal` fired during `wait()` or `run()` polling |
| `WAIT_TIMEOUT` | `wait()` exceeded `maxWait` milliseconds |
| `PREDICTION_FAILED` | `run()` received a `"failed"` terminal status from the prediction |
| `INVALID_JSON` | Response body was not valid JSON when JSON was expected |
| `WEBHOOK_SIGNATURE_INVALID` | Inbound webhook signature did not match HMAC-SHA256 |

---

### API-level errors (`httpStatus >= 400`)

These come from the Skytells API — the request completed but the server returned an error response.

| `errorId` | `httpStatus` | When |
|-----------|-------------|------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Key valid but lacks permission for the resource |
| `MODEL_NOT_FOUND` | 404 | Model slug does not exist |
| `ENDPOINT_NOT_FOUND` | 404 | Path does not exist (wrong endpoint) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests — slow down |
| `RATE_LIMITED` | 429 | General rate limit |
| `INFERENCE_RATE_LIMITED` | 429 | Inference-specific rate limit |
| `INVALID_INPUT` | 422 | Input validation failed |
| `INVALID_PARAMETER` | 422 | One or more parameters invalid |
| `INVALID_REQUEST` | 400 | Malformed request body |
| `INSUFFICIENT_CREDITS` | 402 | Account out of credits |
| `PAYMENT_REQUIRED` | 402 | Payment required to proceed |
| `ACCOUNT_SUSPENDED` | 403 | Account is suspended |
| `SECURITY_VIOLATION` | 403 | Request blocked by security policy |
| `CONTENT_POLICY_VIOLATION` | 451 | Content violates usage policy |
| `INFERENCE_ERROR` | 500 | Model inference failed on the server |
| `INFERENCE_TIMEOUT` | 504 | Model took too long to respond |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Temporary service unavailability |
| `API_ERROR` | varies | Simple API error envelope (`response` string only) |
| `HTTP_ERROR` | varies | HTTP error without a recognised structured body |
| `SERVER_ERROR` | varies | Non-JSON or unexpected successful body / missing stream |

---

### Network-level errors (`httpStatus: 0`)

These occur before a response is received or due to transport failures.

| `errorId` | When |
|-----------|------|
| `NETWORK_ERROR` | `fetch()` threw, DNS failure, connection refused |
| `REQUEST_TIMEOUT` | Client-side `AbortController` timeout fired before a response |

---

## `ApiErrorId` enum

All known error IDs are exported as the `ApiErrorId` enum for safe branching:

```ts
import { ApiErrorId } from 'skytells';

if (e.errorId === ApiErrorId.RATE_LIMIT_EXCEEDED) { ... }
if (e.errorId === ApiErrorId.MODEL_NOT_FOUND) { ... }
```

---

## Handling Common Errors

### Rate limiting

```ts
import { SkytellsError } from 'skytells';

async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SkytellsError &&
        (e.errorId === 'RATE_LIMIT_EXCEEDED' || e.errorId === 'INFERENCE_RATE_LIMITED')) {
      // Wait and retry once
      await new Promise(r => setTimeout(r, 5000));
      return fn();
    }
    throw e;
  }
}
```

Or use the SDK's built-in retry:

```ts
const client = Skytells(apiKey, {
  retry: { retries: 3, retryDelay: 1000, retryOn: [429] },
});
```

### Authentication errors

```ts
if (e.errorId === 'UNAUTHORIZED') {
  // Check SKYTELLS_API_KEY is set and starts with 'sk-'
  // Make sure it hasn't expired or been revoked in the dashboard
}
if (e.errorId === 'FORBIDDEN') {
  // The key is valid but lacks permissions for this specific resource
}
```

### Model not found

```ts
if (e.errorId === 'MODEL_NOT_FOUND') {
  // Check the model slug — use client.models.list() to find valid slugs
  const models = await client.models.list();
  console.log(models.map(m => m.name));
}
```

### Insufficient credits

```ts
if (e.errorId === 'INSUFFICIENT_CREDITS' || e.errorId === 'PAYMENT_REQUIRED') {
  // Redirect user to billing or pause API usage
  console.error('Please top up your Skytells credits at app.skytells.ai/billing');
}
```

### Timeout

```ts
// REQUEST_TIMEOUT: client-side timeout
if (e.errorId === 'REQUEST_TIMEOUT') {
  // Increase client timeout or reduce complexity of the request
}

// WAIT_TIMEOUT: wait() polling exceeded maxWait
if (e.errorId === 'WAIT_TIMEOUT') {
  // Increase maxWait or switch to webhook-based notification
}

// INFERENCE_TIMEOUT: model took too long on the server
if (e.errorId === 'INFERENCE_TIMEOUT') {
  // Model timed out — retry or simplify input
}
```

### Webhook signature failure

```ts
if (e.errorId === 'WEBHOOK_SIGNATURE_INVALID') {
  // Reject the request — do not process the payload
  return res.status(401).json({ error: 'Invalid webhook signature' });
}
```

### Prediction failed

```ts
// When using client.run(), a failed prediction throws PREDICTION_FAILED
if (e.errorId === 'PREDICTION_FAILED') {
  // Access the full prediction via e.details
  console.error('Prediction failed:', e.message, e.details);
}
```

### User abort

```ts
const controller = new AbortController();

// Abort after 10 seconds
const timer = setTimeout(() => controller.abort(), 10_000);

try {
  const result = await client.wait(prediction, { signal: controller.signal });
  clearTimeout(timer);
} catch (e) {
  if (e instanceof SkytellsError && e.errorId === 'ABORTED') {
    console.log('User cancelled the wait');
  }
}
```

---

## `requestId` — Support Correlation

When an API error includes a request ID, it's available on the error:

```ts
} catch (e) {
  if (e instanceof SkytellsError && e.requestId) {
    console.error(`Skytells request ID for support: ${e.requestId}`);
  }
}
```

Include this when contacting Skytells support.

---

## `details` field

`details` is safe to log but is not always user-facing copy:

```ts
console.error(e.details);
// may be: "Model 'xyz' not found on Skytells"
// or:     { category: "inference", context: "..." }   (structured object)
```

---

## `errorType` and `errorCode`

When the API returns structured error metadata, these fields are populated:

```ts
e.errorType; // e.g. "server_error", "invalid_request_error"
e.errorCode; // e.g. "service_error", "model_not_found"
```

These complement `errorId` — use `errorId` for branching, `errorType`/`errorCode` for detailed logging.

---

## Unknown / Future Error IDs

The API may return error IDs not listed in `ApiErrorId`. Always handle the default case:

```ts
switch (e.errorId) {
  case 'RATE_LIMIT_EXCEEDED': ...
  case 'MODEL_NOT_FOUND': ...
  default:
    // Unknown or future error — log and rethrow or surface to user
    logger.error('skytells_error', {
      errorId: e.errorId,
      httpStatus: e.httpStatus,
      requestId: e.requestId,
    });
    throw e;
}
```
