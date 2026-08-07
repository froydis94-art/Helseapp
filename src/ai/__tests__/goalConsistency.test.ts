/**
 * Demand 022D — GoalConsistencyValidator tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildAnatomicalTransformation,
  simulateBodyTransformation,
  validateGoalConsistency,
  type BodySimulatorInput,
} from "../body-simulator";
import { createDefaultMedicationEffects } from "../body-simulator/BodySimulatorTypes";
import { createEmptyBodyAnalysisEvidence } from "../body-analysis/types";

function input(partial: {
  simulationId: string;
  goalType?: BodySimulatorInput["goal"]["type"];
  currentBf?: number | null;
  targetBf?: number | null;
  muscleKg?: number | null;
  focusZones?: BodySimulatorInput["focusZones"];
  optionalNotes?: string[];
  bfChangePp?: number | null;
}): BodySimulatorInput {
  const current = partial.currentBf === undefined ? 18 : partial.currentBf;
  const target = partial.targetBf === undefined ? 12 : partial.targetBf;
  return {
    schemaVersion: 1,
    simulationId: partial.simulationId,
    createdAt: "2026-08-07T12:00:00.000Z",
    goal: {
      type: partial.goalType ?? "muscle_gain",
      timelineWeeks: 24,
      targetWeightChangeKg: null,
      targetBodyFatChangePercentagePoints:
        partial.bfChangePp !== undefined
          ? partial.bfChangePp
          : current != null && target != null
            ? target - current
            : null,
      targetMuscleChangeKg: partial.muscleKg ?? 3,
      intensity: "realistic",
      targetBodyFatPercent: target,
    },
    profile: {
      ageYears: 28,
      sexForPhysiology: "female",
      heightCm: 170,
      currentWeightKg: 68,
      currentBodyFatPercent: current,
      bodyFatBasis: "user_estimate",
      trainingExperience: "intermediate",
      evidence: { profile: createEmptyBodyAnalysisEvidence("unknown") },
    },
    activity: {
      generalActivity: "moderate",
      resistanceTrainingSessionsPerWeek: 3,
      cardioSessionsPerWeek: 1,
      trainingConsistency: "moderate",
      proteinIntakeSupport: "likely_adequate",
      recoverySupport: "moderate",
      evidence: { activity: createEmptyBodyAnalysisEvidence("unknown") },
    },
    medicationEffects: createDefaultMedicationEffects(),
    bodyAnalysis: null,
    sourceImageContext: { available: true, progressPhotoView: "front" },
    options: {
      preserveIdentity: true,
      preserveOriginalPresentation: true,
      preservePose: true,
      preserveCameraFraming: true,
      preserveClothing: true,
      preserveBackground: true,
      preserveLightingCharacter: true,
    },
    focusZones: partial.focusZones ?? [],
    optionalNotes: partial.optionalNotes ?? [],
  };
}

describe("DEMAND_022D GoalConsistencyValidator", () => {
  it("36. Bulk + fat decrease returns warning", () => {
    const issues = validateGoalConsistency(
      input({
        simulationId: "gc-bulk-fat-down",
        goalType: "muscle_gain",
        currentBf: 18,
        targetBf: 12,
        optionalNotes: ["bulk"],
      })
    );
    assert.ok(issues.some((i) => i.code === "muscle_gain_with_fat_decrease"));
    assert.ok(issues.some((i) => i.severity === "warning"));
  });

  it("37. Suggested interpretation includes lean bulk/recomposition", () => {
    const issues = validateGoalConsistency(
      input({
        simulationId: "gc-suggest",
        goalType: "muscle_gain",
        currentBf: 18,
        targetBf: 12,
      })
    );
    const hit = issues.find((i) => i.code === "muscle_gain_with_fat_decrease");
    assert.ok(hit);
    assert.match(
      String(hit?.suggestedInterpretation),
      /lean_bulk|recomposition/i
    );
    assert.match(hit!.message, /lean bulk|recomposition/i);
  });

  it("38. Warning does not block", () => {
    const payload = input({
      simulationId: "gc-no-block",
      goalType: "muscle_gain",
      currentBf: 18,
      targetBf: 12,
    });
    const issues = validateGoalConsistency(payload);
    assert.ok(issues.some((i) => i.severity === "warning"));
    const sim = simulateBodyTransformation(payload);
    assert.equal(sim.ok, true);
    const anat = buildAnatomicalTransformation(payload);
    assert.ok(anat.rules.length > 0);
    assert.ok(anat.conflicts.some((c) => c.severity === "warning"));
  });

  it("39. Compatible goal returns no conflict warning", () => {
    const issues = validateGoalConsistency(
      input({
        simulationId: "gc-compatible",
        goalType: "fat_loss_with_muscle_preservation",
        currentBf: 18,
        targetBf: 15,
        muscleKg: 0.2,
        focusZones: ["core"],
      })
    );
    assert.equal(
      issues.some((i) => i.severity === "warning"),
      false
    );
  });

  it("40. No shame-based wording", () => {
    const issues = validateGoalConsistency(
      input({
        simulationId: "gc-no-shame",
        goalType: "muscle_gain",
        currentBf: 18,
        targetBf: 12,
        optionalNotes: ["bulk"],
      })
    );
    const text = JSON.stringify(issues).toLowerCase();
    assert.equal(
      /ugly|fat shame|disgust|abnormal|ideal body|attractive|impossible/.test(
        text
      ),
      false
    );
  });

  it("recomposition interpretation is informational", () => {
    const issues = validateGoalConsistency(
      input({
        simulationId: "gc-recomp",
        goalType: "body_recomposition",
        currentBf: 22,
        targetBf: 18,
        muscleKg: 1.5,
        focusZones: ["arms"],
      })
    );
    assert.ok(
      issues.some(
        (i) =>
          i.code === "recomposition_interpretation" && i.severity === "info"
      )
    );
  });

  it("muscle gain without focus zones is info only", () => {
    const issues = validateGoalConsistency(
      input({
        simulationId: "gc-no-focus",
        goalType: "muscle_gain",
        currentBf: 18,
        targetBf: 18,
        focusZones: [],
      })
    );
    assert.ok(
      issues.some(
        (i) =>
          i.code === "muscle_gain_without_focus_zones" && i.severity === "info"
      )
    );
  });
});
