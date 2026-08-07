/**
 * Demand 022C — Controlled Legacy vs Body Simulator generation comparison.
 *
 * Internal Control Room only. Never production. Never auto pair-generate.
 * One manual click → at most one provider request. Session memory only.
 */

import {
  BODY_SIMULATION_GOAL_TYPES,
  BODY_SIMULATION_INTENSITIES,
  BODY_SIMULATOR_REGIONS,
  BODY_SIMULATOR_RULES_SCHEMA_VERSION,
  BODY_SIMULATOR_TIMELINE_MAX_WEEKS,
  BODY_SIMULATOR_TIMELINE_MIN_WEEKS,
  type BodySimulatorTransformationRules,
} from "../body-simulator/BodySimulatorTypes";
import { comparePromptLines } from "./PromptExperimentComparison";

export const BODY_SIMULATOR_COMPARISON_SCHEMA_VERSION = 1 as const;
export const SIMULATOR_CALIBRATION_OBSERVATION_SCHEMA_VERSION = 1 as const;
export const BODY_SIMULATOR_COMPARISON_MAX_RUNS = 20 as const;

export const GENERATION_PATH_LEGACY = "legacy" as const;
export const GENERATION_PATH_BODY_SIMULATOR = "body_simulator" as const;

export const GENERATION_PATHS = Object.freeze([
  GENERATION_PATH_LEGACY,
  GENERATION_PATH_BODY_SIMULATOR,
] as const);

export type GenerationPath =
  | typeof GENERATION_PATH_LEGACY
  | typeof GENERATION_PATH_BODY_SIMULATOR;

export const DEFAULT_GENERATION_PATH: GenerationPath =
  GENERATION_PATH_BODY_SIMULATOR;

export type ManualEvalScore = 1 | 2 | 3 | 4 | 5 | "not_assessable";

export type ManualEvalCategoryId =
  | "identityPreservation"
  | "bodyChangeRealism"
  | "goalAlignment"
  | "naturalProportions"
  | "presentationPreservation"
  | "overallUsefulness";

export const MANUAL_EVAL_CATEGORIES: readonly {
  id: ManualEvalCategoryId;
  label: string;
}[] = Object.freeze([
  { id: "identityPreservation", label: "Identity preservation" },
  { id: "bodyChangeRealism", label: "Body-change realism" },
  {
    id: "goalAlignment",
    label: "Transformation matches intended goal",
  },
  { id: "naturalProportions", label: "Natural proportions" },
  {
    id: "presentationPreservation",
    label: "Clothing/presentation preservation",
  },
  { id: "overallUsefulness", label: "Overall usefulness" },
]);

export interface BodySimulatorComparisonRun {
  schemaVersion: typeof BODY_SIMULATOR_COMPARISON_SCHEMA_VERSION;

  comparisonSessionId: string;
  runId: string;
  createdAt: string;

  generationPath: GenerationPath;

  /** Explicit deprecated baseline marker for legacy runs. */
  deprecatedBaseline: boolean;

  sourceImageFingerprint: string | null;

  scenarioId: string;

  bodySimulatorScenarioId: string | null;

  conditions: {
    provider: string | null;
    model: string | null;
    width: number | null;
    height: number | null;
    outputCount: number;
  };

  versions: {
    /** Body Simulator rules version, or null on legacy path. */
    bodySimulatorRules: string | null;
    formatter: string | null;
    formatterSchema: string | null;
    pipeline: string | null;
  };

  prompt: {
    positive: string;
    negative: string;
    totalCharacters: number;
    totalWords: number;
  };

  generation: {
    outcome:
      | "succeeded"
      | "safety_blocked"
      | "provider_failed"
      | "validation_failed"
      | "runtime_failed";

    durationMs: number | null;
    httpStatus: number | null;
    providerPredictionId: string | null;
  };

  result: {
    generatedImageAvailable: boolean;
    /**
     * Session UI may attach a temporary preview URL in browser memory only.
     * Server projection keeps this null (HTTPS URLs allowed only at generatedImage.url).
     */
    generatedImageUrl: string | null;
  };

  diagnostics: string[];
}

export interface PathPairEvaluation {
  identityPreservation: ManualEvalScore;
  bodyChangeRealism: ManualEvalScore;
  goalAlignment: ManualEvalScore;
  naturalProportions: ManualEvalScore;
  presentationPreservation: ManualEvalScore;
  overallUsefulness: ManualEvalScore;
}

export interface ManualComparisonEvaluation {
  legacy: PathPairEvaluation | null;
  bodySimulator: PathPairEvaluation | null;
  note: string | null;
}

export interface ComparabilityCheck {
  comparable: boolean;
  warnings: string[];
  matched: {
    sourceImage: boolean;
    scenario: boolean;
    provider: boolean;
    model: boolean;
    dimensions: boolean;
    outputCount: boolean;
  };
}

export interface ComparisonDifferenceSummary {
  transformationSource: "Legacy vs Body Simulator";
  prompt: {
    totalCharactersLegacy: number;
    totalCharactersBodySimulator: number;
    totalWordsLegacy: number;
    totalWordsBodySimulator: number;
    characterDelta: number;
    wordDelta: number;
    onlyInLegacy: string[];
    onlyInBodySimulator: string[];
  };
  generation: {
    durationDeltaMs: number | null;
    outcomeLegacy: string;
    outcomeBodySimulator: string;
  };
  manualEvaluation: {
    legacyAverage: number | null;
    bodySimulatorAverage: number | null;
    interpretation:
      | "Body Simulator received a higher manual evaluation in this comparison."
      | "Legacy received a higher manual evaluation in this comparison."
      | "Evaluation is inconclusive.";
    note: string | null;
  };
  comparable: boolean;
}

export interface SimulatorCalibrationObservation {
  schemaVersion: typeof SIMULATOR_CALIBRATION_OBSERVATION_SCHEMA_VERSION;

  comparable: boolean;

  bodySimulatorRunId: string | null;
  legacyRunId: string | null;

  scenarioId: string | null;

  manualEvaluation: {
    identityPreservation: {
      legacy: number | null;
      bodySimulator: number | null;
    };
    bodyChangeRealism: {
      legacy: number | null;
      bodySimulator: number | null;
    };
    goalAlignment: {
      legacy: number | null;
      bodySimulator: number | null;
    };
    naturalProportions: {
      legacy: number | null;
      bodySimulator: number | null;
    };
    presentationPreservation: {
      legacy: number | null;
      bodySimulator: number | null;
    };
    overallUsefulness: {
      legacy: number | null;
      bodySimulator: number | null;
    };
  };

  note: string | null;
}

export interface CanonicalRuleVerificationResult {
  ok: boolean;
  errors: string[];
}

const PRESERVATION_KEYS = [
  "identity",
  "originalPresentation",
  "pose",
  "cameraFraming",
  "clothing",
  "clothingCoverage",
  "background",
  "lightingCharacter",
  "ageAppearance",
  "ethnicityAppearance",
  "personalStyle",
  "faceGeometry",
  "skinTone",
  "hairstyle",
  "bodyHeight",
  "handAndFootScale",
  "skeletalProportions",
] as const;

const CONFIDENCE_LEVELS = new Set([
  "high",
  "medium",
  "low",
  "not_applicable",
  "unknown",
]);

/**
 * Strict allowlist for API / Control Room generationPath.
 * Rejects arbitrary formatter ids, prompts, and unknown strings.
 */
export function resolveGenerationPath(raw: unknown): GenerationPath | null {
  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_GENERATION_PATH;
  }
  if (typeof raw !== "string") return null;
  if (raw === GENERATION_PATH_LEGACY) return GENERATION_PATH_LEGACY;
  if (raw === GENERATION_PATH_BODY_SIMULATOR) {
    return GENERATION_PATH_BODY_SIMULATOR;
  }
  return null;
}

export function isGenerationPath(value: unknown): value is GenerationPath {
  return (
    value === GENERATION_PATH_LEGACY || value === GENERATION_PATH_BODY_SIMULATOR
  );
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Verify canonical Body Simulator Transformation Rules before any provider call.
 * Fail-closed: any structural issue → ok:false (zero provider calls).
 */
export function verifyCanonicalBodySimulatorRules(
  rules: unknown
): CanonicalRuleVerificationResult {
  const errors: string[] = [];
  if (rules == null || typeof rules !== "object") {
    return { ok: false, errors: ["rules_missing"] };
  }
  const r = rules as Record<string, unknown>;

  if (r.schemaVersion !== BODY_SIMULATOR_RULES_SCHEMA_VERSION) {
    errors.push("unsupported_rules_schema");
  }
  if (typeof r.rulesVersion !== "string" || r.rulesVersion.trim() === "") {
    errors.push("missing_rules_version");
  }
  if (typeof r.simulationId !== "string" || r.simulationId.trim() === "") {
    errors.push("missing_simulation_id");
  }

  const goal = r.goal;
  if (goal == null || typeof goal !== "object") {
    errors.push("invalid_goal");
  } else {
    const g = goal as Record<string, unknown>;
    if (
      typeof g.effectiveType !== "string" ||
      !(BODY_SIMULATION_GOAL_TYPES as readonly string[]).includes(g.effectiveType)
    ) {
      errors.push("unsupported_goal");
    }
    if (
      typeof g.timelineWeeks !== "number" ||
      !Number.isFinite(g.timelineWeeks) ||
      g.timelineWeeks < BODY_SIMULATOR_TIMELINE_MIN_WEEKS ||
      g.timelineWeeks > BODY_SIMULATOR_TIMELINE_MAX_WEEKS
    ) {
      errors.push("unsupported_timeline");
    }
    if (
      typeof g.intensity !== "string" ||
      !(BODY_SIMULATION_INTENSITIES as readonly string[]).includes(g.intensity)
    ) {
      errors.push("invalid_intensity");
    }
  }

  const preservation = r.preservation;
  if (preservation == null || typeof preservation !== "object") {
    errors.push("preservation_missing");
  } else {
    const p = preservation as Record<string, unknown>;
    for (const key of PRESERVATION_KEYS) {
      if (p[key] !== "preserve") {
        errors.push(`preservation_${key}_invalid`);
      }
    }
  }

  if (!Array.isArray(r.regions) || r.regions.length === 0) {
    errors.push("regions_invalid");
  } else {
    for (const region of r.regions) {
      if (region == null || typeof region !== "object") {
        errors.push("region_entry_invalid");
        continue;
      }
      const reg = region as Record<string, unknown>;
      if (
        typeof reg.region !== "string" ||
        !(BODY_SIMULATOR_REGIONS as readonly string[]).includes(reg.region)
      ) {
        errors.push("region_id_invalid");
      }
      const mag = reg.visualMagnitude;
      if (mag == null || typeof mag !== "object") {
        errors.push("region_magnitude_invalid");
      } else {
        const m = mag as Record<string, unknown>;
        for (const k of ["lower", "expected", "upper"] as const) {
          if (typeof m[k] !== "number" || !Number.isFinite(m[k])) {
            errors.push("region_magnitude_invalid");
            break;
          }
        }
      }
      if (reg.preserveNaturalProportions !== true) {
        errors.push("region_preservation_invalid");
      }
    }
  }

  const confidence = r.confidence;
  if (confidence == null || typeof confidence !== "object") {
    errors.push("confidence_invalid");
  } else {
    const c = confidence as Record<string, unknown>;
    if (typeof c.overall !== "string" || !CONFIDENCE_LEVELS.has(c.overall)) {
      errors.push("confidence_invalid");
    }
    if (!Array.isArray(c.reasons)) {
      errors.push("confidence_reasons_invalid");
    }
  }

  if (!Array.isArray(r.provenance)) {
    errors.push("provenance_invalid");
  }

  const realism = r.realism;
  if (realism == null || typeof realism !== "object") {
    errors.push("realism_invalid");
  } else {
    const real = realism as Record<string, unknown>;
    if (typeof real.requestedTargetModerated !== "boolean") {
      errors.push("realism_moderation_invalid");
    }
    if (typeof real.unrealisticChangePrevented !== "boolean") {
      errors.push("realism_moderation_invalid");
    }
    if (real.expectedVisualizationNotGuarantee !== true) {
      errors.push("realism_guarantee_flag_invalid");
    }
    if (!Array.isArray(real.moderationReasons)) {
      errors.push("realism_moderation_invalid");
    }
  }

  // Canonical rules must not embed provider/model or prompt business logic.
  const forbiddenKeys = ["provider", "model", "prompt", "negativePrompt"];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(r, key)) {
      errors.push(`forbidden_field_${key}`);
    }
  }
  const serialized = safeJson(r);
  if (
    /"provider"\s*:|"model"\s*:|"positivePrompt"\s*:|"replicate"/i.test(
      serialized
    )
  ) {
    errors.push("provider_or_prompt_embedded");
  }

  return { ok: errors.length === 0, errors };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

export function checkComparisonComparability(
  legacy: BodySimulatorComparisonRun,
  bodySimulator: BodySimulatorComparisonRun
): ComparabilityCheck {
  const warnings: string[] = [];
  const sourceImage =
    legacy.sourceImageFingerprint != null &&
    bodySimulator.sourceImageFingerprint != null &&
    legacy.sourceImageFingerprint === bodySimulator.sourceImageFingerprint;
  if (!sourceImage) warnings.push("source image differs");

  const scenario = legacy.scenarioId === bodySimulator.scenarioId;
  if (!scenario) warnings.push("scenario differs");

  const provider =
    legacy.conditions.provider != null &&
    bodySimulator.conditions.provider != null &&
    legacy.conditions.provider === bodySimulator.conditions.provider;
  if (!provider) warnings.push("provider differs");

  const model =
    legacy.conditions.model != null &&
    bodySimulator.conditions.model != null &&
    legacy.conditions.model === bodySimulator.conditions.model;
  if (!model) warnings.push("model differs");

  const dimensions =
    legacy.conditions.width === bodySimulator.conditions.width &&
    legacy.conditions.height === bodySimulator.conditions.height;
  if (!dimensions) warnings.push("dimensions differ");

  const outputCount =
    legacy.conditions.outputCount === bodySimulator.conditions.outputCount;
  if (!outputCount) warnings.push("output count differs");

  const pathOk =
    legacy.generationPath === GENERATION_PATH_LEGACY &&
    bodySimulator.generationPath === GENERATION_PATH_BODY_SIMULATOR;
  if (!pathOk) warnings.push("generation paths are not Legacy A + Body Simulator B");

  const comparable =
    sourceImage &&
    scenario &&
    provider &&
    model &&
    dimensions &&
    outputCount &&
    pathOk;

  return {
    comparable,
    warnings,
    matched: {
      sourceImage,
      scenario,
      provider,
      model,
      dimensions,
      outputCount,
    },
  };
}

function scoreToNumber(score: ManualEvalScore | null | undefined): number | null {
  if (score == null || score === "not_assessable") return null;
  if (typeof score === "number" && score >= 1 && score <= 5) return score;
  return null;
}

export function averageAssessableScores(
  evaluation: PathPairEvaluation | null | undefined
): number | null {
  if (evaluation == null) return null;
  const values = MANUAL_EVAL_CATEGORIES.map((c) =>
    scoreToNumber(evaluation[c.id])
  ).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

export function interpretManualEvaluationAverages(
  legacyAverage: number | null,
  bodySimulatorAverage: number | null
): ComparisonDifferenceSummary["manualEvaluation"]["interpretation"] {
  if (legacyAverage == null || bodySimulatorAverage == null) {
    return "Evaluation is inconclusive.";
  }
  if (bodySimulatorAverage > legacyAverage) {
    return "Body Simulator received a higher manual evaluation in this comparison.";
  }
  if (legacyAverage > bodySimulatorAverage) {
    return "Legacy received a higher manual evaluation in this comparison.";
  }
  return "Evaluation is inconclusive.";
}

export function buildComparisonDifferenceSummary(options: {
  legacy: BodySimulatorComparisonRun;
  bodySimulator: BodySimulatorComparisonRun;
  evaluation?: ManualComparisonEvaluation | null;
}): ComparisonDifferenceSummary {
  const { legacy, bodySimulator } = options;
  const check = checkComparisonComparability(legacy, bodySimulator);
  const lineDiff = comparePromptLines(
    legacy.prompt.positive,
    bodySimulator.prompt.positive
  );
  const legacyAvg = averageAssessableScores(options.evaluation?.legacy ?? null);
  const bodyAvg = averageAssessableScores(
    options.evaluation?.bodySimulator ?? null
  );
  const durationDelta =
    legacy.generation.durationMs != null &&
    bodySimulator.generation.durationMs != null
      ? bodySimulator.generation.durationMs - legacy.generation.durationMs
      : null;

  return {
    transformationSource: "Legacy vs Body Simulator",
    prompt: {
      totalCharactersLegacy: legacy.prompt.totalCharacters,
      totalCharactersBodySimulator: bodySimulator.prompt.totalCharacters,
      totalWordsLegacy: legacy.prompt.totalWords,
      totalWordsBodySimulator: bodySimulator.prompt.totalWords,
      characterDelta:
        bodySimulator.prompt.totalCharacters - legacy.prompt.totalCharacters,
      wordDelta: bodySimulator.prompt.totalWords - legacy.prompt.totalWords,
      onlyInLegacy: lineDiff.onlyInA,
      onlyInBodySimulator: lineDiff.onlyInB,
    },
    generation: {
      durationDeltaMs: durationDelta,
      outcomeLegacy: legacy.generation.outcome,
      outcomeBodySimulator: bodySimulator.generation.outcome,
    },
    manualEvaluation: {
      legacyAverage: legacyAvg,
      bodySimulatorAverage: bodyAvg,
      interpretation: interpretManualEvaluationAverages(legacyAvg, bodyAvg),
      note: options.evaluation?.note ?? null,
    },
    comparable: check.comparable,
  };
}

export function buildSimulatorCalibrationObservation(options: {
  legacy: BodySimulatorComparisonRun | null;
  bodySimulator: BodySimulatorComparisonRun | null;
  evaluation?: ManualComparisonEvaluation | null;
}): SimulatorCalibrationObservation {
  const legacy = options.legacy;
  const body = options.bodySimulator;
  const comparable =
    legacy != null && body != null
      ? checkComparisonComparability(legacy, body).comparable
      : false;
  const evalLegacy = options.evaluation?.legacy ?? null;
  const evalBody = options.evaluation?.bodySimulator ?? null;

  const pair = (id: ManualEvalCategoryId) => ({
    legacy: scoreToNumber(evalLegacy?.[id]),
    bodySimulator: scoreToNumber(evalBody?.[id]),
  });

  return {
    schemaVersion: SIMULATOR_CALIBRATION_OBSERVATION_SCHEMA_VERSION,
    comparable,
    bodySimulatorRunId: body?.runId ?? null,
    legacyRunId: legacy?.runId ?? null,
    scenarioId: body?.scenarioId ?? legacy?.scenarioId ?? null,
    manualEvaluation: {
      identityPreservation: pair("identityPreservation"),
      bodyChangeRealism: pair("bodyChangeRealism"),
      goalAlignment: pair("goalAlignment"),
      naturalProportions: pair("naturalProportions"),
      presentationPreservation: pair("presentationPreservation"),
      overallUsefulness: pair("overallUsefulness"),
    },
    note: options.evaluation?.note ?? null,
  };
}

/**
 * Browser-session history helper (also usable from tests).
 * Memory only — never persists.
 */
export function pushComparisonRun(
  history: BodySimulatorComparisonRun[],
  run: BodySimulatorComparisonRun,
  maxRuns: number = BODY_SIMULATOR_COMPARISON_MAX_RUNS
): BodySimulatorComparisonRun[] {
  const next = [...history, run];
  if (next.length <= maxRuns) return next;
  return next.slice(next.length - maxRuns);
}

export function createComparisonSessionId(nowMs: number = Date.now()): string {
  return `cmp-sess-${nowMs.toString(36)}`;
}

export function createComparisonRunId(nowMs: number = Date.now()): string {
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `cmp-run-${nowMs.toString(36)}-${rand}`;
}

export function buildComparisonRunFromPreview(options: {
  comparisonSessionId: string;
  runId?: string;
  createdAt?: string;
  generationPath: GenerationPath;
  sourceImageFingerprint: string | null;
  scenarioId: string;
  bodySimulatorScenarioId: string | null;
  provider: string | null;
  model: string | null;
  width?: number | null;
  height?: number | null;
  outputCount?: number;
  bodySimulatorRulesVersion: string | null;
  formatterVersion: string | null;
  formatterSchema: string | null;
  pipelineVersion?: string | null;
  positivePrompt: string;
  negativePrompt: string;
  outcome: BodySimulatorComparisonRun["generation"]["outcome"];
  durationMs: number | null;
  httpStatus: number | null;
  providerPredictionId: string | null;
  generatedImageUrl: string | null;
  diagnostics?: string[];
}): BodySimulatorComparisonRun {
  const positive = options.positivePrompt ?? "";
  const negative = options.negativePrompt ?? "";
  return {
    schemaVersion: BODY_SIMULATOR_COMPARISON_SCHEMA_VERSION,
    comparisonSessionId: options.comparisonSessionId,
    runId: options.runId ?? createComparisonRunId(),
    createdAt: options.createdAt ?? new Date().toISOString(),
    generationPath: options.generationPath,
    deprecatedBaseline: options.generationPath === GENERATION_PATH_LEGACY,
    sourceImageFingerprint: options.sourceImageFingerprint,
    scenarioId: options.scenarioId,
    bodySimulatorScenarioId:
      options.generationPath === GENERATION_PATH_LEGACY
        ? null
        : options.bodySimulatorScenarioId,
    conditions: {
      provider: options.provider,
      model: options.model,
      width: options.width ?? null,
      height: options.height ?? null,
      outputCount: options.outputCount ?? 1,
    },
    versions: {
      bodySimulatorRules:
        options.generationPath === GENERATION_PATH_LEGACY
          ? null
          : options.bodySimulatorRulesVersion,
      formatter: options.formatterVersion,
      formatterSchema: options.formatterSchema,
      pipeline: options.pipelineVersion ?? "ai-os-image-preview/1.0",
    },
    prompt: {
      positive,
      negative,
      totalCharacters: positive.length + negative.length,
      totalWords: countWords(positive) + countWords(negative),
    },
    generation: {
      outcome: options.outcome,
      durationMs: options.durationMs,
      httpStatus: options.httpStatus,
      providerPredictionId: options.providerPredictionId,
    },
    result: {
      generatedImageAvailable: options.generatedImageUrl != null,
      generatedImageUrl: options.generatedImageUrl,
    },
    diagnostics: [...(options.diagnostics ?? [])],
  };
}

/** Type-only re-export convenience for adapters/tests. */
export type { BodySimulatorTransformationRules };
