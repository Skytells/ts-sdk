/**
 * Request/response shapes for [Skytells Orchestrator](https://learn.skytells.ai/docs/products/orchestrator/api-reference).
 * The API may evolve; types are best-effort — use `unknown` or extend locally when fields differ.
 *
 * @module types/orchestrator
 */

/** Workflow list item (subset; server may return more fields). */
export interface OrchestratorWorkflowSummary {
  id: string;
  name: string;
  description?: string;
  visibility?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface OrchestratorCreateWorkflowBody {
  name: string;
  description?: string;
  nodes?: unknown[];
  edges?: unknown[];
}

export interface OrchestratorUpdateWorkflowBody {
  name?: string;
  description?: string;
  nodes?: unknown[];
  edges?: unknown[];
  visibility?: string;
}

export interface OrchestratorWebhookTriggerResponse {
  executionId: string;
  status: string;
  [key: string]: unknown;
}

export interface OrchestratorCreateIntegrationBody {
  name: string;
  type: string;
  config: Record<string, unknown>;
}

export interface OrchestratorCreateApiKeyBody {
  name: string;
}

export interface OrchestratorCreateApiKeyResponse {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface OrchestratorAiGenerateBody {
  prompt: string;
}

/** One streamed JSONL operation from `POST /api/ai/generate`. */
export interface OrchestratorAiStreamOperation {
  op: string;
  [key: string]: unknown;
}

export interface OrchestratorUpdateUserBody {
  name?: string;
}
