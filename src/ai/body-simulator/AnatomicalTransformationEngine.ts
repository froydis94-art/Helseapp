/**
 * Anatomical Transformation Engine v2 (Demand 022D).
 *
 * Deterministic anatomical intent from Body Simulator inputs.
 * No prompts, provider calls, or physiology recalculation for formatter.
 */

import type { BodyAnalysisConfidence } from "../body-analysis/types";
import { transformProgress } from "../progressCurve";
import type { BodySimulatorInput, BodySimulatorRegion } from "./BodySimulatorTypes";
import {
  BODY_SIM_TIMELINE_MAGNITUDE_SCALE,
  BODY_SIM_TIMELINE_MIN_RELATIVE_MAGNITUDE,
  BODY_SIM_WEEKS_PER_MONTH,
} from "./BodySimulatorRules";
import {
  ANATOMICAL_BF_DELTA_CLEAR_PP,
  ANATOMICAL_BF_DELTA_MODEST_PP,
  ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP,
  ANATOMICAL_BF_DELTA_SUBSTANTIAL_GAIN_PP,
  ANATOMICAL_FAT_GAIN_WAIST_CAP_SCORE,
  ANATOMICAL_FOCUS_FEATURE_MAP,
  ANATOMICAL_FOCUS_PRIORITY_BOOST,
  ANATOMICAL_MUSCLE_VOLUME_REGIONS,
  ANATOMICAL_PRIORITY_BODY_FAT,
  ANATOMICAL_PRIORITY_FOCUS,
  ANATOMICAL_PRIORITY_GOAL,
  ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
  ANATOMICAL_PRIORITY_PRESERVATION,
  clamp01,
  effortCoefficientForIntensity,
  magnitudeFromScore,
  magnitudeOrdinal,
  scaleMagnitude,
} from "./AnatomicalTransformationRules";
import type {
  AnatomicalChangeDirection,
  AnatomicalFeature,
  AnatomicalMagnitude,
  AnatomicalRuleSource,
  AnatomicalSuppressionReason,
  AnatomicalTransformationResult,
  AnatomicalTransformationRule,
  BodySimulatorFocusZone,
  MuscleGainMode,
  OptionalNoteOutcome,
} from "./AnatomicalTransformationTypes";
import { ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION } from "./AnatomicalTransformationTypes";
import { validateGoalConsistency } from "./GoalConsistencyValidator";

export interface BodyFatContext {
  currentPercent: number | null;
  targetPercent: number | null;
  deltaPercentagePoints: number | null;
}

function anatomicalTimelineRelativeMagnitude(timelineWeeks: number): number {
  const months = timelineWeeks / BODY_SIM_WEEKS_PER_MONTH;
  const progressFraction = transformProgress(months);
  return Math.max(
    BODY_SIM_TIMELINE_MIN_RELATIVE_MAGNITUDE,
    progressFraction * BODY_SIM_TIMELINE_MAGNITUDE_SCALE
  );
}

function rule(
  partial: Omit<AnatomicalTransformationRule, "confidenceReasons" | "limitations"> & {
    confidenceReasons?: string[];
    limitations?: string[];
  }
): AnatomicalTransformationRule {
  return {
    ...partial,
    confidenceReasons: partial.confidenceReasons ?? [],
    limitations: partial.limitations ?? [],
  };
}

export function resolveBodyFatContext(input: BodySimulatorInput): BodyFatContext {
  const current = input.profile.currentBodyFatPercent;
  const absolute =
    input.goal.targetBodyFatPercent !== undefined &&
    input.goal.targetBodyFatPercent !== null
      ? input.goal.targetBodyFatPercent
      : null;

  if (current != null && absolute != null) {
    return {
      currentPercent: current,
      targetPercent: absolute,
      deltaPercentagePoints: absolute - current,
    };
  }

  const change = input.goal.targetBodyFatChangePercentagePoints;
  if (current != null && change != null) {
    return {
      currentPercent: current,
      targetPercent: current + change,
      deltaPercentagePoints: change,
    };
  }

  if (change != null) {
    return {
      currentPercent: current,
      targetPercent: null,
      deltaPercentagePoints: change,
    };
  }

  return {
    currentPercent: current,
    targetPercent: absolute,
    deltaPercentagePoints: null,
  };
}

export function deriveMuscleGainMode(
  input: BodySimulatorInput,
  bf: BodyFatContext
): MuscleGainMode {
  const goal = input.goal.type;
  const muscleTarget = input.goal.targetMuscleChangeKg;
  const wantsMuscle =
    goal === "muscle_gain" ||
    goal === "body_recomposition" ||
    (muscleTarget != null && muscleTarget > 0);

  if (!wantsMuscle) {
    return "not_applicable";
  }

  const delta = bf.deltaPercentagePoints;
  if (delta == null) {
    return goal === "muscle_gain" || goal === "body_recomposition"
      ? "mixed_bulk"
      : "not_applicable";
  }

  if (delta <= ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP) {
    return "lean_bulk";
  }
  if (delta >= ANATOMICAL_BF_DELTA_SUBSTANTIAL_GAIN_PP) {
    return "fat_gain_bulk";
  }
  if (delta > ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP) {
    return "mixed_bulk";
  }
  return "lean_bulk";
}

function featureKey(region: BodySimulatorRegion, feature: AnatomicalFeature): string {
  return `${region}::${feature}`;
}

function directionConflict(
  a: AnatomicalChangeDirection,
  b: AnatomicalChangeDirection
): boolean {
  const dec = new Set([
    "strong_decrease",
    "moderate_decrease",
    "slight_decrease",
    "more_defined",
  ]);
  const inc = new Set([
    "strong_increase",
    "moderate_increase",
    "slight_increase",
    "less_defined",
  ]);
  // more_defined vs fat increase conflict handled separately
  if (a === "stable" || b === "stable" || a === "unknown" || b === "unknown") {
    return false;
  }
  if (a === b) return false;
  const aDec = dec.has(a) || a === "more_defined";
  const bDec = dec.has(b) || b === "more_defined";
  const aInc = inc.has(a) || a === "less_defined";
  const bInc = inc.has(b) || b === "less_defined";
  // definition increase conflicts with fat increase on subcutaneous_fat / waist
  if ((a === "more_defined" && bInc) || (b === "more_defined" && aInc)) {
    return true;
  }
  return (aDec && bInc) || (aInc && bDec);
}

function suppressionReasonFor(
  winner: AnatomicalTransformationRule,
  loser: AnatomicalTransformationRule
): AnatomicalSuppressionReason {
  if (
    winner.source === "realism_constraint" ||
    loser.source === "realism_constraint"
  ) {
    return "realism_boundary";
  }
  if (winner.source === "body_fat_delta" || loser.source === "body_fat_delta") {
    return "body_fat_direction_conflict";
  }
  if (loser.source === "optional_note") {
    return "optional_note_conflict";
  }
  if (winner.source === "goal" || loser.source === "goal") {
    return "goal_conflict";
  }
  return "lower_priority_conflict";
}

function resolveConflicts(rules: AnatomicalTransformationRule[]): {
  applied: AnatomicalTransformationRule[];
  suppressed: AnatomicalTransformationRule[];
  reasons: Record<string, AnatomicalSuppressionReason | string>;
} {
  const byFeature = new Map<string, AnatomicalTransformationRule[]>();
  for (const r of rules) {
    const key = featureKey(r.region, r.feature);
    const list = byFeature.get(key) ?? [];
    list.push(r);
    byFeature.set(key, list);
  }

  const applied: AnatomicalTransformationRule[] = [];
  const suppressed: AnatomicalTransformationRule[] = [];
  const reasons: Record<string, AnatomicalSuppressionReason | string> = {};

  for (const group of byFeature.values()) {
    if (group.length === 1) {
      applied.push(group[0]!);
      continue;
    }
    const sorted = [...group].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id.localeCompare(b.id);
    });
    const winner = sorted[0]!;
    applied.push(winner);
    for (let i = 1; i < sorted.length; i++) {
      const loser = sorted[i]!;
      if (
        !directionConflict(winner.direction, loser.direction) &&
        winner.direction === loser.direction &&
        magnitudeOrdinal(loser.magnitude) <= magnitudeOrdinal(winner.magnitude)
      ) {
        // Compatible reinforce — keep winner only; record suppression as lower priority
        suppressed.push(loser);
        reasons[loser.id] = "lower_priority_conflict";
        continue;
      }
      suppressed.push(loser);
      reasons[loser.id] = suppressionReasonFor(winner, loser);
    }
  }

  applied.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return { applied, suppressed, reasons };
}

function buildFatDrivenRules(
  bf: BodyFatContext,
  baseMagnitude: AnatomicalMagnitude,
  confidence: BodyAnalysisConfidence,
  preserveMuscleVolume: boolean,
  allowVolumeIncrease: boolean
): AnatomicalTransformationRule[] {
  const delta = bf.deltaPercentagePoints;
  if (delta == null || Math.abs(delta) < ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP) {
    return [];
  }

  const abs = Math.abs(delta);
  const losing = delta < 0;
  let fatDir: AnatomicalChangeDirection;
  let defDir: AnatomicalChangeDirection;
  let mag = baseMagnitude;

  if (abs < ANATOMICAL_BF_DELTA_MODEST_PP) {
    fatDir = losing ? "slight_decrease" : "slight_increase";
    defDir = losing ? "more_defined" : "less_defined";
    mag = scaleMagnitude(baseMagnitude, 0.85);
  } else if (abs < ANATOMICAL_BF_DELTA_CLEAR_PP) {
    fatDir = losing ? "moderate_decrease" : "moderate_increase";
    defDir = losing ? "more_defined" : "less_defined";
  } else {
    fatDir = losing ? "strong_decrease" : "moderate_increase";
    defDir = losing ? "more_defined" : "less_defined";
    if (!losing) {
      // Cap fat-gain waist exaggeration
      mag = magnitudeFromScore(
        Math.min(
          magnitudeOrdinal(baseMagnitude) / 4,
          ANATOMICAL_FAT_GAIN_WAIST_CAP_SCORE
        )
      );
    }
  }

  const reasons = ["body_fat_delta_driver"];
  const limitations = [
    "Body-fat percentage is a simulation input with explicit provenance, not a medical measurement.",
  ];

  const out: AnatomicalTransformationRule[] = [];

  const add = (
    id: string,
    region: BodySimulatorRegion,
    feature: AnatomicalFeature,
    direction: AnatomicalChangeDirection,
    magnitude: AnatomicalMagnitude = mag
  ) => {
    out.push(
      rule({
        id,
        region,
        feature,
        direction,
        magnitude,
        priority: ANATOMICAL_PRIORITY_BODY_FAT,
        source: "body_fat_delta",
        confidence,
        confidenceReasons: reasons,
        limitations,
      })
    );
  };

  if (losing) {
    // Single abdomen subcutaneous_fat rule — stronger label when clear delta (e.g. 18→12)
    add(
      "bf-abdomen-fat",
      "abdomen",
      "subcutaneous_fat",
      abs >= ANATOMICAL_BF_DELTA_CLEAR_PP ? "strong_decrease" : fatDir,
      mag
    );
    add("bf-waist-width", "waist_and_flanks", "waist_width", fatDir);
    add("bf-abd-def", "abdomen", "abdominal_definition", defDir);
    if (abs >= ANATOMICAL_BF_DELTA_CLEAR_PP) {
      add("bf-oblique-def", "waist_and_flanks", "oblique_definition", defDir);
      add("bf-chest-def", "chest_and_upper_torso", "chest_definition", defDir);
      add("bf-shoulder-def", "shoulders", "shoulder_definition", defDir);
      add("bf-whole-def", "whole_body", "whole_body_definition", defDir);
      // Provenance alias for lower-abdominal emphasis (same feature resolved via priority)
      add(
        "bf-lower-abd-emphasis",
        "waist_and_flanks",
        "subcutaneous_fat",
        "moderate_decrease",
        mag
      );
    } else {
      add("bf-chest-def-modest", "chest_and_upper_torso", "chest_definition", defDir);
      add("bf-shoulder-def-modest", "shoulders", "shoulder_definition", defDir);
    }

    if (preserveMuscleVolume && !allowVolumeIncrease) {
      // Reveal definition — do not shrink muscle volume (non–muscle-gain paths)
      for (const region of ANATOMICAL_MUSCLE_VOLUME_REGIONS) {
        const feature: AnatomicalFeature =
          region === "shoulders"
            ? "shoulder_volume"
            : region === "chest_and_upper_torso"
              ? "chest_volume"
              : region === "arms"
                ? "arm_volume"
                : region === "glutes"
                  ? "glute_volume"
                  : region === "thighs"
                    ? "thigh_volume"
                    : region === "upper_back"
                      ? "lat_width"
                      : "whole_body_muscle_volume";
        out.push(
          rule({
            id: `bf-preserve-vol-${region}`,
            region,
            feature: feature === "lat_width" ? "lat_width" : feature,
            direction: "stable",
            magnitude: "subtle",
            priority: ANATOMICAL_PRIORITY_PRESERVATION,
            source: "realism_constraint",
            confidence,
            confidenceReasons: ["muscle_volume_preserved_during_fat_loss"],
            limitations: [
              "Fat loss reveals existing muscle definition; volume is not arbitrarily reduced.",
            ],
          })
        );
      }
    }
    if (preserveMuscleVolume || allowVolumeIncrease) {
      out.push(
        rule({
          id: "bf-no-synthetic-abs",
          region: "abdomen",
          feature: "abdominal_definition",
          direction: "more_defined",
          magnitude: abs >= ANATOMICAL_BF_DELTA_CLEAR_PP ? mag : scaleMagnitude(mag, 0.9),
          // Below body-fat driver so BF definition rules win; still blocks etched extremes via limitations
          priority: ANATOMICAL_PRIORITY_BODY_FAT - 20,
          source: "realism_constraint",
          confidence,
          confidenceReasons: ["definition_from_fat_loss_not_etched"],
          limitations: [
            "Avoid exaggerated six-pack carving or synthetic etched abs.",
          ],
        })
      );
    }
  } else {
    // Fat increase — modest fullness, no extreme belly (capped in-rule; no competing realism twin)
    const cappedFatDir: AnatomicalChangeDirection =
      abs >= ANATOMICAL_BF_DELTA_SUBSTANTIAL_GAIN_PP
        ? "moderate_increase"
        : "slight_increase";
    out.push(
      rule({
        id: "bf-gain-subq",
        region: "abdomen",
        feature: "subcutaneous_fat",
        direction: cappedFatDir,
        magnitude: magnitudeFromScore(ANATOMICAL_FAT_GAIN_WAIST_CAP_SCORE),
        priority: ANATOMICAL_PRIORITY_BODY_FAT,
        source: "body_fat_delta",
        confidence,
        confidenceReasons: ["body_fat_delta_driver", "fat_gain_waist_capped"],
        limitations: [
          "Target body-fat increase does not automatically generate extreme abdominal protrusion.",
          "Body-fat percentage is a simulation input with explicit provenance, not a medical measurement.",
        ],
      })
    );
    add(
      "bf-gain-waist",
      "waist_and_flanks",
      "waist_width",
      cappedFatDir,
      magnitudeFromScore(ANATOMICAL_FAT_GAIN_WAIST_CAP_SCORE)
    );
  }

  return out;
}

function muscleVolumeFeature(
  region: (typeof ANATOMICAL_MUSCLE_VOLUME_REGIONS)[number]
): AnatomicalFeature {
  switch (region) {
    case "shoulders":
      return "shoulder_volume";
    case "chest_and_upper_torso":
      return "chest_volume";
    case "upper_back":
      return "lat_width";
    case "arms":
      return "arm_volume";
    case "glutes":
      return "glute_volume";
    case "thighs":
      return "thigh_volume";
    case "lower_legs":
      return "lower_leg_definition";
    default:
      return "whole_body_muscle_volume";
  }
}

function buildMuscleRules(
  input: BodySimulatorInput,
  mode: MuscleGainMode,
  baseMagnitude: AnatomicalMagnitude,
  confidence: BodyAnalysisConfidence
): AnatomicalTransformationRule[] {
  if (mode === "not_applicable") {
    if (
      input.goal.type === "fat_loss_with_muscle_preservation" ||
      input.goal.type === "general_fitness_improvement"
    ) {
      return [
        rule({
          id: "goal-muscle-preserve",
          region: "whole_body",
          feature: "whole_body_muscle_volume",
          direction: "stable",
          magnitude: "subtle",
          priority: ANATOMICAL_PRIORITY_GOAL,
          source: "goal",
          confidence,
          confidenceReasons: ["muscle_preservation_goal"],
        }),
      ];
    }
    return [];
  }

  const out: AnatomicalTransformationRule[] = [];
  const volDir: AnatomicalChangeDirection =
    magnitudeOrdinal(baseMagnitude) >= 3 ? "moderate_increase" : "slight_increase";

  for (const region of ANATOMICAL_MUSCLE_VOLUME_REGIONS) {
    out.push(
      rule({
        id: `mg-vol-${region}`,
        region,
        feature: muscleVolumeFeature(region),
        direction: volDir,
        magnitude: baseMagnitude,
        priority: ANATOMICAL_PRIORITY_GOAL,
        source: "goal",
        confidence,
        confidenceReasons: ["muscle_volume_from_goal"],
        limitations: [
          "Muscle gain changes muscle volume, not skeletal width, height, or hand/foot scale.",
        ],
      })
    );
  }

  out.push(
    rule({
      id: "mg-whole-volume",
      region: "whole_body",
      feature: "whole_body_muscle_volume",
      direction: volDir,
      magnitude: baseMagnitude,
      priority: ANATOMICAL_PRIORITY_GOAL,
      source: "goal",
      confidence,
      confidenceReasons: ["muscle_volume_from_goal"],
    })
  );

  // No automatic abdominal fat from muscle gain
  out.push(
    rule({
      id: "mg-no-auto-abd-fat",
      region: "abdomen",
      feature: "subcutaneous_fat",
      direction: mode === "lean_bulk" ? "stable" : mode === "mixed_bulk" ? "slight_increase" : "moderate_increase",
      magnitude:
        mode === "fat_gain_bulk"
          ? scaleMagnitude(baseMagnitude, 0.85)
          : "subtle",
      priority: ANATOMICAL_PRIORITY_GOAL - 10,
      source: "goal",
      confidence,
      confidenceReasons: [`muscle_gain_mode_${mode}`],
      limitations: [
        "Muscle gain does not automatically enlarge the abdomen with fat unless body-fat target supports it.",
      ],
    })
  );

  if (mode === "lean_bulk") {
    out.push(
      rule({
        id: "mg-lean-waist",
        region: "waist_and_flanks",
        feature: "waist_width",
        direction: "stable",
        magnitude: "subtle",
        priority: ANATOMICAL_PRIORITY_GOAL,
        source: "goal",
        confidence,
        confidenceReasons: ["lean_bulk_controlled_waist"],
        limitations: ["Lean bulk keeps waist approximately stable or slightly reduced."],
      })
    );
    out.push(
      rule({
        id: "mg-lean-abd-def",
        region: "abdomen",
        feature: "abdominal_definition",
        direction: "stable",
        magnitude: "subtle",
        priority: ANATOMICAL_PRIORITY_GOAL,
        source: "goal",
        confidence,
        confidenceReasons: ["lean_bulk_definition_stable"],
      })
    );
  }

  return out;
}

function applyFocusZoneBoosts(
  rules: AnatomicalTransformationRule[],
  focusZones: BodySimulatorFocusZone[]
): AnatomicalTransformationRule[] {
  if (focusZones.length === 0) return rules;
  const focused = new Set<AnatomicalFeature>();
  for (const z of focusZones) {
    for (const f of ANATOMICAL_FOCUS_FEATURE_MAP[z] ?? []) {
      focused.add(f);
    }
  }
  if (focused.size === 0) return rules;

  return rules.map((r) => {
    if (!focused.has(r.feature)) return r;
    // Focus cannot override BF direction or preservation sources
    if (r.source === "body_fat_delta" || r.source === "realism_constraint") {
      return {
        ...r,
        priority: r.priority + Math.floor(ANATOMICAL_FOCUS_PRIORITY_BOOST / 2),
        confidenceReasons: [...r.confidenceReasons, "focus_zone_reinforced"],
      };
    }
    return {
      ...r,
      priority: Math.max(
        r.priority,
        ANATOMICAL_PRIORITY_FOCUS + ANATOMICAL_FOCUS_PRIORITY_BOOST
      ),
      confidenceReasons: [...r.confidenceReasons, "focus_zone_priority_boost"],
    };
  });
}

function addFocusDerivedRules(
  focusZones: BodySimulatorFocusZone[],
  baseMagnitude: AnatomicalMagnitude,
  confidence: BodyAnalysisConfidence,
  bfDelta: number | null
): AnatomicalTransformationRule[] {
  const out: AnatomicalTransformationRule[] = [];
  const losingFat =
    bfDelta != null && bfDelta <= -ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP;

  for (const zone of focusZones) {
    if (zone === "posture") {
      out.push(
        rule({
          id: "focus-posture-no-skeletal",
          region: "whole_body",
          feature: "whole_body_definition",
          direction: "stable",
          magnitude: "subtle",
          priority: ANATOMICAL_PRIORITY_PRESERVATION,
          source: "focus_zone",
          confidence,
          confidenceReasons: ["posture_no_skeletal_change"],
          limitations: [
            "Posture focus does not alter skeletal structure in Anatomical Transformation v2.",
          ],
        })
      );
      continue;
    }
    for (const feature of ANATOMICAL_FOCUS_FEATURE_MAP[zone]) {
      const isVolume = feature.includes("volume") || feature === "lat_width";
      const direction: AnatomicalChangeDirection = isVolume
        ? "slight_increase"
        : losingFat
          ? "more_defined"
          : "slight_increase";
      // Focus must not reverse fat direction on waist/subcutaneous_fat
      if (
        (feature === "waist_width" || feature === "subcutaneous_fat") &&
        bfDelta != null &&
        bfDelta > ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP
      ) {
        continue;
      }
      out.push(
        rule({
          id: `focus-${zone}-${feature}`,
          region: regionForFeature(feature),
          feature,
          direction,
          magnitude: baseMagnitude,
          priority: ANATOMICAL_PRIORITY_FOCUS + ANATOMICAL_FOCUS_PRIORITY_BOOST,
          source: "focus_zone",
          confidence,
          confidenceReasons: [`focus_zone_${zone}`],
        })
      );
    }
  }
  return out;
}

function regionForFeature(feature: AnatomicalFeature): BodySimulatorRegion {
  switch (feature) {
    case "abdominal_definition":
    case "subcutaneous_fat":
      return "abdomen";
    case "oblique_definition":
    case "waist_width":
    case "serratus_definition":
      return "waist_and_flanks";
    case "chest_definition":
    case "chest_volume":
      return "chest_and_upper_torso";
    case "shoulder_definition":
    case "shoulder_volume":
      return "shoulders";
    case "arm_definition":
    case "arm_volume":
      return "arms";
    case "upper_back_definition":
    case "lat_width":
      return "upper_back";
    case "glute_volume":
      return "glutes";
    case "thigh_definition":
    case "thigh_volume":
      return "thighs";
    case "lower_leg_definition":
      return "lower_legs";
    case "whole_body_definition":
    case "whole_body_muscle_volume":
    default:
      return "whole_body";
  }
}

function processOptionalNotes(
  notes: readonly string[],
  bf: BodyFatContext,
  confidence: BodyAnalysisConfidence
): { rules: AnatomicalTransformationRule[]; outcomes: OptionalNoteOutcome[] } {
  const rules: AnatomicalTransformationRule[] = [];
  const outcomes: OptionalNoteOutcome[] = [];
  const delta = bf.deltaPercentagePoints;
  const losing =
    delta != null && delta <= -ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP;
  const gaining =
    delta != null && delta >= ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP;

  for (const note of notes) {
    const lower = note.toLowerCase();
    const wantsDef =
      /defined abs|shred|ripped|etched|six.?pack|definition/.test(lower);
    const wantsBulk = /\bbulk\b|mass gain|get bigger/.test(lower);

    if (wantsDef) {
      if (gaining) {
        outcomes.push({
          note,
          status: "suppressed",
          reason: "optional_note_conflicts_with_body_fat_direction",
        });
        rules.push(
          rule({
            id: `note-suppressed-def-${outcomes.length}`,
            region: "abdomen",
            feature: "abdominal_definition",
            direction: "more_defined",
            magnitude: "pronounced",
            priority: ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
            source: "optional_note",
            confidence,
            confidenceReasons: ["optional_note_suppressed"],
            limitations: [
              "Optional notes cannot reverse body-fat direction or force extreme definition.",
            ],
          })
        );
      } else if (losing || delta == null) {
        outcomes.push({
          note,
          status: "applied",
          reason: "reinforces_compatible_definition_direction",
        });
        rules.push(
          rule({
            id: `note-def-abs-${outcomes.length}`,
            region: "abdomen",
            feature: "abdominal_definition",
            direction: "more_defined",
            magnitude: "moderate",
            priority: ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
            source: "optional_note",
            confidence,
            confidenceReasons: ["optional_note_reinforce"],
          })
        );
      } else {
        outcomes.push({
          note,
          status: "partially_applied",
          reason: "stable_bf_limits_definition_emphasis",
        });
        rules.push(
          rule({
            id: `note-def-partial-${outcomes.length}`,
            region: "abdomen",
            feature: "abdominal_definition",
            direction: "more_defined",
            magnitude: "subtle",
            priority: ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
            source: "optional_note",
            confidence,
            confidenceReasons: ["optional_note_partial"],
          })
        );
      }
      continue;
    }

    if (wantsBulk && losing) {
      outcomes.push({
        note,
        status: "suppressed",
        reason: "bulk_note_conflicts_with_fat_decrease",
      });
      rules.push(
        rule({
          id: `note-bulk-suppressed-${outcomes.length}`,
          region: "abdomen",
          feature: "subcutaneous_fat",
          direction: "moderate_increase",
          magnitude: "pronounced",
          priority: ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
          source: "optional_note",
          confidence,
          confidenceReasons: ["optional_note_suppressed"],
        })
      );
      continue;
    }

    if (wantsBulk) {
      outcomes.push({
        note,
        status: "partially_applied",
        reason: "bulk_note_maps_to_muscle_volume_support_only",
      });
      rules.push(
        rule({
          id: `note-bulk-vol-${outcomes.length}`,
          region: "whole_body",
          feature: "whole_body_muscle_volume",
          direction: "slight_increase",
          magnitude: "subtle",
          priority: ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
          source: "optional_note",
          confidence,
          confidenceReasons: ["optional_note_partial"],
        })
      );
      continue;
    }

    outcomes.push({
      note,
      status: "partially_applied",
      reason: "unrecognized_note_kept_as_low_priority_semantic_support_only",
    });
  }

  return { rules, outcomes };
}

function buildSemanticSupport(
  input: BodySimulatorInput,
  mode: MuscleGainMode,
  bf: BodyFatContext,
  noteOutcomes: OptionalNoteOutcome[]
): string[] {
  const terms = new Set<string>();
  const delta = bf.deltaPercentagePoints;
  if (delta != null && delta < -ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP) {
    terms.add("lean");
    terms.add("defined");
  }
  if (mode === "lean_bulk" || mode === "mixed_bulk" || mode === "fat_gain_bulk") {
    terms.add("muscular");
  }
  if (input.goal.type === "body_recomposition" || mode === "lean_bulk") {
    terms.add("recomposition");
  }
  if (input.goal.type === "general_fitness_improvement") {
    terms.add("athletic");
  }
  for (const o of noteOutcomes) {
    if (o.status === "applied" || o.status === "partially_applied") {
      if (/defined/.test(o.note.toLowerCase())) terms.add("defined");
      if (/athletic|fit/.test(o.note.toLowerCase())) terms.add("athletic");
    }
  }
  return [...terms].sort();
}

function anatomicalConfidence(
  input: BodySimulatorInput,
  bf: BodyFatContext,
  conflicts: { severity: string }[]
): { overall: BodyAnalysisConfidence; reasons: string[] } {
  const reasons: string[] = [];
  if (bf.currentPercent == null) {
    reasons.push("body_fat_not_provided");
  } else if (input.profile.bodyFatBasis === "user_estimate") {
    reasons.push("body_fat_user_estimate_only");
  } else if (
    input.profile.bodyFatBasis === "device_measurement" ||
    input.profile.bodyFatBasis === "professional_measurement"
  ) {
    reasons.push("body_fat_measurement_available");
  }

  if (input.bodyAnalysis == null) {
    reasons.push("body_analysis_unavailable");
  }

  const view = input.sourceImageContext.progressPhotoView;
  if (
    !input.sourceImageContext.available ||
    view === "unknown" ||
    view === "three_quarter"
  ) {
    reasons.push("body_region_visibility_limited");
  }

  if (conflicts.some((c) => c.severity === "warning")) {
    reasons.push("contradictory_user_inputs");
  }

  let overall: BodyAnalysisConfidence = "medium";
  if (
    reasons.includes("body_fat_not_provided") ||
    reasons.includes("body_region_visibility_limited")
  ) {
    overall = "low";
  } else if (
    reasons.includes("body_fat_measurement_available") &&
    !reasons.includes("contradictory_user_inputs")
  ) {
    overall = "high";
  }

  return { overall, reasons };
}

/**
 * Build canonical anatomical transformation from Body Simulator input.
 */
export function buildAnatomicalTransformation(
  input: BodySimulatorInput
): AnatomicalTransformationResult {
  const bf = resolveBodyFatContext(input);
  const focusZones = [...(input.focusZones ?? [])] as BodySimulatorFocusZone[];
  const optionalNotes = [...(input.optionalNotes ?? [])];
  const conflicts = validateGoalConsistency(input);
  const effort = effortCoefficientForIntensity(input.goal.intensity);
  const relativeMagnitude = anatomicalTimelineRelativeMagnitude(
    input.goal.timelineWeeks
  );
  const score = clamp01(relativeMagnitude * effort.coefficient);
  const baseMagnitude = magnitudeFromScore(score);
  const mode = deriveMuscleGainMode(input, bf);
  const conf = anatomicalConfidence(input, bf, conflicts);

  const preserveMuscleVolume =
    input.goal.type === "fat_loss_with_muscle_preservation" ||
    input.goal.type === "body_recomposition" ||
    input.goal.type === "general_fitness_improvement" ||
    (bf.deltaPercentagePoints != null &&
      bf.deltaPercentagePoints < 0 &&
      input.goal.type !== "weight_loss");

  // weight_loss still should not invent muscle loss as volume shrink on definition path
  const preserveForFatLoss =
    preserveMuscleVolume ||
    (bf.deltaPercentagePoints != null && bf.deltaPercentagePoints < 0);

  const candidates: AnatomicalTransformationRule[] = [];

  const allowVolumeIncrease = mode !== "not_applicable";
  candidates.push(
    ...buildFatDrivenRules(
      bf,
      baseMagnitude,
      conf.overall,
      preserveForFatLoss,
      allowVolumeIncrease
    )
  );
  candidates.push(
    ...buildMuscleRules(input, mode, baseMagnitude, conf.overall)
  );
  candidates.push(
    ...addFocusDerivedRules(
      focusZones,
      baseMagnitude,
      conf.overall,
      bf.deltaPercentagePoints
    )
  );

  const noteResult = processOptionalNotes(optionalNotes, bf, conf.overall);
  candidates.push(...noteResult.rules);

  const boosted = applyFocusZoneBoosts(candidates, focusZones);
  const { applied, suppressed, reasons } = resolveConflicts(boosted);

  // Ensure suppressed optional-note rules that lost stay in suppressed list
  const appliedIds = new Set(applied.map((r) => r.id));
  const suppressedIds = suppressed.map((r) => r.id);

  // Reconcile note outcomes with resolution.
  // Compatible reinforcement that loses only on lower_priority_conflict stays applied.
  const noteOutcomes = noteResult.outcomes.map((o) => {
    if (o.status === "suppressed") return o;
    const related = noteResult.rules.find((r) => {
      const n = o.note.toLowerCase();
      if (/defined abs|shred|ripped|definition/.test(n)) {
        return r.feature === "abdominal_definition" && r.source === "optional_note";
      }
      return r.source === "optional_note";
    });
    if (related && !appliedIds.has(related.id)) {
      const reason = String(reasons[related.id] ?? "optional_note_conflict");
      if (
        reason === "lower_priority_conflict" &&
        (o.status === "applied" || o.status === "partially_applied")
      ) {
        return {
          ...o,
          status: "applied" as const,
          reason: "reinforces_compatible_higher_priority_rule",
        };
      }
      return {
        ...o,
        status: "suppressed" as const,
        reason,
      };
    }
    return o;
  });

  const semanticSupportTerms = buildSemanticSupport(
    input,
    mode,
    bf,
    noteOutcomes
  );

  const bodyFatDriven = applied.some((r) => r.source === "body_fat_delta");
  const muscleDriven = applied.some(
    (r) =>
      r.feature.includes("volume") ||
      r.feature === "lat_width" ||
      r.feature === "whole_body_muscle_volume"
  );
  const focusZoneDriven =
    focusZones.length > 0 &&
    applied.some(
      (r) =>
        r.source === "focus_zone" ||
        r.confidenceReasons.some((c) => c.startsWith("focus_zone"))
    );
  const optionalNotesUsed = noteOutcomes.some(
    (o) => o.status === "applied" || o.status === "partially_applied"
  );

  const limitations = [
    "Anatomical Transformation describes expected visualization intent, not a guaranteed outcome.",
    "Broad aesthetic terms are secondary semantic support only.",
    "No skeletal widening, height change, or hand/foot enlargement.",
  ];
  if (bf.currentPercent == null) {
    limitations.push(
      "Current body-fat unavailable; fat-driven anatomical rules are limited."
    );
  }
  if (focusZones.includes("posture")) {
    limitations.push(
      "Posture focus does not change skeletal structure in v2."
    );
  }

  return {
    schemaVersion: ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION,
    rules: applied,
    appliedRuleIds: applied.map((r) => r.id),
    suppressedRuleIds: suppressedIds,
    suppressionReasons: reasons,
    conflicts,
    summary: {
      bodyFatDriven,
      muscleDriven,
      focusZoneDriven,
      optionalNotesUsed,
    },
    muscleGainMode: mode,
    bodyFatContext: bf,
    focusZones,
    optionalNotesPresent: optionalNotes.length > 0,
    noteOutcomes,
    semanticSupportTerms,
    effortLabel: effort.label,
    effortCoefficient: effort.coefficient,
    timelineWeeks: input.goal.timelineWeeks,
    confidence: conf.overall,
    confidenceReasons: conf.reasons,
    limitations,
  };
}

/** Magnitude score helper for timeline/effort regression tests. */
export function anatomicalMagnitudeScore(
  timelineWeeks: number,
  intensity: BodySimulatorInput["goal"]["intensity"]
): { score: number; magnitude: AnatomicalMagnitude; effortCoefficient: number } {
  const effort = effortCoefficientForIntensity(intensity);
  const relativeMagnitude = anatomicalTimelineRelativeMagnitude(timelineWeeks);
  const score = clamp01(relativeMagnitude * effort.coefficient);
  return {
    score,
    magnitude: magnitudeFromScore(score),
    effortCoefficient: effort.coefficient,
  };
}

export type { AnatomicalRuleSource };
