/**
 * Shadow Runtime fixtures — fictional, non-sensitive test data only.
 *
 * Reuses AI OS Runtime fixtures; never includes real images, tokens, or health payloads.
 */

import type { AiOsRuntimeInput } from "../runtime/AiOsRuntimeTypes";
import {
  invalidRuntimeGoalInput,
  invalidRuntimeProfileInput,
  transportSuccessWithAcceptedEvidenceInput,
  transportSuccessWithRetryEvidenceInput,
  transportSuccessWithoutEvidenceInput,
  transportTimeoutRuntimeInput,
  validDryRunRuntimeInput,
  validTransportMockRuntimeInput,
} from "../runtime/fixtures";
import type { ShadowRuntimeInput } from "./ShadowRuntimeTypes";

/** Disabled shadow — no runtime execution. */
export const disabledShadowInput: ShadowRuntimeInput = {
  mode: "disabled",
};

/** runtime_only wrapping a valid dry-run runtime input. */
export const runtimeOnlyValidShadowInput: ShadowRuntimeInput = {
  mode: "runtime_only",
  runtimeInput: { ...validDryRunRuntimeInput },
};

/** runtime_only with invalid profile. */
export const runtimeOnlyInvalidProfileShadowInput: ShadowRuntimeInput = {
  mode: "runtime_only",
  runtimeInput: { ...invalidRuntimeProfileInput },
};

/** runtime_only with invalid goal. */
export const runtimeOnlyInvalidGoalShadowInput: ShadowRuntimeInput = {
  mode: "runtime_only",
  runtimeInput: { ...invalidRuntimeGoalInput },
};

/** transport_mock shadow wrapping a valid transport mock input. */
export const transportMockValidShadowInput: ShadowRuntimeInput = {
  mode: "runtime_with_transport_mock",
  runtimeInput: { ...validTransportMockRuntimeInput },
};

/** transport_mock timeout scenario. */
export const transportMockTimeoutShadowInput: ShadowRuntimeInput = {
  mode: "runtime_with_transport_mock",
  runtimeInput: { ...transportTimeoutRuntimeInput },
};

/** transport_mock success without validation evidence. */
export const transportMockAwaitingValidationShadowInput: ShadowRuntimeInput = {
  mode: "runtime_with_transport_mock",
  runtimeInput: { ...transportSuccessWithoutEvidenceInput },
};

/** transport_mock success with accepted evidence. */
export const transportMockAcceptedShadowInput: ShadowRuntimeInput = {
  mode: "runtime_with_transport_mock",
  runtimeInput: { ...transportSuccessWithAcceptedEvidenceInput },
};

/** transport_mock success with retry evidence. */
export const transportMockRetryShadowInput: ShadowRuntimeInput = {
  mode: "runtime_with_transport_mock",
  runtimeInput: { ...transportSuccessWithRetryEvidenceInput },
};

/** Shadow input missing runtimeInput (invalid when not disabled). */
export const missingRuntimeInputShadowInput: ShadowRuntimeInput = {
  mode: "runtime_only",
};

/**
 * Clone a runtime fixture into a shadow input with the given shadow mode.
 */
export function shadowInputFromRuntime(
  mode: ShadowRuntimeInput["mode"],
  runtimeInput: AiOsRuntimeInput
): ShadowRuntimeInput {
  return {
    mode,
    runtimeInput: structuredClone(runtimeInput),
  };
}
