# Safety

The Safety module provides two mechanisms for content moderation:

1. **Proactive checks** (`checkText`, `checkImage`, `evaluate`) — calls the API to run content safety analysis and returns which categories were triggered.
2. **Response parsing** (`wasFiltered`, `getFilteredCategories`, `parseFilterResults`) — inspects `content_filter_results` on an existing chat completion or prediction response with no additional API call.

Access via `client.safety`.

---

## Proactive Checks

### Check text

```ts
import Skytells, { SafetyCategory } from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY);

const result = await client.safety.checkText('Some user-submitted text here');

console.log(result.passed);           // true or false
console.log(result.failedCategories); // e.g. ["violence", "hate"]
console.log(result.template);         // "default"
```

### Check an image

```ts
// By URL string
const result = await client.safety.checkImage('https://example.com/image.jpg');

// Or with an object
const result2 = await client.safety.checkImage({ url: 'https://example.com/image.jpg' });

console.log(result.passed);
console.log(result.contentFilterResults);
```

---

## Safety Templates

Use pre-built templates to apply consistent safety policies:

```ts
import { SafetyTemplates } from 'skytells';

const result = await client.safety.checkText(userInput, {
  template: SafetyTemplates.STRICT,
});

if (!result.passed) {
  console.warn('Content blocked by STRICT template:', result.failedCategories);
}
```

### Available templates

| Template | ID | Severity threshold | Scope |
|----------|----|--------------------|-------|
| `SafetyTemplates.STRICT` | `'strict'` | `safe` (zero tolerance) | All categories |
| `SafetyTemplates.MODERATE` | `'moderate'` | `medium` | All categories |
| `SafetyTemplates.MINIMAL` | `'minimal'` | `high` | All categories |
| `SafetyTemplates.CHILD_SAFE` | `'child_safe'` | `low` | Sexual, violence, self-harm, hate |
| `SafetyTemplates.ENTERPRISE` | `'enterprise'` | `safe` | All categories |

> **Note**: On proactive checks (`checkText`, `checkImage`), the template's `id` string is copied to the result's `template` field but does not change the API call or what `passed` means — `passed` always reflects whether any category was filtered by the API. Templates are most meaningful when used with `evaluate()`.

---

## `evaluate()` — Unified Evaluation

`evaluate()` accepts many input types and applies a template to produce a structured result:

```ts
import { SafetyTemplates } from 'skytells';

// From text (triggers API call)
const textResult = await client.safety.evaluate(
  'User-submitted content here',
  SafetyTemplates.MODERATE,
);

// From image URL (triggers API call)
const imageResult = await client.safety.evaluate(
  'https://example.com/image.jpg',
  SafetyTemplates.CHILD_SAFE,
);

// From an existing chat completion (no extra API call)
const completion = await client.chat.completions.create({ ... });
const evalResult = await client.safety.evaluate(completion, SafetyTemplates.STRICT);

// Mixed array — text + image + completion
const mixedResult = await client.safety.evaluate([
  'Text to check',
  'https://example.com/image.png',
  existingCompletion,
], SafetyTemplates.ENTERPRISE);

console.log(evalResult.passed);           // boolean
console.log(evalResult.failedCategories); // string[]
console.log(evalResult.template);         // template ID
console.log(evalResult.details);          // SafetyFilterSummary (full breakdown)
```

### `evaluate()` input types

`evaluate()` accepts:
- `string` — if it looks like a URL, treated as an image; otherwise as text (both trigger API calls)
- `{ url: string }` — image object (triggers API call)
- `ChatCompletion` — parsed locally from `content_filter_results`
- `ChatCompletionChoice` — single choice parsed locally
- `ChatCompletionChoice[]` — multiple choices parsed locally
- Any object with `content_filter_results` — parsed locally
- Array of any of the above — processed in parallel, results merged

---

## Evaluating Predictions

Prediction output (images, audio, text) can be evaluated directly via `evaluate()`. The method automatically handles URL detection: strings beginning with `http://` or `https://` are routed to `checkImage()`, while plain text strings are routed to `checkText()`. Arrays of strings (multiple outputs) are processed in parallel and results are merged.

### Image-output predictions

Most generation models return image URLs. Pass the output directly:

```ts
const prediction = await client.run('flux-pro', {
  input: { prompt: 'User-submitted prompt' },
});

// Evaluate the generated images
const evalResult = await client.safety.evaluate(
  prediction.output,           // string | string[] — image URLs are auto-detected
  SafetyTemplates.STRICT,
);

if (!evalResult.passed) {
  console.warn('Generated content failed safety check:', evalResult.failedCategories);
  await prediction.delete(); // delete flagged assets
}
```

### Text-output predictions

When a model returns text (not URLs), the same call works — text strings are passed to `checkText()`:

```ts
const prediction = await client.run('text-gen-model', {
  input: { prompt: userPrompt },
});

const evalResult = await client.safety.evaluate(
  prediction.output as string,
  SafetyTemplates.MODERATE,
);

if (!evalResult.passed) {
  throw new Error(`Output blocked: ${evalResult.failedCategories.join(', ')}`);
}
```

### Evaluating multiple outputs

When a prediction returns several images (e.g. `n: 4`), all are checked in parallel:

```ts
const prediction = await client.run('flux-pro', {
  input: { prompt: 'A city skyline', n: 4 },
});

// prediction.output is string[] with 4 URLs
const evalResult = await client.safety.evaluate(
  prediction.output as string[],
  SafetyTemplates.CHILD_SAFE,
);

// evalResult.passed is false if any single output fails
if (!evalResult.passed) {
  console.warn('At least one output failed:', evalResult.failedCategories);
}
```

### End-to-end: check input then check output

A robust pipeline checks both the user's prompt and the model's output:

```ts
async function safeGenerate(userPrompt: string): Promise<string[]> {
  // 1. Check the prompt before sending
  const inputCheck = await client.safety.checkText(userPrompt, {
    template: SafetyTemplates.MODERATE,
  });
  if (!inputCheck.passed) {
    throw new Error(`Prompt blocked: ${inputCheck.failedCategories.join(', ')}`);
  }

  // 2. Run the model
  const prediction = await client.run('flux-pro', {
    input: { prompt: userPrompt },
  });

  // 3. Evaluate the generated output
  const outputCheck = await client.safety.evaluate(
    prediction.output,
    SafetyTemplates.MODERATE,
  );

  if (!outputCheck.passed) {
    await prediction.delete(); // clean up flagged assets
    throw new Error(`Output blocked: ${outputCheck.failedCategories.join(', ')}`);
  }

  return Array.isArray(prediction.output)
    ? prediction.output
    : [prediction.output as string];
}
```

### Using `evaluate()` on the raw prediction response

If you have a stored `PredictionResponse` (e.g. fetched via `predictions.get()`), extract the output directly:

```ts
const prediction = await client.predictions.get('pred_abc123');

if (prediction.status === 'succeeded' && prediction.output) {
  const evalResult = await client.safety.evaluate(
    prediction.output,
    SafetyTemplates.ENTERPRISE,
  );
  console.log(evalResult.passed, evalResult.template, evalResult.details);
}
```

---

## Response Parsing (No Extra API Call)

Inspect `content_filter_results` on an existing response without additional API requests:

### `wasFiltered()`

```ts
const completion = await client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [{ role: 'user', content: userInput }],
});

if (client.safety.wasFiltered(completion)) {
  // Content was filtered on prompt or completion
  return res.status(400).json({ error: 'Content policy violation' });
}
```

### `getFilteredCategories()`

```ts
const categories = client.safety.getFilteredCategories(completion);
console.log(categories); // e.g. ["violence", "sexual"]
```

### `parseFilterResults()`

Returns a full structured breakdown:

```ts
const summary = client.safety.parseFilterResults(completion);

console.log(summary.anyFiltered); // boolean
console.log(summary.choice);      // per-category results for completion
console.log(summary.prompt);      // per-category results for prompt input

// Example summary.choice:
// {
//   hate: { filtered: false, severity: 'safe' },
//   violence: { filtered: true, severity: 'high' },
//   sexual: { filtered: false, severity: 'safe' },
//   self_harm: { filtered: false, severity: 'safe' },
// }
```

### Accepted input types for `wasFiltered`, `getFilteredCategories`, `parseFilterResults`

All three methods accept `SafetyCheckableInput`:
- `ChatCompletion`
- `ChatCompletionChoice`
- `ChatCompletionChoice[]`
- `{ choices: ChatCompletionChoice[] }` (completion-like object)
- Any object with `content_filter_results`

---

## Safety Categories

```ts
enum SafetyCategory {
  HATE                      = 'hate',
  VIOLENCE                  = 'violence',
  SEXUAL                    = 'sexual',
  SELF_HARM                 = 'self_harm',
  PROTECTED_MATERIAL_CODE   = 'protected_material_code',
  PROTECTED_MATERIAL_TEXT   = 'protected_material_text',
  JAILBREAK                 = 'jailbreak',
}
```

---

## Severity Levels

```ts
enum SafetySeverity {
  SAFE   = 'safe',
  LOW    = 'low',
  MEDIUM = 'medium',
  HIGH   = 'high',
}
```

Higher severity = more severe content. Templates with stricter thresholds block more content.

---

## Complete Result Shapes

### `SafetyCheckResult`

```ts
interface SafetyCheckResult {
  passed: boolean;
  failedCategories: string[];         // category names that triggered
  template: string;                   // template ID used
  contentFilterResults?: ChoiceContentFilterResults; // raw per-category results
}
```

### `SafetyEvaluationResult`

```ts
interface SafetyEvaluationResult {
  passed: boolean;
  failedCategories: string[];
  template: string;
  details: SafetyFilterSummary;       // full breakdown (choice + prompt)
}
```

### `SafetyFilterSummary`

```ts
interface SafetyFilterSummary {
  choice: Partial<Record<SafetyCategory, SafetyFilterCategoryResult>>;
  prompt?: Array<{
    prompt_index: number;
    results: Partial<Record<SafetyCategory, SafetyFilterCategoryResult>>;
  }>;
  anyFiltered: boolean;
}

interface SafetyFilterCategoryResult {
  filtered: boolean;
  severity?: string;   // SafetySeverity string
  detected?: boolean;  // for jailbreak / protected_material
}
```

---

## Integration Patterns

### Moderating user-submitted prompts before sending to a model

```ts
async function safeChat(userMessage: string): Promise<string> {
  // Check user input first
  const inputCheck = await client.safety.checkText(userMessage, {
    template: SafetyTemplates.MODERATE,
  });

  if (!inputCheck.passed) {
    throw new Error(`Input blocked: ${inputCheck.failedCategories.join(', ')}`);
  }

  // Run the chat
  const completion = await client.chat.completions.create({
    model: 'deepbrain-router',
    messages: [{ role: 'user', content: userMessage }],
  });

  // Check output
  if (client.safety.wasFiltered(completion)) {
    const categories = client.safety.getFilteredCategories(completion);
    throw new Error(`Output filtered: ${categories.join(', ')}`);
  }

  return completion.choices[0].message.content!;
}
```

### Logging filtered categories without blocking

```ts
const completion = await client.chat.completions.create({ ... });

const summary = client.safety.parseFilterResults(completion);
if (summary.anyFiltered) {
  await myLogger.warn('content_filtered', {
    categories: client.safety.getFilteredCategories(completion),
    promptFiltered: summary.prompt?.some(p => Object.values(p.results).some(r => r.filtered)),
  });
}
```

### Children's platform: apply CHILD_SAFE template

```ts
async function checkForChildren(text: string): Promise<boolean> {
  const result = await client.safety.evaluate(text, SafetyTemplates.CHILD_SAFE);
  return result.passed;
}
```

---

## Error Handling

```ts
import { SkytellsError } from 'skytells';

try {
  const result = await client.safety.checkText(userInput);
} catch (e) {
  if (e instanceof SkytellsError) {
    // API-level failure — not a safety decision, but a transport/auth error
    console.error(e.errorId, e.httpStatus, e.message);
  }
}
```

---

## Best Practices

- **Always check user-submitted content** before passing it to a model in user-facing apps.
- **Use `wasFiltered()` on responses** before returning model output to users — `finish_reason: 'content_filter'` also signals this.
- **Use `evaluate()` with a consistent template** for auditable decisions; the `template` field in the result documents the applied policy.
- **Proactive checks make an API call** — avoid calling `checkText` on every keystroke; debounce or check on submit.
- **Response parsing is free** — `wasFiltered()`, `getFilteredCategories()`, and `parseFilterResults()` work on existing completion objects with no network requests.
- **Log `failedCategories`** for compliance; do not log the actual flagged content.
