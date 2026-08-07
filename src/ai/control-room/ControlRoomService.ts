/**
 * ControlRoomService — fixture-only dry_run inspection entry point.
 *
 * Constructs AiOsRuntime without transport, env, or network dependencies.
 * Invokes runtime exactly once per scenario run.
 *
 * Demand 022B: when Body Simulator shadow succeeds, canonical transformation
 * rules are applied to the formatter path (no legacy transformation fallback
 * for that dry-run). Provider traffic remains off.
 */

import {
  adaptBodySimulatorRulesToFormatterInput,
  buildFormatterInputInspectionView,
  buildFormatterPreviewView,
  resolveBodySimulatorScenarioForPreview,
  type FormatterInputInspectionView,
  type FormatterPreviewView,
} from "../body-simulator/BodySimulatorFormatterAdapter";
import {
  AiOsRuntime,
  createAiOsRuntimeDependencies,
} from "../runtime";
import {
  buildBodySimulatorShadowPlaceholder,
  isBodySimulatorShadowEnabled,
  runBodySimulatorShadowPhase,
  type ControlRoomBodySimulatorView,
} from "../shadow/BodySimulatorShadowIntegration";
import { getControlRoomScenario, listControlRoomScenarios } from "./ControlRoomFixtures";
import {
  ControlRoomProjectionError,
  projectControlRoomResult,
  sanitizeControlRoomProjection,
  validateControlRoomProjection,
} from "./ControlRoomProjection";
import {
  CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR,
  CONTROL_ROOM_SAFETY_STATUS,
  CONTROL_ROOM_SCHEMA_VERSION,
  CONTROL_ROOM_RULES_VERSION,
  type ControlRoomRunResult,
  type ControlRoomScenarioId,
  type ControlRoomScenarioSummary,
} from "./ControlRoomTypes";

export class ControlRoomServiceError extends Error {
  readonly code:
    | "scenario_not_found"
    | "runtime_failure"
    | "unsafe_result"
    | "invalid_request";

  constructor(
    code:
      | "scenario_not_found"
      | "runtime_failure"
      | "unsafe_result"
      | "invalid_request",
    message: string
  ) {
    super(message);
    this.name = "ControlRoomServiceError";
    this.code = code;
  }
}

function assertDryRunInputShape(input: {
  mode: string;
  sourceImage?: unknown;
  validationEvidence?: unknown;
  retryState?: unknown;
  transportConfig?: unknown;
}): void {
  if (input.mode !== "dry_run") {
    throw new ControlRoomServiceError(
      "invalid_request",
      "Control Room accepts dry_run scenarios only."
    );
  }
  if (input.sourceImage !== undefined) {
    throw new ControlRoomServiceError(
      "invalid_request",
      "Control Room rejects source images."
    );
  }
  if (input.validationEvidence !== undefined) {
    throw new ControlRoomServiceError(
      "invalid_request",
      "Control Room rejects validation evidence."
    );
  }
  if (input.retryState !== undefined) {
    throw new ControlRoomServiceError(
      "invalid_request",
      "Control Room rejects retry state."
    );
  }
  if (input.transportConfig !== undefined) {
    throw new ControlRoomServiceError(
      "invalid_request",
      "Control Room rejects transport configuration."
    );
  }
}

function runBodySimulatorForControlRoom(
  controlRoomScenarioId: string,
  options?: { bodySimulatorScenarioId?: string | null }
): ControlRoomBodySimulatorView {
  const bodySimEnabled = isBodySimulatorShadowEnabled(process.env);
  const resolvedScenarioId = resolveBodySimulatorScenarioForPreview(
    controlRoomScenarioId,
    options?.bodySimulatorScenarioId ?? null
  );

  try {
    return runBodySimulatorShadowPhase({
      enabled: bodySimEnabled,
      scenarioId: resolvedScenarioId,
    }).view;
  } catch {
    const placeholder = buildBodySimulatorShadowPlaceholder({
      enabled: bodySimEnabled,
      scenarioId: resolvedScenarioId,
    });
    return {
      ...placeholder,
      status: placeholder.enabled ? ("failed" as const) : ("disabled" as const),
      diagnostics: [
        ...placeholder.diagnostics,
        "body_simulator_execution_failed",
      ],
      errorCode: placeholder.enabled
        ? ("body_simulator_execution_failed" as const)
        : ("body_simulator_disabled" as const),
    };
  }
}

function buildFormatterBridgeViews(
  bodySimulator: ControlRoomBodySimulatorView,
  formattedRequest: {
    positivePrompt?: string;
    negativePrompt?: string;
    formatterName?: string;
    formatterVersion?: string;
  } | null
): {
  formatterInput: FormatterInputInspectionView | null;
  formatterPreview: FormatterPreviewView | null;
} {
  if (
    bodySimulator.rules == null ||
    (bodySimulator.status !== "succeeded" &&
      bodySimulator.status !== "ready_with_limitations")
  ) {
    return { formatterInput: null, formatterPreview: null };
  }

  const canonical = adaptBodySimulatorRulesToFormatterInput(
    bodySimulator.rules
  );
  const positiveLen =
    typeof formattedRequest?.positivePrompt === "string"
      ? formattedRequest.positivePrompt.length
      : 0;
  const negativeLen =
    typeof formattedRequest?.negativePrompt === "string"
      ? formattedRequest.negativePrompt.length
      : 0;
  const promptLength =
    formattedRequest == null ? null : positiveLen + negativeLen;

  return {
    formatterInput: buildFormatterInputInspectionView(
      bodySimulator.rules,
      canonical
    ),
    formatterPreview: buildFormatterPreviewView({
      canonical,
      promptLength,
      formatterName: formattedRequest?.formatterName ?? null,
      formatterVersion: formattedRequest?.formatterVersion ?? null,
    }),
  };
}

export class ControlRoomService {
  listScenarios(): ControlRoomScenarioSummary[] {
    return listControlRoomScenarios();
  }

  async runScenario(
    scenarioId: ControlRoomScenarioId,
    options?: { bodySimulatorScenarioId?: string | null }
  ): Promise<ControlRoomRunResult> {
    const resolved = getControlRoomScenario(scenarioId);
    if (!resolved) {
      throw new ControlRoomServiceError(
        "scenario_not_found",
        "Scenario was not found."
      );
    }

    // Body Simulator first (Demand 022B pipeline order for formatter path).
    const bodySimulator = runBodySimulatorForControlRoom(scenarioId, options);

    let canonical =
      bodySimulator.rules != null &&
      (bodySimulator.status === "succeeded" ||
        bodySimulator.status === "ready_with_limitations")
        ? adaptBodySimulatorRulesToFormatterInput(bodySimulator.rules)
        : null;

    const runtimeInput = {
      mode: "dry_run" as const,
      profile: resolved.runtimeInput.profile,
      goal: resolved.runtimeInput.goal,
      ...(resolved.runtimeInput.formatterOptions !== undefined
        ? { formatterOptions: resolved.runtimeInput.formatterOptions }
        : {}),
      ...(canonical != null
        ? { canonicalBodyTransformation: canonical }
        : {}),
    };

    assertDryRunInputShape(runtimeInput);

    const runtime = new AiOsRuntime(
      createAiOsRuntimeDependencies({
        // Intentionally omit transportAdapter — dry_run only.
        now: () => Date.now(),
      })
    );

    let runtimeResult;
    try {
      runtimeResult = await runtime.run(runtimeInput);
    } catch {
      throw new ControlRoomServiceError(
        "runtime_failure",
        "AI OS dry run failed."
      );
    }

    if (
      !runtimeResult.success ||
      runtimeResult.mode !== "dry_run" ||
      runtimeResult.terminalOutcome !== "dry_run_complete"
    ) {
      throw new ControlRoomServiceError(
        "runtime_failure",
        "AI OS dry run did not complete successfully."
      );
    }

    const formatted = runtimeResult.artifacts.formattedRequest;
    const bridge = buildFormatterBridgeViews(
      bodySimulator,
      formatted
        ? {
            positivePrompt: formatted.prompt,
            negativePrompt: formatted.negativePrompt ?? "",
            formatterName: formatted.metadata.formatterName,
            formatterVersion: formatted.metadata.formatterVersion,
          }
        : null
    );

    let projected: ControlRoomRunResult;
    try {
      projected = projectControlRoomResult(
        resolved.summary,
        runtimeResult,
        bodySimulator,
        bridge.formatterInput,
        bridge.formatterPreview
      );
    } catch (error) {
      if (error instanceof ControlRoomProjectionError) {
        throw new ControlRoomServiceError(error.code, error.message);
      }
      throw new ControlRoomServiceError(
        "runtime_failure",
        "AI OS dry run projection failed."
      );
    }

    const validation = validateControlRoomProjection(projected);
    const sanitized = sanitizeControlRoomProjection(projected);

    if (!validation.valid || !sanitized.success || sanitized.artifacts == null) {
      throw new ControlRoomServiceError(
        "unsafe_result",
        CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR
      );
    }

    return sanitized;
  }
}

/** Build a minimal safe failure envelope for unexpected paths (tests / tooling). */
export function buildControlRoomFailureShell(
  scenario: ControlRoomScenarioSummary
): ControlRoomRunResult {
  return {
    schemaVersion: CONTROL_ROOM_SCHEMA_VERSION,
    rulesVersion: CONTROL_ROOM_RULES_VERSION,
    success: false,
    scenario: structuredClone(scenario),
    runtime: {
      mode: "dry_run",
      terminalOutcome: "dry_run_complete",
      traceId: "control-room-failure",
      stages: [],
      versions: {},
    },
    artifacts: null,
    safety: { ...CONTROL_ROOM_SAFETY_STATUS },
    bodySimulator: buildBodySimulatorShadowPlaceholder(),
    formatterInput: null,
    formatterPreview: null,
    warnings: [],
    errors: [CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR],
  };
}
