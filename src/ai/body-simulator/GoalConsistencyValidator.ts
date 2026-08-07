/**
 * Goal consistency validator (Demand 022D).
 *
 * Surfaces info/warning issues for contradictory or ambiguous goal combinations.
 * Never blocks simulation. No shame-based wording.
 */

import type { BodySimulatorInput } from "./BodySimulatorTypes";
import {
  ANATOMICAL_BF_DELTA_MODEST_PP,
  ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP,
} from "./AnatomicalTransformationRules";
import type { GoalConsistencyIssue } from "./AnatomicalTransformationTypes";

export type { GoalConsistencyIssue, GoalConsistencySeverity } from "./AnatomicalTransformationTypes";

function resolveBodyFatDelta(input: BodySimulatorInput): number | null {
  const current = input.profile.currentBodyFatPercent;
  const absolute =
    input.goal.targetBodyFatPercent !== undefined
      ? input.goal.targetBodyFatPercent
      : null;
  if (current != null && absolute != null) {
    return absolute - current;
  }
  const change = input.goal.targetBodyFatChangePercentagePoints;
  if (change != null) return change;
  return null;
}

function notesText(input: BodySimulatorInput): string {
  const notes = input.optionalNotes ?? [];
  return notes.join(" ").toLowerCase();
}

/**
 * Detect goal consistency issues. Deterministic. Never throws. Never blocks.
 */
export function validateGoalConsistency(
  input: BodySimulatorInput
): GoalConsistencyIssue[] {
  const issues: GoalConsistencyIssue[] = [];
  const delta = resolveBodyFatDelta(input);
  const goal = input.goal.type;
  const notes = notesText(input);
  const focusZones = input.focusZones ?? [];
  const muscleTarget = input.goal.targetMuscleChangeKg;

  const wantsMuscle =
    goal === "muscle_gain" ||
    goal === "body_recomposition" ||
    (muscleTarget != null && muscleTarget > 0);

  const meaningfulFatDecrease =
    delta != null && delta <= -ANATOMICAL_BF_DELTA_MODEST_PP;

  const meaningfulFatIncrease =
    delta != null && delta >= ANATOMICAL_BF_DELTA_MODEST_PP;

  // Bulk / muscle gain + meaningful body-fat decrease → lean bulk / recomp
  if (
    (goal === "muscle_gain" || (wantsMuscle && /bulk/.test(notes))) &&
    meaningfulFatDecrease
  ) {
    issues.push({
      code: "muscle_gain_with_fat_decrease",
      severity: "warning",
      message:
        "These goals combine muscle gain with body-fat reduction. HelseApp can simulate this as body recomposition or lean bulk.",
      suggestedInterpretation: "lean_bulk_or_recomposition",
    });
  }

  if (goal === "body_recomposition" && wantsMuscle && meaningfulFatDecrease) {
    issues.push({
      code: "recomposition_interpretation",
      severity: "info",
      message:
        "Muscle gain with body-fat reduction is interpreted as body recomposition for anatomical planning.",
      suggestedInterpretation: "body_recomposition",
    });
  }

  // Muscle gain without focus zones — information only
  if (
    (goal === "muscle_gain" || goal === "body_recomposition") &&
    focusZones.length === 0
  ) {
    issues.push({
      code: "muscle_gain_without_focus_zones",
      severity: "info",
      message:
        "No focus zones were selected. Muscle-volume changes will use a balanced whole-body distribution.",
      suggestedInterpretation: null,
    });
  }

  // Large fat decrease request conflicting with increase target
  const changePp = input.goal.targetBodyFatChangePercentagePoints;
  const absoluteTarget = input.goal.targetBodyFatPercent;
  const current = input.profile.currentBodyFatPercent;
  if (
    changePp != null &&
    changePp <= -ANATOMICAL_BF_DELTA_MODEST_PP &&
    absoluteTarget != null &&
    current != null &&
    absoluteTarget - current >= ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP
  ) {
    issues.push({
      code: "fat_decrease_vs_increase_target",
      severity: "warning",
      message:
        "Requested body-fat change direction conflicts with the absolute body-fat target. The absolute target is used for anatomical direction.",
      suggestedInterpretation: "prefer_absolute_body_fat_target",
    });
  }

  // Maintain body-fat + shred semantic note
  if (
    delta != null &&
    Math.abs(delta) < ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP &&
    /(shred|ripped|etched|stage.?ready)/i.test(notes)
  ) {
    issues.push({
      code: "stable_bf_with_shred_note",
      severity: "warning",
      message:
        "Optional notes describe very low body-fat appearance while the body-fat target is unchanged. Anatomical planning follows the body-fat target.",
      suggestedInterpretation: "follow_body_fat_target",
    });
  }

  // Decrease fat + explicit bulk note
  if (meaningfulFatDecrease && /\bbulk\b/i.test(notes)) {
    issues.push({
      code: "fat_decrease_with_bulk_note",
      severity: "warning",
      message:
        "Optional notes mention bulk while body-fat is decreasing. This is simulated as lean bulk or recomposition, not generic fat gain.",
      suggestedInterpretation: "lean_bulk_or_recomposition",
    });
  }

  // Fat increase + shred note
  if (meaningfulFatIncrease && /(shred|defined abs|ripped)/i.test(notes)) {
    issues.push({
      code: "fat_increase_with_definition_note",
      severity: "warning",
      message:
        "Optional notes request definition while body-fat is increasing. Definition emphasis is suppressed so it does not reverse the body-fat direction.",
      suggestedInterpretation: "follow_body_fat_target",
    });
  }

  return issues;
}
