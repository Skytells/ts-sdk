# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] - 2026-03-21

In this release, we're introducing new APIs — Chat, Embeddings, Responses, Safety, Webhooks, and the Orchestrator sub-client for smart workflow automation — alongside a complete documentation suite, HTTP reliability hardening, and full TypeScript type coverage for all new surfaces.

> Please refer to [Skytells Learn](https://learn.skytells.ai) for full documentaiton

### Added

#### New API modules
- **Chat** (`client.chat`) — OpenAI-compatible `chat.completions.create()` supporting non-streaming and streaming (`stream: true`) responses with SSE. Exported as `Chat` / `Completions`. See [Chat.md](./docs/Chat.md).
- **Embeddings** (`client.embeddings`) — `embeddings.create()` returning vector embeddings for text inputs with model selection and encoding format control. Exported as `Embeddings`. See [Embeddings.md](./docs/Embeddings.md).
- **Responses** (`client.responses`) — new Responses API (`responses.create()`) with non-streaming and streaming (`stream: true`) modes, returning `ResponsesResponse` / `ResponsesStreamEvent`. Exported with `ResponsesCreateParams`, `ResponsesResponse`, `ResponsesStreamEvent`. See [Responses.md](./docs/Responses.md).
- **Safety** (`client.safety`) — proactive content moderation: `safety.checkText()`, `safety.checkImage()`, `safety.evaluate()` for prediction output, `safety.wasFiltered()`. Built-in `SafetyTemplates` (`strict`, `moderate`, `permissive`, `imageGeneration`, `codeGeneration`). See [Safety.md](./docs/Safety.md).
- **Webhooks** (`client.webhookListener()` / `client.listen()`) — inbound webhook handling with HMAC-SHA256 signature verification (`verifySkytellsWebhookSignature`), event routing (`webhookRoutesForPrediction`), and a composable `WebhookListener`. Web Crypto–only implementation (no Node.js `crypto` dependency). Exported: `Webhook`, `WebhookListener`, `WebhookEvent`, `createWebhookListener`, `SKYTELLS_WEBHOOK_SIGNATURE_HEADER`. See [Webhooks.md](./docs/Webhooks.md).
- **Orchestrator** (`client.orchestrator`) — full sub-client with namespaces `workflows`, `executions`, `webhooks`, `integrations`, `apiKeys`, `ai`, `user`. Requires `ClientOptions.orchestratorApiKey` (`wfb_…`, separate from `sk-…`). Bearer-only transport; the Skytells platform key is never forwarded to Orchestrator. One-time `console.warn` if the key does not start with `wfb_`. Exported: `Orchestrator` and all seven namespace classes. See [Orchestrator.md](./docs/Orchestrator.md).
- **Prediction URL resolution** — `resolvePredictionResourceUrl()` and `PredictionResourceKey` resolve a human-readable key (`image`, `video`, `audio`, …) from a `PredictionResponse.urls` map, with fallback to the client base URL.

#### New types
- **`inference.types.ts`** — `SafetyCategory`, `SafetySeverity`, full content-filter result interfaces (`ContentFilterResult`, `PromptContentFilterResults`, `ChoiceContentFilterResults`), tool-calling types (`ChatCompletionTool`, `ChatCompletionMessageToolCall`), chat message param types for all roles, `ChatCompletion`, `ChatCompletionChunk`, `Embedding`, `CreateEmbeddingResponse`, `EmbeddingCreateParams`, `SafetyTemplateConfig`, `SafetyEvaluationResult`, `SafetyCheckResult`, `SafetyCheckOptions`, and Responses types (`ResponsesInputMessage`, `ResponsesOutputMessage`, `ResponsesContentFilter`, `ResponsesUsage`).
- **`orchestrator.types.ts`** — all Orchestrator request/response shapes.
- **`SkytellsRuntime`** — `'default' | 'edge' | 'node' | 'browser'` for environment-aware defaults.
- **`ClientOptions.orchestratorApiKey`** / **`ClientOptions.orchestratorBaseUrl`** — Orchestrator auth and host configuration.
- **`ApiErrorId`** — exhaustive `enum` of every error code thrown by the SDK: `SDK_ERROR`, `FORBIDDEN`, `INVALID_REQUEST`, `RATE_LIMITED`, `INFERENCE_RATE_LIMITED`, `INFERENCE_TIMEOUT`, `SERVICE_UNAVAILABLE`, `INFERENCE_ERROR`, `CONTENT_POLICY_VIOLATION`, `ENDPOINT_NOT_FOUND`, `ABORTED`, `WEBHOOK_SIGNATURE_INVALID`, `UNKNOWN_ERROR`, `HTTP_ERROR`, `API_ERROR`, `SERVER_ERROR`, `INVALID_JSON`, `REQUEST_TIMEOUT`, `NETWORK_ERROR`, `WAIT_TIMEOUT`, `PREDICTION_FAILED`.
- **`PredictionSdkOptions`** — `compatibilityCheck`, `webhook`, `interval`, `maxWait`, `signal` for `predict` / `run`.

#### New constants
- `API_BASE_URL`, `ORCHESTRATOR_BASE_URL` — exported base URL strings.
- `HTTP_DEFAULT_REQUEST_TIMEOUT_MS` (60 000 ms), `EDGE_DEFAULT_REQUEST_TIMEOUT_MS` (25 000 ms).
- `PREFETCHED_MODEL_CACHE_TTL_MS` (10 min), `PREFETCHED_MODEL_CACHE_MAX_SLUGS` (64), `EDGE_PREFETCH_MAX_SLUGS` (16).

#### Tooling & DX
- **Prettier** — `.prettierrc.json` + `.prettierignore` added for consistent formatting.
- **Husky + commitlint** — conventional-commit enforcement on every commit.
- **ESLint `tsconfig.eslint.json`** — separate TypeScript project for linting that includes both `src/` and `tests/` without inheriting the build exclusion of test files.
- **Live test suites** — `tests/sdk.live.test.ts`, `tests/chat-responses.live.test.ts`, `tests/prediction.live.test.ts`, `tests/orchestrator.live.test.ts`, `tests/http-hardening.test.ts`, `tests/inference.integration.test.ts`, `tests/webhooks.test.ts`, `tests/orchestrator.test.ts`.

### Fixed

- **HTTP:** Clamped invalid `timeout` / `retry` options; capped retry count and per-attempt delay to max-timer value; safe `lastError` fallback if retry loop ends without a captured error; `JSON.stringify` failures surface as `SDK_ERROR`; stream body cancelled when `getReader()` is unavailable; `throw lastError` guard after retries for text/buffer helpers; central `isAbortError` for timeouts; SSE / NDJSON line parsing uses incremental newline scan instead of repeated full-buffer `split` — lower CPU and memory on long streams.
- **`ENDPOINTS` path safety:** All user-controlled URL segments (model slug, prediction id) are now wrapped in `encodeURIComponent`.
- **`wait` / `delay`:** Fixed double-settle race; abort listener now reliably removed after timer fires or signal fires; invalid `interval` / `maxWait` values (NaN, negative) are ignored and replaced with defaults.

### Changed

- **`createClient()`** — marked `@deprecated`; emits a one-time `console.warn` directing developers to `import Skytells from "skytells"`.
- **`docs/Guide.md`** — replaced legacy quickstart content with a full guide covering all new modules.

### Removed

- **`docs/SDK.md`** — superseded by the new per-module docs and `SDKReference.md`.

### Documentation

New files added to `docs/`:

| File | Contents |
|------|----------|
| [Architecture.md](./docs/Architecture.md) | System design, module relationships, transport internals |
| [Chat.md](./docs/Chat.md) | Chat completions — streaming and non-streaming |
| [Client.md](./docs/Client.md) | Full `SkytellsClient` reference: options, methods, sub-APIs |
| [Embeddings.md](./docs/Embeddings.md) | Embeddings API usage and parameters |
| [Errors.md](./docs/Errors.md) | `SkytellsError`, `ApiErrorId`, error handling patterns |
| [Orchestrator.md](./docs/Orchestrator.md) | Orchestrator sub-client, auth, all namespaces |
| [Prediction.md](./docs/Prediction.md) | Prediction lifecycle, polling, streaming, queue |
| [Reliability.md](./docs/Reliability.md) | Retries, timeouts, abort signals, edge compatibility |
| [Responses.md](./docs/Responses.md) | Responses API — streaming and non-streaming |
| [Safety.md](./docs/Safety.md) | Content moderation, templates, prediction evaluation |
| [SDKReference.md](./docs/SDKReference.md) | Quick API reference for all exports |
| [Webhooks.md](./docs/Webhooks.md) | Inbound webhooks, signature verification, routing |
| [.env.example](./docs/.env.example) | All supported environment variables with descriptions |


## [1.0.3] - 2026-03-15

Please note: This version have some major changes.

### Added

- **Robust Error Handling**: Improved error propagation and retry logic in HTTP layer
- **Background Prediction & Polling**: Support for running predictions asynchronously and polling for results
- **Queue/Dispatch**: Added queue management for predictions
- **Progress Callback**: Receive progress updates during prediction
- **LLM-Friendly JSDoc**: All methods documented for AI/LLM consumption
- **Models & Predictions Sub-APIs**: `skytells.models` and `skytells.predictions` APIs
- **Next.js/Edge Support**: Custom fetch option for cache workaround
- **Detailed Documentation**: Added docs/SDK.md with full API reference and usage

### Changed

- **Method Renaming**: `listModels` → `models.list`, `listPredictions` → `predictions.list`, `getModel` → `models.get`
- **Deprecation Warnings**: Deprecated legacy methods with runtime warnings
- **SDK Entry Point Refactor**: `createClient` renamed to `Skytells`, now default and named export
- **Expanded ClientOptions**: Added timeout, retry, headers, fetch
- **Prediction Object**: Now supports `cancel()`, `delete()`, `wait()`, `onProgress()`

### Fixed

- **Compatibility**: Improved Next.js/Edge compatibility
- **Documentation**: Fixed and expanded API docs

### Removed

- Deprecated legacy method names (still available with warnings)

### Notes

- See docs/SDK.md for full API reference and usage examples.


## [1.0.2] - 2024-12-19

### Added

- **New Model Schema Support**: Updated `Model` interface to match the latest API schema
  - Added `Vendor` interface with vendor information (name, description, image_url, verified, slug, metadata)
  - Added `Pricing` interface with support for conditional pricing via `criterias` array
  - Added `PricingCriteria` interface for conditional pricing rules
  - Added `Service` interface for partner model service information
  - Added `ModelType` enum (IMAGE, VIDEO)
  - Added `PricingOperator` enum (EQUALS)
  - Added `PricingUnit` enum for common pricing units
  - Added `img_url` field to Model interface
  - Added `capabilities` array field to Model interface
  - Added optional `service` field for partner models

### Changed

- **Breaking**: `vendor` field changed from `string | undefined` to required `Vendor` object
- **Breaking**: Added required `capabilities` field (array of strings)
- `type` field now uses `ModelType` enum instead of plain string
- `privacy` field now uses `ModelPrivacy` enum instead of plain string
- `pricing` field structure updated to support conditional pricing with `criterias`
