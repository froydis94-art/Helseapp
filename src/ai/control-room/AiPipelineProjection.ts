/**
 * AI Pipeline Inspector projection (Demand 018E — expanded).
 *
 * Deterministic, read-only projection from structured AI OS artifacts only.
 * Never parses prompt text to reconstruct rules. Never invents physiology.
 */

import {
  AI_PIPELINE_EVALUATION_PLACEHOLDER,
  AI_PIPELINE_INSPECTOR_ID,
  AI_PIPELINE_INSPECTOR_SCHEMA_VERSION,
  AI_PIPELINE_VERSION,
  type AiPipelineInspectorSnapshot,
  type AiPipelineRuleProvenanceEntry,
  type AiPipelineTransformationRules,
} from "./AiPipelineInspectorTypes";
import {
  computePromptMetrics,
  countPromptCharacters,
  countPromptWords,
} from "./PromptExperimentTypes";
import {
  projectTransformationRules,
  type TransformationRulesView,
} from "./TransformationRuleProjection";

export interface ProjectAiPipelineInspectorInput {
  experimentId: string;
  requestId?: string | null;
  scenarioId?: string | null;
  scenarioSummary?: string | null;
  goal?: unknown;
  profile?: unknown;
  transformationPlan?: unknown;
  visualDirection?: unknown;
  renderPlan?: unknown;
  formatterName?: string | null;
  formatterVersion?: string | null;
  formatterMode?: string | null;
  positivePrompt?: string;
  negativePrompt?: string;
  providerFamily?: string | null;
  model?: string | null;
  predictionId?: string | null;
  durationMs?: number | null;
  outcome?: string | null;
  success?: boolean;
  diagnostic?: string | null;
  validationDecision?: string | null;
  generatedImageAvailable?: boolean;
  /** Optional runtime version map from safe preview projection. */
  runtimeVersions?: Record<string, string | null> | null;
  aiOsVersion?: string | null;
  pipelineVersion?: string | null;
  validationVersion?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function provenance(
  rulePath: string,
  source: AiPipelineRuleProvenanceEntry["source"],
  sourcePath: string
): AiPipelineRuleProvenanceEntry {
  return { rulePath, source, sourcePath };
}

/**
 * Build deterministic rule provenance from which structured artifacts contributed.
 * sourcePath is a contract path — never a filesystem path.
 */
export function buildRuleProvenance(input: {
  planPresent: boolean;
  visualPresent: boolean;
  renderPresent: boolean;
  goalPresent: boolean;
  scenarioIdPresent: boolean;
}): AiPipelineRuleProvenanceEntry[] {
  const entries: AiPipelineRuleProvenanceEntry[] = [];
  if (input.renderPresent || input.visualPresent) {
    entries.push(
      provenance(
        "identity",
        input.renderPresent ? "render_plan" : "visual_direction",
        input.renderPresent ? "renderPlan.identity" : "visualDirection.preserve"
      )
    );
    entries.push(
      provenance(
        "pose",
        input.renderPresent ? "render_plan" : "visual_direction",
        input.renderPresent
          ? "renderPlan.scene.preservePose"
          : "visualDirection.preserve.pose"
      )
    );
    entries.push(
      provenance(
        "camera",
        input.renderPresent ? "render_plan" : "visual_direction",
        input.renderPresent
          ? "renderPlan.scene.preserveCameraPerspective"
          : "visualDirection.preserve.cameraPerspective"
      )
    );
    entries.push(
      provenance(
        "background",
        input.renderPresent ? "render_plan" : "visual_direction",
        input.renderPresent
          ? "renderPlan.scene.preserveBackground"
          : "visualDirection.preserve.background"
      )
    );
    entries.push(
      provenance(
        "lighting",
        input.renderPresent ? "render_plan" : "visual_direction",
        input.renderPresent
          ? "renderPlan.scene.preserveLighting"
          : "visualDirection.preserve.lighting"
      )
    );
    entries.push(
      provenance(
        "clothing",
        input.renderPresent ? "render_plan" : "visual_direction",
        input.renderPresent
          ? "renderPlan.scene.preserveClothing"
          : "visualDirection.preserve.clothing"
      )
    );
  }
  if (input.planPresent) {
    entries.push(
      provenance(
        "bodyComposition",
        "transformation_plan",
        "transformationPlan.estimatedFatLossKg"
      )
    );
    entries.push(
      provenance(
        "timeline",
        "transformation_plan",
        "transformationPlan.effectiveTimelineWeeks"
      )
    );
    entries.push(
      provenance(
        "bodyRegionEmphasis",
        "transformation_plan",
        "transformationPlan.regionalTargets"
      )
    );
  }
  if (input.renderPresent || input.planPresent) {
    entries.push(
      provenance(
        "priorityOrder",
        input.renderPresent ? "render_plan" : "transformation_plan",
        input.renderPresent
          ? "renderPlan.transformation.approvedChanges"
          : "transformationPlan.regionalTargets"
      )
    );
  }
  if (input.visualPresent || input.renderPresent) {
    entries.push(
      provenance(
        "realism",
        input.renderPresent ? "render_plan" : "visual_direction",
        input.renderPresent
          ? "renderPlan.realism"
          : "visualDirection.presentationStyle"
      )
    );
  }
  if (input.goalPresent) {
    entries.push(
      provenance("goal.timelineWeeks", "goal", "goal.timelineWeeks")
    );
  }
  if (input.scenarioIdPresent) {
    entries.push(provenance("scenarioId", "scenario", "scenario.id"));
  }
  // proportions have no dedicated structured field today — omit provenance
  return entries;
}

function mapRulesFromView(
  view: TransformationRulesView
): AiPipelineTransformationRules {
  const rules = view.rules;
  const priorityRaw = rules.priorityOrder;
  const priorityOrder = Array.isArray(priorityRaw) ? priorityRaw : [];
  return {
    identity: rules.identity ?? null,
    pose: rules.pose ?? null,
    camera: rules.camera ?? null,
    background: rules.background ?? null,
    lighting: rules.lighting ?? null,
    clothing: rules.clothing ?? null,
    bodyComposition: {
      bodyFatChange: rules.bodyFatChange ?? null,
      muscleChange: rules.muscleChange ?? null,
      weightGoal: rules.weightGoal ?? null,
    },
    bodyRegionEmphasis: rules.bodyRegionEmphasis ?? null,
    proportions: null,
    realism: rules.photographicRealism ?? null,
    timeline: rules.timeline ?? null,
    priorityOrder,
  };
}

function projectGoal(
  input: ProjectAiPipelineInspectorInput,
  plan: Record<string, unknown> | null
): AiPipelineInspectorSnapshot["goal"] {
  const goal = asRecord(input.goal);
  const summary =
    readString(input.scenarioSummary) ||
    (goal && Array.isArray(goal.outcomes)
      ? goal.outcomes.filter((o) => typeof o === "string").join(", ") || null
      : null);
  return {
    summary,
    timelineWeeks:
      readNumber(goal?.timelineWeeks) ??
      readNumber(plan?.effectiveTimelineWeeks) ??
      null,
    targetWeightChangeKg: null,
    targetBodyFatChangePct: null,
    targetMuscleChangeKg: null,
  };
}

function readVersionFromRuntime(
  runtimeVersions: Record<string, string | null> | null | undefined,
  key: string
): string | null {
  if (!runtimeVersions) return null;
  return readString(runtimeVersions[key]);
}

/**
 * Project a complete AI Pipeline Inspector snapshot from structured artifacts.
 */
export function projectAiPipelineInspector(
  input: ProjectAiPipelineInspectorInput
): AiPipelineInspectorSnapshot {
  const plan = asRecord(input.transformationPlan);
  const visual = asRecord(input.visualDirection);
  const render = asRecord(input.renderPlan);
  const goal = asRecord(input.goal);
  const positive =
    typeof input.positivePrompt === "string" ? input.positivePrompt : "";
  const negative =
    typeof input.negativePrompt === "string" ? input.negativePrompt : "";
  const metrics = computePromptMetrics(positive, negative);
  const scenarioId = readString(input.scenarioId) ?? "";

  const rulesView = projectTransformationRules({
    scenarioId,
    transformationPlan: input.transformationPlan,
    visualDirection: input.visualDirection,
    renderPlan: input.renderPlan,
  });
  const transformationRules = mapRulesFromView(rulesView);

  const transformationRulesVersion =
    rulesView.source.transformationRulesVersion ||
    readVersionFromRuntime(
      input.runtimeVersions,
      "transformationRulesVersion"
    ) ||
    null;
  const renderPlanVersion =
    rulesView.source.renderPlanRulesVersion ||
    readVersionFromRuntime(input.runtimeVersions, "renderPlanRulesVersion") ||
    null;
  const aiOsVersion =
    readString(input.aiOsVersion) ||
    readVersionFromRuntime(input.runtimeVersions, "runtimeRulesVersion") ||
    null;
  const validationVersion =
    readString(input.validationVersion) ||
    readVersionFromRuntime(
      input.runtimeVersions,
      "resultValidatorRulesVersion"
    ) ||
    null;
  const formatterName =
    readString(input.formatterName) ||
    readVersionFromRuntime(input.runtimeVersions, "formatterName") ||
    null;
  const formatterVersion =
    readString(input.formatterVersion) ||
    readVersionFromRuntime(input.runtimeVersions, "formatterVersion") ||
    null;

  const ruleProvenance = buildRuleProvenance({
    planPresent: plan != null,
    visualPresent: visual != null,
    renderPresent: render != null,
    goalPresent: goal != null,
    scenarioIdPresent: scenarioId.length > 0,
  });

  const outcome =
    typeof input.outcome === "string" && input.outcome
      ? input.outcome
      : "runtime_failed";
  const generatedImageAvailable = input.generatedImageAvailable === true;
  const success = input.success === true;

  // Strip image URLs / secrets from plan clone — keep structured numbers only.
  const safePlan = plan != null ? structuredClone(plan) : null;

  return {
    schemaVersion: AI_PIPELINE_INSPECTOR_SCHEMA_VERSION,
    inspectorId: AI_PIPELINE_INSPECTOR_ID,
    experimentId: input.experimentId,
    requestId: readString(input.requestId) ?? "",
    scenarioId,
    versions: {
      aiOsVersion,
      pipelineVersion:
        readString(input.pipelineVersion) || AI_PIPELINE_VERSION,
      transformationRulesVersion,
      formatterName,
      formatterVersion,
      renderPlanVersion,
      validationVersion,
    },
    goal: projectGoal(input, plan),
    transformationPlan: safePlan,
    transformationRules,
    ruleProvenance,
    formatter: {
      name: formatterName,
      version: formatterVersion,
      mode: readString(input.formatterMode),
    },
    prompts: {
      positivePrompt: positive,
      negativePrompt: negative,
      metrics: {
        positiveCharacters: countPromptCharacters(positive),
        positiveWords: countPromptWords(positive),
        negativeCharacters: countPromptCharacters(negative),
        negativeWords: countPromptWords(negative),
        totalCharacters: metrics.totalCharacters,
        totalWords: metrics.totalWords,
      },
    },
    provider: {
      family: readString(input.providerFamily),
      model: readString(input.model) ?? "",
      predictionId: readString(input.predictionId),
      durationMs:
        typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
          ? Math.max(0, input.durationMs)
          : null,
      outcome,
    },
    result: {
      success,
      diagnostic: readString(input.diagnostic),
      validationDecision: readString(input.validationDecision),
      generatedImageAvailable,
    },
    evaluation: { ...AI_PIPELINE_EVALUATION_PLACEHOLDER },
  };
}

/** True when provenance entries never expose filesystem-like paths. */
export function provenancePathsAreSafe(
  entries: readonly AiPipelineRuleProvenanceEntry[]
): boolean {
  for (const entry of entries) {
    if (/[\\/]/.test(entry.sourcePath) && /\.(ts|js|tsx|jsx|cjs|mjs)$/i.test(entry.sourcePath)) {
      return false;
    }
    if (/^[A-Za-z]:\\/.test(entry.sourcePath)) return false;
    if (entry.sourcePath.includes("node_modules")) return false;
    if (entry.sourcePath.includes("stack")) return false;
  }
  return true;
}
