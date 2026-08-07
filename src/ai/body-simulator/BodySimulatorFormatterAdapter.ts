/**
 * Body Simulator → Formatter input adapter (Demand 022B).
 *
 * Translates canonical BodySimulatorTransformationRules into the existing
 * RenderPlan transformation surface (approvedChanges / visibility).
 *
 * Translate only — no physiology calculation, estimation, moderation, or
 * reinterpretation of simulator intent. Preservation metadata is passed
 * through unchanged for inspection; identity/scene flags stay on RenderPlan.
 */

import type { RenderChange, RenderPlan } from "../render/RenderPlan";
import type {
  AnatomicalChangeDirection,
  AnatomicalMagnitude,
  AnatomicalTransformationRule,
} from "./AnatomicalTransformationTypes";
import type {
  BodySimulationIntensity,
  BodySimulatorRegionRule,
  BodySimulatorTransformationRules,
  RegionFatChange,
  RegionMuscleChange,
  SimulationRange,
} from "./BodySimulatorTypes";

export const CANONICAL_BODY_TRANSFORMATION_SCHEMA_VERSION = 1 as const;
export const CANONICAL_BODY_TRANSFORMATION_SOURCE =
  "body_simulator_v1" as const;

export type CanonicalChangeVisibility =
  | "restrained"
  | "clear"
  | "pronounced";

/**
 * Formatter-facing transformation package derived 1:1 from Body Simulator rules.
 * Consumed by applyCanonicalBodyTransformation / AiOsRuntime preview path.
 */
export interface CanonicalBodyTransformation {
  schemaVersion: typeof CANONICAL_BODY_TRANSFORMATION_SCHEMA_VERSION;
  source: typeof CANONICAL_BODY_TRANSFORMATION_SOURCE;
  rulesVersion: string;
  simulationId: string;

  goal: {
    requestedType: string;
    effectiveType: string;
    timelineWeeks: number;
    intensity: BodySimulationIntensity;
  };

  visualIntensity: string;
  changeVisibility: CanonicalChangeVisibility;
  approvedChanges: RenderChange[];

  /** Passthrough from Body Simulator — never modified by the adapter. */
  preservation: BodySimulatorTransformationRules["preservation"];

  wholeBodySummary: string;
  regionalSummaries: string[];

  /** Anatomical rule summaries when Demand 022D result is present. */
  anatomicalSummaries: string[];

  /** Secondary semantic support only — never primary transformation intent. */
  semanticSupportTerms: string[];

  realism: {
    requestedTargetModerated: boolean;
    unrealisticChangePrevented: boolean;
    expectedVisualizationNotGuarantee: true;
    moderationReasons: string[];
  };

  confidenceOverall: string;
}

export interface FormatterInputInspectionView {
  receivedCanonicalRules: {
    simulationId: string;
    rulesVersion: string;
    goalType: string;
    timelineWeeks: number;
    intensity: string;
    regionCount: number;
  };
  generatedFormatterObject: {
    source: string;
    schemaVersion: number;
    visualIntensity: string;
    changeVisibility: string;
    approvedChangeIds: string[];
    approvedChangeCount: number;
  };
  preservationMetadata: BodySimulatorTransformationRules["preservation"];
  summary: string;
}

export interface FormatterPreviewView {
  goal: string;
  timelineWeeks: number;
  intensity: string;
  wholeBodySummary: string;
  regionalSummaries: string[];
  preservationSummary: string;
  promptLength: number | null;
  formatterName: string | null;
  formatterVersion: string | null;
}

function intensityToVisibility(
  intensity: BodySimulationIntensity
): CanonicalChangeVisibility {
  switch (intensity) {
    case "conservative":
      return "restrained";
    case "ambitious":
      return "pronounced";
    case "realistic":
    default:
      return "clear";
  }
}

function formatRange(label: string, range: SimulationRange): string {
  const unit = range.unit === "percentage_points" ? " pp" : ` ${range.unit}`;
  const lower = range.lower == null ? "n/a" : String(range.lower);
  const expected = range.expected == null ? "n/a" : String(range.expected);
  const upper = range.upper == null ? "n/a" : String(range.upper);
  return `${label}: lower ${lower}${unit}, expected ${expected}${unit}, upper ${upper}${unit} (${range.origin})`;
}

function fatChangePhrase(change: RegionFatChange): string {
  switch (change) {
    case "strong_decrease":
      return "strong fat reduction";
    case "moderate_decrease":
      return "moderate fat reduction";
    case "slight_decrease":
      return "slight fat reduction";
    case "stable":
      return "stable fat";
    case "slight_increase":
      return "slight fat increase";
    case "moderate_increase":
      return "moderate fat increase";
    case "unknown":
    default:
      return "unspecified fat change";
  }
}

function muscleChangePhrase(change: RegionMuscleChange): string {
  switch (change) {
    case "moderate_decrease":
      return "moderate muscle decrease";
    case "slight_decrease":
      return "slight muscle decrease";
    case "stable":
      return "stable muscle";
    case "slight_increase":
      return "slight muscle increase";
    case "moderate_increase":
      return "moderate muscle increase";
    case "strong_increase":
      return "strong muscle increase";
    case "unknown":
    default:
      return "unspecified muscle change";
  }
}

function fatToRenderKind(
  change: RegionFatChange
): RenderChange["kind"] | null {
  if (
    change === "strong_decrease" ||
    change === "moderate_decrease" ||
    change === "slight_decrease"
  ) {
    return "fat_reduction";
  }
  if (change === "slight_increase" || change === "moderate_increase") {
    return "fat_increase";
  }
  return null;
}

function muscleToRenderKind(
  change: RegionMuscleChange
): RenderChange["kind"] | null {
  if (
    change === "slight_increase" ||
    change === "moderate_increase" ||
    change === "strong_increase"
  ) {
    return "muscle_development";
  }
  return null;
}

function fatToDirection(change: RegionFatChange): RenderChange["direction"] {
  if (
    change === "strong_decrease" ||
    change === "moderate_decrease" ||
    change === "slight_decrease"
  ) {
    return "decrease";
  }
  if (change === "slight_increase" || change === "moderate_increase") {
    return "increase";
  }
  return "maintain";
}

function muscleToDirection(
  change: RegionMuscleChange
): RenderChange["direction"] {
  if (
    change === "slight_increase" ||
    change === "moderate_increase" ||
    change === "strong_increase"
  ) {
    return "increase";
  }
  if (change === "slight_decrease" || change === "moderate_decrease") {
    return "decrease";
  }
  return "maintain";
}

function regionLabel(region: string): string {
  return region.replace(/_/g, " ");
}

function buildRegionalChange(
  rule: BodySimulatorRegionRule,
  visibility: CanonicalChangeVisibility
): RenderChange | null {
  if (rule.region === "whole_body") {
    return null;
  }
  if (rule.visibility === "not_visible" || rule.visibility === "not_assessable") {
    return null;
  }
  if (rule.fatChange === "stable" && rule.muscleChange === "stable") {
    return null;
  }
  if (rule.fatChange === "unknown" && rule.muscleChange === "unknown") {
    return null;
  }

  const fatKind = fatToRenderKind(rule.fatChange);
  const muscleKind = muscleToRenderKind(rule.muscleChange);
  const kind: RenderChange["kind"] =
    fatKind ?? muscleKind ?? "regional_change";

  let direction: RenderChange["direction"] = "refine";
  if (fatKind != null) {
    direction = fatToDirection(rule.fatChange);
  } else if (muscleKind != null) {
    direction = muscleToDirection(rule.muscleChange);
  }

  const parts = [
    fatChangePhrase(rule.fatChange),
    muscleChangePhrase(rule.muscleChange),
  ];
  const magnitude = rule.visualMagnitude.expected;
  const description = `Apply Body Simulator regional rule for ${regionLabel(rule.region)}: ${parts.join("; ")} (expected visual magnitude ${magnitude}). Preserve natural proportions.`;

  return {
    id: `body-sim-region-${rule.region}`,
    kind,
    direction,
    region: rule.region,
    visibility,
    description,
    sourcePlanField: "bodySimulator.regions",
  };
}

function anatomicalDirectionPhrase(direction: AnatomicalChangeDirection): string {
  return direction.replace(/_/g, " ");
}

function anatomicalMagnitudePhrase(magnitude: AnatomicalMagnitude): string {
  return magnitude;
}

function anatomicalToRenderKind(
  rule: AnatomicalTransformationRule
): RenderChange["kind"] {
  if (
    rule.feature.includes("volume") ||
    rule.feature === "lat_width" ||
    rule.feature === "whole_body_muscle_volume"
  ) {
    return "muscle_development";
  }
  if (
    rule.feature === "subcutaneous_fat" ||
    rule.feature === "waist_width"
  ) {
    if (
      rule.direction.includes("decrease") ||
      rule.direction === "more_defined"
    ) {
      return "fat_reduction";
    }
    if (rule.direction.includes("increase")) {
      return "fat_increase";
    }
  }
  if (
    rule.direction === "more_defined" ||
    rule.feature.includes("definition")
  ) {
    return "regional_change";
  }
  return "regional_change";
}

function anatomicalToDirection(
  direction: AnatomicalChangeDirection
): RenderChange["direction"] {
  if (
    direction.includes("decrease") ||
    direction === "more_defined"
  ) {
    return direction === "more_defined" ? "refine" : "decrease";
  }
  if (direction.includes("increase") || direction === "less_defined") {
    return direction === "less_defined" ? "refine" : "increase";
  }
  if (direction === "stable") return "maintain";
  return "refine";
}

function anatomicalVisibility(
  magnitude: AnatomicalMagnitude,
  fallback: CanonicalChangeVisibility
): CanonicalChangeVisibility {
  switch (magnitude) {
    case "subtle":
      return "restrained";
    case "pronounced":
      return "pronounced";
    case "clear":
      return "clear";
    case "moderate":
    default:
      return fallback;
  }
}

/**
 * Translate anatomical rules → RenderChanges (translate-only).
 * Priority order preserved. No physiology math.
 */
function buildAnatomicalChanges(
  anatomicalRules: AnatomicalTransformationRule[],
  fallbackVisibility: CanonicalChangeVisibility
): { changes: RenderChange[]; summaries: string[] } {
  const changes: RenderChange[] = [];
  const summaries: string[] = [];
  const sorted = [...anatomicalRules].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id)
  );

  for (const rule of sorted) {
    if (rule.direction === "stable" && rule.source === "realism_constraint") {
      summaries.push(
        `${regionLabel(rule.region)} ${rule.feature}: ${anatomicalDirectionPhrase(rule.direction)} (${anatomicalMagnitudePhrase(rule.magnitude)}; source ${rule.source}; priority ${rule.priority})`
      );
      continue;
    }
    const visibility = anatomicalVisibility(rule.magnitude, fallbackVisibility);
    const description = `Apply anatomical ${rule.feature.replace(/_/g, " ")} on ${regionLabel(rule.region)}: ${anatomicalDirectionPhrase(rule.direction)} at ${anatomicalMagnitudePhrase(rule.magnitude)} magnitude (source ${rule.source}, priority ${rule.priority}). Preserve natural proportions and identity.`;
    summaries.push(
      `${regionLabel(rule.region)} ${rule.feature}: ${anatomicalDirectionPhrase(rule.direction)}; ${anatomicalMagnitudePhrase(rule.magnitude)}; priority ${rule.priority}; source ${rule.source}`
    );
    changes.push({
      id: `body-sim-anatomical-${rule.id}`,
      kind: anatomicalToRenderKind(rule),
      direction: anatomicalToDirection(rule.direction),
      region: rule.region,
      visibility,
      description,
      sourcePlanField: "bodySimulator.anatomicalTransformation",
    });
  }

  return { changes, summaries };
}

function buildWholeBodyChanges(
  rules: BodySimulatorTransformationRules,
  visibility: CanonicalChangeVisibility
): RenderChange[] {
  const changes: RenderChange[] = [];
  const wb = rules.wholeBodyChange;
  const goalType = rules.goal.effectiveType;

  changes.push({
    id: "body-sim-whole-body",
    kind: "whole_body_recomposition",
    direction: "refine",
    visibility,
    description: `Apply Body Simulator whole-body ${goalType.replace(/_/g, " ")} over ${rules.goal.timelineWeeks} weeks at ${rules.goal.intensity} intensity. ${formatRange("Weight", wb.weightChangeKg)}. ${formatRange("Body fat", wb.bodyFatChangePercentagePoints)}. ${formatRange("Muscle", wb.muscleChangeKg)}. Expected visualization is not a guarantee.`,
    sourcePlanField: "bodySimulator.wholeBodyChange",
  });

  const fatExpected = wb.bodyFatChangePercentagePoints.expected;
  if (typeof fatExpected === "number" && fatExpected < 0) {
    changes.push({
      id: "body-sim-fat-reduction",
      kind: "fat_reduction",
      direction: "decrease",
      visibility,
      description: `Reduce visible soft tissue consistent with Body Simulator body-fat change (expected ${fatExpected} percentage points). Preserve natural anatomy and source identity.`,
      sourcePlanField: "bodySimulator.wholeBodyChange.bodyFatChangePercentagePoints",
    });
  } else if (typeof fatExpected === "number" && fatExpected > 0) {
    changes.push({
      id: "body-sim-fat-increase",
      kind: "fat_increase",
      direction: "increase",
      visibility,
      description: `Increase soft-tissue fullness modestly consistent with Body Simulator body-fat change (expected ${fatExpected} percentage points). Preserve natural anatomy and source identity.`,
      sourcePlanField: "bodySimulator.wholeBodyChange.bodyFatChangePercentagePoints",
    });
  }

  const muscleExpected = wb.muscleChangeKg.expected;
  if (typeof muscleExpected === "number" && muscleExpected > 0) {
    changes.push({
      id: "body-sim-muscle-development",
      kind: "muscle_development",
      direction: "increase",
      visibility,
      description: `Add proportional muscle development consistent with Body Simulator muscle change (expected ${muscleExpected} kg). Preserve the original skeletal frame.`,
      sourcePlanField: "bodySimulator.wholeBodyChange.muscleChangeKg",
    });
  }

  return changes;
}

/**
 * Translate Body Simulator Transformation Rules → CanonicalBodyTransformation.
 * Deterministic. Does not mutate input. Does not recalculate physiology.
 * Prefer anatomical rules when present; broad region mapping is deprecated fallback.
 */
export function adaptBodySimulatorRulesToFormatterInput(
  rules: BodySimulatorTransformationRules
): CanonicalBodyTransformation {
  const visibility = intensityToVisibility(rules.goal.intensity);
  const approvedChanges: RenderChange[] = [
    ...buildWholeBodyChanges(rules, visibility),
  ];

  const regionalSummaries: string[] = [];
  for (const region of rules.regions) {
    regionalSummaries.push(
      `${regionLabel(region.region)}: ${fatChangePhrase(region.fatChange)}; ${muscleChangePhrase(region.muscleChange)}; magnitude expected ${region.visualMagnitude.expected}; visibility ${region.visibility}`
    );
  }

  const anatomical = rules.anatomicalTransformation;
  let anatomicalSummaries: string[] = [];
  const semanticSupportTerms = anatomical?.semanticSupportTerms
    ? [...anatomical.semanticSupportTerms]
    : [];

  if (anatomical && anatomical.rules.length > 0) {
    const { changes, summaries } = buildAnatomicalChanges(
      anatomical.rules,
      visibility
    );
    approvedChanges.push(...changes);
    anatomicalSummaries = summaries;
  } else {
    // Deprecated compatibility fallback for old fixtures / missing anatomical block only.
    for (const region of rules.regions) {
      const regional = buildRegionalChange(region, visibility);
      if (regional) {
        approvedChanges.push(regional);
      }
    }
  }

  const wholeBodySummary = [
    formatRange("Weight", rules.wholeBodyChange.weightChangeKg),
    formatRange("Body fat", rules.wholeBodyChange.bodyFatChangePercentagePoints),
    formatRange("Muscle", rules.wholeBodyChange.muscleChangeKg),
    `confidence ${rules.wholeBodyChange.confidence}`,
  ].join(" | ");

  return {
    schemaVersion: CANONICAL_BODY_TRANSFORMATION_SCHEMA_VERSION,
    source: CANONICAL_BODY_TRANSFORMATION_SOURCE,
    rulesVersion: rules.rulesVersion,
    simulationId: rules.simulationId,
    goal: {
      requestedType: rules.goal.requestedType,
      effectiveType: rules.goal.effectiveType,
      timelineWeeks: rules.goal.timelineWeeks,
      intensity: rules.goal.intensity,
    },
    visualIntensity: rules.goal.intensity,
    changeVisibility: visibility,
    approvedChanges,
    preservation: structuredClone(rules.preservation),
    wholeBodySummary,
    regionalSummaries,
    anatomicalSummaries,
    semanticSupportTerms,
    realism: {
      requestedTargetModerated: rules.realism.requestedTargetModerated,
      unrealisticChangePrevented: rules.realism.unrealisticChangePrevented,
      expectedVisualizationNotGuarantee: true,
      moderationReasons: [...rules.realism.moderationReasons],
    },
    confidenceOverall: rules.confidence.overall,
  };
}

/**
 * Apply canonical Body Simulator transformation onto a RenderPlan clone.
 * Replaces transformation approvedChanges / visibility / visualIntensity only.
 * Leaves identity, scene, anatomy, realism, and exclusions unchanged.
 */
export function applyCanonicalBodyTransformation(
  renderPlan: RenderPlan,
  canonical: CanonicalBodyTransformation
): RenderPlan {
  const next: RenderPlan = structuredClone(renderPlan);
  next.transformation = {
    visualIntensity: canonical.visualIntensity,
    changeVisibility: canonical.changeVisibility,
    approvedChanges: structuredClone(canonical.approvedChanges),
  };
  next.trace = {
    ...next.trace,
    transformationRulesVersion: canonical.rulesVersion,
  };
  return next;
}

export function buildFormatterInputInspectionView(
  rules: BodySimulatorTransformationRules,
  canonical: CanonicalBodyTransformation
): FormatterInputInspectionView {
  return {
    receivedCanonicalRules: {
      simulationId: rules.simulationId,
      rulesVersion: rules.rulesVersion,
      goalType: rules.goal.effectiveType,
      timelineWeeks: rules.goal.timelineWeeks,
      intensity: rules.goal.intensity,
      regionCount: rules.regions.length,
    },
    generatedFormatterObject: {
      source: canonical.source,
      schemaVersion: canonical.schemaVersion,
      visualIntensity: canonical.visualIntensity,
      changeVisibility: canonical.changeVisibility,
      approvedChangeIds: canonical.approvedChanges.map((c) => c.id),
      approvedChangeCount: canonical.approvedChanges.length,
    },
    preservationMetadata: structuredClone(rules.preservation),
    summary: `Body Simulator ${rules.goal.effectiveType} / ${rules.goal.timelineWeeks}w / ${rules.goal.intensity} → ${canonical.approvedChanges.length} approved formatter changes (${canonical.changeVisibility} visibility).`,
  };
}

export function buildFormatterPreviewView(options: {
  canonical: CanonicalBodyTransformation;
  promptLength?: number | null;
  formatterName?: string | null;
  formatterVersion?: string | null;
}): FormatterPreviewView {
  const { canonical } = options;
  const preservationKeys = Object.keys(canonical.preservation);
  return {
    goal: canonical.goal.effectiveType,
    timelineWeeks: canonical.goal.timelineWeeks,
    intensity: canonical.goal.intensity,
    wholeBodySummary: canonical.wholeBodySummary,
    regionalSummaries: [...canonical.regionalSummaries],
    preservationSummary: `${preservationKeys.length} preservation keys (all preserve)`,
    promptLength:
      typeof options.promptLength === "number" ? options.promptLength : null,
    formatterName: options.formatterName ?? null,
    formatterVersion: options.formatterVersion ?? null,
  };
}

/** Fixed Control Room / Image Preview scenario → Body Simulator shadow fixture. */
export const CONTROL_ROOM_TO_BODY_SIMULATOR_SCENARIO: Readonly<
  Record<string, string>
> = Object.freeze({
  balanced_recomposition_12w: "body_recomposition_16w",
  upper_body_definition_8w: "fat_loss_muscle_preservation",
  gradual_fat_loss_16w: "realistic_weight_loss_12w",
  athletic_strength_24w: "advanced_muscle_gain_24w",
});

export function resolveBodySimulatorScenarioForPreview(
  controlRoomScenarioId: string,
  overrideScenarioId?: string | null
): string {
  if (
    typeof overrideScenarioId === "string" &&
    overrideScenarioId.trim().length > 0
  ) {
    return overrideScenarioId.trim();
  }
  return (
    CONTROL_ROOM_TO_BODY_SIMULATOR_SCENARIO[controlRoomScenarioId] ??
    "realistic_weight_loss_12w"
  );
}
