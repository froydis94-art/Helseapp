/**
 * Prompt Isolation Lab (Demand 018A) — allowlisted diagnostic prompt variants.
 *
 * Browser may select only these named variants. No arbitrary prompt text.
 * Never used by production generation. Minimal may bypass structured formatter
 * sections (narrow documented exception).
 */

import type { FormatterOptions } from "../formatters/ProviderFormatter";

export type PromptIsolationVariant =
  | "minimal"
  | "current_ai_os"
  | "current_without_preview_context"
  | "pre_017c_baseline";

export const PROMPT_ISOLATION_VARIANTS = [
  "minimal",
  "current_ai_os",
  "current_without_preview_context",
  "pre_017c_baseline",
] as const satisfies readonly PromptIsolationVariant[];

export const DEFAULT_PROMPT_ISOLATION_VARIANT =
  "current_ai_os" as const satisfies PromptIsolationVariant;

/**
 * Parent of PATCH 017C commit a66ad34 — exact pre-017C formatter preview-context
 * wording was taken from FluxFormatter.ts at this revision (git show).
 */
export const PRE_017C_BASELINE_SOURCE_COMMIT =
  "10f07b4d12a9e40ed5b878830dbf0f9639fd1d2e" as const;

export type PromptIsolationPromptSource =
  | "minimal_diagnostic_formatter_bypass"
  | "flux_formatter_current_preview_context"
  | "flux_formatter_without_preview_context"
  | "flux_formatter_pre_017c_baseline";

export type PromptIsolationRadioLabel = "A" | "B" | "C" | "D";

export interface PromptIsolationSummary {
  variant: PromptIsolationVariant;
  radioLabel: PromptIsolationRadioLabel;
  promptSource: PromptIsolationPromptSource;
  formatterName: string | null;
  formatterVersion: string | null;
  model: string;
  requestId: string;
  sameProviderModelTransport: true;
  seedApplied: boolean;
  seed: number | null;
  /** Present only for pre_017c_baseline. */
  pre017cSourceCommit?: typeof PRE_017C_BASELINE_SOURCE_COMMIT;
  /** Present only for minimal — documents the narrow non-production exception. */
  diagnosticException?: "minimal_bypasses_structured_formatter";
}

const VARIANT_SET = new Set<string>(PROMPT_ISOLATION_VARIANTS);

export function isPromptIsolationVariant(
  value: unknown
): value is PromptIsolationVariant {
  return typeof value === "string" && VARIANT_SET.has(value);
}

export function resolvePromptIsolationVariant(
  value: unknown
): PromptIsolationVariant | null {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_PROMPT_ISOLATION_VARIANT;
  }
  if (!isPromptIsolationVariant(value)) return null;
  return value;
}

export function promptIsolationRadioLabel(
  variant: PromptIsolationVariant
): PromptIsolationRadioLabel {
  switch (variant) {
    case "minimal":
      return "A";
    case "current_ai_os":
      return "B";
    case "current_without_preview_context":
      return "C";
    case "pre_017c_baseline":
      return "D";
  }
}

export function promptIsolationPromptSource(
  variant: PromptIsolationVariant
): PromptIsolationPromptSource {
  switch (variant) {
    case "minimal":
      return "minimal_diagnostic_formatter_bypass";
    case "current_ai_os":
      return "flux_formatter_current_preview_context";
    case "current_without_preview_context":
      return "flux_formatter_without_preview_context";
    case "pre_017c_baseline":
      return "flux_formatter_pre_017c_baseline";
  }
}

/**
 * Concise diagnostic prompt — adapts timeline/goal from allowlisted scenario.
 * Must not contain pornography/sexual/underwear/adult/consent/moderation/safety
 * filter wording. Used only for variant "minimal".
 */
export function buildMinimalDiagnosticPrompt(input: {
  timelineWeeks: number;
  direction: string;
}): string {
  const weeks =
    typeof input.timelineWeeks === "number" &&
    Number.isFinite(input.timelineWeeks) &&
    input.timelineWeeks > 0
      ? Math.round(input.timelineWeeks)
      : 12;
  const goalPhrase = mapScenarioDirectionToGoalPhrase(input.direction);
  return `Generate a realistic ${weeks}-week ${goalPhrase} while preserving the same person, pose, clothing, framing and photographic identity.`;
}

function mapScenarioDirectionToGoalPhrase(direction: string): string {
  switch (direction) {
    case "recomposition":
      return "body recomposition";
    case "upper_body_definition":
      return "upper-body definition progress";
    case "fat_loss":
      return "fat-loss progress";
    case "strength":
    case "athletic_strength":
      return "athletic strength progress";
    default:
      return "body recomposition";
  }
}

/** Words forbidden in the minimal diagnostic prompt (hypothesis controls). */
export const MINIMAL_PROMPT_FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /pornograph/i,
  /sexual/i,
  /underwear/i,
  /\badult\b/i,
  /consent/i,
  /moderation/i,
  /safety\s*filter/i,
  /nsfw/i,
  /erotic/i,
  /nudity/i,
];

export function minimalPromptPassesIsolationGuards(prompt: string): boolean {
  for (const pattern of MINIMAL_PROMPT_FORBIDDEN_PATTERNS) {
    if (pattern.test(prompt)) return false;
  }
  return true;
}

/**
 * Map a lab variant onto formatter options. Does not alter aspect/seed/quality
 * from the scenario base. Only prompt-construction fields differ.
 */
export function applyPromptIsolationToFormatterOptions(
  variant: PromptIsolationVariant,
  baseOptions: FormatterOptions | undefined,
  minimalPrompt: string
): FormatterOptions {
  const next: FormatterOptions = { ...(baseOptions ?? {}) };

  delete next.previewSafetyContext;
  delete next.promptIsolationDiagnostic;
  delete next.promptIsolationMinimalPrompt;

  switch (variant) {
    case "minimal":
      next.promptIsolationDiagnostic = "minimal";
      next.promptIsolationMinimalPrompt = minimalPrompt;
      break;
    case "current_ai_os":
      next.previewSafetyContext = "non_sexual_fitness_visualization";
      break;
    case "current_without_preview_context":
      // Intentionally omit previewSafetyContext only.
      break;
    case "pre_017c_baseline":
      next.previewSafetyContext = "pre_017c_baseline";
      break;
  }

  return next;
}

export function buildPromptIsolationSummary(input: {
  variant: PromptIsolationVariant;
  formatterName: string | null;
  formatterVersion: string | null;
  model: string;
  requestId: string;
  seed: number | null | undefined;
}): PromptIsolationSummary {
  const seed =
    typeof input.seed === "number" &&
    Number.isFinite(input.seed) &&
    Number.isInteger(input.seed) &&
    input.seed >= 0
      ? input.seed
      : null;

  const summary: PromptIsolationSummary = {
    variant: input.variant,
    radioLabel: promptIsolationRadioLabel(input.variant),
    promptSource: promptIsolationPromptSource(input.variant),
    formatterName: input.formatterName,
    formatterVersion: input.formatterVersion,
    model: input.model,
    requestId: input.requestId,
    sameProviderModelTransport: true,
    seedApplied: seed != null,
    seed,
  };

  if (input.variant === "pre_017c_baseline") {
    summary.pre017cSourceCommit = PRE_017C_BASELINE_SOURCE_COMMIT;
  }
  if (input.variant === "minimal") {
    summary.diagnosticException = "minimal_bypasses_structured_formatter";
  }

  return summary;
}
