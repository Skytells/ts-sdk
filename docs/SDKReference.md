# SDK Reference

Low-level reference for every public class, method, type, and constant in the Skytells JS SDK.

---

## Factory

### `Skytells(apiKey?, options?)` (default export)

Creates a `SkytellsClient`. The recommended entry point.

```ts
import Skytells from 'skytells';

const client = Skytells(apiKey?: string, options?: ClientOptions): SkytellsClient
```

### `createClient(apiKey?, options?)` _(deprecated)_

Alias of `Skytells()`. Use `Skytells()` instead.

---

## `SkytellsClient`

The main client class. Instantiate with `Skytells()` or `new SkytellsClient()`.

```ts
import { SkytellsClient } from 'skytells';
const client = new SkytellsClient(apiKey?: string, options?: ClientOptions);
```

### Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | `string \| undefined` | Platform key (`sk-…`). Can be omitted for Orchestrator-only usage. |
| `options` | `ClientOptions` | Client configuration. See [`ClientOptions`](#clientoptions). |

### Getters (lazy singletons)

| Property | Type | Description |
|----------|------|-------------|
| `client.predictions` | `PredictionsAPI` | CRUD for predictions |
| `client.prediction` | `PredictionsAPI` | Alias of `predictions` |
| `client.models` | `ModelsAPI` | Model catalog |
| `client.chat` | `Chat` | Chat completions + Responses |
| `client.responses` | `Responses` | Responses API |
| `client.embeddings` | `Embeddings` | Embeddings |
| `client.safety` | `Safety` | Content safety |
| `client.orchestrator` | `Orchestrator` | Orchestrator (throws if key not set) |
| `client.runtime` | `SkytellsRuntime` | Runtime from options |
| `client.config` | `{ runtime, requestTimeoutMs, prefetchMaxSlugs }` | Resolved settings |

### Methods

#### `client.predict(payload, sdk?)`

```ts
predict(payload: PredictionRequest, sdk?: PredictionSdkOptions): Promise<PredictionResponse>
```

Submits a prediction. Returns `PredictionResponse` immediately (status `"pending"` unless `await: true`).

#### `client.run(model, options, onProgress?, sdk?)`

```ts
run(
  model: string,
  options: RunOptions,
  onProgress?: OnProgressCallback,
  sdk?: PredictionSdkOptions,
): Promise<Prediction>
```

Submits and waits for a prediction. Returns a `Prediction` wrapper.  
When `onProgress` is provided, uses background mode (submit + `wait()` polling).

#### `client.wait(prediction, options?, onProgress?)`

```ts
wait(
  prediction: PredictionResponse,
  options?: WaitOptions,
  onProgress?: OnProgressCallback,
): Promise<PredictionResponse>
```

Polls `GET /predictions/{id}` until a terminal status (`succeeded`, `failed`, `cancelled`).

#### `client.queue(payload, sdk?)`

```ts
queue(payload: PredictionRequest, sdk?: PredictionSdkOptions): void
```

Adds a prediction to the in-memory queue. Does not fire a request.

#### `client.dispatch()`

```ts
dispatch(): Promise<PredictionResponse[]>
```

Fires all queued predictions concurrently via `Promise.all`. Clears the queue.

#### `client.webhookListener(options?)`

```ts
webhookListener(options?: WebhookListenerOptions): WebhookListener
```

Creates a `WebhookListener`. In `general` mode, defaults `apiKey` from the client's platform key.

---

## `ClientOptions`

```ts
interface ClientOptions {
  baseUrl?: string;              // Default: https://api.skytells.ai/v1
  timeout?: number;              // ms. Default: 60000 (25000 when runtime:'edge' and omitted)
  headers?: Record<string, string>; // Merged into every request
  retry?: RetryOptions;          // Retry config (non-streaming only)
  fetch?: typeof fetch;          // Custom fetch implementation
  runtime?: SkytellsRuntime;     // 'default' | 'edge' | 'node' | 'browser'
  orchestratorApiKey?: string;   // wfb_… key for client.orchestrator
  orchestratorBaseUrl?: string;  // Default: https://orchestrator.skytells.ai
}
```

---

## `RetryOptions`

```ts
interface RetryOptions {
  retries?: number;     // Retry attempts after first failure (default: 0)
  retryDelay?: number;  // Base delay in ms (default: 1000). Linear: delay × attempt
  retryOn?: number[];   // Status codes to retry (default: [429, 500, 502, 503, 504])
}
```

---

## `Prediction` class

Returned by `client.run()`.

| Member | Type | Description |
|--------|------|-------------|
| `prediction.id` | `string` | Prediction ID |
| `prediction.status` | `PredictionStatus` | Current status |
| `prediction.output` | `string \| string[] \| undefined` | Raw output field |
| `prediction.response` | `PredictionResponse` | Full response object |
| `prediction.outputs()` | `string \| string[] \| undefined` | Normalised output (collapses single-item arrays) |
| `prediction.raw()` | `PredictionResponse` | Full PredictionResponse |
| `prediction.stream()` | `Promise<PredictionResponse>` | Fetch stream metadata |
| `prediction.cancel()` | `Promise<PredictionResponse>` | Cancel the prediction |
| `prediction.delete()` | `Promise<PredictionResponse>` | Delete prediction and assets |

---

## `PredictionsAPI`

Access via `client.predictions` or `client.prediction`.

#### `predictions.create(payload, sdk?)`

```ts
create(payload: PredictionRequest, sdk?: PredictionSdkOptions): Promise<PredictionResponse>
```

Submit a background prediction (`await: false`).

#### `predictions.get(id, urls?)`

```ts
get(id: string, urls?: PredictionResponse['urls']): Promise<PredictionResponse>
```

Fetch a prediction by ID. When `urls.get` is present, uses that URL directly.

#### `predictions.list(options?)`

```ts
list(options?: PredictionsListOptions): Promise<PaginatedResponse<PredictionResponse>>
```

List predictions with optional filters and pagination.

---

## `PredictionRequest`

```ts
interface PredictionRequest {
  model: string;
  input: Record<string, any>;
  await?: boolean;   // Block until completion (default: false)
  stream?: boolean;  // Enable streaming output (default: false)
  webhook?: Webhook | { url: string; events: ReadonlyArray<string> };
}
```

---

## `RunOptions`

```ts
interface RunOptions {
  input: Record<string, any>;
  webhook?: Webhook | { url: string; events: ReadonlyArray<string> };
  stream?: boolean;
  interval?: number;    // Poll interval ms (background mode only, default: 5000)
  maxWait?: number;     // Max wait ms (background mode only)
  signal?: AbortSignal; // Abort background wait (background mode only)
}
```

---

## `WaitOptions`

```ts
interface WaitOptions {
  interval?: number;    // Poll interval in ms (default: 5000)
  maxWait?: number;     // Max total wait in ms. Throws WAIT_TIMEOUT if exceeded.
  signal?: AbortSignal; // Abort with ABORTED error
}
```

---

## `PredictionsListOptions`

```ts
interface PredictionsListOptions {
  page?: number;   // Page number (default: 1)
  since?: string;  // ISO date YYYY-MM-DD (inclusive from)
  until?: string;  // ISO date YYYY-MM-DD (inclusive to)
  model?: string;  // Filter by model slug
}
```

---

## `PredictionSdkOptions`

```ts
interface PredictionSdkOptions {
  compatibilityCheck?: boolean;
  // When true, prefetches model metadata to guard against chat-only models.
  // Cached per-client (10min TTL, 64 slugs max / 16 in edge mode).
}
```

---

## `PredictionResponse`

```ts
interface PredictionResponse {
  id: string;
  status: PredictionStatus;     // 'pending' | 'starting' | 'started' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
  type: PredictionType;         // 'inference' | 'training'
  stream: boolean;
  input: Record<string, any>;
  output?: string | string[];
  response?: string;            // Human-readable message (failures etc)
  created_at: string;           // ISO 8601
  started_at: string;
  completed_at: string;
  updated_at: string;
  privacy: string;
  source?: PredictionSource;    // 'api' | 'cli' | 'web'
  model?: { name: string; type: string };
  webhook?: { url: string | null; events: string[] };
  metrics?: {
    image_count?: number;
    predict_time?: number;  // inference seconds
    total_time?: number;    // wall-clock seconds
    asset_count?: number;
    progress?: number;      // 0–100
  };
  metadata?: {
    billing?: { credits_used: number };
    storage?: {
      files: Array<{ name: string; type: string; size: number; url: string }>;
    };
    data_available?: boolean;
  };
  urls?: {
    get?: string;
    cancel?: string;
    stream?: string;
    delete?: string;
  };
}
```

---

## `PredictionStatus` enum

```ts
enum PredictionStatus {
  PENDING    = 'pending',
  STARTING   = 'starting',
  STARTED    = 'started',
  PROCESSING = 'processing',
  SUCCEEDED  = 'succeeded',
  FAILED     = 'failed',
  CANCELLED  = 'cancelled',
}
```

---

## `PaginatedResponse<T>`

```ts
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
}
```

---

## `ModelsAPI`

Access via `client.models`.

#### `models.list(options?)`

```ts
list(options?: ModelFieldsOptions): Promise<Model[]>
```

#### `models.get(slug, options?)`

```ts
get(slug: string, options?: ModelFieldsOptions): Promise<Model>
```

#### `ModelFieldsOptions`

```ts
interface ModelFieldsOptions {
  fields?: string[]; // e.g. ['input_schema', 'output_schema']
}
```

---

## `Chat`

Access via `client.chat`. Exposes:
- `chat.completions` → `Completions`
- `chat.responses` → `Responses`

---

## `Completions`

Access via `client.chat.completions`.

#### `completions.create(params)`

```ts
// Non-streaming
create(params: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion>

// Streaming
create(params: ChatCompletionCreateParamsStreaming): AsyncIterable<ChatCompletionChunk>
```

**Key params** (`ChatCompletionCreateParamsBase`):

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | Model slug |
| `messages` | `ChatCompletionMessageParam[]` | Conversation history |
| `stream` | `boolean` | Enable streaming |
| `max_tokens` | `number` | Max completion tokens |
| `temperature` | `number` | Sampling temperature (0–2) |
| `top_p` | `number` | Nucleus sampling |
| `n` | `number` | Number of choices |
| `stop` | `string \| string[]` | Stop sequences |
| `presence_penalty` | `number` | Penalise new topics |
| `frequency_penalty` | `number` | Penalise repetition |
| `logprobs` | `boolean` | Include logprobs |
| `top_logprobs` | `number` | Top N logprobs |
| `tools` | `ChatCompletionTool[]` | Tool definitions |
| `tool_choice` | `ChatCompletionToolChoiceOption` | Tool invocation mode |
| `parallel_tool_calls` | `boolean` | Allow parallel tool calls |
| `user` | `string` | End-user identifier |

---

## `ChatCompletion`

```ts
interface ChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: CompletionUsage;
  system_fingerprint?: string;
  prompt_filter_results?: PromptFilterResult[];
}

interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'function_call' | null;
  logprobs?: unknown;
  content_filter_results?: ChoiceContentFilterResults;
}

interface ChatCompletionMessage {
  role: 'assistant';
  content: string | null;
  refusal?: string | null;
  tool_calls?: ChatCompletionMessageToolCall[];
}

interface CompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    accepted_prediction_tokens?: number;
    audio_tokens?: number;
    reasoning_tokens?: number;
    rejected_prediction_tokens?: number;
  };
  prompt_tokens_details?: {
    audio_tokens?: number;
    cached_tokens?: number;
  };
}
```

---

## `ChatCompletionChunk`

```ts
interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
    logprobs?: unknown;
    content_filter_results?: unknown;
  }>;
  usage?: CompletionUsage | null;
  system_fingerprint?: string | null;
  prompt_filter_results?: PromptFilterResult[];
}
```

---

## `ChatCompletionMessageParam` (union)

```ts
type ChatCompletionMessageParam =
  | { role: 'system'; content: string; name?: string }
  | { role: 'user'; content: string | ContentPart[]; name?: string }
  | { role: 'assistant'; content?: string | null; tool_calls?: ChatCompletionMessageToolCall[]; name?: string }
  | { role: 'tool'; content: string; tool_call_id: string }
  | { role: 'function'; name: string; content: string | null }; // deprecated
```

---

## `ChatCompletionTool`

```ts
interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>; // JSON Schema
    strict?: boolean | null;
  };
}

type ChatCompletionToolChoiceOption =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };
```

---

## `Responses`

Access via `client.responses` or `client.chat.responses`.

#### `responses.create(params)`

```ts
// Non-streaming
create(params: ResponsesCreateParams & { stream?: false | null }): Promise<ResponsesResponse>

// Streaming
create(params: ResponsesCreateParams & { stream: true }): AsyncIterable<ResponsesStreamEvent>
```

**Key params** (`ResponsesCreateParams`):

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | Model slug |
| `input` | `string \| ResponsesInputMessage[]` | Text or message array |
| `instructions` | `string \| null` | System instructions |
| `stream` | `boolean` | Enable SSE streaming |
| `max_output_tokens` | `number \| null` | Max output tokens |
| `temperature` | `number` | Sampling temperature |
| `top_p` | `number` | Nucleus sampling |
| `tools` | `ChatCompletionTool[]` | Tool definitions |
| `tool_choice` | `ChatCompletionToolChoiceOption` | Tool invocation mode |
| `reasoning` | `{ effort?, summary? }` | Reasoning config |
| `store` | `boolean` | Persist response server-side |
| `previous_response_id` | `string \| null` | Chain to prior response |
| `metadata` | `Record<string, unknown>` | Your labels |
| `user` | `string \| null` | End-user identifier |
| `truncation` | `string` | Truncation strategy |

---

## `ResponsesStreamEvent` (discriminated union)

```ts
type ResponsesStreamEvent =
  | { type: 'response.created';          sequence_number: number; response: ResponsesResponse }
  | { type: 'response.in_progress';      sequence_number: number; response: ResponsesResponse }
  | { type: 'response.completed';        sequence_number: number; response: ResponsesResponse }
  | { type: 'response.output_item.added'; sequence_number: number; output_index: number; item: ResponsesOutputMessage }
  | { type: 'response.output_item.done';  sequence_number: number; output_index: number; item: ResponsesOutputMessage }
  | { type: 'response.content_part.added'; sequence_number: number; output_index: number; content_index: number; item_id: string; part: ResponsesOutputContent }
  | { type: 'response.content_part.done';  sequence_number: number; output_index: number; content_index: number; item_id: string; part: ResponsesOutputContent }
  | { type: 'response.output_text.delta'; sequence_number: number; output_index: number; content_index: number; item_id: string; delta: string }
  | { type: 'response.output_text.done';  sequence_number: number; output_index: number; content_index: number; item_id: string; text: string };
```

---

## `Embeddings`

Access via `client.embeddings`.

#### `embeddings.create(params)`

```ts
create(params: EmbeddingCreateParams): Promise<CreateEmbeddingResponse>
```

```ts
interface EmbeddingCreateParams {
  model: string;
  input: string | string[];
  encoding_format?: 'float' | 'base64'; // default: 'float'
  dimensions?: number;
  user?: string;
}

interface CreateEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[] | Float32Array;
  }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}
```

---

## `Safety`

Access via `client.safety`.

#### `safety.checkText(text, options?)`

```ts
checkText(text: string, options?: SafetyCheckOptions): Promise<SafetyCheckResult>
```

Calls API to check text. Returns which categories were triggered.

#### `safety.checkImage(image, options?)`

```ts
checkImage(image: string | { url: string }, options?: SafetyCheckOptions): Promise<SafetyCheckResult>
```

Calls API to check an image via URL.

#### `safety.evaluate(input, template?)`

```ts
evaluate(input: EvaluateInput, template?: SafetyTemplateConfig): Promise<SafetyEvaluationResult>
```

Evaluates mixed input (text, image, completions, arrays) against a safety template.

#### `safety.wasFiltered(input)`

```ts
wasFiltered(input: SafetyCheckableInput): boolean
```

Returns `true` if any content was filtered. No API call.

#### `safety.getFilteredCategories(input)`

```ts
getFilteredCategories(input: SafetyCheckableInput): string[]
```

Returns category names that were filtered. No API call.

#### `safety.parseFilterResults(input)`

```ts
parseFilterResults(input: SafetyCheckableInput): SafetyFilterSummary
```

Returns structured breakdown (`choice`, `prompt`, `anyFiltered`). No API call.

---

## `SafetyTemplates`

```ts
const SafetyTemplates = {
  STRICT:      { id: 'strict',      failOnFiltered: true,  severityThreshold: 'safe'   },
  MODERATE:    { id: 'moderate',    failOnFiltered: true,  severityThreshold: 'medium' },
  MINIMAL:     { id: 'minimal',     failOnFiltered: false, severityThreshold: 'high'   },
  CHILD_SAFE:  { id: 'child_safe',  categories: [SEXUAL, VIOLENCE, SELF_HARM, HATE], severityThreshold: 'low' },
  ENTERPRISE:  { id: 'enterprise',  categories: 'all',     severityThreshold: 'safe'   },
};
```

---

## `SafetyCategory` enum

```ts
enum SafetyCategory {
  HATE                    = 'hate',
  VIOLENCE                = 'violence',
  SEXUAL                  = 'sexual',
  SELF_HARM               = 'self_harm',
  PROTECTED_MATERIAL_CODE = 'protected_material_code',
  PROTECTED_MATERIAL_TEXT = 'protected_material_text',
  JAILBREAK               = 'jailbreak',
}
```

---

## `SafetySeverity` enum

```ts
enum SafetySeverity {
  SAFE   = 'safe',
  LOW    = 'low',
  MEDIUM = 'medium',
  HIGH   = 'high',
}
```

---

## `Webhook`

```ts
class Webhook {
  constructor(url: string, events: WebhookEvent[], options?: WebhookOptions);
  readonly url: string;
  readonly events: readonly WebhookEvent[];
  toJSON(): { url: string; events: string[] };
}
```

---

## `WebhookEvent` enum

```ts
enum WebhookEvent {
  COMPLETED = 'completed',
  FAILED    = 'failed',
  CANCELED  = 'canceled',
  STARTED   = 'started',
}
```

---

## `WebhookListener`

```ts
class WebhookListener {
  constructor(options: WebhookListenerOptions);

  on(to: WebhookRoute, handler: WebhookListenerHandler): this;
  listen(to: WebhookRoute, handler: WebhookListenerHandler): this; // alias of on()
  off(to: WebhookRoute, handler: WebhookListenerHandler): this;

  dispatch(prediction: PredictionResponse): Promise<void>;
  handle(rawBody: string, headers: Headers | Record<string, string | ...>): Promise<PredictionResponse>;
  handleRequest(request: Request): Promise<Response>;
}
```

#### `WebhookListenerOptions`

```ts
interface WebhookListenerOptions {
  mode?: 'general' | 'enterprise'; // default: 'general'
  verifySignature?: boolean;        // default: true
  secret?: string;    // enterprise mode: dashboard webhook secret
  apiKey?: string;    // general mode: sk-… API key
}
```

#### `WebhookRoute`

```ts
type WebhookRoute = WebhookEvent | `prediction.${PredictionStatus}` | 'prediction.*' | '*';
```

---

## `verifySkytellsWebhookSignature`

```ts
verifySkytellsWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  options: { mode: 'general' | 'enterprise'; secret?: string; apiKey?: string },
): Promise<boolean>
```

Returns `true` if HMAC-SHA256 matches (timing-safe compare). Requires `crypto.subtle`.

---

## `createWebhookListener`

```ts
createWebhookListener(options?: WebhookListenerOptions): WebhookListener
```

Factory for `WebhookListener` without a client instance.

---

## `Orchestrator`

Access via `client.orchestrator` (requires `orchestratorApiKey`).

| Sub-resource | Access |
|---|---|
| Workflows | `client.orchestrator.workflows` |
| Executions | `client.orchestrator.executions` |
| Webhook triggers | `client.orchestrator.webhooks` |
| Integrations | `client.orchestrator.integrations` |
| API keys | `client.orchestrator.apiKeys` |
| AI generation | `client.orchestrator.ai` |
| User profile | `client.orchestrator.user` |

### `OrchestratorWorkflows`

| Method | Signature | Description |
|--------|-----------|-------------|
| `list()` | `(): Promise<OrchestratorWorkflowSummary[]>` | `GET /api/workflows` |
| `create(body)` | `(body): Promise<unknown>` | `POST /api/workflows/create` |
| `get(id)` | `(id: string): Promise<unknown>` | `GET /api/workflows/{id}` |
| `update(id, body)` | `(id, body): Promise<unknown>` | `PATCH /api/workflows/{id}` |
| `delete(id)` | `(id: string): Promise<unknown>` | `DELETE /api/workflows/{id}` |
| `duplicate(id)` | `(id: string): Promise<unknown>` | `POST /api/workflows/{id}/duplicate` |
| `getCode(id)` | `(id: string): Promise<string>` | `GET /api/workflows/{id}/code` — TypeScript source |
| `downloadProject(id)` | `(id: string): Promise<ArrayBuffer>` | `GET /api/workflows/{id}/download` — ZIP |

### `OrchestratorExecutions`

| Method | Signature | Description |
|--------|-----------|-------------|
| `list(workflowId)` | `(wfId: string): Promise<unknown[]>` | `GET /api/workflows/{id}/executions` |
| `getStatus(execId)` | `(execId: string): Promise<unknown>` | `GET /api/workflows/executions/{id}/status` |
| `getLogs(execId)` | `(execId: string): Promise<unknown[]>` | `GET /api/workflows/executions/{id}/logs` |
| `deleteAllForWorkflow(wfId)` | `(wfId: string): Promise<unknown>` | `DELETE /api/workflows/{id}/executions` |

### `OrchestratorWebhooks`

| Method | Signature | Description |
|--------|-----------|-------------|
| `execute(wfId, body?)` | `(wfId: string, body?: Record<string, unknown>): Promise<OrchestratorWebhookTriggerResponse>` | `POST /api/workflows/{id}/webhook` |
| `preflight(wfId)` | `(wfId: string): Promise<void>` | `OPTIONS /api/workflows/{id}/webhook` |

### `OrchestratorIntegrations`

| Method | Signature | Description |
|--------|-----------|-------------|
| `list(options?)` | `(options?: { type?: string }): Promise<unknown[]>` | `GET /api/integrations` |
| `create(body)` | `(body): Promise<unknown>` | `POST /api/integrations` |
| `get(id)` | `(id: string): Promise<unknown>` | `GET /api/integrations/{id}` |
| `update(id, body)` | `(id, body): Promise<unknown>` | `PUT /api/integrations/{id}` |
| `delete(id)` | `(id: string): Promise<unknown>` | `DELETE /api/integrations/{id}` |
| `test(id)` | `(id: string): Promise<unknown>` | `POST /api/integrations/{id}/test` |

### `OrchestratorApiKeys`

| Method | Signature | Description |
|--------|-----------|-------------|
| `list()` | `(): Promise<unknown[]>` | `GET /api/api-keys` |
| `create(body)` | `(body): Promise<OrchestratorCreateApiKeyResponse>` | `POST /api/api-keys` |

### `OrchestratorAi`

| Method | Signature | Description |
|--------|-----------|-------------|
| `generateWorkflow(body)` | `(body: { prompt: string }): AsyncIterable<OrchestratorAiStreamOperation>` | `POST /api/ai/generate` (NDJSON stream) |

### `OrchestratorUser`

| Method | Signature | Description |
|--------|-----------|-------------|
| `get()` | `(): Promise<unknown>` | `GET /api/user` |
| `updateProfile(body)` | `(body): Promise<unknown>` | `PATCH /api/user` |

---

## `SkytellsError`

```ts
class SkytellsError extends Error {
  errorId: string;          // machine-readable code
  message: string;          // human-readable summary
  details: string | Record<string, unknown>; // extra context
  httpStatus: number;       // HTTP status or 0
  requestId?: string;       // upstream correlation ID
  errorType?: string;       // API error.type
  errorCode?: string;       // API error.code
}
```

See [Errors.md](./Errors.md) for all `errorId` values.

---

## `ApiErrorId` enum

```ts
enum ApiErrorId {
  UNAUTHORIZED, INVALID_PARAMETER, INVALID_DATE_FORMAT, INVALID_DATE_RANGE,
  MODEL_NOT_FOUND, INTERNAL_ERROR, INVALID_INPUT, INSUFFICIENT_CREDITS,
  ACCOUNT_SUSPENDED, PAYMENT_REQUIRED, SECURITY_VIOLATION, RATE_LIMIT_EXCEEDED,
  SDK_ERROR, FORBIDDEN, INVALID_REQUEST, RATE_LIMITED, INFERENCE_RATE_LIMITED,
  INFERENCE_TIMEOUT, SERVICE_UNAVAILABLE, INFERENCE_ERROR, CONTENT_POLICY_VIOLATION,
  ENDPOINT_NOT_FOUND, ABORTED, WEBHOOK_SIGNATURE_INVALID, UNKNOWN_ERROR,
  HTTP_ERROR, API_ERROR, SERVER_ERROR, INVALID_JSON, REQUEST_TIMEOUT,
  NETWORK_ERROR, WAIT_TIMEOUT, PREDICTION_FAILED,
}
```

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `API_BASE_URL` | `'https://api.skytells.ai/v1'` | Default Inference API origin |
| `ORCHESTRATOR_BASE_URL` | `'https://orchestrator.skytells.ai'` | Default Orchestrator origin |
| `HTTP_DEFAULT_REQUEST_TIMEOUT_MS` | `60000` | Default request timeout |
| `SKYTELLS_WEBHOOK_SIGNATURE_HEADER` | `'x-skytells-signature'` | Inbound webhook header name |
| `PREFETCHED_MODEL_CACHE_TTL_MS` | `600000` | Model compat cache TTL (10 min) |
| `PREFETCHED_MODEL_CACHE_MAX_SLUGS` | `64` | Model cache max entries |
| `EDGE_DEFAULT_REQUEST_TIMEOUT_MS` | `25000` | Edge default timeout |
| `EDGE_PREFETCH_MAX_SLUGS` | `16` | Edge model cache max entries |

---

## `ENDPOINTS`

```ts
const ENDPOINTS = {
  PREDICT:               '/predict',
  PREDICTIONS:           '/predictions',
  MODELS:                '/models',
  MODEL_BY_SLUG:         (slug: string) => `/model/${encodeURIComponent(slug)}`,
  PREDICTION_BY_ID:      (id: string)   => `/predictions/${encodeURIComponent(id)}`,
  STREAM_PREDICTION_BY_ID: (id: string) => `/predictions/${encodeURIComponent(id)}/stream`,
  CANCEL_PREDICTION_BY_ID: (id: string) => `/predictions/${encodeURIComponent(id)}/cancel`,
  DELETE_PREDICTION_BY_ID: (id: string) => `/predictions/${encodeURIComponent(id)}/delete`,
  CHAT_COMPLETIONS:      '/chat/completions',
  RESPONSES:             '/responses',
  EMBEDDINGS:            '/embeddings',
};
```

---

## Complete Export List

```ts
// Default factory
export default Skytells;

// Main classes
export { SkytellsClient };
export { Prediction, PredictionsAPI, ModelsAPI };
export { Chat, Completions };
export { Responses };
export { Embeddings };
export { Safety };
export { Orchestrator };

// Webhooks
export { Webhook, WebhookEvent, WebhookListener, createWebhookListener };
export { verifySkytellsWebhookSignature, webhookRoutesForPrediction };
export { SKYTELLS_WEBHOOK_SIGNATURE_HEADER };

// Errors
export { SkytellsError, ApiErrorId };

// Constants
export { API_BASE_URL, ORCHESTRATOR_BASE_URL, HTTP_DEFAULT_REQUEST_TIMEOUT_MS };
export { PREFETCHED_MODEL_CACHE_TTL_MS };

// Enums
export { PredictionStatus, PredictionType, PredictionSource };
export { SafetyCategory, SafetySeverity, SafetyTemplates };

// All types (interfaces/types)
export type {
  ClientOptions, RetryOptions, SkytellsRuntime,
  PredictionRequest, PredictionResponse, PredictionsListOptions,
  RunOptions, WaitOptions, QueueItem, PredictionSdkOptions,
  OnProgressCallback, PaginatedResponse, Pagination,
  Model, ModelFieldsOptions,
  ChatCompletionCreateParams, ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletion, ChatCompletionChunk, ChatCompletionMessage,
  ChatCompletionChoice, ChatCompletionTool, ChatCompletionToolChoiceOption,
  ChatCompletionMessageParam, CompletionUsage,
  ResponsesCreateParams, ResponsesResponse, ResponsesStreamEvent,
  ResponsesOutputMessage, ResponsesOutputContent,
  EmbeddingCreateParams, CreateEmbeddingResponse, Embedding,
  SafetyCheckResult, SafetyEvaluationResult, SafetyFilterSummary,
  SafetyCheckOptions, SafetyTemplateConfig, SafetyCheckableInput, EvaluateInput,
  WebhookPayload, WebhookOptions, WebhookListenerOptions,
  WebhookRoute, WebhookListenerHandler, WebhookVerifyOptions, WebhookVerifyMode,
  OrchestratorWorkflowSummary, OrchestratorCreateWorkflowBody,
  OrchestratorUpdateWorkflowBody, OrchestratorCreateIntegrationBody,
  OrchestratorAiGenerateBody, OrchestratorAiStreamOperation,
  OrchestratorCreateApiKeyBody, OrchestratorCreateApiKeyResponse,
  OrchestratorWebhookTriggerResponse, OrchestratorUpdateUserBody,
};
```
