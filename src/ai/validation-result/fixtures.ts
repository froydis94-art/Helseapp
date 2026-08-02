/**
 * Deterministic ValidationEvidence fixtures for ResultValidator tests.
 * Fictional opaque IDs only — no URLs, tokens, images, or user data.
 */

import {
  VALIDATION_EVIDENCE_SCHEMA_VERSION,
  type DimensionEvidence,
  type ValidationDimension,
  type ValidationEvidence,
} from "./ValidationEvidence";

const META = {
  validatorInputVersion: "1.0",
  transformationRulesVersion: "1.0",
  renderPlanRulesVersion: "1.0",
} as const;

function dim(
  dimension: ValidationDimension,
  score: number,
  confidence: DimensionEvidence["confidence"] = "high",
  findings: string[] = [],
  warnings: string[] = []
): DimensionEvidence {
  return {
    dimension,
    score,
    confidence,
    source: "deterministic_fixture",
    findings,
    warnings,
  };
}

function evidence(
  candidateId: string,
  dimensions: DimensionEvidence[]
): ValidationEvidence {
  return {
    schemaVersion: VALIDATION_EVIDENCE_SCHEMA_VERSION,
    candidate: { candidateId },
    dimensions,
    metadata: { ...META },
  };
}

function allDims(scores: Record<ValidationDimension, number>): DimensionEvidence[] {
  return (Object.keys(scores) as ValidationDimension[]).map((dimension) =>
    dim(dimension, scores[dimension])
  );
}

/** Scores clearly above all acceptance thresholds. */
export const acceptedCandidateEvidence: ValidationEvidence = evidence(
  "fixture-candidate-accept-001",
  allDims({
    identity: 0.92,
    anatomy: 0.9,
    plan_adherence: 0.88,
    photorealism: 0.86,
    pose_camera: 0.9,
    safety: 0.99,
  })
);

/** Identity below hard gate; safety and anatomy remain valid. */
export const identityRetryEvidence: ValidationEvidence = evidence(
  "fixture-candidate-identity-retry-001",
  allDims({
    identity: 0.6,
    anatomy: 0.88,
    plan_adherence: 0.85,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98,
  })
);

/** Anatomy below hard-gate threshold. */
export const anatomyRetryEvidence: ValidationEvidence = evidence(
  "fixture-candidate-anatomy-retry-001",
  allDims({
    identity: 0.88,
    anatomy: 0.7,
    plan_adherence: 0.85,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98,
  })
);

/** Plan adherence below hard-gate threshold. */
export const planAdherenceRetryEvidence: ValidationEvidence = evidence(
  "fixture-candidate-plan-retry-001",
  allDims({
    identity: 0.88,
    anatomy: 0.88,
    plan_adherence: 0.6,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98,
  })
);

/** Safety below 0.95 hard gate. */
export const unsafeCandidateEvidence: ValidationEvidence = evidence(
  "fixture-candidate-unsafe-001",
  allDims({
    identity: 0.95,
    anatomy: 0.95,
    plan_adherence: 0.95,
    photorealism: 0.95,
    pose_camera: 0.95,
    safety: 0.9,
  })
);

/** No hard-gate failure; acceptance thresholds not all met. */
export const borderlineEvidence: ValidationEvidence = evidence(
  "fixture-candidate-borderline-001",
  allDims({
    identity: 0.78,
    anatomy: 0.85,
    plan_adherence: 0.8,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.97,
  })
);

/** Identity score acceptable, but identity confidence is low. */
export const lowConfidenceIdentityEvidence: ValidationEvidence = evidence(
  "fixture-candidate-low-conf-identity-001",
  [
    dim("identity", 0.9, "low"),
    dim("anatomy", 0.9),
    dim("plan_adherence", 0.88),
    dim("photorealism", 0.86),
    dim("pose_camera", 0.9),
    dim("safety", 0.99),
  ]
);

/** Invalid: duplicate identity dimension. */
export const invalidDuplicateDimensionEvidence: ValidationEvidence = evidence(
  "fixture-candidate-invalid-dup-001",
  [
    dim("identity", 0.9),
    dim("identity", 0.85),
    dim("anatomy", 0.9),
    dim("plan_adherence", 0.88),
    dim("photorealism", 0.86),
    dim("pose_camera", 0.9),
    dim("safety", 0.99),
  ]
);
