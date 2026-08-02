/**
 * AI OS v2 non-production integration harness.
 *
 * Orchestrates existing deterministic layers end-to-end without network,
 * provider transport, images, secrets, or production wiring.
 */

import { createHash } from "node:crypto";

import {
  BODY_PROFILE_SCHEMA_VERSION,
  type BodyProfile,
} from "../BodyProfile";
import {
  TRANSFORMATION_GOAL_SCHEMA_VERSION,
  type TransformationGoal,
} from "../TransformationGoal";
import {
  TRANSFORMATION_PLAN_SCHEMA_VERSION,
  TRANSFORM_RULES_VERSION,
  type TransformationPlan,
} from "../TransformationPlan";
import { TransformationEngine } from "../TransformationEngine";
import {
  VISUAL_DIRECTOR_RULES_VERSION,
  directVisual,
  type VisualDirection,
} from "../visual";
import {
  RENDER_PLAN_RULES_VERSION,
  RENDER_PLAN_SCHEMA_VERSION,
  buildRenderPlan,
  validateRenderPlan,
  type RenderPlan,
} from "../render";
import {
  FLUX_FORMATTER_VERSION,
  FluxFormatter,
  validateFormattedImageRequest,
  type FormattedImageRequest,
} from "../formatters";
import {
  validateBodyProfile,
  validateTransformationGoal,
} from "../validation";

export interface AiOsV2HarnessInput {
  profile: unknown;
  goal: unknown;

  formatterOptions?: {
    aspectRatio?: string;
    seed?: number;
    quality?: "standard" | "high";
    styleOverride?:
      | "source_faithful"
      | "natural_athletic"
      | "documentary_fitness";
  };
}

export type HarnessStage =
  | "input_validation"
  | "transformation_plan"
  | "visual_direction"
  | "render_plan"
  | "render_plan_validation"
  | "provider_formatting"
  | "formatted_request_validation"
  | "completed";

export interface HarnessStageResult {
  stage: HarnessStage;
  success: boolean;
  durationMs: number;
  warnings: string[];
  errors: string[];
}

export interface AiOsV2HarnessReport {
  success: boolean;

  traceId: string;

  stages: HarnessStageResult[];

  versions: {
    bodyProfileSchemaVersion?: number;
    transformationGoalSchemaVersion?: number;
    transformationPlanSchemaVersion?: number;
    transformationRulesVersion?: string;
    visualDirectionRulesVersion?: string;
    renderPlanSchemaVersion?: number;
    renderPlanRulesVersion?: string;
    formatterName?: string;
    formatterVersion?: string;
  };

  summary: {
    effectiveTimelineWeeks?: number;
    visualIntensity?: string;
    changeVisibility?: string;
    approvedChangeCount?: number;
    approvedChangeIds?: string[];
    formatterWarningCodes?: string[];
    estimateReliability?: string;
  };

  artifacts?: {
    transformationPlan?: TransformationPlan;
    visualDirection?: VisualDirection;
    renderPlan?: RenderPlan;
    formattedRequest?: FormattedImageRequest;
  };

  errors: string[];
  warnings: string[];
}

const FORBIDDEN_SENSITIVE_PATTERNS: RegExp[] = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /\bat\s+\S+\s+\([^)]+\.\w+:\d+:\d+\)/i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/,
];

function nowMs(): number {
  return Date.now();
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(nowMs() - startedAt));
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.replace(/\s+/g, " ").trim();
    return message.slice(0, 200) || "unknown error";
  }
  return "unknown error";
}

/**
 * Deterministic non-sensitive trace ID from safe structural inputs only.
 * Uses Node crypto hash — for test / dry-run traceability, not security.
 */
export function buildHarnessTraceId(
  profile: unknown,
  goal: unknown
): string {
  const p =
    profile !== null && typeof profile === "object" && !Array.isArray(profile)
      ? (profile as Record<string, unknown>)
      : {};
  const g =
    goal !== null && typeof goal === "object" && !Array.isArray(goal)
      ? (goal as Record<string, unknown>)
      : {};

  const focusZones = Array.isArray(g.focusZones)
    ? [...g.focusZones].map(String).sort().join(",")
    : "";

  const payload = [
    `bpsv:${String(p.schemaVersion ?? "")}`,
    `gsv:${String(g.schemaVersion ?? "")}`,
    `tw:${String(g.timelineWeeks ?? "")}`,
    `fz:${focusZones}`,
    `fd:${String(g.fatDirection ?? "")}`,
    `md:${String(g.muscleDirection ?? "")}`,
    `tr:${TRANSFORM_RULES_VERSION}`,
    `vr:${VISUAL_DIRECTOR_RULES_VERSION}`,
    `rr:${RENDER_PLAN_RULES_VERSION}`,
    `rs:${RENDER_PLAN_SCHEMA_VERSION}`,
    `fv:${FLUX_FORMATTER_VERSION}`,
  ].join("|");

  const digest = createHash("sha256").update(payload).digest("hex").slice(0, 12);
  return `aiosv2-${digest}`;
}

const REDACTED_FORBIDDEN_CONTENT = "[REDACTED_FORBIDDEN_CONTENT]";

const FORBIDDEN_CONTENT_ERROR =
  "Harness report contained forbidden sensitive or transport content.";

function stringMatchesForbidden(text: string): boolean {
  for (const pattern of FORBIDDEN_SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function containsForbiddenContent(value: unknown): boolean {
  if (typeof value === "string") {
    return stringMatchesForbidden(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenContent(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((nested) =>
      containsForbiddenContent(nested)
    );
  }
  return false;
}

/**
 * Recursively replace string values that match forbidden patterns.
 * Mutates only the provided clone; preserves safe structure and non-string values.
 */
function redactForbiddenStrings(value: unknown): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === "string") {
        if (stringMatchesForbidden(item)) {
          value[i] = REDACTED_FORBIDDEN_CONTENT;
        }
      } else {
        redactForbiddenStrings(item);
      }
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const nested = record[key];
      if (typeof nested === "string") {
        if (stringMatchesForbidden(nested)) {
          record[key] = REDACTED_FORBIDDEN_CONTENT;
        }
      } else {
        redactForbiddenStrings(nested);
      }
    }
  }
}

/**
 * Ensures harness reports never carry images, URLs, tokens, or Base64-like blobs.
 * Forbidden string values are redacted; the report is marked failed with an explicit error.
 * Does not silently mark an unsafe report as successful. Does not mutate the input.
 * Deterministic and idempotent: sanitize(sanitize(report)) deep-equals sanitize(report).
 */
export function sanitizeHarnessReport(
  report: AiOsV2HarnessReport
): AiOsV2HarnessReport {
  const clone = structuredClone(report) as AiOsV2HarnessReport;
  if (!containsForbiddenContent(clone)) {
    return clone;
  }

  redactForbiddenStrings(clone);
  clone.success = false;
  if (!clone.errors.includes(FORBIDDEN_CONTENT_ERROR)) {
    clone.errors = [...clone.errors, FORBIDDEN_CONTENT_ERROR];
  }
  return clone;
}

function pushStage(
  stages: HarnessStageResult[],
  stage: HarnessStage,
  success: boolean,
  startedAt: number,
  warnings: string[],
  errors: string[]
): void {
  stages.push({
    stage,
    success,
    durationMs: elapsedMs(startedAt),
    warnings: [...warnings],
    errors: [...errors],
  });
}

/**
 * Dry-run the AI OS v2 pipeline. No network, images, or provider generate calls.
 */
export function runAiOsV2Harness(
  input: AiOsV2HarnessInput
): AiOsV2HarnessReport {
  const stages: HarnessStageResult[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const versions: AiOsV2HarnessReport["versions"] = {};
  const summary: AiOsV2HarnessReport["summary"] = {};
  let artifacts: AiOsV2HarnessReport["artifacts"] | undefined;

  const traceId = buildHarnessTraceId(input.profile, input.goal);

  const finish = (success: boolean): AiOsV2HarnessReport =>
    sanitizeHarnessReport({
      success,
      traceId,
      stages,
      versions,
      summary,
      artifacts,
      errors: [...errors],
      warnings: [...warnings],
    });

  try {
    // 1–3. Input validation (early stop on failure)
    const validationStarted = nowMs();
    const profileResult = validateBodyProfile(input.profile);
    const goalResult = validateTransformationGoal(input.goal);
    const validationWarnings = [
      ...profileResult.warnings,
      ...goalResult.warnings,
    ];
    warnings.push(...validationWarnings);

    if (!profileResult.ok || !goalResult.ok) {
      const validationErrors = [
        ...(profileResult.ok ? [] : profileResult.errors),
        ...(goalResult.ok ? [] : goalResult.errors),
      ];
      errors.push(...validationErrors);
      pushStage(
        stages,
        "input_validation",
        false,
        validationStarted,
        validationWarnings,
        validationErrors
      );
      return finish(false);
    }

    pushStage(
      stages,
      "input_validation",
      true,
      validationStarted,
      validationWarnings,
      []
    );

    const profile: BodyProfile = profileResult.value;
    const goal: TransformationGoal = goalResult.value;
    versions.bodyProfileSchemaVersion =
      profile.schemaVersion ?? BODY_PROFILE_SCHEMA_VERSION;
    versions.transformationGoalSchemaVersion =
      goal.schemaVersion ?? TRANSFORMATION_GOAL_SCHEMA_VERSION;

    // 5. TransformationEngine
    const planStarted = nowMs();
    const engine = new TransformationEngine();
    const plan = engine.compute(profile, goal);
    warnings.push(...plan.warnings);
    versions.transformationPlanSchemaVersion =
      plan.schemaVersion ?? TRANSFORMATION_PLAN_SCHEMA_VERSION;
    versions.transformationRulesVersion = plan.rulesVersion;
    summary.effectiveTimelineWeeks = plan.effectiveTimelineWeeks;
    summary.visualIntensity = plan.visualIntensity;
    summary.estimateReliability = plan.estimateReliability;
    artifacts = { ...(artifacts ?? {}), transformationPlan: plan };
    pushStage(stages, "transformation_plan", true, planStarted, plan.warnings, []);

    // 6. VisualDirector
    const visualStarted = nowMs();
    const direction = directVisual(profile, goal, plan);
    versions.visualDirectionRulesVersion =
      direction.metadata.rulesVersion ?? VISUAL_DIRECTOR_RULES_VERSION;
    summary.changeVisibility = direction.changeVisibility;
    artifacts = { ...(artifacts ?? {}), visualDirection: direction };
    pushStage(stages, "visual_direction", true, visualStarted, [], []);

    // 7. RenderPlanBuilder
    const renderStarted = nowMs();
    const renderPlan = buildRenderPlan(plan, direction);
    versions.renderPlanSchemaVersion = renderPlan.schemaVersion;
    versions.renderPlanRulesVersion = renderPlan.rulesVersion;
    summary.approvedChangeCount =
      renderPlan.transformation.approvedChanges.length;
    summary.approvedChangeIds = renderPlan.transformation.approvedChanges.map(
      (c) => c.id
    );
    artifacts = { ...(artifacts ?? {}), renderPlan };
    pushStage(stages, "render_plan", true, renderStarted, [], []);

    // 8–9. validateRenderPlan (early stop before formatting on failure)
    const renderValidationStarted = nowMs();
    const renderValidation = validateRenderPlan(renderPlan);
    warnings.push(...renderValidation.warnings);
    if (!renderValidation.valid) {
      errors.push(...renderValidation.errors);
      pushStage(
        stages,
        "render_plan_validation",
        false,
        renderValidationStarted,
        renderValidation.warnings,
        renderValidation.errors
      );
      return finish(false);
    }
    pushStage(
      stages,
      "render_plan_validation",
      true,
      renderValidationStarted,
      renderValidation.warnings,
      []
    );

    // 10. FluxFormatter
    const formatStarted = nowMs();
    const formatter = new FluxFormatter();
    const formatted = formatter.format(renderPlan, input.formatterOptions);
    const formatterWarningMessages = formatted.warnings.map(
      (w) => `${w.code}: ${w.message}`
    );
    warnings.push(...formatterWarningMessages);
    versions.formatterName = formatted.metadata.formatterName;
    versions.formatterVersion = formatted.metadata.formatterVersion;
    summary.formatterWarningCodes = formatted.warnings.map((w) => w.code);
    artifacts = { ...(artifacts ?? {}), formattedRequest: formatted };
    pushStage(
      stages,
      "provider_formatting",
      true,
      formatStarted,
      formatterWarningMessages,
      []
    );

    // 11. validateFormattedImageRequest
    const formattedValidationStarted = nowMs();
    const formattedValidation = validateFormattedImageRequest(formatted);
    warnings.push(...formattedValidation.warnings);
    if (!formattedValidation.valid) {
      errors.push(...formattedValidation.errors);
      pushStage(
        stages,
        "formatted_request_validation",
        false,
        formattedValidationStarted,
        formattedValidation.warnings,
        formattedValidation.errors
      );
      return finish(false);
    }
    pushStage(
      stages,
      "formatted_request_validation",
      true,
      formattedValidationStarted,
      formattedValidation.warnings,
      []
    );

    // 12. completed
    const completedStarted = nowMs();
    pushStage(stages, "completed", true, completedStarted, [], []);
    return finish(true);
  } catch (error) {
    const message = `Unexpected harness failure: ${sanitizeErrorMessage(error)}`;
    errors.push(message);
    if (stages.length === 0) {
      pushStage(stages, "input_validation", false, nowMs(), [], [message]);
    } else {
      const last = stages[stages.length - 1];
      if (last) {
        last.success = false;
        last.errors = [...last.errors, message];
      }
    }
    return finish(false);
  }
}
