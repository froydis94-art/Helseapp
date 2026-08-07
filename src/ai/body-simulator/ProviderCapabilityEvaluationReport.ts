/**
 * Provider Capability Evaluation Report (Demand 022E-D).
 *
 * Frozen factual inventory + architecture recommendation derived from repository
 * inspection only. Investigation / documentation — does not change routing,
 * providers, moderation, physiology, or prompts.
 *
 * Internal / documentation use only. No paid provider calls.
 */

export const PROVIDER_CAPABILITY_EVALUATION_SCHEMA_VERSION = 1 as const;

export type CapabilityRating =
  | "Excellent"
  | "Good"
  | "Acceptable"
  | "Poor"
  | "Unknown";

export type ProviderModelRole =
  | "primary"
  | "fallback"
  | "diagnostic_only"
  | "legacy_only"
  | "unsuitable"
  | "unknown";

export type ArchitectureOptionId =
  | "single_model"
  | "ordered_fallback"
  | "transformation_aware_routing"
  | "moderation_fallback";

export interface ProviderInventoryEntry {
  id: string;
  provider: string;
  model: string;
  implementationFiles: string[];
  endpoint: string;
  sourceImageField: string;
  requestContractNotes: string;
  imageEditCapable: boolean;
  textToImageCapable: boolean;
  productionInternalStatus: string;
  currentUsage: string;
  fallbackRole: string;
  retryRole: string;
  moderationHandling: string;
  timeoutBehavior: string;
  outputParsing: string;
  knownTests: string[];
}

export interface LegacyCascadeAttemptSpec {
  order: number;
  label: string;
  model: string;
  promptVariant: "" | "dev" | "devStrong";
  whenIncluded: string;
}

export interface LegacyGenerationCascadeReport {
  schemaVersion: 1;
  entryPoint: string;
  helper: string;
  firstModelSelection: string;
  e005FallbackExists: boolean;
  e005ContinuesCascade: boolean;
  fallbackChangesModel: boolean;
  fallbackChangesProvider: boolean;
  promptChangesBetweenAttempts: boolean;
  imageBytesChangeBetweenAttempts: boolean;
  safetyToleranceChangesBetweenAttempts: boolean;
  requestContractChangesBetweenAttempts: boolean;
  cascadeBudgetMs: number;
  attemptPollTimeoutMs: number;
  safetyToleranceFlux: number;
  attemptsMildEdit: LegacyCascadeAttemptSpec[];
  attemptsDemandingEdit: LegacyCascadeAttemptSpec[];
  attemptsHighE005RiskMaxFirst: LegacyCascadeAttemptSpec[];
  evidenceCitations: string[];
}

export interface LiveBodySimulatorProviderPathReport {
  provider: string;
  model: string;
  attempts: number;
  fallbackExists: boolean;
  retryExists: boolean;
  silentLegacyFallback: boolean;
  e005Handling: string;
  helper: string;
  evidenceCitations: string[];
}

export interface CapabilityRow {
  modelId: string;
  ratings: Record<string, CapabilityRating>;
}

export interface ArchitectureOptionEvaluation {
  id: ArchitectureOptionId;
  label: string;
  technicalComplexity: string;
  qualityConsistency: string;
  cost: string;
  latency: string;
  observability: string;
  providerLockIn: string;
  moderationReliability: string;
  operationalRisk: string;
  notes: string;
}

export interface ProviderCapabilityEvaluationReport {
  schemaVersion: 1;
  currentPrimary: {
    provider: string;
    model: string;
  };
  legacyCascade: {
    attempts: LegacyCascadeAttemptSpec[];
    e005FallbackExists: boolean;
    fallbackModels: string[];
  };
  liveBodySimulatorPath: {
    provider: string;
    model: string;
    attempts: number;
    fallbackExists: boolean;
  };
  providerInventory: ProviderInventoryEntry[];
  providerCapabilities: CapabilityRow[];
  modelRoles: Array<{ modelId: string; role: ProviderModelRole; rationale: string }>;
  architectureOptions: {
    singleModel: ArchitectureOptionEvaluation;
    orderedFallback: ArchitectureOptionEvaluation;
    transformationAwareRouting: ArchitectureOptionEvaluation;
    moderationFallback: ArchitectureOptionEvaluation;
  };
  recommendation: {
    preferredArchitecture: ArchitectureOptionId;
    reasons: string[];
    risks: string[];
  };
  e005AttributionUpdate: {
    priorClassification: string;
    priorConfidence: string;
    updatedInterpretation: string;
    confidence: string;
    reasons: string[];
  };
  asymmetryStatement: {
    statement: string;
    provenTrue: boolean;
    evidenceCitations: string[];
  };
  manualExperiment: {
    candidateModels: string[];
    maxPaidRequests: number;
    case: {
      bfNow: number;
      bfGoal: number;
      horizon: string;
      zones: string[];
      intensity: string;
    };
  };
  productPolicyRequirements: string[];
  ownerDecisionsRequired: string[];
}

/** Models referenced by Vercel Future You / AI OS paths (Replicate). */
export const REPLICATE_FLUX_KONTEXT_PRO =
  "black-forest-labs/flux-kontext-pro" as const;
export const REPLICATE_FLUX_KONTEXT_MAX =
  "black-forest-labs/flux-kontext-max" as const;
export const REPLICATE_FLUX_KONTEXT_DEV =
  "black-forest-labs/flux-kontext-dev" as const;
export const REPLICATE_SDXL_VERSIONED =
  "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc" as const;
export const OPENAI_DEFAULT_EDIT_MODEL = "gpt-image-1" as const;

const CAPABILITY_KEYS = [
  "image_to_image_editing",
  "identity_preservation",
  "pose_preservation",
  "clothing_preservation",
  "background_preservation",
  "fine_body_composition_editing",
  "reduce_visible_body_fat",
  "increase_muscle_definition",
  "increase_muscle_volume",
  "natural_proportions",
  "photorealism",
  "low_noop_tendency",
  "adult_progress_photo_suitability",
  "underwear_progress_photo_reliability",
  "provider_moderation_compatibility",
  "latency",
  "cost",
  "implementation_maturity",
  "fallback_suitability",
  "production_suitability",
] as const;

function ratings(
  partial: Partial<Record<(typeof CAPABILITY_KEYS)[number], CapabilityRating>>
): Record<string, CapabilityRating> {
  const out: Record<string, CapabilityRating> = {};
  for (const key of CAPABILITY_KEYS) {
    out[key] = partial[key] ?? "Unknown";
  }
  return out;
}

/**
 * Deterministic legacy cascade attempt lists (inspection of lib/replicate.js).
 * Image bytes and safety_tolerance stay constant across Flux attempts.
 */
export function buildLegacyGenerationCascadeReport(): LegacyGenerationCascadeReport {
  const mild: LegacyCascadeAttemptSpec[] = [
    {
      order: 1,
      label: "flux-pro",
      model: REPLICATE_FLUX_KONTEXT_PRO,
      promptVariant: "",
      whenIncluded: "preferMax=false (mild edit)",
    },
    {
      order: 2,
      label: "flux-max",
      model: REPLICATE_FLUX_KONTEXT_MAX,
      promptVariant: "",
      whenIncluded: "preferMax=false; skipped if prior premium E005",
    },
    {
      order: 3,
      label: "flux-dev",
      model: REPLICATE_FLUX_KONTEXT_DEV,
      promptVariant: "dev",
      whenIncluded: "always in cascade list when budget remains",
    },
    {
      order: 4,
      label: "flux-dev-strong",
      model: REPLICATE_FLUX_KONTEXT_DEV,
      promptVariant: "devStrong",
      whenIncluded: "always in cascade list when budget remains",
    },
  ];

  const demanding: LegacyCascadeAttemptSpec[] = [
    {
      order: 1,
      label: "flux-max",
      model: REPLICATE_FLUX_KONTEXT_MAX,
      promptVariant: "",
      whenIncluded: "preferMax=true (demanding edit)",
    },
    {
      order: 2,
      label: "flux-pro",
      model: REPLICATE_FLUX_KONTEXT_PRO,
      promptVariant: "",
      whenIncluded: "preferMax=true; skipped if prior premium E005",
    },
    {
      order: 3,
      label: "flux-dev",
      model: REPLICATE_FLUX_KONTEXT_DEV,
      promptVariant: "dev",
      whenIncluded: "always in cascade list when budget remains",
    },
    {
      order: 4,
      label: "flux-dev-strong",
      model: REPLICATE_FLUX_KONTEXT_DEV,
      promptVariant: "devStrong",
      whenIncluded: "always in cascade list when budget remains",
    },
  ];

  const highE005: LegacyCascadeAttemptSpec[] = [
    {
      order: 1,
      label: "flux-max",
      model: REPLICATE_FLUX_KONTEXT_MAX,
      promptVariant: "",
      whenIncluded: "preferMax && isHighE005Risk → skipSiblingPremium",
    },
    {
      order: 2,
      label: "flux-dev",
      model: REPLICATE_FLUX_KONTEXT_DEV,
      promptVariant: "dev",
      whenIncluded: "Pro sibling omitted up front",
    },
    {
      order: 3,
      label: "flux-dev-strong",
      model: REPLICATE_FLUX_KONTEXT_DEV,
      promptVariant: "devStrong",
      whenIncluded: "Pro sibling omitted up front",
    },
  ];

  return {
    schemaVersion: 1,
    entryPoint: "api/generate-future-you.js → generateWithReplicate (flag OFF)",
    helper: "lib/replicate.js generateWithReplicate",
    firstModelSelection:
      "needsMaxEdit(...) ? flux-kontext-max : flux-kontext-pro (code-owned; REPLICATE_MODEL ignored unless REPLICATE_ALLOW_MODEL_ENV=1)",
    e005FallbackExists: true,
    e005ContinuesCascade: true,
    fallbackChangesModel: true,
    fallbackChangesProvider: false,
    promptChangesBetweenAttempts: true,
    imageBytesChangeBetweenAttempts: false,
    safetyToleranceChangesBetweenAttempts: false,
    requestContractChangesBetweenAttempts: true,
    cascadeBudgetMs: 130000,
    attemptPollTimeoutMs: 35000,
    safetyToleranceFlux: 2,
    attemptsMildEdit: mild,
    attemptsDemandingEdit: demanding,
    attemptsHighE005RiskMaxFirst: highE005,
    evidenceCitations: [
      "lib/replicate.js:24-28 DEFAULT/SECONDARY/TERTIARY/SDXL model constants",
      "lib/replicate.js:335-367 needsMaxEdit routing",
      "lib/replicate.js:1548-1550 isSafetyBlock (E005)",
      "lib/replicate.js:1566-1569 isHighE005Risk",
      "lib/replicate.js:1755-1762 Flux input contract safety_tolerance:2",
      "lib/replicate.js:2206-2239 attempts array construction",
      "lib/replicate.js:2320-2347 E005 → skip sibling premium → continue cascade",
      "lib/visuellPrompt.js:427-434 promptVariant dev/devStrong force lines",
    ],
  };
}

export function buildLiveBodySimulatorProviderPathReport(): LiveBodySimulatorProviderPathReport {
  return {
    provider: "replicate",
    // Mild edits start on Pro; demanding / high-E005 routes Max-first (022E-E).
    model: REPLICATE_FLUX_KONTEXT_PRO,
    attempts: 3,
    fallbackExists: true,
    retryExists: false,
    silentLegacyFallback: false,
    e005Handling:
      "Eligible failures continue ordered Flux cascade (Max/Pro/Dev per buildFluxAttemptPlan); all-fail → live_preview_provider_failed + ProviderSafetyAttributionDiagnostic; no generateWithReplicate reservedrift recovery",
    helper:
      "lib/replicate.js runFluxKontextAnatomicalCascade — injected as fluxCascade (022E-E)",
    evidenceCitations: [
      "api/generate-future-you.js live path injects fluxCascade; catch without legacy recovery",
      "lib/replicate.js buildFluxAttemptPlan + runFluxKontextAnatomicalCascade",
      "src/ai/body-simulator/LiveFuturePreviewPipeline.ts intelligent Flux ordered fallback",
      "docs/CTO/22E_ANATOMICAL_LIVE_PREVIEW_INTEGRATION.md Patch 022E-E",
    ],
  };
}

export function buildProviderInventory(): ProviderInventoryEntry[] {
  return [
    {
      id: "replicate-flux-kontext-pro",
      provider: "replicate",
      model: REPLICATE_FLUX_KONTEXT_PRO,
      implementationFiles: [
        "lib/replicate.js",
        "src/ai/transport/ReplicateTransportAdapter.ts",
        "src/ai/transport/ReplicateTransportConfig.ts",
        "api/generate-future-you.js",
        "api/ai-os-image-preview.ts",
      ],
      endpoint:
        "POST https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions",
      sourceImageField: "input_image",
      requestContractNotes:
        "prompt, input_image, aspect_ratio=match_input_image, output_format=png, safety_tolerance=2, prompt_upsampling (legacy/live helpers)",
      imageEditCapable: true,
      textToImageCapable: false,
      productionInternalStatus:
        "Production default (Vercel Future You); AI OS internal preview default; live Body Simulator path (flag ON)",
      currentUsage: "primary / default",
      fallbackRole: "legacy secondary when Max-first",
      retryRole: "legacy cascade participant",
      moderationHandling: "external Replicate/Flux; E005 via isSafetyBlock",
      timeoutBehavior:
        "Prefer wait≤12s; Cancel-After attempt budget; poll ≤35s; cascade budget 155s (legacy)",
      outputParsing: "prediction.output URL → returned imageUrl",
      knownTests: [
        "src/ai/__tests__/imagePreview.test.ts",
        "src/ai/__tests__/replicateTransportAdapter.test.ts",
        "src/ai/__tests__/anatomicalLivePreview.test.ts",
        "src/ai/__tests__/providerSafetyAttribution.test.ts",
      ],
    },
    {
      id: "replicate-flux-kontext-max",
      provider: "replicate",
      model: REPLICATE_FLUX_KONTEXT_MAX,
      implementationFiles: ["lib/replicate.js"],
      endpoint:
        "POST https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-max/predictions",
      sourceImageField: "input_image",
      requestContractNotes: "Same Flux Kontext input builder as Pro (buildModelInput)",
      imageEditCapable: true,
      textToImageCapable: false,
      productionInternalStatus:
        "Legacy cascade only (Vercel Future You flag OFF); not used by live Body Simulator path",
      currentUsage: "legacy primary when needsMaxEdit; else second premium",
      fallbackRole: "premium sibling / demanding primary",
      retryRole: "legacy cascade participant; skipped after sibling premium E005",
      moderationHandling: "external; E005 treated as safetyHit",
      timeoutBehavior: "Same per-attempt budget as Pro inside cascade",
      outputParsing: "Same as Pro",
      knownTests: [
        "Cascade constants asserted via providerCapabilityEvaluation / source inspection",
      ],
    },
    {
      id: "replicate-flux-kontext-dev",
      provider: "replicate",
      model: REPLICATE_FLUX_KONTEXT_DEV,
      implementationFiles: ["lib/replicate.js", "lib/visuellPrompt.js"],
      endpoint:
        "POST https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-dev/predictions",
      sourceImageField: "input_image",
      requestContractNotes:
        "Same Flux fields; promptVariant dev|devStrong appends stronger recomposition force in byggVisuellPrompt",
      imageEditCapable: true,
      textToImageCapable: false,
      productionInternalStatus: "Legacy cascade recovery only",
      currentUsage: "third/fourth legacy attempts after premium failures",
      fallbackRole: "E005 / timeout recovery within Replicate",
      retryRole: "two labeled Dev attempts (dev, devStrong)",
      moderationHandling: "external; own model policy",
      timeoutBehavior: "Same cascade budgets",
      outputParsing: "Same as Pro",
      knownTests: [
        "lib/visuellPrompt.js promptVariant covered indirectly; cascade order in 022E-D tests",
      ],
    },
    {
      id: "replicate-sdxl",
      provider: "replicate",
      model: REPLICATE_SDXL_VERSIONED,
      implementationFiles: ["lib/replicate.js"],
      endpoint: "POST https://api.replicate.com/v1/predictions (versioned)",
      sourceImageField: "image",
      requestContractNotes:
        "prompt, negative_prompt, image, prompt_strength, num_inference_steps, guidance_scale, apply_watermark — different from Flux",
      imageEditCapable: true,
      textToImageCapable: false,
      productionInternalStatus:
        "Legacy emergency slot only; skipped for body transforms (isBodyTransformEdit); never returned as success for Future You body edits",
      currentUsage: "effectively unused for Future You body transforms",
      fallbackRole: "sdxl-emergency label; hard-failed if it produces output",
      retryRole: "optional last attempt when not body transform",
      moderationHandling: "external",
      timeoutBehavior: "Same cascade budgets",
      outputParsing: "Same URL extract; then explicitly rejected for body transforms",
      knownTests: ["Comments + isBodyTransformEdit / sdxl-emergency guards in lib/replicate.js"],
    },
    {
      id: "openai-images-edits",
      provider: "openai",
      model: OPENAI_DEFAULT_EDIT_MODEL,
      implementationFiles: ["server/lib/imageProviders.js", "server/index.js"],
      endpoint: "POST https://api.openai.com/v1/images/edits",
      sourceImageField: "image (multipart form)",
      requestContractNotes:
        "FormData: image, prompt, model, n=1, size 1024x1536 (gpt-image*) or 1024x1024",
      imageEditCapable: true,
      textToImageCapable: false,
      productionInternalStatus:
        "Expo/local server path only (IMAGE_PROVIDER default openai). Not wired to Vercel api/generate-future-you.js",
      currentUsage: "local/dev Express server Future You",
      fallbackRole: "none in Vercel path",
      retryRole: "none (single request)",
      moderationHandling: "external OpenAI",
      timeoutBehavior: "single fetch; no cascade in imageProviders.js",
      outputParsing: "b64_json or url from data[0]",
      knownTests: ["Not in AI OS test:ai suite; server module present in repo"],
    },
    {
      id: "replicate-transport-adapter-ai-os",
      provider: "replicate",
      model: REPLICATE_FLUX_KONTEXT_PRO,
      implementationFiles: [
        "src/ai/transport/ReplicateTransportAdapter.ts",
        "src/ai/control-room/ImagePreviewService.ts",
      ],
      endpoint:
        "POST https://api.replicate.com/v1/models/{model}/predictions (configurable AI_OS_V2_REPLICATE_MODEL)",
      sourceImageField: "input_image",
      requestContractNotes:
        "FormattedImageRequest → Flux fields; safety_tolerance=2; optional EXCLUSIONS appendix",
      imageEditCapable: true,
      textToImageCapable: false,
      productionInternalStatus:
        "Internal AI OS preview / transport foundation; live Body Simulator path after 022E-A uses runFluxKontextProOnce instead",
      currentUsage: "Control Room image preview when enabled",
      fallbackRole: "none (single cycle)",
      retryRole: "RetryOrchestrator exists separately; preview path is one request",
      moderationHandling: "external; sanitized errors",
      timeoutBehavior: "create/total/poll timeouts from ReplicateTransportConfig",
      outputParsing: "ReplicateTransportResult imageUrl",
      knownTests: [
        "src/ai/__tests__/replicateTransportAdapter.test.ts",
        "src/ai/__tests__/imagePreview.test.ts",
      ],
    },
  ];
}

export function buildProviderCapabilityEvaluationReport(): ProviderCapabilityEvaluationReport {
  const legacy = buildLegacyGenerationCascadeReport();
  const live = buildLiveBodySimulatorProviderPathReport();
  const inventory = buildProviderInventory();

  return {
    schemaVersion: PROVIDER_CAPABILITY_EVALUATION_SCHEMA_VERSION,
    currentPrimary: {
      provider: "replicate",
      model: REPLICATE_FLUX_KONTEXT_PRO,
    },
    legacyCascade: {
      attempts: legacy.attemptsMildEdit,
      e005FallbackExists: legacy.e005FallbackExists,
      fallbackModels: [
        REPLICATE_FLUX_KONTEXT_MAX,
        REPLICATE_FLUX_KONTEXT_PRO,
        REPLICATE_FLUX_KONTEXT_DEV,
      ],
    },
    liveBodySimulatorPath: {
      provider: live.provider,
      model: live.model,
      attempts: live.attempts,
      fallbackExists: live.fallbackExists,
    },
    providerInventory: inventory,
    providerCapabilities: [
      {
        modelId: REPLICATE_FLUX_KONTEXT_PRO,
        ratings: ratings({
          image_to_image_editing: "Excellent",
          implementation_maturity: "Excellent",
          production_suitability: "Good",
          fallback_suitability: "Acceptable",
          cost: "Good",
          // Repo encodes Max as ~2× vs Pro for demanding edits — Pro is cost-control default.
          latency: "Unknown",
          provider_moderation_compatibility: "Unknown",
          underwear_progress_photo_reliability: "Unknown",
          fine_body_composition_editing: "Unknown",
          reduce_visible_body_fat: "Unknown",
          low_noop_tendency: "Unknown",
          identity_preservation: "Unknown",
          pose_preservation: "Unknown",
          clothing_preservation: "Unknown",
          background_preservation: "Unknown",
          increase_muscle_definition: "Unknown",
          increase_muscle_volume: "Unknown",
          natural_proportions: "Unknown",
          photorealism: "Unknown",
          adult_progress_photo_suitability: "Acceptable",
        }),
      },
      {
        modelId: REPLICATE_FLUX_KONTEXT_MAX,
        ratings: ratings({
          image_to_image_editing: "Excellent",
          implementation_maturity: "Good",
          production_suitability: "Acceptable",
          fallback_suitability: "Good",
          cost: "Acceptable",
          // Comment in needsMaxEdit: ~2× cost, stronger adherence — relative only.
          latency: "Unknown",
          provider_moderation_compatibility: "Unknown",
          underwear_progress_photo_reliability: "Unknown",
          fine_body_composition_editing: "Unknown",
          reduce_visible_body_fat: "Unknown",
          low_noop_tendency: "Unknown",
          adult_progress_photo_suitability: "Acceptable",
        }),
      },
      {
        modelId: REPLICATE_FLUX_KONTEXT_DEV,
        ratings: ratings({
          image_to_image_editing: "Excellent",
          implementation_maturity: "Good",
          production_suitability: "Acceptable",
          fallback_suitability: "Good",
          cost: "Unknown",
          latency: "Unknown",
          provider_moderation_compatibility: "Unknown",
          underwear_progress_photo_reliability: "Unknown",
          fine_body_composition_editing: "Unknown",
          low_noop_tendency: "Unknown",
          adult_progress_photo_suitability: "Acceptable",
        }),
      },
      {
        modelId: REPLICATE_SDXL_VERSIONED,
        ratings: ratings({
          image_to_image_editing: "Acceptable",
          implementation_maturity: "Acceptable",
          production_suitability: "Poor",
          fallback_suitability: "Poor",
          photorealism: "Poor",
          // Repo: high strength → cartoons; never success for body transforms.
          natural_proportions: "Poor",
          adult_progress_photo_suitability: "Poor",
          cost: "Unknown",
          latency: "Unknown",
        }),
      },
      {
        modelId: OPENAI_DEFAULT_EDIT_MODEL,
        ratings: ratings({
          image_to_image_editing: "Good",
          implementation_maturity: "Acceptable",
          production_suitability: "Unknown",
          fallback_suitability: "Unknown",
          // Present on Expo server only; no Body Simulator contract parity proven.
          cost: "Unknown",
          latency: "Unknown",
          provider_moderation_compatibility: "Unknown",
          underwear_progress_photo_reliability: "Unknown",
          adult_progress_photo_suitability: "Unknown",
        }),
      },
    ],
    modelRoles: [
      {
        modelId: REPLICATE_FLUX_KONTEXT_PRO,
        role: "primary",
        rationale:
          "Code default + live Body Simulator helper + AI OS transport default. Recommendation only — owner may change.",
      },
      {
        modelId: REPLICATE_FLUX_KONTEXT_MAX,
        role: "fallback",
        rationale:
          "Already legacy demanding primary / premium sibling. Candidate ordered fallback after Pro E005 — not enabled on live path.",
      },
      {
        modelId: REPLICATE_FLUX_KONTEXT_DEV,
        role: "fallback",
        rationale:
          "Legacy E005/timeout recovery with promptVariant escalation. Strong manual-eval candidate for moderation compatibility.",
      },
      {
        modelId: REPLICATE_SDXL_VERSIONED,
        role: "unsuitable",
        rationale:
          "Explicitly skipped/rejected for Future You body transforms due to cartoon risk.",
      },
      {
        modelId: OPENAI_DEFAULT_EDIT_MODEL,
        role: "diagnostic_only",
        rationale:
          "Implemented on Expo server only; not on Vercel Future You / Body Simulator live contract. Manual cross-provider eval would need owner-approved adapter work.",
      },
    ],
    architectureOptions: {
      singleModel: {
        id: "single_model",
        label: "OPTION A — Single model",
        technicalComplexity: "Low",
        qualityConsistency: "High when accepted",
        cost: "Lowest per success",
        latency: "Lowest when accepted",
        observability: "Simple",
        providerLockIn: "High",
        moderationReliability:
          "Fragile — one external E005 ends the request (current live path)",
        operationalRisk: "Medium — false hard-fail when sibling models might accept",
        notes:
          "Pre-022E-E Body Simulator live path (Pro-only). Superseded by ordered fallback in 022E-E.",
      },
      orderedFallback: {
        id: "ordered_fallback",
        label: "OPTION B — Ordered fallback",
        technicalComplexity: "Medium",
        qualityConsistency: "Medium (model mix)",
        cost: "Higher on failure paths (multiple paid attempts)",
        latency: "Higher on failure paths",
        observability: "Needs per-attempt diagnostics (legacy has labels)",
        providerLockIn: "Medium (still Replicate-family today)",
        moderationReliability:
          "Better — each model judged under its own policy; not a safety bypass",
        operationalRisk: "Medium — cost/latency budgets; quality variance",
        notes:
          "IMPLEMENTED by Patch 022E-E via buildFluxAttemptPlan + runFluxKontextAnatomicalCascade (same anatomical prompt; max 3 attempts; no SDXL / no Dev-strong reservedrift).",
      },
      transformationAwareRouting: {
        id: "transformation_aware_routing",
        label: "OPTION C — Transformation-aware routing",
        technicalComplexity: "High",
        qualityConsistency: "Potentially high if calibrated",
        cost: "Variable (Max-first already ~2× for demanding legacy edits)",
        latency: "Variable",
        observability: "Complex (routing reasons + outcomes)",
        providerLockIn: "Medium",
        moderationReliability: "Unknown without calibration",
        operationalRisk: "High — routing bugs can mis-assign models",
        notes:
          "Legacy already has a partial form via needsMaxEdit / isHighE005Risk. Full Body Simulator-aware routing would need owner policy.",
      },
      moderationFallback: {
        id: "moderation_fallback",
        label: "OPTION D — Provider/moderation fallback",
        technicalComplexity: "High",
        qualityConsistency: "Lowest (cross-provider)",
        cost: "Unknown / external verification required",
        latency: "Unknown",
        observability: "Harder (heterogeneous contracts)",
        providerLockIn: "Lower long-term",
        moderationReliability:
          "Different external policies — still not a HelseApp bypass",
        operationalRisk: "High — contract parity, billing, dual moderation UX",
        notes:
          "OpenAI edits exist on Expo server only; no Vercel Body Simulator adapter yet. Premature without manual candidates proving Replicate-family insufficiency.",
      },
    },
    recommendation: {
      preferredArchitecture: "ordered_fallback",
      reasons: [
        "Legacy cascade already proves E005 on a premium Flux model can continue to alternate Flux models under their own moderation (lib/replicate.js safetyHit → next attempt).",
        "Live Body Simulator path asymmetry makes Pro-only E005 look like a hard product failure even when sibling models might accept the same legitimate progress photo.",
        "Ordered fallback preserves a single primary for the success path while improving reliability without weakening HelseApp or provider safety rules.",
        "Lower complexity and lock-in risk than transformation-aware or cross-provider moderation fallback before manual single-model evidence exists.",
      ],
      risks: [
        "Multiple paid attempts increase cost and latency on failure paths.",
        "Quality may differ across Pro/Max/Dev for the same anatomical intent.",
        "Without attempt-level diagnostics, owners cannot tell which model succeeded.",
        "Must never be framed or implemented as a moderation bypass.",
      ],
    },
    e005AttributionUpdate: {
      priorClassification: "likely_prompt_image_combination",
      priorConfidence: "medium",
      updatedInterpretation:
        "unknown_confounded_by_cascade_asymmetry_with_model_specific_moderation_hypothesis",
      confidence: "medium",
      reasons: [
        "022E-C parity: live Pro contract matches legacy Flux fields; sensitive lexemes can be zero; image serialization can match legacy.",
        "Part 4 asymmetry proven: legacy may continue after Pro/Max E005; live stops after one Pro request.",
        "Therefore legacy-success vs live-E005 comparisons cannot isolate prompt-only vs model-cascade effects without a paid single-model probe.",
        "Not classified as pipeline defect: transport/image/safety_tolerance parity holds in code.",
        "Not claimed as provider-wide input ban: cascade targets other Flux models on same provider.",
      ],
    },
    asymmetryStatement: {
      statement:
        "Pre-022E-E: legacy could fall through after E005 while live Body Simulator stopped after one Flux Kontext Pro request. 022E-E restores ordered Flux fallback on the live anatomical path (still no silent generateWithReplicate reservedrift recovery).",
      provenTrue: true,
      evidenceCitations: [
        "lib/replicate.js generateWithReplicate — legacy cascade (historical asymmetry)",
        "lib/replicate.js runFluxKontextProOnce — former live single-shot helper (kept)",
        "lib/replicate.js runFluxKontextAnatomicalCascade — 022E-E live ordered fallback",
        "api/generate-future-you.js injects fluxCascade; catch still has no generateWithReplicate recovery",
      ],
    },
    manualExperiment: {
      candidateModels: [
        REPLICATE_FLUX_KONTEXT_PRO,
        REPLICATE_FLUX_KONTEXT_MAX,
        REPLICATE_FLUX_KONTEXT_DEV,
      ],
      maxPaidRequests: 3,
      case: {
        bfNow: 22,
        bfGoal: 12,
        horizon: "12m",
        zones: ["abs", "core"],
        intensity: "strong",
      },
    },
    productPolicyRequirements: [
      "HelseApp is adult-only; account users are 18+",
      "Ordinary adult progress photography may include underwear",
      "Visible torso is acceptable",
      "Body-transformation intent is not inherently sexual",
      "HelseApp does not generate pornography",
      "HelseApp does not infer sexual intent from body type or clothing alone",
      "Provider safety remains external and respected",
      "Do not prohibit ordinary underwear solely to accommodate one model",
    ],
    ownerDecisionsRequired: [
      "changing primary provider",
      "changing primary model",
      "enabling a fallback model on the Body Simulator live path",
      "enabling multiple paid provider attempts",
      "changing pricing assumptions",
      "changing provider moderation configuration",
      "production cutover",
      "removing Flux Kontext Pro",
      "selecting a new external provider",
    ],
  };
}

/** Convenience: inventory model ids only (for tests). */
export function listInventoriedModelIds(): string[] {
  return buildProviderInventory().map((e) => e.model);
}
