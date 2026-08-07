/**
 * Body Simulator v1 — input validation (Demand 022).
 * Protects contract integrity, not body normality.
 */

import {
  BODY_SIMULATION_GOAL_TYPES,
  BODY_SIMULATION_INTENSITIES,
  BODY_SIMULATOR_INPUT_SCHEMA_VERSION,
  BODY_SIMULATOR_TIMELINE_MAX_WEEKS,
  BODY_SIMULATOR_TIMELINE_MIN_WEEKS,
  REPORTED_EFFECT_DIRECTIONS,
  type BodySimulatorInput,
  type BodySimulatorValidationError,
  type ReportedEffectDirection,
} from "./BodySimulatorTypes";

const FORBIDDEN_SUBSTRINGS = [
  "data:image",
  "data:application",
  "bearer ",
  "authorization:",
  "api_key",
  "api-key",
  "access_token",
  "sk-",
  "r8_",
  "replicate.com",
  "openai.com",
] as const;

const PATH_LIKE =
  /(?:^|[\\/])(?:Users|home|var|tmp|Windows|Program Files)[\\/]|[A-Za-z]:\\|\.\.[\\/]/i;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function push(
  errors: BodySimulatorValidationError[],
  code: BodySimulatorValidationError["code"],
  path: string,
  message: string
): void {
  errors.push({ code, path, message });
}

function scanForbidden(value: unknown, path: string, errors: BodySimulatorValidationError[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    for (const frag of FORBIDDEN_SUBSTRINGS) {
      if (lower.includes(frag)) {
        push(errors, "forbidden_content", path, `Forbidden content detected near ${path}`);
        return;
      }
    }
    if (PATH_LIKE.test(value) && (value.includes("/") || value.includes("\\"))) {
      push(errors, "forbidden_content", path, `Filesystem-like path not allowed at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanForbidden(v, `${path}[${i}]`, errors));
    return;
  }
  if (value != null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const keyLower = k.toLowerCase();
      if (
        keyLower.includes("prompt") ||
        keyLower === "provider" ||
        keyLower === "model" ||
        keyLower === "modelid" ||
        keyLower === "providerid" ||
        keyLower.includes("apikey") ||
        keyLower.includes("token")
      ) {
        // Allow schema notes fields; reject provider/prompt business fields on input root-ish paths
        if (
          path === "input" ||
          path.startsWith("goal") ||
          path.startsWith("options") ||
          path.startsWith("profile") ||
          path.startsWith("activity") ||
          path.startsWith("medicationEffects") ||
          path.startsWith("sourceImageContext")
        ) {
          push(
            errors,
            "forbidden_content",
            `${path}.${k}`,
            `Provider/prompt/token field not allowed: ${k}`
          );
        }
      }
      scanForbidden(v, `${path}.${k}`, errors);
    }
  }
}

function validateEffect(
  value: unknown,
  path: string,
  errors: BodySimulatorValidationError[]
): void {
  if (
    typeof value !== "string" ||
    !(REPORTED_EFFECT_DIRECTIONS as readonly string[]).includes(value)
  ) {
    push(errors, "invalid_effect_direction", path, `Invalid effect direction at ${path}`);
  }
}

/**
 * Validate BodySimulatorInput. Returns errors; empty array means valid.
 */
export function validateBodySimulatorInput(
  input: unknown
): BodySimulatorValidationError[] {
  const errors: BodySimulatorValidationError[] = [];

  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    push(errors, "invalid_input_shape", "input", "Input must be an object");
    return errors;
  }

  const i = input as Partial<BodySimulatorInput>;

  if (i.schemaVersion !== BODY_SIMULATOR_INPUT_SCHEMA_VERSION) {
    push(
      errors,
      "unsupported_schema_version",
      "schemaVersion",
      `Unsupported schemaVersion: ${String(i.schemaVersion)}`
    );
  }

  if (typeof i.simulationId !== "string" || i.simulationId.trim() === "") {
    push(errors, "missing_simulation_id", "simulationId", "simulationId is required");
  }

  if (typeof i.createdAt !== "string" || i.createdAt.trim() === "") {
    push(errors, "invalid_input_shape", "createdAt", "createdAt must be a non-empty string");
  }

  if (!i.goal || typeof i.goal !== "object") {
    push(errors, "invalid_input_shape", "goal", "goal is required");
  } else {
    if (
      !(BODY_SIMULATION_GOAL_TYPES as readonly string[]).includes(
        i.goal.type as string
      )
    ) {
      push(errors, "unsupported_goal", "goal.type", `Unsupported goal: ${String(i.goal.type)}`);
    }

    const weeks = i.goal.timelineWeeks;
    if (!isFiniteNumber(weeks)) {
      push(errors, "invalid_number", "goal.timelineWeeks", "timelineWeeks must be a finite number");
    } else if (weeks < BODY_SIMULATOR_TIMELINE_MIN_WEEKS) {
      push(
        errors,
        "timeline_below_minimum",
        "goal.timelineWeeks",
        `timelineWeeks must be >= ${BODY_SIMULATOR_TIMELINE_MIN_WEEKS}`
      );
    } else if (weeks > BODY_SIMULATOR_TIMELINE_MAX_WEEKS) {
      push(
        errors,
        "timeline_above_maximum",
        "goal.timelineWeeks",
        `timelineWeeks must be <= ${BODY_SIMULATOR_TIMELINE_MAX_WEEKS}`
      );
    }

    if (
      !(BODY_SIMULATION_INTENSITIES as readonly string[]).includes(
        i.goal.intensity as string
      )
    ) {
      push(
        errors,
        "invalid_intensity",
        "goal.intensity",
        `Invalid intensity: ${String(i.goal.intensity)}`
      );
    }

    for (const key of [
      "targetWeightChangeKg",
      "targetBodyFatChangePercentagePoints",
      "targetMuscleChangeKg",
    ] as const) {
      const v = i.goal[key];
      if (v != null && !isFiniteNumber(v)) {
        push(errors, "invalid_number", `goal.${key}`, `${key} must be finite or null`);
      }
    }
  }

  if (!i.profile || typeof i.profile !== "object") {
    push(errors, "invalid_input_shape", "profile", "profile is required");
  } else {
    const p = i.profile;
    if (p.ageYears != null && !isFiniteNumber(p.ageYears)) {
      push(errors, "invalid_number", "profile.ageYears", "ageYears must be finite or null");
    }
    if (p.heightCm != null) {
      if (!isFiniteNumber(p.heightCm)) {
        push(errors, "invalid_number", "profile.heightCm", "heightCm must be finite or null");
      } else if (p.heightCm < 0) {
        push(errors, "invalid_height", "profile.heightCm", "heightCm must not be negative");
      }
    }
    if (p.currentWeightKg != null) {
      if (!isFiniteNumber(p.currentWeightKg)) {
        push(errors, "invalid_number", "profile.currentWeightKg", "weight must be finite or null");
      } else if (p.currentWeightKg <= 0) {
        push(
          errors,
          "invalid_weight",
          "profile.currentWeightKg",
          "currentWeightKg must be > 0 when provided"
        );
      }
    }
    if (p.currentBodyFatPercent != null && !isFiniteNumber(p.currentBodyFatPercent)) {
      push(
        errors,
        "invalid_number",
        "profile.currentBodyFatPercent",
        "currentBodyFatPercent must be finite or null"
      );
    }
  }

  if (!i.activity || typeof i.activity !== "object") {
    push(errors, "invalid_input_shape", "activity", "activity is required");
  } else {
    for (const key of [
      "resistanceTrainingSessionsPerWeek",
      "cardioSessionsPerWeek",
    ] as const) {
      const v = i.activity[key];
      if (v != null && (!isFiniteNumber(v) || v < 0)) {
        push(errors, "invalid_number", `activity.${key}`, `${key} must be >= 0 or null`);
      }
    }
  }

  if (!i.medicationEffects || typeof i.medicationEffects !== "object") {
    push(errors, "invalid_input_shape", "medicationEffects", "medicationEffects is required");
  } else {
    const m = i.medicationEffects;
    if (typeof m.medicationMayAffectWeight !== "boolean") {
      push(
        errors,
        "invalid_input_shape",
        "medicationEffects.medicationMayAffectWeight",
        "medicationMayAffectWeight must be boolean"
      );
    }
    for (const key of [
      "appetite",
      "energyLevel",
      "metabolismTendency",
      "muscleBuildingOrPreservation",
    ] as const) {
      validateEffect(m[key], `medicationEffects.${key}`, errors);
    }
  }

  if (!i.options || typeof i.options !== "object") {
    push(errors, "invalid_options", "options", "options are required");
  } else {
    const o = i.options;
    const requiredTrue = [
      "preserveIdentity",
      "preserveOriginalPresentation",
      "preservePose",
      "preserveCameraFraming",
      "preserveClothing",
      "preserveBackground",
      "preserveLightingCharacter",
    ] as const;
    for (const key of requiredTrue) {
      if (o[key] !== true) {
        push(errors, "invalid_options", `options.${key}`, `${key} must be true`);
      }
    }
  }

  if (!i.sourceImageContext || typeof i.sourceImageContext !== "object") {
    push(errors, "invalid_input_shape", "sourceImageContext", "sourceImageContext is required");
  }

  // Scan for forbidden content (data URI, tokens, paths)
  scanForbidden(input, "input", errors);

  // Reject Infinity / NaN anywhere in numeric leaves already covered;
  // also reject string "Infinity" style payloads in targets via scan.

  return errors;
}

export function isValidReportedEffectDirection(
  value: string
): value is ReportedEffectDirection {
  return (REPORTED_EFFECT_DIRECTIONS as readonly string[]).includes(value);
}
