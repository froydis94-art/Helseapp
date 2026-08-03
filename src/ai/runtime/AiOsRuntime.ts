/**
 * AiOsRuntime — single-cycle orchestration of existing AI OS v2 layers.
 *
 * Coordinates layers without owning physiology, prompts, validation scores,
 * or retry policy. At most one transport call per invocation.
 */

import { createHash } from "node:crypto";

import {
  FLUX_FORMATTER_VERSION,
  FluxFormatter,
  validateFormattedImageRequest,
  type FormatterOptions,
} from "../formatters";
import {
  RENDER_PLAN_RULES_VERSION,
  buildRenderPlan,
  validateRenderPlan,
} from "../render";
import {
  RETRY_ORCHESTRATOR_RULES_VERSION,
  createInitialRetryState,
  evaluateRetryTransition,
  validateRetryAttemptState,
} from "../retry";
import { TransformationEngine } from "../TransformationEngine";
import { TRANSFORM_RULES_VERSION } from "../TransformationPlan";
import type { ReplicateTransportResult } from "../transport/ReplicateTransportTypes";
import {
  RESULT_VALIDATOR_RULES_VERSION,
  evaluateCandidate,
} from "../validation-result";
import {
  validateBodyProfile,
  validateTransformationGoal,
} from "../validation";
import {
  VISUAL_DIRECTOR_RULES_VERSION,
  directVisual,
} from "../visual";
import type { AiOsRuntimeDependencies } from "./AiOsRuntimeFactory";
import { sanitizeAiOsRuntimeResult } from "./RuntimeSanitizer";
import {
  AI_OS_RUNTIME_RULES_VERSION,
  type AiOsRuntimeArtifacts,
  type AiOsRuntimeInput,
  type AiOsRuntimeInputValidation,
  type AiOsRuntimeMode,
  type AiOsRuntimeResult,
  type AiOsRuntimeStage,
  type AiOsRuntimeStageResult,
  type AiOsRuntimeTerminalOutcome,
  type AiOsRuntimeTrace,
} from "./AiOsRuntimeTypes";

const SUPPORTED_MODES: readonly AiOsRuntimeMode[] = ["dry_run", "transport_mock"];

const STYLE_OVERRIDES = new Set([
  "source_faithful",
  "natural_athletic",
  "documentary_fitness",
]);

const QUALITIES = new Set(["standard", "high"]);

const SENSITIVE_INPUT_PATTERNS: RegExp[] = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i,
];

function stringLooksSensitive(text: string): boolean {
  for (const pattern of SENSITIVE_INPUT_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function valueLooksSensitive(value: unknown): boolean {
  if (typeof value === "string") return stringLooksSensitive(value);
  if (Array.isArray(value)) return value.some((item) => valueLooksSensitive(item));
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((nested) =>
      valueLooksSensitive(nested)
    );
  }
  return false;
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.replace(/\s+/g, " ").trim();
    return message.slice(0, 200) || "unknown error";
  }
  return "unknown error";
}

function validateFormatterOptions(
  options: FormatterOptions | undefined
): string[] {
  if (options === undefined) return [];
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    return ["formatterOptions must be an object when provided."];
  }
  const errors: string[] = [];
  if (options.aspectRatio !== undefined) {
    if (typeof options.aspectRatio !== "string" || !options.aspectRatio.trim()) {
      errors.push("formatterOptions.aspectRatio is invalid.");
    } else if (stringLooksSensitive(options.aspectRatio)) {
      errors.push("formatterOptions contain forbidden sensitive content.");
    }
  }
  if (options.seed !== undefined) {
    if (typeof options.seed !== "number" || !Number.isFinite(options.seed)) {
      errors.push("formatterOptions.seed is invalid.");
    }
  }
  if (options.quality !== undefined && !QUALITIES.has(options.quality)) {
    errors.push("formatterOptions.quality is invalid.");
  }
  if (
    options.styleOverride !== undefined &&
    !STYLE_OVERRIDES.has(options.styleOverride)
  ) {
    errors.push("formatterOptions.styleOverride is invalid.");
  }
  return errors;
}

/**
 * Validate runtime input without echoing sensitive values.
 */
export function validateAiOsRuntimeInput(
  input: AiOsRuntimeInput
): AiOsRuntimeInputValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input == null || typeof input !== "object") {
    return {
      valid: false,
      errors: ["Runtime input is invalid."],
      warnings,
    };
  }

  if (
    typeof input.mode !== "string" ||
    !SUPPORTED_MODES.includes(input.mode as AiOsRuntimeMode)
  ) {
    errors.push("Unsupported runtime mode.");
  }

  if (input.profile === undefined || input.profile === null) {
    errors.push("Runtime profile input is required.");
  }
  if (input.goal === undefined || input.goal === null) {
    errors.push("Runtime goal input is required.");
  }

  errors.push(...validateFormatterOptions(input.formatterOptions));

  if (input.mode === "dry_run") {
    if (input.validationEvidence !== undefined) {
      errors.push(
        "validationEvidence is not allowed in dry_run mode."
      );
    }
  }

  if (input.mode === "transport_mock") {
    if (input.sourceImage === undefined || input.sourceImage === null) {
      errors.push("Runtime source image input is invalid.");
    } else {
      const img = input.sourceImage;
      if (
        typeof img !== "object" ||
        Array.isArray(img) ||
        typeof img.value !== "string" ||
        !img.value ||
        (img.kind !== "https_url" && img.kind !== "data_uri")
      ) {
        errors.push("Runtime source image input is invalid.");
      }
    }
  }

  if (input.validationEvidence !== undefined) {
    if (input.mode !== "transport_mock") {
      errors.push(
        "validationEvidence may only be supplied for a transported candidate."
      );
    } else {
      const evidence = input.validationEvidence;
      if (
        evidence == null ||
        typeof evidence !== "object" ||
        evidence.candidate == null ||
        typeof evidence.candidate.candidateId !== "string" ||
        !evidence.candidate.candidateId.trim()
      ) {
        errors.push("Validation evidence input is invalid.");
      } else if (stringLooksSensitive(evidence.candidate.candidateId)) {
        errors.push("Validation evidence input is invalid.");
      }
    }
  }

  if (input.retryState !== undefined) {
    const stateCheck = validateRetryAttemptState(input.retryState);
    if (!stateCheck.valid) {
      errors.push("Runtime retry state is invalid.");
    }
    warnings.push(...stateCheck.warnings);
  }

  if (input.transportConfig !== undefined) {
    const cfg = input.transportConfig;
    if (cfg == null || typeof cfg !== "object" || Array.isArray(cfg)) {
      errors.push("Runtime transport config is invalid.");
    } else if (
      typeof cfg.apiToken === "string" &&
      cfg.apiToken.trim().length > 0
    ) {
      errors.push("Runtime transport config must not expose an API token.");
    } else if (
      typeof cfg.model === "string" &&
      stringLooksSensitive(cfg.model)
    ) {
      errors.push("Runtime transport config is invalid.");
    }
  }

  // Scan profile/goal (and options) for sensitive content; never sourceImage.value.
  const scanTargets: unknown[] = [input.profile, input.goal];
  if (input.formatterOptions !== undefined) {
    scanTargets.push(input.formatterOptions);
  }
  if (input.validationEvidence !== undefined) {
    scanTargets.push(input.validationEvidence);
  }
  if (input.retryState !== undefined) {
    scanTargets.push(input.retryState);
  }
  for (const target of scanTargets) {
    if (valueLooksSensitive(target)) {
      errors.push("Runtime input contained forbidden sensitive content.");
      break;
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Deterministic non-sensitive runtime trace ID from safe structural inputs.
 */
export function buildRuntimeTraceId(input: AiOsRuntimeInput): string {
  const profile =
    input.profile !== null &&
    typeof input.profile === "object" &&
    !Array.isArray(input.profile)
      ? (input.profile as Record<string, unknown>)
      : {};
  const goal =
    input.goal !== null &&
    typeof input.goal === "object" &&
    !Array.isArray(input.goal)
      ? (input.goal as Record<string, unknown>)
      : {};

  const focusZones = Array.isArray(goal.focusZones)
    ? [...goal.focusZones].map(String).sort().join(",")
    : "";

  const payload = [
    `mode:${String(input.mode ?? "")}`,
    `bpsv:${String(profile.schemaVersion ?? "")}`,
    `gsv:${String(goal.schemaVersion ?? "")}`,
    `tw:${String(goal.timelineWeeks ?? "")}`,
    `fz:${focusZones}`,
    `fd:${String(goal.fatDirection ?? "")}`,
    `md:${String(goal.muscleDirection ?? "")}`,
    `rr:${AI_OS_RUNTIME_RULES_VERSION}`,
    `tr:${TRANSFORM_RULES_VERSION}`,
  ].join("|");

  const digest = createHash("sha256").update(payload).digest("hex").slice(0, 12);
  return `aios-runtime-${digest}`;
}

export class AiOsRuntime {
  private readonly dependencies: AiOsRuntimeDependencies;

  constructor(dependencies: AiOsRuntimeDependencies) {
    this.dependencies = dependencies;
  }

  async run(input: AiOsRuntimeInput): Promise<AiOsRuntimeResult> {
    const stages: AiOsRuntimeStageResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const artifacts: AiOsRuntimeArtifacts = {};
    const versions: AiOsRuntimeTrace["versions"] = {};
    const mode: AiOsRuntimeMode =
      input?.mode === "transport_mock" ? "transport_mock" : "dry_run";
    const traceId = buildRuntimeTraceId(input ?? ({ mode, profile: {}, goal: {} } as AiOsRuntimeInput));

    const finish = (
      success: boolean,
      terminalOutcome: AiOsRuntimeTerminalOutcome
    ): AiOsRuntimeResult =>
      sanitizeAiOsRuntimeResult({
        success,
        mode,
        terminalOutcome,
        trace: {
          traceId,
          rulesVersion: AI_OS_RUNTIME_RULES_VERSION,
          stages,
          versions,
        },
        artifacts,
        warnings: [...warnings],
        errors: [...errors],
      });

    const pushStage = (
      stage: AiOsRuntimeStage,
      success: boolean,
      startedAt: number,
      stageWarnings: string[],
      stageErrors: string[]
    ): void => {
      stages.push({
        stage,
        success,
        durationMs: Math.max(0, Math.round(this.dependencies.now() - startedAt)),
        warnings: [...stageWarnings],
        errors: [...stageErrors],
      });
    };

    try {
      // 1. Runtime input validation
      const runtimeValidationStarted = this.dependencies.now();
      const runtimeValidation = validateAiOsRuntimeInput(input);
      const runtimeErrors = [...runtimeValidation.errors];
      const runtimeWarnings = [...runtimeValidation.warnings];
      warnings.push(...runtimeWarnings);

      if (input.mode === "transport_mock" && !this.dependencies.transportAdapter) {
        runtimeErrors.push(
          "transport_mock requires an injected transport adapter."
        );
      }

      if (!runtimeValidation.valid || runtimeErrors.length > 0) {
        errors.push(...runtimeErrors);
        pushStage(
          "input_validation",
          false,
          runtimeValidationStarted,
          runtimeWarnings,
          runtimeErrors
        );
        return finish(false, "invalid_input");
      }

      // Domain profile / goal validation
      const profileResult = validateBodyProfile(input.profile);
      const goalResult = validateTransformationGoal(input.goal);
      const validationWarnings = [
        ...profileResult.warnings,
        ...goalResult.warnings,
      ];
      warnings.push(...validationWarnings);

      if (!profileResult.ok || !goalResult.ok) {
        const validationErrors = [
          ...(profileResult.ok ? [] : profileResult.errors),
          ...(goalResult.ok ? [] : goalResult.errors),
        ];
        errors.push(...validationErrors);
        pushStage(
          "input_validation",
          false,
          runtimeValidationStarted,
          [...runtimeWarnings, ...validationWarnings],
          [...runtimeErrors, ...validationErrors]
        );
        return finish(false, "invalid_input");
      }

      pushStage(
        "input_validation",
        true,
        runtimeValidationStarted,
        [...runtimeWarnings, ...validationWarnings],
        []
      );

      const profile = profileResult.value;
      const goal = goalResult.value;

      // 2. TransformationEngine
      const transformStarted = this.dependencies.now();
      const engine = new TransformationEngine();
      const plan = engine.compute(profile, goal);
      warnings.push(...plan.warnings);
      versions.transformationRulesVersion = plan.rulesVersion;
      artifacts.transformationPlan = plan;
      pushStage("transformation", true, transformStarted, plan.warnings, []);

      // 3. VisualDirector
      const visualStarted = this.dependencies.now();
      const direction = directVisual(profile, goal, plan);
      versions.visualDirectionRulesVersion =
        direction.metadata.rulesVersion ?? VISUAL_DIRECTOR_RULES_VERSION;
      artifacts.visualDirection = direction;
      pushStage("visual_direction", true, visualStarted, [], []);

      // 4. RenderPlan
      const renderStarted = this.dependencies.now();
      const renderPlan = buildRenderPlan(plan, direction);
      versions.renderPlanRulesVersion =
        renderPlan.rulesVersion ?? RENDER_PLAN_RULES_VERSION;
      artifacts.renderPlan = renderPlan;
      pushStage("render_plan", true, renderStarted, [], []);

      // 5. RenderPlan validation
      const renderValidationStarted = this.dependencies.now();
      const renderValidation = validateRenderPlan(renderPlan);
      warnings.push(...renderValidation.warnings);
      if (!renderValidation.valid) {
        errors.push(...renderValidation.errors);
        pushStage(
          "render_plan_validation",
          false,
          renderValidationStarted,
          renderValidation.warnings,
          renderValidation.errors
        );
        return finish(false, "invalid_runtime_state");
      }
      pushStage(
        "render_plan_validation",
        true,
        renderValidationStarted,
        renderValidation.warnings,
        []
      );

      // 6. Provider formatting
      const formatStarted = this.dependencies.now();
      const formatter = new FluxFormatter();
      const formatted = formatter.format(renderPlan, input.formatterOptions);
      const formatterWarningMessages = formatted.warnings.map(
        (w) => `${w.code}: ${w.message}`
      );
      warnings.push(...formatterWarningMessages);
      versions.formatterName =
        formatted.metadata.formatterName ?? "FluxFormatter";
      versions.formatterVersion =
        formatted.metadata.formatterVersion ?? FLUX_FORMATTER_VERSION;
      artifacts.formattedRequest = formatted;
      pushStage(
        "provider_formatting",
        true,
        formatStarted,
        formatterWarningMessages,
        []
      );

      // 7. Formatted request validation
      const formattedValidationStarted = this.dependencies.now();
      const formattedValidation = validateFormattedImageRequest(formatted);
      warnings.push(...formattedValidation.warnings);
      if (!formattedValidation.valid) {
        errors.push(...formattedValidation.errors);
        pushStage(
          "formatted_request_validation",
          false,
          formattedValidationStarted,
          formattedValidation.warnings,
          formattedValidation.errors
        );
        return finish(false, "invalid_runtime_state");
      }
      pushStage(
        "formatted_request_validation",
        true,
        formattedValidationStarted,
        formattedValidation.warnings,
        []
      );

      // dry_run ends here
      if (input.mode === "dry_run") {
        const completedStarted = this.dependencies.now();
        pushStage("completed", true, completedStarted, [], []);
        return finish(true, "dry_run_complete");
      }

      // transport_mock
      const adapter = this.dependencies.transportAdapter!;
      versions.transportAdapterId = adapter.id;
      versions.retryOrchestratorRulesVersion = RETRY_ORCHESTRATOR_RULES_VERSION;

      const retryState =
        input.retryState !== undefined
          ? input.retryState
          : createInitialRetryState();

      const transportStarted = this.dependencies.now();
      const transportResult: ReplicateTransportResult = await adapter.generate({
        formattedRequest: formatted,
        sourceImage: input.sourceImage!,
        traceId,
      });
      artifacts.transportResult = transportResult;
      const transportWarnings = [...transportResult.warnings];
      warnings.push(...transportWarnings);

      if (!transportResult.success) {
        pushStage(
          "transport",
          false,
          transportStarted,
          transportWarnings,
          [transportResult.error.message]
        );

        const retryStarted = this.dependencies.now();
        const retryDecision = evaluateRetryTransition({
          state: retryState,
          transportResult,
        });
        artifacts.retryDecision = retryDecision;
        warnings.push(...retryDecision.warnings);
        errors.push(...retryDecision.errors);
        pushStage(
          "retry_orchestration",
          retryDecision.action !== "invalid_state",
          retryStarted,
          retryDecision.warnings,
          retryDecision.errors
        );

        if (retryDecision.action === "retry_same_provider") {
          return finish(false, "retry_required");
        }
        if (
          retryDecision.action === "reject_candidate" ||
          retryDecision.action === "stop_safety_failure" ||
          retryDecision.terminalOutcome === "rejected"
        ) {
          return finish(false, "rejected");
        }
        return finish(false, "transport_failed");
      }

      pushStage("transport", true, transportStarted, transportWarnings, []);

      // Transport success → RetryOrchestrator must await validation
      const transportRetryStarted = this.dependencies.now();
      const transportRetryDecision = evaluateRetryTransition({
        state: retryState,
        transportResult,
      });

      if (transportRetryDecision.action !== "await_validation") {
        artifacts.retryDecision = transportRetryDecision;
        warnings.push(...transportRetryDecision.warnings);
        errors.push(...transportRetryDecision.errors);
        errors.push("Unexpected AI OS runtime failure.");
        pushStage(
          "retry_orchestration",
          false,
          transportRetryStarted,
          transportRetryDecision.warnings,
          [...transportRetryDecision.errors, "Unexpected AI OS runtime failure."]
        );
        return finish(false, "invalid_runtime_state");
      }

      // No evidence → awaiting validation
      if (input.validationEvidence === undefined) {
        artifacts.retryDecision = transportRetryDecision;
        warnings.push(...transportRetryDecision.warnings);
        pushStage(
          "retry_orchestration",
          true,
          transportRetryStarted,
          transportRetryDecision.warnings,
          []
        );
        const awaitingStarted = this.dependencies.now();
        pushStage("awaiting_validation", true, awaitingStarted, [], []);
        return finish(true, "awaiting_validation");
      }

      // Candidate consistency: candidateId = predictionId
      const candidateId = transportResult.predictionId;
      if (input.validationEvidence.candidate.candidateId !== candidateId) {
        errors.push(
          "Validation evidence does not match the transported candidate."
        );
        artifacts.retryDecision = transportRetryDecision;
        pushStage(
          "retry_orchestration",
          true,
          transportRetryStarted,
          transportRetryDecision.warnings,
          []
        );
        return finish(false, "invalid_runtime_state");
      }

      // ResultValidator
      versions.resultValidatorRulesVersion = RESULT_VALIDATOR_RULES_VERSION;
      const validationStarted = this.dependencies.now();
      const validationDecision = evaluateCandidate({
        evidence: input.validationEvidence,
        renderPlan,
        attempt: transportRetryDecision.nextState.attempt,
        maxAttempts: transportRetryDecision.nextState.maxAttempts,
      });
      artifacts.validationDecision = validationDecision;
      pushStage("result_validation", true, validationStarted, [], []);

      // RetryOrchestrator on validation decision (second transition; one stage record)
      const validationRetryStarted = this.dependencies.now();
      const validationRetryDecision = evaluateRetryTransition({
        state: transportRetryDecision.nextState,
        validationDecision,
      });
      artifacts.retryDecision = validationRetryDecision;
      warnings.push(
        ...transportRetryDecision.warnings,
        ...validationRetryDecision.warnings
      );
      errors.push(...validationRetryDecision.errors);
      pushStage(
        "retry_orchestration",
        validationRetryDecision.action !== "invalid_state",
        validationRetryStarted,
        validationRetryDecision.warnings,
        validationRetryDecision.errors
      );

      if (validationRetryDecision.action === "accept_candidate") {
        const completedStarted = this.dependencies.now();
        pushStage("completed", true, completedStarted, [], []);
        return finish(true, "accepted");
      }

      if (validationRetryDecision.action === "retry_same_provider") {
        return finish(false, "retry_required");
      }

      if (
        validationRetryDecision.action === "reject_candidate" ||
        validationRetryDecision.action === "stop_safety_failure" ||
        validationRetryDecision.terminalOutcome === "rejected"
      ) {
        return finish(false, "rejected");
      }

      if (
        validationRetryDecision.action === "stop_budget_exhausted" ||
        validationRetryDecision.terminalOutcome === "retry_budget_exhausted"
      ) {
        return finish(false, "rejected");
      }

      return finish(false, "invalid_runtime_state");
    } catch (error) {
      void sanitizeErrorMessage(error);
      const message = "Unexpected AI OS runtime failure.";
      errors.push(message);
      if (stages.length === 0) {
        pushStage("input_validation", false, this.dependencies.now(), [], [
          message,
        ]);
      } else {
        const last = stages[stages.length - 1];
        if (last) {
          last.success = false;
          last.errors = [...last.errors, message];
        }
      }
      return finish(false, "invalid_runtime_state");
    }
  }
}
