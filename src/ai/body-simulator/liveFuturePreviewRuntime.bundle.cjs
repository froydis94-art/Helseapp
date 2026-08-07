"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/ai/body-simulator/LiveFuturePreviewPipeline.ts
var LiveFuturePreviewPipeline_exports = {};
__export(LiveFuturePreviewPipeline_exports, {
  BODY_SIMULATOR_LIVE_PREVIEW_ENV: () => BODY_SIMULATOR_LIVE_PREVIEW_ENV,
  LiveFuturePreviewError: () => LiveFuturePreviewError,
  PUBLIC_FOCUS_ZONE_MAP: () => PUBLIC_FOCUS_ZONE_MAP,
  adaptPublicFutureToBodySimulator: () => adaptPublicFutureToBodySimulator,
  assertAnatomicalRulesTranslated: () => assertAnatomicalRulesTranslated,
  buildLiveFuturePreviewTraceStages: () => buildLiveFuturePreviewTraceStages,
  isBodySimulatorLivePreviewEnabled: () => isBodySimulatorLivePreviewEnabled,
  mapPublicBodyFat: () => mapPublicBodyFat,
  mapPublicEffort: () => mapPublicEffort,
  mapPublicFocusZones: () => mapPublicFocusZones,
  mapPublicTimeline: () => mapPublicTimeline,
  prepareLiveFuturePreview: () => prepareLiveFuturePreview,
  runLiveFuturePreview: () => runLiveFuturePreview,
  sha256FileBytes: () => sha256FileBytes
});
module.exports = __toCommonJS(LiveFuturePreviewPipeline_exports);
var import_node_crypto2 = require("node:crypto");

// src/ai/BodyProfile.ts
var BODY_PROFILE_SCHEMA_VERSION = 1;
function resolveBodyFatPct(profile) {
  const v = profile.bodyFatPct ?? profile.bodyFat;
  return typeof v === "number" && Number.isFinite(v) ? v : void 0;
}
function resolveSex(profile) {
  const raw = profile.sex ?? profile.gender;
  if (raw === "female" || raw === "male") return raw;
  return "unspecified";
}

// src/ai/runtime/AiOsRuntimeTypes.ts
var AI_OS_RUNTIME_RULES_VERSION = "1.0";

// src/ai/runtime/AiOsRuntimeFactory.ts
function createAiOsRuntimeDependencies(options) {
  const deps = {
    now: options?.now ?? (() => Date.now())
  };
  if (options?.transportAdapter !== void 0) {
    deps.transportAdapter = options.transportAdapter;
  }
  return deps;
}

// src/ai/runtime/AiOsRuntime.ts
var import_node_crypto = require("node:crypto");

// src/ai/body-simulator/BodySimulatorFormatterAdapter.ts
var CANONICAL_BODY_TRANSFORMATION_SCHEMA_VERSION = 1;
var CANONICAL_BODY_TRANSFORMATION_SOURCE = "body_simulator_v1";
function intensityToVisibility(intensity) {
  switch (intensity) {
    case "conservative":
      return "restrained";
    case "ambitious":
      return "pronounced";
    case "realistic":
    default:
      return "clear";
  }
}
function formatRange(label, range) {
  const unit = range.unit === "percentage_points" ? " pp" : ` ${range.unit}`;
  const lower = range.lower == null ? "n/a" : String(range.lower);
  const expected = range.expected == null ? "n/a" : String(range.expected);
  const upper = range.upper == null ? "n/a" : String(range.upper);
  return `${label}: lower ${lower}${unit}, expected ${expected}${unit}, upper ${upper}${unit} (${range.origin})`;
}
function fatChangePhrase(change) {
  switch (change) {
    case "strong_decrease":
      return "strong fat reduction";
    case "moderate_decrease":
      return "moderate fat reduction";
    case "slight_decrease":
      return "slight fat reduction";
    case "stable":
      return "stable fat";
    case "slight_increase":
      return "slight fat increase";
    case "moderate_increase":
      return "moderate fat increase";
    case "unknown":
    default:
      return "unspecified fat change";
  }
}
function muscleChangePhrase(change) {
  switch (change) {
    case "moderate_decrease":
      return "moderate muscle decrease";
    case "slight_decrease":
      return "slight muscle decrease";
    case "stable":
      return "stable muscle";
    case "slight_increase":
      return "slight muscle increase";
    case "moderate_increase":
      return "moderate muscle increase";
    case "strong_increase":
      return "strong muscle increase";
    case "unknown":
    default:
      return "unspecified muscle change";
  }
}
function fatToRenderKind(change) {
  if (change === "strong_decrease" || change === "moderate_decrease" || change === "slight_decrease") {
    return "fat_reduction";
  }
  if (change === "slight_increase" || change === "moderate_increase") {
    return "fat_increase";
  }
  return null;
}
function muscleToRenderKind(change) {
  if (change === "slight_increase" || change === "moderate_increase" || change === "strong_increase") {
    return "muscle_development";
  }
  return null;
}
function fatToDirection(change) {
  if (change === "strong_decrease" || change === "moderate_decrease" || change === "slight_decrease") {
    return "decrease";
  }
  if (change === "slight_increase" || change === "moderate_increase") {
    return "increase";
  }
  return "maintain";
}
function muscleToDirection(change) {
  if (change === "slight_increase" || change === "moderate_increase" || change === "strong_increase") {
    return "increase";
  }
  if (change === "slight_decrease" || change === "moderate_decrease") {
    return "decrease";
  }
  return "maintain";
}
function regionLabel(region) {
  return region.replace(/_/g, " ");
}
function buildRegionalChange(rule2, visibility) {
  if (rule2.region === "whole_body") {
    return null;
  }
  if (rule2.visibility === "not_visible" || rule2.visibility === "not_assessable") {
    return null;
  }
  if (rule2.fatChange === "stable" && rule2.muscleChange === "stable") {
    return null;
  }
  if (rule2.fatChange === "unknown" && rule2.muscleChange === "unknown") {
    return null;
  }
  const fatKind = fatToRenderKind(rule2.fatChange);
  const muscleKind = muscleToRenderKind(rule2.muscleChange);
  const kind = fatKind ?? muscleKind ?? "regional_change";
  let direction = "refine";
  if (fatKind != null) {
    direction = fatToDirection(rule2.fatChange);
  } else if (muscleKind != null) {
    direction = muscleToDirection(rule2.muscleChange);
  }
  const parts = [
    fatChangePhrase(rule2.fatChange),
    muscleChangePhrase(rule2.muscleChange)
  ];
  const magnitude = rule2.visualMagnitude.expected;
  const description = `Apply Body Simulator regional rule for ${regionLabel(rule2.region)}: ${parts.join("; ")} (expected visual magnitude ${magnitude}). Preserve natural proportions.`;
  return {
    id: `body-sim-region-${rule2.region}`,
    kind,
    direction,
    region: rule2.region,
    visibility,
    description,
    sourcePlanField: "bodySimulator.regions"
  };
}
function anatomicalDirectionPhrase(direction) {
  return direction.replace(/_/g, " ");
}
function anatomicalMagnitudePhrase(magnitude) {
  return magnitude;
}
function anatomicalToRenderKind(rule2) {
  if (rule2.feature.includes("volume") || rule2.feature === "lat_width" || rule2.feature === "whole_body_muscle_volume") {
    return "muscle_development";
  }
  if (rule2.feature === "subcutaneous_fat" || rule2.feature === "waist_width") {
    if (rule2.direction.includes("decrease") || rule2.direction === "more_defined") {
      return "fat_reduction";
    }
    if (rule2.direction.includes("increase")) {
      return "fat_increase";
    }
  }
  if (rule2.direction === "more_defined" || rule2.feature.includes("definition")) {
    return "regional_change";
  }
  return "regional_change";
}
function anatomicalToDirection(direction) {
  if (direction.includes("decrease") || direction === "more_defined") {
    return direction === "more_defined" ? "refine" : "decrease";
  }
  if (direction.includes("increase") || direction === "less_defined") {
    return direction === "less_defined" ? "refine" : "increase";
  }
  if (direction === "stable") return "maintain";
  return "refine";
}
function anatomicalVisibility(magnitude, fallback) {
  switch (magnitude) {
    case "subtle":
      return "restrained";
    case "pronounced":
      return "pronounced";
    case "clear":
      return "clear";
    case "moderate":
    default:
      return fallback;
  }
}
function buildAnatomicalChanges(anatomicalRules, fallbackVisibility) {
  const changes = [];
  const summaries = [];
  const sorted = [...anatomicalRules].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id)
  );
  for (const rule2 of sorted) {
    if (rule2.direction === "stable" && rule2.source === "realism_constraint") {
      summaries.push(
        `${regionLabel(rule2.region)} ${rule2.feature}: ${anatomicalDirectionPhrase(rule2.direction)} (${anatomicalMagnitudePhrase(rule2.magnitude)}; source ${rule2.source}; priority ${rule2.priority})`
      );
      continue;
    }
    const visibility = anatomicalVisibility(rule2.magnitude, fallbackVisibility);
    const description = `Apply anatomical ${rule2.feature.replace(/_/g, " ")} on ${regionLabel(rule2.region)}: ${anatomicalDirectionPhrase(rule2.direction)} at ${anatomicalMagnitudePhrase(rule2.magnitude)} magnitude (source ${rule2.source}, priority ${rule2.priority}). Preserve natural proportions and identity.`;
    summaries.push(
      `${regionLabel(rule2.region)} ${rule2.feature}: ${anatomicalDirectionPhrase(rule2.direction)}; ${anatomicalMagnitudePhrase(rule2.magnitude)}; priority ${rule2.priority}; source ${rule2.source}`
    );
    changes.push({
      id: `body-sim-anatomical-${rule2.id}`,
      kind: anatomicalToRenderKind(rule2),
      direction: anatomicalToDirection(rule2.direction),
      region: rule2.region,
      visibility,
      description,
      sourcePlanField: "bodySimulator.anatomicalTransformation"
    });
  }
  return { changes, summaries };
}
function buildWholeBodyChanges(rules, visibility) {
  const changes = [];
  const wb = rules.wholeBodyChange;
  const goalType = rules.goal.effectiveType;
  changes.push({
    id: "body-sim-whole-body",
    kind: "whole_body_recomposition",
    direction: "refine",
    visibility,
    description: `Apply Body Simulator whole-body ${goalType.replace(/_/g, " ")} over ${rules.goal.timelineWeeks} weeks at ${rules.goal.intensity} intensity. ${formatRange("Weight", wb.weightChangeKg)}. ${formatRange("Body fat", wb.bodyFatChangePercentagePoints)}. ${formatRange("Muscle", wb.muscleChangeKg)}. Expected visualization is not a guarantee.`,
    sourcePlanField: "bodySimulator.wholeBodyChange"
  });
  const fatExpected = wb.bodyFatChangePercentagePoints.expected;
  if (typeof fatExpected === "number" && fatExpected < 0) {
    changes.push({
      id: "body-sim-fat-reduction",
      kind: "fat_reduction",
      direction: "decrease",
      visibility,
      description: `Reduce visible soft tissue consistent with Body Simulator body-fat change (expected ${fatExpected} percentage points). Preserve natural anatomy and source identity.`,
      sourcePlanField: "bodySimulator.wholeBodyChange.bodyFatChangePercentagePoints"
    });
  } else if (typeof fatExpected === "number" && fatExpected > 0) {
    changes.push({
      id: "body-sim-fat-increase",
      kind: "fat_increase",
      direction: "increase",
      visibility,
      description: `Increase soft-tissue fullness modestly consistent with Body Simulator body-fat change (expected ${fatExpected} percentage points). Preserve natural anatomy and source identity.`,
      sourcePlanField: "bodySimulator.wholeBodyChange.bodyFatChangePercentagePoints"
    });
  }
  const muscleExpected = wb.muscleChangeKg.expected;
  if (typeof muscleExpected === "number" && muscleExpected > 0) {
    changes.push({
      id: "body-sim-muscle-development",
      kind: "muscle_development",
      direction: "increase",
      visibility,
      description: `Add proportional muscle development consistent with Body Simulator muscle change (expected ${muscleExpected} kg). Preserve the original skeletal frame.`,
      sourcePlanField: "bodySimulator.wholeBodyChange.muscleChangeKg"
    });
  }
  return changes;
}
function adaptBodySimulatorRulesToFormatterInput(rules) {
  const visibility = intensityToVisibility(rules.goal.intensity);
  const approvedChanges = [
    ...buildWholeBodyChanges(rules, visibility)
  ];
  const regionalSummaries = [];
  for (const region of rules.regions) {
    regionalSummaries.push(
      `${regionLabel(region.region)}: ${fatChangePhrase(region.fatChange)}; ${muscleChangePhrase(region.muscleChange)}; magnitude expected ${region.visualMagnitude.expected}; visibility ${region.visibility}`
    );
  }
  const anatomical = rules.anatomicalTransformation;
  let anatomicalSummaries = [];
  const semanticSupportTerms = anatomical?.semanticSupportTerms ? [...anatomical.semanticSupportTerms] : [];
  if (anatomical && anatomical.rules.length > 0) {
    const { changes, summaries } = buildAnatomicalChanges(
      anatomical.rules,
      visibility
    );
    approvedChanges.push(...changes);
    anatomicalSummaries = summaries;
  } else {
    for (const region of rules.regions) {
      const regional = buildRegionalChange(region, visibility);
      if (regional) {
        approvedChanges.push(regional);
      }
    }
  }
  const wholeBodySummary = [
    formatRange("Weight", rules.wholeBodyChange.weightChangeKg),
    formatRange("Body fat", rules.wholeBodyChange.bodyFatChangePercentagePoints),
    formatRange("Muscle", rules.wholeBodyChange.muscleChangeKg),
    `confidence ${rules.wholeBodyChange.confidence}`
  ].join(" | ");
  return {
    schemaVersion: CANONICAL_BODY_TRANSFORMATION_SCHEMA_VERSION,
    source: CANONICAL_BODY_TRANSFORMATION_SOURCE,
    rulesVersion: rules.rulesVersion,
    simulationId: rules.simulationId,
    goal: {
      requestedType: rules.goal.requestedType,
      effectiveType: rules.goal.effectiveType,
      timelineWeeks: rules.goal.timelineWeeks,
      intensity: rules.goal.intensity
    },
    visualIntensity: rules.goal.intensity,
    changeVisibility: visibility,
    approvedChanges,
    preservation: structuredClone(rules.preservation),
    wholeBodySummary,
    regionalSummaries,
    anatomicalSummaries,
    semanticSupportTerms,
    realism: {
      requestedTargetModerated: rules.realism.requestedTargetModerated,
      unrealisticChangePrevented: rules.realism.unrealisticChangePrevented,
      expectedVisualizationNotGuarantee: true,
      moderationReasons: [...rules.realism.moderationReasons]
    },
    confidenceOverall: rules.confidence.overall
  };
}
function applyCanonicalBodyTransformation(renderPlan, canonical) {
  const next = structuredClone(renderPlan);
  next.transformation = {
    visualIntensity: canonical.visualIntensity,
    changeVisibility: canonical.changeVisibility,
    approvedChanges: structuredClone(canonical.approvedChanges)
  };
  next.trace = {
    ...next.trace,
    transformationRulesVersion: canonical.rulesVersion
  };
  return next;
}
var CONTROL_ROOM_TO_BODY_SIMULATOR_SCENARIO = Object.freeze({
  balanced_recomposition_12w: "body_recomposition_16w",
  upper_body_definition_8w: "fat_loss_muscle_preservation",
  gradual_fat_loss_16w: "realistic_weight_loss_12w",
  athletic_strength_24w: "advanced_muscle_gain_24w"
});

// src/ai/formatters/ProviderFormatter.ts
var SUPPORTED_FORMATTER_ASPECT_RATIOS = [
  "1:1",
  "4:5",
  "3:4",
  "9:16",
  "16:9"
];
var PROMPT_SECTIONS = [
  "SOURCE",
  "IDENTITY",
  "SCENE",
  "TRANSFORM",
  "ANATOMY",
  "REALISM"
];
var INTERNAL_ENUM_KEYS = [
  "source_faithful",
  "natural_athletic",
  "documentary_fitness",
  "restrained",
  "pronounced",
  "preserve_exactly",
  "preserve_with_natural_upright_emphasis",
  "slightly_defined",
  "whole_body_recomposition",
  "fat_reduction",
  "fat_increase",
  "muscle_development",
  "waist_change",
  "regional_change"
];
var FORBIDDEN_PROMPT_MARKERS = [
  "REPLICATE_API_TOKEN",
  "Authorization:",
  "Bearer",
  "api.try",
  "api.replicate",
  "data:image/",
  "prompt_strength",
  "num_inference_steps",
  "denoise",
  "model_version",
  "version hash"
];
var BASE64_LIKE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]{40,}/i;
var URL_LIKE = /https?:\/\/|wss?:\/\//i;
var API_KEY_LIKE = /\b(sk-[A-Za-z0-9]{10,}|r8_[A-Za-z0-9]{10,}|api[_-]?key\s*[:=])/i;
function isSupportedFormatterAspectRatio(value) {
  return SUPPORTED_FORMATTER_ASPECT_RATIOS.includes(
    value
  );
}
function validateFormattedImageRequest(request) {
  const errors = [];
  const warnings = [];
  const families = [
    "flux",
    "gpt_image",
    "imagen",
    "generic"
  ];
  if (!families.includes(request.providerFamily)) {
    errors.push("providerFamily is missing or invalid");
  }
  if (typeof request.prompt !== "string" || request.prompt.trim() === "") {
    errors.push("prompt must be a non-empty string");
  }
  if (request.sourceOperation !== "edit_source_image") {
    errors.push('sourceOperation must be "edit_source_image"');
  }
  const meta = request.metadata;
  if (meta == null || typeof meta.formatterName !== "string" || meta.formatterName.trim() === "" || typeof meta.formatterVersion !== "string" || meta.formatterVersion.trim() === "" || typeof meta.renderPlanSchemaVersion !== "number" || typeof meta.renderPlanRulesVersion !== "string" || meta.renderPlanRulesVersion.trim() === "" || typeof meta.transformationRulesVersion !== "string" || meta.transformationRulesVersion.trim() === "" || typeof meta.visualDirectionRulesVersion !== "string" || meta.visualDirectionRulesVersion.trim() === "" || typeof meta.estimateReliability !== "string" || meta.estimateReliability.trim() === "") {
    errors.push("metadata fields are incomplete");
  }
  if (!Array.isArray(request.warnings)) {
    errors.push("warnings must be an array");
  } else {
    const validCodes = /* @__PURE__ */ new Set([
      "unsupported_capability",
      "degraded_negative_prompt",
      "degraded_structure",
      "unsupported_aspect_ratio",
      "unsupported_style",
      "unsupported_quality",
      "provider_limitation"
    ]);
    for (const warning of request.warnings) {
      if (warning == null || !validCodes.has(warning.code)) {
        errors.push("warning has invalid code");
      }
      if (warning == null || typeof warning.message !== "string" || warning.message.trim() === "") {
        errors.push("warning message must be non-empty");
      }
    }
  }
  if (request.seed !== void 0) {
    if (typeof request.seed !== "number" || !Number.isFinite(request.seed) || !Number.isInteger(request.seed) || request.seed < 0) {
      errors.push("seed must be a finite non-negative integer when present");
    }
  }
  if (request.aspectRatio !== void 0) {
    if (!isSupportedFormatterAspectRatio(request.aspectRatio)) {
      errors.push("aspectRatio is unsupported when present");
    }
  }
  const prompt = request.prompt ?? "";
  const allowDegradedStructure = (request.warnings ?? []).some(
    (warning) => warning?.code === "degraded_structure"
  );
  if (!allowDegradedStructure) {
    for (const section of PROMPT_SECTIONS) {
      if (!prompt.includes(section)) {
        errors.push(`prompt missing section ${section}`);
      }
    }
  }
  const scanTargets = [
    prompt,
    request.negativePrompt ?? "",
    JSON.stringify(request.metadata ?? {})
  ].join("\n");
  if (BASE64_LIKE.test(scanTargets) || /data:image\//i.test(scanTargets)) {
    errors.push("Base64-like content is forbidden");
  }
  if (URL_LIKE.test(scanTargets)) {
    errors.push("URL-like content is forbidden");
  }
  if (API_KEY_LIKE.test(scanTargets)) {
    errors.push("API-key-like content is forbidden");
  }
  for (const marker of FORBIDDEN_PROMPT_MARKERS) {
    if (scanTargets.toLowerCase().includes(marker.toLowerCase())) {
      errors.push(`forbidden transport/provider marker: ${marker}`);
    }
  }
  for (const key of INTERNAL_ENUM_KEYS) {
    const re = new RegExp(`\\b${key}\\b`);
    if (re.test(prompt)) {
      errors.push(`internal enum key leaked into prompt: ${key}`);
    }
  }
  const forbiddenFields = [
    "apiKey",
    "api_key",
    "authorization",
    "headers",
    "timeout",
    "fetch",
    "imageUrl",
    "base64",
    "modelId",
    "model_id",
    "versionHash"
  ];
  const rawKeys = Object.keys(request);
  for (const field of forbiddenFields) {
    if (rawKeys.includes(field)) {
      errors.push(`forbidden transport field present: ${field}`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// src/ai/formatters/FluxFormatter.ts
var FLUX_FORMATTER_VERSION = "1.0";
var FLUX_CAPABILITIES = [
  "negative_prompt",
  "aspect_ratio",
  "seed",
  "quality",
  "style",
  "source_image_edit",
  "identity_preservation",
  "structured_instructions"
];
function translatePresentationStyle(style) {
  switch (style) {
    case "source_faithful":
      return "Keep the original photograph highly faithful to the source.";
    case "natural_athletic":
      return "Present the approved changes with a natural athletic appearance.";
    case "documentary_fitness":
      return "Use a realistic documentary fitness-photo presentation.";
    default:
      return "Keep the photographic presentation faithful to the source photograph.";
  }
}
function translateVisibility(visibility) {
  switch (visibility) {
    case "restrained":
      return "Keep the visible transformation subtle and understated.";
    case "clear":
      return "Make the approved transformation clearly visible while remaining realistic.";
    case "pronounced":
      return "Make the approved transformation strongly visible without exaggeration.";
    default:
      return "Apply only the approved transformation with realistic visibility.";
  }
}
function translateTextureStyle(texture) {
  switch (texture) {
    case "slightly_defined":
      return "Use slightly defined natural skin and muscle texture without artificial gloss.";
    case "natural":
      return "Keep natural skin texture and pores.";
    default:
      return "Keep natural photographic texture.";
  }
}
function isPresentationStyle(value) {
  return value === "source_faithful" || value === "natural_athletic" || value === "documentary_fitness";
}
function uniqueStable(lines) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
function buildSourceSection(plan) {
  const lines = [
    "Edit this exact source photograph.",
    plan.source.preserveSourceComposition ? "Keep the source composition." : "Keep the source composition.",
    "Do not generate a new person or a new scene."
  ];
  return ["SOURCE", ...lines].join("\n");
}
function buildIdentitySection(plan) {
  const lines = [];
  if (plan.identity.preservePerson) {
    lines.push("Preserve the same person as the source photograph.");
  }
  if (plan.identity.preserveFace) {
    lines.push("Preserve the same face.");
  }
  if (plan.identity.preserveApparentAge) {
    lines.push("Preserve the same apparent age.");
  }
  if (plan.identity.preserveHair) {
    lines.push("Preserve the same hair.");
  }
  if (plan.identity.preserveSkinTone) {
    lines.push("Preserve the same skin tone.");
  }
  if (plan.identity.preserveDistinctiveFeatures) {
    lines.push("Preserve the same distinctive features.");
  }
  return ["IDENTITY", ...lines].join("\n");
}
function buildSceneSection(plan) {
  const lines = [];
  if (plan.scene.preservePose) {
    lines.push("Preserve the original pose.");
  }
  if (plan.scene.preserveCameraPerspective) {
    lines.push("Preserve the camera perspective.");
  }
  if (plan.scene.preserveLighting) {
    lines.push("Preserve the lighting.");
  }
  if (plan.scene.preserveClothing) {
    lines.push("Preserve the clothing.");
  }
  if (plan.scene.preserveAccessories) {
    lines.push("Preserve the accessories.");
  }
  if (plan.scene.preserveBackground) {
    lines.push("Preserve the background.");
  }
  return ["SCENE", ...lines].join("\n");
}
function buildTransformSection(plan) {
  const lines = [translateVisibility(plan.transformation.changeVisibility)];
  const seenDescriptions = /* @__PURE__ */ new Set();
  for (const change of plan.transformation.approvedChanges) {
    const description = change.description.trim();
    if (!description || seenDescriptions.has(description)) continue;
    seenDescriptions.add(description);
    lines.push(description);
  }
  return ["TRANSFORM", ...lines].join("\n");
}
function buildAnatomySection(plan) {
  const lines = [];
  if (plan.anatomy.preserveSkeletalFrame) {
    lines.push("Preserve the original skeletal frame.");
  }
  lines.push("Keep anatomically plausible proportions.");
  lines.push("Do not apply artificial waist compression.");
  lines.push("Do not apply disproportionate muscle growth.");
  lines.push("Do not distort limbs, hands, or feet.");
  lines.push("Keep changes compatible with the original pose.");
  for (const constraint of plan.anatomy.constraints) {
    const t = constraint.trim();
    if (t) lines.push(t);
  }
  return ["ANATOMY", ...uniqueStable(lines)].join("\n");
}
function buildRealismSection(plan, presentationStyle) {
  const lines = [
    translatePresentationStyle(presentationStyle),
    translateTextureStyle(plan.realism.textureStyle)
  ];
  for (const constraint of plan.realism.constraints) {
    const t = constraint.trim();
    if (t) lines.push(t);
  }
  return ["REALISM", ...uniqueStable(lines)].join("\n");
}
function buildCurrentPreviewSafetySection() {
  const lines = [
    "Preserve the subject's original presentation, including pose, expression, camera framing, clothing, styling and visual character.",
    "Only modify the body characteristics required by the approved health and body-progress transformation plan.",
    "Preserve the existing clothing and clothing coverage.",
    "Do not redesign, remove, replace, enlarge, shrink or reinterpret the clothing unless a minor natural adjustment is necessary to fit the transformed body.",
    "Do not change the subject's identity, confidence, attractiveness, femininity, masculinity or personal style.",
    "Focus on identity preservation, realistic fat loss, weight change, muscle development, body recomposition, proportions, anatomy, skin realism, photographic realism, and plan adherence.",
    "Do not introduce unrelated styling changes.",
    "The transformation must not introduce explicit pornographic content that is absent from the source image."
  ];
  return ["SAFETY", ...lines].join("\n");
}
function buildPre017cBaselineSafetySection() {
  const lines = [
    "Clearly adult subject only.",
    "Non-sexual fitness progress visualization in a health and training context.",
    "Neutral documentary presentation.",
    "Ordinary underwear or athletic clothing may be present and must remain non-sexual.",
    "Preserve existing clothing coverage.",
    "Do not remove clothing.",
    "Do not make clothing more revealing.",
    "No nudity.",
    "No genital exposure.",
    "No sexualization.",
    "No erotic pose.",
    "No age reduction.",
    "No age ambiguity.",
    "Preserve identity.",
    "Preserve pose unless the approved transformation requires only a minor natural adjustment."
  ];
  return ["SAFETY", ...lines].join("\n");
}
var CURRENT_PREVIEW_SAFETY_NEGATIVE = [
  "explicit pornographic content absent from source"
];
var PRE_017C_PREVIEW_SAFETY_NEGATIVE = [
  "nudity",
  "genital exposure",
  "sexualized pose",
  "erotic framing",
  "age reduction",
  "minor appearance",
  "childlike features",
  "removed clothing",
  "more revealing clothing"
];
function buildNegativePrompt(plan, previewSafety) {
  const parts = [...plan.exclusions];
  if (previewSafety === "current") {
    parts.push(...CURRENT_PREVIEW_SAFETY_NEGATIVE);
  } else if (previewSafety === "pre_017c_baseline") {
    parts.push(...PRE_017C_PREVIEW_SAFETY_NEGATIVE);
  }
  return uniqueStable(parts).join(", ");
}
function resolvePreviewSafetyMode(options) {
  if (options?.previewSafetyContext === "pre_017c_baseline") {
    return "pre_017c_baseline";
  }
  if (options?.previewSafetyContext === "non_sexual_fitness_visualization") {
    return "current";
  }
  return "none";
}
function resolvePresentationStyle(plan, options, warnings) {
  if (options?.styleOverride !== void 0) {
    if (isPresentationStyle(options.styleOverride)) {
      return options.styleOverride;
    }
    warnings.push({
      code: "unsupported_style",
      message: `Unsupported styleOverride omitted: ${String(options.styleOverride)}`
    });
  }
  if (isPresentationStyle(plan.realism.presentationStyle)) {
    return plan.realism.presentationStyle;
  }
  warnings.push({
    code: "unsupported_style",
    message: `Unsupported presentationStyle fell back to source-faithful wording: ${plan.realism.presentationStyle}`
  });
  return "source_faithful";
}
function applyOptions(options, warnings) {
  const out = {};
  if (!options) return out;
  if (options.aspectRatio !== void 0) {
    if (SUPPORTED_FORMATTER_ASPECT_RATIOS.includes(
      options.aspectRatio
    )) {
      out.aspectRatio = options.aspectRatio;
    } else {
      warnings.push({
        code: "unsupported_aspect_ratio",
        message: `Unsupported aspectRatio omitted: ${options.aspectRatio}`
      });
    }
  }
  if (options.seed !== void 0) {
    if (typeof options.seed === "number" && Number.isFinite(options.seed) && Number.isInteger(options.seed) && options.seed >= 0) {
      out.seed = options.seed;
    } else {
      warnings.push({
        code: "provider_limitation",
        message: `Invalid seed omitted: ${String(options.seed)}`
      });
    }
  }
  if (options.quality !== void 0) {
    if (options.quality === "standard" || options.quality === "high") {
      out.quality = options.quality;
    } else {
      warnings.push({
        code: "unsupported_quality",
        message: `Unsupported quality omitted: ${String(options.quality)}`
      });
    }
  }
  return out;
}
var FluxFormatter = class {
  constructor() {
    this.name = "FluxFormatter";
    this.version = FLUX_FORMATTER_VERSION;
    this.providerFamily = "flux";
    this.capabilities = FLUX_CAPABILITIES;
  }
  format(renderPlan, options) {
    const warnings = [];
    const presentationStyle = resolvePresentationStyle(
      renderPlan,
      options,
      warnings
    );
    const optionFields = applyOptions(options, warnings);
    const approvedChanges = renderPlan.transformation.approvedChanges;
    void approvedChanges;
    if (options?.promptIsolationDiagnostic === "minimal") {
      const minimal = typeof options.promptIsolationMinimalPrompt === "string" ? options.promptIsolationMinimalPrompt.trim() : "";
      const prompt2 = minimal || "Generate a realistic body recomposition while preserving the same person, pose, clothing, framing and photographic identity.";
      warnings.push({
        code: "degraded_structure",
        message: "Prompt Isolation Lab minimal diagnostic bypassed structured formatter sections."
      });
      const result2 = {
        providerFamily: this.providerFamily,
        prompt: prompt2,
        sourceOperation: "edit_source_image",
        warnings: [...warnings],
        style: presentationStyle,
        metadata: {
          formatterName: this.name,
          formatterVersion: this.version,
          renderPlanSchemaVersion: renderPlan.schemaVersion,
          renderPlanRulesVersion: renderPlan.rulesVersion,
          transformationRulesVersion: renderPlan.trace.transformationRulesVersion,
          visualDirectionRulesVersion: renderPlan.trace.visualDirectionRulesVersion,
          estimateReliability: renderPlan.trace.estimateReliability
        }
      };
      if (optionFields.aspectRatio !== void 0) {
        result2.aspectRatio = optionFields.aspectRatio;
      }
      if (optionFields.seed !== void 0) {
        result2.seed = optionFields.seed;
      }
      if (optionFields.quality !== void 0) {
        result2.quality = optionFields.quality;
      }
      return result2;
    }
    const previewSafety = resolvePreviewSafetyMode(options);
    const promptSections = [
      buildSourceSection(renderPlan),
      buildIdentitySection(renderPlan),
      buildSceneSection(renderPlan),
      buildTransformSection(renderPlan),
      buildAnatomySection(renderPlan),
      buildRealismSection(renderPlan, presentationStyle)
    ];
    if (previewSafety === "current") {
      promptSections.push(buildCurrentPreviewSafetySection());
    } else if (previewSafety === "pre_017c_baseline") {
      promptSections.push(buildPre017cBaselineSafetySection());
    }
    const prompt = promptSections.join("\n\n");
    const negativePrompt = buildNegativePrompt(renderPlan, previewSafety);
    const result = {
      providerFamily: this.providerFamily,
      prompt,
      sourceOperation: "edit_source_image",
      warnings: [...warnings],
      style: presentationStyle,
      metadata: {
        formatterName: this.name,
        formatterVersion: this.version,
        renderPlanSchemaVersion: renderPlan.schemaVersion,
        renderPlanRulesVersion: renderPlan.rulesVersion,
        transformationRulesVersion: renderPlan.trace.transformationRulesVersion,
        visualDirectionRulesVersion: renderPlan.trace.visualDirectionRulesVersion,
        estimateReliability: renderPlan.trace.estimateReliability
      }
    };
    if (negativePrompt) {
      result.negativePrompt = negativePrompt;
    }
    if (optionFields.aspectRatio !== void 0) {
      result.aspectRatio = optionFields.aspectRatio;
    }
    if (optionFields.seed !== void 0) {
      result.seed = optionFields.seed;
    }
    if (optionFields.quality !== void 0) {
      result.quality = optionFields.quality;
    }
    return result;
  }
};
var fluxFormatter = new FluxFormatter();

// src/ai/render/RenderPlan.ts
var RENDER_PLAN_SCHEMA_VERSION = 1;
var RENDER_PLAN_RULES_VERSION = "1.0";

// src/ai/render/RenderPlanBuilder.ts
var REQUIRED_ANATOMY_PRINCIPLES = [
  "preserve original skeletal frame",
  "anatomically plausible changes",
  "no artificial waist compression",
  "no disproportionate regional growth",
  "no limb or hand distortion",
  "changes compatible with original pose"
];
var FORBIDDEN_PROVIDER_KEYWORDS = [
  "replicate",
  "flux",
  "sdxl",
  "openai",
  "imagen",
  "api key",
  "bearer",
  "model id",
  "inference steps",
  "denoise",
  "prompt strength"
];
function uniqueNonEmpty(lines) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
function hasWholeBodyRecomposition(plan) {
  const fatSignal = plan.estimatedFatLossKg != null || plan.estimatedFatChangeKg != null && plan.estimatedFatChangeKg !== 0;
  const muscleSignal = plan.estimatedMuscleGainKg != null || plan.estimatedLeanMassChangeKg != null && plan.estimatedLeanMassChangeKg !== 0;
  return fatSignal && muscleSignal;
}
function fatReductionApproved(plan) {
  if (plan.estimatedFatLossKg != null) return true;
  if (plan.estimatedFatChangeKg != null && plan.estimatedFatChangeKg < 0) {
    return true;
  }
  return false;
}
function fatIncreaseApproved(plan) {
  if (plan.estimatedFatLossKg != null) return false;
  if (plan.estimatedFatChangeKg != null && plan.estimatedFatChangeKg > 0) {
    return true;
  }
  return false;
}
function muscleDevelopmentApproved(plan) {
  if (plan.estimatedMuscleGainKg != null) return true;
  if (plan.estimatedLeanMassChangeKg != null && plan.estimatedLeanMassChangeKg > 0) {
    return true;
  }
  return false;
}
function waistChangeApproved(plan) {
  return plan.waistChangeCm != null && plan.waistChangeCm !== 0;
}
function regionChangeDirection(magnitude) {
  if (magnitude < -0.05) return "decrease";
  if (magnitude > 0.05) return "increase";
  return "refine";
}
function describeRegionalChange(region, magnitude) {
  if (magnitude < -0.05) {
    return `Reduce visible soft tissue around the ${region} while preserving natural anatomy.`;
  }
  if (magnitude > 0.05) {
    return `Add modest proportional ${region} development consistent with the source frame.`;
  }
  return `Apply a restrained refinement to the ${region} without inventing new anatomy.`;
}
function buildApprovedChanges(plan, direction) {
  const visibility = direction.changeVisibility;
  const changes = [];
  if (hasWholeBodyRecomposition(plan)) {
    changes.push({
      id: "whole-body-recomposition",
      kind: "whole_body_recomposition",
      direction: "refine",
      visibility,
      description: "Apply a clear whole-body recomposition while preserving the original silhouette identity.",
      sourcePlanField: "estimatedFatChangeKg,estimatedLeanMassChangeKg"
    });
  }
  if (fatReductionApproved(plan)) {
    changes.push({
      id: "fat-reduction",
      kind: "fat_reduction",
      direction: "decrease",
      visibility,
      description: "Reduce visible soft tissue while preserving natural anatomy and source identity.",
      sourcePlanField: plan.estimatedFatLossKg != null ? "estimatedFatLossKg" : "estimatedFatChangeKg"
    });
  } else if (fatIncreaseApproved(plan)) {
    changes.push({
      id: "fat-increase",
      kind: "fat_increase",
      direction: "increase",
      visibility,
      description: "Increase soft-tissue fullness modestly while preserving natural anatomy and source identity.",
      sourcePlanField: "estimatedFatChangeKg"
    });
  }
  if (waistChangeApproved(plan)) {
    const decreasing = plan.waistChangeCm < 0;
    changes.push({
      id: "waist-change",
      kind: "waist_change",
      direction: decreasing ? "decrease" : "increase",
      region: "waist",
      visibility,
      description: decreasing ? "Reduce visible soft tissue around the waist while preserving natural anatomy." : "Increase waist fullness modestly while preserving natural anatomy.",
      sourcePlanField: "waistChangeCm"
    });
  }
  if (muscleDevelopmentApproved(plan)) {
    changes.push({
      id: "muscle-development",
      kind: "muscle_development",
      direction: "increase",
      visibility,
      description: "Add modest proportional muscle development consistent with the source frame.",
      sourcePlanField: plan.estimatedMuscleGainKg != null ? "estimatedMuscleGainKg" : "estimatedLeanMassChangeKg"
    });
  }
  for (const target of plan.regionalTargets) {
    const region = target.region.trim();
    if (!region) continue;
    changes.push({
      id: `region-${region}`,
      kind: "regional_change",
      direction: regionChangeDirection(target.magnitude),
      region,
      visibility,
      description: describeRegionalChange(region, target.magnitude),
      sourcePlanField: "regionalTargets"
    });
  }
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const change of changes) {
    if (seen.has(change.id)) continue;
    seen.add(change.id);
    unique.push(change);
  }
  return unique;
}
function buildAnatomyConstraints(direction) {
  return uniqueNonEmpty([
    ...REQUIRED_ANATOMY_PRINCIPLES,
    ...direction.realismConstraints
  ]);
}
function buildRealismConstraints(direction) {
  return uniqueNonEmpty([
    ...direction.photographicInstructions,
    ...direction.realismConstraints
  ]);
}
function buildRenderPlan(plan, direction) {
  return {
    schemaVersion: RENDER_PLAN_SCHEMA_VERSION,
    rulesVersion: RENDER_PLAN_RULES_VERSION,
    source: {
      operation: "edit_source_image",
      preserveSourceComposition: true
    },
    identity: {
      preservePerson: true,
      preserveFace: true,
      preserveApparentAge: true,
      preserveHair: true,
      preserveSkinTone: true,
      preserveDistinctiveFeatures: true
    },
    scene: {
      preservePose: true,
      preserveCameraPerspective: true,
      preserveLighting: true,
      preserveClothing: true,
      preserveAccessories: true,
      preserveBackground: true
    },
    transformation: {
      visualIntensity: plan.visualIntensity,
      changeVisibility: direction.changeVisibility,
      approvedChanges: buildApprovedChanges(plan, direction)
    },
    anatomy: {
      preserveSkeletalFrame: true,
      constraints: buildAnatomyConstraints(direction)
    },
    realism: {
      presentationStyle: direction.presentationStyle,
      textureStyle: direction.textureStyle,
      constraints: buildRealismConstraints(direction)
    },
    exclusions: uniqueNonEmpty(direction.exclusions),
    trace: {
      transformationRulesVersion: plan.rulesVersion,
      visualDirectionRulesVersion: direction.metadata.rulesVersion,
      transformationPlanSchemaVersion: plan.schemaVersion,
      renderPlanSchemaVersion: RENDER_PLAN_SCHEMA_VERSION,
      estimateReliability: plan.estimateReliability
    }
  };
}
function collectStringLeaves(value, path, out) {
  if (value == null) return;
  if (typeof value === "string") {
    out.push({ path, value });
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectStringLeaves(item, `${path}[${i}]`, out));
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectStringLeaves(child, path ? `${path}.${key}` : key, out);
    }
  }
}
function hasUndefinedInRequired(value) {
  if (value === void 0) return true;
  if (value === null) return false;
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasUndefinedInRequired(item));
  }
  return Object.values(value).some(
    (child) => hasUndefinedInRequired(child)
  );
}
var URL_LIKE2 = /https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|ai)\b/i;
var BASE64_LIKE2 = /data:image\/[a-z0-9+.-]*;base64,[A-Za-z0-9+/=\s]{16,}|^[A-Za-z0-9+/]{64,}={1,2}$/;
var API_KEY_LIKE2 = /\b(?:sk-|rk-|api[_-]?key|bearer\s+[A-Za-z0-9._-]{8,})\b/i;
function validateRenderPlan(renderPlan) {
  const errors = [];
  const warnings = [];
  if (renderPlan.schemaVersion == null) {
    errors.push("schemaVersion is missing");
  }
  const rulesVersion = renderPlan.rulesVersion;
  if (rulesVersion == null || rulesVersion.trim() === "") {
    errors.push("rulesVersion is missing");
  }
  if (renderPlan.source?.operation !== "edit_source_image") {
    errors.push('source.operation must be "edit_source_image"');
  }
  const flags = [
    [renderPlan.source?.preserveSourceComposition, "source.preserveSourceComposition"],
    [renderPlan.identity?.preservePerson, "identity.preservePerson"],
    [renderPlan.identity?.preserveFace, "identity.preserveFace"],
    [renderPlan.identity?.preserveApparentAge, "identity.preserveApparentAge"],
    [renderPlan.identity?.preserveHair, "identity.preserveHair"],
    [renderPlan.identity?.preserveSkinTone, "identity.preserveSkinTone"],
    [
      renderPlan.identity?.preserveDistinctiveFeatures,
      "identity.preserveDistinctiveFeatures"
    ],
    [renderPlan.scene?.preservePose, "scene.preservePose"],
    [renderPlan.scene?.preserveCameraPerspective, "scene.preserveCameraPerspective"],
    [renderPlan.scene?.preserveLighting, "scene.preserveLighting"],
    [renderPlan.scene?.preserveClothing, "scene.preserveClothing"],
    [renderPlan.scene?.preserveAccessories, "scene.preserveAccessories"],
    [renderPlan.scene?.preserveBackground, "scene.preserveBackground"],
    [renderPlan.anatomy?.preserveSkeletalFrame, "anatomy.preserveSkeletalFrame"]
  ];
  for (const [flag, label] of flags) {
    if (flag !== true) {
      errors.push(`${label} must be true`);
    }
  }
  const changes = renderPlan.transformation?.approvedChanges ?? [];
  const ids = /* @__PURE__ */ new Set();
  for (const change of changes) {
    if (!change.id || change.id.trim() === "") {
      errors.push("approvedChanges entry missing id");
      continue;
    }
    if (ids.has(change.id)) {
      errors.push(`duplicate approvedChange id: ${change.id}`);
    }
    ids.add(change.id);
    if (!change.description || change.description.trim() === "") {
      errors.push(`approvedChange ${change.id} has empty description`);
    }
  }
  const exclusions = renderPlan.exclusions ?? [];
  const exclusionSeen = /* @__PURE__ */ new Set();
  for (const ex of exclusions) {
    if (exclusionSeen.has(ex)) {
      errors.push(`duplicate exclusion: ${ex}`);
    }
    exclusionSeen.add(ex);
  }
  for (const c of renderPlan.anatomy?.constraints ?? []) {
    if (!c || c.trim() === "") {
      errors.push("empty anatomy constraint string");
    }
  }
  for (const c of renderPlan.realism?.constraints ?? []) {
    if (!c || c.trim() === "") {
      errors.push("empty realism constraint string");
    }
  }
  if (hasUndefinedInRequired(renderPlan)) {
    errors.push("undefined values present inside required objects");
  }
  const strings = [];
  collectStringLeaves(renderPlan, "", strings);
  for (const { path, value } of strings) {
    const lower = value.toLowerCase();
    for (const keyword of FORBIDDEN_PROVIDER_KEYWORDS) {
      if (lower.includes(keyword)) {
        errors.push(`provider/model keyword "${keyword}" in ${path || "root"}`);
      }
    }
    if (URL_LIKE2.test(value)) {
      errors.push(`URL-like string in ${path || "root"}`);
    }
    if (API_KEY_LIKE2.test(value)) {
      errors.push(`API-key-like string in ${path || "root"}`);
    }
    if (BASE64_LIKE2.test(value.trim())) {
      errors.push(`Base64-like string in ${path || "root"}`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// src/ai/retry/RetryOrchestratorTypes.ts
var RETRY_ORCHESTRATOR_RULES_VERSION = "1.0";

// src/ai/retry/RetryPolicy.ts
var RETRYABLE_TRANSPORT_CODES = [
  "request_aborted",
  "request_timeout",
  "provider_rate_limited",
  "provider_unavailable",
  "polling_exhausted"
];
var APPROVED_RETRY_ADJUSTMENTS = [
  "strengthen_identity_preservation",
  "strengthen_anatomy_constraints",
  "strengthen_plan_adherence",
  "strengthen_pose_camera_preservation",
  "strengthen_photorealism",
  "reduce_visual_emphasis"
];
var DEFERRED_RETRY_ADJUSTMENTS = [
  "switch_provider",
  "switch_model_tier"
];
var APPROVED_SET = new Set(APPROVED_RETRY_ADJUSTMENTS);
var DEFERRED_SET = new Set(DEFERRED_RETRY_ADJUSTMENTS);
var RETRYABLE_SET = new Set(
  RETRYABLE_TRANSPORT_CODES
);
function isRetryableTransportFailure(result) {
  return RETRYABLE_SET.has(result.error.code) && result.error.retryable === true;
}
function isApprovedRetryAdjustment(adjustment) {
  return APPROVED_SET.has(adjustment);
}
function isDeferredRetryAdjustment(adjustment) {
  return DEFERRED_SET.has(adjustment);
}
function validateRetryAdjustments(adjustments) {
  const errors = [];
  const rejected = [];
  const seen = /* @__PURE__ */ new Set();
  const approvedUnordered = [];
  if (!Array.isArray(adjustments)) {
    return {
      valid: false,
      approved: [],
      rejected: [],
      errors: ["adjustments must be an array"]
    };
  }
  for (const raw of adjustments) {
    if (typeof raw !== "string") {
      errors.push("adjustment must be a string");
      continue;
    }
    if (DEFERRED_SET.has(raw)) {
      rejected.push(raw);
      errors.push(`unsupported adjustment: ${raw}`);
      continue;
    }
    if (!APPROVED_SET.has(raw)) {
      rejected.push(raw);
      errors.push(`unsupported adjustment: ${raw}`);
      continue;
    }
    const adj = raw;
    if (seen.has(adj)) {
      errors.push(`duplicate adjustment: ${adj}`);
      continue;
    }
    seen.add(adj);
    approvedUnordered.push(adj);
  }
  const approved = APPROVED_RETRY_ADJUSTMENTS.filter(
    (a) => approvedUnordered.includes(a)
  );
  return {
    valid: rejected.length === 0,
    approved,
    rejected,
    errors
  };
}
function mergeAppliedAdjustments(existing, newlyApproved) {
  const set = /* @__PURE__ */ new Set();
  for (const a of existing) {
    if (APPROVED_SET.has(a)) set.add(a);
  }
  for (const a of newlyApproved) {
    if (APPROVED_SET.has(a)) set.add(a);
  }
  return APPROVED_RETRY_ADJUSTMENTS.filter((a) => set.has(a));
}

// src/ai/retry/RetryOrchestrator.ts
var DEFAULT_MAX_ATTEMPTS = 3;
var MIN_MAX_ATTEMPTS = 1;
var MAX_MAX_ATTEMPTS = 5;
var FORBIDDEN_CONTENT_PATTERNS = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/
];
function isInteger(value) {
  return typeof value === "number" && Number.isInteger(value);
}
function isNonNegativeInteger(value) {
  return isInteger(value) && value >= 0 && Number.isFinite(value);
}
function stringLooksForbidden(text) {
  for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}
function cloneState(state) {
  const next = {
    attempt: state.attempt,
    maxAttempts: state.maxAttempts,
    transportAttempts: state.transportAttempts,
    validationAttempts: state.validationAttempts,
    appliedAdjustments: [...state.appliedAdjustments],
    history: state.history.map((entry) => ({
      ...entry,
      appliedAdjustments: [...entry.appliedAdjustments]
    }))
  };
  if (state.lastCandidateId !== void 0) {
    next.lastCandidateId = state.lastCandidateId;
  }
  if (state.lastPredictionId !== void 0) {
    next.lastPredictionId = state.lastPredictionId;
  }
  return next;
}
function nextSequence(history) {
  let max = 0;
  for (const entry of history) {
    if (entry.sequence > max) max = entry.sequence;
  }
  return max + 1;
}
function remainingAttempts(attempt, maxAttempts) {
  return Math.max(0, maxAttempts - attempt);
}
function buildDecision(args) {
  const decision = {
    rulesVersion: RETRY_ORCHESTRATOR_RULES_VERSION,
    action: args.action,
    reasonCode: args.reasonCode,
    terminal: args.terminal,
    nextState: args.nextState,
    approvedAdjustments: args.approvedAdjustments ?? [],
    metadata: {
      currentAttempt: args.nextState.attempt,
      maxAttempts: args.nextState.maxAttempts,
      remainingAttempts: remainingAttempts(
        args.nextState.attempt,
        args.nextState.maxAttempts
      )
    },
    warnings: args.warnings ?? [],
    errors: args.errors ?? []
  };
  if (args.terminalOutcome !== void 0) {
    decision.terminalOutcome = args.terminalOutcome;
  }
  if (args.transportRetryable !== void 0) {
    decision.metadata.transportRetryable = args.transportRetryable;
  }
  if (args.validationOutcome !== void 0) {
    decision.metadata.validationOutcome = args.validationOutcome;
  }
  return decision;
}
function appendHistory(state, entry) {
  const next = cloneState(state);
  next.history = [
    ...next.history,
    {
      ...entry,
      sequence: nextSequence(next.history),
      appliedAdjustments: [...entry.appliedAdjustments]
    }
  ];
  return next;
}
function createInitialRetryState(maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  if (!isInteger(maxAttempts) || maxAttempts < MIN_MAX_ATTEMPTS || maxAttempts > MAX_MAX_ATTEMPTS) {
    throw new Error(
      `maxAttempts must be an integer between ${MIN_MAX_ATTEMPTS} and ${MAX_MAX_ATTEMPTS}`
    );
  }
  return {
    attempt: 1,
    maxAttempts,
    transportAttempts: 0,
    validationAttempts: 0,
    appliedAdjustments: [],
    history: []
  };
}
function validateRetryAttemptState(state) {
  const errors = [];
  const warnings = [];
  if (state == null || typeof state !== "object") {
    return { valid: false, errors: ["state must be an object"], warnings };
  }
  if (!isInteger(state.attempt) || state.attempt < 1) {
    errors.push("attempt must be an integer >= 1");
  }
  if (!isInteger(state.maxAttempts) || state.maxAttempts < MIN_MAX_ATTEMPTS || state.maxAttempts > MAX_MAX_ATTEMPTS) {
    errors.push(
      `maxAttempts must be an integer between ${MIN_MAX_ATTEMPTS} and ${MAX_MAX_ATTEMPTS}`
    );
  }
  if (isInteger(state.attempt) && isInteger(state.maxAttempts) && state.attempt > state.maxAttempts) {
    errors.push("attempt must be <= maxAttempts");
  }
  if (!isNonNegativeInteger(state.transportAttempts)) {
    errors.push("transportAttempts must be a finite non-negative integer");
  }
  if (!isNonNegativeInteger(state.validationAttempts)) {
    errors.push("validationAttempts must be a finite non-negative integer");
  }
  if (isNonNegativeInteger(state.transportAttempts) && isInteger(state.attempt) && state.transportAttempts > state.attempt) {
    errors.push("transportAttempts must be <= attempt");
  }
  if (isNonNegativeInteger(state.validationAttempts) && isInteger(state.attempt) && state.validationAttempts > state.attempt) {
    errors.push("validationAttempts must be <= attempt");
  }
  if (!Array.isArray(state.appliedAdjustments)) {
    errors.push("appliedAdjustments must be an array");
  } else {
    const seenAdj = /* @__PURE__ */ new Set();
    for (const adj of state.appliedAdjustments) {
      if (typeof adj !== "string") {
        errors.push("appliedAdjustments entries must be strings");
        continue;
      }
      if (stringLooksForbidden(adj)) {
        errors.push("appliedAdjustments contain forbidden sensitive content");
      }
      if (isDeferredRetryAdjustment(adj) || !isApprovedRetryAdjustment(adj)) {
        errors.push(`unsupported applied adjustment: ${adj}`);
      }
      if (seenAdj.has(adj)) {
        errors.push(`duplicate applied adjustment: ${adj}`);
      }
      seenAdj.add(adj);
    }
  }
  if (!Array.isArray(state.history)) {
    errors.push("history must be an array");
  } else {
    const seenSeq = /* @__PURE__ */ new Set();
    let prevSeq = 0;
    for (const entry of state.history) {
      if (entry == null || typeof entry !== "object") {
        errors.push("history entry must be an object");
        continue;
      }
      if (!isInteger(entry.sequence) || entry.sequence < 1) {
        errors.push("history sequence values must be positive integers");
      } else {
        if (seenSeq.has(entry.sequence)) {
          errors.push("history sequence values must be unique");
        }
        seenSeq.add(entry.sequence);
        if (entry.sequence <= prevSeq) {
          errors.push("history sequence must be strictly increasing");
        }
        prevSeq = entry.sequence;
      }
      if (!isInteger(entry.attempt) || entry.attempt < 1) {
        errors.push("history attempt must be an integer >= 1");
      }
      if (isInteger(entry.attempt) && isInteger(state.maxAttempts) && entry.attempt > state.maxAttempts) {
        errors.push("history attempt exceeds maxAttempts");
      }
      if (!Array.isArray(entry.appliedAdjustments)) {
        errors.push("history appliedAdjustments must be an array");
      }
      if (entry.candidateId !== void 0) {
        if (typeof entry.candidateId !== "string") {
          errors.push("history candidateId must be a string");
        } else if (stringLooksForbidden(entry.candidateId)) {
          errors.push("history contains forbidden sensitive content");
        }
      }
    }
  }
  if (state.lastCandidateId !== void 0) {
    if (typeof state.lastCandidateId !== "string") {
      errors.push("lastCandidateId must be a string");
    } else if (stringLooksForbidden(state.lastCandidateId)) {
      errors.push("lastCandidateId contains forbidden sensitive content");
    }
  }
  if (state.lastPredictionId !== void 0) {
    if (typeof state.lastPredictionId !== "string") {
      errors.push("lastPredictionId must be a string");
    } else if (stringLooksForbidden(state.lastPredictionId)) {
      errors.push("lastPredictionId contains forbidden sensitive content");
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
function evaluateTransport(state, transportResult) {
  if (transportResult.success === true) {
    let next2 = cloneState(state);
    next2.transportAttempts = state.transportAttempts + 1;
    next2.lastPredictionId = transportResult.predictionId;
    next2 = appendHistory(next2, {
      attempt: next2.attempt,
      stage: "awaiting_validation",
      action: "await_validation",
      reasonCode: "transport_success_requires_validation",
      appliedAdjustments: [...next2.appliedAdjustments]
    });
    return buildDecision({
      action: "await_validation",
      reasonCode: "transport_success_requires_validation",
      terminal: false,
      nextState: next2,
      approvedAdjustments: []
    });
  }
  const retryable = isRetryableTransportFailure(transportResult);
  if (!retryable) {
    let next2 = cloneState(state);
    next2.transportAttempts = state.transportAttempts + 1;
    if (transportResult.predictionId !== void 0) {
      next2.lastPredictionId = transportResult.predictionId;
    }
    next2 = appendHistory(next2, {
      attempt: next2.attempt,
      stage: "transport",
      action: "stop_transport_failure",
      reasonCode: "transport_non_retryable_failure",
      transportErrorCode: transportResult.error.code,
      appliedAdjustments: [...next2.appliedAdjustments]
    });
    return buildDecision({
      action: "stop_transport_failure",
      reasonCode: "transport_non_retryable_failure",
      terminal: true,
      terminalOutcome: "transport_failed",
      nextState: next2,
      transportRetryable: false
    });
  }
  if (state.attempt < state.maxAttempts) {
    let next2 = cloneState(state);
    next2.transportAttempts = state.transportAttempts + 1;
    next2.attempt = state.attempt + 1;
    if (transportResult.predictionId !== void 0) {
      next2.lastPredictionId = transportResult.predictionId;
    }
    next2 = appendHistory(next2, {
      attempt: state.attempt,
      stage: "transport",
      action: "retry_same_provider",
      reasonCode: "transport_retryable_failure",
      transportErrorCode: transportResult.error.code,
      appliedAdjustments: [...next2.appliedAdjustments]
    });
    return buildDecision({
      action: "retry_same_provider",
      reasonCode: "transport_retryable_failure",
      terminal: false,
      nextState: next2,
      approvedAdjustments: [],
      transportRetryable: true
    });
  }
  let next = cloneState(state);
  next.transportAttempts = state.transportAttempts + 1;
  if (transportResult.predictionId !== void 0) {
    next.lastPredictionId = transportResult.predictionId;
  }
  next = appendHistory(next, {
    attempt: next.attempt,
    stage: "transport",
    action: "stop_budget_exhausted",
    reasonCode: "retry_budget_exhausted",
    transportErrorCode: transportResult.error.code,
    appliedAdjustments: [...next.appliedAdjustments]
  });
  return buildDecision({
    action: "stop_budget_exhausted",
    reasonCode: "retry_budget_exhausted",
    terminal: true,
    terminalOutcome: "retry_budget_exhausted",
    nextState: next,
    transportRetryable: true
  });
}
function hasSafetyFailure(decision) {
  return decision.findings.some((f) => f.code === "safety_failure");
}
function evaluateValidation(state, validationDecision) {
  if (state.lastCandidateId !== void 0 && state.lastCandidateId !== validationDecision.candidateId) {
    const next2 = appendHistory(cloneState(state), {
      attempt: state.attempt,
      stage: "completed",
      action: "invalid_state",
      reasonCode: "candidate_mismatch",
      candidateId: validationDecision.candidateId,
      validationOutcome: validationDecision.outcome,
      appliedAdjustments: [...state.appliedAdjustments]
    });
    return buildDecision({
      action: "invalid_state",
      reasonCode: "candidate_mismatch",
      terminal: true,
      terminalOutcome: "invalid_state",
      nextState: next2,
      validationOutcome: validationDecision.outcome,
      errors: [
        `candidate mismatch: state.lastCandidateId=${state.lastCandidateId} decision.candidateId=${validationDecision.candidateId}`
      ]
    });
  }
  if (validationDecision.outcome === "accept") {
    let next2 = cloneState(state);
    next2.validationAttempts = state.validationAttempts + 1;
    next2.lastCandidateId = validationDecision.candidateId;
    next2 = appendHistory(next2, {
      attempt: next2.attempt,
      stage: "completed",
      action: "accept_candidate",
      reasonCode: "validation_accepted",
      candidateId: validationDecision.candidateId,
      validationOutcome: "accept",
      appliedAdjustments: [...next2.appliedAdjustments]
    });
    return buildDecision({
      action: "accept_candidate",
      reasonCode: "validation_accepted",
      terminal: true,
      terminalOutcome: "accepted",
      nextState: next2,
      validationOutcome: "accept"
    });
  }
  if (validationDecision.outcome === "reject") {
    const safety = hasSafetyFailure(validationDecision);
    let next2 = cloneState(state);
    next2.validationAttempts = state.validationAttempts + 1;
    next2.lastCandidateId = validationDecision.candidateId;
    if (safety) {
      next2 = appendHistory(next2, {
        attempt: next2.attempt,
        stage: "completed",
        action: "stop_safety_failure",
        reasonCode: "safety_rejected",
        candidateId: validationDecision.candidateId,
        validationOutcome: "reject",
        appliedAdjustments: [...next2.appliedAdjustments]
      });
      return buildDecision({
        action: "stop_safety_failure",
        reasonCode: "safety_rejected",
        terminal: true,
        terminalOutcome: "rejected",
        nextState: next2,
        validationOutcome: "reject"
      });
    }
    next2 = appendHistory(next2, {
      attempt: next2.attempt,
      stage: "completed",
      action: "reject_candidate",
      reasonCode: "validation_rejected",
      candidateId: validationDecision.candidateId,
      validationOutcome: "reject",
      appliedAdjustments: [...next2.appliedAdjustments]
    });
    return buildDecision({
      action: "reject_candidate",
      reasonCode: "validation_rejected",
      terminal: true,
      terminalOutcome: "rejected",
      nextState: next2,
      validationOutcome: "reject"
    });
  }
  if (state.attempt >= state.maxAttempts) {
    let next2 = cloneState(state);
    next2.validationAttempts = state.validationAttempts + 1;
    next2.lastCandidateId = validationDecision.candidateId;
    next2 = appendHistory(next2, {
      attempt: next2.attempt,
      stage: "completed",
      action: "stop_budget_exhausted",
      reasonCode: "retry_budget_exhausted",
      candidateId: validationDecision.candidateId,
      validationOutcome: "retry",
      appliedAdjustments: [...next2.appliedAdjustments]
    });
    return buildDecision({
      action: "stop_budget_exhausted",
      reasonCode: "retry_budget_exhausted",
      terminal: true,
      terminalOutcome: "retry_budget_exhausted",
      nextState: next2,
      validationOutcome: "retry"
    });
  }
  const recommended = validationDecision.retry?.adjustments ?? [];
  const validated = validateRetryAdjustments(recommended);
  if (validated.rejected.length > 0) {
    const next2 = appendHistory(cloneState(state), {
      attempt: state.attempt,
      stage: "completed",
      action: "invalid_state",
      reasonCode: "unsupported_adjustment",
      candidateId: validationDecision.candidateId,
      validationOutcome: "retry",
      appliedAdjustments: [...state.appliedAdjustments]
    });
    return buildDecision({
      action: "invalid_state",
      reasonCode: "unsupported_adjustment",
      terminal: true,
      terminalOutcome: "invalid_state",
      nextState: next2,
      validationOutcome: "retry",
      errors: validated.errors
    });
  }
  let next = cloneState(state);
  next.validationAttempts = state.validationAttempts + 1;
  next.attempt = state.attempt + 1;
  next.lastCandidateId = validationDecision.candidateId;
  next.appliedAdjustments = mergeAppliedAdjustments(
    state.appliedAdjustments,
    validated.approved
  );
  next = appendHistory(next, {
    attempt: state.attempt,
    stage: "validation",
    action: "retry_same_provider",
    reasonCode: "validation_retry_requested",
    candidateId: validationDecision.candidateId,
    validationOutcome: "retry",
    appliedAdjustments: [...next.appliedAdjustments]
  });
  return buildDecision({
    action: "retry_same_provider",
    reasonCode: "validation_retry_requested",
    terminal: false,
    nextState: next,
    approvedAdjustments: validated.approved,
    validationOutcome: "retry",
    warnings: validated.errors.filter((e) => e.startsWith("duplicate "))
  });
}
function evaluateRetryTransition(input) {
  const stateValidation = validateRetryAttemptState(input.state);
  if (!stateValidation.valid) {
    const safe = cloneState(input.state);
    return buildDecision({
      action: "invalid_state",
      reasonCode: "inconsistent_attempt_state",
      terminal: true,
      terminalOutcome: "invalid_state",
      nextState: safe,
      errors: [...stateValidation.errors],
      warnings: [...stateValidation.warnings]
    });
  }
  const hasTransport = input.transportResult !== void 0;
  const hasValidation = input.validationDecision !== void 0;
  if (hasTransport && hasValidation) {
    const next = cloneState(input.state);
    return buildDecision({
      action: "invalid_state",
      reasonCode: "invalid_input",
      terminal: true,
      terminalOutcome: "invalid_state",
      nextState: next,
      errors: [
        "transportResult and validationDecision cannot both be supplied in one transition"
      ]
    });
  }
  if (!hasTransport && !hasValidation) {
    const next = cloneState(input.state);
    return buildDecision({
      action: "invalid_state",
      reasonCode: "missing_validation_decision",
      terminal: true,
      terminalOutcome: "invalid_state",
      nextState: next,
      errors: ["neither transportResult nor validationDecision was supplied"]
    });
  }
  if (hasTransport) {
    return evaluateTransport(input.state, input.transportResult);
  }
  return evaluateValidation(input.state, input.validationDecision);
}

// src/ai/validation-result/ValidationDecision.ts
var RESULT_VALIDATOR_RULES_VERSION = "1.0";

// src/ai/retry/fixtures.ts
var DECISION_META = {
  attempt: 1,
  maxAttempts: 3,
  evidenceSchemaVersion: 1,
  transformationRulesVersion: "1.0",
  renderPlanRulesVersion: "1.0"
};
var initialRetryStateFixture = createInitialRetryState(3);
var acceptedValidationDecisionFixture = {
  rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
  outcome: "accept",
  candidateId: "candidate-fixture-001",
  overallScore: 0.9,
  dimensionScores: {
    identity: 0.92,
    anatomy: 0.9,
    plan_adherence: 0.88,
    photorealism: 0.86,
    pose_camera: 0.9,
    safety: 0.99
  },
  findings: [],
  metadata: { ...DECISION_META }
};
var retryValidationDecisionFixture = {
  rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
  outcome: "retry",
  candidateId: "candidate-fixture-001",
  overallScore: 0.7,
  dimensionScores: {
    identity: 0.6,
    anatomy: 0.88,
    plan_adherence: 0.85,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98
  },
  findings: [
    {
      code: "identity_failure",
      dimension: "identity",
      severity: "critical",
      message: "Identity below hard gate."
    }
  ],
  retry: {
    allowed: true,
    adjustments: ["strengthen_identity_preservation"],
    reason: "Identity hard-gate failure with budget remaining.",
    nextAttempt: 2,
    remainingAttempts: 2
  },
  metadata: { ...DECISION_META }
};
var safetyRejectDecisionFixture = {
  rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
  outcome: "reject",
  candidateId: "candidate-fixture-001",
  overallScore: 0.5,
  dimensionScores: {
    identity: 0.9,
    anatomy: 0.9,
    plan_adherence: 0.9,
    photorealism: 0.9,
    pose_camera: 0.9,
    safety: 0.5
  },
  findings: [
    {
      code: "safety_failure",
      dimension: "safety",
      severity: "critical",
      message: "Safety hard-gate failure."
    }
  ],
  metadata: { ...DECISION_META }
};
var unsupportedAdjustmentDecisionFixture = {
  rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
  outcome: "retry",
  candidateId: "candidate-fixture-001",
  overallScore: 0.7,
  dimensionScores: {
    identity: 0.6,
    anatomy: 0.88,
    plan_adherence: 0.85,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98
  },
  findings: [
    {
      code: "identity_failure",
      dimension: "identity",
      severity: "critical",
      message: "Identity below hard gate."
    }
  ],
  retry: {
    allowed: true,
    adjustments: ["switch_provider"],
    reason: "Unsupported provider switch request.",
    nextAttempt: 2,
    remainingAttempts: 2
  },
  metadata: { ...DECISION_META }
};

// src/ai/TransformationPlan.ts
var TRANSFORM_RULES_VERSION = "1.0";

// src/ai/progressCurve.ts
var TRANSFORM_PROGRESS_TAU = 4;
function transformProgress(months, tau = TRANSFORM_PROGRESS_TAU) {
  const m = Math.max(0, Number(months) || 0);
  const t = Number(tau);
  const tauSafe = Number.isFinite(t) && t > 0 ? t : TRANSFORM_PROGRESS_TAU;
  const p = 1 - Math.exp(-m / tauSafe);
  return Math.round(Math.min(1, Math.max(0, p)) * 1e3) / 1e3;
}
function bfAtHorizon(bfNow, bfGoal, months) {
  const now = Number(bfNow);
  const goal = Number(bfGoal);
  if (!Number.isFinite(now) || !Number.isFinite(goal) || now <= 0 || goal <= 0) {
    return null;
  }
  const p = transformProgress(months);
  return Math.round((now + (goal - now) * p) * 10) / 10;
}
function progressBand(months) {
  const p = transformProgress(months);
  if (p < 0.65) return "early";
  if (p < 0.88) return "mid";
  return "nearGoal";
}

// src/ai/TransformationEngine.ts
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function round(value, digits = 2) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
function heuristicRange(magnitude) {
  const center = Math.abs(magnitude);
  return {
    min: round(center * 0.85, 2),
    max: round(center * 1.15, 2)
  };
}
function toEstimateReliability(score) {
  if (score < 0.55) return "low";
  if (score < 0.75) return "medium";
  return "high";
}
function effortMultiplier(effort) {
  switch (effort) {
    case "low":
      return 0.55;
    case "moderate":
      return 0.8;
    case "high":
      return 1;
    case "very_high":
      return 1.1;
    default:
      return 0.8;
  }
}
function detectConflicts(profile, goal, bfNow) {
  const warnings = [];
  if (goal.fatDirection === "decrease" && goal.muscleDirection === "decrease") {
    warnings.push(
      "Both fat and muscle directions are decrease \u2014 plan may look like overall mass loss; confirm intent."
    );
  }
  if (goal.fatDirection === "increase" && goal.outcomes?.includes("fat_loss")) {
    warnings.push(
      "Conflict: fatDirection is increase but outcomes include fat_loss."
    );
  }
  if (goal.muscleDirection === "decrease" && goal.outcomes?.some((o) => o === "muscle_gain" || o === "stronger")) {
    warnings.push(
      "Conflict: muscleDirection is decrease but outcomes request muscle gain/strength."
    );
  }
  if (bfNow != null && goal.targetBodyFatPct != null && goal.fatDirection === "decrease" && goal.targetBodyFatPct >= bfNow) {
    warnings.push(
      "Conflict: fat decrease requested but targetBodyFatPct is at or above current BF%."
    );
  }
  if (bfNow != null && goal.targetBodyFatPct != null && goal.fatDirection === "increase" && goal.targetBodyFatPct <= bfNow) {
    warnings.push(
      "Conflict: fat increase requested but targetBodyFatPct is at or below current BF%."
    );
  }
  if (profile.weightKg != null && goal.targetWeightKg != null && goal.fatDirection === "decrease" && goal.targetWeightKg > profile.weightKg * 1.02) {
    warnings.push(
      "Conflict: fat decrease with a higher targetWeightKg than current weight."
    );
  }
  if (goal.timelineWeeks != null && goal.timelineWeeks < 4) {
    warnings.push(
      "Timeline under 4 weeks is too short for meaningful body-composition claims."
    );
  }
  if (bfNow != null && goal.targetBodyFatPct != null && Math.abs(bfNow - goal.targetBodyFatPct) >= 12 && (goal.timelineWeeks ?? 12) < 16) {
    warnings.push(
      "Large BF% delta on a short timeline \u2014 estimates are directional only."
    );
  }
  return warnings;
}
function pickVisualIntensity(absFatKg, absLeanKg, progress) {
  const score = (absFatKg * 1.1 + absLeanKg * 2.2) * progress;
  if (score < 0.5) return "subtle";
  if (score < 1.2) return "moderate";
  if (score < 2.4) return "noticeable";
  return "dramatic";
}
function buildRegionalTargets(focusZones, fatChangeKg, leanChangeKg) {
  const zones = focusZones && focusZones.length > 0 ? focusZones : ["full_body"];
  const fatMag = fatChangeKg == null ? 0 : clamp(fatChangeKg / 8, -1, 1);
  const leanMag = leanChangeKg == null ? 0 : clamp(leanChangeKg / 4, -1, 1);
  return zones.map((region) => {
    let magnitude = 0;
    if (region === "waist" || region === "core") {
      magnitude = round(-Math.abs(fatMag) * (fatChangeKg != null && fatChangeKg < 0 ? 1 : 0.3), 3);
      if (fatChangeKg != null && fatChangeKg > 0) magnitude = round(Math.abs(fatMag) * 0.6, 3);
    } else if (region === "full_body") {
      magnitude = round(leanMag - fatMag * 0.5, 3);
    } else {
      magnitude = round(leanMag * 0.85 - fatMag * 0.25, 3);
    }
    return { region, magnitude };
  });
}
function buildCheckpoints(bfNow, bfGoal, startWeight, goalWeightKg) {
  return [3, 6, 12].map((months) => {
    const w = round(months * 4.345, 1);
    const progress = transformProgress(months);
    const expectedBodyFatPct = bfNow != null && bfGoal != null ? bfAtHorizon(bfNow, bfGoal, months) : null;
    let expectedWeightKg = null;
    if (startWeight != null && goalWeightKg != null) {
      expectedWeightKg = round(
        startWeight + (goalWeightKg - startWeight) * progress,
        1
      );
    }
    return {
      weeks: w,
      months,
      progress,
      expectedBodyFatPct,
      expectedWeightKg,
      band: progressBand(months)
    };
  });
}
var TransformationEngine = class {
  /**
   * Compute a TransformationPlan from current profile and desired goal.
   */
  compute(profile, goal) {
    const assumptions = [];
    const bfNow = resolveBodyFatPct(profile);
    const warnings = detectConflicts(profile, goal, bfNow);
    const rawWeeks = goal.timelineWeeks ?? 12;
    const weeks = clamp(Math.round(rawWeeks), 4, 52);
    if (rawWeeks !== weeks) {
      warnings.push(
        `Timeline adjusted from ${rawWeeks} to ${weeks} weeks for realistic estimates.`
      );
      assumptions.push("Timeline clamped to 4\u201352 weeks.");
    }
    const months = weeks / 4.345;
    const progress = transformProgress(months);
    assumptions.push(
      "Uses front-loaded diminishing-returns curve (tau=4 months) aligned with lib/transformProgress.js."
    );
    const effort = effortMultiplier(goal.effortLevel);
    const sex = resolveSex(profile);
    let estimatedFatChangeKg = null;
    if (profile.weightKg == null) {
      assumptions.push(
        "weightKg missing \u2014 fat-mass change left null (no invented weight)."
      );
    } else if (bfNow == null && goal.targetBodyFatPct == null) {
      assumptions.push(
        "bodyFatPct missing \u2014 fat-mass change left null."
      );
    } else {
      const weeklyFracBase = (bfNow ?? 22) >= 30 ? 85e-4 : (bfNow ?? 22) >= 22 ? 7e-3 : (bfNow ?? 22) >= 15 ? 55e-4 : 35e-4;
      if (goal.fatDirection === "maintain") {
        estimatedFatChangeKg = 0;
      } else if (goal.fatDirection === "decrease") {
        if (bfNow != null && goal.targetBodyFatPct != null && goal.targetBodyFatPct >= bfNow) {
          estimatedFatChangeKg = 0;
        } else {
          const fullLoss = profile.weightKg * weeklyFracBase * effort * 52 * 0.55;
          let loss = fullLoss * progress;
          if (bfNow != null && goal.targetBodyFatPct != null) {
            const currentFatKg = bfNow / 100 * profile.weightKg;
            const leanKg = profile.weightKg - currentFatKg;
            const targetBf = clamp(goal.targetBodyFatPct, 5, 50);
            if (targetBf < bfNow) {
              const targetWeightForBf = leanKg / (1 - targetBf / 100);
              const fatLossToTarget = Math.max(
                0,
                profile.weightKg - targetWeightForBf
              );
              loss = Math.min(loss, fatLossToTarget * progress * 1.02);
            }
          }
          estimatedFatChangeKg = -round(clamp(loss, 0, profile.weightKg * 0.25));
        }
      } else {
        const gain = profile.weightKg * 4e-3 * effort * 52 * 0.5 * progress;
        estimatedFatChangeKg = round(clamp(gain, 0, profile.weightKg * 0.2));
      }
    }
    let estimatedLeanMassChangeKg = null;
    const sexFactor = sex === "female" ? 0.65 : sex === "male" ? 1 : 0.8;
    const levelFactor = profile.trainingLevel === "beginner" ? 1.45 : profile.trainingLevel === "novice" ? 1.2 : profile.trainingLevel === "advanced" ? 0.65 : profile.trainingLevel === "elite" ? 0.4 : 1;
    const ageYears = profile.trainingAgeYears ?? 0;
    const ageDamp = clamp(1 / (1 + ageYears * 0.08), 0.55, 1);
    const monthlyCap = 0.25 * sexFactor * levelFactor * ageDamp * effort;
    if (goal.muscleDirection === "maintain") {
      estimatedLeanMassChangeKg = 0;
    } else if (goal.muscleDirection === "increase") {
      let gain = monthlyCap * 12 * progress;
      if (goal.fatDirection === "decrease") gain *= 0.55;
      if (profile.limitations && profile.limitations.length > 0) {
        gain *= 0.9;
        warnings.push(
          "Declared limitations present; lean-gain estimate reduced slightly."
        );
      }
      estimatedLeanMassChangeKg = round(clamp(gain, 0, 8));
      assumptions.push(
        "Lean-gain ceilings are conservative heuristics, not measured hypertrophy."
      );
    } else {
      const loss = goal.fatDirection === "decrease" ? monthlyCap * 4 * progress * 0.35 : 0;
      estimatedLeanMassChangeKg = -round(clamp(loss, 0, 3));
    }
    if (profile.trainingLevel === "advanced" || profile.trainingLevel === "elite") {
      warnings.push(
        "Advanced training level: lean-gain estimates use diminishing returns."
      );
    }
    let expectedBodyFatPct = null;
    if (bfNow != null && goal.targetBodyFatPct != null) {
      expectedBodyFatPct = bfAtHorizon(bfNow, goal.targetBodyFatPct, months);
    } else if (bfNow != null && goal.fatDirection === "maintain") {
      expectedBodyFatPct = bfNow;
    } else if (bfNow == null) {
      assumptions.push("expectedBodyFatPct null \u2014 current BF% unavailable.");
    }
    let expectedWeightKg = null;
    if (profile.weightKg != null) {
      if (goal.targetWeightKg != null) {
        expectedWeightKg = round(
          profile.weightKg + (goal.targetWeightKg - profile.weightKg) * progress,
          1
        );
      } else if (estimatedFatChangeKg != null && estimatedLeanMassChangeKg != null) {
        expectedWeightKg = round(
          profile.weightKg + estimatedFatChangeKg + estimatedLeanMassChangeKg,
          1
        );
      } else {
        assumptions.push(
          "expectedWeightKg partially unsupported \u2014 missing composition deltas."
        );
      }
    }
    let waistChangeCm = null;
    if (estimatedFatChangeKg != null && estimatedFatChangeKg < 0) {
      waistChangeCm = round(estimatedFatChangeKg * 0.85, 1);
      assumptions.push(
        "waistChangeCm is a rough morphometric proxy (~0.85 cm per kg fat), not a measurement."
      );
    } else if (estimatedFatChangeKg == null) {
      waistChangeCm = null;
      assumptions.push("waistChangeCm null \u2014 insufficient fat-change inputs.");
    } else {
      waistChangeCm = null;
      assumptions.push("waistChangeCm null \u2014 no fat-loss delta to map to waist.");
    }
    const regionalTargets = buildRegionalTargets(
      goal.focusZones,
      estimatedFatChangeKg,
      estimatedLeanMassChangeKg
    );
    const absFat = Math.abs(estimatedFatChangeKg ?? 0);
    const absLean = Math.abs(estimatedLeanMassChangeKg ?? 0);
    const visualIntensity = pickVisualIntensity(absFat, absLean, progress);
    let reliabilityScore = 0.72;
    if (bfNow == null) reliabilityScore -= 0.12;
    if (profile.weightKg == null) reliabilityScore -= 0.15;
    if (profile.heightCm == null) reliabilityScore -= 0.03;
    if (weeks < 8) reliabilityScore -= 0.1;
    if (warnings.some((w) => w.startsWith("Conflict"))) reliabilityScore -= 0.12;
    if (profile.nutritionQuality === "poor") reliabilityScore -= 0.06;
    reliabilityScore = round(clamp(reliabilityScore, 0.3, 0.9), 2);
    const estimateReliability = toEstimateReliability(reliabilityScore);
    if (reliabilityScore < 0.55) {
      warnings.push(
        "Estimate reliability is limited; treat estimates as directional only."
      );
    }
    const timelineCheckpoints = buildCheckpoints(
      bfNow,
      goal.targetBodyFatPct,
      profile.weightKg,
      goal.targetWeightKg
    );
    const currentBodyFatPct = bfNow ?? null;
    const targetBodyFatPct = goal.targetBodyFatPct ?? null;
    const interimBodyFatPct = expectedBodyFatPct;
    let estimatedFatLossKg = null;
    if (estimatedFatChangeKg != null && estimatedFatChangeKg < 0) {
      estimatedFatLossKg = heuristicRange(estimatedFatChangeKg);
      assumptions.push(
        "estimatedFatLossKg is a \xB115% heuristic band around the signed fat-change estimate."
      );
    }
    let estimatedMuscleGainKg = null;
    if (estimatedLeanMassChangeKg != null && estimatedLeanMassChangeKg > 0) {
      estimatedMuscleGainKg = heuristicRange(estimatedLeanMassChangeKg);
      assumptions.push(
        "estimatedMuscleGainKg is a \xB115% heuristic band around the lean-gain estimate."
      );
    }
    return {
      schemaVersion: 1,
      rulesVersion: TRANSFORM_RULES_VERSION,
      progress,
      currentBodyFatPct,
      targetBodyFatPct,
      interimBodyFatPct,
      estimatedFatChangeKg,
      estimatedFatLossKg,
      estimatedLeanMassChangeKg,
      estimatedMuscleGainKg,
      expectedWeightKg,
      expectedBodyFatPct,
      waistChangeCm,
      regionalTargets,
      visualIntensity,
      estimateReliabilityScore: reliabilityScore,
      estimateReliability,
      assumptions,
      warnings,
      timelineCheckpoints,
      effectiveTimelineWeeks: weeks,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};

// src/ai/validation-result/ValidationEvidence.ts
var VALIDATION_EVIDENCE_SCHEMA_VERSION = 1;
var REQUIRED_VALIDATION_DIMENSIONS = [
  "identity",
  "anatomy",
  "plan_adherence",
  "photorealism",
  "pose_camera",
  "safety"
];

// src/ai/validation-result/ResultValidator.ts
var DIMENSION_WEIGHTS = {
  identity: 0.25,
  anatomy: 0.2,
  plan_adherence: 0.2,
  photorealism: 0.1,
  pose_camera: 0.1,
  safety: 0.15
};
var HARD_GATE_THRESHOLDS = {
  safety: 0.95,
  identity: 0.72,
  anatomy: 0.75,
  plan_adherence: 0.68,
  pose_camera: 0.7,
  photorealism: 0.65
};
var ACCEPTANCE_THRESHOLDS = {
  safety: 0.95,
  identity: 0.82,
  anatomy: 0.82,
  plan_adherence: 0.75,
  pose_camera: 0.78,
  photorealism: 0.72
};
var OVERALL_ACCEPTANCE_THRESHOLD = 0.8;
var CRITICAL_CONFIDENCE_DIMENSIONS = [
  "identity",
  "anatomy",
  "safety"
];
var MIN_ATTEMPT = 1;
var MIN_MAX_ATTEMPTS2 = 1;
var MAX_MAX_ATTEMPTS2 = 5;
var ADJUSTMENT_ORDER = [
  "strengthen_identity_preservation",
  "strengthen_anatomy_constraints",
  "strengthen_plan_adherence",
  "strengthen_pose_camera_preservation",
  "strengthen_photorealism",
  "reduce_visual_emphasis"
];
var DIMENSION_FAILURE_CODE = {
  identity: "identity_failure",
  anatomy: "anatomy_failure",
  plan_adherence: "plan_adherence_failure",
  photorealism: "photorealism_failure",
  pose_camera: "pose_camera_failure",
  safety: "safety_failure"
};
var DIMENSION_ADJUSTMENT = {
  identity: "strengthen_identity_preservation",
  anatomy: "strengthen_anatomy_constraints",
  plan_adherence: "strengthen_plan_adherence",
  pose_camera: "strengthen_pose_camera_preservation",
  photorealism: "strengthen_photorealism"
};
var FORBIDDEN_CONTENT_PATTERNS2 = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/
];
var FORBIDDEN_KEY_NAMES = /* @__PURE__ */ new Set([
  "prompt",
  "negativeprompt",
  "negative_prompt",
  "authorization",
  "apikey",
  "api_key",
  "token",
  "password",
  "secret",
  "base64",
  "imagebytes",
  "image_bytes",
  "rawimage"
]);
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function stringLooksForbidden2(text) {
  for (const pattern of FORBIDDEN_CONTENT_PATTERNS2) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}
function scanValue(value, keyHint, errors) {
  if (keyHint) {
    const normalized = keyHint.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    if (FORBIDDEN_KEY_NAMES.has(normalized) || normalized.includes("prompt")) {
      errors.push(`Forbidden field name detected: ${keyHint}`);
    }
  }
  if (value === void 0) {
    return;
  }
  if (typeof value === "string") {
    if (stringLooksForbidden2(value)) {
      errors.push(
        keyHint ? `Forbidden content in ${keyHint}` : "Forbidden content in evidence string"
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      scanValue(value[i], keyHint ? `${keyHint}[${i}]` : `[${i}]`, errors);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(
      value
    )) {
      scanValue(nested, keyHint ? `${keyHint}.${key}` : key, errors);
    }
  }
}
function isValidDimension(value) {
  return typeof value === "string" && REQUIRED_VALIDATION_DIMENSIONS.includes(value);
}
function validateValidationEvidence(evidence2) {
  const errors = [];
  const warnings = [];
  if (evidence2 == null || typeof evidence2 !== "object") {
    return { valid: false, errors: ["Evidence payload is required"], warnings };
  }
  if (evidence2.schemaVersion !== VALIDATION_EVIDENCE_SCHEMA_VERSION) {
    errors.push(
      `Unsupported evidence schemaVersion: ${String(evidence2.schemaVersion)}`
    );
  }
  if (!evidence2.candidate || typeof evidence2.candidate !== "object") {
    errors.push("candidate is required");
  } else if (!isNonEmptyString(evidence2.candidate.candidateId)) {
    errors.push("candidateId must be a non-empty string");
  }
  if (!evidence2.metadata || typeof evidence2.metadata !== "object") {
    errors.push("metadata is required");
  } else {
    if (!isNonEmptyString(evidence2.metadata.validatorInputVersion)) {
      errors.push("metadata.validatorInputVersion must be non-empty");
    }
    if (!isNonEmptyString(evidence2.metadata.transformationRulesVersion)) {
      errors.push("metadata.transformationRulesVersion must be non-empty");
    }
    if (!isNonEmptyString(evidence2.metadata.renderPlanRulesVersion)) {
      errors.push("metadata.renderPlanRulesVersion must be non-empty");
    }
  }
  if (!Array.isArray(evidence2.dimensions)) {
    errors.push("dimensions must be an array");
  } else {
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < evidence2.dimensions.length; i++) {
      const dim3 = evidence2.dimensions[i];
      if (!dim3 || typeof dim3 !== "object") {
        errors.push(`dimensions[${i}] must be an object`);
        continue;
      }
      if (!isValidDimension(dim3.dimension)) {
        errors.push(`dimensions[${i}].dimension is invalid`);
      } else if (seen.has(dim3.dimension)) {
        errors.push(`Duplicate dimension: ${dim3.dimension}`);
      } else {
        seen.add(dim3.dimension);
      }
      if (typeof dim3.score !== "number" || !Number.isFinite(dim3.score)) {
        errors.push(`dimensions[${i}].score must be a finite number`);
      } else if (dim3.score < 0 || dim3.score > 1) {
        errors.push(`dimensions[${i}].score must be between 0 and 1`);
      }
      if (dim3.confidence !== "low" && dim3.confidence !== "medium" && dim3.confidence !== "high") {
        errors.push(`dimensions[${i}].confidence is invalid`);
      }
      if (dim3.source !== "deterministic_fixture" && dim3.source !== "human_review" && dim3.source !== "future_vision_adapter") {
        errors.push(`dimensions[${i}].source is invalid`);
      }
      if (!Array.isArray(dim3.findings)) {
        errors.push(`dimensions[${i}].findings must be an array`);
      } else {
        for (let j = 0; j < dim3.findings.length; j++) {
          if (!isNonEmptyString(dim3.findings[j])) {
            errors.push(
              `dimensions[${i}].findings[${j}] must be a non-empty string`
            );
          }
        }
      }
      if (!Array.isArray(dim3.warnings)) {
        errors.push(`dimensions[${i}].warnings must be an array`);
      } else {
        for (let j = 0; j < dim3.warnings.length; j++) {
          if (!isNonEmptyString(dim3.warnings[j])) {
            errors.push(
              `dimensions[${i}].warnings[${j}] must be a non-empty string`
            );
          }
        }
      }
    }
    for (const required of REQUIRED_VALIDATION_DIMENSIONS) {
      if (!seen.has(required)) {
        errors.push(`Missing required dimension: ${required}`);
      }
    }
  }
  scanValue(evidence2, void 0, errors);
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
function roundOverallScore(score) {
  return Math.round(score * 1e4) / 1e4;
}
function computeOverallScore(scores) {
  let total = 0;
  for (const dimension of REQUIRED_VALIDATION_DIMENSIONS) {
    total += scores[dimension] * DIMENSION_WEIGHTS[dimension];
  }
  return roundOverallScore(total);
}
function dimensionMap(dimensions) {
  const map = /* @__PURE__ */ new Map();
  for (const dim3 of dimensions) {
    map.set(dim3.dimension, dim3);
  }
  return map;
}
function finding(code, severity, message, dimension) {
  const result = { code, severity, message };
  if (dimension !== void 0) {
    result.dimension = dimension;
  }
  return result;
}
function hardGateMessage(dimension, score) {
  switch (dimension) {
    case "safety":
      return `Safety score ${score} is below the required hard-gate threshold of ${HARD_GATE_THRESHOLDS.safety}.`;
    case "identity":
      return `Facial identity similarity is below the required hard-gate threshold (${HARD_GATE_THRESHOLDS.identity}).`;
    case "anatomy":
      return `Anatomical consistency is below the required hard-gate threshold (${HARD_GATE_THRESHOLDS.anatomy}).`;
    case "plan_adherence":
      return `Plan adherence is below the required hard-gate threshold (${HARD_GATE_THRESHOLDS.plan_adherence}).`;
    case "pose_camera":
      return `Pose and camera preservation is below the required hard-gate threshold (${HARD_GATE_THRESHOLDS.pose_camera}).`;
    case "photorealism":
      return `Photorealism is below the required hard-gate threshold (${HARD_GATE_THRESHOLDS.photorealism}).`;
  }
}
function acceptanceMessage(dimension, score) {
  return `${dimension} score ${score} is below the acceptance threshold of ${ACCEPTANCE_THRESHOLDS[dimension]}.`;
}
function sortAdjustments(adjustments) {
  const unique = [...new Set(adjustments)];
  return ADJUSTMENT_ORDER.filter((item) => unique.includes(item));
}
function buildAdjustments(failedDimensions, renderPlan) {
  const adjustments = [];
  for (const dimension of failedDimensions) {
    const mapped = DIMENSION_ADJUSTMENT[dimension];
    if (mapped) {
      adjustments.push(mapped);
    }
  }
  const anatomyOrPlanPoor = failedDimensions.includes("anatomy") || failedDimensions.includes("plan_adherence");
  if (anatomyOrPlanPoor && renderPlan.transformation.changeVisibility === "pronounced") {
    adjustments.push("reduce_visual_emphasis");
  }
  return sortAdjustments(adjustments);
}
function budgetAllowsRetry(attempt, maxAttempts) {
  return attempt < maxAttempts;
}
function buildDecisionBase(input, outcome, overallScore, dimensionScores, findings, failedForRetry, retryReason) {
  const { evidence: evidence2, attempt, maxAttempts } = input;
  const remainingAttempts2 = Math.max(0, maxAttempts - attempt);
  const decision = {
    rulesVersion: RESULT_VALIDATOR_RULES_VERSION,
    outcome,
    candidateId: evidence2.candidate?.candidateId ?? "",
    overallScore,
    dimensionScores,
    findings,
    metadata: {
      attempt,
      maxAttempts,
      evidenceSchemaVersion: evidence2.schemaVersion ?? VALIDATION_EVIDENCE_SCHEMA_VERSION,
      transformationRulesVersion: evidence2.metadata?.transformationRulesVersion ?? "",
      renderPlanRulesVersion: evidence2.metadata?.renderPlanRulesVersion ?? ""
    }
  };
  if (outcome === "retry") {
    decision.retry = {
      allowed: true,
      adjustments: buildAdjustments(failedForRetry, input.renderPlan),
      reason: retryReason ?? "Controlled retry recommended for dimensions below policy thresholds.",
      nextAttempt: attempt + 1,
      remainingAttempts: remainingAttempts2
    };
  } else if (outcome === "reject" && findings.some((f) => f.code === "retry_budget_exhausted")) {
    decision.retry = {
      allowed: false,
      adjustments: [],
      reason: "Retry budget exhausted; no further automatic attempts.",
      nextAttempt: attempt + 1,
      remainingAttempts: 0
    };
  }
  return decision;
}
function evaluateCandidate(input) {
  const evidenceCheck = validateValidationEvidence(input.evidence);
  const attemptValid = Number.isInteger(input.attempt) && input.attempt >= MIN_ATTEMPT;
  const maxAttemptsValid = Number.isInteger(input.maxAttempts) && input.maxAttempts >= MIN_MAX_ATTEMPTS2 && input.maxAttempts <= MAX_MAX_ATTEMPTS2;
  const attemptExceedsMax = attemptValid && maxAttemptsValid && input.attempt > input.maxAttempts;
  if (!evidenceCheck.valid || !attemptValid || !maxAttemptsValid || attemptExceedsMax) {
    const findings2 = [
      finding(
        "invalid_evidence",
        "critical",
        !evidenceCheck.valid ? evidenceCheck.errors[0] ?? "Validation evidence is invalid." : attemptExceedsMax ? "attempt cannot exceed maxAttempts." : "Attempt or maxAttempts is outside the allowed finite retry budget."
      )
    ];
    if (!evidenceCheck.valid) {
      for (const missing of evidenceCheck.errors) {
        if (missing.startsWith("Missing required dimension:")) {
          findings2.push(
            finding(
              "missing_required_dimension",
              "critical",
              missing
            )
          );
        }
      }
    }
    return buildDecisionBase(
      input,
      "reject",
      0,
      {},
      findings2,
      []
    );
  }
  const byDimension = dimensionMap(input.evidence.dimensions);
  const dimensionScores = {};
  for (const dimension of REQUIRED_VALIDATION_DIMENSIONS) {
    dimensionScores[dimension] = byDimension.get(dimension).score;
  }
  const overallScore = computeOverallScore(dimensionScores);
  const findings = [];
  const hardGateFailed = [];
  if (dimensionScores.safety < HARD_GATE_THRESHOLDS.safety) {
    findings.push(
      finding(
        "safety_failure",
        "critical",
        hardGateMessage("safety", dimensionScores.safety),
        "safety"
      )
    );
    return buildDecisionBase(
      input,
      "reject",
      overallScore,
      dimensionScores,
      findings,
      []
    );
  }
  const hardGateOrder = [
    "identity",
    "anatomy",
    "plan_adherence",
    "pose_camera",
    "photorealism"
  ];
  for (const dimension of hardGateOrder) {
    if (dimensionScores[dimension] < HARD_GATE_THRESHOLDS[dimension]) {
      hardGateFailed.push(dimension);
      findings.push(
        finding(
          DIMENSION_FAILURE_CODE[dimension],
          "critical",
          hardGateMessage(dimension, dimensionScores[dimension]),
          dimension
        )
      );
    }
  }
  if (hardGateFailed.length > 0) {
    if (budgetAllowsRetry(input.attempt, input.maxAttempts)) {
      return buildDecisionBase(
        input,
        "retry",
        overallScore,
        dimensionScores,
        findings,
        hardGateFailed,
        "Hard-gate failure requires another controlled generation attempt."
      );
    }
    findings.push(
      finding(
        "retry_budget_exhausted",
        "critical",
        "Retry budget exhausted without an acceptable candidate."
      )
    );
    return buildDecisionBase(
      input,
      "reject",
      overallScore,
      dimensionScores,
      findings,
      hardGateFailed
    );
  }
  const lowConfidenceDims = [];
  for (const dimension of CRITICAL_CONFIDENCE_DIMENSIONS) {
    const entry = byDimension.get(dimension);
    if (entry.confidence === "low") {
      lowConfidenceDims.push(dimension);
    }
  }
  if (lowConfidenceDims.length > 0) {
    findings.push(
      finding(
        "low_evidence_confidence",
        "warning",
        `Low evidence confidence on critical dimension(s): ${lowConfidenceDims.join(", ")}.`,
        lowConfidenceDims[0]
      )
    );
    const failedForRetry = [...lowConfidenceDims];
    if (budgetAllowsRetry(input.attempt, input.maxAttempts)) {
      return buildDecisionBase(
        input,
        "retry",
        overallScore,
        dimensionScores,
        findings,
        failedForRetry,
        "Low evidence confidence on a critical dimension requires another attempt or higher-confidence review."
      );
    }
    findings.push(
      finding(
        "retry_budget_exhausted",
        "critical",
        "Retry budget exhausted without an acceptable candidate."
      )
    );
    return buildDecisionBase(
      input,
      "reject",
      overallScore,
      dimensionScores,
      findings,
      failedForRetry
    );
  }
  const belowAcceptance = [];
  for (const dimension of REQUIRED_VALIDATION_DIMENSIONS) {
    if (dimensionScores[dimension] < ACCEPTANCE_THRESHOLDS[dimension]) {
      belowAcceptance.push(dimension);
      findings.push(
        finding(
          DIMENSION_FAILURE_CODE[dimension],
          "warning",
          acceptanceMessage(dimension, dimensionScores[dimension]),
          dimension
        )
      );
    }
  }
  const overallOk = overallScore >= OVERALL_ACCEPTANCE_THRESHOLD;
  const hasCritical = findings.some((f) => f.severity === "critical");
  if (belowAcceptance.length === 0 && overallOk && !hasCritical) {
    return buildDecisionBase(
      input,
      "accept",
      overallScore,
      dimensionScores,
      findings,
      []
    );
  }
  const retryDims = belowAcceptance.length > 0 ? belowAcceptance : ["photorealism"];
  if (budgetAllowsRetry(input.attempt, input.maxAttempts)) {
    return buildDecisionBase(
      input,
      "retry",
      overallScore,
      dimensionScores,
      findings,
      retryDims,
      "Borderline scores require another controlled generation attempt."
    );
  }
  findings.push(
    finding(
      "retry_budget_exhausted",
      "critical",
      "Retry budget exhausted without an acceptable candidate."
    )
  );
  return buildDecisionBase(
    input,
    "reject",
    overallScore,
    dimensionScores,
    findings,
    retryDims
  );
}

// src/ai/validation-result/fixtures.ts
var META = {
  validatorInputVersion: "1.0",
  transformationRulesVersion: "1.0",
  renderPlanRulesVersion: "1.0"
};
function dim(dimension, score, confidence = "high", findings = [], warnings = []) {
  return {
    dimension,
    score,
    confidence,
    source: "deterministic_fixture",
    findings,
    warnings
  };
}
function evidence(candidateId, dimensions) {
  return {
    schemaVersion: VALIDATION_EVIDENCE_SCHEMA_VERSION,
    candidate: { candidateId },
    dimensions,
    metadata: { ...META }
  };
}
function allDims(scores) {
  return Object.keys(scores).map(
    (dimension) => dim(dimension, scores[dimension])
  );
}
var acceptedCandidateEvidence = evidence(
  "fixture-candidate-accept-001",
  allDims({
    identity: 0.92,
    anatomy: 0.9,
    plan_adherence: 0.88,
    photorealism: 0.86,
    pose_camera: 0.9,
    safety: 0.99
  })
);
var identityRetryEvidence = evidence(
  "fixture-candidate-identity-retry-001",
  allDims({
    identity: 0.6,
    anatomy: 0.88,
    plan_adherence: 0.85,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98
  })
);
var anatomyRetryEvidence = evidence(
  "fixture-candidate-anatomy-retry-001",
  allDims({
    identity: 0.88,
    anatomy: 0.7,
    plan_adherence: 0.85,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98
  })
);
var planAdherenceRetryEvidence = evidence(
  "fixture-candidate-plan-retry-001",
  allDims({
    identity: 0.88,
    anatomy: 0.88,
    plan_adherence: 0.6,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98
  })
);
var unsafeCandidateEvidence = evidence(
  "fixture-candidate-unsafe-001",
  allDims({
    identity: 0.95,
    anatomy: 0.95,
    plan_adherence: 0.95,
    photorealism: 0.95,
    pose_camera: 0.95,
    safety: 0.9
  })
);
var borderlineEvidence = evidence(
  "fixture-candidate-borderline-001",
  allDims({
    identity: 0.78,
    anatomy: 0.85,
    plan_adherence: 0.8,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.97
  })
);
var lowConfidenceIdentityEvidence = evidence(
  "fixture-candidate-low-conf-identity-001",
  [
    dim("identity", 0.9, "low"),
    dim("anatomy", 0.9),
    dim("plan_adherence", 0.88),
    dim("photorealism", 0.86),
    dim("pose_camera", 0.9),
    dim("safety", 0.99)
  ]
);
var invalidDuplicateDimensionEvidence = evidence(
  "fixture-candidate-invalid-dup-001",
  [
    dim("identity", 0.9),
    dim("identity", 0.85),
    dim("anatomy", 0.9),
    dim("plan_adherence", 0.88),
    dim("photorealism", 0.86),
    dim("pose_camera", 0.9),
    dim("safety", 0.99)
  ]
);

// src/ai/TransformationGoal.ts
var TRANSFORMATION_GOAL_SCHEMA_VERSION = 1;

// src/ai/validation.ts
var PROFILE_RANGES = {
  age: { min: 13, max: 100 },
  heightCm: { min: 120, max: 230 },
  weightKg: { min: 30, max: 300 },
  bodyFat: { min: 3, max: 60 },
  bmi: { min: 10, max: 80 },
  trainingAgeYears: { min: 0, max: 80 }
};
var GOAL_RANGES = {
  timelineWeeks: { min: 4, max: 104 },
  musclePriority: { min: 0, max: 1 },
  fatLossPriority: { min: 0, max: 1 },
  targetBodyFatPct: { min: 3, max: 60 },
  targetWeightKg: { min: 30, max: 300 }
};
var SEX_VALUES = [
  "female",
  "male",
  "unspecified"
];
var FRAME_VALUES = [
  "small",
  "medium",
  "average",
  "large"
];
var BODY_TYPE_VALUES = [
  "ectomorph",
  "mesomorph",
  "endomorph",
  "athletic",
  "average",
  "soft"
];
var TRAINING_LEVEL_VALUES = [
  "beginner",
  "novice",
  "intermediate",
  "advanced",
  "elite"
];
var ACTIVITY_LEVEL_VALUES = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active"
];
var NUTRITION_VALUES = [
  "poor",
  "fair",
  "good",
  "excellent"
];
var FOCUS_ZONE_VALUES = [
  "shoulders",
  "chest",
  "arms",
  "back",
  "core",
  "waist",
  "glutes",
  "legs",
  "full_body"
];
var FAT_DIRECTIONS = [
  "decrease",
  "maintain",
  "increase"
];
var MUSCLE_DIRECTIONS = [
  "increase",
  "maintain",
  "decrease"
];
var EFFORT_VALUES = [
  "low",
  "moderate",
  "high",
  "very_high"
];
var OUTCOME_VALUES = [
  "fat_loss",
  "muscle_gain",
  "recomp",
  "maintenance",
  "athletic_performance",
  "toned",
  "stronger",
  "vshape"
];
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function pushRangeError(errors, field, value, range) {
  errors.push(
    `${field} must be between ${range.min} and ${range.max} (received ${value}).`
  );
}
function checkOptionalNumber(field, value, range, errors, warnings, unusual) {
  if (value === void 0) return;
  if (value === null) {
    errors.push(`${field} must be a finite number when provided (received null).`);
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(
      `${field} must be a finite number (received ${String(value)}).`
    );
    return;
  }
  if (value < range.min || value > range.max) {
    pushRangeError(errors, field, value, range);
    return;
  }
  if (unusual && (unusual.low != null && value < unusual.low || unusual.high != null && value > unusual.high)) {
    warnings.push(unusual.message);
  }
}
function checkEnum(field, value, allowed, errors) {
  if (value === void 0) return;
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(
      `${field} must be one of: ${allowed.join(", ")} (received ${String(value)}).`
    );
  }
}
function checkStringArray(field, value, errors) {
  if (value === void 0) return;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    errors.push(`${field} must be an array of strings when provided.`);
  }
}
function validateBodyProfile(input) {
  const errors = [];
  const warnings = [];
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["BodyProfile must be a non-null object."],
      warnings
    };
  }
  const profile = input;
  if (profile.schemaVersion !== BODY_PROFILE_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${BODY_PROFILE_SCHEMA_VERSION} (received ${String(profile.schemaVersion)}).`
    );
  }
  checkOptionalNumber(
    "age",
    profile.age,
    PROFILE_RANGES.age,
    errors,
    warnings,
    {
      low: 16,
      high: 80,
      message: "age is unusual but within allowed range."
    }
  );
  checkOptionalNumber(
    "heightCm",
    profile.heightCm,
    PROFILE_RANGES.heightCm,
    errors,
    warnings,
    {
      low: 140,
      high: 210,
      message: "heightCm is unusual but within allowed range."
    }
  );
  checkOptionalNumber(
    "weightKg",
    profile.weightKg,
    PROFILE_RANGES.weightKg,
    errors,
    warnings,
    {
      low: 40,
      high: 200,
      message: "weightKg is unusual but within allowed range."
    }
  );
  checkOptionalNumber(
    "bodyFatPct",
    profile.bodyFatPct,
    PROFILE_RANGES.bodyFat,
    errors,
    warnings,
    {
      low: 5,
      high: 45,
      message: "bodyFatPct is unusual but within allowed range."
    }
  );
  checkOptionalNumber(
    "bodyFat",
    profile.bodyFat,
    PROFILE_RANGES.bodyFat,
    errors,
    warnings
  );
  checkOptionalNumber("bmi", profile.bmi, PROFILE_RANGES.bmi, errors, warnings);
  checkOptionalNumber(
    "trainingAgeYears",
    profile.trainingAgeYears,
    PROFILE_RANGES.trainingAgeYears,
    errors,
    warnings
  );
  if (profile.sex !== void 0) {
    checkEnum("sex", profile.sex, SEX_VALUES, errors);
  }
  if (profile.gender !== void 0) {
    const genderAllowed = [...SEX_VALUES, "nonbinary"];
    checkEnum("gender", profile.gender, genderAllowed, errors);
  }
  checkEnum("frame", profile.frame, FRAME_VALUES, errors);
  checkEnum("bodyType", profile.bodyType, BODY_TYPE_VALUES, errors);
  checkEnum("trainingLevel", profile.trainingLevel, TRAINING_LEVEL_VALUES, errors);
  checkEnum("activityLevel", profile.activityLevel, ACTIVITY_LEVEL_VALUES, errors);
  checkEnum(
    "nutritionQuality",
    profile.nutritionQuality,
    NUTRITION_VALUES,
    errors
  );
  checkStringArray("limitations", profile.limitations, errors);
  if (isFiniteNumber(profile.bodyFatPct) && isFiniteNumber(profile.bodyFat) && profile.bodyFatPct !== profile.bodyFat) {
    warnings.push(
      "bodyFatPct and deprecated bodyFat both set to different values; prefer bodyFatPct."
    );
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }
  return { ok: true, value: profile, warnings };
}
function validateTransformationGoal(input) {
  const errors = [];
  const warnings = [];
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["TransformationGoal must be a non-null object."],
      warnings
    };
  }
  const goal = input;
  if (goal.schemaVersion !== TRANSFORMATION_GOAL_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${TRANSFORMATION_GOAL_SCHEMA_VERSION} (received ${String(goal.schemaVersion)}).`
    );
  }
  if (goal.fatDirection === void 0) {
    errors.push("fatDirection is required.");
  } else {
    checkEnum("fatDirection", goal.fatDirection, FAT_DIRECTIONS, errors);
  }
  if (goal.muscleDirection === void 0) {
    errors.push("muscleDirection is required.");
  } else {
    checkEnum(
      "muscleDirection",
      goal.muscleDirection,
      MUSCLE_DIRECTIONS,
      errors
    );
  }
  checkOptionalNumber(
    "targetBodyFatPct",
    goal.targetBodyFatPct,
    GOAL_RANGES.targetBodyFatPct,
    errors,
    warnings,
    {
      low: 5,
      high: 40,
      message: "targetBodyFatPct is unusual but within allowed range."
    }
  );
  checkOptionalNumber(
    "targetWeightKg",
    goal.targetWeightKg,
    GOAL_RANGES.targetWeightKg,
    errors,
    warnings
  );
  checkOptionalNumber(
    "timelineWeeks",
    goal.timelineWeeks,
    GOAL_RANGES.timelineWeeks,
    errors,
    warnings,
    {
      low: 8,
      high: 52,
      message: "timelineWeeks is unusual but within allowed range."
    }
  );
  checkOptionalNumber(
    "musclePriority",
    goal.musclePriority,
    GOAL_RANGES.musclePriority,
    errors,
    warnings
  );
  checkOptionalNumber(
    "fatLossPriority",
    goal.fatLossPriority,
    GOAL_RANGES.fatLossPriority,
    errors,
    warnings
  );
  checkEnum("effortLevel", goal.effortLevel, EFFORT_VALUES, errors);
  checkEnum(
    "nutritionQuality",
    goal.nutritionQuality,
    NUTRITION_VALUES,
    errors
  );
  if (goal.focusZones !== void 0) {
    if (!Array.isArray(goal.focusZones)) {
      errors.push("focusZones must be an array when provided.");
    } else {
      const seen = /* @__PURE__ */ new Set();
      for (const zone of goal.focusZones) {
        if (!FOCUS_ZONE_VALUES.includes(zone)) {
          errors.push(`focusZones contains unknown zone: ${String(zone)}.`);
        }
        if (seen.has(zone)) {
          errors.push(`focusZones must not contain duplicates (${zone}).`);
        }
        seen.add(zone);
      }
    }
  }
  if (goal.outcomes !== void 0) {
    if (!Array.isArray(goal.outcomes)) {
      errors.push("outcomes must be an array when provided.");
    } else {
      for (const outcome of goal.outcomes) {
        if (!OUTCOME_VALUES.includes(outcome)) {
          errors.push(`outcomes contains unknown value: ${String(outcome)}.`);
        }
      }
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }
  return { ok: true, value: goal, warnings };
}

// src/ai/visual/VisualDirector.ts
var VISUAL_DIRECTOR_RULES_VERSION = "1.0";
function uniqueNonEmpty2(lines) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
function mapChangeVisibility(intensity) {
  switch (intensity) {
    case "subtle":
      return "restrained";
    case "moderate":
      return "clear";
    case "noticeable":
      return "clear";
    case "dramatic":
      return "pronounced";
  }
}
function hasMeaningfulAthleticChange(plan) {
  if (plan.estimatedMuscleGainKg != null) return true;
  if (plan.estimatedLeanMassChangeKg != null && plan.estimatedLeanMassChangeKg > 0) {
    return true;
  }
  return plan.regionalTargets.some((r) => r.magnitude > 0.05);
}
function choosePresentationStyle(plan, changeVisibility) {
  const athletic = hasMeaningfulAthleticChange(plan);
  const clearOrPronounced = changeVisibility === "clear" || changeVisibility === "pronounced";
  if (clearOrPronounced && (athletic || plan.estimatedFatLossKg != null || plan.visualIntensity === "noticeable" || plan.visualIntensity === "dramatic")) {
    return "documentary_fitness";
  }
  if (athletic) {
    return "natural_athletic";
  }
  return "source_faithful";
}
function hasPostureRelatedSupport(plan) {
  return plan.regionalTargets.some((r) => {
    if (/posture/i.test(r.region)) return true;
    if (r.note != null && /posture/i.test(r.note)) return true;
    return false;
  });
}
function chooseTextureStyle(plan) {
  const intensityOk = plan.visualIntensity === "noticeable" || plan.visualIntensity === "dramatic";
  const fatOrMuscle = plan.estimatedFatLossKg != null || plan.estimatedMuscleGainKg != null || plan.estimatedFatChangeKg != null && plan.estimatedFatChangeKg < 0 || plan.estimatedLeanMassChangeKg != null && plan.estimatedLeanMassChangeKg > 0;
  if (intensityOk && fatOrMuscle) {
    return "slightly_defined";
  }
  return "natural";
}
function describeRegionMagnitude(magnitude) {
  if (magnitude < -0.05) return "subtle reduction / tightening";
  if (magnitude > 0.05) return "subtle development / fullness";
  return "minimal visible change";
}
function buildEmphasisInstructions(plan) {
  const lines = [];
  lines.push(
    `Apply a ${plan.visualIntensity} visual change (progress ${plan.progress}).`
  );
  if (plan.interimBodyFatPct != null) {
    lines.push(
      `Interim body-fat appearance near ${plan.interimBodyFatPct}% (from plan estimate only).`
    );
  }
  if (plan.estimatedFatLossKg != null) {
    lines.push(
      `Directional fat-loss emphasis about ${plan.estimatedFatLossKg.min}\u2013${plan.estimatedFatLossKg.max} kg (heuristic range from plan).`
    );
  }
  if (plan.estimatedMuscleGainKg != null) {
    lines.push(
      `Directional muscle-gain emphasis about ${plan.estimatedMuscleGainKg.min}\u2013${plan.estimatedMuscleGainKg.max} kg (heuristic range from plan).`
    );
  }
  if (plan.waistChangeCm != null && plan.waistChangeCm < 0) {
    lines.push(
      `Waist may appear slightly smaller (about ${Math.abs(plan.waistChangeCm)} cm estimate from plan) without artificial cinching.`
    );
  }
  for (const region of plan.regionalTargets) {
    lines.push(
      `Region ${region.region}: ${describeRegionMagnitude(region.magnitude)}.`
    );
  }
  return uniqueNonEmpty2(lines);
}
var PHOTOGRAPHIC_INSTRUCTIONS = [
  "retain the original source-photo character",
  "retain natural smartphone-camera realism",
  "retain the original light direction and exposure",
  "keep natural skin texture and pores",
  "avoid studio glamour reinterpretation",
  "avoid artificial sharpening or plastic skin"
];
var REALISM_CONSTRAINTS = [
  "anatomically plausible changes",
  "original skeletal frame preserved",
  "no artificial waist compression",
  "no disproportionate regional growth",
  "no limb or hand distortion",
  "no superhero or caricature proportions",
  "no new muscles or anatomy painted onto clothing",
  "changes must remain compatible with the original pose"
];
var EXCLUSIONS = [
  "different person",
  "changed face",
  "changed age",
  "changed skin tone",
  "changed pose",
  "changed camera angle",
  "changed background",
  "changed clothing",
  "altered skeletal frame",
  "extra or missing limbs",
  "distorted hands or feet",
  "artificial waist",
  "disproportionate muscles",
  "cartoon",
  "illustration",
  "CGI",
  "plastic skin"
];
function directVisual(_profile, _goal, plan) {
  const changeVisibility = mapChangeVisibility(plan.visualIntensity);
  const presentationStyle = choosePresentationStyle(plan, changeVisibility);
  const textureStyle = chooseTextureStyle(plan);
  const postureTreatment = hasPostureRelatedSupport(plan) ? "preserve_with_natural_upright_emphasis" : "preserve_exactly";
  return {
    schemaVersion: 1,
    presentationStyle,
    changeVisibility,
    textureStyle,
    postureTreatment,
    preserve: {
      identity: true,
      apparentAge: true,
      hair: true,
      skinTone: true,
      skeletalFrame: true,
      pose: true,
      cameraPerspective: true,
      lighting: true,
      clothing: true,
      accessories: true,
      background: true
    },
    photographicInstructions: [...PHOTOGRAPHIC_INSTRUCTIONS],
    emphasisInstructions: buildEmphasisInstructions(plan),
    realismConstraints: [...REALISM_CONSTRAINTS],
    exclusions: [...EXCLUSIONS],
    metadata: {
      rulesVersion: VISUAL_DIRECTOR_RULES_VERSION,
      sourcePlanRulesVersion: plan.rulesVersion,
      visualIntensity: plan.visualIntensity,
      estimateReliability: plan.estimateReliability
    }
  };
}

// src/ai/runtime/RuntimeSanitizer.ts
var REDACTED_RUNTIME_CONTENT = "[REDACTED_RUNTIME_CONTENT]";
var RUNTIME_FORBIDDEN_CONTENT_ERROR = "Runtime result contained forbidden sensitive or transport content.";
var FORBIDDEN_SENSITIVE_PATTERNS = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /\bat\s+\S+\s+\([^)]+\.\w+:\d+:\d+\)/i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i
];
var SENSITIVE_NON_URL_PATTERNS = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /\bat\s+\S+\s+\([^)]+\.\w+:\d+:\d+\)/i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i
];
function stringMatchesForbidden(text) {
  for (const pattern of FORBIDDEN_SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}
function isValidatedOutputImageUrl(value) {
  if (!value.startsWith("https://")) return false;
  if (value.startsWith("https://api.replicate.com/")) return false;
  for (const pattern of SENSITIVE_NON_URL_PATTERNS) {
    if (pattern.test(value)) return false;
  }
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    if (u.username !== "" || u.password !== "") return false;
    if (u.hash !== "") return false;
    if (u.hostname === "api.replicate.com") return false;
    return true;
  } catch {
    return false;
  }
}
function isAllowedImageUrlPath(path) {
  return path.length === 3 && path[0] === "artifacts" && path[1] === "transportResult" && path[2] === "imageUrl";
}
function stringIsForbiddenAtPath(text, path, ctx) {
  if (isAllowedImageUrlPath(path) && ctx.transportResultSuccess === true && isValidatedOutputImageUrl(text)) {
    return false;
  }
  return stringMatchesForbidden(text);
}
function containsForbiddenContent(value, path = [], ctx = { transportResultSuccess: null }) {
  if (typeof value === "string") {
    return stringIsForbiddenAtPath(value, path, ctx);
  }
  if (Array.isArray(value)) {
    return value.some(
      (item, index) => containsForbiddenContent(item, [...path, String(index)], ctx)
    );
  }
  if (value !== null && typeof value === "object") {
    const record = value;
    return Object.keys(record).some((key) => {
      const nested = record[key];
      const nextPath = [...path, key];
      let nextCtx = ctx;
      if (path.length === 1 && path[0] === "artifacts" && key === "transportResult" && nested !== null && typeof nested === "object") {
        nextCtx = {
          transportResultSuccess: nested.success === true
        };
      }
      return containsForbiddenContent(nested, nextPath, nextCtx);
    });
  }
  return false;
}
function redactForbiddenStrings(value, path = [], ctx = { transportResultSuccess: null }) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const nextPath = [...path, String(i)];
      if (typeof item === "string") {
        if (stringIsForbiddenAtPath(item, nextPath, ctx)) {
          value[i] = REDACTED_RUNTIME_CONTENT;
        }
      } else {
        redactForbiddenStrings(item, nextPath, ctx);
      }
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    const record = value;
    for (const key of Object.keys(record)) {
      const nested = record[key];
      const nextPath = [...path, key];
      let nextCtx = ctx;
      if (path.length === 1 && path[0] === "artifacts" && key === "transportResult" && nested !== null && typeof nested === "object") {
        nextCtx = {
          transportResultSuccess: nested.success === true
        };
      }
      if (typeof nested === "string") {
        if (stringIsForbiddenAtPath(nested, nextPath, nextCtx)) {
          record[key] = REDACTED_RUNTIME_CONTENT;
        }
      } else {
        redactForbiddenStrings(nested, nextPath, nextCtx);
      }
    }
  }
}
function sanitizeAiOsRuntimeResult(result) {
  const clone = structuredClone(result);
  if (!containsForbiddenContent(clone)) {
    return clone;
  }
  redactForbiddenStrings(clone);
  clone.success = false;
  clone.terminalOutcome = "invalid_runtime_state";
  if (!clone.errors.includes(RUNTIME_FORBIDDEN_CONTENT_ERROR)) {
    clone.errors = [...clone.errors, RUNTIME_FORBIDDEN_CONTENT_ERROR];
  }
  return clone;
}

// src/ai/runtime/AiOsRuntime.ts
var SUPPORTED_MODES = ["dry_run", "transport_mock"];
var STYLE_OVERRIDES = /* @__PURE__ */ new Set([
  "source_faithful",
  "natural_athletic",
  "documentary_fitness"
]);
var QUALITIES = /* @__PURE__ */ new Set(["standard", "high"]);
var SENSITIVE_INPUT_PATTERNS = [
  /data:image\//i,
  /\bBearer\b/i,
  /\bAuthorization\b/i,
  /REPLICATE_API_TOKEN/i,
  /\bapi[_-]?key\b/i,
  /https?:\/\//i,
  /(?:[A-Za-z0-9+/]{80,}={0,2})/,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i
];
function stringLooksSensitive(text) {
  for (const pattern of SENSITIVE_INPUT_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}
function valueLooksSensitive(value) {
  if (typeof value === "string") return stringLooksSensitive(value);
  if (Array.isArray(value)) return value.some((item) => valueLooksSensitive(item));
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(
      (nested) => valueLooksSensitive(nested)
    );
  }
  return false;
}
function sanitizeErrorMessage(error) {
  if (error instanceof Error) {
    const message = error.message.replace(/\s+/g, " ").trim();
    return message.slice(0, 200) || "unknown error";
  }
  return "unknown error";
}
function validateFormatterOptions(options) {
  if (options === void 0) return [];
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    return ["formatterOptions must be an object when provided."];
  }
  const errors = [];
  if (options.aspectRatio !== void 0) {
    if (typeof options.aspectRatio !== "string" || !options.aspectRatio.trim()) {
      errors.push("formatterOptions.aspectRatio is invalid.");
    } else if (stringLooksSensitive(options.aspectRatio)) {
      errors.push("formatterOptions contain forbidden sensitive content.");
    }
  }
  if (options.seed !== void 0) {
    if (typeof options.seed !== "number" || !Number.isFinite(options.seed)) {
      errors.push("formatterOptions.seed is invalid.");
    }
  }
  if (options.quality !== void 0 && !QUALITIES.has(options.quality)) {
    errors.push("formatterOptions.quality is invalid.");
  }
  if (options.styleOverride !== void 0 && !STYLE_OVERRIDES.has(options.styleOverride)) {
    errors.push("formatterOptions.styleOverride is invalid.");
  }
  return errors;
}
function validateAiOsRuntimeInput(input) {
  const errors = [];
  const warnings = [];
  if (input == null || typeof input !== "object") {
    return {
      valid: false,
      errors: ["Runtime input is invalid."],
      warnings
    };
  }
  if (typeof input.mode !== "string" || !SUPPORTED_MODES.includes(input.mode)) {
    errors.push("Unsupported runtime mode.");
  }
  if (input.profile === void 0 || input.profile === null) {
    errors.push("Runtime profile input is required.");
  }
  if (input.goal === void 0 || input.goal === null) {
    errors.push("Runtime goal input is required.");
  }
  errors.push(...validateFormatterOptions(input.formatterOptions));
  if (input.canonicalBodyTransformation !== void 0) {
    const canonical = input.canonicalBodyTransformation;
    if (canonical == null || typeof canonical !== "object" || Array.isArray(canonical)) {
      errors.push("canonicalBodyTransformation must be an object when provided.");
    } else if (canonical.source !== "body_simulator_v1") {
      errors.push("canonicalBodyTransformation.source is invalid.");
    } else if (!Array.isArray(canonical.approvedChanges) || canonical.approvedChanges.length === 0) {
      errors.push(
        "canonicalBodyTransformation.approvedChanges must be a non-empty array."
      );
    } else if (valueLooksSensitive(canonical)) {
      errors.push(
        "canonicalBodyTransformation contain forbidden sensitive content."
      );
    }
  }
  if (input.mode === "dry_run") {
    if (input.validationEvidence !== void 0) {
      errors.push(
        "validationEvidence is not allowed in dry_run mode."
      );
    }
  }
  if (input.mode === "transport_mock") {
    if (input.sourceImage === void 0 || input.sourceImage === null) {
      errors.push("Runtime source image input is invalid.");
    } else {
      const img = input.sourceImage;
      if (typeof img !== "object" || Array.isArray(img) || typeof img.value !== "string" || !img.value || img.kind !== "https_url" && img.kind !== "data_uri") {
        errors.push("Runtime source image input is invalid.");
      }
    }
  }
  if (input.validationEvidence !== void 0) {
    if (input.mode !== "transport_mock") {
      errors.push(
        "validationEvidence may only be supplied for a transported candidate."
      );
    } else {
      const evidence2 = input.validationEvidence;
      if (evidence2 == null || typeof evidence2 !== "object" || evidence2.candidate == null || typeof evidence2.candidate.candidateId !== "string" || !evidence2.candidate.candidateId.trim()) {
        errors.push("Validation evidence input is invalid.");
      } else if (stringLooksSensitive(evidence2.candidate.candidateId)) {
        errors.push("Validation evidence input is invalid.");
      }
    }
  }
  if (input.retryState !== void 0) {
    const stateCheck = validateRetryAttemptState(input.retryState);
    if (!stateCheck.valid) {
      errors.push("Runtime retry state is invalid.");
    }
    warnings.push(...stateCheck.warnings);
  }
  if (input.transportConfig !== void 0) {
    const cfg = input.transportConfig;
    if (cfg == null || typeof cfg !== "object" || Array.isArray(cfg)) {
      errors.push("Runtime transport config is invalid.");
    } else if (typeof cfg.apiToken === "string" && cfg.apiToken.trim().length > 0) {
      errors.push("Runtime transport config must not expose an API token.");
    } else if (typeof cfg.model === "string" && stringLooksSensitive(cfg.model)) {
      errors.push("Runtime transport config is invalid.");
    }
  }
  const scanTargets = [input.profile, input.goal];
  if (input.formatterOptions !== void 0) {
    scanTargets.push(input.formatterOptions);
  }
  if (input.canonicalBodyTransformation !== void 0) {
    scanTargets.push(input.canonicalBodyTransformation);
  }
  if (input.validationEvidence !== void 0) {
    scanTargets.push(input.validationEvidence);
  }
  if (input.retryState !== void 0) {
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
function buildRuntimeTraceId(input) {
  const profile = input.profile !== null && typeof input.profile === "object" && !Array.isArray(input.profile) ? input.profile : {};
  const goal = input.goal !== null && typeof input.goal === "object" && !Array.isArray(input.goal) ? input.goal : {};
  const focusZones = Array.isArray(goal.focusZones) ? [...goal.focusZones].map(String).sort().join(",") : "";
  const payload = [
    `mode:${String(input.mode ?? "")}`,
    `bpsv:${String(profile.schemaVersion ?? "")}`,
    `gsv:${String(goal.schemaVersion ?? "")}`,
    `tw:${String(goal.timelineWeeks ?? "")}`,
    `fz:${focusZones}`,
    `fd:${String(goal.fatDirection ?? "")}`,
    `md:${String(goal.muscleDirection ?? "")}`,
    `rr:${AI_OS_RUNTIME_RULES_VERSION}`,
    `tr:${TRANSFORM_RULES_VERSION}`
  ].join("|");
  const digest = (0, import_node_crypto.createHash)("sha256").update(payload).digest("hex").slice(0, 12);
  return `aios-runtime-${digest}`;
}
var AiOsRuntime = class {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  async run(input) {
    const stages = [];
    const errors = [];
    const warnings = [];
    const artifacts = {};
    const versions = {};
    const mode = input?.mode === "transport_mock" ? "transport_mock" : "dry_run";
    const traceId = buildRuntimeTraceId(input ?? { mode, profile: {}, goal: {} });
    const finish = (success, terminalOutcome) => sanitizeAiOsRuntimeResult({
      success,
      mode,
      terminalOutcome,
      trace: {
        traceId,
        rulesVersion: AI_OS_RUNTIME_RULES_VERSION,
        stages,
        versions
      },
      artifacts,
      warnings: [...warnings],
      errors: [...errors]
    });
    const pushStage = (stage, success, startedAt, stageWarnings, stageErrors) => {
      stages.push({
        stage,
        success,
        durationMs: Math.max(0, Math.round(this.dependencies.now() - startedAt)),
        warnings: [...stageWarnings],
        errors: [...stageErrors]
      });
    };
    try {
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
      const profileResult = validateBodyProfile(input.profile);
      const goalResult = validateTransformationGoal(input.goal);
      const validationWarnings = [
        ...profileResult.warnings,
        ...goalResult.warnings
      ];
      warnings.push(...validationWarnings);
      if (!profileResult.ok || !goalResult.ok) {
        const validationErrors = [
          ...profileResult.ok ? [] : profileResult.errors,
          ...goalResult.ok ? [] : goalResult.errors
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
      const transformStarted = this.dependencies.now();
      const engine = new TransformationEngine();
      const plan = engine.compute(profile, goal);
      warnings.push(...plan.warnings);
      versions.transformationRulesVersion = plan.rulesVersion;
      artifacts.transformationPlan = plan;
      pushStage("transformation", true, transformStarted, plan.warnings, []);
      const visualStarted = this.dependencies.now();
      const direction = directVisual(profile, goal, plan);
      versions.visualDirectionRulesVersion = direction.metadata.rulesVersion ?? VISUAL_DIRECTOR_RULES_VERSION;
      artifacts.visualDirection = direction;
      pushStage("visual_direction", true, visualStarted, [], []);
      const renderStarted = this.dependencies.now();
      let renderPlan = buildRenderPlan(plan, direction);
      if (input.canonicalBodyTransformation !== void 0) {
        renderPlan = applyCanonicalBodyTransformation(
          renderPlan,
          input.canonicalBodyTransformation
        );
        artifacts.canonicalBodyTransformation = structuredClone(
          input.canonicalBodyTransformation
        );
      }
      versions.renderPlanRulesVersion = renderPlan.rulesVersion ?? RENDER_PLAN_RULES_VERSION;
      versions.transformationRulesVersion = renderPlan.trace.transformationRulesVersion ?? versions.transformationRulesVersion;
      artifacts.renderPlan = renderPlan;
      pushStage("render_plan", true, renderStarted, [], []);
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
      const formatStarted = this.dependencies.now();
      const formatter = new FluxFormatter();
      const formatted = formatter.format(renderPlan, input.formatterOptions);
      const formatterWarningMessages = formatted.warnings.map(
        (w) => `${w.code}: ${w.message}`
      );
      warnings.push(...formatterWarningMessages);
      versions.formatterName = formatted.metadata.formatterName ?? "FluxFormatter";
      versions.formatterVersion = formatted.metadata.formatterVersion ?? FLUX_FORMATTER_VERSION;
      artifacts.formattedRequest = formatted;
      pushStage(
        "provider_formatting",
        true,
        formatStarted,
        formatterWarningMessages,
        []
      );
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
      if (input.mode === "dry_run") {
        const completedStarted = this.dependencies.now();
        pushStage("completed", true, completedStarted, [], []);
        return finish(true, "dry_run_complete");
      }
      const adapter = this.dependencies.transportAdapter;
      versions.transportAdapterId = adapter.id;
      versions.retryOrchestratorRulesVersion = RETRY_ORCHESTRATOR_RULES_VERSION;
      const retryState = input.retryState !== void 0 ? input.retryState : createInitialRetryState();
      const transportStarted = this.dependencies.now();
      const transportResult = await adapter.generate({
        formattedRequest: formatted,
        sourceImage: input.sourceImage,
        traceId
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
          transportResult
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
        if (retryDecision.action === "reject_candidate" || retryDecision.action === "stop_safety_failure" || retryDecision.terminalOutcome === "rejected") {
          return finish(false, "rejected");
        }
        return finish(false, "transport_failed");
      }
      pushStage("transport", true, transportStarted, transportWarnings, []);
      const transportRetryStarted = this.dependencies.now();
      const transportRetryDecision = evaluateRetryTransition({
        state: retryState,
        transportResult
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
      if (input.validationEvidence === void 0) {
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
      versions.resultValidatorRulesVersion = RESULT_VALIDATOR_RULES_VERSION;
      const validationStarted = this.dependencies.now();
      const validationDecision = evaluateCandidate({
        evidence: input.validationEvidence,
        renderPlan,
        attempt: transportRetryDecision.nextState.attempt,
        maxAttempts: transportRetryDecision.nextState.maxAttempts
      });
      artifacts.validationDecision = validationDecision;
      pushStage("result_validation", true, validationStarted, [], []);
      const validationRetryStarted = this.dependencies.now();
      const validationRetryDecision = evaluateRetryTransition({
        state: transportRetryDecision.nextState,
        validationDecision
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
      if (validationRetryDecision.action === "reject_candidate" || validationRetryDecision.action === "stop_safety_failure" || validationRetryDecision.terminalOutcome === "rejected") {
        return finish(false, "rejected");
      }
      if (validationRetryDecision.action === "stop_budget_exhausted" || validationRetryDecision.terminalOutcome === "retry_budget_exhausted") {
        return finish(false, "rejected");
      }
      return finish(false, "invalid_runtime_state");
    } catch (error) {
      void sanitizeErrorMessage(error);
      const message = "Unexpected AI OS runtime failure.";
      errors.push(message);
      if (stages.length === 0) {
        pushStage("input_validation", false, this.dependencies.now(), [], [
          message
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
};

// src/ai/runtime/fixtures.ts
var RUNTIME_FIXTURE_PREDICTION_ID = "runtime-prediction-fixture-001";
var META2 = {
  validatorInputVersion: "1.0",
  transformationRulesVersion: "1.0",
  renderPlanRulesVersion: "1.0"
};
function dim2(dimension, score, confidence = "high") {
  return {
    dimension,
    score,
    confidence,
    source: "deterministic_fixture",
    findings: [],
    warnings: []
  };
}
function allDims2(scores) {
  return Object.keys(scores).map(
    (dimension) => dim2(dimension, scores[dimension])
  );
}
function evidenceFor(candidateId, scores) {
  return {
    schemaVersion: VALIDATION_EVIDENCE_SCHEMA_VERSION,
    candidate: { candidateId },
    dimensions: allDims2(scores),
    metadata: { ...META2 }
  };
}
var validProfile = {
  schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
  sex: "female",
  age: 34,
  heightCm: 170,
  weightKg: 72,
  bodyFatPct: 30,
  trainingLevel: "intermediate",
  trainingAgeYears: 3,
  activityLevel: "moderate",
  nutritionQuality: "good"
};
var validGoal = {
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
  outcomes: ["recomp"]
};
var fixtureSourceImage = {
  value: "opaque-source-ref-runtime-fixture-001",
  kind: "https_url"
};
var validDryRunRuntimeInput = {
  mode: "dry_run",
  profile: { ...validProfile },
  goal: { ...validGoal },
  formatterOptions: {
    aspectRatio: "3:4",
    seed: 11,
    quality: "standard"
  }
};
var validTransportMockRuntimeInput = {
  mode: "transport_mock",
  profile: { ...validProfile },
  goal: { ...validGoal },
  formatterOptions: {
    aspectRatio: "3:4",
    seed: 11,
    quality: "standard"
  },
  sourceImage: { ...fixtureSourceImage },
  retryState: createInitialRetryState(3)
};
var invalidRuntimeProfileInput = {
  mode: "dry_run",
  profile: {
    ...validProfile,
    age: -1
  },
  goal: { ...validGoal }
};
var invalidRuntimeGoalInput = {
  mode: "dry_run",
  profile: { ...validProfile },
  goal: {
    ...validGoal,
    musclePriority: 1.5
  }
};
var transportTimeoutRuntimeInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage }
};
var transportSuccessWithoutEvidenceInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage }
};
var acceptedRuntimeEvidence = evidenceFor(
  RUNTIME_FIXTURE_PREDICTION_ID,
  {
    identity: 0.92,
    anatomy: 0.9,
    plan_adherence: 0.88,
    photorealism: 0.86,
    pose_camera: 0.9,
    safety: 0.99
  }
);
var retryRuntimeEvidence = evidenceFor(
  RUNTIME_FIXTURE_PREDICTION_ID,
  {
    identity: 0.6,
    anatomy: 0.88,
    plan_adherence: 0.85,
    photorealism: 0.8,
    pose_camera: 0.85,
    safety: 0.98
  }
);
var safetyRejectRuntimeEvidence = evidenceFor(
  RUNTIME_FIXTURE_PREDICTION_ID,
  {
    identity: 0.95,
    anatomy: 0.95,
    plan_adherence: 0.95,
    photorealism: 0.95,
    pose_camera: 0.95,
    safety: 0.9
  }
);
var mismatchedRuntimeEvidence = evidenceFor(
  "runtime-prediction-OTHER-999",
  {
    identity: 0.92,
    anatomy: 0.9,
    plan_adherence: 0.88,
    photorealism: 0.86,
    pose_camera: 0.9,
    safety: 0.99
  }
);
var transportSuccessWithAcceptedEvidenceInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage },
  validationEvidence: acceptedRuntimeEvidence
};
var transportSuccessWithRetryEvidenceInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage },
  validationEvidence: retryRuntimeEvidence
};
var transportSuccessWithSafetyRejectEvidenceInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage },
  validationEvidence: safetyRejectRuntimeEvidence
};
var candidateMismatchRuntimeInput = {
  ...validTransportMockRuntimeInput,
  sourceImage: { ...fixtureSourceImage },
  validationEvidence: mismatchedRuntimeEvidence
};

// src/ai/transport/ReplicateTransportConfig.ts
var DEFAULT_REPLICATE_API_BASE_URL = "https://api.replicate.com/v1";
var DEFAULT_REPLICATE_TRANSPORT_MODEL = "black-forest-labs/flux-kontext-pro";
var DEFAULT_POLL_INTERVAL_MS = 1500;
var DEFAULT_TOTAL_TIMEOUT_MS = 9e4;
var DEFAULT_MAX_POLL_ATTEMPTS = 60;

// src/ai/transport/ReplicateErrors.ts
var MAX_SAFE_PROVIDER_ERROR_LENGTH = 200;
function sanitizeProviderErrorMessage(raw) {
  let text = "";
  if (typeof raw === "string") {
    text = raw;
  } else if (raw != null && typeof raw === "object") {
    const rec = raw;
    if (typeof rec.detail === "string") text = rec.detail;
    else if (typeof rec.message === "string") text = rec.message;
    else if (typeof rec.error === "string") text = rec.error;
    else text = "Provider error";
  } else if (raw != null) {
    text = String(raw);
  }
  text = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/r8_[A-Za-z0-9]+/gi, "[redacted]");
  text = text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  text = text.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[redacted]");
  if (text.length === 0) text = "Provider error";
  if (text.length > MAX_SAFE_PROVIDER_ERROR_LENGTH) {
    text = `${text.slice(0, MAX_SAFE_PROVIDER_ERROR_LENGTH - 1)}\u2026`;
  }
  return text;
}
function mapHttpStatusToTransportError(status) {
  if (status === 401 || status === 403) {
    return {
      code: "provider_auth_error",
      retryable: false,
      message: "Provider authentication failed."
    };
  }
  if (status === 429) {
    return {
      code: "provider_rate_limited",
      retryable: true,
      message: "Provider rate limited the request."
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "provider_validation_error",
      retryable: false,
      message: "Provider rejected the request as invalid."
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      code: "provider_unavailable",
      retryable: true,
      message: "Provider is temporarily unavailable."
    };
  }
  return {
    code: "provider_failed",
    retryable: false,
    message: "Provider request failed."
  };
}
function isAbortError(err) {
  let current = err;
  const seen = /* @__PURE__ */ new Set();
  while (current != null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const e = current;
    if (e.name === "AbortError" || e.code === "ABORT_ERR" || e.code === "ERR_ABORT" || e.code === "UND_ERR_ABORTED") {
      return true;
    }
    current = e.cause;
  }
  return false;
}
function isTimeoutLikeFetchError(err) {
  if (isAbortError(err)) return true;
  let current = err;
  const seen = /* @__PURE__ */ new Set();
  while (current != null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const e = current;
    if (e.name === "TimeoutError" || e.code === "UND_ERR_CONNECT_TIMEOUT" || e.code === "UND_ERR_HEADERS_TIMEOUT" || e.code === "UND_ERR_BODY_TIMEOUT" || e.code === "ETIMEDOUT" || e.code === "ESOCKETTIMEDOUT") {
      return true;
    }
    if (typeof e.message === "string" && /timed?\s*out|timeout|HeadersTimeout|BodyTimeout|ConnectTimeout/i.test(
      e.message
    )) {
      return true;
    }
    current = e.cause;
  }
  return false;
}

// src/ai/transport/ReplicateResponseNormalizer.ts
function normalizeReplicateStatus(value) {
  if (typeof value !== "string") return null;
  switch (value) {
    case "starting":
    case "processing":
    case "succeeded":
    case "failed":
    case "canceled":
      return value;
    default:
      return null;
  }
}
function isHttpsImageUrl(value) {
  if (!value.startsWith("https://")) return false;
  if (value.startsWith("https://api.replicate.com/")) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
function extractReplicateImageUrl(output) {
  if (typeof output === "string") {
    const t = output.trim();
    if (t.startsWith("data:")) return null;
    if (t.startsWith("http://")) return null;
    return isHttpsImageUrl(t) ? t : null;
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      const found = extractReplicateImageUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (output != null && typeof output === "object") {
    const rec = output;
    for (const key of ["url", "image", "image_url", "href"]) {
      if (typeof rec[key] === "string") {
        const found = extractReplicateImageUrl(rec[key]);
        if (found) return found;
      }
    }
  }
  return null;
}
function normalizeReplicateFailure(args) {
  const message = args.providerError !== void 0 ? sanitizeProviderErrorMessage(args.providerError) : sanitizeProviderErrorMessage(args.message);
  const failure = {
    success: false,
    provider: "replicate",
    imageUrl: null,
    generationTimeMs: Math.max(0, args.generationTimeMs),
    error: {
      code: args.code,
      message: message.slice(0, 200),
      retryable: args.retryable
    },
    warnings: args.warnings ?? [],
    metadata: {
      traceId: args.traceId,
      pollingAttempts: args.pollingAttempts ?? 0
    }
  };
  if (args.httpStatus !== void 0) {
    failure.error.httpStatus = args.httpStatus;
  }
  if (args.predictionId !== void 0) {
    failure.predictionId = args.predictionId;
  }
  if (args.model !== void 0) {
    failure.model = args.model;
  }
  if (args.status !== void 0) {
    failure.status = args.status;
  }
  if (args.providerStatus !== void 0) {
    failure.metadata.providerStatus = args.providerStatus;
  }
  return failure;
}
function normalizeHttpFailure(httpStatus, traceId, generationTimeMs, bodyText, extras) {
  const mapped = mapHttpStatusToTransportError(httpStatus);
  const sanitizedBody = bodyText ? sanitizeProviderErrorMessage(bodyText) : mapped.message;
  return normalizeReplicateFailure({
    code: mapped.code,
    message: sanitizedBody,
    retryable: mapped.retryable,
    traceId,
    generationTimeMs,
    httpStatus,
    predictionId: extras?.predictionId,
    model: extras?.model,
    pollingAttempts: extras?.pollingAttempts,
    providerStatus: String(httpStatus)
  });
}
function parsePredictionPayload(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return raw;
}

// src/ai/transport/ReplicateTransportAdapter.ts
var MAX_DATA_URI_CHARS = 8e6;
var ALLOWED_DATA_URI_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/jpg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,"
];
var SENSITIVE_TRACE = /authorization|bearer\s|r8_[A-Za-z0-9]|api[_-]?key|data:image\/|https?:\/\/|sk-[A-Za-z0-9]/i;
var NEGATIVE_PROMPT_APPENDIX_LABEL = "EXCLUSIONS";
function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function resolveDeps(partial) {
  return {
    fetchFn: partial?.fetchFn ?? globalThis.fetch.bind(globalThis),
    now: partial?.now ?? (() => Date.now()),
    sleep: partial?.sleep ?? defaultSleep
  };
}
function hasSensitiveContent(value) {
  return SENSITIVE_TRACE.test(value);
}
function validateReplicateTransportInput(input) {
  const errors = [];
  const warnings = [];
  if (input == null || typeof input !== "object") {
    return {
      valid: false,
      errors: ["Transport input is required."],
      warnings
    };
  }
  if (!input.formattedRequest) {
    errors.push("formattedRequest is required.");
  } else {
    const formattedCheck = validateFormattedImageRequest(input.formattedRequest);
    if (!formattedCheck.valid) {
      errors.push("formattedRequest failed formatter contract validation.");
    }
    if (input.formattedRequest.providerFamily !== "flux") {
      errors.push('providerFamily must be "flux".');
    }
    if (typeof input.formattedRequest.prompt !== "string" || input.formattedRequest.prompt.trim() === "") {
      errors.push("prompt must be a non-empty string.");
    }
    if (input.formattedRequest.sourceOperation !== "edit_source_image") {
      errors.push('sourceOperation must be "edit_source_image".');
    }
    if (input.formattedRequest.aspectRatio !== void 0) {
      const ar = input.formattedRequest.aspectRatio;
      if (!SUPPORTED_FORMATTER_ASPECT_RATIOS.includes(ar)) {
        errors.push("aspectRatio is unsupported.");
      }
    }
    if (input.formattedRequest.seed !== void 0) {
      const seed = input.formattedRequest.seed;
      if (typeof seed !== "number" || !Number.isFinite(seed) || !Number.isInteger(seed) || seed < 0) {
        errors.push("seed is invalid.");
      }
    }
  }
  if (typeof input.traceId !== "string" || input.traceId.trim() === "") {
    errors.push("traceId must be a non-empty string.");
  } else if (hasSensitiveContent(input.traceId)) {
    errors.push("traceId contains disallowed content.");
  }
  const source = input.sourceImage;
  if (!source || typeof source !== "object") {
    errors.push("Source image reference is invalid.");
  } else {
    const kind = source.kind;
    const value = source.value;
    if (kind !== "https_url" && kind !== "data_uri") {
      errors.push("Source image reference is invalid.");
    } else if (typeof value !== "string" || value.trim() === "") {
      errors.push("Source image reference is invalid.");
    } else if (kind === "https_url") {
      if (!value.startsWith("https://") || value.startsWith("http://")) {
        errors.push("Source image reference is invalid.");
      } else {
        try {
          const u = new URL(value);
          if (u.protocol !== "https:" || u.username || u.password) {
            errors.push("Source image reference is invalid.");
          }
        } catch {
          errors.push("Source image reference is invalid.");
        }
      }
    } else if (kind === "data_uri") {
      const lower = value.slice(0, 64).toLowerCase();
      if (lower.includes("image/svg")) {
        errors.push("Source image reference is invalid.");
      } else if (!ALLOWED_DATA_URI_PREFIXES.some(
        (p) => value.toLowerCase().startsWith(p)
      )) {
        errors.push("Source image reference is invalid.");
      } else if (value.length > MAX_DATA_URI_CHARS) {
        errors.push("Source image reference is invalid.");
      }
    }
    if (typeof value === "string" && (hasSensitiveContent(value.slice(0, 200)) && kind === "https_url" ? /authorization|bearer\s|r8_|api[_-]?key/i.test(value) : false)) {
      errors.push("Source image reference is invalid.");
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
function buildReplicateCreatePredictionBody(config, input) {
  const formatted = input.formattedRequest;
  let prompt = formatted.prompt;
  const negative = formatted.negativePrompt?.trim();
  if (negative) {
    prompt = `${prompt}

${NEGATIVE_PROMPT_APPENDIX_LABEL}:
${negative}`;
  }
  const bodyInput = {
    prompt,
    input_image: input.sourceImage.value,
    aspect_ratio: "match_input_image",
    output_format: "png",
    safety_tolerance: 2
  };
  if (formatted.aspectRatio !== void 0 && SUPPORTED_FORMATTER_ASPECT_RATIOS.includes(
    formatted.aspectRatio
  )) {
    bodyInput.aspect_ratio = formatted.aspectRatio;
  }
  if (formatted.seed !== void 0) {
    bodyInput.seed = formatted.seed;
  }
  return {
    model: config.model,
    input: bodyInput
  };
}
function isAllowedReplicatePollUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.hostname !== "api.replicate.com") return false;
    if (u.hash) return false;
    if (!u.pathname.startsWith("/v1/predictions/")) return false;
    if (u.pathname === "/v1/predictions/" || u.pathname === "/v1/predictions") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
function resolveOfficialReplicateApiBaseUrl(apiBaseUrl) {
  if (typeof apiBaseUrl !== "string") return null;
  const trimmed = apiBaseUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (u.hostname !== "api.replicate.com") return null;
    if (u.port !== "") return null;
    if (u.search !== "") return null;
    if (u.hash !== "") return null;
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    if (pathname !== "/v1") return null;
    return DEFAULT_REPLICATE_API_BASE_URL;
  } catch {
    return null;
  }
}
function linkAbortSignals(signals) {
  const controller = new AbortController();
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller;
}
var ReplicateTransportAdapter = class {
  constructor(config, dependencies) {
    this.id = "replicate-transport-v1";
    this.provider = "replicate";
    this.config = config;
    this.deps = resolveDeps(dependencies);
  }
  async generate(input) {
    const started = this.deps.now();
    const elapsed = () => Math.max(0, this.deps.now() - started);
    const traceId = typeof input?.traceId === "string" && input.traceId.trim() ? input.traceId : "missing-trace";
    try {
      if (!this.config.enabled) {
        return normalizeReplicateFailure({
          code: "adapter_disabled",
          message: "Replicate transport adapter is disabled.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed()
        });
      }
      if (!this.config.apiToken) {
        return normalizeReplicateFailure({
          code: "missing_token",
          message: "Replicate API token is not configured.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model
        });
      }
      const validation = validateReplicateTransportInput(input);
      if (!validation.valid) {
        return normalizeReplicateFailure({
          code: "invalid_request",
          message: "Transport input is invalid.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model,
          warnings: validation.warnings
        });
      }
      const apiBaseUrl = resolveOfficialReplicateApiBaseUrl(
        this.config.apiBaseUrl
      );
      if (!apiBaseUrl) {
        return normalizeReplicateFailure({
          code: "invalid_request",
          message: "Replicate transport configuration is invalid.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model
        });
      }
      const body = buildReplicateCreatePredictionBody(this.config, input);
      const [owner, name] = this.config.model.split("/");
      const createUrl = `${apiBaseUrl}/models/${owner}/${name}/predictions`;
      const totalController = new AbortController();
      const totalTimer = setTimeout(
        () => totalController.abort(),
        this.config.totalTimeoutMs
      );
      const createController = linkAbortSignals([
        input.abortSignal,
        totalController.signal
      ]);
      const createTimer = setTimeout(
        () => createController.abort(),
        this.config.createTimeoutMs
      );
      const preferWaitSeconds = Math.max(
        1,
        Math.min(12, Math.floor(this.config.createTimeoutMs / 1e3) - 8)
      );
      let createResponse;
      try {
        createResponse = await this.deps.fetchFn(createUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            "Content-Type": "application/json",
            Prefer: `wait=${preferWaitSeconds}`,
            // Auto-cancel hung predictions inside the create/total budget.
            "Cancel-After": `${Math.max(
              5,
              Math.ceil(this.config.totalTimeoutMs / 1e3)
            )}s`
          },
          body: JSON.stringify({ input: body.input }),
          signal: createController.signal
        });
      } catch (err) {
        clearTimeout(createTimer);
        clearTimeout(totalTimer);
        if (isAbortError(err)) {
          if (input.abortSignal?.aborted) {
            return normalizeReplicateFailure({
              code: "request_aborted",
              message: "Request was aborted.",
              retryable: true,
              traceId,
              generationTimeMs: elapsed(),
              model: this.config.model
            });
          }
          return normalizeReplicateFailure({
            code: "request_timeout",
            message: "Request timed out.",
            retryable: true,
            traceId,
            generationTimeMs: elapsed(),
            model: this.config.model
          });
        }
        if (isTimeoutLikeFetchError(err)) {
          return normalizeReplicateFailure({
            code: "request_timeout",
            message: "Request timed out.",
            retryable: true,
            traceId,
            generationTimeMs: elapsed(),
            model: this.config.model
          });
        }
        return normalizeReplicateFailure({
          code: "unknown_transport_error",
          message: "Transport request failed.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model
        });
      } finally {
        clearTimeout(createTimer);
      }
      if (!createResponse.ok) {
        clearTimeout(totalTimer);
        let bodyText = "";
        try {
          bodyText = await createResponse.text();
        } catch {
          bodyText = "";
        }
        return normalizeHttpFailure(
          createResponse.status,
          traceId,
          elapsed(),
          bodyText,
          { model: this.config.model }
        );
      }
      let createJson;
      try {
        createJson = await createResponse.json();
      } catch {
        clearTimeout(totalTimer);
        return normalizeReplicateFailure({
          code: "invalid_provider_response",
          message: "Provider returned an invalid create response.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model
        });
      }
      const prediction = parsePredictionPayload(createJson);
      if (!prediction) {
        clearTimeout(totalTimer);
        return normalizeReplicateFailure({
          code: "invalid_provider_response",
          message: "Provider returned an invalid create response.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          model: this.config.model
        });
      }
      const predictionId = typeof prediction.id === "string" ? prediction.id : void 0;
      let status = normalizeReplicateStatus(prediction.status);
      let pollingAttempts = 0;
      const finishSuccess = (output, providerStatus) => {
        const imageUrl = extractReplicateImageUrl(output);
        if (!imageUrl) {
          return normalizeReplicateFailure({
            code: "invalid_provider_response",
            message: "Provider output did not contain a valid HTTPS image URL.",
            retryable: false,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            status: status ?? void 0,
            pollingAttempts,
            providerStatus
          });
        }
        const success = {
          success: true,
          provider: "replicate",
          predictionId: predictionId ?? "unknown",
          model: this.config.model,
          status: "succeeded",
          imageUrl,
          generationTimeMs: elapsed(),
          warnings: [],
          metadata: {
            traceId,
            formatterName: input.formattedRequest.metadata.formatterName,
            formatterVersion: input.formattedRequest.metadata.formatterVersion,
            pollingAttempts,
            providerStatus
          }
        };
        return success;
      };
      if (status === "succeeded") {
        clearTimeout(totalTimer);
        return finishSuccess(prediction.output, status);
      }
      if (status === "failed" || status === "canceled") {
        clearTimeout(totalTimer);
        return normalizeReplicateFailure({
          code: "provider_failed",
          message: "Provider prediction failed.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          predictionId,
          model: this.config.model,
          status,
          pollingAttempts,
          providerStatus: status,
          providerError: prediction.error
        });
      }
      const pollUrlRaw = prediction.urls && typeof prediction.urls.get === "string" ? prediction.urls.get : predictionId ? `${apiBaseUrl}/predictions/${predictionId}` : null;
      if (!pollUrlRaw || !isAllowedReplicatePollUrl(pollUrlRaw)) {
        clearTimeout(totalTimer);
        return normalizeReplicateFailure({
          code: "invalid_provider_response",
          message: "Provider returned an untrusted polling URL.",
          retryable: false,
          traceId,
          generationTimeMs: elapsed(),
          predictionId,
          model: this.config.model,
          pollingAttempts
        });
      }
      let latestOutput = prediction.output;
      let latestError = prediction.error;
      while (pollingAttempts < this.config.maxPollAttempts) {
        if (input.abortSignal?.aborted || totalController.signal.aborted) {
          clearTimeout(totalTimer);
          if (input.abortSignal?.aborted) {
            return normalizeReplicateFailure({
              code: "request_aborted",
              message: "Request was aborted.",
              retryable: true,
              traceId,
              generationTimeMs: elapsed(),
              predictionId,
              model: this.config.model,
              pollingAttempts
            });
          }
          return normalizeReplicateFailure({
            code: "request_timeout",
            message: "Request timed out.",
            retryable: true,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            pollingAttempts
          });
        }
        try {
          await this.deps.sleep(
            this.config.pollIntervalMs,
            linkAbortSignals([input.abortSignal, totalController.signal]).signal
          );
        } catch (err) {
          clearTimeout(totalTimer);
          if (isAbortError(err) && input.abortSignal?.aborted) {
            return normalizeReplicateFailure({
              code: "request_aborted",
              message: "Request was aborted.",
              retryable: true,
              traceId,
              generationTimeMs: elapsed(),
              predictionId,
              model: this.config.model,
              pollingAttempts
            });
          }
          return normalizeReplicateFailure({
            code: "request_timeout",
            message: "Request timed out.",
            retryable: true,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            pollingAttempts
          });
        }
        pollingAttempts += 1;
        const pollController = linkAbortSignals([
          input.abortSignal,
          totalController.signal
        ]);
        let pollResponse;
        try {
          pollResponse = await this.deps.fetchFn(pollUrlRaw, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${this.config.apiToken}`,
              "Content-Type": "application/json"
            },
            signal: pollController.signal
          });
        } catch (err) {
          clearTimeout(totalTimer);
          if (isAbortError(err)) {
            if (input.abortSignal?.aborted) {
              return normalizeReplicateFailure({
                code: "request_aborted",
                message: "Request was aborted.",
                retryable: true,
                traceId,
                generationTimeMs: elapsed(),
                predictionId,
                model: this.config.model,
                pollingAttempts
              });
            }
            return normalizeReplicateFailure({
              code: "request_timeout",
              message: "Request timed out.",
              retryable: true,
              traceId,
              generationTimeMs: elapsed(),
              predictionId,
              model: this.config.model,
              pollingAttempts
            });
          }
          if (isTimeoutLikeFetchError(err)) {
            return normalizeReplicateFailure({
              code: "request_timeout",
              message: "Request timed out.",
              retryable: true,
              traceId,
              generationTimeMs: elapsed(),
              predictionId,
              model: this.config.model,
              pollingAttempts
            });
          }
          return normalizeReplicateFailure({
            code: "unknown_transport_error",
            message: "Transport polling failed.",
            retryable: false,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            pollingAttempts
          });
        }
        if (!pollResponse.ok) {
          clearTimeout(totalTimer);
          let bodyText = "";
          try {
            bodyText = await pollResponse.text();
          } catch {
            bodyText = "";
          }
          return normalizeHttpFailure(
            pollResponse.status,
            traceId,
            elapsed(),
            bodyText,
            {
              predictionId,
              model: this.config.model,
              pollingAttempts
            }
          );
        }
        let pollJson;
        try {
          pollJson = await pollResponse.json();
        } catch {
          clearTimeout(totalTimer);
          return normalizeReplicateFailure({
            code: "invalid_provider_response",
            message: "Provider returned an invalid poll response.",
            retryable: false,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            pollingAttempts
          });
        }
        const polled = parsePredictionPayload(pollJson);
        if (!polled) {
          clearTimeout(totalTimer);
          return normalizeReplicateFailure({
            code: "invalid_provider_response",
            message: "Provider returned an invalid poll response.",
            retryable: false,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            pollingAttempts
          });
        }
        status = normalizeReplicateStatus(polled.status);
        latestOutput = polled.output;
        latestError = polled.error;
        if (status === "succeeded") {
          clearTimeout(totalTimer);
          return finishSuccess(latestOutput, status);
        }
        if (status === "failed" || status === "canceled") {
          clearTimeout(totalTimer);
          return normalizeReplicateFailure({
            code: "provider_failed",
            message: "Provider prediction failed.",
            retryable: false,
            traceId,
            generationTimeMs: elapsed(),
            predictionId,
            model: this.config.model,
            status,
            pollingAttempts,
            providerStatus: status,
            providerError: latestError
          });
        }
      }
      clearTimeout(totalTimer);
      return normalizeReplicateFailure({
        code: "polling_exhausted",
        message: "Polling attempts exhausted.",
        retryable: true,
        traceId,
        generationTimeMs: elapsed(),
        predictionId,
        model: this.config.model,
        pollingAttempts
      });
    } catch {
      return normalizeReplicateFailure({
        code: "unknown_transport_error",
        message: "Unexpected transport failure.",
        retryable: false,
        traceId,
        generationTimeMs: elapsed(),
        model: this.config.model
      });
    }
  }
};

// src/ai/body-simulator/BodySimulatorTypes.ts
var BODY_SIMULATOR_INPUT_SCHEMA_VERSION = 1;
var BODY_SIMULATOR_RULES_SCHEMA_VERSION = 1;
var BODY_SIMULATOR_RULES_VERSION = "1.0";
var BODY_SIMULATION_GOAL_TYPES = Object.freeze([
  "weight_loss",
  "fat_loss_with_muscle_preservation",
  "muscle_gain",
  "body_recomposition",
  "general_fitness_improvement"
]);
var BODY_SIMULATION_INTENSITIES = Object.freeze(["conservative", "realistic", "ambitious"]);
var BODY_SIMULATOR_TIMELINE_MIN_WEEKS = 4;
var BODY_SIMULATOR_TIMELINE_MAX_WEEKS = 52;
var REPORTED_EFFECT_DIRECTIONS = Object.freeze([
  "strong_decrease",
  "moderate_decrease",
  "slight_decrease",
  "no_effect",
  "slight_increase",
  "moderate_increase",
  "strong_increase",
  "unknown"
]);
var BODY_SIMULATOR_REGIONS = Object.freeze([
  "face_and_neck",
  "shoulders",
  "chest_and_upper_torso",
  "upper_back",
  "arms",
  "waist_and_flanks",
  "abdomen",
  "hips",
  "glutes",
  "thighs",
  "lower_legs",
  "whole_body"
]);
var BODY_SIMULATOR_CONFIDENCE_REASONS = Object.freeze([
  "user_declared_height_available",
  "user_declared_weight_available",
  "body_fat_measurement_available",
  "body_fat_user_estimate_only",
  "body_fat_not_provided",
  "training_experience_available",
  "training_experience_missing",
  "whole_body_visible",
  "front_view_available",
  "side_view_available",
  "back_view_available",
  "single_view_only",
  "body_region_visible",
  "body_region_occluded",
  "strong_backlight",
  "timeline_within_supported_range",
  "target_required_moderation",
  "medication_effect_user_reported",
  "medication_effect_unknown",
  "limited_baseline_data"
]);
var BODY_SIMULATOR_FORBIDDEN_OUTPUTS = Object.freeze([
  "beauty_score",
  "attractiveness_score",
  "body_ranking",
  "ideal_body_ranking",
  "shame_based_label",
  "normal_versus_abnormal_judgment",
  "medical_diagnosis",
  "guaranteed_result",
  "social_desirability_score"
]);
function createDefaultMedicationEffects() {
  return {
    medicationMayAffectWeight: false,
    appetite: "no_effect",
    energyLevel: "no_effect",
    metabolismTendency: "no_effect",
    muscleBuildingOrPreservation: "no_effect",
    evidence: {
      origin: "user_declared",
      confidence: "not_applicable",
      notes: []
    }
  };
}

// src/ai/body-simulator/BodySimulatorValidation.ts
var FORBIDDEN_SUBSTRINGS = [
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
  "openai.com"
];
var PATH_LIKE = /(?:^|[\\/])(?:Users|home|var|tmp|Windows|Program Files)[\\/]|[A-Za-z]:\\|\.\.[\\/]/i;
function isFiniteNumber2(n) {
  return typeof n === "number" && Number.isFinite(n);
}
function push(errors, code, path, message) {
  errors.push({ code, path, message });
}
function scanForbidden(value, path, errors) {
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
    for (const [k, v] of Object.entries(value)) {
      const keyLower = k.toLowerCase();
      if (keyLower.includes("prompt") || keyLower === "provider" || keyLower === "model" || keyLower === "modelid" || keyLower === "providerid" || keyLower.includes("apikey") || keyLower.includes("token")) {
        if (path === "input" || path.startsWith("goal") || path.startsWith("options") || path.startsWith("profile") || path.startsWith("activity") || path.startsWith("medicationEffects") || path.startsWith("sourceImageContext")) {
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
function validateEffect(value, path, errors) {
  if (typeof value !== "string" || !REPORTED_EFFECT_DIRECTIONS.includes(value)) {
    push(errors, "invalid_effect_direction", path, `Invalid effect direction at ${path}`);
  }
}
function validateBodySimulatorInput(input) {
  const errors = [];
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    push(errors, "invalid_input_shape", "input", "Input must be an object");
    return errors;
  }
  const i = input;
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
    if (!BODY_SIMULATION_GOAL_TYPES.includes(
      i.goal.type
    )) {
      push(errors, "unsupported_goal", "goal.type", `Unsupported goal: ${String(i.goal.type)}`);
    }
    const weeks = i.goal.timelineWeeks;
    if (!isFiniteNumber2(weeks)) {
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
    if (!BODY_SIMULATION_INTENSITIES.includes(
      i.goal.intensity
    )) {
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
      "targetMuscleChangeKg"
    ]) {
      const v = i.goal[key];
      if (v != null && !isFiniteNumber2(v)) {
        push(errors, "invalid_number", `goal.${key}`, `${key} must be finite or null`);
      }
    }
  }
  if (!i.profile || typeof i.profile !== "object") {
    push(errors, "invalid_input_shape", "profile", "profile is required");
  } else {
    const p = i.profile;
    if (p.ageYears != null && !isFiniteNumber2(p.ageYears)) {
      push(errors, "invalid_number", "profile.ageYears", "ageYears must be finite or null");
    }
    if (p.heightCm != null) {
      if (!isFiniteNumber2(p.heightCm)) {
        push(errors, "invalid_number", "profile.heightCm", "heightCm must be finite or null");
      } else if (p.heightCm < 0) {
        push(errors, "invalid_height", "profile.heightCm", "heightCm must not be negative");
      }
    }
    if (p.currentWeightKg != null) {
      if (!isFiniteNumber2(p.currentWeightKg)) {
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
    if (p.currentBodyFatPercent != null && !isFiniteNumber2(p.currentBodyFatPercent)) {
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
      "cardioSessionsPerWeek"
    ]) {
      const v = i.activity[key];
      if (v != null && (!isFiniteNumber2(v) || v < 0)) {
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
      "muscleBuildingOrPreservation"
    ]) {
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
      "preserveLightingCharacter"
    ];
    for (const key of requiredTrue) {
      if (o[key] !== true) {
        push(errors, "invalid_options", `options.${key}`, `${key} must be true`);
      }
    }
  }
  if (!i.sourceImageContext || typeof i.sourceImageContext !== "object") {
    push(errors, "invalid_input_shape", "sourceImageContext", "sourceImageContext is required");
  }
  scanForbidden(input, "input", errors);
  return errors;
}

// src/ai/body-simulator/BodySimulatorRules.ts
var BODY_SIM_WEEKS_PER_MONTH = 4.345;
var BODY_SIM_TIMELINE_MAGNITUDE_SCALE = 1;
var BODY_SIM_TIMELINE_MIN_RELATIVE_MAGNITUDE = 0.12;
var BODY_SIM_INTENSITY_CONSERVATIVE_EXPECTED = 0.7;
var BODY_SIM_INTENSITY_REALISTIC_EXPECTED = 1;
var BODY_SIM_INTENSITY_AMBITIOUS_EXPECTED = 1.25;
var BODY_SIM_INTENSITY_CONSERVATIVE_SPREAD = 0.15;
var BODY_SIM_INTENSITY_REALISTIC_SPREAD = 0.25;
var BODY_SIM_INTENSITY_AMBITIOUS_SPREAD = 0.3;
var BODY_SIM_MAX_FAT_LOSS_PP_PER_WEEK = 0.35;
var BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE = 12;
var BODY_SIM_MAX_MUSCLE_GAIN_KG_PER_WEEK = 0.12;
var BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE = 6;
var BODY_SIM_MAX_WEIGHT_LOSS_KG_PER_WEEK = 0.75;
var BODY_SIM_MAX_WEIGHT_LOSS_KG_ABSOLUTE = 25;
var BODY_SIM_MAX_WEIGHT_GAIN_KG_PER_WEEK = 0.35;
var BODY_SIM_MAX_WEIGHT_GAIN_KG_ABSOLUTE = 12;
var BODY_SIM_DEFAULT_FAT_LOSS_PP_PER_WEEK = 0.12;
var BODY_SIM_DEFAULT_MUSCLE_GAIN_KG_PER_WEEK = 0.06;
var BODY_SIM_DEFAULT_WEIGHT_LOSS_KG_PER_WEEK = 0.35;
var BODY_SIM_GENERAL_FITNESS_FAT_LOSS_PP_PER_WEEK = 0.04;
var BODY_SIM_GENERAL_FITNESS_MUSCLE_KG_PER_WEEK = 0.02;
var BODY_SIM_GENERAL_FITNESS_WEIGHT_KG_PER_WEEK = 0.08;
var BODY_SIM_RECOMP_FAT_LOSS_PP_PER_WEEK = 0.08;
var BODY_SIM_RECOMP_MUSCLE_KG_PER_WEEK = 0.03;
var BODY_SIM_MUSCLE_RATE_BEGINNER = 1;
var BODY_SIM_MUSCLE_RATE_INTERMEDIATE = 0.75;
var BODY_SIM_MUSCLE_RATE_ADVANCED = 0.5;
var BODY_SIM_MUSCLE_RATE_NOT_PROVIDED = 0.7;
var BODY_SIM_CONSISTENCY_HIGH = 1.1;
var BODY_SIM_CONSISTENCY_MODERATE = 1;
var BODY_SIM_CONSISTENCY_LOW = 0.85;
var BODY_SIM_CONSISTENCY_NOT_PROVIDED = 0.9;
var BODY_SIM_PROTEIN_HIGH = 1.08;
var BODY_SIM_PROTEIN_ADEQUATE = 1;
var BODY_SIM_PROTEIN_LOW = 0.88;
var BODY_SIM_RECOVERY_STRONG = 1.08;
var BODY_SIM_RECOVERY_MODERATE = 1;
var BODY_SIM_RECOVERY_LIMITED = 0.88;
var BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE = 0.12;
var BODY_SIM_MED_MAX_MUSCLE_INFLUENCE = 0.1;
var BODY_SIM_MED_APPETITE_SLIGHT_DECREASE = 0.04;
var BODY_SIM_MED_APPETITE_MODERATE_DECREASE = 0.07;
var BODY_SIM_MED_APPETITE_STRONG_DECREASE = 0.1;
var BODY_SIM_MED_APPETITE_SLIGHT_INCREASE = -0.04;
var BODY_SIM_MED_APPETITE_MODERATE_INCREASE = -0.07;
var BODY_SIM_MED_APPETITE_STRONG_INCREASE = -0.1;
var BODY_SIM_MED_ENERGY_SLIGHT_DECREASE = -0.03;
var BODY_SIM_MED_ENERGY_MODERATE_DECREASE = -0.05;
var BODY_SIM_MED_ENERGY_SLIGHT_INCREASE = 0.03;
var BODY_SIM_MED_ENERGY_MODERATE_INCREASE = 0.05;
var BODY_SIM_MED_METABOLISM_SCALE = 0.5;
var BODY_SIM_MED_MUSCLE_SLIGHT_INCREASE = 0.04;
var BODY_SIM_MED_MUSCLE_MODERATE_INCREASE = 0.07;
var BODY_SIM_MED_MUSCLE_SLIGHT_DECREASE = -0.04;
var BODY_SIM_MED_MUSCLE_MODERATE_DECREASE = -0.07;
var BODY_SIM_REGION_FAT_WEIGHT = Object.freeze({
  face_and_neck: 0.45,
  shoulders: 0.35,
  chest_and_upper_torso: 0.55,
  upper_back: 0.4,
  arms: 0.4,
  waist_and_flanks: 1,
  abdomen: 1,
  hips: 0.75,
  glutes: 0.65,
  thighs: 0.7,
  lower_legs: 0.3,
  whole_body: 0.85
});
var BODY_SIM_REGION_MUSCLE_WEIGHT = Object.freeze({
  face_and_neck: 0.15,
  shoulders: 0.85,
  chest_and_upper_torso: 0.9,
  upper_back: 0.85,
  arms: 0.8,
  waist_and_flanks: 0.35,
  abdomen: 0.45,
  hips: 0.4,
  glutes: 0.75,
  thighs: 0.85,
  lower_legs: 0.55,
  whole_body: 0.8
});
var BODY_SIM_REGION_VISUAL_BASE = 0.55;
var BODY_SIM_REGION_VISUAL_MAX = 1;
function intensityExpectedMultiplier(intensity) {
  switch (intensity) {
    case "conservative":
      return BODY_SIM_INTENSITY_CONSERVATIVE_EXPECTED;
    case "ambitious":
      return BODY_SIM_INTENSITY_AMBITIOUS_EXPECTED;
    case "realistic":
    default:
      return BODY_SIM_INTENSITY_REALISTIC_EXPECTED;
  }
}
function intensitySpread(intensity) {
  switch (intensity) {
    case "conservative":
      return BODY_SIM_INTENSITY_CONSERVATIVE_SPREAD;
    case "ambitious":
      return BODY_SIM_INTENSITY_AMBITIOUS_SPREAD;
    case "realistic":
    default:
      return BODY_SIM_INTENSITY_REALISTIC_SPREAD;
  }
}
function muscleRateForExperience(experience) {
  switch (experience) {
    case "beginner":
      return BODY_SIM_MUSCLE_RATE_BEGINNER;
    case "intermediate":
      return BODY_SIM_MUSCLE_RATE_INTERMEDIATE;
    case "advanced":
      return BODY_SIM_MUSCLE_RATE_ADVANCED;
    case "not_provided":
    default:
      return BODY_SIM_MUSCLE_RATE_NOT_PROVIDED;
  }
}
function consistencyFactor(consistency) {
  switch (consistency) {
    case "high":
      return BODY_SIM_CONSISTENCY_HIGH;
    case "moderate":
      return BODY_SIM_CONSISTENCY_MODERATE;
    case "low":
      return BODY_SIM_CONSISTENCY_LOW;
    case "not_provided":
    default:
      return BODY_SIM_CONSISTENCY_NOT_PROVIDED;
  }
}
function proteinFactor(protein) {
  switch (protein) {
    case "likely_high":
      return BODY_SIM_PROTEIN_HIGH;
    case "likely_adequate":
      return BODY_SIM_PROTEIN_ADEQUATE;
    case "likely_low":
      return BODY_SIM_PROTEIN_LOW;
    case "not_provided":
    default:
      return 1;
  }
}
function recoveryFactor(recovery) {
  switch (recovery) {
    case "strong":
      return BODY_SIM_RECOVERY_STRONG;
    case "moderate":
      return BODY_SIM_RECOVERY_MODERATE;
    case "limited":
      return BODY_SIM_RECOVERY_LIMITED;
    case "not_provided":
    default:
      return 1;
  }
}
function appetiteModifier(direction) {
  switch (direction) {
    case "slight_decrease":
      return BODY_SIM_MED_APPETITE_SLIGHT_DECREASE;
    case "moderate_decrease":
      return BODY_SIM_MED_APPETITE_MODERATE_DECREASE;
    case "strong_decrease":
      return BODY_SIM_MED_APPETITE_STRONG_DECREASE;
    case "slight_increase":
      return BODY_SIM_MED_APPETITE_SLIGHT_INCREASE;
    case "moderate_increase":
      return BODY_SIM_MED_APPETITE_MODERATE_INCREASE;
    case "strong_increase":
      return BODY_SIM_MED_APPETITE_STRONG_INCREASE;
    case "no_effect":
    case "unknown":
    default:
      return 0;
  }
}
function energyModifier(direction) {
  switch (direction) {
    case "slight_decrease":
      return BODY_SIM_MED_ENERGY_SLIGHT_DECREASE;
    case "moderate_decrease":
    case "strong_decrease":
      return BODY_SIM_MED_ENERGY_MODERATE_DECREASE;
    case "slight_increase":
      return BODY_SIM_MED_ENERGY_SLIGHT_INCREASE;
    case "moderate_increase":
    case "strong_increase":
      return BODY_SIM_MED_ENERGY_MODERATE_INCREASE;
    case "no_effect":
    case "unknown":
    default:
      return 0;
  }
}
function metabolismModifier(direction) {
  const raw = appetiteModifier(direction);
  return raw * BODY_SIM_MED_METABOLISM_SCALE;
}
function muscleMedModifier(direction) {
  switch (direction) {
    case "slight_increase":
      return BODY_SIM_MED_MUSCLE_SLIGHT_INCREASE;
    case "moderate_increase":
    case "strong_increase":
      return BODY_SIM_MED_MUSCLE_MODERATE_INCREASE;
    case "slight_decrease":
      return BODY_SIM_MED_MUSCLE_SLIGHT_DECREASE;
    case "moderate_decrease":
    case "strong_decrease":
      return BODY_SIM_MED_MUSCLE_MODERATE_DECREASE;
    case "no_effect":
    case "unknown":
    default:
      return 0;
  }
}
function clamp2(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
function round3(n) {
  return Math.round(n * 1e3) / 1e3;
}
function goalPrimaryFatDirection(goal) {
  switch (goal) {
    case "weight_loss":
    case "fat_loss_with_muscle_preservation":
    case "body_recomposition":
      return "decrease";
    case "muscle_gain":
      return "stable_or_unknown";
    case "general_fitness_improvement":
      return "mixed";
    default:
      return "mixed";
  }
}
function goalPrimaryMuscleDirection(goal) {
  switch (goal) {
    case "muscle_gain":
    case "body_recomposition":
      return "increase";
    case "fat_loss_with_muscle_preservation":
      return "stable";
    case "weight_loss":
    case "general_fitness_improvement":
      return "mixed";
    default:
      return "mixed";
  }
}

// src/ai/body-simulator/AnatomicalTransformationRules.ts
var ANATOMICAL_EFFORT_MODERATE = 0.7;
var ANATOMICAL_EFFORT_HARD = 0.85;
var ANATOMICAL_EFFORT_STRICT = 1;
var ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP = 0.5;
var ANATOMICAL_BF_DELTA_MODEST_PP = 3.5;
var ANATOMICAL_BF_DELTA_CLEAR_PP = 5.5;
var ANATOMICAL_BF_DELTA_SUBSTANTIAL_GAIN_PP = 4;
var ANATOMICAL_FAT_GAIN_WAIST_CAP_SCORE = 0.55;
var ANATOMICAL_TIMELINE_SUBTLE_MAX = 0.38;
var ANATOMICAL_TIMELINE_MODERATE_MAX = 0.58;
var ANATOMICAL_TIMELINE_CLEAR_MAX = 0.78;
var ANATOMICAL_PRIORITY_PRESERVATION = 900;
var ANATOMICAL_PRIORITY_BODY_FAT = 800;
var ANATOMICAL_PRIORITY_GOAL = 700;
var ANATOMICAL_PRIORITY_FOCUS = 560;
var ANATOMICAL_FOCUS_PRIORITY_BOOST = 120;
var ANATOMICAL_PRIORITY_OPTIONAL_NOTE = 100;
var ANATOMICAL_MUSCLE_VOLUME_REGIONS = Object.freeze([
  "shoulders",
  "chest_and_upper_torso",
  "upper_back",
  "arms",
  "glutes",
  "thighs",
  "lower_legs"
]);
var ANATOMICAL_FOCUS_FEATURE_MAP = Object.freeze({
  core: [
    "abdominal_definition",
    "oblique_definition",
    "serratus_definition",
    "waist_width"
  ],
  abs: [
    "abdominal_definition",
    "oblique_definition",
    "serratus_definition",
    "waist_width"
  ],
  chest: ["chest_definition", "chest_volume"],
  arms: ["arm_definition", "arm_volume"],
  shoulders: [
    "shoulder_definition",
    "shoulder_volume",
    "chest_definition",
    "upper_back_definition"
  ],
  upper_body: [
    "shoulder_definition",
    "shoulder_volume",
    "chest_definition",
    "chest_volume",
    "upper_back_definition",
    "arm_definition",
    "arm_volume"
  ],
  back: ["upper_back_definition", "lat_width"],
  glutes: ["glute_volume", "thigh_definition"],
  thighs: ["thigh_volume", "thigh_definition"],
  /** Posture: no skeletal change — empty anatomical feature map. */
  posture: []
});
function effortCoefficientForIntensity(intensity) {
  switch (intensity) {
    case "conservative":
      return { label: "moderate", coefficient: ANATOMICAL_EFFORT_MODERATE };
    case "ambitious":
      return { label: "strict", coefficient: ANATOMICAL_EFFORT_STRICT };
    case "realistic":
    default:
      return { label: "hard", coefficient: ANATOMICAL_EFFORT_HARD };
  }
}
function magnitudeFromScore(score) {
  if (score < ANATOMICAL_TIMELINE_SUBTLE_MAX) return "subtle";
  if (score < ANATOMICAL_TIMELINE_MODERATE_MAX) return "moderate";
  if (score < ANATOMICAL_TIMELINE_CLEAR_MAX) return "clear";
  return "pronounced";
}
function magnitudeOrdinal(m) {
  switch (m) {
    case "subtle":
      return 1;
    case "moderate":
      return 2;
    case "clear":
      return 3;
    case "pronounced":
      return 4;
    default:
      return 0;
  }
}
function scaleMagnitude(base, factor) {
  const scaled = magnitudeOrdinal(base) * factor;
  if (scaled < 1.5) return "subtle";
  if (scaled < 2.5) return "moderate";
  if (scaled < 3.5) return "clear";
  return "pronounced";
}
function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

// src/ai/body-simulator/AnatomicalTransformationTypes.ts
var ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION = 1;
var BODY_SIMULATOR_FOCUS_ZONES = Object.freeze([
  "core",
  "abs",
  "chest",
  "arms",
  "shoulders",
  "upper_body",
  "back",
  "glutes",
  "thighs",
  "posture"
]);

// src/ai/body-simulator/GoalConsistencyValidator.ts
function resolveBodyFatDelta(input) {
  const current = input.profile.currentBodyFatPercent;
  const absolute = input.goal.targetBodyFatPercent !== void 0 ? input.goal.targetBodyFatPercent : null;
  if (current != null && absolute != null) {
    return absolute - current;
  }
  const change = input.goal.targetBodyFatChangePercentagePoints;
  if (change != null) return change;
  return null;
}
function notesText(input) {
  const notes = input.optionalNotes ?? [];
  return notes.join(" ").toLowerCase();
}
function validateGoalConsistency(input) {
  const issues = [];
  const delta = resolveBodyFatDelta(input);
  const goal = input.goal.type;
  const notes = notesText(input);
  const focusZones = input.focusZones ?? [];
  const muscleTarget = input.goal.targetMuscleChangeKg;
  const wantsMuscle = goal === "muscle_gain" || goal === "body_recomposition" || muscleTarget != null && muscleTarget > 0;
  const meaningfulFatDecrease = delta != null && delta <= -ANATOMICAL_BF_DELTA_MODEST_PP;
  const meaningfulFatIncrease = delta != null && delta >= ANATOMICAL_BF_DELTA_MODEST_PP;
  if ((goal === "muscle_gain" || wantsMuscle && /bulk/.test(notes)) && meaningfulFatDecrease) {
    issues.push({
      code: "muscle_gain_with_fat_decrease",
      severity: "warning",
      message: "These goals combine muscle gain with body-fat reduction. HelseApp can simulate this as body recomposition or lean bulk.",
      suggestedInterpretation: "lean_bulk_or_recomposition"
    });
  }
  if (goal === "body_recomposition" && wantsMuscle && meaningfulFatDecrease) {
    issues.push({
      code: "recomposition_interpretation",
      severity: "info",
      message: "Muscle gain with body-fat reduction is interpreted as body recomposition for anatomical planning.",
      suggestedInterpretation: "body_recomposition"
    });
  }
  if ((goal === "muscle_gain" || goal === "body_recomposition") && focusZones.length === 0) {
    issues.push({
      code: "muscle_gain_without_focus_zones",
      severity: "info",
      message: "No focus zones were selected. Muscle-volume changes will use a balanced whole-body distribution.",
      suggestedInterpretation: null
    });
  }
  const changePp = input.goal.targetBodyFatChangePercentagePoints;
  const absoluteTarget = input.goal.targetBodyFatPercent;
  const current = input.profile.currentBodyFatPercent;
  if (changePp != null && changePp <= -ANATOMICAL_BF_DELTA_MODEST_PP && absoluteTarget != null && current != null && absoluteTarget - current >= ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP) {
    issues.push({
      code: "fat_decrease_vs_increase_target",
      severity: "warning",
      message: "Requested body-fat change direction conflicts with the absolute body-fat target. The absolute target is used for anatomical direction.",
      suggestedInterpretation: "prefer_absolute_body_fat_target"
    });
  }
  if (delta != null && Math.abs(delta) < ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP && /(shred|ripped|etched|stage.?ready)/i.test(notes)) {
    issues.push({
      code: "stable_bf_with_shred_note",
      severity: "warning",
      message: "Optional notes describe very low body-fat appearance while the body-fat target is unchanged. Anatomical planning follows the body-fat target.",
      suggestedInterpretation: "follow_body_fat_target"
    });
  }
  if (meaningfulFatDecrease && /\bbulk\b/i.test(notes)) {
    issues.push({
      code: "fat_decrease_with_bulk_note",
      severity: "warning",
      message: "Optional notes mention bulk while body-fat is decreasing. This is simulated as lean bulk or recomposition, not generic fat gain.",
      suggestedInterpretation: "lean_bulk_or_recomposition"
    });
  }
  if (meaningfulFatIncrease && /(shred|defined abs|ripped)/i.test(notes)) {
    issues.push({
      code: "fat_increase_with_definition_note",
      severity: "warning",
      message: "Optional notes request definition while body-fat is increasing. Definition emphasis is suppressed so it does not reverse the body-fat direction.",
      suggestedInterpretation: "follow_body_fat_target"
    });
  }
  return issues;
}

// src/ai/body-simulator/AnatomicalTransformationEngine.ts
function anatomicalTimelineRelativeMagnitude(timelineWeeks) {
  const months = timelineWeeks / BODY_SIM_WEEKS_PER_MONTH;
  const progressFraction = transformProgress(months);
  return Math.max(
    BODY_SIM_TIMELINE_MIN_RELATIVE_MAGNITUDE,
    progressFraction * BODY_SIM_TIMELINE_MAGNITUDE_SCALE
  );
}
function rule(partial) {
  return {
    ...partial,
    confidenceReasons: partial.confidenceReasons ?? [],
    limitations: partial.limitations ?? []
  };
}
function resolveBodyFatContext(input) {
  const current = input.profile.currentBodyFatPercent;
  const absolute = input.goal.targetBodyFatPercent !== void 0 && input.goal.targetBodyFatPercent !== null ? input.goal.targetBodyFatPercent : null;
  if (current != null && absolute != null) {
    return {
      currentPercent: current,
      targetPercent: absolute,
      deltaPercentagePoints: absolute - current
    };
  }
  const change = input.goal.targetBodyFatChangePercentagePoints;
  if (current != null && change != null) {
    return {
      currentPercent: current,
      targetPercent: current + change,
      deltaPercentagePoints: change
    };
  }
  if (change != null) {
    return {
      currentPercent: current,
      targetPercent: null,
      deltaPercentagePoints: change
    };
  }
  return {
    currentPercent: current,
    targetPercent: absolute,
    deltaPercentagePoints: null
  };
}
function deriveMuscleGainMode(input, bf) {
  const goal = input.goal.type;
  const muscleTarget = input.goal.targetMuscleChangeKg;
  const wantsMuscle = goal === "muscle_gain" || goal === "body_recomposition" || muscleTarget != null && muscleTarget > 0;
  if (!wantsMuscle) {
    return "not_applicable";
  }
  const delta = bf.deltaPercentagePoints;
  if (delta == null) {
    return goal === "muscle_gain" || goal === "body_recomposition" ? "mixed_bulk" : "not_applicable";
  }
  if (delta <= ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP) {
    return "lean_bulk";
  }
  if (delta >= ANATOMICAL_BF_DELTA_SUBSTANTIAL_GAIN_PP) {
    return "fat_gain_bulk";
  }
  if (delta > ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP) {
    return "mixed_bulk";
  }
  return "lean_bulk";
}
function featureKey(region, feature) {
  return `${region}::${feature}`;
}
function directionConflict(a, b) {
  const dec = /* @__PURE__ */ new Set([
    "strong_decrease",
    "moderate_decrease",
    "slight_decrease",
    "more_defined"
  ]);
  const inc = /* @__PURE__ */ new Set([
    "strong_increase",
    "moderate_increase",
    "slight_increase",
    "less_defined"
  ]);
  if (a === "stable" || b === "stable" || a === "unknown" || b === "unknown") {
    return false;
  }
  if (a === b) return false;
  const aDec = dec.has(a) || a === "more_defined";
  const bDec = dec.has(b) || b === "more_defined";
  const aInc = inc.has(a) || a === "less_defined";
  const bInc = inc.has(b) || b === "less_defined";
  if (a === "more_defined" && bInc || b === "more_defined" && aInc) {
    return true;
  }
  return aDec && bInc || aInc && bDec;
}
function suppressionReasonFor(winner, loser) {
  if (winner.source === "realism_constraint" || loser.source === "realism_constraint") {
    return "realism_boundary";
  }
  if (winner.source === "body_fat_delta" || loser.source === "body_fat_delta") {
    return "body_fat_direction_conflict";
  }
  if (loser.source === "optional_note") {
    return "optional_note_conflict";
  }
  if (winner.source === "goal" || loser.source === "goal") {
    return "goal_conflict";
  }
  return "lower_priority_conflict";
}
function resolveConflicts(rules) {
  const byFeature = /* @__PURE__ */ new Map();
  for (const r of rules) {
    const key = featureKey(r.region, r.feature);
    const list = byFeature.get(key) ?? [];
    list.push(r);
    byFeature.set(key, list);
  }
  const applied = [];
  const suppressed = [];
  const reasons = {};
  for (const group of byFeature.values()) {
    if (group.length === 1) {
      applied.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id.localeCompare(b.id);
    });
    const winner = sorted[0];
    applied.push(winner);
    for (let i = 1; i < sorted.length; i++) {
      const loser = sorted[i];
      if (!directionConflict(winner.direction, loser.direction) && winner.direction === loser.direction && magnitudeOrdinal(loser.magnitude) <= magnitudeOrdinal(winner.magnitude)) {
        suppressed.push(loser);
        reasons[loser.id] = "lower_priority_conflict";
        continue;
      }
      suppressed.push(loser);
      reasons[loser.id] = suppressionReasonFor(winner, loser);
    }
  }
  applied.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return { applied, suppressed, reasons };
}
function buildFatDrivenRules(bf, baseMagnitude, confidence, preserveMuscleVolume, allowVolumeIncrease) {
  const delta = bf.deltaPercentagePoints;
  if (delta == null || Math.abs(delta) < ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP) {
    return [];
  }
  const abs = Math.abs(delta);
  const losing = delta < 0;
  let fatDir;
  let defDir;
  let mag = baseMagnitude;
  if (abs < ANATOMICAL_BF_DELTA_MODEST_PP) {
    fatDir = losing ? "slight_decrease" : "slight_increase";
    defDir = losing ? "more_defined" : "less_defined";
    mag = scaleMagnitude(baseMagnitude, 0.85);
  } else if (abs < ANATOMICAL_BF_DELTA_CLEAR_PP) {
    fatDir = losing ? "moderate_decrease" : "moderate_increase";
    defDir = losing ? "more_defined" : "less_defined";
  } else {
    fatDir = losing ? "strong_decrease" : "moderate_increase";
    defDir = losing ? "more_defined" : "less_defined";
    if (!losing) {
      mag = magnitudeFromScore(
        Math.min(
          magnitudeOrdinal(baseMagnitude) / 4,
          ANATOMICAL_FAT_GAIN_WAIST_CAP_SCORE
        )
      );
    }
  }
  const reasons = ["body_fat_delta_driver"];
  const limitations = [
    "Body-fat percentage is a simulation input with explicit provenance, not a medical measurement."
  ];
  const out = [];
  const add = (id, region, feature, direction, magnitude = mag) => {
    out.push(
      rule({
        id,
        region,
        feature,
        direction,
        magnitude,
        priority: ANATOMICAL_PRIORITY_BODY_FAT,
        source: "body_fat_delta",
        confidence,
        confidenceReasons: reasons,
        limitations
      })
    );
  };
  if (losing) {
    add(
      "bf-abdomen-fat",
      "abdomen",
      "subcutaneous_fat",
      abs >= ANATOMICAL_BF_DELTA_CLEAR_PP ? "strong_decrease" : fatDir,
      mag
    );
    add("bf-waist-width", "waist_and_flanks", "waist_width", fatDir);
    add("bf-abd-def", "abdomen", "abdominal_definition", defDir);
    if (abs >= ANATOMICAL_BF_DELTA_CLEAR_PP) {
      add("bf-oblique-def", "waist_and_flanks", "oblique_definition", defDir);
      add("bf-chest-def", "chest_and_upper_torso", "chest_definition", defDir);
      add("bf-shoulder-def", "shoulders", "shoulder_definition", defDir);
      add("bf-whole-def", "whole_body", "whole_body_definition", defDir);
      add(
        "bf-lower-abd-emphasis",
        "waist_and_flanks",
        "subcutaneous_fat",
        "moderate_decrease",
        mag
      );
    } else {
      add("bf-chest-def-modest", "chest_and_upper_torso", "chest_definition", defDir);
      add("bf-shoulder-def-modest", "shoulders", "shoulder_definition", defDir);
    }
    if (preserveMuscleVolume && !allowVolumeIncrease) {
      for (const region of ANATOMICAL_MUSCLE_VOLUME_REGIONS) {
        const feature = region === "shoulders" ? "shoulder_volume" : region === "chest_and_upper_torso" ? "chest_volume" : region === "arms" ? "arm_volume" : region === "glutes" ? "glute_volume" : region === "thighs" ? "thigh_volume" : region === "upper_back" ? "lat_width" : "whole_body_muscle_volume";
        out.push(
          rule({
            id: `bf-preserve-vol-${region}`,
            region,
            feature: feature === "lat_width" ? "lat_width" : feature,
            direction: "stable",
            magnitude: "subtle",
            priority: ANATOMICAL_PRIORITY_PRESERVATION,
            source: "realism_constraint",
            confidence,
            confidenceReasons: ["muscle_volume_preserved_during_fat_loss"],
            limitations: [
              "Fat loss reveals existing muscle definition; volume is not arbitrarily reduced."
            ]
          })
        );
      }
    }
    if (preserveMuscleVolume || allowVolumeIncrease) {
      out.push(
        rule({
          id: "bf-no-synthetic-abs",
          region: "abdomen",
          feature: "abdominal_definition",
          direction: "more_defined",
          magnitude: abs >= ANATOMICAL_BF_DELTA_CLEAR_PP ? mag : scaleMagnitude(mag, 0.9),
          // Below body-fat driver so BF definition rules win; still blocks etched extremes via limitations
          priority: ANATOMICAL_PRIORITY_BODY_FAT - 20,
          source: "realism_constraint",
          confidence,
          confidenceReasons: ["definition_from_fat_loss_not_etched"],
          limitations: [
            "Avoid exaggerated six-pack carving or synthetic etched abs."
          ]
        })
      );
    }
  } else {
    const cappedFatDir = abs >= ANATOMICAL_BF_DELTA_SUBSTANTIAL_GAIN_PP ? "moderate_increase" : "slight_increase";
    out.push(
      rule({
        id: "bf-gain-subq",
        region: "abdomen",
        feature: "subcutaneous_fat",
        direction: cappedFatDir,
        magnitude: magnitudeFromScore(ANATOMICAL_FAT_GAIN_WAIST_CAP_SCORE),
        priority: ANATOMICAL_PRIORITY_BODY_FAT,
        source: "body_fat_delta",
        confidence,
        confidenceReasons: ["body_fat_delta_driver", "fat_gain_waist_capped"],
        limitations: [
          "Target body-fat increase does not automatically generate extreme abdominal protrusion.",
          "Body-fat percentage is a simulation input with explicit provenance, not a medical measurement."
        ]
      })
    );
    add(
      "bf-gain-waist",
      "waist_and_flanks",
      "waist_width",
      cappedFatDir,
      magnitudeFromScore(ANATOMICAL_FAT_GAIN_WAIST_CAP_SCORE)
    );
  }
  return out;
}
function muscleVolumeFeature(region) {
  switch (region) {
    case "shoulders":
      return "shoulder_volume";
    case "chest_and_upper_torso":
      return "chest_volume";
    case "upper_back":
      return "lat_width";
    case "arms":
      return "arm_volume";
    case "glutes":
      return "glute_volume";
    case "thighs":
      return "thigh_volume";
    case "lower_legs":
      return "lower_leg_definition";
    default:
      return "whole_body_muscle_volume";
  }
}
function buildMuscleRules(input, mode, baseMagnitude, confidence) {
  if (mode === "not_applicable") {
    if (input.goal.type === "fat_loss_with_muscle_preservation" || input.goal.type === "general_fitness_improvement") {
      return [
        rule({
          id: "goal-muscle-preserve",
          region: "whole_body",
          feature: "whole_body_muscle_volume",
          direction: "stable",
          magnitude: "subtle",
          priority: ANATOMICAL_PRIORITY_GOAL,
          source: "goal",
          confidence,
          confidenceReasons: ["muscle_preservation_goal"]
        })
      ];
    }
    return [];
  }
  const out = [];
  const volDir = magnitudeOrdinal(baseMagnitude) >= 3 ? "moderate_increase" : "slight_increase";
  for (const region of ANATOMICAL_MUSCLE_VOLUME_REGIONS) {
    out.push(
      rule({
        id: `mg-vol-${region}`,
        region,
        feature: muscleVolumeFeature(region),
        direction: volDir,
        magnitude: baseMagnitude,
        priority: ANATOMICAL_PRIORITY_GOAL,
        source: "goal",
        confidence,
        confidenceReasons: ["muscle_volume_from_goal"],
        limitations: [
          "Muscle gain changes muscle volume, not skeletal width, height, or hand/foot scale."
        ]
      })
    );
  }
  out.push(
    rule({
      id: "mg-whole-volume",
      region: "whole_body",
      feature: "whole_body_muscle_volume",
      direction: volDir,
      magnitude: baseMagnitude,
      priority: ANATOMICAL_PRIORITY_GOAL,
      source: "goal",
      confidence,
      confidenceReasons: ["muscle_volume_from_goal"]
    })
  );
  out.push(
    rule({
      id: "mg-no-auto-abd-fat",
      region: "abdomen",
      feature: "subcutaneous_fat",
      direction: mode === "lean_bulk" ? "stable" : mode === "mixed_bulk" ? "slight_increase" : "moderate_increase",
      magnitude: mode === "fat_gain_bulk" ? scaleMagnitude(baseMagnitude, 0.85) : "subtle",
      priority: ANATOMICAL_PRIORITY_GOAL - 10,
      source: "goal",
      confidence,
      confidenceReasons: [`muscle_gain_mode_${mode}`],
      limitations: [
        "Muscle gain does not automatically enlarge the abdomen with fat unless body-fat target supports it."
      ]
    })
  );
  if (mode === "lean_bulk") {
    out.push(
      rule({
        id: "mg-lean-waist",
        region: "waist_and_flanks",
        feature: "waist_width",
        direction: "stable",
        magnitude: "subtle",
        priority: ANATOMICAL_PRIORITY_GOAL,
        source: "goal",
        confidence,
        confidenceReasons: ["lean_bulk_controlled_waist"],
        limitations: ["Lean bulk keeps waist approximately stable or slightly reduced."]
      })
    );
    out.push(
      rule({
        id: "mg-lean-abd-def",
        region: "abdomen",
        feature: "abdominal_definition",
        direction: "stable",
        magnitude: "subtle",
        priority: ANATOMICAL_PRIORITY_GOAL,
        source: "goal",
        confidence,
        confidenceReasons: ["lean_bulk_definition_stable"]
      })
    );
  }
  return out;
}
function applyFocusZoneBoosts(rules, focusZones) {
  if (focusZones.length === 0) return rules;
  const focused = /* @__PURE__ */ new Set();
  for (const z of focusZones) {
    for (const f of ANATOMICAL_FOCUS_FEATURE_MAP[z] ?? []) {
      focused.add(f);
    }
  }
  if (focused.size === 0) return rules;
  return rules.map((r) => {
    if (!focused.has(r.feature)) return r;
    if (r.source === "body_fat_delta" || r.source === "realism_constraint") {
      return {
        ...r,
        priority: r.priority + Math.floor(ANATOMICAL_FOCUS_PRIORITY_BOOST / 2),
        confidenceReasons: [...r.confidenceReasons, "focus_zone_reinforced"]
      };
    }
    return {
      ...r,
      priority: Math.max(
        r.priority,
        ANATOMICAL_PRIORITY_FOCUS + ANATOMICAL_FOCUS_PRIORITY_BOOST
      ),
      confidenceReasons: [...r.confidenceReasons, "focus_zone_priority_boost"]
    };
  });
}
function addFocusDerivedRules(focusZones, baseMagnitude, confidence, bfDelta) {
  const out = [];
  const losingFat = bfDelta != null && bfDelta <= -ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP;
  for (const zone of focusZones) {
    if (zone === "posture") {
      out.push(
        rule({
          id: "focus-posture-no-skeletal",
          region: "whole_body",
          feature: "whole_body_definition",
          direction: "stable",
          magnitude: "subtle",
          priority: ANATOMICAL_PRIORITY_PRESERVATION,
          source: "focus_zone",
          confidence,
          confidenceReasons: ["posture_no_skeletal_change"],
          limitations: [
            "Posture focus does not alter skeletal structure in Anatomical Transformation v2."
          ]
        })
      );
      continue;
    }
    for (const feature of ANATOMICAL_FOCUS_FEATURE_MAP[zone]) {
      const isVolume = feature.includes("volume") || feature === "lat_width";
      const direction = isVolume ? "slight_increase" : losingFat ? "more_defined" : "slight_increase";
      if ((feature === "waist_width" || feature === "subcutaneous_fat") && bfDelta != null && bfDelta > ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP) {
        continue;
      }
      out.push(
        rule({
          id: `focus-${zone}-${feature}`,
          region: regionForFeature(feature),
          feature,
          direction,
          magnitude: baseMagnitude,
          priority: ANATOMICAL_PRIORITY_FOCUS + ANATOMICAL_FOCUS_PRIORITY_BOOST,
          source: "focus_zone",
          confidence,
          confidenceReasons: [`focus_zone_${zone}`]
        })
      );
    }
  }
  return out;
}
function regionForFeature(feature) {
  switch (feature) {
    case "abdominal_definition":
    case "subcutaneous_fat":
      return "abdomen";
    case "oblique_definition":
    case "waist_width":
    case "serratus_definition":
      return "waist_and_flanks";
    case "chest_definition":
    case "chest_volume":
      return "chest_and_upper_torso";
    case "shoulder_definition":
    case "shoulder_volume":
      return "shoulders";
    case "arm_definition":
    case "arm_volume":
      return "arms";
    case "upper_back_definition":
    case "lat_width":
      return "upper_back";
    case "glute_volume":
      return "glutes";
    case "thigh_definition":
    case "thigh_volume":
      return "thighs";
    case "lower_leg_definition":
      return "lower_legs";
    case "whole_body_definition":
    case "whole_body_muscle_volume":
    default:
      return "whole_body";
  }
}
function processOptionalNotes(notes, bf, confidence) {
  const rules = [];
  const outcomes = [];
  const delta = bf.deltaPercentagePoints;
  const losing = delta != null && delta <= -ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP;
  const gaining = delta != null && delta >= ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP;
  for (const note of notes) {
    const lower = note.toLowerCase();
    const wantsDef = /defined abs|shred|ripped|etched|six.?pack|definition/.test(lower);
    const wantsBulk = /\bbulk\b|mass gain|get bigger/.test(lower);
    if (wantsDef) {
      if (gaining) {
        outcomes.push({
          note,
          status: "suppressed",
          reason: "optional_note_conflicts_with_body_fat_direction"
        });
        rules.push(
          rule({
            id: `note-suppressed-def-${outcomes.length}`,
            region: "abdomen",
            feature: "abdominal_definition",
            direction: "more_defined",
            magnitude: "pronounced",
            priority: ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
            source: "optional_note",
            confidence,
            confidenceReasons: ["optional_note_suppressed"],
            limitations: [
              "Optional notes cannot reverse body-fat direction or force extreme definition."
            ]
          })
        );
      } else if (losing || delta == null) {
        outcomes.push({
          note,
          status: "applied",
          reason: "reinforces_compatible_definition_direction"
        });
        rules.push(
          rule({
            id: `note-def-abs-${outcomes.length}`,
            region: "abdomen",
            feature: "abdominal_definition",
            direction: "more_defined",
            magnitude: "moderate",
            priority: ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
            source: "optional_note",
            confidence,
            confidenceReasons: ["optional_note_reinforce"]
          })
        );
      } else {
        outcomes.push({
          note,
          status: "partially_applied",
          reason: "stable_bf_limits_definition_emphasis"
        });
        rules.push(
          rule({
            id: `note-def-partial-${outcomes.length}`,
            region: "abdomen",
            feature: "abdominal_definition",
            direction: "more_defined",
            magnitude: "subtle",
            priority: ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
            source: "optional_note",
            confidence,
            confidenceReasons: ["optional_note_partial"]
          })
        );
      }
      continue;
    }
    if (wantsBulk && losing) {
      outcomes.push({
        note,
        status: "suppressed",
        reason: "bulk_note_conflicts_with_fat_decrease"
      });
      rules.push(
        rule({
          id: `note-bulk-suppressed-${outcomes.length}`,
          region: "abdomen",
          feature: "subcutaneous_fat",
          direction: "moderate_increase",
          magnitude: "pronounced",
          priority: ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
          source: "optional_note",
          confidence,
          confidenceReasons: ["optional_note_suppressed"]
        })
      );
      continue;
    }
    if (wantsBulk) {
      outcomes.push({
        note,
        status: "partially_applied",
        reason: "bulk_note_maps_to_muscle_volume_support_only"
      });
      rules.push(
        rule({
          id: `note-bulk-vol-${outcomes.length}`,
          region: "whole_body",
          feature: "whole_body_muscle_volume",
          direction: "slight_increase",
          magnitude: "subtle",
          priority: ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
          source: "optional_note",
          confidence,
          confidenceReasons: ["optional_note_partial"]
        })
      );
      continue;
    }
    outcomes.push({
      note,
      status: "partially_applied",
      reason: "unrecognized_note_kept_as_low_priority_semantic_support_only"
    });
  }
  return { rules, outcomes };
}
function buildSemanticSupport(input, mode, bf, noteOutcomes) {
  const terms = /* @__PURE__ */ new Set();
  const delta = bf.deltaPercentagePoints;
  if (delta != null && delta < -ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP) {
    terms.add("lean");
    terms.add("defined");
  }
  if (mode === "lean_bulk" || mode === "mixed_bulk" || mode === "fat_gain_bulk") {
    terms.add("muscular");
  }
  if (input.goal.type === "body_recomposition" || mode === "lean_bulk") {
    terms.add("recomposition");
  }
  if (input.goal.type === "general_fitness_improvement") {
    terms.add("athletic");
  }
  for (const o of noteOutcomes) {
    if (o.status === "applied" || o.status === "partially_applied") {
      if (/defined/.test(o.note.toLowerCase())) terms.add("defined");
      if (/athletic|fit/.test(o.note.toLowerCase())) terms.add("athletic");
    }
  }
  return [...terms].sort();
}
function anatomicalConfidence(input, bf, conflicts) {
  const reasons = [];
  if (bf.currentPercent == null) {
    reasons.push("body_fat_not_provided");
  } else if (input.profile.bodyFatBasis === "user_estimate") {
    reasons.push("body_fat_user_estimate_only");
  } else if (input.profile.bodyFatBasis === "device_measurement" || input.profile.bodyFatBasis === "professional_measurement") {
    reasons.push("body_fat_measurement_available");
  }
  if (input.bodyAnalysis == null) {
    reasons.push("body_analysis_unavailable");
  }
  const view = input.sourceImageContext.progressPhotoView;
  if (!input.sourceImageContext.available || view === "unknown" || view === "three_quarter") {
    reasons.push("body_region_visibility_limited");
  }
  if (conflicts.some((c) => c.severity === "warning")) {
    reasons.push("contradictory_user_inputs");
  }
  let overall = "medium";
  if (reasons.includes("body_fat_not_provided") || reasons.includes("body_region_visibility_limited")) {
    overall = "low";
  } else if (reasons.includes("body_fat_measurement_available") && !reasons.includes("contradictory_user_inputs")) {
    overall = "high";
  }
  return { overall, reasons };
}
function buildAnatomicalTransformation(input) {
  const bf = resolveBodyFatContext(input);
  const focusZones = [...input.focusZones ?? []];
  const optionalNotes = [...input.optionalNotes ?? []];
  const conflicts = validateGoalConsistency(input);
  const effort = effortCoefficientForIntensity(input.goal.intensity);
  const relativeMagnitude = anatomicalTimelineRelativeMagnitude(
    input.goal.timelineWeeks
  );
  const score = clamp01(relativeMagnitude * effort.coefficient);
  const baseMagnitude = magnitudeFromScore(score);
  const mode = deriveMuscleGainMode(input, bf);
  const conf = anatomicalConfidence(input, bf, conflicts);
  const preserveMuscleVolume = input.goal.type === "fat_loss_with_muscle_preservation" || input.goal.type === "body_recomposition" || input.goal.type === "general_fitness_improvement" || bf.deltaPercentagePoints != null && bf.deltaPercentagePoints < 0 && input.goal.type !== "weight_loss";
  const preserveForFatLoss = preserveMuscleVolume || bf.deltaPercentagePoints != null && bf.deltaPercentagePoints < 0;
  const candidates = [];
  const allowVolumeIncrease = mode !== "not_applicable";
  candidates.push(
    ...buildFatDrivenRules(
      bf,
      baseMagnitude,
      conf.overall,
      preserveForFatLoss,
      allowVolumeIncrease
    )
  );
  candidates.push(
    ...buildMuscleRules(input, mode, baseMagnitude, conf.overall)
  );
  candidates.push(
    ...addFocusDerivedRules(
      focusZones,
      baseMagnitude,
      conf.overall,
      bf.deltaPercentagePoints
    )
  );
  const noteResult = processOptionalNotes(optionalNotes, bf, conf.overall);
  candidates.push(...noteResult.rules);
  const boosted = applyFocusZoneBoosts(candidates, focusZones);
  const { applied, suppressed, reasons } = resolveConflicts(boosted);
  const appliedIds = new Set(applied.map((r) => r.id));
  const suppressedIds = suppressed.map((r) => r.id);
  const noteOutcomes = noteResult.outcomes.map((o) => {
    if (o.status === "suppressed") return o;
    const related = noteResult.rules.find((r) => {
      const n = o.note.toLowerCase();
      if (/defined abs|shred|ripped|definition/.test(n)) {
        return r.feature === "abdominal_definition" && r.source === "optional_note";
      }
      return r.source === "optional_note";
    });
    if (related && !appliedIds.has(related.id)) {
      const reason = String(reasons[related.id] ?? "optional_note_conflict");
      if (reason === "lower_priority_conflict" && (o.status === "applied" || o.status === "partially_applied")) {
        return {
          ...o,
          status: "applied",
          reason: "reinforces_compatible_higher_priority_rule"
        };
      }
      return {
        ...o,
        status: "suppressed",
        reason
      };
    }
    return o;
  });
  const semanticSupportTerms = buildSemanticSupport(
    input,
    mode,
    bf,
    noteOutcomes
  );
  const bodyFatDriven = applied.some((r) => r.source === "body_fat_delta");
  const muscleDriven = applied.some(
    (r) => r.feature.includes("volume") || r.feature === "lat_width" || r.feature === "whole_body_muscle_volume"
  );
  const focusZoneDriven = focusZones.length > 0 && applied.some(
    (r) => r.source === "focus_zone" || r.confidenceReasons.some((c) => c.startsWith("focus_zone"))
  );
  const optionalNotesUsed = noteOutcomes.some(
    (o) => o.status === "applied" || o.status === "partially_applied"
  );
  const limitations = [
    "Anatomical Transformation describes expected visualization intent, not a guaranteed outcome.",
    "Broad aesthetic terms are secondary semantic support only.",
    "No skeletal widening, height change, or hand/foot enlargement."
  ];
  if (bf.currentPercent == null) {
    limitations.push(
      "Current body-fat unavailable; fat-driven anatomical rules are limited."
    );
  }
  if (focusZones.includes("posture")) {
    limitations.push(
      "Posture focus does not change skeletal structure in v2."
    );
  }
  return {
    schemaVersion: ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION,
    rules: applied,
    appliedRuleIds: applied.map((r) => r.id),
    suppressedRuleIds: suppressedIds,
    suppressionReasons: reasons,
    conflicts,
    summary: {
      bodyFatDriven,
      muscleDriven,
      focusZoneDriven,
      optionalNotesUsed
    },
    muscleGainMode: mode,
    bodyFatContext: bf,
    focusZones,
    optionalNotesPresent: optionalNotes.length > 0,
    noteOutcomes,
    semanticSupportTerms,
    effortLabel: effort.label,
    effortCoefficient: effort.coefficient,
    timelineWeeks: input.goal.timelineWeeks,
    confidence: conf.overall,
    confidenceReasons: conf.reasons,
    limitations
  };
}

// src/ai/body-simulator/BodySimulatorEngine.ts
function computeTimelineMagnitude(timelineWeeks) {
  const months = timelineWeeks / BODY_SIM_WEEKS_PER_MONTH;
  const progressFraction = transformProgress(months);
  const relativeMagnitude = Math.max(
    BODY_SIM_TIMELINE_MIN_RELATIVE_MAGNITUDE,
    progressFraction * BODY_SIM_TIMELINE_MAGNITUDE_SCALE
  );
  return { relativeMagnitude, progressFraction, months };
}
function rangeFromExpected(expected, unit, origin, spreadFactor) {
  if (expected == null || !Number.isFinite(expected)) {
    return {
      lower: null,
      expected: null,
      upper: null,
      unit,
      origin: "unknown"
    };
  }
  const abs = Math.abs(expected);
  const spread = abs * spreadFactor;
  const sign = expected === 0 ? 1 : Math.sign(expected);
  if (expected < 0) {
    return {
      lower: round3(expected - spread),
      // more negative
      expected: round3(expected),
      upper: round3(Math.min(0, expected + spread)),
      // less negative
      unit,
      origin
    };
  }
  if (expected > 0) {
    return {
      lower: round3(Math.max(0, expected - spread)),
      expected: round3(expected),
      upper: round3(expected + spread),
      unit,
      origin
    };
  }
  return {
    lower: round3(-spread * sign),
    expected: 0,
    upper: round3(spread),
    unit,
    origin
  };
}
function moderateLossMagnitude(requested, timelineWeeks, perWeekMax, absoluteMax, exceedReason = "fat_loss_target_exceeds_v1_boundary") {
  const absRequested = Math.abs(requested);
  const timelineCap = perWeekMax * timelineWeeks;
  const cap = Math.min(timelineCap, absoluteMax);
  if (absRequested <= cap) {
    return { value: requested, moderated: false, reasons: [] };
  }
  const reasons = ["timeline_limits_requested_change"];
  if (absRequested > cap) {
    reasons.push(exceedReason);
  }
  return {
    value: -cap,
    moderated: true,
    reasons
  };
}
function moderateGainMagnitude(requested, timelineWeeks, perWeekMax, absoluteMax, reasonCode) {
  const timelineCap = perWeekMax * timelineWeeks;
  const cap = Math.min(timelineCap, absoluteMax);
  if (requested <= cap) {
    return { value: requested, moderated: false, reasons: [] };
  }
  const reasons = [
    "timeline_limits_requested_change",
    reasonCode
  ];
  return { value: cap, moderated: true, reasons };
}
function clampMed(influence, maxAbs) {
  return clamp2(influence, -maxAbs, maxAbs);
}
function fatChangeLabel(goal, magnitude) {
  const dir = goalPrimaryFatDirection(goal);
  if (dir === "decrease") {
    if (magnitude >= 0.75) return "strong_decrease";
    if (magnitude >= 0.45) return "moderate_decrease";
    if (magnitude >= 0.2) return "slight_decrease";
    return "slight_decrease";
  }
  if (dir === "stable_or_unknown") {
    return magnitude < 0.2 ? "stable" : "slight_increase";
  }
  if (magnitude >= 0.35) return "slight_decrease";
  return "stable";
}
function muscleChangeLabel(goal, magnitude, muscleKg) {
  const dir = goalPrimaryMuscleDirection(goal);
  if (dir === "stable") {
    return muscleKg != null && muscleKg > 0.15 ? "slight_increase" : "stable";
  }
  if (dir === "increase") {
    if (magnitude >= 0.75) return "strong_increase";
    if (magnitude >= 0.45) return "moderate_increase";
    if (magnitude >= 0.2) return "slight_increase";
    return "slight_increase";
  }
  if (muscleKg != null && muscleKg < -0.1) return "slight_decrease";
  if (muscleKg != null && muscleKg > 0.15) return "slight_increase";
  return "stable";
}
function regionVisibility(region, view, available) {
  if (!available) return "not_assessable";
  if (view === "unknown") return "unknown";
  if (view === "back" && region === "face_and_neck") return "not_visible";
  if (view === "front" && region === "upper_back") return "partially_visible";
  if (region === "lower_legs") return "partially_visible";
  if (region === "whole_body") {
    return view === "three_quarter" ? "partially_visible" : "available";
  }
  return "available";
}
function buildConfidenceReasons(input) {
  const reasons = [];
  if (input.profile.heightCm != null) {
    reasons.push("user_declared_height_available");
  }
  if (input.profile.currentWeightKg != null) {
    reasons.push("user_declared_weight_available");
  }
  if (input.profile.currentBodyFatPercent == null) {
    reasons.push("body_fat_not_provided");
  } else if (input.profile.bodyFatBasis === "device_measurement" || input.profile.bodyFatBasis === "professional_measurement") {
    reasons.push("body_fat_measurement_available");
  } else if (input.profile.bodyFatBasis === "user_estimate") {
    reasons.push("body_fat_user_estimate_only");
  }
  if (input.profile.trainingExperience === "not_provided") {
    reasons.push("training_experience_missing");
  } else {
    reasons.push("training_experience_available");
  }
  reasons.push("timeline_within_supported_range");
  const view = input.sourceImageContext.progressPhotoView;
  if (view === "front") reasons.push("front_view_available");
  if (view === "side") reasons.push("side_view_available");
  if (view === "back") reasons.push("back_view_available");
  if (input.sourceImageContext.available && (view === "front" || view === "side" || view === "back" || view === "three_quarter")) {
    reasons.push("single_view_only");
  }
  if (input.medicationEffects.medicationMayAffectWeight) {
    reasons.push("medication_effect_user_reported");
    if (input.medicationEffects.appetite === "unknown" || input.medicationEffects.energyLevel === "unknown" || input.medicationEffects.metabolismTendency === "unknown" || input.medicationEffects.muscleBuildingOrPreservation === "unknown") {
      reasons.push("medication_effect_unknown");
    }
  }
  if (input.bodyAnalysis?.confidenceReasons?.includes("strong_backlight")) {
    reasons.push("strong_backlight");
  }
  if (input.bodyAnalysis?.confidenceReasons?.includes("whole_body_visible")) {
    reasons.push("whole_body_visible");
  }
  return reasons;
}
function overallConfidence(reasons, missingInputs) {
  if (missingInputs.length >= 4 || reasons.includes("limited_baseline_data")) {
    return "low";
  }
  if (reasons.includes("body_fat_not_provided") || reasons.includes("training_experience_missing") || reasons.includes("target_required_moderation")) {
    return "medium";
  }
  if (reasons.includes("body_fat_measurement_available") && reasons.includes("user_declared_weight_available") && reasons.includes("training_experience_available")) {
    return "high";
  }
  return "medium";
}
function buildBodySimulatorTransformationRules(input) {
  const provenance = [];
  const moderationReasons = [];
  const limitations = [];
  const warnings = [];
  const timelineWeeks = input.goal.timelineWeeks;
  const intensity = input.goal.intensity;
  const goalType = input.goal.type;
  provenance.push({
    rulePath: "goal.effectiveType",
    source: "goal",
    sourcePath: "goal.type"
  });
  provenance.push({
    rulePath: "goal.timelineWeeks",
    source: "timeline",
    sourcePath: "goal.timelineWeeks"
  });
  const { relativeMagnitude } = computeTimelineMagnitude(timelineWeeks);
  const intensityMul = intensityExpectedMultiplier(intensity);
  const spread = intensitySpread(intensity);
  if (intensity === "ambitious") {
    limitations.push(
      "Ambitious intensity is an upper-bound expected visualization within v1 realism constraints, not a guarantee."
    );
    moderationReasons.push("ambitious_intensity_bounded");
  }
  provenance.push({
    rulePath: "preservation.identity",
    source: "realism_constraint",
    sourcePath: "options.preserveIdentity"
  });
  moderationReasons.push("identity_preservation_boundary");
  moderationReasons.push("natural_proportion_boundary");
  const experienceRate = muscleRateForExperience(input.profile.trainingExperience);
  const consist = consistencyFactor(input.activity.trainingConsistency);
  const protein = proteinFactor(input.activity.proteinIntakeSupport);
  const recovery = recoveryFactor(input.activity.recoverySupport);
  const muscleSupport = experienceRate * consist * protein * recovery;
  provenance.push({
    rulePath: "wholeBodyChange.muscleChangeKg",
    source: "activity",
    sourcePath: "activity.trainingConsistency"
  });
  provenance.push({
    rulePath: "wholeBodyChange.muscleChangeKg",
    source: "profile",
    sourcePath: "profile.trainingExperience"
  });
  let medFatMod = 0;
  let medMuscleMod = 0;
  let medEnergyMod = 0;
  if (input.medicationEffects.medicationMayAffectWeight) {
    medFatMod = clampMed(
      appetiteModifier(input.medicationEffects.appetite) + metabolismModifier(input.medicationEffects.metabolismTendency),
      BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE
    );
    medEnergyMod = clampMed(
      energyModifier(input.medicationEffects.energyLevel),
      BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE
    );
    medMuscleMod = clampMed(
      muscleMedModifier(input.medicationEffects.muscleBuildingOrPreservation) + medEnergyMod * 0.5,
      BODY_SIM_MED_MAX_MUSCLE_INFLUENCE
    );
    if (medFatMod !== 0) {
      provenance.push({
        rulePath: "wholeBodyChange.weightChangeKg",
        source: "medication_effect",
        sourcePath: "medicationEffects.appetite"
      });
      provenance.push({
        rulePath: "wholeBodyChange.bodyFatChangePercentagePoints",
        source: "medication_effect",
        sourcePath: "medicationEffects.metabolismTendency"
      });
    }
    if (medMuscleMod !== 0) {
      provenance.push({
        rulePath: "wholeBodyChange.muscleChangeKg",
        source: "medication_effect",
        sourcePath: "medicationEffects.muscleBuildingOrPreservation"
      });
    }
    if (medEnergyMod !== 0) {
      provenance.push({
        rulePath: "wholeBodyChange.muscleChangeKg",
        source: "medication_effect",
        sourcePath: "medicationEffects.energyLevel"
      });
    }
    warnings.push(
      "Medication-related effects are user-reported bounded modifiers, not verified medical facts."
    );
  }
  const medFatFactor = 1 + medFatMod + medEnergyMod * 0.25;
  const medMuscleFactor = 1 + medMuscleMod;
  let expectedWeight = null;
  let expectedFatPp = null;
  let expectedMuscle = null;
  let weightOrigin = "deterministic_simulation";
  let fatOrigin = "deterministic_simulation";
  let muscleOrigin = "deterministic_simulation";
  let targetModerated = false;
  const applyFatLossTarget = (raw) => {
    const signed = raw > 0 ? -raw : raw;
    const mod = moderateLossMagnitude(
      signed,
      timelineWeeks,
      BODY_SIM_MAX_FAT_LOSS_PP_PER_WEEK,
      BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE
    );
    if (mod.moderated) {
      targetModerated = true;
      for (const r of mod.reasons) {
        if (!moderationReasons.includes(r)) moderationReasons.push(r);
      }
      fatOrigin = "bounded_user_target";
    } else {
      fatOrigin = "user_target";
    }
    return mod.value * intensityMul * medFatFactor;
  };
  const applyMuscleGainTarget = (raw) => {
    const signed = Math.abs(raw);
    const mod = moderateGainMagnitude(
      signed,
      timelineWeeks,
      BODY_SIM_MAX_MUSCLE_GAIN_KG_PER_WEEK,
      BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE,
      "muscle_gain_target_exceeds_v1_boundary"
    );
    if (mod.moderated) {
      targetModerated = true;
      for (const r of mod.reasons) {
        if (!moderationReasons.includes(r)) moderationReasons.push(r);
      }
      muscleOrigin = "bounded_user_target";
    } else {
      muscleOrigin = "user_target";
    }
    return mod.value * intensityMul * muscleSupport * medMuscleFactor;
  };
  const applyWeightLossTarget = (raw) => {
    const signed = raw > 0 ? -raw : raw;
    const mod = moderateLossMagnitude(
      signed,
      timelineWeeks,
      BODY_SIM_MAX_WEIGHT_LOSS_KG_PER_WEEK,
      BODY_SIM_MAX_WEIGHT_LOSS_KG_ABSOLUTE
    );
    if (mod.moderated) {
      targetModerated = true;
      for (const r of mod.reasons) {
        if (!moderationReasons.includes(r)) moderationReasons.push(r);
      }
      weightOrigin = "bounded_user_target";
    } else {
      weightOrigin = "user_target";
    }
    return mod.value * intensityMul * medFatFactor;
  };
  const applyWeightGainTarget = (raw) => {
    const signed = Math.abs(raw);
    const mod = moderateGainMagnitude(
      signed,
      timelineWeeks,
      BODY_SIM_MAX_WEIGHT_GAIN_KG_PER_WEEK,
      BODY_SIM_MAX_WEIGHT_GAIN_KG_ABSOLUTE,
      "muscle_gain_target_exceeds_v1_boundary"
    );
    if (mod.moderated) {
      targetModerated = true;
      for (const r of mod.reasons) {
        if (!moderationReasons.includes(r)) moderationReasons.push(r);
      }
      weightOrigin = "bounded_user_target";
    } else {
      weightOrigin = "user_target";
    }
    return mod.value * intensityMul;
  };
  const timelineScale = relativeMagnitude;
  switch (goalType) {
    case "weight_loss": {
      if (input.goal.targetWeightChangeKg != null) {
        expectedWeight = applyWeightLossTarget(input.goal.targetWeightChangeKg);
      } else {
        expectedWeight = -BODY_SIM_DEFAULT_WEIGHT_LOSS_KG_PER_WEEK * timelineWeeks * timelineScale * intensityMul * medFatFactor;
        weightOrigin = "deterministic_simulation";
      }
      if (input.goal.targetBodyFatChangePercentagePoints != null) {
        expectedFatPp = applyFatLossTarget(
          input.goal.targetBodyFatChangePercentagePoints
        );
      } else {
        expectedFatPp = -BODY_SIM_DEFAULT_FAT_LOSS_PP_PER_WEEK * timelineWeeks * timelineScale * intensityMul * medFatFactor;
        fatOrigin = "deterministic_simulation";
      }
      if (input.goal.targetMuscleChangeKg != null) {
        expectedMuscle = input.goal.targetMuscleChangeKg * intensityMul * muscleSupport * medMuscleFactor;
        if (expectedMuscle < -2) {
          expectedMuscle = -2;
          targetModerated = true;
          moderationReasons.push("natural_proportion_boundary");
        }
        muscleOrigin = "bounded_user_target";
      } else {
        expectedMuscle = round3(
          -0.05 * timelineScale * (1 / muscleSupport) * intensityMul
        );
        muscleOrigin = "deterministic_simulation";
        warnings.push(
          "Muscle change under weight loss is uncertain; preservation is not guaranteed."
        );
      }
      break;
    }
    case "fat_loss_with_muscle_preservation": {
      if (input.goal.targetBodyFatChangePercentagePoints != null) {
        expectedFatPp = applyFatLossTarget(
          input.goal.targetBodyFatChangePercentagePoints
        );
      } else {
        expectedFatPp = -BODY_SIM_DEFAULT_FAT_LOSS_PP_PER_WEEK * timelineWeeks * timelineScale * intensityMul * medFatFactor;
      }
      if (input.goal.targetWeightChangeKg != null) {
        expectedWeight = applyWeightLossTarget(input.goal.targetWeightChangeKg);
      } else {
        expectedWeight = -BODY_SIM_DEFAULT_WEIGHT_LOSS_KG_PER_WEEK * 0.85 * timelineWeeks * timelineScale * intensityMul * medFatFactor;
      }
      if (input.goal.targetMuscleChangeKg != null) {
        expectedMuscle = applyMuscleGainTarget(
          Math.max(0, input.goal.targetMuscleChangeKg)
        );
      } else {
        expectedMuscle = round3(
          0.02 * timelineWeeks * timelineScale * intensityMul * muscleSupport * medMuscleFactor
        );
        if (muscleSupport < 0.9) {
          expectedMuscle = 0;
          warnings.push(
            "Limited training/recovery evidence reduces confidence in muscle preservation."
          );
        }
      }
      break;
    }
    case "muscle_gain": {
      if (input.goal.targetMuscleChangeKg != null) {
        expectedMuscle = applyMuscleGainTarget(input.goal.targetMuscleChangeKg);
      } else {
        expectedMuscle = BODY_SIM_DEFAULT_MUSCLE_GAIN_KG_PER_WEEK * timelineWeeks * timelineScale * intensityMul * muscleSupport * medMuscleFactor;
      }
      if (input.goal.targetWeightChangeKg != null) {
        expectedWeight = applyWeightGainTarget(input.goal.targetWeightChangeKg);
      } else {
        expectedWeight = round3(expectedMuscle * 1.15);
        weightOrigin = "deterministic_simulation";
      }
      if (input.goal.targetBodyFatChangePercentagePoints != null) {
        const bf = input.goal.targetBodyFatChangePercentagePoints;
        expectedFatPp = bf * intensityMul;
        fatOrigin = "user_target";
      } else {
        expectedFatPp = round3(0.3 * timelineScale * intensityMul);
        fatOrigin = "deterministic_simulation";
      }
      break;
    }
    case "body_recomposition": {
      if (input.goal.targetBodyFatChangePercentagePoints != null) {
        expectedFatPp = applyFatLossTarget(
          input.goal.targetBodyFatChangePercentagePoints
        );
      } else {
        expectedFatPp = -BODY_SIM_RECOMP_FAT_LOSS_PP_PER_WEEK * timelineWeeks * timelineScale * intensityMul * medFatFactor;
      }
      if (input.goal.targetMuscleChangeKg != null) {
        expectedMuscle = applyMuscleGainTarget(input.goal.targetMuscleChangeKg);
      } else {
        expectedMuscle = BODY_SIM_RECOMP_MUSCLE_KG_PER_WEEK * timelineWeeks * timelineScale * intensityMul * muscleSupport * medMuscleFactor;
      }
      if (input.goal.targetWeightChangeKg != null) {
        const raw = input.goal.targetWeightChangeKg;
        if (raw < 0) {
          expectedWeight = applyWeightLossTarget(raw);
        } else if (raw > 0) {
          expectedWeight = applyWeightGainTarget(raw);
        } else {
          expectedWeight = 0;
          weightOrigin = "user_target";
        }
      } else {
        expectedWeight = round3(
          (expectedFatPp ?? 0) * 0.4 + (expectedMuscle ?? 0) * 0.5
        );
        weightOrigin = "deterministic_simulation";
      }
      limitations.push(
        "Recomposition focuses on composition and shape, not scale weight alone."
      );
      break;
    }
    case "general_fitness_improvement": {
      if (input.goal.targetBodyFatChangePercentagePoints != null) {
        expectedFatPp = applyFatLossTarget(
          input.goal.targetBodyFatChangePercentagePoints
        );
      } else {
        expectedFatPp = -BODY_SIM_GENERAL_FITNESS_FAT_LOSS_PP_PER_WEEK * timelineWeeks * timelineScale * intensityMul * medFatFactor;
      }
      if (input.goal.targetMuscleChangeKg != null) {
        expectedMuscle = applyMuscleGainTarget(input.goal.targetMuscleChangeKg);
      } else {
        expectedMuscle = BODY_SIM_GENERAL_FITNESS_MUSCLE_KG_PER_WEEK * timelineWeeks * timelineScale * intensityMul * muscleSupport * medMuscleFactor;
      }
      if (input.goal.targetWeightChangeKg != null) {
        expectedWeight = input.goal.targetWeightChangeKg < 0 ? applyWeightLossTarget(input.goal.targetWeightChangeKg) : applyWeightGainTarget(input.goal.targetWeightChangeKg);
      } else {
        expectedWeight = -BODY_SIM_GENERAL_FITNESS_WEIGHT_KG_PER_WEEK * timelineWeeks * timelineScale * intensityMul * medFatFactor;
      }
      limitations.push(
        "General fitness uses modest visual changes when targets are incomplete."
      );
      break;
    }
  }
  if (expectedWeight != null) expectedWeight = round3(expectedWeight);
  if (expectedFatPp != null) expectedFatPp = round3(expectedFatPp);
  if (expectedMuscle != null) expectedMuscle = round3(expectedMuscle);
  if (intensity === "ambitious") {
    if (expectedFatPp != null && expectedFatPp < -BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE) {
      expectedFatPp = -BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE;
      targetModerated = true;
    }
    if (expectedMuscle != null && expectedMuscle > BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE) {
      expectedMuscle = BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE;
      targetModerated = true;
    }
  }
  const missingInputs = [];
  if (input.profile.currentWeightKg == null) missingInputs.push("currentWeightKg");
  if (input.profile.currentBodyFatPercent == null) {
    missingInputs.push("currentBodyFatPercent");
  }
  if (input.profile.heightCm == null) missingInputs.push("heightCm");
  if (input.profile.trainingExperience === "not_provided") {
    missingInputs.push("trainingExperience");
  }
  if (input.profile.ageYears == null) missingInputs.push("ageYears");
  if (missingInputs.length >= 3) {
    if (!moderationReasons.includes("insufficient_baseline_information")) {
      moderationReasons.push("insufficient_baseline_information");
    }
  }
  let sourceCompleteness = "medium";
  if (missingInputs.length === 0) sourceCompleteness = "high";
  else if (missingInputs.length >= 3) sourceCompleteness = "low";
  const confidenceReasons = buildConfidenceReasons(input);
  if (targetModerated) {
    confidenceReasons.push("target_required_moderation");
  }
  if (sourceCompleteness === "low") {
    confidenceReasons.push("limited_baseline_data");
  }
  const actionableModeration = [];
  for (const r of moderationReasons) {
    if (r === "identity_preservation_boundary" || r === "natural_proportion_boundary") {
      continue;
    }
    if (r === "ambitious_intensity_bounded" && intensity === "ambitious") {
      actionableModeration.push(r);
      continue;
    }
    if (!actionableModeration.includes(r)) actionableModeration.push(r);
  }
  if (targetModerated) {
    if (!actionableModeration.includes("identity_preservation_boundary")) {
      actionableModeration.push("identity_preservation_boundary");
    }
    if (!actionableModeration.includes("natural_proportion_boundary")) {
      actionableModeration.push("natural_proportion_boundary");
    }
  }
  const wbConfidence = overallConfidence(confidenceReasons, missingInputs);
  const weightRange = rangeFromExpected(
    expectedWeight,
    "kg",
    weightOrigin,
    spread
  );
  const fatRange = rangeFromExpected(
    expectedFatPp,
    "percentage_points",
    fatOrigin,
    spread
  );
  const muscleRange = rangeFromExpected(
    expectedMuscle,
    "kg",
    muscleOrigin,
    spread
  );
  const fatDir = goalPrimaryFatDirection(goalType);
  const muscleDir = goalPrimaryMuscleDirection(goalType);
  const regions = BODY_SIMULATOR_REGIONS.map(
    (region) => {
      const fatW = BODY_SIM_REGION_FAT_WEIGHT[region];
      const musW = BODY_SIM_REGION_MUSCLE_WEIGHT[region];
      let visualExpected = BODY_SIM_REGION_VISUAL_BASE * timelineScale * intensityMul;
      if (fatDir === "decrease") {
        visualExpected *= 0.55 * fatW + 0.45 * (muscleDir === "increase" ? musW : 0.5);
      } else if (muscleDir === "increase") {
        visualExpected *= 0.7 * musW + 0.3 * fatW;
      } else {
        visualExpected *= 0.5 * (fatW + musW);
      }
      visualExpected = clamp2(
        round3(visualExpected),
        0.05,
        BODY_SIM_REGION_VISUAL_MAX
      );
      const visSpread = visualExpected * spread;
      const visibility = regionVisibility(
        region,
        input.sourceImageContext.progressPhotoView,
        input.sourceImageContext.available
      );
      const regionReasons = [];
      let conf = wbConfidence;
      if (visibility === "available") {
        regionReasons.push("body_region_visible");
      } else if (visibility === "partially_visible" || visibility === "not_visible") {
        regionReasons.push("body_region_occluded");
        conf = conf === "high" ? "medium" : "low";
      } else {
        regionReasons.push("body_region_occluded");
        conf = "low";
      }
      return {
        region,
        fatChange: fatChangeLabel(goalType, fatW * timelineScale),
        muscleChange: muscleChangeLabel(
          goalType,
          musW * timelineScale,
          expectedMuscle
        ),
        visualMagnitude: {
          lower: round3(Math.max(0, visualExpected - visSpread)),
          expected: visualExpected,
          upper: round3(
            Math.min(BODY_SIM_REGION_VISUAL_MAX, visualExpected + visSpread)
          )
        },
        preserveNaturalProportions: true,
        visibility,
        confidence: conf,
        confidenceReasons: regionReasons,
        provenanceSourcePaths: [
          "goal.type",
          "goal.timelineWeeks",
          "goal.intensity"
        ]
      };
    }
  );
  limitations.push(
    "Individual fat distribution varies; regional magnitudes are conservative planning estimates."
  );
  limitations.push(
    "Body Simulator output is an expected visualization, not a medical prediction or guaranteed outcome."
  );
  if (input.bodyAnalysis == null) {
    limitations.push("Body Analysis was not supplied and remains optional in v1.");
  } else if (input.bodyAnalysis.status !== "not_run") {
    provenance.push({
      rulePath: "confidence.overall",
      source: "body_analysis",
      sourcePath: "bodyAnalysis.status"
    });
  }
  const anatomicalTransformation = buildAnatomicalTransformation(input);
  provenance.push({
    rulePath: "anatomicalTransformation",
    source: "derived",
    sourcePath: "anatomicalTransformation"
  });
  for (const lim of anatomicalTransformation.limitations) {
    if (!limitations.includes(lim)) limitations.push(lim);
  }
  for (const issue of anatomicalTransformation.conflicts) {
    if (issue.severity === "warning") {
      warnings.push(issue.message);
    }
  }
  return {
    schemaVersion: BODY_SIMULATOR_RULES_SCHEMA_VERSION,
    simulationId: input.simulationId,
    generatedAt: input.createdAt,
    rulesVersion: BODY_SIMULATOR_RULES_VERSION,
    goal: {
      requestedType: goalType,
      effectiveType: goalType,
      timelineWeeks,
      intensity
    },
    baseline: {
      sourceCompleteness,
      bodyFatBasis: input.profile.bodyFatBasis,
      missingInputs
    },
    wholeBodyChange: {
      weightChangeKg: weightRange,
      bodyFatChangePercentagePoints: fatRange,
      muscleChangeKg: muscleRange,
      confidence: wbConfidence,
      confidenceReasons: [...confidenceReasons]
    },
    regions,
    anatomicalTransformation,
    preservation: {
      identity: "preserve",
      originalPresentation: "preserve",
      pose: "preserve",
      cameraFraming: "preserve",
      clothing: "preserve",
      clothingCoverage: "preserve",
      background: "preserve",
      lightingCharacter: "preserve",
      ageAppearance: "preserve",
      ethnicityAppearance: "preserve",
      personalStyle: "preserve",
      faceGeometry: "preserve",
      skinTone: "preserve",
      hairstyle: "preserve",
      bodyHeight: "preserve",
      handAndFootScale: "preserve",
      skeletalProportions: "preserve"
    },
    realism: {
      requestedTargetModerated: targetModerated,
      moderationReasons: targetModerated ? actionableModeration.filter((r) => r !== "ambitious_intensity_bounded").length > 0 ? actionableModeration : [...actionableModeration] : actionableModeration.filter(
        (r) => r === "ambitious_intensity_bounded" || r === "insufficient_baseline_information"
      ),
      unrealisticChangePrevented: targetModerated,
      expectedVisualizationNotGuarantee: true
    },
    provenance,
    confidence: {
      overall: wbConfidence,
      reasons: confidenceReasons
    },
    limitations,
    warnings
  };
}
function simulateBodyTransformation(input) {
  const errors = validateBodySimulatorInput(input);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const rules = buildBodySimulatorTransformationRules(input);
  return { ok: true, rules };
}

// src/ai/control-room/BodySimulatorComparison.ts
var GENERATION_PATH_LEGACY = "legacy";
var GENERATION_PATH_BODY_SIMULATOR = "body_simulator";
var GENERATION_PATHS = Object.freeze([
  GENERATION_PATH_LEGACY,
  GENERATION_PATH_BODY_SIMULATOR
]);
var MANUAL_EVAL_CATEGORIES = Object.freeze([
  { id: "identityPreservation", label: "Identity preservation" },
  { id: "bodyChangeRealism", label: "Body-change realism" },
  {
    id: "goalAlignment",
    label: "Transformation matches intended goal"
  },
  { id: "naturalProportions", label: "Natural proportions" },
  {
    id: "presentationPreservation",
    label: "Clothing/presentation preservation"
  },
  { id: "overallUsefulness", label: "Overall usefulness" }
]);
var PRESERVATION_KEYS = [
  "identity",
  "originalPresentation",
  "pose",
  "cameraFraming",
  "clothing",
  "clothingCoverage",
  "background",
  "lightingCharacter",
  "ageAppearance",
  "ethnicityAppearance",
  "personalStyle",
  "faceGeometry",
  "skinTone",
  "hairstyle",
  "bodyHeight",
  "handAndFootScale",
  "skeletalProportions"
];
var CONFIDENCE_LEVELS = /* @__PURE__ */ new Set([
  "high",
  "medium",
  "low",
  "not_applicable",
  "unknown"
]);
function verifyCanonicalBodySimulatorRules(rules) {
  const errors = [];
  if (rules == null || typeof rules !== "object") {
    return { ok: false, errors: ["rules_missing"] };
  }
  const r = rules;
  if (r.schemaVersion !== BODY_SIMULATOR_RULES_SCHEMA_VERSION) {
    errors.push("unsupported_rules_schema");
  }
  if (typeof r.rulesVersion !== "string" || r.rulesVersion.trim() === "") {
    errors.push("missing_rules_version");
  }
  if (typeof r.simulationId !== "string" || r.simulationId.trim() === "") {
    errors.push("missing_simulation_id");
  }
  const goal = r.goal;
  if (goal == null || typeof goal !== "object") {
    errors.push("invalid_goal");
  } else {
    const g = goal;
    if (typeof g.effectiveType !== "string" || !BODY_SIMULATION_GOAL_TYPES.includes(g.effectiveType)) {
      errors.push("unsupported_goal");
    }
    if (typeof g.timelineWeeks !== "number" || !Number.isFinite(g.timelineWeeks) || g.timelineWeeks < BODY_SIMULATOR_TIMELINE_MIN_WEEKS || g.timelineWeeks > BODY_SIMULATOR_TIMELINE_MAX_WEEKS) {
      errors.push("unsupported_timeline");
    }
    if (typeof g.intensity !== "string" || !BODY_SIMULATION_INTENSITIES.includes(g.intensity)) {
      errors.push("invalid_intensity");
    }
  }
  const preservation = r.preservation;
  if (preservation == null || typeof preservation !== "object") {
    errors.push("preservation_missing");
  } else {
    const p = preservation;
    for (const key of PRESERVATION_KEYS) {
      if (p[key] !== "preserve") {
        errors.push(`preservation_${key}_invalid`);
      }
    }
  }
  if (!Array.isArray(r.regions) || r.regions.length === 0) {
    errors.push("regions_invalid");
  } else {
    for (const region of r.regions) {
      if (region == null || typeof region !== "object") {
        errors.push("region_entry_invalid");
        continue;
      }
      const reg = region;
      if (typeof reg.region !== "string" || !BODY_SIMULATOR_REGIONS.includes(reg.region)) {
        errors.push("region_id_invalid");
      }
      const mag = reg.visualMagnitude;
      if (mag == null || typeof mag !== "object") {
        errors.push("region_magnitude_invalid");
      } else {
        const m = mag;
        for (const k of ["lower", "expected", "upper"]) {
          if (typeof m[k] !== "number" || !Number.isFinite(m[k])) {
            errors.push("region_magnitude_invalid");
            break;
          }
        }
      }
      if (reg.preserveNaturalProportions !== true) {
        errors.push("region_preservation_invalid");
      }
    }
  }
  const confidence = r.confidence;
  if (confidence == null || typeof confidence !== "object") {
    errors.push("confidence_invalid");
  } else {
    const c = confidence;
    if (typeof c.overall !== "string" || !CONFIDENCE_LEVELS.has(c.overall)) {
      errors.push("confidence_invalid");
    }
    if (!Array.isArray(c.reasons)) {
      errors.push("confidence_reasons_invalid");
    }
  }
  if (!Array.isArray(r.provenance)) {
    errors.push("provenance_invalid");
  }
  const realism = r.realism;
  if (realism == null || typeof realism !== "object") {
    errors.push("realism_invalid");
  } else {
    const real = realism;
    if (typeof real.requestedTargetModerated !== "boolean") {
      errors.push("realism_moderation_invalid");
    }
    if (typeof real.unrealisticChangePrevented !== "boolean") {
      errors.push("realism_moderation_invalid");
    }
    if (real.expectedVisualizationNotGuarantee !== true) {
      errors.push("realism_guarantee_flag_invalid");
    }
    if (!Array.isArray(real.moderationReasons)) {
      errors.push("realism_moderation_invalid");
    }
  }
  const forbiddenKeys = ["provider", "model", "prompt", "negativePrompt"];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(r, key)) {
      errors.push(`forbidden_field_${key}`);
    }
  }
  const serialized = safeJson(r);
  if (/"provider"\s*:|"model"\s*:|"positivePrompt"\s*:|"replicate"/i.test(
    serialized
  )) {
    errors.push("provider_or_prompt_embedded");
  }
  return { ok: errors.length === 0, errors };
}
function safeJson(value) {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

// src/ai/body-analysis/types.ts
var ALLOWED_CONFIDENCE_REASONS = Object.freeze([
  "whole_body_visible",
  "front_view_available",
  "side_view_available",
  "back_view_available",
  "even_lighting",
  "known_camera_view",
  "feet_outside_frame",
  "strong_backlight",
  "body_region_occluded",
  "single_view_only"
]);
function createEmptyBodyAnalysisEvidence(view = "unknown") {
  return {
    schemaVersion: 1,
    view,
    sourceIds: [],
    confidence: "not_applicable",
    confidenceReasons: [],
    notes: ["Body analysis evidence is reserved but not implemented."]
  };
}
var BODY_ANALYSIS_MAY_SUPPORT = Object.freeze([
  "better TransformationPlan inputs",
  "better body-region planning",
  "better identity and proportion preservation",
  "more consistent comparisons over time",
  "confidence-aware simulation decisions"
]);
var BODY_ANALYSIS_FORBIDDEN_OUTPUTS = Object.freeze([
  "beauty_score",
  "attractiveness_score",
  "body_ranking",
  "ideal_body_ranking",
  "shame_based_label",
  "normal_versus_abnormal_judgment",
  "value_judgment_height_weight_shape",
  "competitive_user_ranking"
]);

// src/ai/body-simulator/PublicFutureToBodySimulatorAdapter.ts
var BODY_SIMULATOR_LIVE_PREVIEW_ENV = "BODY_SIMULATOR_LIVE_PREVIEW_ENABLED";
function isBodySimulatorLivePreviewEnabled(env = process.env) {
  return env[BODY_SIMULATOR_LIVE_PREVIEW_ENV] === "1";
}
var PUBLIC_FOCUS_ZONE_MAP = Object.freeze({
  abs: Object.freeze(["abs", "core"]),
  core: Object.freeze(["core", "abs"]),
  glutes: Object.freeze(["glutes"]),
  thighs: Object.freeze(["thighs"]),
  arms: Object.freeze(["arms"]),
  chest: Object.freeze(["chest"]),
  shoulders: Object.freeze(["shoulders", "upper_body"]),
  upper: Object.freeze(["upper_body", "shoulders"]),
  upper_body: Object.freeze(["upper_body", "shoulders"]),
  back: Object.freeze(["back"]),
  posture: Object.freeze(["posture"]),
  overall: Object.freeze([])
});
function asFiniteNumber(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}
function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}
function collectPublicZones(payload) {
  const out = [];
  if (Array.isArray(payload.zones)) {
    for (const z of payload.zones) {
      const s = asTrimmedString(z).toLowerCase();
      if (s) out.push(s);
    }
  }
  if (out.length === 0 && payload.zone != null) {
    const raw = asTrimmedString(payload.zone);
    for (const part of raw.split(/[,|/]+/)) {
      const s = part.trim().toLowerCase();
      if (s) out.push(s);
    }
  }
  if (out.length === 0 && payload.focus != null) {
    const s = asTrimmedString(payload.focus).toLowerCase();
    if (s) out.push(s);
  }
  return out;
}
function mapPublicFocusZones(payload) {
  const publicFocusZonesReceived = collectPublicZones(payload);
  const mapped = /* @__PURE__ */ new Set();
  const unmappedFocusZones = [];
  for (const zone of publicFocusZonesReceived) {
    const hit = PUBLIC_FOCUS_ZONE_MAP[zone];
    if (hit == null) {
      unmappedFocusZones.push(zone);
      continue;
    }
    for (const canonical of hit) {
      if (BODY_SIMULATOR_FOCUS_ZONES.includes(canonical)) {
        mapped.add(canonical);
      }
    }
  }
  return {
    publicFocusZonesReceived,
    canonicalFocusZonesMapped: [...mapped],
    unmappedFocusZones
  };
}
function mapPublicTimeline(payload) {
  const horizon = asTrimmedString(payload.horizon) || "12w";
  const horizonDate = asTrimmedString(payload.horizonDate);
  const fixedMonths = {
    "4w": 1,
    "8w": 2,
    "12w": 3,
    "24w": 6,
    "12m": 12,
    "52w": 12,
    "18m": 12
  };
  let timelineMonths = null;
  let timelineSource = horizon;
  if (horizon === "custom" && horizonDate) {
    const target = /* @__PURE__ */ new Date(`${horizonDate}T12:00:00`);
    if (!Number.isNaN(target.getTime())) {
      const days = Math.max(
        7,
        Math.round((target.getTime() - Date.now()) / 864e5)
      );
      timelineMonths = Math.max(0.25, Math.round(days / 30 * 10) / 10);
      timelineSource = `custom:${horizonDate}`;
    }
  }
  if (timelineMonths == null) {
    timelineMonths = fixedMonths[horizon] ?? 3;
    timelineSource = horizon;
  }
  let timelineWeeks = Math.round(timelineMonths * BODY_SIM_WEEKS_PER_MONTH);
  if (timelineWeeks < 4) timelineWeeks = 4;
  if (timelineWeeks > 52) timelineWeeks = 52;
  const timelineScalingCoefficient = timelineMonths <= 0 ? 0 : timelineWeeks / (timelineMonths * BODY_SIM_WEEKS_PER_MONTH);
  return {
    timelineSource,
    timelineMonths,
    timelineWeeks,
    timelineScalingCoefficient: Number.isFinite(timelineScalingCoefficient) ? timelineScalingCoefficient : 1
  };
}
function mapPublicEffort(payload) {
  const raw = asTrimmedString(payload.intensity).toLowerCase() || "moderate";
  let canonicalIntensity;
  if (raw === "subtle" || raw === "moderate_effort" || raw === "conservative") {
    canonicalIntensity = "conservative";
  } else if (raw === "strong" || raw === "strict" || raw === "max" || raw === "ambitious") {
    canonicalIntensity = "ambitious";
  } else {
    canonicalIntensity = "realistic";
  }
  const effort = effortCoefficientForIntensity(canonicalIntensity);
  return {
    publicEffort: raw,
    canonicalIntensity,
    anatomicalEffortCoefficient: effort.coefficient
  };
}
function mapPublicBodyFat(payload) {
  const currentBodyFatPercentReceived = asFiniteNumber(payload.bfNow);
  const targetBodyFatPercentReceived = asFiniteNumber(payload.bfGoal);
  let computedBodyFatDeltaPercentagePoints = null;
  if (currentBodyFatPercentReceived != null && targetBodyFatPercentReceived != null) {
    computedBodyFatDeltaPercentagePoints = targetBodyFatPercentReceived - currentBodyFatPercentReceived;
  }
  return {
    currentBodyFatPercentReceived,
    targetBodyFatPercentReceived,
    computedBodyFatDeltaPercentagePoints
  };
}
function mapGoalType(payload) {
  const fat = asTrimmedString(payload.fat).toLowerCase() || "decrease";
  const muscle = asTrimmedString(payload.muscle).toLowerCase() || "toned";
  if (fat === "increase" && (muscle === "volume" || muscle === "gain")) {
    return "muscle_gain";
  }
  if (fat === "maintain" && (muscle === "volume" || muscle === "gain")) {
    return "muscle_gain";
  }
  if (fat === "decrease" && (muscle === "volume" || muscle === "gain")) {
    return "body_recomposition";
  }
  if (fat === "decrease") {
    return "fat_loss_with_muscle_preservation";
  }
  if (fat === "increase") {
    return "muscle_gain";
  }
  if (fat === "maintain") {
    return "general_fitness_improvement";
  }
  return "fat_loss_with_muscle_preservation";
}
function mapSex(gender) {
  const g = asTrimmedString(gender).toLowerCase();
  if (g === "female" || g === "kvinne" || g === "f") return "female";
  if (g === "male" || g === "mann" || g === "m") return "male";
  if (g === "intersex" || g === "other" || g === "annet") {
    return "intersex_or_other";
  }
  return "not_provided";
}
function collectOptionalNotes(payload) {
  const notes = [];
  if (Array.isArray(payload.optionalNotes)) {
    for (const n of payload.optionalNotes) {
      const s = asTrimmedString(n);
      if (s) notes.push(s);
    }
  }
  const maal = asTrimmedString(payload.maal);
  if (maal) notes.push(maal);
  return notes;
}
function createSimulationId(nowMs) {
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `live-fut-${nowMs.toString(36)}-${rand}`;
}
function adaptPublicFutureToBodySimulator(payload, options) {
  const warnings = [];
  try {
    if (payload == null || typeof payload !== "object") {
      return {
        ok: false,
        errorClass: "live_preview_adapter_failed",
        message: "Public Future payload missing.",
        warnings
      };
    }
    const bodyFat = mapPublicBodyFat(payload);
    const timeline = mapPublicTimeline(payload);
    const focus = mapPublicFocusZones(payload);
    const effort = mapPublicEffort(payload);
    if (focus.unmappedFocusZones.length > 0) {
      warnings.push(
        `unmapped_focus_zones:${focus.unmappedFocusZones.join(",")}`
      );
    }
    const notes = collectOptionalNotes(payload);
    const optionalNotePresent = notes.length > 0;
    const nowMs = options?.nowMs ?? Date.now();
    const simulationId = options?.simulationId ?? createSimulationId(nowMs);
    const heightCm = asFiniteNumber(payload.heightCm);
    const weightKg = asFiniteNumber(payload.weightKg);
    const ageYears = asFiniteNumber(payload.ageYears);
    const delta = bodyFat.computedBodyFatDeltaPercentagePoints;
    const goalType = mapGoalType(payload);
    const input = {
      schemaVersion: BODY_SIMULATOR_INPUT_SCHEMA_VERSION,
      simulationId,
      createdAt: new Date(nowMs).toISOString(),
      goal: {
        type: goalType,
        timelineWeeks: timeline.timelineWeeks,
        targetWeightChangeKg: null,
        targetBodyFatChangePercentagePoints: delta,
        targetMuscleChangeKg: goalType === "muscle_gain" || goalType === "body_recomposition" ? 1 : null,
        intensity: effort.canonicalIntensity,
        targetBodyFatPercent: bodyFat.targetBodyFatPercentReceived
      },
      profile: {
        ageYears,
        sexForPhysiology: mapSex(payload.gender),
        heightCm,
        currentWeightKg: weightKg,
        currentBodyFatPercent: bodyFat.currentBodyFatPercentReceived,
        bodyFatBasis: bodyFat.currentBodyFatPercentReceived != null ? "user_estimate" : "not_provided",
        trainingExperience: "not_provided",
        evidence: {
          profile: createEmptyBodyAnalysisEvidence("unknown")
        }
      },
      activity: {
        generalActivity: "not_provided",
        resistanceTrainingSessionsPerWeek: null,
        cardioSessionsPerWeek: null,
        trainingConsistency: "not_provided",
        proteinIntakeSupport: "not_provided",
        recoverySupport: "not_provided",
        evidence: {
          activity: createEmptyBodyAnalysisEvidence("unknown")
        }
      },
      medicationEffects: (() => {
        const med = createDefaultMedicationEffects();
        if (Boolean(payload.medicine)) {
          med.medicationMayAffectWeight = true;
          med.evidence.confidence = "low";
          med.evidence.notes = ["user_declared_medicine_toggle"];
        }
        return med;
      })(),
      bodyAnalysis: null,
      sourceImageContext: {
        available: true,
        progressPhotoView: "front"
      },
      options: {
        preserveIdentity: true,
        preserveOriginalPresentation: true,
        preservePose: true,
        preserveCameraFraming: true,
        preserveClothing: true,
        preserveBackground: true,
        preserveLightingCharacter: true
      },
      focusZones: focus.canonicalFocusZonesMapped,
      ...optionalNotePresent ? { optionalNotes: notes } : {}
    };
    return {
      ok: true,
      input,
      bodyFat,
      timeline,
      focus,
      effort,
      optionalNotePresent,
      warnings
    };
  } catch (error) {
    return {
      ok: false,
      errorClass: "live_preview_adapter_failed",
      message: error instanceof Error ? error.message : "Public Future adapter failed.",
      warnings
    };
  }
}

// src/ai/body-simulator/LiveFuturePreviewPipeline.ts
var LiveFuturePreviewError = class extends Error {
  constructor(errorClass, message, options) {
    super(message);
    this.name = "LiveFuturePreviewError";
    this.errorClass = errorClass;
    this.livePreviewTraceId = options.livePreviewTraceId;
    this.status = options.status ?? 422;
    this.diagnostics = options.diagnostics ?? null;
    this.providerCalls = options.providerCalls ?? 0;
  }
};
function createLivePreviewTraceId(nowMs) {
  const stamp = nowMs.toString(36);
  const rand = (0, import_node_crypto2.randomBytes)(6).toString("hex");
  return `lfp_${stamp}_${rand}`;
}
function emptyDiagnostics(livePreviewTraceId, enabled) {
  return {
    livePreviewEnabled: enabled,
    livePreviewTraceId,
    bodySimulatorExecuted: false,
    anatomicalEngineExecuted: false,
    bodyFat: { current: null, target: null, delta: null },
    timelineWeeks: null,
    timelineSource: null,
    timelineScalingCoefficient: null,
    effort: {
      publicEffort: null,
      canonicalIntensity: null,
      anatomicalEffortCoefficient: null
    },
    focusZones: {
      publicFocusZonesReceived: [],
      canonicalFocusZonesMapped: [],
      unmappedFocusZones: []
    },
    optionalNotePresent: false,
    optionalNoteDisposition: "none",
    appliedAnatomicalRuleIds: [],
    appliedFeatures: [],
    suppressedRuleIds: [],
    semanticSupportTerms: [],
    formatterConsumedAnatomicalRules: false,
    anatomicalTranslatedChangeCount: 0,
    promptContainsAnatomicalIntent: false,
    providerRequestAttempted: false,
    providerRequestCount: 0,
    generationPath: enabled ? "body_simulator_anatomical_live_preview" : "legacy_reservedrift",
    warnings: []
  };
}
function noteDispositionFromAnatomical(rules) {
  const outcomes = rules.anatomicalTransformation?.noteOutcomes ?? [];
  if (outcomes.length === 0) {
    return rules.anatomicalTransformation?.optionalNotesPresent ? "suppressed" : "none";
  }
  const statuses = new Set(outcomes.map((o) => o.status));
  if (statuses.has("applied") && statuses.size === 1) return "applied";
  if (statuses.has("applied") || statuses.has("partially_applied")) {
    return statuses.has("suppressed") || statuses.has("partially_applied") ? "partially_applied" : "applied";
  }
  if (statuses.has("partially_applied")) return "partially_applied";
  if (statuses.has("suppressed")) return "suppressed";
  return "none";
}
function assertAnatomicalRulesTranslated(rules, canonical) {
  const anat = rules.anatomicalTransformation;
  const meaningful = (anat?.rules?.length ?? 0) > 0;
  if (!meaningful) {
    return { ok: true, translatedCount: 0 };
  }
  const translated = canonical.approvedChanges.filter(
    (c) => c.id.startsWith("body-sim-anatomical-") || String(c.sourcePlanField || "").includes("anatomicalTransformation")
  );
  if (translated.length === 0 && (canonical.anatomicalSummaries?.length ?? 0) === 0) {
    return { ok: false, reason: "anatomical_rules_not_translated" };
  }
  if (translated.length === 0) {
    return { ok: false, reason: "anatomical_rules_not_translated" };
  }
  return { ok: true, translatedCount: translated.length };
}
function verifyLivePreviewBeforeProvider(adapter, rules, canonical) {
  const errors = [];
  const base = verifyCanonicalBodySimulatorRules(rules);
  if (!base.ok) errors.push(...base.errors);
  const anat = rules.anatomicalTransformation;
  if (anat == null) {
    errors.push("anatomical_block_missing");
  } else if (anat.schemaVersion !== ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION) {
    errors.push("anatomical_schema_mismatch");
  }
  const bf = adapter.bodyFat;
  if (bf.currentBodyFatPercentReceived != null && bf.targetBodyFatPercentReceived != null) {
    if (bf.computedBodyFatDeltaPercentagePoints == null) {
      errors.push("body_fat_delta_missing");
    } else {
      const expected = bf.targetBodyFatPercentReceived - bf.currentBodyFatPercentReceived;
      if (bf.computedBodyFatDeltaPercentagePoints !== expected) {
        errors.push("body_fat_delta_mismatch");
      }
      if (rules.anatomicalTransformation?.bodyFatContext?.deltaPercentagePoints != null && Math.abs(
        rules.anatomicalTransformation.bodyFatContext.deltaPercentagePoints - expected
      ) > 0.01) {
        errors.push("anatomical_body_fat_delta_mismatch");
      }
    }
  }
  if (adapter.timeline.timelineWeeks !== rules.goal.timelineWeeks) {
    errors.push("timeline_mismatch");
  }
  if (!rules.preservation || rules.preservation.identity !== "preserve") {
    errors.push("preservation_identity_missing");
  }
  if ((anat?.rules?.length ?? 0) > 0 && (anat?.appliedRuleIds?.length ?? 0) === 0) {
    errors.push("applied_anatomical_rules_missing");
  }
  const translation = assertAnatomicalRulesTranslated(rules, canonical);
  if (!translation.ok) {
    errors.push(translation.reason);
  }
  if (canonical.source !== "body_simulator_v1") {
    errors.push("legacy_transform_source_mixed");
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}
function buildLiveFuturePreviewTraceStages(diagnostics, outcome = "pending") {
  const warn = diagnostics.warnings;
  return [
    {
      id: "public_future_input",
      label: "Public Future Input",
      status: diagnostics.livePreviewEnabled ? "ok" : "skipped",
      values: {
        livePreviewEnabled: diagnostics.livePreviewEnabled,
        traceId: diagnostics.livePreviewTraceId
      },
      warnings: []
    },
    {
      id: "body_simulator_input",
      label: "Body Simulator Input",
      status: diagnostics.bodySimulatorExecuted ? "ok" : "pending",
      values: {
        intensity: diagnostics.effort.canonicalIntensity,
        timelineWeeks: diagnostics.timelineWeeks
      },
      warnings: []
    },
    {
      id: "body_fat_delta",
      label: "Body Fat Delta",
      status: diagnostics.bodyFat.delta != null ? "ok" : diagnostics.bodySimulatorExecuted ? "warn" : "pending",
      values: {
        current: diagnostics.bodyFat.current,
        target: diagnostics.bodyFat.target,
        delta: diagnostics.bodyFat.delta
      },
      warnings: []
    },
    {
      id: "timeline_mapping",
      label: "Timeline Mapping",
      status: diagnostics.timelineWeeks != null ? "ok" : "pending",
      values: {
        source: diagnostics.timelineSource,
        weeks: diagnostics.timelineWeeks,
        scalingCoefficient: diagnostics.timelineScalingCoefficient
      },
      warnings: []
    },
    {
      id: "focus_mapping",
      label: "Focus Mapping",
      status: diagnostics.focusZones.unmappedFocusZones.length > 0 ? "warn" : "ok",
      values: {
        received: diagnostics.focusZones.publicFocusZonesReceived.join(","),
        mapped: diagnostics.focusZones.canonicalFocusZonesMapped.join(","),
        unmapped: diagnostics.focusZones.unmappedFocusZones.join(",")
      },
      warnings: diagnostics.focusZones.unmappedFocusZones.length > 0 ? [`unmapped:${diagnostics.focusZones.unmappedFocusZones.join(",")}`] : []
    },
    {
      id: "anatomical_rules",
      label: "Anatomical Rules",
      status: diagnostics.anatomicalEngineExecuted ? diagnostics.appliedAnatomicalRuleIds.length > 0 ? "ok" : "warn" : "pending",
      values: {
        appliedCount: diagnostics.appliedAnatomicalRuleIds.length,
        suppressedCount: diagnostics.suppressedRuleIds.length,
        features: diagnostics.appliedFeatures.join(",")
      },
      warnings: []
    },
    {
      id: "formatter_translation",
      label: "Formatter Translation",
      status: diagnostics.formatterConsumedAnatomicalRules ? "ok" : "pending",
      values: {
        consumed: diagnostics.formatterConsumedAnatomicalRules,
        translatedCount: diagnostics.anatomicalTranslatedChangeCount,
        promptIntent: diagnostics.promptContainsAnatomicalIntent
      },
      warnings: []
    },
    {
      id: "provider_attempt",
      label: "Provider Attempt",
      status: diagnostics.providerRequestAttempted ? diagnostics.providerRequestCount === 1 ? "ok" : "warn" : "pending",
      values: {
        attempted: diagnostics.providerRequestAttempted,
        count: diagnostics.providerRequestCount
      },
      warnings: []
    },
    {
      id: "outcome",
      label: "Outcome",
      status: outcome === "ok" ? "ok" : outcome === "error" ? "error" : "pending",
      values: {
        generationPath: diagnostics.generationPath
      },
      warnings: warn
    }
  ];
}
function prepareLiveFuturePreview(payload, options) {
  const nowMs = options?.nowMs ?? Date.now();
  const livePreviewTraceId = options?.livePreviewTraceId ?? createLivePreviewTraceId(nowMs);
  const enabled = options?.enabled ?? true;
  const diagnostics = emptyDiagnostics(livePreviewTraceId, enabled);
  const adapted = adaptPublicFutureToBodySimulator(payload, { nowMs });
  if (!adapted.ok) {
    throw new LiveFuturePreviewError(
      "live_preview_adapter_failed",
      adapted.message,
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }
  diagnostics.bodyFat = {
    current: adapted.bodyFat.currentBodyFatPercentReceived,
    target: adapted.bodyFat.targetBodyFatPercentReceived,
    delta: adapted.bodyFat.computedBodyFatDeltaPercentagePoints
  };
  diagnostics.timelineWeeks = adapted.timeline.timelineWeeks;
  diagnostics.timelineSource = adapted.timeline.timelineSource;
  diagnostics.timelineScalingCoefficient = adapted.timeline.timelineScalingCoefficient;
  diagnostics.effort = {
    publicEffort: adapted.effort.publicEffort,
    canonicalIntensity: adapted.effort.canonicalIntensity,
    anatomicalEffortCoefficient: adapted.effort.anatomicalEffortCoefficient
  };
  diagnostics.focusZones = {
    publicFocusZonesReceived: adapted.focus.publicFocusZonesReceived,
    canonicalFocusZonesMapped: adapted.focus.canonicalFocusZonesMapped,
    unmappedFocusZones: adapted.focus.unmappedFocusZones
  };
  diagnostics.optionalNotePresent = adapted.optionalNotePresent;
  diagnostics.warnings.push(...adapted.warnings);
  let simulateResult;
  try {
    simulateResult = simulateBodyTransformation(adapted.input);
  } catch (error) {
    throw new LiveFuturePreviewError(
      "live_preview_body_simulator_failed",
      error instanceof Error ? error.message : "Body Simulator failed.",
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }
  diagnostics.bodySimulatorExecuted = true;
  if (!simulateResult.ok) {
    throw new LiveFuturePreviewError(
      "live_preview_body_simulator_failed",
      simulateResult.errors.map((e) => e.message).join("; ") || "Body Simulator validation failed.",
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }
  const rules = simulateResult.rules;
  const anat = rules.anatomicalTransformation;
  if (anat == null) {
    throw new LiveFuturePreviewError(
      "live_preview_anatomical_engine_failed",
      "Anatomical Transformation Engine produced no result.",
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }
  diagnostics.anatomicalEngineExecuted = true;
  diagnostics.appliedAnatomicalRuleIds = [...anat.appliedRuleIds];
  diagnostics.appliedFeatures = anat.rules.map((r) => r.feature);
  diagnostics.suppressedRuleIds = [...anat.suppressedRuleIds];
  diagnostics.semanticSupportTerms = [...anat.semanticSupportTerms];
  diagnostics.optionalNoteDisposition = noteDispositionFromAnatomical(rules);
  let canonical;
  try {
    canonical = adaptBodySimulatorRulesToFormatterInput(rules);
  } catch (error) {
    throw new LiveFuturePreviewError(
      "live_preview_formatter_translation_failed",
      error instanceof Error ? error.message : "Formatter adapter failed.",
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }
  const translation = assertAnatomicalRulesTranslated(rules, canonical);
  if (!translation.ok) {
    diagnostics.formatterConsumedAnatomicalRules = false;
    throw new LiveFuturePreviewError(
      "anatomical_rules_not_translated",
      "Canonical anatomical rules were not translated by the formatter adapter.",
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }
  diagnostics.formatterConsumedAnatomicalRules = translation.translatedCount > 0 || anat.rules.length === 0;
  diagnostics.anatomicalTranslatedChangeCount = translation.translatedCount;
  diagnostics.promptContainsAnatomicalIntent = translation.translatedCount > 0 || (canonical.anatomicalSummaries?.length ?? 0) > 0;
  const verification = verifyLivePreviewBeforeProvider(
    adapted,
    rules,
    canonical
  );
  if (!verification.ok) {
    throw new LiveFuturePreviewError(
      verification.errors.includes("anatomical_rules_not_translated") ? "anatomical_rules_not_translated" : "body_simulator_live_preview_verification_failed",
      `Live preview verification failed: ${verification.errors.join(", ")}`,
      { livePreviewTraceId, diagnostics, providerCalls: 0 }
    );
  }
  const traceStages = buildLiveFuturePreviewTraceStages(diagnostics, "pending");
  return {
    livePreviewTraceId,
    adapter: adapted,
    simulateResult,
    rules,
    canonical,
    diagnostics,
    traceStages
  };
}
function buildShellProfileAndGoal(prep) {
  const bf = prep.diagnostics.bodyFat;
  const profile = {
    schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
    sex: prep.adapter.input.profile.sexForPhysiology === "male" ? "male" : prep.adapter.input.profile.sexForPhysiology === "female" ? "female" : "unspecified",
    age: prep.adapter.input.profile.ageYears ?? 30,
    heightCm: prep.adapter.input.profile.heightCm ?? 170,
    weightKg: prep.adapter.input.profile.currentWeightKg ?? 70,
    bodyFatPct: bf.current ?? 22,
    trainingLevel: "intermediate",
    trainingAgeYears: 2,
    activityLevel: "moderate",
    nutritionQuality: "good"
  };
  const goal = {
    schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
    fatDirection: bf.delta != null && bf.delta > 0 ? "increase" : bf.delta != null && bf.delta < 0 ? "decrease" : "maintain",
    muscleDirection: "increase",
    ...bf.target != null ? { targetBodyFatPct: bf.target } : {},
    timelineWeeks: prep.diagnostics.timelineWeeks ?? 12,
    effortLevel: "high",
    focusZones: ["waist"],
    musclePriority: 0.5,
    fatLossPriority: 0.7,
    outcomes: ["fat_loss"]
  };
  return { profile, goal };
}
function buildTransportConfig(env) {
  const token = typeof env.REPLICATE_API_TOKEN === "string" && env.REPLICATE_API_TOKEN.trim() ? env.REPLICATE_API_TOKEN.trim() : null;
  return {
    enabled: token != null,
    apiToken: token,
    apiBaseUrl: DEFAULT_REPLICATE_API_BASE_URL,
    model: DEFAULT_REPLICATE_TRANSPORT_MODEL,
    createTimeoutMs: 6e4,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    totalTimeoutMs: Math.max(DEFAULT_TOTAL_TIMEOUT_MS, 12e4),
    maxPollAttempts: DEFAULT_MAX_POLL_ATTEMPTS
  };
}
async function runLiveFuturePreview(input) {
  const env = input.env ?? process.env;
  if (!isBodySimulatorLivePreviewEnabled(env) && input.dryRun !== true) {
    throw new LiveFuturePreviewError(
      "live_preview_adapter_failed",
      "Live Future preview flag is not enabled.",
      {
        livePreviewTraceId: createLivePreviewTraceId(Date.now()),
        status: 503,
        providerCalls: 0
      }
    );
  }
  const prep = prepareLiveFuturePreview(input.payload, {
    nowMs: input.nowMs,
    enabled: true
  });
  if (input.dryRun) {
    return {
      ok: true,
      imageUrl: null,
      livePreviewTraceId: prep.livePreviewTraceId,
      livePreviewDiagnostics: {
        ...prep.diagnostics,
        providerRequestAttempted: false,
        providerRequestCount: 0
      },
      liveFuturePreviewTrace: buildLiveFuturePreviewTraceStages(
        prep.diagnostics,
        "ok"
      ),
      bodySimulatorPreviewActive: true,
      attempt: "body-simulator-anatomical-live-preview-dry",
      usedFallback: false,
      model: null,
      disclaimer: "Realistic motivational visualization from Body Simulator anatomical rules \u2014 not a medical prediction or flattering ideal.",
      providerRequestCount: 0
    };
  }
  const { profile, goal } = buildShellProfileAndGoal(prep);
  let transportAdapter = input.transportAdapter;
  if (transportAdapter == null) {
    const config = buildTransportConfig(env);
    if (config.apiToken == null) {
      throw new LiveFuturePreviewError(
        "live_preview_provider_failed",
        "Provider is not configured.",
        {
          livePreviewTraceId: prep.livePreviewTraceId,
          diagnostics: prep.diagnostics,
          status: 503,
          providerCalls: 0
        }
      );
    }
    transportAdapter = new ReplicateTransportAdapter(
      config,
      input.transportDependencies
    );
  }
  prep.diagnostics.providerRequestAttempted = true;
  const runtime = new AiOsRuntime(
    createAiOsRuntimeDependencies({
      transportAdapter,
      now: () => input.nowMs ?? Date.now()
    })
  );
  let runtimeResult;
  try {
    runtimeResult = await runtime.run({
      mode: "transport_mock",
      profile,
      goal,
      canonicalBodyTransformation: prep.canonical,
      formatterOptions: {
        aspectRatio: "3:4",
        quality: "standard"
      },
      sourceImage: {
        kind: "data_uri",
        value: input.sourceImageDataUri,
        contentType: input.mimeType === "image/png" || input.mimeType === "image/webp" ? input.mimeType : "image/jpeg"
      }
    });
  } catch (error) {
    prep.diagnostics.providerRequestCount = 1;
    throw new LiveFuturePreviewError(
      "live_preview_provider_failed",
      error instanceof Error ? error.message : "Provider request failed.",
      {
        livePreviewTraceId: prep.livePreviewTraceId,
        diagnostics: prep.diagnostics,
        status: 502,
        providerCalls: 1
      }
    );
  }
  prep.diagnostics.providerRequestCount = 1;
  const transport = runtimeResult.artifacts.transportResult;
  if (!transport || transport.success !== true || !transport.imageUrl) {
    throw new LiveFuturePreviewError(
      "live_preview_provider_failed",
      "Provider request failed.",
      {
        livePreviewTraceId: prep.livePreviewTraceId,
        diagnostics: prep.diagnostics,
        status: 502,
        providerCalls: 1
      }
    );
  }
  const diagnostics = {
    ...prep.diagnostics,
    providerRequestAttempted: true,
    providerRequestCount: 1,
    promptContainsAnatomicalIntent: true
  };
  return {
    ok: true,
    imageUrl: transport.imageUrl,
    livePreviewTraceId: prep.livePreviewTraceId,
    livePreviewDiagnostics: diagnostics,
    liveFuturePreviewTrace: buildLiveFuturePreviewTraceStages(
      diagnostics,
      "ok"
    ),
    bodySimulatorPreviewActive: true,
    attempt: "body-simulator-anatomical-live-preview",
    usedFallback: false,
    model: transport.model ?? DEFAULT_REPLICATE_TRANSPORT_MODEL,
    disclaimer: "Realistic motivational visualization from Body Simulator anatomical rules \u2014 not a medical prediction or flattering ideal.",
    providerRequestCount: 1
  };
}
function sha256FileBytes(bytes) {
  return (0, import_node_crypto2.createHash)("sha256").update(bytes).digest("hex");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BODY_SIMULATOR_LIVE_PREVIEW_ENV,
  LiveFuturePreviewError,
  PUBLIC_FOCUS_ZONE_MAP,
  adaptPublicFutureToBodySimulator,
  assertAnatomicalRulesTranslated,
  buildLiveFuturePreviewTraceStages,
  isBodySimulatorLivePreviewEnabled,
  mapPublicBodyFat,
  mapPublicEffort,
  mapPublicFocusZones,
  mapPublicTimeline,
  prepareLiveFuturePreview,
  runLiveFuturePreview,
  sha256FileBytes
});
