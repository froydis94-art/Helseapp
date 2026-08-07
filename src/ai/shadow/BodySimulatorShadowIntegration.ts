/**
 * Body Simulator Shadow Runtime integration (Demand 022A).
 *
 * Fixture-only dry-run phase: allowlisted Body Simulator fixtures → adapter →
 * readiness → simulate once → safe projection for Control Room / Shadow.
 *
 * Never calls network image services, formatters, or image generation.
 * Does not modify Body Simulator v1 business rules.
 */

import {
  assessBodySimulatorReadiness,
  fixtureAdvancedMuscleGain24w,
  fixtureAmbitiousWeightLoss12w,
  fixtureBeginnerMuscleGain24w,
  fixtureConservativeWeightLoss12w,
  fixtureFatLossMusclePreservation,
  fixtureGeneralFitnessLimitedBaseline,
  fixtureMedAppetiteDecrease,
  fixtureMedAppetiteIncrease,
  fixtureMedEnergyDecrease,
  fixtureMissingBodyFat,
  fixtureNoMedicationEffect,
  fixturePartialBodyVisibility,
  fixtureRealisticWeightLoss12w,
  fixtureRecomposition16w,
  fixtureUnrealisticTargetModerated,
  projectBodySimulatorRules,
  simulateBodyTransformation,
  type BodySimulatorInput,
  type BodySimulatorReadiness,
  type BodySimulatorSafeProjection,
  type BodySimulatorTransformationRules,
} from "../body-simulator";

export const BODY_SIMULATOR_SHADOW_FLAG =
  "AI_OS_BODY_SIMULATOR_SHADOW_ENABLED" as const;

export const BODY_SIMULATOR_SHADOW_ERROR_CODES = [
  "body_simulator_disabled",
  "body_simulator_insufficient_input",
  "body_simulator_validation_failed",
  "body_simulator_execution_failed",
  "body_simulator_projection_failed",
] as const;

export type BodySimulatorShadowErrorCode =
  (typeof BODY_SIMULATOR_SHADOW_ERROR_CODES)[number];

export type BodySimulatorShadowAdapterStatus =
  | "ready"
  | "ready_with_limitations"
  | "insufficient_input"
  | "adapter_failed";

export interface BodySimulatorShadowInputAdapterResult {
  input: BodySimulatorInput | null;
  status: BodySimulatorShadowAdapterStatus;
  missingInputs: string[];
  limitations: string[];
  diagnostics: string[];
}

export type ShadowBodySimulatorStatus =
  | "not_run"
  | "succeeded"
  | "ready_with_limitations"
  | "insufficient_input"
  | "failed";

export interface ShadowBodySimulatorResult {
  executed: boolean;
  status: ShadowBodySimulatorStatus;
  inputSchemaVersion: number | null;
  rulesSchemaVersion: number | null;
  readiness: BodySimulatorReadiness | null;
  rules: BodySimulatorTransformationRules | null;
  projection: BodySimulatorSafeProjection | null;
  diagnostics: string[];
}

export type ControlRoomBodySimulatorStatus =
  | "disabled"
  | "not_run"
  | "succeeded"
  | "ready_with_limitations"
  | "insufficient_input"
  | "failed";

export interface BodySimulatorShadowInputSummary {
  goalType: string | null;
  timelineWeeks: number | null;
  intensity: string | null;
  ageAvailable: "Available" | "Unavailable" | "Unknown" | "Not provided";
  heightAvailable: "Available" | "Unavailable" | "Unknown" | "Not provided";
  weightAvailable: "Available" | "Unavailable" | "Unknown" | "Not provided";
  bodyFatBasis: string | null;
  trainingExperience: string | null;
  generalActivity: string | null;
  resistanceSessions: number | null;
  cardioSessions: number | null;
  medicationMayAffectWeight: boolean | null;
  sourcePhotoView: string | null;
  bodyAnalysisAvailable: boolean;
  medication: {
    medicationMayAffectWeight: boolean | null;
    appetite: string | null;
    energyLevel: string | null;
    metabolismTendency: string | null;
    muscleBuildingOrPreservation: string | null;
    evidenceOrigin: string | null;
    evidenceConfidence: string | null;
  } | null;
}

export interface ControlRoomBodySimulatorView {
  enabled: boolean;
  scenarioId: string | null;
  status: ControlRoomBodySimulatorStatus;
  inputSummary: BodySimulatorShadowInputSummary | null;
  readiness: BodySimulatorReadiness | null;
  rules: BodySimulatorTransformationRules | null;
  projection: BodySimulatorSafeProjection | null;
  diagnostics: string[];
  errorCode: BodySimulatorShadowErrorCode | null;
}

export interface BodySimulatorShadowScenarioSummary {
  id: string;
  title: string;
  description: string;
  fixtureSimulationId: string;
}

type FixtureBuilder = () => BodySimulatorInput;

interface ShadowScenarioEntry {
  id: string;
  title: string;
  description: string;
  build: FixtureBuilder;
}

const SHADOW_SCENARIO_REGISTRY: readonly ShadowScenarioEntry[] = Object.freeze([
  {
    id: "realistic_weight_loss_12w",
    title: "Realistic weight loss (12 weeks)",
    description: "Fixture-only realistic intensity weight-loss simulation.",
    build: fixtureRealisticWeightLoss12w,
  },
  {
    id: "conservative_weight_loss_12w",
    title: "Conservative weight loss (12 weeks)",
    description: "Fixture-only conservative intensity weight-loss simulation.",
    build: fixtureConservativeWeightLoss12w,
  },
  {
    id: "ambitious_weight_loss_12w",
    title: "Ambitious bounded weight loss (12 weeks)",
    description: "Fixture-only ambitious intensity with realism bounds.",
    build: fixtureAmbitiousWeightLoss12w,
  },
  {
    id: "fat_loss_muscle_preservation",
    title: "Fat loss with muscle preservation",
    description: "Fixture-only fat loss with muscle preservation goal.",
    build: fixtureFatLossMusclePreservation,
  },
  {
    id: "beginner_muscle_gain_24w",
    title: "Beginner muscle gain (24 weeks)",
    description: "Fixture-only beginner muscle-gain simulation.",
    build: fixtureBeginnerMuscleGain24w,
  },
  {
    id: "advanced_muscle_gain_24w",
    title: "Advanced muscle gain (24 weeks)",
    description: "Fixture-only advanced muscle-gain simulation.",
    build: fixtureAdvancedMuscleGain24w,
  },
  {
    id: "body_recomposition_16w",
    title: "Body recomposition (16 weeks)",
    description: "Fixture-only body recomposition simulation.",
    build: fixtureRecomposition16w,
  },
  {
    id: "general_fitness_limited_baseline",
    title: "General fitness (limited data)",
    description: "Fixture-only general fitness with limited baseline inputs.",
    build: fixtureGeneralFitnessLimitedBaseline,
  },
  {
    id: "med_appetite_decrease",
    title: "Appetite decrease modifier",
    description: "Fixture-only user-reported appetite decrease modifier.",
    build: fixtureMedAppetiteDecrease,
  },
  {
    id: "med_appetite_increase",
    title: "Appetite increase modifier",
    description: "Fixture-only user-reported appetite increase modifier.",
    build: fixtureMedAppetiteIncrease,
  },
  {
    id: "med_energy_decrease",
    title: "Energy decrease modifier",
    description: "Fixture-only user-reported energy decrease modifier.",
    build: fixtureMedEnergyDecrease,
  },
  {
    id: "no_medication_modifier",
    title: "No medication modifier",
    description: "Fixture-only simulation with medicationMayAffectWeight false.",
    build: fixtureNoMedicationEffect,
  },
  {
    id: "missing_body_fat",
    title: "Missing body-fat input",
    description: "Fixture-only simulation without body-fat percentage.",
    build: fixtureMissingBodyFat,
  },
  {
    id: "partial_body_visibility",
    title: "Partial-body visibility",
    description: "Fixture-only partial visibility source-image context.",
    build: fixturePartialBodyVisibility,
  },
  {
    id: "unrealistic_target_moderated",
    title: "Unrealistic target moderated",
    description: "Fixture-only extreme targets moderated by realism bounds.",
    build: fixtureUnrealisticTargetModerated,
  },
]);

const SCENARIO_BY_ID = new Map(
  SHADOW_SCENARIO_REGISTRY.map((entry) => [entry.id, entry] as const)
);

export const DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID =
  "realistic_weight_loss_12w" as const;

const MODERATION_REASON_LABELS: Record<string, string> = {
  timeline_limits_requested_change: "Timeline limits the requested change.",
  muscle_gain_target_exceeds_v1_boundary:
    "Muscle-gain target exceeded the v1 simulator boundary.",
  fat_loss_target_exceeds_v1_boundary:
    "Fat-loss target exceeded the v1 simulator boundary.",
  insufficient_baseline_information: "Baseline information is limited.",
  ambitious_intensity_bounded:
    "Ambitious intensity was kept inside the v1 realism boundary.",
  identity_preservation_boundary: "Change was limited to preserve identity.",
  natural_proportion_boundary:
    "Change was limited to preserve natural proportions.",
};

export function isBodySimulatorShadowEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): boolean {
  return String(env.AI_OS_BODY_SIMULATOR_SHADOW_ENABLED || "").trim() === "1";
}

export function listBodySimulatorShadowScenarios(): BodySimulatorShadowScenarioSummary[] {
  return SHADOW_SCENARIO_REGISTRY.map((entry) => {
    const fixture = entry.build();
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      fixtureSimulationId: fixture.simulationId,
    };
  });
}

export function isAllowlistedBodySimulatorShadowScenarioId(
  scenarioId: string
): boolean {
  return SCENARIO_BY_ID.has(scenarioId);
}

export function getBodySimulatorShadowFixture(
  scenarioId: string
): BodySimulatorInput | null {
  const entry = SCENARIO_BY_ID.get(scenarioId);
  if (!entry) return null;
  return structuredClone(entry.build());
}

function availabilityLabel(
  value: unknown
): "Available" | "Unavailable" | "Unknown" | "Not provided" {
  if (value === undefined) return "Not provided";
  if (value === null) return "Unavailable";
  if (value === "not_provided" || value === "unknown") {
    return value === "unknown" ? "Unknown" : "Not provided";
  }
  return "Available";
}

/**
 * Deterministic fixture → BodySimulatorInput adapter.
 * Preserves unknowns; never invents BF / training / medication facts.
 */
export function adaptBodySimulatorShadowInput(
  fixture: BodySimulatorInput | null
): BodySimulatorShadowInputAdapterResult {
  if (fixture == null || typeof fixture !== "object") {
    return {
      input: null,
      status: "adapter_failed",
      missingInputs: ["fixture"],
      limitations: [],
      diagnostics: ["body_simulator_adapter_missing_fixture"],
    };
  }

  try {
    const input = structuredClone(fixture);
    const missingInputs: string[] = [];
    const limitations: string[] = [];
    const diagnostics: string[] = ["body_simulator_adapter_fixture_only"];

    if (input.profile.currentBodyFatPercent == null) {
      missingInputs.push("profile.currentBodyFatPercent");
      limitations.push("Body-fat percentage not provided in fixture.");
    }
    if (input.profile.trainingExperience === "not_provided") {
      missingInputs.push("profile.trainingExperience");
      limitations.push("Training experience not provided in fixture.");
    }
    if (
      input.medicationEffects == null ||
      typeof input.medicationEffects.medicationMayAffectWeight !== "boolean"
    ) {
      // Preserve unknown — do not invent false/true.
      limitations.push("Medication effect information not provided.");
      diagnostics.push("medication_effect_not_provided");
    } else if (input.medicationEffects.medicationMayAffectWeight === false) {
      diagnostics.push("medication_may_affect_weight_false");
    }

    if (input.bodyAnalysis == null) {
      diagnostics.push("body_analysis_null");
    } else {
      diagnostics.push("body_analysis_fixture_present");
    }

    const readiness = assessBodySimulatorReadiness(input);
    const status: BodySimulatorShadowAdapterStatus =
      readiness.status === "insufficient_input"
        ? "insufficient_input"
        : readiness.status === "ready_with_limitations" ||
            limitations.length > 0
          ? "ready_with_limitations"
          : "ready";

    return {
      input,
      status,
      missingInputs: [
        ...new Set([...missingInputs, ...readiness.missingRequiredInputs]),
      ],
      limitations: [
        ...new Set([...limitations, ...readiness.limitations]),
      ],
      diagnostics,
    };
  } catch {
    return {
      input: null,
      status: "adapter_failed",
      missingInputs: [],
      limitations: [],
      diagnostics: ["body_simulator_adapter_failed"],
    };
  }
}

export function buildBodySimulatorInputSummary(
  input: BodySimulatorInput | null
): BodySimulatorShadowInputSummary | null {
  if (input == null) return null;
  const med = input.medicationEffects;
  return {
    goalType: input.goal?.type ?? null,
    timelineWeeks:
      typeof input.goal?.timelineWeeks === "number"
        ? input.goal.timelineWeeks
        : null,
    intensity: input.goal?.intensity ?? null,
    ageAvailable: availabilityLabel(input.profile?.ageYears),
    heightAvailable: availabilityLabel(input.profile?.heightCm),
    weightAvailable: availabilityLabel(input.profile?.currentWeightKg),
    bodyFatBasis: input.profile?.bodyFatBasis ?? null,
    trainingExperience: input.profile?.trainingExperience ?? null,
    generalActivity: input.activity?.generalActivity ?? null,
    resistanceSessions:
      typeof input.activity?.resistanceTrainingSessionsPerWeek === "number"
        ? input.activity.resistanceTrainingSessionsPerWeek
        : null,
    cardioSessions:
      typeof input.activity?.cardioSessionsPerWeek === "number"
        ? input.activity.cardioSessionsPerWeek
        : null,
    medicationMayAffectWeight:
      typeof med?.medicationMayAffectWeight === "boolean"
        ? med.medicationMayAffectWeight
        : null,
    sourcePhotoView: input.sourceImageContext?.progressPhotoView ?? null,
    bodyAnalysisAvailable: input.bodyAnalysis != null,
    medication: med
      ? {
          medicationMayAffectWeight:
            typeof med.medicationMayAffectWeight === "boolean"
              ? med.medicationMayAffectWeight
              : null,
          appetite: med.appetite ?? null,
          energyLevel: med.energyLevel ?? null,
          metabolismTendency: med.metabolismTendency ?? null,
          muscleBuildingOrPreservation:
            med.muscleBuildingOrPreservation ?? null,
          evidenceOrigin: med.evidence?.origin ?? null,
          evidenceConfidence: med.evidence?.confidence ?? null,
        }
      : null,
  };
}

export function humanizeModerationReason(code: string): string {
  return MODERATION_REASON_LABELS[code] ?? code;
}

function disabledView(
  diagnostics: string[] = ["body_simulator_disabled"]
): ControlRoomBodySimulatorView {
  return {
    enabled: false,
    scenarioId: null,
    status: "disabled",
    inputSummary: null,
    readiness: null,
    rules: null,
    projection: null,
    diagnostics,
    errorCode: "body_simulator_disabled",
  };
}

function notRunView(scenarioId: string | null): ControlRoomBodySimulatorView {
  return {
    enabled: true,
    scenarioId,
    status: "not_run",
    inputSummary: null,
    readiness: null,
    rules: null,
    projection: null,
    diagnostics: ["body_simulator_not_run"],
    errorCode: null,
  };
}

function toShadowResult(
  view: ControlRoomBodySimulatorView
): ShadowBodySimulatorResult {
  if (!view.enabled) {
    return {
      executed: false,
      status: "not_run",
      inputSchemaVersion: null,
      rulesSchemaVersion: null,
      readiness: null,
      rules: null,
      projection: null,
      diagnostics: [...view.diagnostics],
    };
  }
  const status: ShadowBodySimulatorStatus =
    view.status === "disabled" || view.status === "not_run"
      ? view.status === "not_run"
        ? "not_run"
        : "not_run"
      : view.status;
  return {
    executed: view.status !== "not_run" && view.status !== "disabled",
    status,
    inputSchemaVersion: view.rules?.schemaVersion ?? null,
    rulesSchemaVersion: view.rules?.schemaVersion ?? null,
    readiness: view.readiness,
    rules: view.rules,
    projection: view.projection,
    diagnostics: [...view.diagnostics],
  };
}

/**
 * Execute Body Simulator shadow phase exactly once for an allowlisted fixture.
 * Caller supplies enabled explicitly — this module never reads environment state.
 * Safe when disabled — never activates image/network fallback.
 */
export function runBodySimulatorShadowPhase(options: {
  enabled: boolean;
  scenarioId?: string | null;
}): {
  view: ControlRoomBodySimulatorView;
  shadow: ShadowBodySimulatorResult;
} {
  const enabled = options.enabled === true;

  if (!enabled) {
    const view = disabledView();
    return { view, shadow: toShadowResult(view) };
  }

  const requested =
    typeof options?.scenarioId === "string" && options.scenarioId.length > 0
      ? options.scenarioId
      : DEFAULT_BODY_SIMULATOR_SHADOW_SCENARIO_ID;

  if (!isAllowlistedBodySimulatorShadowScenarioId(requested)) {
    const view: ControlRoomBodySimulatorView = {
      enabled: true,
      scenarioId: requested,
      status: "failed",
      inputSummary: null,
      readiness: null,
      rules: null,
      projection: null,
      diagnostics: ["body_simulator_scenario_not_allowlisted"],
      errorCode: "body_simulator_validation_failed",
    };
    return { view, shadow: toShadowResult(view) };
  }

  const fixture = getBodySimulatorShadowFixture(requested);
  const adapted = adaptBodySimulatorShadowInput(fixture);

  if (adapted.status === "adapter_failed" || adapted.input == null) {
    const view: ControlRoomBodySimulatorView = {
      enabled: true,
      scenarioId: requested,
      status: "failed",
      inputSummary: null,
      readiness: null,
      rules: null,
      projection: null,
      diagnostics: [
        ...adapted.diagnostics,
        "body_simulator_execution_failed",
      ],
      errorCode: "body_simulator_execution_failed",
    };
    return { view, shadow: toShadowResult(view) };
  }

  const readiness = assessBodySimulatorReadiness(adapted.input);
  const inputSummary = buildBodySimulatorInputSummary(adapted.input);

  if (!readiness.ready || readiness.status === "insufficient_input") {
    const view: ControlRoomBodySimulatorView = {
      enabled: true,
      scenarioId: requested,
      status: "insufficient_input",
      inputSummary,
      readiness,
      rules: null,
      projection: null,
      diagnostics: [
        ...adapted.diagnostics,
        "body_simulator_insufficient_input",
      ],
      errorCode: "body_simulator_insufficient_input",
    };
    return { view, shadow: toShadowResult(view) };
  }

  let simResult;
  try {
    simResult = simulateBodyTransformation(adapted.input);
  } catch {
    const view: ControlRoomBodySimulatorView = {
      enabled: true,
      scenarioId: requested,
      status: "failed",
      inputSummary,
      readiness,
      rules: null,
      projection: null,
      diagnostics: [
        ...adapted.diagnostics,
        "body_simulator_execution_failed",
      ],
      errorCode: "body_simulator_execution_failed",
    };
    return { view, shadow: toShadowResult(view) };
  }

  if (!simResult.ok) {
    const view: ControlRoomBodySimulatorView = {
      enabled: true,
      scenarioId: requested,
      status: "failed",
      inputSummary,
      readiness,
      rules: null,
      projection: null,
      diagnostics: [
        ...adapted.diagnostics,
        "body_simulator_validation_failed",
        ...simResult.errors.map((e) => `${e.path}:${e.code}`),
      ],
      errorCode: "body_simulator_validation_failed",
    };
    return { view, shadow: toShadowResult(view) };
  }

  let projection: BodySimulatorSafeProjection | null = null;
  try {
    projection = projectBodySimulatorRules(simResult.rules);
  } catch {
    const view: ControlRoomBodySimulatorView = {
      enabled: true,
      scenarioId: requested,
      status: "failed",
      inputSummary,
      readiness,
      rules: structuredClone(simResult.rules),
      projection: null,
      diagnostics: [
        ...adapted.diagnostics,
        "body_simulator_projection_failed",
      ],
      errorCode: "body_simulator_projection_failed",
    };
    return { view, shadow: toShadowResult(view) };
  }

  const status: ControlRoomBodySimulatorStatus =
    readiness.status === "ready_with_limitations" ||
    adapted.status === "ready_with_limitations"
      ? "ready_with_limitations"
      : "succeeded";

  const view: ControlRoomBodySimulatorView = {
    enabled: true,
    scenarioId: requested,
    status,
    inputSummary,
    readiness,
    rules: structuredClone(simResult.rules),
    projection,
    diagnostics: [
      ...adapted.diagnostics,
      "body_simulator_executed_once",
      status,
    ],
    errorCode: null,
  };
  return { view, shadow: toShadowResult(view) };
}

/** Build a disabled/not-run placeholder without executing the simulator. */
export function buildBodySimulatorShadowPlaceholder(options?: {
  enabled?: boolean;
  scenarioId?: string | null;
}): ControlRoomBodySimulatorView {
  const enabled = options?.enabled === true;
  if (!enabled) return disabledView();
  return notRunView(options?.scenarioId ?? null);
}
