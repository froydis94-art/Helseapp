/**
 * ControlRoomService — fixture-only dry_run inspection entry point.
 *
 * Constructs AiOsRuntime without transport, env, or network dependencies.
 * Invokes runtime exactly once per scenario run.
 */

import {
  AiOsRuntime,
  createAiOsRuntimeDependencies,
} from "../runtime";
import {
  buildBodySimulatorShadowPlaceholder,
  isBodySimulatorShadowEnabled,
  runBodySimulatorShadowPhase,
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

    const runtimeInput = {
      mode: "dry_run" as const,
      profile: resolved.runtimeInput.profile,
      goal: resolved.runtimeInput.goal,
      ...(resolved.runtimeInput.formatterOptions !== undefined
        ? { formatterOptions: resolved.runtimeInput.formatterOptions }
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

    // Body Simulator shadow phase — isolated; failure must not break dry run.
    // Flag is read only in this Control Room service (not inside ShadowRuntime).
    const bodySimEnabled = isBodySimulatorShadowEnabled(process.env);
    let bodySimulator;
    try {
      bodySimulator = runBodySimulatorShadowPhase({
        enabled: bodySimEnabled,
        scenarioId: options?.bodySimulatorScenarioId ?? null,
      }).view;
    } catch {
      const placeholder = buildBodySimulatorShadowPlaceholder({
        enabled: bodySimEnabled,
        scenarioId: options?.bodySimulatorScenarioId ?? null,
      });
      bodySimulator = {
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

    let projected: ControlRoomRunResult;
    try {
      projected = projectControlRoomResult(
        resolved.summary,
        runtimeResult,
        bodySimulator
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
    warnings: [],
    errors: [CONTROL_ROOM_FORBIDDEN_CONTENT_ERROR],
  };
}
