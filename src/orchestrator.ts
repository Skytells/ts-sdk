/**
 * Skytells Orchestrator REST API — workflows, executions, integrations, webhook triggers, etc.
 *
 * **Keys (not interchangeable):** Orchestrator [`wfb_…`](https://learn.skytells.ai/docs/products/orchestrator/api-keys)
 * vs Skytells platform `sk-…`. Pass both on one client via **`ClientOptions`**. The SDK uses a **dedicated** internal `HTTP` stack for Orchestrator: `Authorization: Bearer` only
 * ([webhook auth](https://learn.skytells.ai/docs/products/orchestrator/webhooks)); **`x-api-key` is never sent** and
 * any `x-api-key` in shared `ClientOptions.headers` is **removed** on Orchestrator requests so the `sk-…` key cannot
 * leak to `orchestrator.skytells.ai`.
 *
 * **Management routes** (workflows, executions in the dashboard) are documented as **session/cookie** auth; the
 * webhook route is **`Bearer wfb_…`**. If a management call returns 401 with only a webhook key, use session auth
 * (e.g. `fetch` with credentials) or the browser. See the [API reference](https://learn.skytells.ai/docs/products/orchestrator/api-reference).
 *
 * @module orchestrator
 */

import type { HTTP } from './http.js';
import type {
  OrchestratorAiGenerateBody,
  OrchestratorAiStreamOperation,
  OrchestratorCreateApiKeyBody,
  OrchestratorCreateApiKeyResponse,
  OrchestratorCreateIntegrationBody,
  OrchestratorCreateWorkflowBody,
  OrchestratorUpdateUserBody,
  OrchestratorUpdateWorkflowBody,
  OrchestratorWebhookTriggerResponse,
  OrchestratorWorkflowSummary,
} from './types/orchestrator.types.js';

function enc(id: string): string {
  return encodeURIComponent(id);
}

/**
 * Workflow CRUD, TypeScript **code export** (text), and Next.js project **ZIP** download.
 *
 * Paths under `/api/workflows`. IDs are URL-encoded in path segments.
 */
export class OrchestratorWorkflows {
  constructor(private readonly http: HTTP) {}

  /** `GET /api/workflows` */
  list(): Promise<OrchestratorWorkflowSummary[]> {
    return this.http.request<OrchestratorWorkflowSummary[]>('GET', '/api/workflows');
  }

  /** `POST /api/workflows/create` */
  create(body: OrchestratorCreateWorkflowBody): Promise<unknown> {
    return this.http.request(
      'POST',
      '/api/workflows/create',
      body as unknown as Record<string, unknown>,
    );
  }

  /** `GET /api/workflows/{workflowId}` */
  get(workflowId: string): Promise<unknown> {
    return this.http.request('GET', `/api/workflows/${enc(workflowId)}`);
  }

  /** `PATCH /api/workflows/{workflowId}` */
  update(workflowId: string, body: OrchestratorUpdateWorkflowBody): Promise<unknown> {
    return this.http.request(
      'PATCH',
      `/api/workflows/${enc(workflowId)}`,
      body as unknown as Record<string, unknown>,
    );
  }

  /** `DELETE /api/workflows/{workflowId}` */
  delete(workflowId: string): Promise<unknown> {
    return this.http.request('DELETE', `/api/workflows/${enc(workflowId)}`);
  }

  /** `POST /api/workflows/{workflowId}/duplicate` */
  duplicate(workflowId: string): Promise<unknown> {
    return this.http.request('POST', `/api/workflows/${enc(workflowId)}/duplicate`);
  }

  /** `GET /api/workflows/{workflowId}/code` — generated TypeScript as plain text. */
  getCode(workflowId: string): Promise<string> {
    return this.http.requestText('GET', `/api/workflows/${enc(workflowId)}/code`);
  }

  /** `GET /api/workflows/{workflowId}/download` — Next.js project ZIP. */
  downloadProject(workflowId: string): Promise<ArrayBuffer> {
    return this.http.requestBuffer('GET', `/api/workflows/${enc(workflowId)}/download`);
  }
}

/**
 * List executions per workflow, poll status, fetch logs, bulk-delete by workflow.
 *
 * @remarks Some dashboard “management” routes may require session auth; webhook key alone may 401 — see module doc.
 */
export class OrchestratorExecutions {
  constructor(private readonly http: HTTP) {}

  /** `GET /api/workflows/{workflowId}/executions` */
  list(workflowId: string): Promise<unknown[]> {
    return this.http.request<unknown[]>('GET', `/api/workflows/${enc(workflowId)}/executions`);
  }

  /** `GET /api/workflows/executions/{executionId}/status` */
  getStatus(executionId: string): Promise<unknown> {
    return this.http.request('GET', `/api/workflows/executions/${enc(executionId)}/status`);
  }

  /** `GET /api/workflows/executions/{executionId}/logs` */
  getLogs(executionId: string): Promise<unknown[]> {
    return this.http.request<unknown[]>(
      'GET',
      `/api/workflows/executions/${enc(executionId)}/logs`,
    );
  }

  /** `DELETE /api/workflows/{workflowId}/executions` — delete all executions for a workflow. */
  deleteAllForWorkflow(workflowId: string): Promise<unknown> {
    return this.http.request('DELETE', `/api/workflows/${enc(workflowId)}/executions`);
  }
}

/**
 * **Public webhook trigger** for workflows: `POST` JSON body becomes trigger input; `OPTIONS` for CORS.
 *
 * Auth: `Authorization: Bearer wfb_…` on the internal Orchestrator {@link HTTP} transport.
 */
export class OrchestratorWebhooks {
  constructor(private readonly http: HTTP) {}

  /**
   * `POST /api/workflows/{workflowId}/webhook`
   * Body: any JSON (becomes trigger input). Auth: `Authorization: Bearer wfb_…`.
   */
  execute(
    workflowId: string,
    body: Record<string, unknown> = {},
  ): Promise<OrchestratorWebhookTriggerResponse> {
    return this.http.request<OrchestratorWebhookTriggerResponse>(
      'POST',
      `/api/workflows/${enc(workflowId)}/webhook`,
      body,
    );
  }

  /** `OPTIONS /api/workflows/{workflowId}/webhook` — CORS preflight. */
  preflight(workflowId: string): Promise<void> {
    return this.http.requestOptions(`/api/workflows/${enc(workflowId)}/webhook`);
  }
}

/** Slack/Skytells/etc. integrations: list, CRUD, and test endpoint. */
export class OrchestratorIntegrations {
  constructor(private readonly http: HTTP) {}

  /** `GET /api/integrations` — optional `type` query (e.g. `slack`, `skytells`). */
  list(options?: { type?: string }): Promise<unknown[]> {
    const q = options?.type ? `?type=${encodeURIComponent(options.type)}` : '';
    return this.http.request<unknown[]>('GET', `/api/integrations${q}`);
  }

  /** `POST /api/integrations` */
  create(body: OrchestratorCreateIntegrationBody): Promise<unknown> {
    return this.http.request(
      'POST',
      '/api/integrations',
      body as unknown as Record<string, unknown>,
    );
  }

  /** `GET /api/integrations/{integrationId}` */
  get(integrationId: string): Promise<unknown> {
    return this.http.request('GET', `/api/integrations/${enc(integrationId)}`);
  }

  /** `PUT /api/integrations/{integrationId}` */
  update(integrationId: string, body: Record<string, unknown>): Promise<unknown> {
    return this.http.request('PUT', `/api/integrations/${enc(integrationId)}`, body);
  }

  /** `DELETE /api/integrations/{integrationId}` */
  delete(integrationId: string): Promise<unknown> {
    return this.http.request('DELETE', `/api/integrations/${enc(integrationId)}`);
  }

  /** `POST /api/integrations/{integrationId}/test` */
  test(integrationId: string): Promise<unknown> {
    return this.http.request('POST', `/api/integrations/${enc(integrationId)}/test`);
  }
}

/** Orchestrator API keys (`GET/POST /api/api-keys`). */
export class OrchestratorApiKeys {
  constructor(private readonly http: HTTP) {}

  /** `GET /api/api-keys` */
  list(): Promise<unknown[]> {
    return this.http.request<unknown[]>('GET', '/api/api-keys');
  }

  /** `POST /api/api-keys` — `key` is returned only once. */
  create(body: OrchestratorCreateApiKeyBody): Promise<OrchestratorCreateApiKeyResponse> {
    return this.http.request<OrchestratorCreateApiKeyResponse>(
      'POST',
      '/api/api-keys',
      body as unknown as Record<string, unknown>,
    );
  }
}

/**
 * Streamed workflow builder: `POST /api/ai/generate` returns **NDJSON** (one JSON object per line).
 *
 * Consumed via {@link HTTP.requestNdjsonStream} through {@link OrchestratorAi.generateWorkflow}.
 */
export class OrchestratorAi {
  constructor(private readonly http: HTTP) {}

  /** Stream workflow-building operations (one JSON object per line). */
  generateWorkflow(body: OrchestratorAiGenerateBody): AsyncIterable<OrchestratorAiStreamOperation> {
    return this.http.requestNdjsonStream<OrchestratorAiStreamOperation>('/api/ai/generate', {
      prompt: body.prompt,
    });
  }
}

/** Orchestrator user profile: read and patch `/api/user`. */
export class OrchestratorUser {
  constructor(private readonly http: HTTP) {}

  /** `GET /api/user` */
  get(): Promise<unknown> {
    return this.http.request('GET', '/api/user');
  }

  /** `PATCH /api/user` */
  updateProfile(body: OrchestratorUpdateUserBody): Promise<unknown> {
    return this.http.request('PATCH', '/api/user', body as unknown as Record<string, unknown>);
  }
}

/**
 * Root Orchestrator client mounted at {@link SkytellsClient.orchestrator}.
 *
 * @example
 * ```ts
 * const client = Skytells('sk-…', { orchestratorApiKey: process.env.ORCHESTRATOR_KEY });
 * const { executionId } = await client.orchestrator.webhooks.execute('wf_123', { query: 'hello' });
 * ```
 */
export class Orchestrator {
  readonly workflows: OrchestratorWorkflows;
  readonly executions: OrchestratorExecutions;
  readonly webhooks: OrchestratorWebhooks;
  readonly integrations: OrchestratorIntegrations;
  readonly apiKeys: OrchestratorApiKeys;
  readonly ai: OrchestratorAi;
  readonly user: OrchestratorUser;

  constructor(http: HTTP) {
    this.workflows = new OrchestratorWorkflows(http);
    this.executions = new OrchestratorExecutions(http);
    this.webhooks = new OrchestratorWebhooks(http);
    this.integrations = new OrchestratorIntegrations(http);
    this.apiKeys = new OrchestratorApiKeys(http);
    this.ai = new OrchestratorAi(http);
    this.user = new OrchestratorUser(http);
  }
}
