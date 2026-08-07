/**
 * Body Simulator v1 — safe JSON projection (Demand 022).
 *
 * For inspector / diagnostics / library metadata — not wired to production.
 */

import type { AnatomicalTransformationResult } from "./AnatomicalTransformationTypes";
import type {
  BodySimulatorTransformationRules,
} from "./BodySimulatorTypes";

export interface BodySimulatorSafeProjection {
  schemaVersion: number;
  rulesVersion: string;
  simulationId: string;
  generatedAt: string;
  goal: BodySimulatorTransformationRules["goal"];
  timelineWeeks: number;
  wholeBodyChange: BodySimulatorTransformationRules["wholeBodyChange"];
  regions: BodySimulatorTransformationRules["regions"];
  anatomicalTransformation: AnatomicalTransformationResult;
  preservation: BodySimulatorTransformationRules["preservation"];
  realism: BodySimulatorTransformationRules["realism"];
  confidence: BodySimulatorTransformationRules["confidence"];
  limitations: string[];
  warnings: string[];
  provenance: BodySimulatorTransformationRules["provenance"];
  baseline: BodySimulatorTransformationRules["baseline"];
}

/**
 * Project Transformation Rules to a JSON-safe diagnostic view.
 * Excludes images, secrets, medication names, provider payloads.
 */
export function projectBodySimulatorRules(
  rules: BodySimulatorTransformationRules
): BodySimulatorSafeProjection {
  return {
    schemaVersion: rules.schemaVersion,
    rulesVersion: String(rules.rulesVersion),
    simulationId: rules.simulationId,
    generatedAt: rules.generatedAt,
    goal: {
      requestedType: rules.goal.requestedType,
      effectiveType: rules.goal.effectiveType,
      timelineWeeks: rules.goal.timelineWeeks,
      intensity: rules.goal.intensity,
    },
    timelineWeeks: rules.goal.timelineWeeks,
    wholeBodyChange: {
      weightChangeKg: { ...rules.wholeBodyChange.weightChangeKg },
      bodyFatChangePercentagePoints: {
        ...rules.wholeBodyChange.bodyFatChangePercentagePoints,
      },
      muscleChangeKg: { ...rules.wholeBodyChange.muscleChangeKg },
      confidence: rules.wholeBodyChange.confidence,
      confidenceReasons: [...rules.wholeBodyChange.confidenceReasons],
    },
    regions: rules.regions.map((r) => ({
      ...r,
      visualMagnitude: { ...r.visualMagnitude },
      confidenceReasons: [...r.confidenceReasons],
      provenanceSourcePaths: [...r.provenanceSourcePaths],
    })),
    anatomicalTransformation: structuredClone(rules.anatomicalTransformation),
    preservation: { ...rules.preservation },
    realism: {
      ...rules.realism,
      moderationReasons: [...rules.realism.moderationReasons],
    },
    confidence: {
      overall: rules.confidence.overall,
      reasons: [...rules.confidence.reasons],
    },
    limitations: [...rules.limitations],
    warnings: [...rules.warnings],
    provenance: rules.provenance.map((p) => ({ ...p })),
    baseline: {
      ...rules.baseline,
      missingInputs: [...rules.baseline.missingInputs],
    },
  };
}

export function serializeBodySimulatorProjection(
  rules: BodySimulatorTransformationRules
): string {
  return JSON.stringify(projectBodySimulatorRules(rules));
}
