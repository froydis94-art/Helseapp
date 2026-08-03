/**
 * AI OS Runtime fixtures — fictional, non-sensitive test data only.
 */

import { BODY_PROFILE_SCHEMA_VERSION } from "../BodyProfile";
import { TRANSFORMATION_GOAL_SCHEMA_VERSION } from "../TransformationGoal";
import { createInitialRetryState } from "../retry";
import type { ReplicateTransportResult } from "../transport/ReplicateTransportTypes";
import {
  VALIDATION_EVIDENCE_SCHEMA_VERSION,
  type DimensionEvidence,
  type ValidationDimension,
  type ValidationEvidence,
} from "../validation-result";
import type { AiOsRuntimeInput } from "./AiOsRuntimeTypes";

/** Opaque prediction / candidate identity shared by transport-mock fixtures. */
export const RUNTIME_FIXTURE_PREDICTION_ID = "runtime-prediction-fixture-001";

const META = {
  validatorInputVersion: "1.0",
  transformationRulesVersion: "1.0",
  renderPlanRulesVersion: "1.0",
} as const;

function dim(
  dimension: ValidationDimension,
  score: number,
  confidence: DimensionEvidence["confidence"] = "high"
): DimensionEvidence {
  return {
    dimension,
    score,
    confidence,
    source: "deterministic_fixture",
    findings: [],
    warnings: [],
  };
}

function allDims(
  scores: Record<ValidationDimension, number>
): DimensionEvidence[] {
  return (Object.keys(scores) as ValidationDimension[]).map((dimension) =>
    dim(dimension, scores[dimension])
  );
}

function evidenceFor(
  candidateId: string,
  scores: Record<ValidationDimension, number>
): ValidationEvidence {
  return {
    schemaVersion: VALIDATION_EVIDENCE_SCHEMA_VERSION,
    candidate: { candidateId },
    dimensions: allDims(scores),
    metadata: { ...META },
  };
}

const validProfile = {
  schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
  sex: "female",
  age: 34,
  heightCm: 170,
  weightKg: 72,
  bodyFatPct: 30,
  trainingLevel: "intermediate",
  trainingAgeYears: 3,
  activityLevel: "moderate",
  nutritionQuality: "good",
};

const validGoal = {
  schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
  fatDirection: "decrease",
  muscleDirection: "increase",
  targetBodyFatPct: 24,
  targetWeightKg: 67,
  timelineWeeks: 24,
  effortLevel: "moderate",
  focusZones: ["waist", "shoulders"],
  musclePriority: 0.5,
  fatLossPriority: 0.7,
  outcomes: ["recomp"],
};

const fixtureSourceImage = {
  value: "opaque-source-ref-runtime-fixture-001",
  kind: "https_url" as const,
};

/** 1. Valid dry-run input. */
export const validDryRunRuntimeInput: AiOsRuntimeInput = {
  mode: "dry_run",
  profile: { ...validProfile },
  goal: { ...validGoal },
  formatterOptions: {
    aspectRatio: "3:4",
    seed: 11,
    quality: "standard",
  },
};

/** 2. Valid transport_mock input (adapter injected in tests). */
export const validTransportMockRuntimeInput: AiOsRuntimeInput = {
  mode: "transport_mock",
  profile: { ...validProfile },
  goal: { ...validGoal },
  formatterOptions: {
    aspectRatio: "3:4",
    seed: 11,
    quality: "standard",
  },
  sourceImage: { ...fixtureSourceImage },
  retryState: createInitialRetryState(3),
};

/** 3. Invalid profile (negative age). */
export const invalidRuntimeProfileInput: AiOsRuntimeInput = {
  mode: "dry_run",
  profile: {
    ...validProfile,
    age: -1,
  },
  goal: { ...validGoal },
};

/** 4. Invalid goal (priority out of range). */
export const invalidRuntimeGoalInput: AiOsRuntimeInput = {
  mode: "dry_run",
  profile: { ...validProfile },
  goal: {
    ...validGoal,
    musclePriority: 1.5,
  },
};

/** 5. Transport timeout scenario input (mock returns timeout). */
export const transportTimeoutRuntimeInput: AiOsRuntimeInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage },
};

/** 6. Transport success without validation evidence. */
export const transportSuccessWithoutEvidenceInput: AiOsRuntimeInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage },
};

/** Accepted-score evidence matching fixture prediction id. */
export const acceptedRuntimeEvidence: ValidationEvidence = evidenceFor(
  RUNTIME_FIXTURE_PREDICTION_ID,
  {
    identity: 0.92,
    anatomy: 0.9,
    plan_adherence: 0.88,
    photorealism: 0.86,
    pose_camera: 0.9,
    safety: 0.99,
  }
);

/** Identity-retry evidence matching fixture prediction id. */
export const retryRuntimeEvidence: ValidationEvidence = evidenceFor(
  RUNTIME_FIXTURE_PREDICTION_ID,
  {
    identity: 0.6,
    anatomy: 0.88,
    plan_adherence: 0.85,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98,
  }
);

/** Safety-reject evidence matching fixture prediction id. */
export const safetyRejectRuntimeEvidence: ValidationEvidence = evidenceFor(
  RUNTIME_FIXTURE_PREDICTION_ID,
  {
    identity: 0.95,
    anatomy: 0.95,
    plan_adherence: 0.95,
    photorealism: 0.95,
    pose_camera: 0.95,
    safety: 0.9,
  }
);

/** Mismatched candidate evidence (does not match transport prediction). */
export const mismatchedRuntimeEvidence: ValidationEvidence = evidenceFor(
  "runtime-prediction-OTHER-999",
  {
    identity: 0.92,
    anatomy: 0.9,
    plan_adherence: 0.88,
    photorealism: 0.86,
    pose_camera: 0.9,
    safety: 0.99,
  }
);

/** 7. Transport success with accepted evidence. */
export const transportSuccessWithAcceptedEvidenceInput: AiOsRuntimeInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage },
  validationEvidence: acceptedRuntimeEvidence,
};

/** 8. Transport success with retry evidence. */
export const transportSuccessWithRetryEvidenceInput: AiOsRuntimeInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage },
  validationEvidence: retryRuntimeEvidence,
};

/** 9. Transport success with safety-reject evidence. */
export const transportSuccessWithSafetyRejectEvidenceInput: AiOsRuntimeInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage },
  validationEvidence: safetyRejectRuntimeEvidence,
};

/** 10. Candidate mismatch between evidence and transport. */
export const candidateMismatchRuntimeInput: AiOsRuntimeInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage },
  validationEvidence: mismatchedRuntimeEvidence,
};

/** Deterministic transport success result for injected mock adapters. */
export const runtimeTransportSuccessResult: ReplicateTransportResult = {
  success: true,
  provider: "replicate",
  predictionId: RUNTIME_FIXTURE_PREDICTION_ID,
  model: "fixture-model-family",
  status: "succeeded",
  imageUrl: "opaque-image-ref-runtime-fixture-001",
  generationTimeMs: 100,
  warnings: [],
  metadata: {
    traceId: "aios-runtime-fixture",
    formatterName: "FluxFormatter",
    formatterVersion: "1.0",
    pollingAttempts: 1,
    providerStatus: "succeeded",
  },
};

/** Deterministic retryable timeout failure for injected mock adapters. */
export const runtimeTransportTimeoutResult: ReplicateTransportResult = {
  success: false,
  provider: "replicate",
  imageUrl: null,
  generationTimeMs: 50,
  error: {
    code: "request_timeout",
    message: "Request timed out.",
    retryable: true,
  },
  warnings: [],
  metadata: {
    traceId: "aios-runtime-fixture-timeout",
    pollingAttempts: 0,
  },
};

/** Deterministic non-retryable auth failure for injected mock adapters. */
export const runtimeTransportAuthFailureResult: ReplicateTransportResult = {
  success: false,
  provider: "replicate",
  imageUrl: null,
  generationTimeMs: 20,
  error: {
    code: "provider_auth_error",
    message: "Provider authentication failed.",
    retryable: false,
    httpStatus: 401,
  },
  warnings: [],
  metadata: {
    traceId: "aios-runtime-fixture-auth",
    pollingAttempts: 0,
  },
};

/** Deterministic disabled-adapter failure for injected mock adapters. */
export const runtimeTransportDisabledResult: ReplicateTransportResult = {
  success: false,
  provider: "replicate",
  imageUrl: null,
  generationTimeMs: 5,
  error: {
    code: "adapter_disabled",
    message: "Replicate transport adapter is disabled.",
    retryable: false,
  },
  warnings: [],
  metadata: {
    traceId: "aios-runtime-fixture-disabled",
    pollingAttempts: 0,
  },
};
