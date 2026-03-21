# Agent & maintainer guide (Skytells JS SDK)

This file is for **humans and coding agents** working on the repo. It summarizes architecture, invariants, and where to document or change behavior.

## Product split

| Surface | Key | Host | Auth on wire |
|--------|-----|------|----------------|
| Inference (predict, chat, embeddings, responses, predictions, models) | `sk-…` (1st arg to `Skytells()`) | `ClientOptions.baseUrl` / `API_BASE_URL` | `x-api-key` + `Authorization` |
| Orchestrator | `ClientOptions.orchestratorApiKey` (`wfb_…`) | `orchestratorBaseUrl` / `ORCHESTRATOR_BASE_URL` | Bearer only; **`x-api-key` stripped** from shared headers |

Never send the platform key to Orchestrator or the webhook key to `api.skytells.ai` — the SDK enforces separation in `HTTP` via `transport: 'skytells' | 'orchestrator'`.

## Prediction API reference payloads

- **`internal/`** — captured **v1 prediction** JSON (list + single-record examples). Described in **`internal/README.md`**. Use when aligning **`PredictionResponse`** / **`PaginatedResponse`** with production shapes; types in **`src/types/predict.types.ts`** remain the source of truth.

## Entry points

- **`src/index.ts`** — `@packageDocumentation`, `Skytells()` factory, re-exports.
- **`src/client.ts`** — `SkytellsClient`: predictions, `run`/`wait`, chat, embeddings, lazy `orchestrator`, webhooks.
- **`src/http.ts`** — Internal fetch: retries (non-stream only), timeouts (always cleared), SSE + NDJSON streams (reader/body cleanup).

## Documentation expectations

- **Public API**: JSDoc on classes and public methods with `@param`, `@returns`, `@throws` where non-obvious, and `@example` for main flows.
- **Errors**: Document `SkytellsError` + `errorId`; prefer `instanceof SkytellsError`.
- **Streams**: State explicitly that they are **not retried** and that abandoning iteration still triggers cleanup in `finally`.
- **User-facing prose**: `docs/*.md` should stay aligned with code (especially Orchestrator keys and Reliability).

## Changing HTTP behavior

- Retries: only `request`, `requestText`, `requestBuffer` (and shared execute path) — not `requestStream` / `requestNdjsonStream`.
- Stream parsers: use **`appendAndExtractCompleteLines`** (newline scan) — do not reintroduce **`buffer.split('\n')`** per chunk (bad on large SSE/NDJSON).
- **`ENDPOINTS.*` path builders**: keep **`encodeURIComponent`** on user-controlled segments (model slug, prediction id).
- New verbs or body types: extend `HttpJsonMethod` / helpers consistently; document in `http.ts` module header table.
- Orchestrator requests: preserve “no `x-api-key`” invariant when merging `ClientOptions.headers`.

## Tests

- `npm test` — Jest unit/integration.
- After substantive HTTP/client changes, run the full suite and `npm run build` (or `tsc`).

## Common pitfalls

- **Webhook signature**: verify against the **raw** body string; re-stringifying JSON breaks HMAC.
- **`wait` / `run` + `AbortSignal`**: timers and abort listeners must be cleared on settle (see `client.ts`).
- **Prediction URLs**: prefer API `urls` when present; else `resolvePredictionResourceUrl` + client base URL.
