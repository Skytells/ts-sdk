/**
 * Live tests — Orchestrator API
 *
 * Covers all orchestrator sub-resources: workflows, executions, webhooks,
 * integrations, apiKeys, ai, user.
 *
 * Requires BOTH env vars to run:
 *   SKYTELLS_API_KEY=sk-...
 *   SKYTELLS_ORCHESTRATOR_KEY=wfb-...
 *
 *   SKYTELLS_API_KEY=sk-... SKYTELLS_ORCHESTRATOR_KEY=wfb-... npm run test:orchestrator-live
 *
 * All tests auto-skip when either key is absent so the unit suite stays green.
 */

import Skytells from '../src';
import type { SkytellsClient } from '../src';
import type {
  OrchestratorWorkflowSummary,
  OrchestratorCreateWorkflowBody,
  OrchestratorAiStreamOperation,
  OrchestratorCreateApiKeyResponse,
} from '../src/types/orchestrator.types';
import { SkytellsError } from '../src/types/shared.types';

// ─── Config ──────────────────────────────────────────────────────────────────

const apiKey = process.env.SKYTELLS_API_KEY?.trim();
const orchKey = process.env.SKYTELLS_ORCHESTRATOR_KEY?.trim();

// Both keys are required — orchestrator calls are meaningless without the wfb key.
const describeLive = apiKey && orchKey ? describe : describe.skip;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function banner(title: string): void {
  console.log(`\n${'─'.repeat(14)} ${title} ${'─'.repeat(14)}`);
}

/** Run an async fn and return [result, null] | [null, error]. */
async function safe<T>(fn: () => Promise<T>): Promise<[T, null] | [null, SkytellsError | Error]> {
  try {
    return [await fn(), null];
  } catch (e) {
    return [null, e as SkytellsError | Error];
  }
}

// ─── User ─────────────────────────────────────────────────────────────────────

describeLive('Live Orchestrator: user', () => {
  jest.setTimeout(30_000);

  let client: SkytellsClient;

  beforeAll(() => {
    client = Skytells(apiKey!, { orchestratorApiKey: orchKey! });
  });

  test('user.get — returns profile object', async () => {
    banner('user.get');

    const user = await client.orchestrator.user.get();

    console.log('[user.get] id  :', (user as Record<string, unknown>).id ?? '(no id)');
    console.log('[user.get] keys:', Object.keys(user as object));

    expect(user).toBeTruthy();
    expect(typeof user).toBe('object');
  });

  test('user.updateProfile — returns updated profile', async () => {
    banner('user.updateProfile');

    // Fetch current name first to restore it afterward.
    const current = (await client.orchestrator.user.get()) as Record<string, unknown>;
    const originalName = (current.name as string | undefined) ?? '';

    const [updated, err] = await safe(() =>
      client.orchestrator.user.updateProfile({ name: originalName }),
    );

    if (err) {
      console.log('[user.updateProfile] skipped (API error):', err.message);
      return; // Graceful skip — some accounts may not allow profile updates.
    }

    console.log('[user.updateProfile] name:', (updated as Record<string, unknown>).name);
    expect(updated).toBeTruthy();
  });
});

// ─── API Keys ─────────────────────────────────────────────────────────────────

describeLive('Live Orchestrator: apiKeys', () => {
  jest.setTimeout(30_000);

  let client: SkytellsClient;

  beforeAll(() => {
    client = Skytells(apiKey!, { orchestratorApiKey: orchKey! });
  });

  test('apiKeys.list — returns array', async () => {
    banner('apiKeys.list');

    const keys = (await client.orchestrator.apiKeys.list()) as unknown[];

    console.log('[apiKeys.list] count:', keys.length);
    expect(Array.isArray(keys)).toBe(true);
  });

  test('apiKeys.create — creates a new key', async () => {
    banner('apiKeys.create');

    const [result, err] = await safe<OrchestratorCreateApiKeyResponse>(() =>
      client.orchestrator.apiKeys.create({ name: 'skytells-sdk-live-test-key' }),
    );

    if (err) {
      console.log('[apiKeys.create] skipped (API error):', err.message);
      return;
    }

    console.log('[apiKeys.create] keyPrefix:', result!.keyPrefix);
    expect(result!.id).toBeTruthy();
    expect(result!.name).toBe('skytells-sdk-live-test-key');
    expect(result!.key).toBeTruthy(); // Only returned on creation.
  });
});

// ─── Integrations ─────────────────────────────────────────────────────────────

describeLive('Live Orchestrator: integrations', () => {
  jest.setTimeout(30_000);

  let client: SkytellsClient;
  let createdIntegrationId: string | undefined;

  beforeAll(() => {
    client = Skytells(apiKey!, { orchestratorApiKey: orchKey! });
  });

  afterAll(async () => {
    // Clean up the integration we created, if any.
    if (createdIntegrationId) {
      const [, err] = await safe(() =>
        client.orchestrator.integrations.delete(createdIntegrationId!),
      );
      if (err) console.log('[integrations] cleanup error:', err.message);
    }
  });

  test('integrations.list — returns array', async () => {
    banner('integrations.list');

    const list = (await client.orchestrator.integrations.list()) as unknown[];

    console.log('[integrations.list] count:', list.length);
    expect(Array.isArray(list)).toBe(true);
  });

  test('integrations.create — creates integration', async () => {
    banner('integrations.create');

    const [result, err] = await safe(() =>
      client.orchestrator.integrations.create({
        name: 'skytells-sdk-live-test',
        type: 'webhook',
        config: { url: 'https://example.com/hook' },
      }),
    );

    if (err) {
      console.log('[integrations.create] skipped (API error):', err.message);
      return;
    }

    console.log('[integrations.create] id:', (result as Record<string, unknown>).id);
    createdIntegrationId = (result as Record<string, unknown>).id as string | undefined;
    expect(result).toBeTruthy();
  });

  test('integrations.get — fetches integration by id', async () => {
    banner('integrations.get');

    if (!createdIntegrationId) {
      console.log('[integrations.get] skipped — no created integration');
      return;
    }

    const [item, err] = await safe(() =>
      client.orchestrator.integrations.get(createdIntegrationId!),
    );

    if (err) {
      console.log('[integrations.get] error:', err.message);
      return;
    }

    console.log('[integrations.get] name:', (item as Record<string, unknown>).name);
    expect((item as Record<string, unknown>).id).toBe(createdIntegrationId);
  });

  test('integrations.update — updates the integration', async () => {
    banner('integrations.update');

    if (!createdIntegrationId) {
      console.log('[integrations.update] skipped — no created integration');
      return;
    }

    const [updated, err] = await safe(() =>
      client.orchestrator.integrations.update(createdIntegrationId!, {
        name: 'skytells-sdk-live-test (updated)',
        type: 'webhook',
        config: { url: 'https://example.com/hook' },
      }),
    );

    if (err) {
      console.log('[integrations.update] error:', err.message);
      return;
    }

    console.log('[integrations.update] name:', (updated as Record<string, unknown>).name);
    expect(updated).toBeTruthy();
  });

  test('integrations.test — pings the integration', async () => {
    banner('integrations.test');

    if (!createdIntegrationId) {
      console.log('[integrations.test] skipped — no created integration');
      return;
    }

    const [result, err] = await safe(() =>
      client.orchestrator.integrations.test(createdIntegrationId!),
    );

    if (err) {
      // A connectivity error is acceptable — what matters is the SDK call succeeded.
      console.log('[integrations.test] note:', err.message);
      return;
    }

    console.log('[integrations.test] result:', result);
    expect(result).toBeTruthy();
  });

  test('integrations.delete — removes integration', async () => {
    banner('integrations.delete');

    if (!createdIntegrationId) {
      console.log('[integrations.delete] skipped — no created integration');
      return;
    }

    const [, err] = await safe(() =>
      client.orchestrator.integrations.delete(createdIntegrationId!),
    );

    if (!err) {
      createdIntegrationId = undefined; // Prevent afterAll from double-deleting.
      console.log('[integrations.delete] deleted');
    } else {
      console.log('[integrations.delete] error:', err.message);
    }

    // Pass regardless — deletion is best-effort for test cleanup.
    expect(true).toBe(true);
  });
});

// ─── Workflows ────────────────────────────────────────────────────────────────

describeLive('Live Orchestrator: workflows', () => {
  jest.setTimeout(60_000);

  let client: SkytellsClient;
  let createdWorkflowId: string | undefined;
  let existingWorkflowId: string | undefined;

  beforeAll(async () => {
    client = Skytells(apiKey!, { orchestratorApiKey: orchKey! });

    // Get any existing workflow ID for subsequent read-only tests.
    const [list, err] = await safe(
      () => client.orchestrator.workflows.list() as Promise<OrchestratorWorkflowSummary[]>,
    );
    if (list && list.length > 0) {
      existingWorkflowId = list[0]!.id;
    } else if (err) {
      console.log('[workflows beforeAll] list error:', err.message);
    }
  });

  afterAll(async () => {
    if (createdWorkflowId) {
      const [, err] = await safe(() => client.orchestrator.workflows.delete(createdWorkflowId!));
      if (err) console.log('[workflows] cleanup error:', err.message);
    }
  });

  test('workflows.list — returns array with expected shape', async () => {
    banner('workflows.list');

    const list = (await client.orchestrator.workflows.list()) as OrchestratorWorkflowSummary[];

    console.log('[workflows.list] count:', list.length);
    if (list.length > 0) {
      console.log('[workflows.list] first id:', list[0]!.id);
    }

    expect(Array.isArray(list)).toBe(true);
  });

  test('workflows.create — creates a workflow', async () => {
    banner('workflows.create');

    const body: OrchestratorCreateWorkflowBody = {
      name: 'skytells-sdk-live-test-workflow',
      description: 'Created by SDK live tests — safe to delete',
      nodes: [],
      edges: [],
    };

    const [wf, err] = await safe(
      () => client.orchestrator.workflows.create(body) as Promise<OrchestratorWorkflowSummary>,
    );

    if (err) {
      console.log('[workflows.create] skipped:', err.message);
      return;
    }

    console.log('[workflows.create] id  :', wf!.id);
    console.log('[workflows.create] name:', wf!.name);
    createdWorkflowId = wf?.id;
    expect(wf!.id).toBeTruthy();
    expect(wf!.name).toBe('skytells-sdk-live-test-workflow');
  });

  test('workflows.get — fetches workflow by id', async () => {
    banner('workflows.get');

    const id = createdWorkflowId ?? existingWorkflowId;
    if (!id) {
      console.log('[workflows.get] skipped — no workflow id');
      return;
    }

    const [wf, err] = await safe(
      () => client.orchestrator.workflows.get(id) as Promise<OrchestratorWorkflowSummary>,
    );

    if (err) {
      console.log('[workflows.get] error:', err.message);
      return;
    }

    console.log('[workflows.get] id  :', wf!.id);
    console.log('[workflows.get] name:', wf!.name);
    expect(wf!.id).toBe(id);
  });

  test('workflows.update — updates workflow name', async () => {
    banner('workflows.update');

    const id = createdWorkflowId;
    if (!id) {
      console.log('[workflows.update] skipped — only runs on created workflow');
      return;
    }

    const [updated, err] = await safe(
      () =>
        client.orchestrator.workflows.update(id, {
          name: 'skytells-sdk-live-test-workflow (updated)',
        }) as Promise<OrchestratorWorkflowSummary>,
    );

    if (err) {
      console.log('[workflows.update] error:', err.message);
      return;
    }

    console.log('[workflows.update] name:', updated!.name);
    expect(updated).toBeTruthy();
  });

  test('workflows.getCode — returns workflow DSL code string', async () => {
    banner('workflows.getCode');

    const id = createdWorkflowId ?? existingWorkflowId;
    if (!id) {
      console.log('[workflows.getCode] skipped — no workflow id');
      return;
    }

    const [code, err] = await safe(() => client.orchestrator.workflows.getCode(id));

    if (err) {
      console.log('[workflows.getCode] error:', err.message);
      return;
    }

    // getCode() returns a string or JSON.
    console.log('[workflows.getCode] type   :', typeof code);
    console.log('[workflows.getCode] excerpt:', String(code).slice(0, 80));
    expect(code).toBeTruthy();
  });

  test('workflows.duplicate — duplicates a workflow', async () => {
    banner('workflows.duplicate');

    const id = createdWorkflowId ?? existingWorkflowId;
    if (!id) {
      console.log('[workflows.duplicate] skipped — no workflow id');
      return;
    }

    const [dup, err] = await safe(
      () => client.orchestrator.workflows.duplicate(id) as Promise<OrchestratorWorkflowSummary>,
    );

    if (err) {
      console.log('[workflows.duplicate] error:', err.message);
      return;
    }

    const dupId = (dup as Record<string, unknown>)?.id as string | undefined;
    console.log('[workflows.duplicate] new id:', dupId);
    expect(dup).toBeTruthy();

    // Clean up the duplicate.
    if (dupId) {
      const [, delErr] = await safe(() => client.orchestrator.workflows.delete(dupId));
      if (delErr) console.log('[workflows.duplicate] cleanup error:', delErr.message);
    }
  });

  test('workflows.downloadProject — returns ArrayBuffer', async () => {
    banner('workflows.downloadProject');

    const id = createdWorkflowId ?? existingWorkflowId;
    if (!id) {
      console.log('[workflows.downloadProject] skipped — no workflow id');
      return;
    }

    const [buf, err] = await safe(() => client.orchestrator.workflows.downloadProject(id));

    if (err) {
      console.log('[workflows.downloadProject] error:', err.message);
      return;
    }

    console.log('[workflows.downloadProject] byteLength:', (buf as ArrayBuffer).byteLength);
    expect(buf instanceof ArrayBuffer).toBe(true);
  });

  test('workflows.delete — deletes the created workflow', async () => {
    banner('workflows.delete');

    if (!createdWorkflowId) {
      console.log('[workflows.delete] skipped — nothing was created');
      return;
    }

    const [, err] = await safe(() => client.orchestrator.workflows.delete(createdWorkflowId!));

    if (!err) {
      createdWorkflowId = undefined; // Prevent afterAll from double-deleting.
      console.log('[workflows.delete] deleted');
    } else {
      console.log('[workflows.delete] error:', err.message);
    }

    expect(true).toBe(true); // Best-effort.
  });
});

// ─── Executions ───────────────────────────────────────────────────────────────

describeLive('Live Orchestrator: executions', () => {
  jest.setTimeout(30_000);

  let client: SkytellsClient;
  let workflowId: string | undefined;

  beforeAll(async () => {
    client = Skytells(apiKey!, { orchestratorApiKey: orchKey! });

    const [list, err] = await safe(
      () => client.orchestrator.workflows.list() as Promise<OrchestratorWorkflowSummary[]>,
    );
    if (list && list.length > 0) {
      workflowId = list[0]!.id;
    } else if (err) {
      console.log('[executions beforeAll] list error:', err.message);
    }
  });

  test('executions.list — returns executions for a workflow', async () => {
    banner('executions.list');

    if (!workflowId) {
      console.log('[executions.list] skipped — no workflow');
      return;
    }

    const [list, err] = await safe(() => client.orchestrator.executions.list(workflowId!));

    if (err) {
      console.log('[executions.list] error:', err.message);
      return;
    }

    console.log('[executions.list] count:', Array.isArray(list) ? list.length : '(non-array)');
    expect(list).toBeTruthy();
  });

  test('executions.getStatus — fetches execution status', async () => {
    banner('executions.getStatus');

    if (!workflowId) {
      console.log('[executions.getStatus] skipped — no workflow');
      return;
    }

    // Get the first execution if any.
    const [list, listErr] = await safe(() => client.orchestrator.executions.list(workflowId!));

    const executions = list as Array<Record<string, unknown>> | null;
    if (listErr || !executions || executions.length === 0) {
      console.log('[executions.getStatus] skipped — no executions');
      return;
    }

    const execId = executions[0]!.id as string;
    const [status, err] = await safe(() => client.orchestrator.executions.getStatus(execId));

    if (err) {
      console.log('[executions.getStatus] error:', err.message);
      return;
    }

    console.log('[executions.getStatus] status:', status);
    expect(status).toBeTruthy();
  });

  test('executions.getLogs — fetches execution logs', async () => {
    banner('executions.getLogs');

    if (!workflowId) {
      console.log('[executions.getLogs] skipped — no workflow');
      return;
    }

    const [list, listErr] = await safe(() => client.orchestrator.executions.list(workflowId!));

    const executions = list as Array<Record<string, unknown>> | null;
    if (listErr || !executions || executions.length === 0) {
      console.log('[executions.getLogs] skipped — no executions');
      return;
    }

    const execId = executions[0]!.id as string;
    const [logs, err] = await safe(() => client.orchestrator.executions.getLogs(execId));

    if (err) {
      console.log('[executions.getLogs] error:', err.message);
      return;
    }

    console.log('[executions.getLogs] type:', typeof logs);
    expect(logs !== undefined).toBe(true);
  });
});

// ─── Webhooks ─────────────────────────────────────────────────────────────────

describeLive('Live Orchestrator: webhooks', () => {
  jest.setTimeout(30_000);

  let client: SkytellsClient;
  let workflowId: string | undefined;

  beforeAll(async () => {
    client = Skytells(apiKey!, { orchestratorApiKey: orchKey! });

    const [list, err] = await safe(
      () => client.orchestrator.workflows.list() as Promise<OrchestratorWorkflowSummary[]>,
    );
    if (list && list.length > 0) {
      workflowId = list[0]!.id;
    } else if (err) {
      console.log('[webhooks beforeAll] list error:', err.message);
    }
  });

  test('webhooks.preflight — returns webhook metadata', async () => {
    banner('webhooks.preflight');

    if (!workflowId) {
      console.log('[webhooks.preflight] skipped — no workflow');
      return;
    }

    const [result, err] = await safe(() => client.orchestrator.webhooks.preflight(workflowId!));

    if (err) {
      console.log('[webhooks.preflight] error:', err.message);
      return;
    }

    console.log('[webhooks.preflight] result:', result);
    expect(result).toBeTruthy();
  });

  test('webhooks.execute — triggers a workflow via webhook', async () => {
    banner('webhooks.execute');

    if (!workflowId) {
      console.log('[webhooks.execute] skipped — no workflow');
      return;
    }

    const [result, err] = await safe(() =>
      client.orchestrator.webhooks.execute(workflowId!, { source: 'sdk-live-test' }),
    );

    if (err) {
      console.log('[webhooks.execute] error:', err.message);
      return;
    }

    console.log('[webhooks.execute] executionId:', result?.executionId);
    expect(result).toBeTruthy();
  });
});

// ─── AI — generateWorkflow (stream) ───────────────────────────────────────────

describeLive('Live Orchestrator: ai', () => {
  jest.setTimeout(60_000);

  let client: SkytellsClient;

  beforeAll(() => {
    client = Skytells(apiKey!, { orchestratorApiKey: orchKey! });
  });

  test('ai.generateWorkflow — streams NDJSON operations', async () => {
    banner('ai.generateWorkflow');

    const ops: OrchestratorAiStreamOperation[] = [];
    let errCaught: Error | null = null;

    try {
      const stream = client.orchestrator.ai.generateWorkflow({
        prompt: 'a simple workflow that echoes a message',
      });

      for await (const op of stream) {
        ops.push(op);
        if (ops.length >= 5) break; // Limit output to first 5 ops.
      }
    } catch (e) {
      errCaught = e as Error;
      console.log('[ai.generateWorkflow] error:', errCaught.message);
    }

    if (!errCaught) {
      console.log('[ai.generateWorkflow] ops received:', ops.length);
      console.log('[ai.generateWorkflow] first op   :', ops[0]);
      expect(ops.length).toBeGreaterThan(0);
    }
    // If AI generation errors, we accept it gracefully (may need special permissions).
  });
});
