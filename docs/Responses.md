# Responses API

The Responses API (`POST /v1/responses`) provides a stateful, multi-turn conversation API following the OpenAI Responses schema. It supports reasoning models, tool calling, multi-turn context via `previous_response_id`, and server-sent event streaming with 9 distinct event types.

Access via `client.responses` or `client.chat.responses`.

---

## Basic Usage

### Non-streaming

```ts
import Skytells from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY);

const response = await client.responses.create({
  model: 'gpt-5.3-codex',
  input: [{ role: 'user', content: 'Explain recursion simply.' }],
  instructions: 'You are a helpful tutor.',
});

// Output is an array of output messages
console.log(response.output[0].content[0].text);
console.log(response.usage);
// { input_tokens: 32, output_tokens: 120, total_tokens: 152 }
```

### Streaming

Pass `stream: true` — the method returns `AsyncIterable<ResponsesStreamEvent>` directly (no extra `await`):

```ts
for await (const event of client.responses.create({
  model: 'gpt-5.3-codex',
  input: [{ role: 'user', content: 'Write a limerick about JavaScript.' }],
  stream: true,
})) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta);
  }
  if (event.type === 'response.completed') {
    console.log('\nDone. Usage:', event.response.usage);
  }
}
```

---

## Parameters

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | Model identifier, e.g. `"gpt-5.3-codex"` |
| `input` | `string \| ResponsesInputMessage[]` | Text prompt or array of role/content messages |
| `instructions` | `string \| null` | System-level instructions (prepended before the conversation) |
| `stream` | `boolean` | `true` for SSE streaming |
| `max_output_tokens` | `number \| null` | Maximum tokens in the output |
| `temperature` | `number` | Sampling temperature (0–2) |
| `top_p` | `number` | Nucleus sampling probability |
| `tools` | `ChatCompletionTool[]` | Tool/function definitions |
| `tool_choice` | `'none' \| 'auto' \| 'required' \| { type: 'function', function: { name } }` | Tool invocation mode |
| `parallel_tool_calls` | `boolean` | Allow model to call tools in parallel |
| `reasoning` | `{ effort?, summary? }` | Reasoning effort and summary verbosity |
| `store` | `boolean` | Whether to persist the response server-side (for multi-turn) |
| `previous_response_id` | `string \| null` | Chain to a prior response's ID for multi-turn |
| `metadata` | `Record<string, unknown>` | Arbitrary key/value for your own labelling |
| `user` | `string \| null` | End-user identifier for monitoring |
| `truncation` | `string` | Truncation strategy (e.g. `'auto'`, `'disabled'`) |
| `frequency_penalty` | `number` | Token frequency penalty |
| `presence_penalty` | `number` | Token presence penalty |
| `text` | `{ format?, verbosity? }` | Output text formatting options |

---

## Multi-turn with `previous_response_id`

The Responses API is designed for stateful multi-turn conversations. Instead of sending the full conversation history like the Chat API, you pass the `id` from the previous response:

```ts
// Turn 1
const turn1 = await client.responses.create({
  model: 'gpt-5.3-codex',
  input: [{ role: 'user', content: 'My name is Alex. What is a closure in JavaScript?' }],
  store: true, // persist for future turns
});

console.log(turn1.id); // "resp_abc123"
console.log(turn1.output[0].content[0].text);

// Turn 2 — no need to repeat history
const turn2 = await client.responses.create({
  model: 'gpt-5.3-codex',
  input: [{ role: 'user', content: 'Can you give me an example using my name?' }],
  previous_response_id: turn1.id, // links to prior context
});

console.log(turn2.output[0].content[0].text);
// Model remembers the name "Alex" from turn 1
```

> **Note**: `store: true` must be set when you intend to use a response as the parent of a future call. Only stored responses can be referenced by `previous_response_id`.

---

## Reasoning Models

Use the `reasoning` parameter with models that support extended thinking:

```ts
const response = await client.responses.create({
  model: 'gpt-5.3-codex',
  input: [{ role: 'user', content: 'Solve: if 2x + 5 = 17, what is x?' }],
  reasoning: {
    effort: 'high',    // 'none' | 'low' | 'medium' | 'high'
    summary: 'detailed', // 'auto' | 'concise' | 'detailed'
  },
});
```

---

## Streaming Events Reference

The `ResponsesStreamEvent` is a discriminated union on `type`. Nine event types:

| `type` | Description |
|--------|-------------|
| `response.created` | Initial response snapshot (status: `in_progress`) |
| `response.in_progress` | Intermediate state update during processing |
| `response.completed` | Final response snapshot with full `usage` |
| `response.output_item.added` | A new output message item was opened |
| `response.output_item.done` | An output message item was closed/completed |
| `response.content_part.added` | A content part within a message was opened |
| `response.content_part.done` | A content part was closed/completed |
| `response.output_text.delta` | Incremental text chunk (the main streaming token) |
| `response.output_text.done` | Final accumulated text for one content part |

### Collecting the full text from a stream

```ts
let fullText = '';

for await (const event of client.responses.create({
  model: 'gpt-5.3-codex',
  input: 'What is the Pythagorean theorem?',
  stream: true,
})) {
  switch (event.type) {
    case 'response.output_text.delta':
      process.stdout.write(event.delta);
      fullText += event.delta;
      break;
    case 'response.output_text.done':
      fullText = event.text; // final full text for this part
      break;
    case 'response.completed':
      console.log('\nUsage:', event.response.usage);
      break;
  }
}
```

### Event shapes

```ts
// response.output_text.delta
{
  type: 'response.output_text.delta';
  sequence_number: number;
  output_index: number;
  content_index: number;
  item_id: string;
  delta: string; // incremental text
}

// response.output_text.done
{
  type: 'response.output_text.done';
  sequence_number: number;
  output_index: number;
  content_index: number;
  item_id: string;
  text: string; // full accumulated text
}

// response.completed
{
  type: 'response.completed';
  sequence_number: number;
  response: ResponsesResponse; // full final response
}
```

---

## Tool Calling

```ts
const response = await client.responses.create({
  model: 'gpt-5.3-codex',
  input: [{ role: 'user', content: "What's today's weather in Berlin?" }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Returns current weather',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    },
  ],
  tool_choice: 'auto',
});

// Check if model wants to call a tool
const outputItem = response.output[0];
// (Tool call handling is model- and schema-specific —
// inspect outputItem.type and content for function call details)
```

---

## Response Shape

```ts
interface ResponsesResponse {
  id: string;
  object: 'response';
  created_at: number;
  status: string; // 'completed' | 'in_progress' | ...
  model: string;
  output: ResponsesOutputMessage[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
  content_filters?: ResponsesContentFilter[]; // Skytells-specific
  instructions?: string | null;
  previous_response_id?: string | null;
  temperature?: number;
  top_p?: number;
  reasoning?: { effort?: string | null; summary?: string | null };
  store?: boolean;
  metadata?: Record<string, unknown>;
}

interface ResponsesOutputMessage {
  id: string;
  type: string;
  status?: string;
  role: string;
  content: ResponsesOutputContent[];
  phase?: string;
}

interface ResponsesOutputContent {
  type: string;
  text?: string;
  annotations?: unknown[];
  logprobs?: unknown[];
}
```

---

## Content Filtering

The Responses API includes Skytells-specific `content_filters` on the response — an array of filter results for both `prompt` and `completion`:

```ts
const response = await client.responses.create({
  model: 'gpt-5.3-codex',
  input: [{ role: 'user', content: userInput }],
});

if (response.content_filters?.some(f => f.blocked)) {
  const blocked = response.content_filters.filter(f => f.blocked);
  console.warn('Content blocked:', blocked.map(f => f.source_type));
}
```

---

## Error Handling

```ts
import { SkytellsError } from 'skytells';

try {
  const response = await client.responses.create({ ... });
} catch (e) {
  if (e instanceof SkytellsError) {
    console.error(e.errorId, e.httpStatus, e.message);
  }
}
```

---

## Differences from Chat API

| Feature | Chat (`/v1/chat/completions`) | Responses (`/v1/responses`) |
|---------|-------------------------------|------------------------------|
| Multi-turn | Full history on every call | `previous_response_id` reference |
| State | Stateless | Persistent with `store: true` |
| Input type | `messages` array | `input` string or array + `instructions` |
| Streaming events | Single delta stream | 9 typed event types |
| Reasoning control | — | `reasoning.effort` and `summary` |
| Server-side identity | — | `id` on response (chainable) |

---

## Best Practices

- Use `store: true` whenever you plan to continue the conversation with `previous_response_id`.
- Use `instructions` for system-level context instead of a system message in `input`.
- In streaming, handle `response.output_text.delta` for live display and `response.output_text.done` for the final text value.
- Check `content_filters` when accepting untrusted user input.
- Keep `max_output_tokens` set to avoid unexpectedly large responses.
