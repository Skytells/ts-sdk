# Chat

The Chat API provides OpenAI-compatible chat completions (`POST /v1/chat/completions`). It supports both non-streaming and streaming modes, multi-turn conversations, tool calling, and vision inputs.

Access via `client.chat.completions`.

---

## Basic Usage

### Non-streaming

```ts
import Skytells from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY);

const completion = await client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' },
  ],
});

console.log(completion.choices[0].message.content); // "Paris"
console.log(completion.usage);
// { prompt_tokens: 28, completion_tokens: 5, total_tokens: 33 }
```

### Streaming

Pass `stream: true` and iterate the returned `AsyncIterable<ChatCompletionChunk>`:

```ts
const stream = client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [{ role: 'user', content: 'Tell me a short story.' }],
  stream: true,
});

let fullText = '';
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content ?? '';
  process.stdout.write(delta);
  fullText += delta;
}
console.log('\nDone:', fullText);
```

> **Note**: Streaming calls are **not retried** if they fail after the stream starts. Configure retries only for non-streaming calls. See [Reliability.md](./Reliability.md).

---

## Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | `string` | ✅ | Model slug (e.g. `"deepbrain-router"`) |
| `messages` | `ChatCompletionMessageParam[]` | ✅ | Conversation history |
| `stream` | `boolean` | ❌ | `true` for streaming |
| `max_tokens` | `number` | ❌ | Max completion tokens |
| `temperature` | `number` | ❌ | Sampling temperature (0–2) |
| `top_p` | `number` | ❌ | Nucleus sampling probability |
| `n` | `number` | ❌ | Number of completion choices |
| `stop` | `string \| string[]` | ❌ | Stop sequences |
| `presence_penalty` | `number` | ❌ | Penalise new topics (-2 to 2) |
| `frequency_penalty` | `number` | ❌ | Penalise repeated tokens (-2 to 2) |
| `logprobs` | `boolean` | ❌ | Include per-token log probabilities |
| `top_logprobs` | `number` | ❌ | Top N logprobs per token (requires `logprobs: true`) |
| `tools` | `ChatCompletionTool[]` | ❌ | Function/tool definitions |
| `tool_choice` | `ChatCompletionToolChoiceOption` | ❌ | Tool invocation mode |
| `user` | `string` | ❌ | End-user identifier for monitoring |
| `response_format` | `object` | ❌ | `{ type: 'json_object' }` or `{ type: 'text' }` |

---

## Multi-turn Conversations

Build a conversation by appending assistant messages to your `messages` array:

```ts
const messages: ChatCompletionMessageParam[] = [
  { role: 'system', content: 'You are a Python tutor.' },
  { role: 'user', content: 'What is a list comprehension?' },
];

const first = await client.chat.completions.create({ model: 'deepbrain-router', messages });

// Append assistant reply
messages.push({
  role: 'assistant',
  content: first.choices[0].message.content,
});

// Continue conversation
messages.push({ role: 'user', content: 'Show me an example with filtering.' });

const second = await client.chat.completions.create({ model: 'deepbrain-router', messages });
console.log(second.choices[0].message.content);
```

---

## Tool Calling (Function Calling)

Define tools with a JSON Schema:

```ts
const completion = await client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [{ role: 'user', content: "What's the weather in Paris?" }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Returns current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
    },
  ],
  tool_choice: 'auto',
});

const choice = completion.choices[0];
if (choice.finish_reason === 'tool_calls') {
  const call = choice.message.tool_calls![0];
  console.log(call.function.name);      // "get_weather"
  console.log(JSON.parse(call.function.arguments)); // { location: "Paris" }

  // Execute the tool, then send result back
  const weatherData = await fetchWeather('Paris');

  const result = await client.chat.completions.create({
    model: 'deepbrain-router',
    messages: [
      { role: 'user', content: "What's the weather in Paris?" },
      choice.message,                   // assistant's tool call message
      {
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(weatherData),
      },
    ],
    tools: [...], // same tools
  });

  console.log(result.choices[0].message.content);
}
```

---

## Vision / Image Inputs

```ts
const completion = await client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image in detail.' },
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/photo.jpg' },
        },
      ],
    },
  ],
});

console.log(completion.choices[0].message.content);
```

---

## Structured JSON Output

Use `response_format: { type: 'json_object' }` to guarantee a valid JSON response:

```ts
const completion = await client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [
    {
      role: 'user',
      content: 'List 3 programming languages with their year of creation. Respond in JSON.',
    },
  ],
  response_format: { type: 'json_object' },
});

const languages = JSON.parse(completion.choices[0].message.content!);
```

---

## Finish Reasons

| `finish_reason` | Meaning |
|-----------------|---------|
| `"stop"` | Normal completion — stop token or end of sequence |
| `"length"` | Truncated at `max_tokens` |
| `"tool_calls"` | Model wants to invoke a tool |
| `"content_filter"` | Content was filtered (see [Safety.md](./Safety.md)) |
| `null` | Streaming chunk — not the final chunk |

---

## Content Filtering

The API may return `content_filter_results` on choices. Use the Safety module to inspect them:

```ts
const completion = await client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [{ role: 'user', content: userInput }],
});

if (client.safety.wasFiltered(completion)) {
  const categories = client.safety.getFilteredCategories(completion);
  console.warn('Filtered categories:', categories);
}
```

See [Safety.md](./Safety.md) for full documentation.

---

## Response Shape

```ts
interface ChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
}

interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: unknown;
  content_filter_results?: Record<string, unknown>;
}

interface ChatCompletionMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ChatCompletionMessageToolCall[];
}
```

---

## Streaming Chunk Shape

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
      tool_calls?: ChatCompletionChunkToolCall[];
    };
    finish_reason: string | null;
    logprobs?: unknown;
    content_filter_results?: unknown;
    content_filter_offsets?: unknown;
  }>;
  system_fingerprint?: string;
}
```

---

## Accessing Responses via Chat

`client.chat` also exposes a `responses` accessor for the Responses API:

```ts
await client.chat.responses.create({
  model: 'gpt-5.3-codex',
  input: 'Hello',
});
// equivalent to client.responses.create(...)
```

See [Responses.md](./Responses.md) for full documentation.

---

## Error Handling

```ts
import { SkytellsError } from 'skytells';

try {
  const completion = await client.chat.completions.create({ ... });
} catch (e) {
  if (e instanceof SkytellsError) {
    if (e.errorId === 'RATE_LIMIT_EXCEEDED') {
      // Retry after delay or reduce request rate
    } else if (e.errorId === 'CONTENT_POLICY_VIOLATION') {
      // The prompt or response was flagged
    } else if (e.errorId === 'REQUEST_TIMEOUT') {
      // Increase client timeout or reduce max_tokens
    }
    console.error(e.errorId, e.httpStatus, e.message);
  }
}
```

See [Errors.md](./Errors.md) for all error IDs.

---

## Best Practices

- **System prompt**: Always set a `system` message to define the assistant's persona and constraints.
- **Token budgets**: Set `max_tokens` to prevent unexpectedly large responses and control cost.
- **Temperature**: Use `0` for deterministic outputs (code, structured data); `0.7`–`1.0` for creative tasks.
- **Tool calling**: Validate and sanitise any data extracted from tool arguments before using it in queries or file operations.
- **Content filtering**: Check `finish_reason === 'content_filter'` when accepting user-supplied prompts.
- **Multi-turn memory**: The API is stateless — you must pass the full conversation history every time.
