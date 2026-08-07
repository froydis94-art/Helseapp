/**
 * Control Room developer projection + sanitizer.
 *
 * Projects AiOsRuntime dry_run results into a secret-safe inspection shape.
 * Prompts are intentionally visible; secrets, URLs, and identity remain forbidden.
 */

import type { AiOsRuntimeResult, AiOsRuntimeStage } from "../runtime/AiOsRuntimeTypes";
import type { FormattedImageRequest } from "../formatters/ProviderFormatter";
import type {
  FormatterInputInspectionView,
  FormatterPreviewView,
} from "../body-simulator/BodySimulatorFormatterAdapter";
import {
  buildBodySimulatorShadowPlaceholder,
  type ControlRoomBodySimulatorView,
} from "../shadow/BodySimulatorShadowIntegration";
import type {
  FormatterComparison,
  GenerationDiagnostics,
  PipelineSnapshot,
} from "./FormatterComparisonDiagnostics";
import {
  CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR,
  CONTROL_ROOM_RULES_VERSION,
  CONTROL_ROOM_SAFETY_STATUS,
  CONTROL_ROOM_SCHEMA_VERSION,
  type ControlRoomArtifactProjection,
  type ControlRoomRunResult,
  type ControlRoomScenarioSummary,
  type ControlRoomStageView,
} from "./ControlRoomTypes";

export interface ControlRoomProjectionBridge {
  formatterInput?: FormatterInputInspectionView | null;
  formatterPreview?: FormatterPreviewView | null;
  formatterComparison?: FormatterComparison | null;
  generationDiagnostics?: GenerationDiagnostics | null;
  pipelineSnapshot?: PipelineSnapshot | null;
}

const STAGE_LABELS: Record<AiOsRuntimeStage, string> = {
  input_validation: "Input validation",
  transformation: "Transformation",
  visual_direction: "Visual direction",
  render_plan: "Render plan",
  render_plan_validation: "Render plan validation",
  provider_formatting: "Provider formatting",
  formatted_request_validation: "Formatted request validation",
  transport: "Transport",
  awaiting_validation: "Awaiting validation",
  result_validation: "Result validation",
  retry_orchestration: "Retry orchestration",
  completed: "Completed",
};

const FORBIDDEN_STRING_PATTERNS: RegExp[] = [
  /data:image\//i,
  /https?:\/\//i,
  /\bAuthorization\b/i,
  /\bBearer\b/i,
  /REPLICATE_API_TOKEN/i,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\bat\s+\S+\s+\([^)]+\.\w+:\d+:\d+\)/i,
  /AI_OS_CONTROL_ROOM_ACCESS_KEY/i,
];

const FORBIDDEN_KEYS = new Set([
  "sourceimage",
  "imageurl",
  "transportresult",
  "validationevidence",
  "retrydecision",
  "retrystate",
  "healthpayload",
  "heartrate",
  "hrv",
  "sleepscore",
  "terrauserid",
  "wearable",
  "accesskey",
  "access_key",
  "authorization",
  "replicate_api_token",
  "apikey",
  "api_key",
]);

export class ControlRoomProjectionError extends Error {
  readonly code: "runtime_failure" | "unsafe_result";

  constructor(
    message: string,
    code: "runtime_failure" | "unsafe_result" = "runtime_failure"
  ) {
    super(message);
    this.name = "ControlRoomProjectionError";
    this.code = code;
  }
}

function stageLabel(stage: AiOsRuntimeStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

function projectStages(
  runtimeResult: AiOsRuntimeResult
): ControlRoomStageView[] {
  return runtimeResult.trace.stages.map((stage) => ({
    stage: stage.stage,
    label: stageLabel(stage.stage),
    success: stage.success,
    durationMs: Math.max(0, stage.durationMs),
    warningsCount: stage.warnings.length,
    errorsCount: stage.errors.length,
  }));
}

function projectVersions(
  runtimeResult: AiOsRuntimeResult
): Record<string, string | null> {
  const source = runtimeResult.trace.versions;
  const out: Record<string, string | null> = {
    runtimeRulesVersion: runtimeResult.trace.rulesVersion ?? null,
    transformationRulesVersion: source.transformationRulesVersion ?? null,
    visualDirectionRulesVersion: source.visualDirectionRulesVersion ?? null,
    renderPlanRulesVersion: source.renderPlanRulesVersion ?? null,
    formatterName: source.formatterName ?? null,
    formatterVersion: source.formatterVersion ?? null,
    transportAdapterId: source.transportAdapterId ?? null,
    resultValidatorRulesVersion: source.resultValidatorRulesVersion ?? null,
    retryOrchestratorRulesVersion: source.retryOrchestratorRulesVersion ?? null,
  };
  return out;
}

function projectFormattedRequest(
  formatted: FormattedImageRequest
): ControlRoomArtifactProjection["formattedRequest"] {
  const projected: ControlRoomArtifactProjection["formattedRequest"] = {
    formatterName: formatted.metadata.formatterName,
    formatterVersion: formatted.metadata.formatterVersion,
    providerFamily: formatted.providerFamily,
    sourceOperation: formatted.sourceOperation,
    positivePrompt: formatted.prompt,
    negativePrompt: formatted.negativePrompt ?? "",
  };
  if (formatted.aspectRatio !== undefined) {
    projected.aspectRatio = formatted.aspectRatio;
  }
  if (formatted.seed !== undefined) {
    projected.seed = formatted.seed;
  }
  return projected;
}

/**
 * Project a successful dry_run AiOsRuntimeResult into Control Room view model.
 * Preserves plans and prompts without rewriting them.
 *
 * Trailing bridge args remain optional for older tests. Prefer the bridge
 * object form when supplying 022B-A diagnostics.
 */
export function projectControlRoomResult(
  scenario: ControlRoomScenarioSummary,
  runtimeResult: AiOsRuntimeResult,
  bodySimulator?: ControlRoomBodySimulatorView,
  formatterInputOrBridge?:
    | FormatterInputInspectionView
    | ControlRoomProjectionBridge
    | null,
  formatterPreview?: FormatterPreviewView | null,
  formatterComparison?: FormatterComparison | null,
  generationDiagnostics?: GenerationDiagnostics | null,
  pipelineSnapshot?: PipelineSnapshot | null
): ControlRoomRunResult {
  const looksLikeInspectionView =
    formatterInputOrBridge != null &&
    typeof formatterInputOrBridge === "object" &&
    "receivedCanonicalRules" in formatterInputOrBridge;
  const looksLikeBridge =
    formatterInputOrBridge != null &&
    typeof formatterInputOrBridge === "object" &&
    !looksLikeInspectionView &&
    ("formatterComparison" in formatterInputOrBridge ||
      "generationDiagnostics" in formatterInputOrBridge ||
      "pipelineSnapshot" in formatterInputOrBridge ||
      "formatterInput" in formatterInputOrBridge ||
      "formatterPreview" in formatterInputOrBridge);

  const bridge: ControlRoomProjectionBridge = looksLikeBridge
    ? (formatterInputOrBridge as ControlRoomProjectionBridge)
    : {
        formatterInput: looksLikeInspectionView
          ? (formatterInputOrBridge as FormatterInputInspectionView)
          : null,
        formatterPreview: formatterPreview ?? null,
        formatterComparison: formatterComparison ?? null,
        generationDiagnostics: generationDiagnostics ?? null,
        pipelineSnapshot: pipelineSnapshot ?? null,
      };

  const formatterInput = bridge.formatterInput ?? null;
  const resolvedFormatterPreview = bridge.formatterPreview ?? null;
  const resolvedComparison = bridge.formatterComparison ?? null;
  const resolvedDiagnostics = bridge.generationDiagnostics ?? null;
  const resolvedSnapshot = bridge.pipelineSnapshot ?? null;
  if (runtimeResult.mode !== "dry_run") {
    throw new ControlRoomProjectionError(
      "Control Room requires dry_run runtime mode."
    );
  }
  if (runtimeResult.terminalOutcome !== "dry_run_complete") {
    throw new ControlRoomProjectionError(
      "Control Room requires dry_run_complete terminal outcome."
    );
  }
  if (runtimeResult.artifacts.transportResult !== undefined) {
    throw new ControlRoomProjectionError(
      "Control Room rejects transport results.",
      "unsafe_result"
    );
  }
  if (runtimeResult.artifacts.validationDecision !== undefined) {
    throw new ControlRoomProjectionError(
      "Control Room rejects validation decisions.",
      "unsafe_result"
    );
  }
  if (runtimeResult.artifacts.retryDecision !== undefined) {
    throw new ControlRoomProjectionError(
      "Control Room rejects retry decisions.",
      "unsafe_result"
    );
  }

  const { transformationPlan, visualDirection, renderPlan, formattedRequest } =
    runtimeResult.artifacts;

  if (
    transformationPlan === undefined ||
    visualDirection === undefined ||
    renderPlan === undefined ||
    formattedRequest === undefined
  ) {
    throw new ControlRoomProjectionError(
      "Control Room requires complete dry-run artifacts."
    );
  }

  return {
    schemaVersion: CONTROL_ROOM_SCHEMA_VERSION,
    rulesVersion: CONTROL_ROOM_RULES_VERSION,
    success: true,
    scenario: structuredClone(scenario),
    runtime: {
      mode: "dry_run",
      terminalOutcome: "dry_run_complete",
      traceId: runtimeResult.trace.traceId,
      stages: projectStages(runtimeResult),
      versions: projectVersions(runtimeResult),
    },
    artifacts: {
      transformationPlan: structuredClone(transformationPlan),
      visualDirection: structuredClone(visualDirection),
      renderPlan: structuredClone(renderPlan),
      formattedRequest: projectFormattedRequest(
        structuredClone(formattedRequest)
      ),
    },
    safety: { ...CONTROL_ROOM_SAFETY_STATUS },
    bodySimulator: structuredClone(
      bodySimulator ?? buildBodySimulatorShadowPlaceholder()
    ),
    formatterInput:
      formatterInput == null ? null : structuredClone(formatterInput),
    formatterPreview:
      resolvedFormatterPreview == null
        ? null
        : structuredClone(resolvedFormatterPreview),
    formatterComparison:
      resolvedComparison == null
        ? null
        : structuredClone(resolvedComparison),
    generationDiagnostics:
      resolvedDiagnostics == null
        ? null
        : structuredClone(resolvedDiagnostics),
    pipelineSnapshot:
      resolvedSnapshot == null ? null : structuredClone(resolvedSnapshot),
    warnings: [...runtimeResult.warnings],
    errors: [...runtimeResult.errors],
  };
}

function keyLooksForbidden(key: string): boolean {
  // Exact normalized key match only — do not substring-match safety
  // booleans such as sourceImageAccepted / imageGenerated.
  const normalized = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return FORBIDDEN_KEYS.has(normalized);
}

function stringLooksForbidden(text: string): boolean {
  for (const pattern of FORBIDDEN_STRING_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function collectProjectionErrors(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (typeof value === "string") {
    if (stringLooksForbidden(value)) {
      errors.push(`Forbidden content at ${path || "root"}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectProjectionErrors(item, `${path}[${index}]`, errors);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (keyLooksForbidden(key)) {
        errors.push(`Forbidden key at ${path ? `${path}.${key}` : key}.`);
      }
      collectProjectionErrors(
        nested,
        path ? `${path}.${key}` : key,
        errors
      );
    }
  }
}

/** Validate a Control Room projection for forbidden secrets / keys / URLs. */
export function validateControlRoomProjection(value: ControlRoomRunResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  collectProjectionErrors(value, "", errors);
  return { valid: errors.length === 0, errors };
}

function safeStages(stages: ControlRoomStageView[]): ControlRoomStageView[] {
  return stages.map((stage) => ({
    stage: stage.stage,
    label: stageLabel(stage.stage),
    success: Boolean(stage.success),
    durationMs: Math.max(0, Number(stage.durationMs) || 0),
    warningsCount: Math.max(0, Number(stage.warningsCount) || 0),
    errorsCount: Math.max(0, Number(stage.errorsCount) || 0),
  }));
}

/**
 * Deep-clone and invalidate projections that contain forbidden content.
 * Never returns the forbidden original artifact payload.
 */
export function sanitizeControlRoomProjection(
  value: ControlRoomRunResult
): ControlRoomRunResult {
  const clone = structuredClone(value) as ControlRoomRunResult;
  const validation = validateControlRoomProjection(clone);
  if (validation.valid) {
    return clone;
  }

  const safeStageViews = Array.isArray(clone.runtime?.stages)
    ? safeStages(clone.runtime.stages)
    : [];

  return {
    schemaVersion: CONTROL_ROOM_SCHEMA_VERSION,
    rulesVersion: CONTROL_ROOM_RULES_VERSION,
    success: false,
    scenario: structuredClone(clone.scenario),
    runtime: {
      mode: "dry_run",
      terminalOutcome: "dry_run_complete",
      traceId:
        typeof clone.runtime?.traceId === "string" &&
        !stringLooksForbidden(clone.runtime.traceId)
          ? clone.runtime.traceId
          : "redacted-trace",
      stages: safeStageViews,
      versions: {},
    },
    artifacts: null,
    safety: { ...CONTROL_ROOM_SAFETY_STATUS },
    bodySimulator: buildBodySimulatorShadowPlaceholder(),
    formatterInput: null,
    formatterPreview: null,
    formatterComparison: null,
    generationDiagnostics: null,
    pipelineSnapshot: null,
    warnings: [],
    errors: [CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR],
  };
}
