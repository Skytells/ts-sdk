# Orchestrator

The Skytells Orchestrator is a workflow automation platform for building, triggering, and monitoring multi-step AI workflows. Access via `client.orchestrator`.

> **Key distinction**: Orchestrator uses a separate `wfb_…` API key — it is **not** interchangeable with your Skytells platform key (`sk-…`). See [Setup](#setup) below.

---

## Setup

You need both a Skytells platform key and an Orchestrator API key:

```ts
import Skytells from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY, {
  orchestratorApiKey: process.env.ORCHESTRATOR_API_KEY, // wfb_…
});
```

If you only need Orchestrator (no Inference), you can omit the platform key:

```ts
const client = Skytells(undefined, {
  orchestratorApiKey: process.env.ORCHESTRATOR_API_KEY,
});
```

> Accessing `client.orchestrator` without `orchestratorApiKey` throws `SkytellsError` with `errorId: 'SDK_ERROR'`.

### Auth on the wire

The SDK uses a **separate internal HTTP transport** for Orchestrator:
- Sends `Authorization: Bearer wfb_…` only.
- Never sends `x-api-key` to the Orchestrator host.
- Strips `x-api-key` from any shared `ClientOptions.headers` on Orchestrator requests.

This prevents the `sk-…` key from leaking to `orchestrator.skytells.ai`.

---

## Sub-resources

`client.orchestrator` exposes 7 sub-resources:

| Sub-resource | Access | Purpose |
|---|---|---|
| `workflows` | `client.orchestrator.workflows` | CRUD, code export, project download |
| `executions` | `client.orchestrator.executions` | List, status, logs, bulk-delete |
| `webhooks` | `client.orchestrator.webhooks` | Trigger workflows via HTTP POST |
| `integrations` | `client.orchestrator.integrations` | Manage external integrations (Slack, etc.) |
| `apiKeys` | `client.orchestrator.apiKeys` | Manage Orchestrator API keys |
| `ai` | `client.orchestrator.ai` | AI-powered workflow generation (streaming) |
| `user` | `client.orchestrator.user` | Profile read and update |

---

## Workflows

### List all workflows

```ts
const workflows = await client.orchestrator.workflows.list();
// OrchestratorWorkflowSummary[]
for (const wf of workflows) {
  console.log(wf.id, wf.name);
}
```

### Create a workflow

```ts
const created = await client.orchestrator.workflows.create({
  name: 'My Image Pipeline',
  description: 'Generates images via Flux-Pro and stores them',
  // additional workflow config fields
});
```

### Get a workflow

```ts
const workflow = await client.orchestrator.workflows.get('workflow-id');
```

### Update a workflow

```ts
const updated = await client.orchestrator.workflows.update('workflow-id', {
  name: 'Updated Name',
  description: 'New description',
});
```

### Delete a workflow

```ts
await client.orchestrator.workflows.delete('workflow-id');
```

### Duplicate a workflow

```ts
const copy = await client.orchestrator.workflows.duplicate('workflow-id');
```

### Export as TypeScript code

Returns the workflow as generated TypeScript source text:

```ts
const typeScriptCode = await client.orchestrator.workflows.getCode('workflow-id');
console.log(typeScriptCode); // TypeScript string
```

### Download as Next.js project (ZIP)

Returns an `ArrayBuffer` containing a ZIP of the generated Next.js project:

```ts
const zipBuffer = await client.orchestrator.workflows.downloadProject('workflow-id');

// In Node.js
import { writeFileSync } from 'fs';
writeFileSync('workflow-project.zip', Buffer.from(zipBuffer));
```

---

## Webhook Triggers

The webhook executor lets you trigger a workflow by sending a JSON payload via HTTP POST. This is the primary way to invoke a workflow programmatically.

### Execute a workflow

```ts
const result = await client.orchestrator.webhooks.execute('workflow-id', {
  prompt: 'Generate a product image',
  style: 'photorealistic',
  background: 'white',
});

console.log(result.executionId); // Track via executions API
```

The body can be any JSON object — it becomes the workflow's trigger input.

### CORS preflight (OPTIONS)

```ts
await client.orchestrator.webhooks.preflight('workflow-id');
```

---

## Executions

### List executions for a workflow

```ts
const executions = await client.orchestrator.executions.list('workflow-id');
for (const exec of executions) {
  console.log(exec.id, exec.status);
}
```

### Get execution status

```ts
const status = await client.orchestrator.executions.getStatus('execution-id');
console.log(status); // { status: 'running' | 'completed' | 'failed', ... }
```

### Get execution logs

```ts
const logs = await client.orchestrator.executions.getLogs('execution-id');
for (const entry of logs) {
  console.log(entry);
}
```

### Delete all executions for a workflow

```ts
await client.orchestrator.executions.deleteAllForWorkflow('workflow-id');
```

---

## Integrations

Integrations connect Orchestrator to external services (Slack, other Skytells services, etc.).

### List integrations

```ts
// All integrations
const all = await client.orchestrator.integrations.list();

// Filter by type
const slackIntegrations = await client.orchestrator.integrations.list({ type: 'slack' });
```

### Create an integration

```ts
const integration = await client.orchestrator.integrations.create({
  type: 'slack',
  name: 'My Slack Integration',
  config: { webhookUrl: 'https://hooks.slack.com/...' },
});
```

### Get an integration

```ts
const integration = await client.orchestrator.integrations.get('integration-id');
```

### Update an integration

```ts
const updated = await client.orchestrator.integrations.update('integration-id', {
  name: 'Updated Name',
  config: { webhookUrl: 'https://hooks.slack.com/new-url' },
});
```

### Delete an integration

```ts
await client.orchestrator.integrations.delete('integration-id');
```

### Test an integration

Verifies the integration is working:

```ts
const testResult = await client.orchestrator.integrations.test('integration-id');
```

---

## API Keys

Manage Orchestrator API keys (`wfb_…`):

### List API keys

```ts
const keys = await client.orchestrator.apiKeys.list();
```

### Create an API key

```ts
const newKey = await client.orchestrator.apiKeys.create({
  name: 'Production key',
});

// The key value is returned ONLY at creation time — store it securely
console.log(newKey.key); // "wfb_..."
```

> **Security**: Store the key value immediately. It is only returned once.

---

## AI Workflow Generation (Streaming)

Generate a workflow using natural language. Returns an NDJSON stream:

```ts
const stream = client.orchestrator.ai.generateWorkflow({
  prompt: 'Create a workflow that generates product images from a product name',
});

for await (const operation of stream) {
  console.log(operation);
  // Each operation is a JSON object describing a build step
}
```

The stream emits `OrchestratorAiStreamOperation` objects — one per line as NDJSON. The operations describe the generated workflow steps as they're built.

---

## User Profile

### Get profile

```ts
const user = await client.orchestrator.user.get();
console.log(user); // profile fields
```

### Update profile

```ts
await client.orchestrator.user.updateProfile({
  name: 'New Name',
  // additional profile fields
});
```

---

## Error Handling

```ts
import { SkytellsError } from 'skytells';

try {
  const workflows = await client.orchestrator.workflows.list();
} catch (e) {
  if (e instanceof SkytellsError) {
    if (e.errorId === 'SDK_ERROR') {
      // orchestratorApiKey was not provided
      console.error('Set orchestratorApiKey in ClientOptions');
    } else if (e.httpStatus === 401) {
      // Invalid or expired wfb_… key
      console.error('Invalid Orchestrator API key');
    } else {
      console.error(e.errorId, e.httpStatus, e.message);
    }
  }
}
```

---

## Notes on Auth Scopes

The Orchestrator has two auth contexts:

| Route type | Auth |
|---|---|
| Webhook trigger (`POST /api/workflows/{id}/webhook`) | `Authorization: Bearer wfb_…` ✅ |
| Management routes (list, create, update, delete) | May require session/cookie auth in some contexts |

If management routes return `401` with only a webhook (`wfb_…`) key, use session authentication (e.g. browser, `fetch` with credentials) or the [Orchestrator dashboard](https://learn.skytells.ai/docs/products/orchestrator/api-reference).

---

## Best Practices

- Store `wfb_…` keys in environment variables — never in source code.
- Use `api.orchestrator.apiKeys.create()` to generate per-environment keys (staging vs production).
- Use `executions.getStatus()` to poll long-running workflows instead of holding connections open.
- Validate trigger input schemas before calling `webhooks.execute()` to avoid runtime errors in the workflow.
- Clean up old executions via `executions.deleteAllForWorkflow()` to keep dashboards manageable.
