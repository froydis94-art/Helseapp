/**
 * Body Simulator v1 — readiness assessment (Demand 022).
 *
 * Body-fat, medication, Body Analysis, and multi-view remain optional.
 */

import type {
  BodySimulatorInput,
  BodySimulatorReadiness,
} from "./BodySimulatorTypes";
import { validateBodySimulatorInput } from "./BodySimulatorValidation";

/**
 * Assess whether simulation can run and whether limitations apply.
 */
export function assessBodySimulatorReadiness(
  input: unknown
): BodySimulatorReadiness {
  const validationErrors = validateBodySimulatorInput(input);
  const missingRequiredInputs = validationErrors.map(
    (e) => `${e.path}: ${e.code}`
  );

  if (validationErrors.length > 0) {
    return {
      ready: false,
      status: "insufficient_input",
      missingRequiredInputs,
      optionalMissingInputs: [],
      limitations: [
        "Simulation cannot run until required contract inputs are valid.",
      ],
    };
  }

  const i = input as BodySimulatorInput;
  const optionalMissingInputs: string[] = [];
  const limitations: string[] = [];

  if (i.profile.currentBodyFatPercent == null) {
    optionalMissingInputs.push("profile.currentBodyFatPercent");
    limitations.push(
      "Body-fat percentage is optional; missing value lowers confidence."
    );
  }
  if (i.profile.heightCm == null) {
    optionalMissingInputs.push("profile.heightCm");
  }
  if (i.profile.currentWeightKg == null) {
    optionalMissingInputs.push("profile.currentWeightKg");
    limitations.push(
      "Current weight is optional but improves baseline completeness."
    );
  }
  if (i.profile.trainingExperience === "not_provided") {
    optionalMissingInputs.push("profile.trainingExperience");
    limitations.push(
      "Training experience missing lowers confidence rather than assuming beginner."
    );
  }
  if (i.profile.ageYears == null) {
    optionalMissingInputs.push("profile.ageYears");
  }
  if (i.profile.sexForPhysiology === "not_provided") {
    optionalMissingInputs.push("profile.sexForPhysiology");
  }
  if (!i.medicationEffects.medicationMayAffectWeight) {
    // optional by design — not listed as missing
  } else {
    for (const key of [
      "appetite",
      "energyLevel",
      "metabolismTendency",
      "muscleBuildingOrPreservation",
    ] as const) {
      if (i.medicationEffects[key] === "unknown") {
        optionalMissingInputs.push(`medicationEffects.${key}`);
        limitations.push(
          "Some medication-effect directions are unknown; no direction is fabricated."
        );
      }
    }
  }
  if (i.bodyAnalysis == null) {
    optionalMissingInputs.push("bodyAnalysis");
    limitations.push("Body Analysis is optional in v1 and was not supplied.");
  }
  if (!i.sourceImageContext.available) {
    optionalMissingInputs.push("sourceImageContext.available");
    limitations.push(
      "Source image context unavailable; downstream visualization may need an image later."
    );
  } else if (i.sourceImageContext.progressPhotoView === "unknown") {
    optionalMissingInputs.push("sourceImageContext.progressPhotoView");
  }

  const missingBaseline =
    i.profile.currentWeightKg == null &&
    i.profile.currentBodyFatPercent == null &&
    i.profile.heightCm == null;

  if (missingBaseline) {
    limitations.push("Limited baseline anthropometric data.");
  }

  const highUncertainty =
    optionalMissingInputs.length >= 4 || missingBaseline;

  if (highUncertainty) {
    return {
      ready: true,
      status: "ready_with_limitations",
      missingRequiredInputs: [],
      optionalMissingInputs,
      limitations,
    };
  }

  if (limitations.length > 0) {
    return {
      ready: true,
      status: "ready_with_limitations",
      missingRequiredInputs: [],
      optionalMissingInputs,
      limitations,
    };
  }

  return {
    ready: true,
    status: "ready",
    missingRequiredInputs: [],
    optionalMissingInputs,
    limitations: [],
  };
}
