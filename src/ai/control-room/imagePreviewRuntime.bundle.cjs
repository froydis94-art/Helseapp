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

// src/ai/control-room/ImagePreviewService.ts
var ImagePreviewService_exports = {};
__export(ImagePreviewService_exports, {
  ImagePreviewService: () => ImagePreviewService,
  ImagePreviewServiceError: () => ImagePreviewServiceError,
  buildProvisionalPreviewEvidence: () => buildProvisionalPreviewEvidence,
  getImagePreviewSafetyStatus: () => getImagePreviewSafetyStatus,
  mapTransportFailureToPreviewError: () => mapTransportFailureToPreviewError,
  validatePreviewSourceImage: () => validatePreviewSourceImage
});
module.exports = __toCommonJS(ImagePreviewService_exports);

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
  for (const section of PROMPT_SECTIONS) {
    if (!prompt.includes(section)) {
      errors.push(`prompt missing section ${section}`);
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
function buildNegativePrompt(plan) {
  return uniqueStable(plan.exclusions).join(", ");
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
    const prompt = [
      buildSourceSection(renderPlan),
      buildIdentitySection(renderPlan),
      buildSceneSection(renderPlan),
      buildTransformSection(renderPlan),
      buildAnatomySection(renderPlan),
      buildRealismSection(renderPlan, presentationStyle)
    ].join("\n\n");
    const negativePrompt = buildNegativePrompt(renderPlan);
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
      const renderPlan = buildRenderPlan(plan, direction);
      versions.renderPlanRulesVersion = renderPlan.rulesVersion ?? RENDER_PLAN_RULES_VERSION;
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
var DEFAULT_MAX_POLL_ATTEMPTS = 60;
function isValidReplicateTransportModel(value) {
  const raw = String(value || "").trim();
  if (!raw || raw !== value) return false;
  if (/\s/.test(raw)) return false;
  if (/^r8_/i.test(raw)) return false;
  if (/^[a-f0-9]{64}$/i.test(raw)) return false;
  if (/[:?#@\\]/.test(raw)) return false;
  if (raw.includes("..")) return false;
  if (/^https?:\/\//i.test(raw)) return false;
  if (!/^[^/\s]+\/[^/\s]+$/.test(raw)) return false;
  return true;
}

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

// src/ai/control-room/ControlRoomFixtures.ts
var SCENARIOS = [
  {
    summary: {
      id: "balanced_recomposition_12w",
      title: "Balanced recomposition (12 weeks)",
      description: "A moderate, balanced body-recomposition scenario with gradual fat reduction and modest muscle development.",
      timelineWeeks: 12,
      focusZones: ["waist", "shoulders"],
      direction: "recomposition"
    },
    runtimeInput: {
      mode: "dry_run",
      profile: {
        schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
        sex: "female",
        age: 32,
        heightCm: 168,
        weightKg: 70,
        bodyFatPct: 29,
        trainingLevel: "intermediate",
        trainingAgeYears: 2,
        activityLevel: "moderate",
        nutritionQuality: "good"
      },
      goal: {
        schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
        fatDirection: "decrease",
        muscleDirection: "increase",
        targetBodyFatPct: 25,
        targetWeightKg: 66,
        timelineWeeks: 12,
        effortLevel: "moderate",
        focusZones: ["waist", "shoulders"],
        musclePriority: 0.45,
        fatLossPriority: 0.65,
        outcomes: ["recomp"]
      },
      formatterOptions: {
        aspectRatio: "3:4",
        seed: 101,
        quality: "standard"
      }
    }
  },
  {
    summary: {
      id: "upper_body_definition_8w",
      title: "Upper-body definition (8 weeks)",
      description: "A conservative upper-body definition scenario emphasizing shoulders and back without extreme targets.",
      timelineWeeks: 8,
      focusZones: ["shoulders", "back", "arms"],
      direction: "upper_body_definition"
    },
    runtimeInput: {
      mode: "dry_run",
      profile: {
        schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
        sex: "male",
        age: 29,
        heightCm: 180,
        weightKg: 82,
        bodyFatPct: 22,
        trainingLevel: "intermediate",
        trainingAgeYears: 4,
        activityLevel: "active",
        nutritionQuality: "good"
      },
      goal: {
        schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
        fatDirection: "decrease",
        muscleDirection: "increase",
        targetBodyFatPct: 18,
        targetWeightKg: 79,
        timelineWeeks: 8,
        effortLevel: "moderate",
        focusZones: ["shoulders", "back", "arms"],
        musclePriority: 0.7,
        fatLossPriority: 0.5,
        outcomes: ["toned", "vshape"]
      },
      formatterOptions: {
        aspectRatio: "3:4",
        seed: 202,
        quality: "standard",
        styleOverride: "natural_athletic"
      }
    }
  },
  {
    summary: {
      id: "gradual_fat_loss_16w",
      title: "Gradual fat loss (16 weeks)",
      description: "A gradual and physiologically conservative fat-loss scenario with light muscle maintenance.",
      timelineWeeks: 16,
      focusZones: ["waist", "core"],
      direction: "fat_loss"
    },
    runtimeInput: {
      mode: "dry_run",
      profile: {
        schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
        sex: "female",
        age: 41,
        heightCm: 165,
        weightKg: 78,
        bodyFatPct: 34,
        trainingLevel: "beginner",
        trainingAgeYears: 1,
        activityLevel: "light",
        nutritionQuality: "fair"
      },
      goal: {
        schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
        fatDirection: "decrease",
        muscleDirection: "maintain",
        targetBodyFatPct: 28,
        targetWeightKg: 72,
        timelineWeeks: 16,
        effortLevel: "moderate",
        focusZones: ["waist", "core"],
        musclePriority: 0.25,
        fatLossPriority: 0.8,
        outcomes: ["fat_loss"]
      },
      formatterOptions: {
        aspectRatio: "3:4",
        seed: 303,
        quality: "standard",
        styleOverride: "source_faithful"
      }
    }
  },
  {
    summary: {
      id: "athletic_strength_24w",
      title: "Athletic strength (24 weeks)",
      description: "A longer athletic-strength scenario focused on shoulders, legs, and back without extreme muscle growth.",
      timelineWeeks: 24,
      focusZones: ["shoulders", "legs", "back"],
      direction: "athletic_strength"
    },
    runtimeInput: {
      mode: "dry_run",
      profile: {
        schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
        sex: "male",
        age: 35,
        heightCm: 175,
        weightKg: 76,
        bodyFatPct: 18,
        trainingLevel: "advanced",
        trainingAgeYears: 8,
        activityLevel: "very_active",
        nutritionQuality: "excellent"
      },
      goal: {
        schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
        fatDirection: "maintain",
        muscleDirection: "increase",
        targetBodyFatPct: 16,
        targetWeightKg: 78,
        timelineWeeks: 24,
        effortLevel: "high",
        focusZones: ["shoulders", "legs", "back"],
        musclePriority: 0.75,
        fatLossPriority: 0.3,
        outcomes: ["stronger", "athletic_performance"]
      },
      formatterOptions: {
        aspectRatio: "3:4",
        seed: 404,
        quality: "high",
        styleOverride: "documentary_fitness"
      }
    }
  }
];
var SCENARIO_IDS = SCENARIOS.map(
  (s) => s.summary.id
);
function cloneScenario(record) {
  return {
    summary: structuredClone(record.summary),
    runtimeInput: structuredClone(record.runtimeInput)
  };
}
function getControlRoomScenario(id) {
  const record = SCENARIOS.find((entry) => entry.summary.id === id);
  if (!record) return null;
  return cloneScenario(record);
}

// src/ai/control-room/ImagePreviewTypes.ts
var IMAGE_PREVIEW_SCHEMA_VERSION = 1;
var IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR = "Image preview projection contained forbidden content.";
var IMAGE_PREVIEW_SAFETY_STATUS = {
  internalOnly: true,
  explicitBillingConfirmation: true,
  requestCapApplied: true,
  sourceImagePersisted: false,
  generatedImagePersistedByHelseApp: false,
  legacyProductionChanged: false,
  publicCutoverEnabled: false
};
var IMAGE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
var IMAGE_PREVIEW_ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

// src/ai/control-room/ImagePreviewProjection.ts
var STAGE_LABELS = {
  input_validation: "Input validation",
  transformation: "Transformation",
  visual_direction: "Visual direction",
  render_plan: "Render plan",
  render_plan_validation: "Render plan validation",
  provider_formatting: "Provider formatting",
  formatted_request_validation: "Formatted request validation",
  transport: "Transport",
  awaiting_validation: "Awaiting validation",
  result_validation: "Result validation",
  retry_orchestration: "Retry orchestration",
  completed: "Completed"
};
var FORBIDDEN_STRING_PATTERNS = [
  /data:image\//i,
  /\bAuthorization\b/i,
  /\bBearer\b/i,
  /REPLICATE_API_TOKEN/i,
  /\br8_[A-Za-z0-9]+/i,
  /\bsk-[A-Za-z0-9]+/i,
  /AI_OS_CONTROL_ROOM_ACCESS_KEY/i,
  /AI_OS_IMAGE_PREVIEW_/i,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\bat\s+\S+\s+\([^)]+\.\w+:\d+:\d+\)/i,
  /[A-Za-z]:\\[^\s]+/,
  /\/home\/[^\s]+/,
  /\/Users\/[^\s]+/
];
var FORBIDDEN_KEYS = /* @__PURE__ */ new Set([
  "sourceimage",
  "transportresult",
  "validationevidence",
  "retrydecision",
  "retrystate",
  "healthpayload",
  "heartrate",
  "hrv",
  "sleepscore",
  "terrauserid",
  "wearable",
  "accesskey",
  "access_key",
  "authorization",
  "replicate_api_token",
  "apikey",
  "api_key",
  "apitoken"
]);
var ImagePreviewProjectionError = class extends Error {
  constructor(message, code = "runtime_failure") {
    super(message);
    this.name = "ImagePreviewProjectionError";
    this.code = code;
  }
};
function isAllowedHttpsImageUrl(url) {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  if (url.startsWith("http://")) return false;
  if (/data:image\//i.test(url)) return false;
  if (/[?#]/.test(url) && /token|auth|key|bearer/i.test(url)) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.hash) return false;
    if (u.hostname === "api.replicate.com" && u.pathname.startsWith("/v1/predictions/")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
function projectStages(runtimeResult) {
  return runtimeResult.trace.stages.map((stage) => ({
    stage: stage.stage,
    label: STAGE_LABELS[stage.stage] ?? stage.stage,
    success: stage.success,
    durationMs: Math.max(0, stage.durationMs),
    warningsCount: stage.warnings.length,
    errorsCount: stage.errors.length
  }));
}
function projectVersions(runtimeResult) {
  const source = runtimeResult.trace.versions;
  return {
    runtimeRulesVersion: runtimeResult.trace.rulesVersion ?? null,
    transformationRulesVersion: source.transformationRulesVersion ?? null,
    visualDirectionRulesVersion: source.visualDirectionRulesVersion ?? null,
    renderPlanRulesVersion: source.renderPlanRulesVersion ?? null,
    formatterName: source.formatterName ?? null,
    formatterVersion: source.formatterVersion ?? null,
    transportAdapterId: source.transportAdapterId ?? null,
    resultValidatorRulesVersion: source.resultValidatorRulesVersion ?? null,
    retryOrchestratorRulesVersion: source.retryOrchestratorRulesVersion ?? null
  };
}
function projectValidation(decision) {
  if (decision == null) return null;
  const findings = decision.findings ?? [];
  const rejectionReasons = findings.filter((f) => f.severity === "critical").map((f) => f.message).filter((m) => typeof m === "string" && m.length > 0).slice(0, 12);
  const warnings = findings.filter((f) => f.severity === "warning" || f.severity === "info").map((f) => f.message).filter((m) => typeof m === "string" && m.length > 0).slice(0, 20);
  return {
    accepted: decision.outcome === "accept",
    decision: decision.outcome,
    warnings,
    rejectionReasons
  };
}
function projectProvider(transport, model) {
  if (transport == null) return null;
  if (transport.success) {
    return {
      providerFamily: "flux",
      model: transport.model || model,
      predictionId: transport.predictionId,
      status: transport.status,
      durationMs: Math.max(0, transport.generationTimeMs)
    };
  }
  return {
    providerFamily: "flux",
    model: transport.model || model,
    ...transport.predictionId ? { predictionId: transport.predictionId } : {},
    status: transport.status ?? "failed",
    durationMs: Math.max(0, transport.generationTimeMs)
  };
}
function projectImagePreviewResult(input) {
  const { runtimeResult } = input;
  const transport = runtimeResult.artifacts.transportResult;
  const formatted = runtimeResult.artifacts.formattedRequest;
  let generatedUrl = null;
  if (transport?.success && typeof transport.imageUrl === "string") {
    if (!isAllowedHttpsImageUrl(transport.imageUrl)) {
      throw new ImagePreviewProjectionError(
        "Generated image URL failed safety checks.",
        "unsafe_result"
      );
    }
    generatedUrl = transport.imageUrl;
  }
  const validation = input.validationDecision !== void 0 ? projectValidation(input.validationDecision) : projectValidation(runtimeResult.artifacts.validationDecision);
  const warnings = [
    ...runtimeResult.warnings,
    ...input.extraWarnings ?? []
  ].slice(0, 40);
  let artifacts = null;
  if (runtimeResult.artifacts.transformationPlan != null && runtimeResult.artifacts.visualDirection != null && runtimeResult.artifacts.renderPlan != null && formatted != null) {
    artifacts = {
      transformationPlan: structuredClone(runtimeResult.artifacts.transformationPlan),
      visualDirection: structuredClone(runtimeResult.artifacts.visualDirection),
      renderPlan: structuredClone(runtimeResult.artifacts.renderPlan),
      formattedRequestSummary: {
        formatterName: formatted.metadata.formatterName,
        formatterVersion: formatted.metadata.formatterVersion,
        providerFamily: formatted.providerFamily,
        model: input.model,
        ...formatted.aspectRatio !== void 0 ? { aspectRatio: formatted.aspectRatio } : {},
        positivePrompt: formatted.prompt,
        negativePrompt: formatted.negativePrompt ?? ""
      }
    };
  }
  const success = runtimeResult.success === true && generatedUrl != null && (validation == null || validation.accepted === true);
  return {
    schemaVersion: IMAGE_PREVIEW_SCHEMA_VERSION,
    success,
    scenarioId: input.scenarioId,
    requestId: input.requestId,
    source: {
      mimeType: input.sourceMimeType,
      byteLength: input.sourceByteLength
    },
    generatedImage: generatedUrl != null ? { url: generatedUrl, expiresOrIsTemporary: true } : null,
    runtime: {
      mode: runtimeResult.mode,
      terminalOutcome: runtimeResult.terminalOutcome,
      traceId: runtimeResult.trace.traceId,
      stages: projectStages(runtimeResult),
      versions: projectVersions(runtimeResult)
    },
    artifacts,
    provider: projectProvider(transport, input.model),
    validation,
    safety: { ...IMAGE_PREVIEW_SAFETY_STATUS },
    warnings,
    errors: [...runtimeResult.errors].slice(0, 20)
  };
}
function walkForbidden(value, path, allowGeneratedUrlPath) {
  if (value == null) return null;
  if (typeof value === "string") {
    const joined = path.join(".");
    if (allowGeneratedUrlPath && joined === "generatedImage.url" && isAllowedHttpsImageUrl(value)) {
      return null;
    }
    if (/^https?:\/\//i.test(value) && joined !== "generatedImage.url") {
      return `Forbidden URL at ${joined || "(root)"}`;
    }
    for (const pattern of FORBIDDEN_STRING_PATTERNS) {
      if (pattern.test(value)) {
        return `Forbidden content at ${joined || "(root)"}`;
      }
    }
    if (value.length > 512 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 80))) {
      return `Forbidden binary-like content at ${joined || "(root)"}`;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = walkForbidden(value[i], [...path, String(i)], allowGeneratedUrlPath);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (FORBIDDEN_KEYS.has(normalized)) {
      return `Forbidden key ${key}`;
    }
    const hit = walkForbidden(child, [...path, key], allowGeneratedUrlPath);
    if (hit) return hit;
  }
  return null;
}
function validateImagePreviewProjection(result) {
  const errors = [];
  if (result.schemaVersion !== IMAGE_PREVIEW_SCHEMA_VERSION) {
    errors.push("Invalid schema version.");
  }
  const safety = result.safety;
  if (safety == null || safety.internalOnly !== true || safety.explicitBillingConfirmation !== true || safety.requestCapApplied !== true || safety.sourceImagePersisted !== false || safety.generatedImagePersistedByHelseApp !== false || safety.legacyProductionChanged !== false || safety.publicCutoverEnabled !== false) {
    errors.push("Safety invariants are not exact.");
  }
  if (result.generatedImage != null) {
    if (result.generatedImage.expiresOrIsTemporary !== true) {
      errors.push("Generated image must be marked temporary.");
    }
    if (!isAllowedHttpsImageUrl(result.generatedImage.url)) {
      errors.push("Generated image URL is not an allowed HTTPS URL.");
    }
  }
  const forbidden = walkForbidden(result, [], true);
  if (forbidden) {
    errors.push(forbidden);
  }
  try {
    JSON.stringify(result);
  } catch {
    errors.push("Projection is not JSON serializable.");
  }
  return { valid: errors.length === 0, errors };
}
function sanitizeImagePreviewProjection(result) {
  const clone = structuredClone(result);
  const check = validateImagePreviewProjection(clone);
  if (check.valid) {
    return clone;
  }
  return {
    schemaVersion: IMAGE_PREVIEW_SCHEMA_VERSION,
    success: false,
    scenarioId: clone.scenarioId,
    requestId: clone.requestId,
    source: {
      mimeType: clone.source.mimeType,
      byteLength: clone.source.byteLength
    },
    generatedImage: null,
    runtime: {
      mode: clone.runtime.mode,
      terminalOutcome: "invalid_runtime_state",
      traceId: clone.runtime.traceId,
      stages: [],
      versions: {}
    },
    artifacts: null,
    provider: null,
    validation: null,
    safety: { ...IMAGE_PREVIEW_SAFETY_STATUS },
    warnings: [],
    errors: [IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR]
  };
}

// src/ai/control-room/ImagePreviewService.ts
var PREVIEW_CREATE_TIMEOUT_MS = 6e4;
var PREVIEW_TOTAL_TIMEOUT_MS = 12e4;
var ImagePreviewServiceError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ImagePreviewServiceError";
    this.code = code;
  }
};
var DATA_URI_RE = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i;
function normalizeMime(raw) {
  const lower = raw.toLowerCase();
  if (lower === "image/jpg" || lower === "image/jpeg") return "image/jpeg";
  if (lower === "image/png") return "image/png";
  if (lower === "image/webp") return "image/webp";
  return null;
}
function detectMimeFromMagic(bytes) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) {
    return "image/webp";
  }
  return null;
}
function validatePreviewSourceImage(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Source image is required."
    );
  }
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Remote image URLs are not accepted."
    );
  }
  if (/image\/svg/i.test(value.slice(0, 80))) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "SVG images are not accepted."
    );
  }
  if (/image\/gif/i.test(value.slice(0, 80))) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "GIF images are not accepted."
    );
  }
  if (/image\/heic|image\/heif|application\/pdf|video\//i.test(value.slice(0, 80))) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Unsupported image type."
    );
  }
  const match = DATA_URI_RE.exec(value);
  if (!match) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Malformed image data URI."
    );
  }
  const declaredMime = normalizeMime(match[1]);
  if (declaredMime == null || !IMAGE_PREVIEW_ACCEPTED_MIME.includes(declaredMime)) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Unsupported image MIME type."
    );
  }
  const b64 = match[2].replace(/\s+/g, "");
  if (!b64) {
    throw new ImagePreviewServiceError("invalid_image", "Empty image.");
  }
  let bytes;
  try {
    bytes = Buffer.from(b64, "base64");
  } catch {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Malformed Base64 image data."
    );
  }
  if (bytes.length === 0) {
    throw new ImagePreviewServiceError("invalid_image", "Empty image.");
  }
  const reencoded = bytes.toString("base64").replace(/=+$/, "");
  const normalizedInput = b64.replace(/=+$/, "");
  if (reencoded.length < Math.min(16, normalizedInput.length) * 0.5) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Malformed Base64 image data."
    );
  }
  if (bytes.length > IMAGE_PREVIEW_MAX_BYTES) {
    throw new ImagePreviewServiceError(
      "image_too_large",
      "Image exceeds the 5 MB limit."
    );
  }
  const magicMime = detectMimeFromMagic(bytes);
  if (magicMime == null) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Unrecognized image bytes."
    );
  }
  if (magicMime !== declaredMime) {
    throw new ImagePreviewServiceError(
      "invalid_image",
      "Image MIME type does not match file contents."
    );
  }
  const canonicalUri = `data:${declaredMime};base64,${b64}`;
  return {
    dataUri: canonicalUri,
    mimeType: declaredMime,
    byteLength: bytes.length
  };
}
function assertBillingConfirmed(value) {
  if (value !== true) {
    throw new ImagePreviewServiceError(
      "billing_confirmation_required",
      "Explicit billing confirmation is required."
    );
  }
}
function resolvePreviewModel(env) {
  const raw = env.AI_OS_IMAGE_PREVIEW_MODEL;
  if (typeof raw === "string" && raw.length > 0 && isValidReplicateTransportModel(raw)) {
    return raw;
  }
  return DEFAULT_REPLICATE_TRANSPORT_MODEL;
}
function buildPreviewTransportConfig(env, model) {
  const tokenRaw = env.REPLICATE_API_TOKEN;
  const apiToken = typeof tokenRaw === "string" && tokenRaw.trim().length > 0 ? tokenRaw.trim() : null;
  return {
    enabled: true,
    apiToken,
    apiBaseUrl: DEFAULT_REPLICATE_API_BASE_URL,
    model,
    createTimeoutMs: PREVIEW_CREATE_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    totalTimeoutMs: PREVIEW_TOTAL_TIMEOUT_MS,
    maxPollAttempts: DEFAULT_MAX_POLL_ATTEMPTS
  };
}
function isProviderSafetyMessage(message) {
  return /sensitive|E005|flagged|nsfw|safety/i.test(message);
}
function mapTransportFailureToPreviewError(transport) {
  switch (transport.error.code) {
    case "missing_token":
    case "adapter_disabled":
      return new ImagePreviewServiceError(
        "missing_token",
        "Provider is not configured."
      );
    case "invalid_request":
    case "unsupported_source_image":
    case "provider_validation_error":
      return new ImagePreviewServiceError(
        "provider_invalid_input",
        "Provider rejected the request input."
      );
    case "provider_auth_error":
      return new ImagePreviewServiceError(
        "provider_auth_error",
        "Provider authentication failed."
      );
    case "request_timeout":
    case "polling_exhausted":
      return new ImagePreviewServiceError(
        "provider_timeout",
        "Provider request timed out."
      );
    case "provider_rate_limited":
    case "provider_unavailable":
      return new ImagePreviewServiceError(
        "provider_http_error",
        "Provider HTTP request failed."
      );
    case "provider_failed":
      if (isProviderSafetyMessage(transport.error.message)) {
        return new ImagePreviewServiceError(
          "provider_safety_blocked",
          "Provider safety filter blocked the request."
        );
      }
      return new ImagePreviewServiceError(
        "provider_failure",
        "Provider request failed."
      );
    case "invalid_provider_response":
      return new ImagePreviewServiceError(
        "provider_invalid_response",
        "Provider returned an unusable response."
      );
    case "unknown_transport_error":
      return new ImagePreviewServiceError(
        "provider_network_error",
        "Provider network request failed."
      );
    case "request_aborted":
    default:
      return new ImagePreviewServiceError(
        "provider_failure",
        "Provider request failed."
      );
  }
}
function isTransportFailure(transport) {
  return !transport.success;
}
function buildProvisionalPreviewEvidence(predictionId, model) {
  const dims = [
    "identity",
    "anatomy",
    "plan_adherence",
    "photorealism",
    "pose_camera",
    "safety"
  ];
  return {
    schemaVersion: VALIDATION_EVIDENCE_SCHEMA_VERSION,
    candidate: {
      candidateId: predictionId,
      provider: "replicate",
      model
    },
    dimensions: dims.map((dimension) => ({
      dimension,
      score: dimension === "safety" ? 0.99 : 0.9,
      confidence: "medium",
      source: "deterministic_fixture",
      findings: [
        "Preview laboratory provisional evidence \u2014 real vision analysis deferred."
      ],
      warnings: []
    })),
    metadata: {
      validatorInputVersion: "1.0",
      transformationRulesVersion: "1.0",
      renderPlanRulesVersion: "1.0"
    }
  };
}
function createRequestId(now) {
  const ts = now().toString(36);
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `imgprev-${ts}-${rand}`;
}
var ImagePreviewService = class {
  constructor(deps = {}) {
    this.deps = deps;
  }
  async runPreview(input) {
    assertBillingConfirmed(input.billingConfirmed);
    const scenarioId = input.scenarioId;
    if (typeof scenarioId !== "string") {
      throw new ImagePreviewServiceError(
        "invalid_request",
        "Invalid request."
      );
    }
    const resolved = getControlRoomScenario(
      scenarioId
    );
    if (!resolved) {
      throw new ImagePreviewServiceError(
        "scenario_not_found",
        "Scenario was not found."
      );
    }
    const source = validatePreviewSourceImage(input.sourceImageDataUri);
    const env = this.deps.env ?? process.env;
    const model = resolvePreviewModel(env);
    const now = this.deps.now ?? (() => Date.now());
    const requestId = typeof input.requestId === "string" && input.requestId.trim() ? input.requestId.trim() : createRequestId(now);
    let transportAdapter = this.deps.transportAdapter;
    if (transportAdapter == null) {
      const config = buildPreviewTransportConfig(env, model);
      if (config.apiToken == null) {
        throw new ImagePreviewServiceError(
          "missing_token",
          "Provider is not configured."
        );
      }
      transportAdapter = new ReplicateTransportAdapter(
        config,
        this.deps.transportDependencies
      );
    }
    const runtime = new AiOsRuntime(
      createAiOsRuntimeDependencies({
        transportAdapter,
        now
      })
    );
    const runtimeInput = {
      mode: "transport_mock",
      profile: resolved.runtimeInput.profile,
      goal: resolved.runtimeInput.goal,
      ...resolved.runtimeInput.formatterOptions !== void 0 ? { formatterOptions: resolved.runtimeInput.formatterOptions } : {},
      sourceImage: {
        kind: "data_uri",
        value: source.dataUri,
        contentType: source.mimeType
      }
    };
    let runtimeResult;
    try {
      runtimeResult = await runtime.run(runtimeInput);
    } catch {
      throw new ImagePreviewServiceError(
        "runtime_failure",
        "AI OS preview runtime failed."
      );
    }
    const transport = runtimeResult.artifacts.transportResult;
    if (!transport) {
      throw new ImagePreviewServiceError(
        "provider_failure",
        "Provider request failed."
      );
    }
    if (isTransportFailure(transport)) {
      throw mapTransportFailureToPreviewError(transport);
    }
    const evidenceBuilder = this.deps.buildValidationEvidence ?? buildProvisionalPreviewEvidence;
    const evidence2 = evidenceBuilder(transport.predictionId, model);
    const evaluate = this.deps.evaluateCandidateFn ?? evaluateCandidate;
    let validationDecision;
    try {
      validationDecision = evaluate({
        evidence: evidence2,
        renderPlan: runtimeResult.artifacts.renderPlan,
        attempt: 1,
        maxAttempts: 1
      });
    } catch {
      throw new ImagePreviewServiceError(
        "runtime_failure",
        "Result validation failed."
      );
    }
    runtimeResult = {
      ...runtimeResult,
      artifacts: {
        ...runtimeResult.artifacts,
        validationDecision
      },
      trace: {
        ...runtimeResult.trace,
        versions: {
          ...runtimeResult.trace.versions,
          resultValidatorRulesVersion: RESULT_VALIDATOR_RULES_VERSION
        },
        stages: [
          ...runtimeResult.trace.stages,
          {
            stage: "result_validation",
            success: true,
            durationMs: 0,
            warnings: [],
            errors: []
          }
        ]
      }
    };
    if (validationDecision.outcome !== "accept") {
      throw new ImagePreviewServiceError(
        "validation_rejected",
        "Validation rejected the candidate."
      );
    }
    let projected;
    try {
      projected = projectImagePreviewResult({
        scenarioId: resolved.summary.id,
        requestId,
        sourceMimeType: source.mimeType,
        sourceByteLength: source.byteLength,
        runtimeResult,
        validationDecision,
        model,
        extraWarnings: [
          "Preview laboratory: ResultValidator used provisional evidence; real vision analysis is deferred to Demand 018.",
          "No automatic retry was performed."
        ]
      });
    } catch (error) {
      if (error instanceof ImagePreviewProjectionError) {
        throw new ImagePreviewServiceError(error.code, error.message);
      }
      throw new ImagePreviewServiceError(
        "runtime_failure",
        "Preview projection failed."
      );
    }
    const sanitized = sanitizeImagePreviewProjection(projected);
    const validation = validateImagePreviewProjection(sanitized);
    if (!validation.valid || !sanitized.success || sanitized.artifacts == null) {
      throw new ImagePreviewServiceError(
        "unsafe_result",
        IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR
      );
    }
    const safety = sanitized.safety;
    if (safety.internalOnly !== true || safety.explicitBillingConfirmation !== true || safety.requestCapApplied !== true || safety.sourceImagePersisted !== false || safety.generatedImagePersistedByHelseApp !== false || safety.legacyProductionChanged !== false || safety.publicCutoverEnabled !== false) {
      throw new ImagePreviewServiceError(
        "unsafe_result",
        IMAGE_PREVIEW_FORBIDDEN_CONTENT_ERROR
      );
    }
    return sanitized;
  }
};
function getImagePreviewSafetyStatus() {
  return { ...IMAGE_PREVIEW_SAFETY_STATUS };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ImagePreviewService,
  ImagePreviewServiceError,
  buildProvisionalPreviewEvidence,
  getImagePreviewSafetyStatus,
  mapTransportFailureToPreviewError,
  validatePreviewSourceImage
});
