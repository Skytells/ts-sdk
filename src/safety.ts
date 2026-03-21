/**
 * Safety API — Proactive safety checks and chat response parsing.
 *
 * Two mechanisms:
 * 1. Proactive (safety.checkText, safety.checkImage) — Initiates API to check content against enumerated categories.
 * 2. Response parsing (wasFiltered, parseFilterResults, evaluate) — Parses content_filter_results from chat responses.
 *
 * @module safety
 */

import type { HTTP } from './http.js';
import { ENDPOINTS } from './endpoints.js';
import type { SafetyCategory } from './types/inference.types.js';
import {
  SafetyTemplates,
  type ChatCompletion,
  type ChatCompletionChoice,
  type SafetyCheckOptions,
  type SafetyCheckResult,
  type SafetyEvaluationResult,
  type SafetyFilterSummary,
  type SafetyFilterCategoryResult,
  type SafetyTemplateConfig,
  type SafetyCheckableInput,
  type EvaluateInput,
} from './types/inference.types.js';

const DEFAULT_SAFETY_MODEL = 'deepbrain-router';

/** Min completion tokens — some APIs reject `max_tokens: 1` as invalid. */
const SAFETY_MAX_TOKENS = 16;

/** Heuristic: string looks like a URL (image or other). */
function isUrl(s: string): boolean {
  const trimmed = s.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/** Only `{ url: string }` — avoids treating objects that happen to include `url` with other fields as image-only. */
function isPlainImageUrlObject(input: object): input is { url: string } {
  const keys = Object.keys(input);
  return (
    keys.length === 1 && keys[0] === 'url' && typeof (input as { url?: string }).url === 'string'
  );
}

/**
 * Safety resource. Proactive checks and response parsing.
 * Access via client.safety.
 */
export class Safety {
  constructor(private http: HTTP) {}

  /**
   * Proactive: Check text against enumerated categories (sexual, violence, hate, etc.).
   * Initiates API call via chat completions. Returns which categories triggered.
   *
   * @param text - Text to check
   * @param options - Optional; `template?.id` is copied to `result.template` only. `categories` is unused. `passed` reflects API `content_filter_results`.
   * @returns SafetyCheckResult with passed, failedCategories, contentFilterResults
   *
   * @example
   * ```ts
   * const result = await client.safety.checkText('user input', {
   *   categories: [SafetyCategory.VIOLENCE, SafetyCategory.SEXUAL],
   * });
   * if (!result.passed) console.warn(result.failedCategories);
   * ```
   */
  async checkText(text: string, options?: SafetyCheckOptions): Promise<SafetyCheckResult> {
    const completion = await this.http.request<ChatCompletion>('POST', ENDPOINTS.CHAT_COMPLETIONS, {
      model: DEFAULT_SAFETY_MODEL,
      messages: [{ role: 'user', content: text }],
      max_tokens: SAFETY_MAX_TOKENS,
    });

    return this._resultFromCompletion(completion, options?.template);
  }

  /**
   * Proactive: Check image against enumerated categories.
   * Initiates API call via chat completions with image content.
   *
   * @param image - Image URL or { url: string }
   * @param options - Same as {@link Safety.checkText} (`template` labels result; `categories` unused).
   * @returns SafetyCheckResult
   *
   * @example
   * ```ts
   * const result = await client.safety.checkImage({ url: 'https://...' });
   * ```
   */
  async checkImage(
    image: string | { url: string },
    options?: SafetyCheckOptions,
  ): Promise<SafetyCheckResult> {
    const imageUrl = typeof image === 'string' ? image : image.url;
    const completion = await this.http.request<ChatCompletion>('POST', ENDPOINTS.CHAT_COMPLETIONS, {
      model: DEFAULT_SAFETY_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: SAFETY_MAX_TOKENS,
    });

    return this._resultFromCompletion(completion, options?.template);
  }

  private _resultFromCompletion(
    completion: ChatCompletion,
    template?: SafetyTemplateConfig,
  ): SafetyCheckResult {
    const choices = completion?.choices ?? [];
    const choice = choices[0];
    const summary = this.parseFilterResults(completion);
    const failedCategories = this._getFilteredCategoriesFromSummary(summary);
    const templateId = template?.id ?? 'default';
    const passed = failedCategories.length === 0;

    return {
      passed,
      failedCategories,
      template: templateId,
      contentFilterResults: choice?.content_filter_results,
    };
  }

  private _normalizeInput(input: SafetyCheckableInput): {
    choices: ChatCompletionChoice[];
    completion?: ChatCompletion;
  } {
    if (Array.isArray(input)) {
      return { choices: input };
    }
    if (!input || typeof input !== 'object') {
      return { choices: [] };
    }
    if ('choices' in input && Array.isArray(input.choices)) {
      const comp = input as
        | ChatCompletion
        | { choices: ChatCompletionChoice[]; prompt_filter_results?: unknown[] };
      return {
        choices: comp.choices,
        completion: 'prompt_filter_results' in comp ? (comp as ChatCompletion) : undefined,
      };
    }
    if ('content_filter_results' in input && input.content_filter_results) {
      const synthetic: ChatCompletionChoice = {
        index: 0,
        message: { role: 'assistant', content: null },
        finish_reason: null,
        content_filter_results: input.content_filter_results,
      };
      return { choices: [synthetic] };
    }
    return { choices: [input as ChatCompletionChoice] };
  }

  /**
   * Returns true if any content was filtered in the choice(s) or prompt.
   * Parses content_filter_results from chat response. No API call.
   *
   * @param input - Single choice, array of choices, or full ChatCompletion
   */
  wasFiltered(input: SafetyCheckableInput): boolean {
    const summary = this.parseFilterResults(input);
    return summary.anyFiltered;
  }

  /**
   * Returns array of category names that were filtered.
   * Parses from chat response. No API call.
   *
   * @param input - Single choice, array of choices, or full ChatCompletion
   */
  getFilteredCategories(input: SafetyCheckableInput): string[] {
    const summary = this.parseFilterResults(input);
    return this._getFilteredCategoriesFromSummary(summary);
  }

  /**
   * Parses content_filter_results into a structured summary.
   * Works on existing completion. No API call.
   * Aggregates across all choices when given array or full completion.
   *
   * @param input - Single choice, array of choices, or full ChatCompletion
   */
  parseFilterResults(input: SafetyCheckableInput): SafetyFilterSummary {
    const { choices, completion } = this._normalizeInput(input);

    const choiceMaps: Partial<Record<SafetyCategory, SafetyFilterCategoryResult>>[] = [];
    for (const choice of choices) {
      const choiceResults = choice?.content_filter_results ?? {};
      choiceMaps.push(this._parseFilterObject(choiceResults as Record<string, unknown>));
    }
    const choiceMap = this._mergeFilterMaps(choiceMaps);

    let promptResults: SafetyFilterSummary['prompt'] = undefined;
    if (completion?.prompt_filter_results?.length) {
      promptResults = completion.prompt_filter_results.map((p) => ({
        prompt_index: p.prompt_index,
        results: this._parseFilterObject(
          (p.content_filter_results ?? {}) as unknown as Record<string, unknown>,
        ),
      }));
    }

    const anyFiltered =
      Object.values(choiceMap).some((r) => r.filtered) ||
      (promptResults?.some((p) => Object.values(p.results).some((r) => r.filtered)) ?? false);

    return {
      choice: choiceMap,
      prompt: promptResults,
      anyFiltered,
    };
  }

  private _mergeFilterMaps(
    maps: Partial<Record<SafetyCategory, SafetyFilterCategoryResult>>[],
  ): Partial<Record<SafetyCategory, SafetyFilterCategoryResult>> {
    const merged: Partial<Record<SafetyCategory, SafetyFilterCategoryResult>> = {};
    for (const map of maps) {
      for (const [key, res] of Object.entries(map)) {
        if (res && (!merged[key as SafetyCategory] || res.filtered)) {
          merged[key as SafetyCategory] = res;
        }
      }
    }
    return merged;
  }

  private _parseFilterObject(
    obj: Record<string, unknown>,
  ): Partial<Record<SafetyCategory, SafetyFilterCategoryResult>> {
    const result: Partial<Record<SafetyCategory, SafetyFilterCategoryResult>> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val && typeof val === 'object' && 'filtered' in val) {
        const v = val as { filtered?: boolean; severity?: string; detected?: boolean };
        result[key as SafetyCategory] = {
          filtered: v.filtered ?? false,
          severity: v.severity,
          detected: v.detected,
        };
      }
    }
    return result;
  }

  private _getFilteredCategoriesFromSummary(summary: SafetyFilterSummary): string[] {
    const categories: string[] = [];
    for (const [cat, res] of Object.entries(summary.choice)) {
      if (res?.filtered) {
        categories.push(cat);
      }
    }
    for (const p of summary.prompt ?? []) {
      for (const [cat, res] of Object.entries(p.results)) {
        if (res?.filtered && !categories.includes(cat)) {
          categories.push(cat);
        }
      }
    }
    return categories;
  }

  /**
   * Evaluate content against a safety template.
   * Accepts pre-parsed results, text, image URLs, or arrays of any.
   * Text and image URLs trigger an API call; others are parsed locally.
   *
   * @param input - Choice(s), completion, prediction result(s), text, image URL, or array of any
   * @param template - Safety template (STRICT, MODERATE, CHILD_SAFE, etc.)
   */
  async evaluate(
    input: EvaluateInput,
    template?: SafetyTemplateConfig,
  ): Promise<SafetyEvaluationResult> {
    const t = template ?? SafetyTemplates.STRICT;
    const checkables = await this._resolveEvaluateInput(input);
    const mergedSummary = this._mergeSummaries(checkables.map((c) => this.parseFilterResults(c)));
    const failedCategories = this._evaluateTemplate(mergedSummary, t);

    return {
      passed: failedCategories.length === 0,
      failedCategories,
      template: t.id,
      details: mergedSummary,
    };
  }

  private async _resolveEvaluateInput(input: EvaluateInput): Promise<SafetyCheckableInput[]> {
    if (Array.isArray(input)) {
      const resolved = await Promise.all(input.map((item) => this._resolveEvaluateInput(item)));
      return resolved.flat();
    }
    if (typeof input === 'string') {
      const synthetic: ChatCompletionChoice = {
        index: 0,
        message: { role: 'assistant', content: null },
        finish_reason: null,
        content_filter_results: isUrl(input)
          ? (await this.checkImage(input)).contentFilterResults
          : (await this.checkText(input)).contentFilterResults,
      };
      return [synthetic];
    }
    if (input && typeof input === 'object' && isPlainImageUrlObject(input)) {
      const result = await this.checkImage(input);
      const synthetic: ChatCompletionChoice = {
        index: 0,
        message: { role: 'assistant', content: null },
        finish_reason: null,
        content_filter_results: result.contentFilterResults,
      };
      return [synthetic];
    }
    return [input as SafetyCheckableInput];
  }

  private _mergeSummaries(summaries: SafetyFilterSummary[]): SafetyFilterSummary {
    const choiceMaps = summaries.map((s) => s.choice);
    const mergedChoice = this._mergeFilterMaps(choiceMaps);
    const allPrompt = summaries.flatMap((s) => s.prompt ?? []);
    const anyFiltered =
      Object.values(mergedChoice).some((r) => r.filtered) ||
      allPrompt.some((p) => Object.values(p.results).some((r) => r.filtered));

    return {
      choice: mergedChoice,
      prompt: allPrompt.length > 0 ? allPrompt : undefined,
      anyFiltered,
    };
  }

  private _evaluateTemplate(
    summary: SafetyFilterSummary,
    template: SafetyTemplateConfig,
  ): string[] {
    const severityOrder: Record<string, number> = {
      safe: 0,
      low: 1,
      medium: 2,
      high: 3,
    };
    const threshold = severityOrder[template.severityThreshold as string] ?? 0;
    const failed: string[] = [];

    const check = (cat: string, res: SafetyFilterCategoryResult | undefined) => {
      if (!res) {
        return;
      }
      if (res.filtered) {
        failed.push(cat);
        return;
      }
      const sev = severityOrder[res.severity as string] ?? 0;
      if (template.failOnFiltered && sev >= threshold && sev > 0) {
        failed.push(cat);
      }
    };

    const categories =
      template.categories === 'all'
        ? Object.keys(summary.choice)
        : ((template.categories as string[]) ?? Object.keys(summary.choice));

    for (const cat of categories) {
      const res = summary.choice[cat as SafetyCategory];
      check(cat, res);
    }
    for (const p of summary.prompt ?? []) {
      for (const cat of categories) {
        const res = p.results[cat as SafetyCategory];
        check(cat, res);
      }
    }

    return [...new Set(failed)];
  }
}
