/**
 * AI Pipeline Inspector contracts (Demand 018E — expanded).
 *
 * Safe, versioned, read-only snapshot for the AI Experiment Lab.
 * Never includes source/generated image URLs, tokens, keys, raw provider
 * payloads, environment values, or stack traces.
 */

export const AI_PIPELINE_INSPECTOR_SCHEMA_VERSION = 1 as const;
export const AI_PIPELINE_VERSION = "1.0" as const;
export const AI_PIPELINE_INSPECTOR_ID = "ai-pipeline-inspector" as const;

export type AiPipelineRuleProvenanceSource =
  | "scenario"
  | "profile"
  | "goal"
  | "transformation_plan"
  | "visual_direction"
  | "render_plan"
  | "formatter_option"
  | "derived";

export interface AiPipelineRuleProvenanceEntry {
  rulePath: string;
  source: AiPipelineRuleProvenanceSource;
  /** Safe contract path (never a filesystem path). */
  sourcePath: string;
}

export interface AiPipelineInspectorVersions {
  aiOsVersion: string | null;
  pipelineVersion: string | null;
  transformationRulesVersion: string | null;
  formatterName: string | null;
  formatterVersion: string | null;
  renderPlanVersion: string | null;
  validationVersion: string | null;
}

export interface AiPipelineInspectorGoal {
  summary: string | null;
  timelineWeeks: number | null;
  targetWeightChangeKg: number | null;
  targetBodyFatChangePct: number | null;
  targetMuscleChangeKg: number | null;
}

export interface AiPipelineTransformationRules {
  identity: unknown;
  pose: unknown;
  camera: unknown;
  background: unknown;
  lighting: unknown;
  clothing: unknown;
  bodyComposition: unknown;
  bodyRegionEmphasis: unknown;
  proportions: unknown;
  realism: unknown;
  timeline: unknown;
  priorityOrder: unknown[];
}

export interface AiPipelinePromptMetrics {
  positiveCharacters: number;
  positiveWords: number;
  negativeCharacters: number;
  negativeWords: number;
  totalCharacters: number;
  totalWords: number;
}

/** Reserved for Demand 021 / later evaluation milestones — always null for now. */
export interface AiPipelineEvaluationPlaceholder {
  expectedResult: null;
  actualResult: null;
  deviation: null;
}

export const AI_PIPELINE_EVALUATION_PLACEHOLDER: AiPipelineEvaluationPlaceholder =
  {
    expectedResult: null,
    actualResult: null,
    deviation: null,
  };

export interface AiPipelineInspectorSnapshot {
  schemaVersion: typeof AI_PIPELINE_INSPECTOR_SCHEMA_VERSION;
  inspectorId: typeof AI_PIPELINE_INSPECTOR_ID;

  experimentId: string;
  requestId: string;
  scenarioId: string;

  versions: AiPipelineInspectorVersions;

  goal: AiPipelineInspectorGoal;

  /** Structured plan artifact when available — never invented. */
  transformationPlan: unknown;

  transformationRules: AiPipelineTransformationRules;

  ruleProvenance: AiPipelineRuleProvenanceEntry[];

  formatter: {
    name: string | null;
    version: string | null;
    mode: string | null;
  };

  prompts: {
    positivePrompt: string;
    negativePrompt: string;
    metrics: AiPipelinePromptMetrics;
  };

  provider: {
    family: string | null;
    model: string | null;
    predictionId: string | null;
    durationMs: number | null;
    outcome: string;
  };

  result: {
    success: boolean;
    diagnostic: string | null;
    validationDecision: string | null;
    generatedImageAvailable: boolean;
  };

  /** Non-functional reserved field — Demand 021 may populate later. */
  evaluation: AiPipelineEvaluationPlaceholder;
}

/** Accordion section order for the Control Room inspector. */
export const AI_PIPELINE_ACCORDION_SECTIONS = [
  "Goal",
  "Transformation Plan",
  "Transformation Rules",
  "Body Simulator",
  "Formatter Input",
  "Formatter Preview",
  "Formatter Comparison",
  "Generation Diagnostics",
  "Pipeline Snapshot",
  "Rule Provenance",
  "Formatter",
  "Prompts",
  "Provider",
  "Result",
] as const;

export type AiPipelineAccordionSection =
  (typeof AI_PIPELINE_ACCORDION_SECTIONS)[number];

/** Display groups for Transformation Rules (before prompts). */
export const AI_PIPELINE_RULE_GROUP_KEYS = [
  "identity",
  "pose",
  "camera",
  "background",
  "lighting",
  "clothing",
  "bodyComposition",
  "bodyRegionEmphasis",
  "proportions",
  "realism",
  "timeline",
  "priorityOrder",
] as const;

export type AiPipelineRuleGroupKey =
  (typeof AI_PIPELINE_RULE_GROUP_KEYS)[number];

export const AI_PIPELINE_RULE_GROUP_LABELS: Record<
  AiPipelineRuleGroupKey,
  string
> = {
  identity: "Identity",
  pose: "Pose",
  camera: "Camera",
  background: "Background",
  lighting: "Lighting",
  clothing: "Clothing",
  bodyComposition: "Body composition",
  bodyRegionEmphasis: "Body region emphasis",
  proportions: "Proportions",
  realism: "Realism",
  timeline: "Timeline",
  priorityOrder: "Priority order",
};

export const AI_PIPELINE_CANONICAL_NOTE =
  "Prompts are provider-specific generated artifacts. Transformation Rules are the canonical representation of HelseApp intent." as const;
