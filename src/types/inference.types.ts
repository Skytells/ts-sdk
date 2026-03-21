/**
 * Inference API types for Skytells OpenAI-compatible endpoints.
 * Chat completions, embeddings, and content safety/filter results.
 *
 * @module types/inference
 */

// ─── Safety Enums ────────────────────────────────────────────────────────────

/**
 * Content filter categories. Use when checking safety results.
 *
 * @example
 * ```ts
 * if (categories.includes(SafetyCategory.VIOLENCE)) {
 *   console.warn('Violence content was filtered');
 * }
 * ```
 */
export enum SafetyCategory {
  HATE = 'hate',
  VIOLENCE = 'violence',
  SEXUAL = 'sexual',
  SELF_HARM = 'self_harm',
  PROTECTED_MATERIAL_CODE = 'protected_material_code',
  PROTECTED_MATERIAL_TEXT = 'protected_material_text',
  JAILBREAK = 'jailbreak',
}

/**
 * Severity levels for content filter results.
 */
export enum SafetySeverity {
  SAFE = 'safe',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

// ─── Content Filter Types (Skytells-specific) ────────────────────────────────

export interface ContentFilterResult {
  filtered: boolean;
  severity: SafetySeverity | string;
}

export interface ContentFilterResultDetected {
  filtered: boolean;
  detected: boolean;
}

export interface PromptContentFilterResults {
  hate: ContentFilterResult;
  jailbreak?: ContentFilterResultDetected;
  self_harm: ContentFilterResult;
  sexual: ContentFilterResult;
  violence: ContentFilterResult;
}

export interface PromptFilterResult {
  prompt_index: number;
  content_filter_results: PromptContentFilterResults;
}

export interface ChoiceContentFilterResults {
  hate: ContentFilterResult;
  protected_material_code?: ContentFilterResultDetected;
  protected_material_text?: ContentFilterResultDetected;
  self_harm: ContentFilterResult;
  sexual: ContentFilterResult;
  violence: ContentFilterResult;
}

// ─── Tool Calling ────────────────────────────────────────────────────────────

export interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    /** JSON Schema for the function arguments. */
    parameters?: Record<string, unknown>;
    /** If true, the model will enforce strict adherence to the schema. */
    strict?: boolean | null;
  };
}

export type ChatCompletionToolChoiceOption =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };

export interface ChatCompletionMessageToolCall {
  /** Unique identifier for this tool call. */
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON-encoded arguments string. */
    arguments: string;
  };
}

// ─── Chat Completions — Request ──────────────────────────────────────────────

export type ChatCompletionRole = 'system' | 'user' | 'assistant' | 'tool' | 'function';

/** System or user message (simple text content). */
export interface ChatCompletionSystemMessageParam {
  role: 'system';
  content: string;
  name?: string;
}

/** User message — string or multimodal content parts. */
export interface ChatCompletionUserMessageParam {
  role: 'user';
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        image_url?: { url: string; detail?: string };
        [key: string]: unknown;
      }>;
  name?: string;
}

/** Assistant message — may include tool call requests. */
export interface ChatCompletionAssistantMessageParam {
  role: 'assistant';
  content?: string | null;
  name?: string;
  refusal?: string | null;
  tool_calls?: ChatCompletionMessageToolCall[];
  /** @deprecated Use `tool_calls` instead. */
  function_call?: { name: string; arguments: string };
}

/** Tool result message returned after a tool call. */
export interface ChatCompletionToolMessageParam {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

/** @deprecated Legacy function result message. Use tool messages instead. */
export interface ChatCompletionFunctionMessageParam {
  role: 'function';
  name: string;
  content: string | null;
}

export type ChatCompletionMessageParam =
  | ChatCompletionSystemMessageParam
  | ChatCompletionUserMessageParam
  | ChatCompletionAssistantMessageParam
  | ChatCompletionToolMessageParam
  | ChatCompletionFunctionMessageParam;

export interface ChatCompletionCreateParamsBase {
  model: string;
  messages: ChatCompletionMessageParam[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stop?: string | string[] | null;
  presence_penalty?: number;
  frequency_penalty?: number;
  logprobs?: boolean | null;
  top_logprobs?: number | null;
  user?: string;
  /** Function/tool definitions the model may call. */
  tools?: ChatCompletionTool[];
  /** Controls which (if any) tool is called. */
  tool_choice?: ChatCompletionToolChoiceOption;
  /** Allow the model to call multiple tools in parallel. */
  parallel_tool_calls?: boolean;
}

export interface ChatCompletionCreateParamsNonStreaming extends ChatCompletionCreateParamsBase {
  stream?: false | null;
}

export interface ChatCompletionCreateParamsStreaming extends ChatCompletionCreateParamsBase {
  stream: true;
}

export type ChatCompletionCreateParams =
  | ChatCompletionCreateParamsNonStreaming
  | ChatCompletionCreateParamsStreaming;

// ─── Chat Completions — Response ────────────────────────────────────────────

export interface CompletionTokensDetails {
  accepted_prediction_tokens?: number;
  audio_tokens?: number;
  reasoning_tokens?: number;
  rejected_prediction_tokens?: number;
}

export interface PromptTokensDetails {
  audio_tokens?: number;
  cached_tokens?: number;
}

export interface CompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: CompletionTokensDetails;
  prompt_tokens_details?: PromptTokensDetails;
}

export interface ChatCompletionMessage {
  role: 'assistant';
  content: string | null;
  refusal?: string | null;
  annotations?: unknown[];
  /** Tool calls requested by the model. Present when `finish_reason` is `"tool_calls"`. */
  tool_calls?: ChatCompletionMessageToolCall[];
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'function_call' | null;
  logprobs?: unknown;
  content_filter_results?: ChoiceContentFilterResults;
}

export interface ChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: CompletionUsage;
  system_fingerprint?: string;
  prompt_filter_results?: PromptFilterResult[];
}

// ─── Chat Completions — Streaming ────────────────────────────────────────────

export interface ChatCompletionChunkDelta {
  content?: string | null;
  role?: ChatCompletionRole | null;
  refusal?: string | null;
  /** Streaming incremental tool call fragments. Indexed by `index` across chunks. */
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: 'function';
    function?: { name?: string; arguments?: string };
  }>;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: ChatCompletionChunkDelta;
  finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'function_call' | null;
  logprobs?: unknown;
  content_filter_results?: ChoiceContentFilterResults;
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  usage?: CompletionUsage | null;
  system_fingerprint?: string | null;
  prompt_filter_results?: PromptFilterResult[];
  /** Skytells-specific: anti-replay / audit tag present on some chunk events. */
  obfuscation?: string;
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

export interface Embedding {
  object: 'embedding';
  embedding: number[] | Float32Array;
  index: number;
}

export interface EmbeddingUsage {
  prompt_tokens: number;
  total_tokens: number;
}

export interface CreateEmbeddingResponse {
  object: 'list';
  data: Embedding[];
  model: string;
  usage: EmbeddingUsage;
}

export interface EmbeddingCreateParams {
  model: string;
  input: string | string[];
  encoding_format?: 'float' | 'base64';
  dimensions?: number;
  user?: string;
}

// ─── Safety API Types ────────────────────────────────────────────────────────

export interface SafetyFilterCategoryResult {
  filtered: boolean;
  severity?: SafetySeverity | string;
  detected?: boolean;
}

export interface SafetyFilterSummary {
  choice: Partial<Record<SafetyCategory, SafetyFilterCategoryResult>>;
  prompt?: Array<{
    prompt_index: number;
    results: Partial<Record<SafetyCategory, SafetyFilterCategoryResult>>;
  }>;
  anyFiltered: boolean;
}

export interface SafetyTemplateConfig {
  id: string;
  categories?: (SafetyCategory | string)[] | 'all';
  severityThreshold?: SafetySeverity | string;
  failOnFiltered?: boolean;
}

export const SafetyTemplates = {
  STRICT: { id: 'strict', failOnFiltered: true, severityThreshold: 'safe' } as SafetyTemplateConfig,
  MODERATE: {
    id: 'moderate',
    failOnFiltered: true,
    severityThreshold: 'medium',
  } as SafetyTemplateConfig,
  MINIMAL: {
    id: 'minimal',
    failOnFiltered: false,
    severityThreshold: 'high',
  } as SafetyTemplateConfig,
  CHILD_SAFE: {
    id: 'child_safe',
    categories: [
      SafetyCategory.SEXUAL,
      SafetyCategory.VIOLENCE,
      SafetyCategory.SELF_HARM,
      SafetyCategory.HATE,
    ],
    severityThreshold: 'low',
  } as SafetyTemplateConfig,
  ENTERPRISE: {
    id: 'enterprise',
    categories: 'all' as const,
    severityThreshold: 'safe',
  } as SafetyTemplateConfig,
} as const;

export interface SafetyEvaluationResult {
  passed: boolean;
  failedCategories: (SafetyCategory | string)[];
  template: string;
  details: SafetyFilterSummary;
}

export interface SafetyCheckResult {
  passed: boolean;
  failedCategories: (SafetyCategory | string)[];
  template: string;
  contentFilterResults?: ChoiceContentFilterResults;
}

export interface SafetyCheckOptions {
  /** Not read by proactive `Safety.checkText` / `Safety.checkImage` in the current SDK (reserved). */
  categories?: SafetyCategory[];
  /** On proactive checks, only `template.id` is copied to `SafetyCheckResult.template`; it does not change `passed`. */
  template?: SafetyTemplateConfig;
}

/**
 * Object with top-level content_filter_results (e.g. prediction or inference result).
 */
export interface SafetyCheckableWithFilters {
  content_filter_results?: ChoiceContentFilterResults;
}

/**
 * Input types accepted by Safety API response-parsing methods.
 * Supports single choice, array of choices, full completion, completion-like objects,
 * or prediction/inference results with content_filter_results.
 */
export type SafetyCheckableInput =
  | ChatCompletion
  | ChatCompletionChoice
  | ChatCompletionChoice[]
  | { choices: ChatCompletionChoice[]; prompt_filter_results?: PromptFilterResult[] }
  | SafetyCheckableWithFilters;

/**
 * Image input for safety evaluation (URL string or object with url).
 */
export type SafetyImageInput = string | { url: string };

/**
 * Input types accepted by evaluate().
 * Supports pre-parsed results, text, image URLs, and arrays of any.
 * Text and image URLs trigger an API call; others are parsed locally.
 */
export type EvaluateInput = SafetyCheckableInput | string | SafetyImageInput | EvaluateInput[];

// ─── Responses API ───────────────────────────────────────────────────────────

/** Input message for the Responses API (`POST /v1/responses`). */
export interface ResponsesInputMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Text content or multimodal content array. */
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  name?: string;
  tool_call_id?: string;
}

/** Content item in a Responses API output message. */
export interface ResponsesOutputContent {
  type: string;
  text?: string;
  annotations?: unknown[];
  logprobs?: unknown[];
}

/** A single message in the `output` array of a Responses API response. */
export interface ResponsesOutputMessage {
  id: string;
  type: string;
  status?: string;
  /** Role of the speaker (typically `"assistant"`). */
  role: string;
  content: ResponsesOutputContent[];
  phase?: string;
}

/** Single content-filter entry in the Responses API response (prompt or completion). */
export interface ResponsesContentFilter {
  blocked: boolean;
  source_type: 'prompt' | 'completion';
  content_filter_raw?: unknown[];
  content_filter_results?: {
    hate?: ContentFilterResult;
    sexual?: ContentFilterResult;
    violence?: ContentFilterResult;
    self_harm?: ContentFilterResult;
    jailbreak?: ContentFilterResultDetected;
    protected_material_code?: ContentFilterResultDetected;
    protected_material_text?: ContentFilterResultDetected;
  };
  content_filter_offsets?: {
    start_offset: number;
    end_offset: number;
    check_offset: number;
  };
}

/** Token usage breakdown for the Responses API. */
export interface ResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

/** Request body for `POST /v1/responses`. Follows OpenAI Responses API schema. */
export interface ResponsesCreateParams {
  /** Model identifier (e.g. `"gpt-5.3-codex"`). */
  model: string;
  /**
   * Input messages. Either a plain string prompt or an array of role/content message objects.
   * Use an array when providing a conversation history or system instructions inline.
   */
  input: string | ResponsesInputMessage[];
  /** System-level instructions prepended before the conversation. */
  instructions?: string | null;
  stream?: boolean | null;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number | null;
  max_tool_calls?: number | null;
  tools?: ChatCompletionTool[];
  /** Controls which tool is called. Pass `'none'`, `'auto'`, `'required'`, or `{ type: 'function', function: { name } }`. */
  tool_choice?: ChatCompletionToolChoiceOption;
  parallel_tool_calls?: boolean;
  reasoning?: {
    effort?: 'none' | 'low' | 'medium' | 'high' | null;
    summary?: 'auto' | 'concise' | 'detailed' | null;
  };
  text?: {
    format?: { type: string; [key: string]: unknown };
    verbosity?: 'low' | 'medium' | 'high';
  };
  store?: boolean;
  metadata?: Record<string, unknown>;
  user?: string | null;
  previous_response_id?: string | null;
  service_tier?: string;
  truncation?: string;
  frequency_penalty?: number;
  presence_penalty?: number;
  top_logprobs?: number;
  prompt_cache_key?: string | null;
  prompt_cache_retention?: string | null;
}

/** Full response from `POST /v1/responses`. Follows OpenAI Responses API schema. */
export interface ResponsesResponse {
  id: string;
  object: 'response';
  created_at: number;
  status: string;
  background?: boolean;
  completed_at?: number | null;
  error?: unknown;
  incomplete_details?: unknown;
  model: string;
  output: ResponsesOutputMessage[];
  usage?: ResponsesUsage;
  /** Skytells-specific safety filter results for both prompt and completion. */
  content_filters?: ResponsesContentFilter[];
  instructions?: string | null;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number | null;
  max_tool_calls?: number | null;
  tools?: ChatCompletionTool[];
  tool_choice?: ChatCompletionToolChoiceOption;
  parallel_tool_calls?: boolean;
  reasoning?: { effort?: string | null; summary?: string | null };
  text?: { format?: { type: string; [key: string]: unknown }; verbosity?: string };
  service_tier?: string;
  store?: boolean;
  metadata?: Record<string, unknown>;
  user?: string | null;
  previous_response_id?: string | null;
  safety_identifier?: string | null;
  system_fingerprint?: string;
  frequency_penalty?: number;
  presence_penalty?: number;
  truncation?: string;
  top_logprobs?: number;
  prompt_cache_key?: string | null;
  prompt_cache_retention?: string | null;
}

// ─── Responses API — Streaming Events (named SSE, OpenAI Responses format) ──

/** Fields common to every Responses streaming event. */
interface ResponsesEventBase {
  sequence_number: number;
}

/** `response.created` — initial response snapshot, status will be `in_progress`. */
export interface ResponsesCreatedEvent extends ResponsesEventBase {
  type: 'response.created';
  response: ResponsesResponse;
}

/** `response.in_progress` — response is being processed. */
export interface ResponsesInProgressEvent extends ResponsesEventBase {
  type: 'response.in_progress';
  response: ResponsesResponse;
}

/** `response.completed` — final response snapshot with full `usage`. */
export interface ResponsesCompletedEvent extends ResponsesEventBase {
  type: 'response.completed';
  response: ResponsesResponse;
}

/** `response.output_item.added` — an output message was opened. */
export interface ResponsesOutputItemAddedEvent extends ResponsesEventBase {
  type: 'response.output_item.added';
  output_index: number;
  item: ResponsesOutputMessage;
}

/** `response.output_item.done` — an output message was closed. */
export interface ResponsesOutputItemDoneEvent extends ResponsesEventBase {
  type: 'response.output_item.done';
  output_index: number;
  item: ResponsesOutputMessage;
}

/** `response.content_part.added` — a content part inside a message was opened. */
export interface ResponsesContentPartAddedEvent extends ResponsesEventBase {
  type: 'response.content_part.added';
  output_index: number;
  content_index: number;
  item_id: string;
  part: ResponsesOutputContent;
}

/** `response.content_part.done` — a content part inside a message was closed. */
export interface ResponsesContentPartDoneEvent extends ResponsesEventBase {
  type: 'response.content_part.done';
  output_index: number;
  content_index: number;
  item_id: string;
  part: ResponsesOutputContent;
}

/** @deprecated Use the split event types: {@link ResponsesCreatedEvent}, {@link ResponsesInProgressEvent}, {@link ResponsesCompletedEvent}. */
export type ResponsesResponseEvent =
  | ResponsesCreatedEvent
  | ResponsesInProgressEvent
  | ResponsesCompletedEvent;
/** @deprecated Use {@link ResponsesOutputItemAddedEvent} / {@link ResponsesOutputItemDoneEvent}. */
export type ResponsesOutputItemEvent = ResponsesOutputItemAddedEvent | ResponsesOutputItemDoneEvent;
/** @deprecated Use {@link ResponsesContentPartAddedEvent} / {@link ResponsesContentPartDoneEvent}. */
export type ResponsesContentPartEvent =
  | ResponsesContentPartAddedEvent
  | ResponsesContentPartDoneEvent;

/** `response.output_text.delta` — incremental text token. */
export interface ResponsesOutputTextDeltaEvent extends ResponsesEventBase {
  type: 'response.output_text.delta';
  output_index: number;
  content_index: number;
  item_id: string;
  /** The new text fragment to append. */
  delta: string;
  logprobs?: unknown[];
  /** Skytells-specific: anti-replay / audit tag. */
  obfuscation?: string;
}

/** `response.output_text.done` — complete assembled text for a content part. */
export interface ResponsesOutputTextDoneEvent extends ResponsesEventBase {
  type: 'response.output_text.done';
  output_index: number;
  content_index: number;
  item_id: string;
  text: string;
  logprobs?: unknown[];
}

/** Any other / future event type emitted by the Responses streaming endpoint. */
export interface ResponsesUnknownEvent extends ResponsesEventBase {
  type: string;
  [key: string]: unknown;
}

/**
 * Discriminated union of all known Responses SSE event shapes.
 *
 * Each member has a unique `type` literal so TypeScript can narrow the type with
 * `if (event.type === '...')` or `switch (event.type)`. Events not listed here
 * (future API additions) can be handled in a `default:` branch by casting:
 * `const e = event as ResponsesUnknownEvent`.
 *
 * @example
 * ```ts
 * for await (const event of client.responses.create({ model: '...', input: '...', stream: true })) {
 *   if (event.type === 'response.output_text.delta') {
 *     process.stdout.write(event.delta);               // event: ResponsesOutputTextDeltaEvent
 *   } else if (event.type === 'response.completed') {
 *     console.log('done', event.response.usage);       // event: ResponsesCompletedEvent
 *   }
 * }
 * ```
 */
export type ResponsesStreamEvent =
  | ResponsesCreatedEvent
  | ResponsesInProgressEvent
  | ResponsesCompletedEvent
  | ResponsesOutputItemAddedEvent
  | ResponsesOutputItemDoneEvent
  | ResponsesContentPartAddedEvent
  | ResponsesContentPartDoneEvent
  | ResponsesOutputTextDeltaEvent
  | ResponsesOutputTextDoneEvent;
