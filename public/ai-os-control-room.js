(function () {
  "use strict";

  var API_PATH = "/api/ai-os-control-room";
  var PREVIEW_API_PATH = "/api/ai-os-image-preview";
  var ACCESS_HEADER = "X-AI-OS-Control-Room-Key";
  var EXPECTED_SERVICE = "ai-os-control-room";
  var EXPECTED_API_VERSION = "1.1";
  var EXPECTED_PREVIEW_SERVICE = "ai-os-image-preview";
  var EXPECTED_PREVIEW_API_VERSION = "1.0";
  var UNAUTH_STREAK_LIMIT = 2;
  var PREVIEW_MAX_LONG_EDGE = 1600;
  var PREVIEW_JPEG_QUALITY = 0.85;

  var accessKey = null;
  var unauthorizedStreak = 0;
  var selectedScenarioId = null;
  var scenarios = [];
  var currentResult = null;
  var requestInFlight = false;
  var previewInFlight = false;
  var previewSourceDataUri = null;
  var previewSourceMeta = null;
  var previewObjectUrl = null;

  var accessStatus = document.getElementById("accessStatus");
  var accessKeyInput = document.getElementById("accessKeyInput");
  var unlockForm = document.getElementById("unlockForm");
  var unlockButton = document.getElementById("unlockButton");
  var lockButton = document.getElementById("lockButton");
  var accessMessage = document.getElementById("accessMessage");
  var scenarioPanel = document.getElementById("scenarioPanel");
  var scenarioList = document.getElementById("scenarioList");
  var runButton = document.getElementById("runButton");
  var runMessage = document.getElementById("runMessage");
  var resultPanel = document.getElementById("resultPanel");
  var stageList = document.getElementById("stageList");
  var transformationPlanView = document.getElementById("transformationPlanView");
  var visualDirectionView = document.getElementById("visualDirectionView");
  var renderPlanHighlights = document.getElementById("renderPlanHighlights");
  var renderPlanView = document.getElementById("renderPlanView");
  var formatterMeta = document.getElementById("formatterMeta");
  var promptDetails = document.getElementById("promptDetails");
  var positivePromptView = document.getElementById("positivePromptView");
  var negativePromptView = document.getElementById("negativePromptView");
  var versionMatrix = document.getElementById("versionMatrix");
  var rawProjectionView = document.getElementById("rawProjectionView");
  var previewPanel = document.getElementById("previewPanel");
  var previewFileInput = document.getElementById("previewFileInput");
  var previewImageMeta = document.getElementById("previewImageMeta");
  var previewCompare = document.getElementById("previewCompare");
  var previewSourceImg = document.getElementById("previewSourceImg");
  var previewGeneratedImg = document.getElementById("previewGeneratedImg");
  var previewGeneratedPlaceholder = document.getElementById(
    "previewGeneratedPlaceholder"
  );
  var previewGeneratedLinkWrap = document.getElementById(
    "previewGeneratedLinkWrap"
  );
  var previewGeneratedLink = document.getElementById("previewGeneratedLink");
  var previewAdultCheckbox = document.getElementById("previewAdultCheckbox");
  var previewConsentCheckbox = document.getElementById(
    "previewConsentCheckbox"
  );
  var previewBillingCheckbox = document.getElementById(
    "previewBillingCheckbox"
  );
  var previewGenerateButton = document.getElementById("previewGenerateButton");
  var previewMessage = document.getElementById("previewMessage");
  var previewResultPanel = document.getElementById("previewResultPanel");
  var previewProviderSummary = document.getElementById(
    "previewProviderSummary"
  );
  var previewValidationSummary = document.getElementById(
    "previewValidationSummary"
  );
  var previewStageList = document.getElementById("previewStageList");
  var previewSafetyList = document.getElementById("previewSafetyList");
  var previewPositivePrompt = document.getElementById("previewPositivePrompt");
  var previewNegativePrompt = document.getElementById("previewNegativePrompt");
  var previewRawProjection = document.getElementById("previewRawProjection");
  var previewPromptDetails = document.getElementById("previewPromptDetails");
  var promptIsolationGenerateButton = document.getElementById(
    "promptIsolationGenerateButton"
  );
  var promptIsolationMessage = document.getElementById(
    "promptIsolationMessage"
  );
  var promptIsolationResultSummary = document.getElementById(
    "promptIsolationResultSummary"
  );
  var promptExperimentHistoryList = document.getElementById(
    "promptExperimentHistoryList"
  );
  var promptExperimentClearButton = document.getElementById(
    "promptExperimentClearButton"
  );
  var promptExperimentExportButton = document.getElementById(
    "promptExperimentExportButton"
  );
  var promptExperimentHistoryMessage = document.getElementById(
    "promptExperimentHistoryMessage"
  );
  var promptExperimentComparisonA = document.getElementById(
    "promptExperimentComparisonA"
  );
  var promptExperimentComparisonB = document.getElementById(
    "promptExperimentComparisonB"
  );
  var promptExperimentCompareFields = document.getElementById(
    "promptExperimentCompareFields"
  );
  var promptExperimentPositiveA = document.getElementById(
    "promptExperimentPositiveA"
  );
  var promptExperimentPositiveB = document.getElementById(
    "promptExperimentPositiveB"
  );
  var promptExperimentNegativeA = document.getElementById(
    "promptExperimentNegativeA"
  );
  var promptExperimentNegativeB = document.getElementById(
    "promptExperimentNegativeB"
  );
  var promptExperimentOnlyA = document.getElementById("promptExperimentOnlyA");
  var promptExperimentOnlyB = document.getElementById("promptExperimentOnlyB");
  var promptExperimentCommonLines = document.getElementById(
    "promptExperimentCommonLines"
  );
  var promptExperimentInterpretationText = document.getElementById(
    "promptExperimentInterpretationText"
  );
  var promptExperimentViewPositive = document.getElementById(
    "promptExperimentViewPositive"
  );
  var promptExperimentViewNegative = document.getElementById(
    "promptExperimentViewNegative"
  );
  var promptExperimentViewPromptsDetails = document.getElementById(
    "promptExperimentViewPromptsDetails"
  );
  var transformationRuleFields = document.getElementById(
    "transformationRuleFields"
  );
  var transformationRuleJsonView = document.getElementById(
    "transformationRuleJsonView"
  );
  var transformationFormatterMeta = document.getElementById(
    "transformationFormatterMeta"
  );
  var transformationRuleDiffSummary = document.getElementById(
    "transformationRuleDiffSummary"
  );
  var transformationRuleDiffList = document.getElementById(
    "transformationRuleDiffList"
  );
  var ALLOWED_PROMPT_ISOLATION_VARIANTS = {
    minimal: true,
    current_ai_os: true,
    current_without_preview_context: true,
    pre_017c_baseline: true,
  };
  /** Session-only Prompt Isolation Lab history (Demand 018D/018E). Max 20 FIFO. */
  var PROMPT_EXPERIMENT_HISTORY_MAX = 20;
  var TRANSFORM_RULE_FIELD_KEYS = [
    "identity",
    "pose",
    "camera",
    "background",
    "lighting",
    "clothing",
    "bodyFatChange",
    "muscleChange",
    "weightGoal",
    "timeline",
    "photographicRealism",
    "priorityOrder",
    "scenario",
    "bodyRegionEmphasis",
  ];
  var TRANSFORM_RULE_FIELD_LABELS = {
    identity: "Identity",
    pose: "Pose",
    camera: "Camera",
    background: "Background",
    lighting: "Lighting",
    clothing: "Clothing",
    bodyFatChange: "Body Fat Change",
    muscleChange: "Muscle Change",
    weightGoal: "Weight Goal",
    timeline: "Timeline",
    photographicRealism: "Photographic Realism",
    priorityOrder: "Priority Order",
    scenario: "Scenario",
    bodyRegionEmphasis: "Body Region Emphasis",
  };
  var TRANSFORM_RULE_PIPELINE_STAGES = [
    "User Goal",
    "Transformation Plan",
    "Transformation Rules",
    "Formatter",
    "Positive Prompt",
    "Negative Prompt",
    "Provider",
    "Generated Result",
  ];
  var PROMPT_EXPERIMENT_NONDETERMINISM_DISCLAIMER =
    "This is diagnostic evidence, not proof. Provider generation and moderation may be nondeterministic.";
  var promptExperimentHistory = [];
  var promptExperimentSelectedA = null;
  var promptExperimentSelectedB = null;
  var promptExperimentViewId = null;
  var promptExperimentExportObjectUrl = null;

  function setText(el, value) {
    if (!el) return;
    el.textContent = value == null ? "" : String(value);
  }

  function setMessage(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("error", "ok");
    if (kind) el.classList.add(kind);
  }

  function clearChildren(el) {
    while (el && el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function appendKv(container, key, value) {
    var item = document.createElement("div");
    item.className = "kv-item";
    var k = document.createElement("div");
    k.className = "k";
    k.textContent = key;
    var v = document.createElement("div");
    v.className = "v";
    v.textContent = value == null ? "—" : String(value);
    item.appendChild(k);
    item.appendChild(v);
    container.appendChild(item);
  }

  function pretty(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_err) {
      return "";
    }
  }

  function countPromptCharacters(text) {
    if (typeof text !== "string" || text.length === 0) return 0;
    return text.length;
  }

  function countPromptWords(text) {
    if (typeof text !== "string") return 0;
    var trimmed = text.trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).length;
  }

  function computePromptMetrics(positivePrompt, negativePrompt) {
    var positiveCharacters = countPromptCharacters(positivePrompt);
    var positiveWords = countPromptWords(positivePrompt);
    var negativeCharacters = countPromptCharacters(negativePrompt);
    var negativeWords = countPromptWords(negativePrompt);
    return {
      positiveCharacters: positiveCharacters,
      positiveWords: positiveWords,
      negativeCharacters: negativeCharacters,
      negativeWords: negativeWords,
      totalCharacters: positiveCharacters + negativeCharacters,
      totalWords: positiveWords + negativeWords,
    };
  }

  function asRuleRecord(value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value;
  }

  function canonicalizeRuleValue(value) {
    if (value == null) return null;
    if (typeof value !== "object") return value;
    if (Array.isArray(value)) {
      return value.map(canonicalizeRuleValue);
    }
    var keys = Object.keys(value).sort();
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = canonicalizeRuleValue(value[keys[i]]);
    }
    return out;
  }

  function stableStringifyRuleValue(value) {
    try {
      return JSON.stringify(canonicalizeRuleValue(value));
    } catch (_err) {
      return "null";
    }
  }

  function projectTransformationRules(input) {
    input = input || {};
    var plan = asRuleRecord(input.transformationPlan);
    var visual = asRuleRecord(input.visualDirection);
    var render = asRuleRecord(input.renderPlan);
    var visualPreserve = asRuleRecord(visual && visual.preserve);
    var renderIdentity = asRuleRecord(render && render.identity);
    var renderScene = asRuleRecord(render && render.scene);
    var renderAnatomy = asRuleRecord(render && render.anatomy);
    var renderRealism = asRuleRecord(render && render.realism);
    var renderTransform = asRuleRecord(render && render.transformation);
    var visualMeta = asRuleRecord(visual && visual.metadata);
    var renderTrace = asRuleRecord(render && render.trace);

    function sceneFlag(sceneKey, preserveKey) {
      return {
        preserve:
          (renderScene && renderScene[sceneKey] === true) ||
          (visualPreserve && visualPreserve[preserveKey] === true),
      };
    }

    var approved = renderTransform && Array.isArray(renderTransform.approvedChanges)
      ? renderTransform.approvedChanges
      : [];
    var regionalTargets = plan && Array.isArray(plan.regionalTargets)
      ? plan.regionalTargets
      : [];

    var rules = {
      identity: {
        preservePerson: !!(renderIdentity && renderIdentity.preservePerson),
        preserveFace: !!(renderIdentity && renderIdentity.preserveFace),
        preserveApparentAge: !!(
          (renderIdentity && renderIdentity.preserveApparentAge) ||
          (visualPreserve && visualPreserve.apparentAge)
        ),
        preserveHair: !!(
          (renderIdentity && renderIdentity.preserveHair) ||
          (visualPreserve && visualPreserve.hair)
        ),
        preserveSkinTone: !!(
          (renderIdentity && renderIdentity.preserveSkinTone) ||
          (visualPreserve && visualPreserve.skinTone)
        ),
        preserveDistinctiveFeatures: !!(
          renderIdentity && renderIdentity.preserveDistinctiveFeatures
        ),
        preserveSkeletalFrame: !!(
          (renderAnatomy && renderAnatomy.preserveSkeletalFrame) ||
          (visualPreserve && visualPreserve.skeletalFrame)
        ),
        identityFlag: !!(visualPreserve && visualPreserve.identity),
      },
      pose: sceneFlag("preservePose", "pose"),
      camera: sceneFlag("preserveCameraPerspective", "cameraPerspective"),
      background: sceneFlag("preserveBackground", "background"),
      lighting: sceneFlag("preserveLighting", "lighting"),
      clothing: sceneFlag("preserveClothing", "clothing"),
      bodyFatChange: plan
        ? {
            estimatedFatLossKg: plan.estimatedFatLossKg || null,
            estimatedFatChangeKg:
              plan.estimatedFatChangeKg != null
                ? plan.estimatedFatChangeKg
                : null,
            currentBodyFatPct:
              plan.currentBodyFatPct != null ? plan.currentBodyFatPct : null,
            targetBodyFatPct:
              plan.targetBodyFatPct != null ? plan.targetBodyFatPct : null,
            interimBodyFatPct:
              plan.interimBodyFatPct != null ? plan.interimBodyFatPct : null,
            expectedBodyFatPct:
              plan.expectedBodyFatPct != null ? plan.expectedBodyFatPct : null,
          }
        : null,
      muscleChange: plan
        ? {
            estimatedMuscleGainKg: plan.estimatedMuscleGainKg || null,
            estimatedLeanMassChangeKg:
              plan.estimatedLeanMassChangeKg != null
                ? plan.estimatedLeanMassChangeKg
                : null,
          }
        : null,
      weightGoal: plan
        ? {
            expectedWeightKg:
              plan.expectedWeightKg != null ? plan.expectedWeightKg : null,
            waistChangeCm:
              plan.waistChangeCm != null ? plan.waistChangeCm : null,
          }
        : null,
      timeline: plan
        ? {
            effectiveTimelineWeeks:
              plan.effectiveTimelineWeeks != null
                ? plan.effectiveTimelineWeeks
                : null,
            progress: plan.progress != null ? plan.progress : null,
            visualIntensity: plan.visualIntensity || null,
            checkpoints: Array.isArray(plan.timelineCheckpoints)
              ? plan.timelineCheckpoints
              : [],
          }
        : null,
      photographicRealism: {
        presentationStyle:
          (renderRealism && renderRealism.presentationStyle) ||
          (visual && visual.presentationStyle) ||
          null,
        textureStyle:
          (renderRealism && renderRealism.textureStyle) ||
          (visual && visual.textureStyle) ||
          null,
        changeVisibility:
          (renderTransform && renderTransform.changeVisibility) ||
          (visual && visual.changeVisibility) ||
          null,
        postureTreatment: (visual && visual.postureTreatment) || null,
        realismConstraints:
          (renderRealism && Array.isArray(renderRealism.constraints)
            ? renderRealism.constraints
            : null) ||
          (visual && Array.isArray(visual.realismConstraints)
            ? visual.realismConstraints
            : []) ||
          [],
        photographicInstructions:
          visual && Array.isArray(visual.photographicInstructions)
            ? visual.photographicInstructions
            : [],
      },
      priorityOrder:
        approved.length > 0
          ? approved.map(function (change, index) {
              var rec = asRuleRecord(change) || {};
              return {
                order: index + 1,
                id: rec.id || null,
                kind: rec.kind || null,
                direction: rec.direction || null,
                region: rec.region || null,
                visibility: rec.visibility || null,
                sourcePlanField: rec.sourcePlanField || null,
              };
            })
          : regionalTargets.map(function (target, index) {
              var rec = asRuleRecord(target) || {};
              return {
                order: index + 1,
                region: rec.region || null,
                magnitude: rec.magnitude != null ? rec.magnitude : null,
              };
            }),
      scenario:
        typeof input.scenarioId === "string" && input.scenarioId
          ? input.scenarioId
          : null,
      bodyRegionEmphasis: {
        regionalTargets: regionalTargets.map(function (target) {
          var rec = asRuleRecord(target) || {};
          return {
            region: rec.region || null,
            magnitude: rec.magnitude != null ? rec.magnitude : null,
            note: rec.note || null,
          };
        }),
        emphasisInstructions:
          visual && Array.isArray(visual.emphasisInstructions)
            ? visual.emphasisInstructions
            : [],
        regionalRenderChanges: approved
          .map(function (change) {
            return asRuleRecord(change);
          })
          .filter(function (rec) {
            return (
              rec &&
              (rec.kind === "regional_change" || typeof rec.region === "string")
            );
          })
          .map(function (rec) {
            return {
              id: rec.id || null,
              kind: rec.kind || null,
              region: rec.region || null,
              direction: rec.direction || null,
              visibility: rec.visibility || null,
            };
          }),
      },
    };

    var fields = TRANSFORM_RULE_FIELD_KEYS.map(function (key) {
      return {
        key: key,
        label: TRANSFORM_RULE_FIELD_LABELS[key] || key,
        value: rules[key],
      };
    });

    return {
      schemaVersion: 1,
      projectionId: "transformation-rule-projection",
      fields: fields,
      rules: rules,
      source: {
        transformationPlanPresent: !!plan,
        visualDirectionPresent: !!visual,
        renderPlanPresent: !!render,
        transformationRulesVersion:
          (plan && plan.rulesVersion) ||
          (renderTrace && renderTrace.transformationRulesVersion) ||
          null,
        visualDirectionRulesVersion:
          (visualMeta && visualMeta.rulesVersion) ||
          (renderTrace && renderTrace.visualDirectionRulesVersion) ||
          null,
        renderPlanRulesVersion: (render && render.rulesVersion) || null,
      },
    };
  }

  function compareTransformationRules(rulesA, rulesB) {
    var mapA = (rulesA && rulesA.rules) || {};
    var mapB = (rulesB && rulesB.rules) || {};
    var entries = [];
    var summary = { added: 0, removed: 0, modified: 0, unchanged: 0 };
    TRANSFORM_RULE_FIELD_KEYS.forEach(function (key) {
      var valueA = mapA[key] != null ? mapA[key] : null;
      var valueB = mapB[key] != null ? mapB[key] : null;
      var strA = stableStringifyRuleValue(valueA);
      var strB = stableStringifyRuleValue(valueB);
      var emptyA = strA === "null";
      var emptyB = strB === "null";
      var status;
      if (emptyA && !emptyB) {
        status = "added";
        summary.added += 1;
      } else if (!emptyA && emptyB) {
        status = "removed";
        summary.removed += 1;
      } else if (strA === strB) {
        status = "unchanged";
        summary.unchanged += 1;
      } else {
        status = "modified";
        summary.modified += 1;
      }
      entries.push({
        key: key,
        label: TRANSFORM_RULE_FIELD_LABELS[key] || key,
        status: status,
        valueA: valueA,
        valueB: valueB,
      });
    });
    return { rules: entries, summary: summary };
  }

  function createExperimentId() {
    var rand =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "r" + Math.random().toString(36).slice(2, 10);
    return "pex_" + Date.now().toString(36) + "_" + rand;
  }

  function normalizePromptLines(text) {
    if (typeof text !== "string" || text.length === 0) return [];
    return text
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return line.length > 0;
      });
  }

  function comparePromptLines(promptA, promptB) {
    var linesA = normalizePromptLines(promptA);
    var linesB = normalizePromptLines(promptB);
    var setA = {};
    var setB = {};
    var i;
    for (i = 0; i < linesA.length; i++) setA[linesA[i]] = true;
    for (i = 0; i < linesB.length; i++) setB[linesB[i]] = true;
    var onlyInA = [];
    var onlyInB = [];
    var shared = [];
    Object.keys(setA).forEach(function (line) {
      if (setB[line]) shared.push(line);
      else onlyInA.push(line);
    });
    Object.keys(setB).forEach(function (line) {
      if (!setA[line]) onlyInB.push(line);
    });
    onlyInA.sort();
    onlyInB.sort();
    shared.sort();
    return { onlyInA: onlyInA, onlyInB: onlyInB, shared: shared };
  }

  function classifyPromptExperimentOutcome(input) {
    if (input && input.success === true) return "succeeded";
    var diagnostic =
      input && typeof input.diagnostic === "string" ? input.diagnostic : "";
    if (diagnostic === "provider_safety_blocked") return "safety_blocked";
    var code = input && typeof input.code === "string" ? input.code : "";
    if (code === "validation_rejected" || diagnostic === "validation_failed") {
      return "validation_rejected";
    }
    if (
      code === "provider_failure" ||
      diagnostic === "provider_failure" ||
      diagnostic === "provider_timeout" ||
      diagnostic === "provider_invalid_input" ||
      diagnostic === "provider_auth_error" ||
      diagnostic === "provider_http_error" ||
      diagnostic === "provider_invalid_response" ||
      diagnostic === "provider_network_error" ||
      diagnostic === "token_missing"
    ) {
      return "provider_failed";
    }
    if (input && input.validationAccepted === false) {
      return "validation_rejected";
    }
    return "runtime_failed";
  }

  function revokePromptExperimentExportUrl() {
    if (promptExperimentExportObjectUrl) {
      try {
        URL.revokeObjectURL(promptExperimentExportObjectUrl);
      } catch (_err) {
        /* ignore */
      }
      promptExperimentExportObjectUrl = null;
    }
  }

  function clearPromptExperimentHistoryState() {
    promptExperimentHistory = [];
    promptExperimentSelectedA = null;
    promptExperimentSelectedB = null;
    promptExperimentViewId = null;
    revokePromptExperimentExportUrl();
    setText(promptExperimentViewPositive, "");
    setText(promptExperimentViewNegative, "");
    setText(transformationRuleJsonView, "");
    if (transformationRuleFields) clearChildren(transformationRuleFields);
    if (transformationFormatterMeta) clearChildren(transformationFormatterMeta);
    if (promptExperimentViewPromptsDetails) {
      promptExperimentViewPromptsDetails.open = false;
    }
    if (promptExperimentHistoryMessage) {
      setMessage(promptExperimentHistoryMessage, "", null);
    }
    renderPromptExperimentHistory();
  }

  function findPromptExperimentRecord(experimentId) {
    for (var i = 0; i < promptExperimentHistory.length; i++) {
      if (promptExperimentHistory[i].experimentId === experimentId) {
        return promptExperimentHistory[i];
      }
    }
    return null;
  }

  function interpretPromptExperiments(records) {
    var warnings = [];
    var disclaimer = PROMPT_EXPERIMENT_NONDETERMINISM_DISCLAIMER;
    if (!records || records.length === 0) {
      return {
        summary:
          "Current evidence is inconclusive. Additional manual tests under identical conditions may be needed.",
        warnings: warnings,
        disclaimer: disclaimer,
        text:
          "Current evidence is inconclusive. Additional manual tests under identical conditions may be needed.\n\n" +
          disclaimer,
      };
    }
    var scenarios = {};
    var models = {};
    var i;
    for (i = 0; i < records.length; i++) {
      scenarios[records[i].scenarioId] = true;
      models[records[i].provider.model || ""] = true;
    }
    if (Object.keys(scenarios).length > 1) {
      warnings.push(
        "Records use different scenarios; test conditions are not comparable."
      );
    }
    if (Object.keys(models).length > 1) {
      warnings.push(
        "Records use different provider models; test conditions are not comparable."
      );
    }
    if (warnings.length > 0) {
      var warnText = warnings
        .map(function (w) {
          return "Warning: " + w;
        })
        .join("\n\n");
      return {
        summary:
          "Current evidence is inconclusive. Additional manual tests under identical conditions may be needed.",
        warnings: warnings,
        disclaimer: disclaimer,
        text:
          "Current evidence is inconclusive. Additional manual tests under identical conditions may be needed.\n\n" +
          warnText +
          "\n\n" +
          disclaimer,
      };
    }
    var byVariant = {};
    for (i = 0; i < records.length; i++) {
      byVariant[records[i].variant] = records[i];
    }
    var minimal = byVariant.minimal;
    var current = byVariant.current_ai_os;
    var withoutPreview = byVariant.current_without_preview_context;
    var baseline = byVariant.pre_017c_baseline;
    var tested = Object.keys(byVariant).map(function (key) {
      return byVariant[key];
    });
    var allBlocked =
      tested.length > 0 &&
      tested.every(function (r) {
        return r.outcome === "safety_blocked";
      });
    var allSucceeded =
      tested.length > 0 &&
      tested.every(function (r) {
        return r.outcome === "succeeded";
      });
    var summary;
    if (
      minimal &&
      minimal.outcome === "succeeded" &&
      baseline &&
      baseline.outcome === "succeeded" &&
      current &&
      current.outcome === "safety_blocked" &&
      withoutPreview &&
      withoutPreview.outcome === "safety_blocked"
    ) {
      summary =
        "A newer formatter or preview-context change may be contributing.";
    } else if (
      minimal &&
      minimal.outcome === "succeeded" &&
      withoutPreview &&
      withoutPreview.outcome === "succeeded" &&
      current &&
      current.outcome === "safety_blocked"
    ) {
      summary =
        "The preview-specific formatter context may be contributing to the provider block.";
    } else if (
      minimal &&
      minimal.outcome === "succeeded" &&
      current &&
      current.outcome === "safety_blocked"
    ) {
      summary =
        "Prompt content or complexity may be contributing to the provider block.";
    } else if (allBlocked) {
      summary =
        "Prompt wording is unlikely to be the only cause. The provider model, source image handling or provider moderation may also be contributing.";
    } else if (allSucceeded) {
      summary =
        "The earlier provider block may have been transient or input-dependent.";
    } else {
      summary =
        "Current evidence is inconclusive. Additional manual tests under identical conditions may be needed.";
    }
    return {
      summary: summary,
      warnings: warnings,
      disclaimer: disclaimer,
      text: summary + "\n\n" + disclaimer,
    };
  }

  function scanExportForUnsafeContent(value) {
    if (value == null) return null;
    if (typeof value === "string") {
      if (/data:image\//i.test(value)) return "data:image/";
      if (/REPLICATE_API_TOKEN/i.test(value)) return "REPLICATE_API_TOKEN";
      if (/AI_OS_CONTROL_ROOM_ACCESS_KEY/i.test(value)) {
        return "AI_OS_CONTROL_ROOM_ACCESS_KEY";
      }
      if (/Authorization\s*:/i.test(value)) return "Authorization:";
      if (/\bBearer\s+[A-Za-z0-9._\-]{8,}/i.test(value)) return "Bearer token";
      if (/sk_live_/i.test(value)) return "sk_live_";
      if (/\b(x-api-key|api-key|authorization)\b\s*[:=]/i.test(value)) {
        return "raw provider headers";
      }
      return null;
    }
    if (typeof value !== "object") return null;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var hitArr = scanExportForUnsafeContent(value[i]);
        if (hitArr) return hitArr;
      }
      return null;
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var hitObj = scanExportForUnsafeContent(value[keys[k]]);
      if (hitObj) return hitObj;
    }
    return null;
  }

  function buildPromptExperimentRecordFromLab(input) {
    var variant =
      input.variant && ALLOWED_PROMPT_ISOLATION_VARIANTS[input.variant]
        ? input.variant
        : "current_ai_os";
    var positive =
      typeof input.positivePrompt === "string" ? input.positivePrompt : "";
    var negative =
      typeof input.negativePrompt === "string" ? input.negativePrompt : "";
    var metrics = computePromptMetrics(positive, negative);
    var family = input.providerFamily || "flux";
    var model = typeof input.model === "string" ? input.model : "";
    var outcome = input.outcome || "runtime_failed";
    var generatedImageAvailable = input.generatedImageAvailable === true;
    var transformationRules =
      input.transformationRules ||
      projectTransformationRules({
        scenarioId: input.scenarioId || "",
        transformationPlan: input.transformationPlan,
        visualDirection: input.visualDirection,
        renderPlan: input.renderPlan,
      });
    var record = {
      schemaVersion: 2,
      experimentId: createExperimentId(),
      createdAt: new Date().toISOString(),
      variant: variant,
      scenarioId: input.scenarioId || "",
      provider: {
        family: family,
        model: model,
      },
      transformationRules: transformationRules,
      promptMetrics: metrics,
      outcome: outcome,
      generatedImageAvailable: generatedImageAvailable,
      formatter: {
        name: input.formatterName != null ? input.formatterName : null,
        version:
          input.formatterVersion != null ? input.formatterVersion : null,
        mode: typeof input.formatterMode === "string" ? input.formatterMode : null,
        output: {
          positivePromptLength: metrics.positiveCharacters,
          negativePromptLength: metrics.negativeCharacters,
          positiveWords: metrics.positiveWords,
          negativeWords: metrics.negativeWords,
          totalCharacters: metrics.totalCharacters,
          totalWords: metrics.totalWords,
        },
      },
      prompts: {
        positivePrompt: positive,
        negativePrompt: negative,
      },
      providerResult: {
        outcome: outcome,
        family: family,
        model: model,
        generatedImageAvailable: generatedImageAvailable,
      },
    };
    if (typeof input.predictionId === "string" && input.predictionId) {
      record.provider.predictionId = input.predictionId;
      record.providerResult.predictionId = input.predictionId;
    }
    if (typeof input.diagnostic === "string" && input.diagnostic) {
      record.diagnostic = input.diagnostic;
      record.providerResult.diagnostic = input.diagnostic;
    }
    if (
      typeof input.durationMs === "number" &&
      isFinite(input.durationMs)
    ) {
      record.durationMs = Math.max(0, input.durationMs);
      record.providerResult.durationMs = record.durationMs;
    }
    return record;
  }

  function renderTransformationRuleInspector(record) {
    if (transformationRuleFields) clearChildren(transformationRuleFields);
    if (transformationFormatterMeta) clearChildren(transformationFormatterMeta);
    setText(transformationRuleJsonView, "");
    if (!record) {
      if (transformationRuleFields) {
        appendKv(transformationRuleFields, "Rules", "Select a history record");
      }
      return;
    }
    var rulesView = record.transformationRules;
    if (rulesView && Array.isArray(rulesView.fields)) {
      rulesView.fields.forEach(function (field) {
        var display;
        try {
          display =
            typeof field.value === "string" ||
            typeof field.value === "number" ||
            typeof field.value === "boolean" ||
            field.value == null
              ? field.value
              : JSON.stringify(field.value);
        } catch (_err) {
          display = "—";
        }
        appendKv(
          transformationRuleFields,
          field.label || field.key,
          display
        );
      });
      setText(transformationRuleJsonView, pretty(rulesView));
    } else if (transformationRuleFields) {
      appendKv(transformationRuleFields, "Rules", "Unavailable");
    }
    if (transformationFormatterMeta) {
      appendKv(
        transformationFormatterMeta,
        "name",
        record.formatter && record.formatter.name
      );
      appendKv(
        transformationFormatterMeta,
        "version",
        record.formatter && record.formatter.version
      );
      appendKv(
        transformationFormatterMeta,
        "mode",
        record.formatter && record.formatter.mode
      );
      var output = record.formatter && record.formatter.output;
      appendKv(
        transformationFormatterMeta,
        "positive length",
        output ? String(output.positivePromptLength) : "—"
      );
      appendKv(
        transformationFormatterMeta,
        "negative length",
        output ? String(output.negativePromptLength) : "—"
      );
      appendKv(
        transformationFormatterMeta,
        "total words",
        output ? String(output.totalWords) : "—"
      );
      appendKv(
        transformationFormatterMeta,
        "total characters",
        output ? String(output.totalCharacters) : "—"
      );
    }
  }

  function addPromptExperimentRecord(record) {
    promptExperimentHistory.push(record);
    while (promptExperimentHistory.length > PROMPT_EXPERIMENT_HISTORY_MAX) {
      var removed = promptExperimentHistory.shift();
      if (removed) {
        if (promptExperimentSelectedA === removed.experimentId) {
          promptExperimentSelectedA = null;
        }
        if (promptExperimentSelectedB === removed.experimentId) {
          promptExperimentSelectedB = null;
        }
        if (promptExperimentViewId === removed.experimentId) {
          promptExperimentViewId = null;
          setText(promptExperimentViewPositive, "");
          setText(promptExperimentViewNegative, "");
        }
      }
    }
    renderPromptExperimentHistory();
  }

  function removePromptExperimentRecord(experimentId) {
    promptExperimentHistory = promptExperimentHistory.filter(function (r) {
      return r.experimentId !== experimentId;
    });
    if (promptExperimentSelectedA === experimentId) {
      promptExperimentSelectedA = null;
    }
    if (promptExperimentSelectedB === experimentId) {
      promptExperimentSelectedB = null;
    }
    if (promptExperimentViewId === experimentId) {
      promptExperimentViewId = null;
      setText(promptExperimentViewPositive, "");
      setText(promptExperimentViewNegative, "");
      renderTransformationRuleInspector(null);
    }
    renderPromptExperimentHistory();
  }

  function renderComparisonSide(container, record, label) {
    if (!container) return;
    clearChildren(container);
    if (!record) {
      appendKv(container, label, "Not selected");
      return;
    }
    appendKv(container, "Timestamp", record.createdAt);
    appendKv(container, "Variant", record.variant);
    appendKv(container, "Scenario", record.scenarioId);
    appendKv(container, "Model", record.provider.model);
    appendKv(container, "Outcome", record.outcome);
    appendKv(container, "Diagnostic", record.diagnostic || "—");
  }

  function renderPromptExperimentComparison() {
    var recordA = promptExperimentSelectedA
      ? findPromptExperimentRecord(promptExperimentSelectedA)
      : null;
    var recordB = promptExperimentSelectedB
      ? findPromptExperimentRecord(promptExperimentSelectedB)
      : null;
    renderComparisonSide(promptExperimentComparisonA, recordA, "Comparison A");
    renderComparisonSide(promptExperimentComparisonB, recordB, "Comparison B");
    if (promptExperimentCompareFields) {
      clearChildren(promptExperimentCompareFields);
    }
    if (transformationRuleDiffSummary) {
      clearChildren(transformationRuleDiffSummary);
    }
    if (transformationRuleDiffList) {
      clearChildren(transformationRuleDiffList);
    }
    setText(promptExperimentPositiveA, "");
    setText(promptExperimentPositiveB, "");
    setText(promptExperimentNegativeA, "");
    setText(promptExperimentNegativeB, "");
    setText(promptExperimentOnlyA, "");
    setText(promptExperimentOnlyB, "");
    setText(promptExperimentCommonLines, "");
    if (recordA && recordB) {
      /* Rules FIRST, then prompts (Demand 018E). */
      var ruleDiff = compareTransformationRules(
        recordA.transformationRules,
        recordB.transformationRules
      );
      if (transformationRuleDiffSummary) {
        appendKv(
          transformationRuleDiffSummary,
          "added",
          String(ruleDiff.summary.added)
        );
        appendKv(
          transformationRuleDiffSummary,
          "removed",
          String(ruleDiff.summary.removed)
        );
        appendKv(
          transformationRuleDiffSummary,
          "modified",
          String(ruleDiff.summary.modified)
        );
        appendKv(
          transformationRuleDiffSummary,
          "unchanged",
          String(ruleDiff.summary.unchanged)
        );
      }
      if (transformationRuleDiffList) {
        ruleDiff.rules.forEach(function (entry) {
          var item = document.createElement("div");
          item.className = "kv-item rule-diff-" + entry.status;
          var k = document.createElement("div");
          k.className = "k";
          k.textContent = entry.label;
          var v = document.createElement("div");
          v.className = "v";
          v.textContent = entry.status;
          item.appendChild(k);
          item.appendChild(v);
          transformationRuleDiffList.appendChild(item);
        });
      }
      if (promptExperimentCompareFields) {
        var rows = [
          ["variant", recordA.variant, recordB.variant],
          ["scenario", recordA.scenarioId, recordB.scenarioId],
          ["provider model", recordA.provider.model, recordB.provider.model],
          [
            "formatter name",
            recordA.formatter.name || "—",
            recordB.formatter.name || "—",
          ],
          [
            "formatter version",
            recordA.formatter.version || "—",
            recordB.formatter.version || "—",
          ],
          [
            "formatter mode",
            recordA.formatter.mode || "—",
            recordB.formatter.mode || "—",
          ],
          ["outcome", recordA.outcome, recordB.outcome],
          [
            "diagnostic",
            recordA.diagnostic || "—",
            recordB.diagnostic || "—",
          ],
          [
            "duration",
            recordA.durationMs != null ? String(recordA.durationMs) : "—",
            recordB.durationMs != null ? String(recordB.durationMs) : "—",
          ],
          [
            "positive words",
            String(recordA.promptMetrics.positiveWords),
            String(recordB.promptMetrics.positiveWords),
          ],
          [
            "negative words",
            String(recordA.promptMetrics.negativeWords),
            String(recordB.promptMetrics.negativeWords),
          ],
          [
            "total words",
            String(recordA.promptMetrics.totalWords),
            String(recordB.promptMetrics.totalWords),
          ],
          [
            "positive characters",
            String(recordA.promptMetrics.positiveCharacters),
            String(recordB.promptMetrics.positiveCharacters),
          ],
          [
            "negative characters",
            String(recordA.promptMetrics.negativeCharacters),
            String(recordB.promptMetrics.negativeCharacters),
          ],
          [
            "total characters",
            String(recordA.promptMetrics.totalCharacters),
            String(recordB.promptMetrics.totalCharacters),
          ],
        ];
        rows.forEach(function (row) {
          appendKv(
            promptExperimentCompareFields,
            row[0],
            "A: " + row[1] + " | B: " + row[2]
          );
        });
      }
      setText(
        promptExperimentPositiveA,
        recordA.prompts.positivePrompt || ""
      );
      setText(
        promptExperimentPositiveB,
        recordB.prompts.positivePrompt || ""
      );
      setText(
        promptExperimentNegativeA,
        recordA.prompts.negativePrompt || ""
      );
      setText(
        promptExperimentNegativeB,
        recordB.prompts.negativePrompt || ""
      );
      var posDiff = comparePromptLines(
        recordA.prompts.positivePrompt || "",
        recordB.prompts.positivePrompt || ""
      );
      var negDiff = comparePromptLines(
        recordA.prompts.negativePrompt || "",
        recordB.prompts.negativePrompt || ""
      );
      var onlyA = posDiff.onlyInA.concat(
        negDiff.onlyInA.map(function (line) {
          return "[neg] " + line;
        })
      );
      var onlyB = posDiff.onlyInB.concat(
        negDiff.onlyInB.map(function (line) {
          return "[neg] " + line;
        })
      );
      var commonLines = posDiff.shared.concat(
        negDiff.shared.map(function (line) {
          return "[neg] " + line;
        })
      );
      setText(promptExperimentOnlyA, onlyA.join("\n") || "(none)");
      setText(promptExperimentOnlyB, onlyB.join("\n") || "(none)");
      setText(promptExperimentCommonLines, commonLines.join("\n") || "(none)");
    }
    var interpretation = interpretPromptExperiments(promptExperimentHistory);
    setText(
      promptExperimentInterpretationText,
      interpretation.text || interpretation.summary
    );
  }

  function renderPromptExperimentHistory() {
    if (!promptExperimentHistoryList) return;
    clearChildren(promptExperimentHistoryList);
    if (promptExperimentHistory.length === 0) {
      var empty = document.createElement("p");
      empty.className = "experiment-history-empty";
      empty.textContent =
        "No session experiments yet. Complete a manual Prompt Isolation Lab run to record one.";
      promptExperimentHistoryList.appendChild(empty);
      renderPromptExperimentComparison();
      return;
    }
    promptExperimentHistory.forEach(function (record) {
      var item = document.createElement("div");
      item.className = "experiment-history-item";
      var title = document.createElement("h5");
      title.textContent =
        record.createdAt + " — " + record.variant + " — " + record.outcome;
      item.appendChild(title);
      var meta = document.createElement("div");
      meta.className = "kv-grid";
      appendKv(meta, "Scenario", record.scenarioId);
      appendKv(meta, "Model", record.provider.model);
      appendKv(
        meta,
        "Formatter",
        (record.formatter.name || "—") +
          " " +
          (record.formatter.version || "")
      );
      appendKv(meta, "Formatter mode", record.formatter.mode || "—");
      appendKv(meta, "Outcome", record.outcome);
      appendKv(meta, "Diagnostic", record.diagnostic || "—");
      appendKv(
        meta,
        "Duration ms",
        record.durationMs != null ? String(record.durationMs) : "—"
      );
      appendKv(
        meta,
        "Prompt words",
        String(record.promptMetrics.totalWords)
      );
      appendKv(
        meta,
        "Prompt characters",
        String(record.promptMetrics.totalCharacters)
      );
      appendKv(
        meta,
        "Transformation Rules",
        record.transformationRules ? "projected" : "missing"
      );
      appendKv(
        meta,
        "Generated image available",
        record.generatedImageAvailable ? "yes" : "no"
      );
      if (promptExperimentSelectedA === record.experimentId) {
        appendKv(meta, "Comparison", "A");
      } else if (promptExperimentSelectedB === record.experimentId) {
        appendKv(meta, "Comparison", "B");
      }
      item.appendChild(meta);
      var actions = document.createElement("div");
      actions.className = "experiment-history-actions";
      function makeBtn(label, onClick) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn";
        btn.textContent = label;
        btn.addEventListener("click", onClick);
        actions.appendChild(btn);
      }
      makeBtn("Select as comparison A", function () {
        if (promptExperimentSelectedB === record.experimentId) {
          promptExperimentSelectedB = null;
        }
        promptExperimentSelectedA = record.experimentId;
        renderPromptExperimentHistory();
      });
      makeBtn("Select as comparison B", function () {
        if (promptExperimentSelectedA === record.experimentId) {
          promptExperimentSelectedA = null;
        }
        promptExperimentSelectedB = record.experimentId;
        renderPromptExperimentHistory();
      });
      makeBtn("Inspect rules", function () {
        promptExperimentViewId = record.experimentId;
        renderTransformationRuleInspector(record);
      });
      makeBtn("View prompts", function () {
        promptExperimentViewId = record.experimentId;
        renderTransformationRuleInspector(record);
        setText(
          promptExperimentViewPositive,
          record.prompts.positivePrompt || ""
        );
        setText(
          promptExperimentViewNegative,
          record.prompts.negativePrompt || ""
        );
        if (promptExperimentViewPromptsDetails) {
          promptExperimentViewPromptsDetails.open = true;
        }
      });
      makeBtn("Remove record", function () {
        removePromptExperimentRecord(record.experimentId);
      });
      item.appendChild(actions);
      promptExperimentHistoryList.appendChild(item);
    });
    renderPromptExperimentComparison();
  }

  function exportPromptExperimentReport() {
    var interpretation = interpretPromptExperiments(promptExperimentHistory);
    var report = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      service: "ai-os-prompt-isolation-lab",
      environment: "internal_control_room",
      records: promptExperimentHistory.map(function (r) {
        var providerResult = {
          outcome: r.providerResult
            ? r.providerResult.outcome
            : r.outcome,
          family: r.providerResult
            ? r.providerResult.family
            : r.provider.family,
          model: r.providerResult ? r.providerResult.model : r.provider.model,
          generatedImageAvailable: r.providerResult
            ? r.providerResult.generatedImageAvailable
            : r.generatedImageAvailable,
        };
        if (r.providerResult && r.providerResult.diagnostic) {
          providerResult.diagnostic = r.providerResult.diagnostic;
        }
        if (
          r.providerResult &&
          typeof r.providerResult.durationMs === "number"
        ) {
          providerResult.durationMs = r.providerResult.durationMs;
        }
        return {
          schemaVersion: r.schemaVersion,
          experimentId: r.experimentId,
          createdAt: r.createdAt,
          variant: r.variant,
          scenarioId: r.scenarioId,
          provider: {
            family: r.provider.family,
            model: r.provider.model,
          },
          transformationRules: r.transformationRules,
          promptMetrics: r.promptMetrics,
          outcome: r.outcome,
          diagnostic: r.diagnostic,
          durationMs: r.durationMs,
          generatedImageAvailable: r.generatedImageAvailable,
          formatter: r.formatter,
          prompts: r.prompts,
          providerResult: providerResult,
        };
      }),
      comparisons: {
        selectedA: promptExperimentSelectedA,
        selectedB: promptExperimentSelectedB,
        interpretation: interpretation.text,
      },
      safety: {
        containsSourceImage: false,
        containsAccessKey: false,
        containsProviderToken: false,
        containsRawProviderResponse: false,
        containsEnvironmentValues: false,
      },
    };
    report.records.forEach(function (rec) {
      if (rec.provider && rec.provider.predictionId) {
        delete rec.provider.predictionId;
      }
      if (rec.providerResult && rec.providerResult.predictionId) {
        delete rec.providerResult.predictionId;
      }
    });
    var unsafe = scanExportForUnsafeContent(report);
    if (unsafe) {
      setMessage(
        promptExperimentHistoryMessage,
        "Export rejected: unsafe content detected (" + unsafe + ").",
        "error"
      );
      return;
    }
    var json;
    try {
      json = JSON.stringify(report, null, 2);
    } catch (_err) {
      setMessage(
        promptExperimentHistoryMessage,
        "Export failed: could not serialize report.",
        "error"
      );
      return;
    }
    revokePromptExperimentExportUrl();
    var blob = new Blob([json], { type: "application/json" });
    promptExperimentExportObjectUrl = URL.createObjectURL(blob);
    var now = new Date();
    var y = now.getUTCFullYear();
    var m = String(now.getUTCMonth() + 1).padStart(2, "0");
    var d = String(now.getUTCDate()).padStart(2, "0");
    var filename = "ai-os-prompt-experiments-" + y + "-" + m + "-" + d + ".json";
    var anchor = document.createElement("a");
    anchor.href = promptExperimentExportObjectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setMessage(
      promptExperimentHistoryMessage,
      "Safe report downloaded locally (not uploaded).",
      "ok"
    );
  }

  function recordIsolationLabExperiment(payload, options) {
    options = options || {};
    var result = payload && payload.result ? payload.result : null;
    var isolation =
      (result && result.promptIsolation) ||
      (payload && payload.promptIsolation) ||
      null;
    var summary =
      result &&
      result.artifacts &&
      result.artifacts.formattedRequestSummary
        ? result.artifacts.formattedRequestSummary
        : null;
    var variant =
      (isolation && isolation.variant) ||
      options.variant ||
      "current_ai_os";
    if (!ALLOWED_PROMPT_ISOLATION_VARIANTS[variant]) {
      variant = "current_ai_os";
    }
    var outcome = classifyPromptExperimentOutcome({
      success: result && result.success === true,
      code: payload && payload.code,
      diagnostic: options.diagnostic || (payload && payload.diagnostic),
      validationAccepted:
        result && result.validation ? result.validation.accepted : null,
    });
    var artifacts = result && result.artifacts ? result.artifacts : null;
    var scenarioId =
      (result && result.scenarioId) ||
      options.scenarioId ||
      selectedScenarioId ||
      "";
    var record = buildPromptExperimentRecordFromLab({
      variant: variant,
      scenarioId: scenarioId,
      providerFamily:
        (result && result.provider && result.provider.providerFamily) ||
        (summary && summary.providerFamily) ||
        "flux",
      model:
        (isolation && isolation.model) ||
        (result && result.provider && result.provider.model) ||
        (summary && summary.model) ||
        "",
      predictionId:
        result && result.provider && result.provider.predictionId
          ? result.provider.predictionId
          : undefined,
      outcome: outcome,
      diagnostic:
        options.diagnostic ||
        (payload && payload.diagnostic) ||
        undefined,
      durationMs:
        result && result.provider && typeof result.provider.durationMs === "number"
          ? result.provider.durationMs
          : undefined,
      generatedImageAvailable: !!(
        result &&
        result.generatedImage &&
        result.generatedImage.url
      ),
      formatterName:
        (isolation && isolation.formatterName) ||
        (summary && summary.formatterName) ||
        null,
      formatterVersion:
        (isolation && isolation.formatterVersion) ||
        (summary && summary.formatterVersion) ||
        null,
      formatterMode:
        (isolation && isolation.promptSource) ||
        variant ||
        null,
      positivePrompt: summary && summary.positivePrompt
        ? summary.positivePrompt
        : "",
      negativePrompt: summary && summary.negativePrompt
        ? summary.negativePrompt
        : "",
      transformationPlan: artifacts && artifacts.transformationPlan,
      visualDirection: artifacts && artifacts.visualDirection,
      renderPlan: artifacts && artifacts.renderPlan,
    });
    addPromptExperimentRecord(record);
    if (!promptExperimentViewId) {
      renderTransformationRuleInspector(record);
    }
  }

  function clearPreviewState() {
    previewInFlight = false;
    previewSourceDataUri = null;
    previewSourceMeta = null;
    if (previewObjectUrl) {
      try {
        URL.revokeObjectURL(previewObjectUrl);
      } catch (_err) {
        /* ignore */
      }
      previewObjectUrl = null;
    }
    if (previewFileInput) previewFileInput.value = "";
    if (previewAdultCheckbox) previewAdultCheckbox.checked = false;
    if (previewConsentCheckbox) previewConsentCheckbox.checked = false;
    if (previewBillingCheckbox) previewBillingCheckbox.checked = false;
    if (previewCompare) previewCompare.hidden = true;
    if (previewSourceImg) previewSourceImg.removeAttribute("src");
    if (previewGeneratedImg) {
      previewGeneratedImg.hidden = true;
      previewGeneratedImg.removeAttribute("src");
    }
    if (previewGeneratedPlaceholder) {
      previewGeneratedPlaceholder.hidden = false;
    }
    if (previewGeneratedLinkWrap) previewGeneratedLinkWrap.hidden = true;
    if (previewGeneratedLink) previewGeneratedLink.href = "#";
    if (previewResultPanel) previewResultPanel.hidden = true;
    if (previewImageMeta) setText(previewImageMeta, "");
    if (previewMessage) setMessage(previewMessage, "", null);
    clearChildren(previewProviderSummary);
    clearChildren(previewValidationSummary);
    clearChildren(previewStageList);
    clearChildren(previewSafetyList);
    setText(previewPositivePrompt, "");
    setText(previewNegativePrompt, "");
    setText(previewRawProjection, "");
    if (previewPromptDetails) previewPromptDetails.open = false;
    if (promptIsolationMessage) setMessage(promptIsolationMessage, "", null);
    if (promptIsolationResultSummary) {
      clearChildren(promptIsolationResultSummary);
      promptIsolationResultSummary.hidden = true;
    }
    var defaultVariant = document.getElementById("promptIsolationVariantB");
    if (defaultVariant) defaultVariant.checked = true;
    clearPromptExperimentHistoryState();
    updatePreviewGenerateEnabled();
  }

  function getSelectedPromptIsolationVariant() {
    var selected = document.querySelector(
      'input[name="promptIsolationVariant"]:checked'
    );
    var value = selected && selected.value ? String(selected.value) : "current_ai_os";
    if (ALLOWED_PROMPT_ISOLATION_VARIANTS[value] !== true) {
      return "current_ai_os";
    }
    return value;
  }

  function updatePreviewGenerateEnabled() {
    var ready =
      !!accessKey &&
      !!selectedScenarioId &&
      !!previewSourceDataUri &&
      !!(previewAdultCheckbox && previewAdultCheckbox.checked) &&
      !!(previewConsentCheckbox && previewConsentCheckbox.checked) &&
      !!(previewBillingCheckbox && previewBillingCheckbox.checked) &&
      !previewInFlight &&
      !requestInFlight;
    if (previewGenerateButton) previewGenerateButton.disabled = !ready;
    if (promptIsolationGenerateButton) {
      promptIsolationGenerateButton.disabled = !ready;
    }
  }

  function lockRoom(message, kind) {
    accessKey = null;
    unauthorizedStreak = 0;
    selectedScenarioId = null;
    scenarios = [];
    currentResult = null;
    requestInFlight = false;
    setText(accessStatus, "Locked");
    accessStatus.classList.remove("ok");
    accessStatus.classList.add("warn");
    scenarioPanel.hidden = true;
    if (previewPanel) previewPanel.hidden = true;
    resultPanel.hidden = true;
    clearChildren(scenarioList);
    clearResultViews();
    clearPreviewState();
    lockButton.disabled = true;
    runButton.disabled = true;
    unlockButton.disabled = false;
    accessKeyInput.value = "";
    setMessage(runMessage, "", null);
    if (message) setMessage(accessMessage, message, kind || "error");
  }

  function clearResultViews() {
    clearChildren(stageList);
    clearChildren(renderPlanHighlights);
    clearChildren(formatterMeta);
    clearChildren(versionMatrix);
    setText(transformationPlanView, "");
    setText(visualDirectionView, "");
    setText(renderPlanView, "");
    setText(positivePromptView, "");
    setText(negativePromptView, "");
    setText(rawProjectionView, "");
    if (promptDetails) promptDetails.open = false;
  }

  function markAuthorized() {
    setText(accessStatus, "Authorized");
    accessStatus.classList.remove("warn");
    accessStatus.classList.add("ok");
    scenarioPanel.hidden = false;
    if (previewPanel) previewPanel.hidden = false;
    lockButton.disabled = false;
    accessKeyInput.value = "";
    updatePreviewGenerateEnabled();
  }

  function apiMessage(payload, fallback) {
    if (payload && typeof payload.message === "string" && payload.message) {
      return payload.message;
    }
    return fallback;
  }

  function safeCode(payload, fallback) {
    if (payload && typeof payload.code === "string" && payload.code) {
      return payload.code;
    }
    return fallback;
  }

  function metaMatches(payload) {
    return (
      !!payload &&
      typeof payload === "object" &&
      payload.meta &&
      typeof payload.meta === "object" &&
      payload.meta.service === EXPECTED_SERVICE &&
      payload.meta.apiVersion === EXPECTED_API_VERSION
    );
  }

  var ALLOWED_DIAGNOSTICS = {
    module_load_failed: true,
    module_shape_invalid: true,
    scenario_list_failed: true,
    service_construct_failed: true,
    scenario_run_failed: true,
    projection_failed: true,
    runtime_execute_failed: true,
    provider_failure: true,
    provider_timeout: true,
    provider_invalid_input: true,
    provider_auth_error: true,
    provider_http_error: true,
    provider_safety_blocked: true,
    provider_invalid_response: true,
    provider_network_error: true,
    token_missing: true,
    validation_failed: true,
    preview_run_failed: true,
  };

  function safeDiagnostic(payload) {
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.diagnostic !== "string"
    ) {
      return null;
    }
    if (!ALLOWED_DIAGNOSTICS[payload.diagnostic]) {
      return null;
    }
    return payload.diagnostic;
  }

  function formatUnlockFailure(code, httpStatus, options) {
    var lines = [
      "Unable to unlock Control Room.",
      "Code: " + String(code),
      "HTTP: " + String(httpStatus),
    ];
    if (options && options.diagnostic) {
      lines.push("Diagnostic: " + String(options.diagnostic));
    }
    if (options && options.message) {
      lines.push(String(options.message));
    }
    if (options && options.metaMatch != null) {
      lines.push(
        "API identity: " + (options.metaMatch ? "matched" : "not matched")
      );
    }
    return lines.join("\n");
  }

  function handleAuthFailure(payload, httpStatus) {
    unauthorizedStreak += 1;
    var message = formatUnlockFailure(
      safeCode(payload, "unauthorized"),
      httpStatus == null ? 401 : httpStatus,
      {
        message: apiMessage(payload, "Unauthorized."),
        metaMatch: metaMatches(payload),
      }
    );
    if (unauthorizedStreak >= UNAUTH_STREAK_LIMIT) {
      lockRoom(message, "error");
      return;
    }
    setMessage(accessMessage, message, "error");
  }

  function request(method, body) {
    var headers = {
      Accept: "application/json",
    };
    if (accessKey) {
      headers[ACCESS_HEADER] = accessKey;
    }
    var options = {
      method: method,
      headers: headers,
      credentials: "same-origin",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    return fetch(API_PATH, options).then(function (response) {
      return response.text().then(function (text) {
        var payload = null;
        var nonJson = false;
        if (text == null || text === "") {
          nonJson = response.status !== 204;
        } else {
          try {
            payload = JSON.parse(text);
            if (payload == null || typeof payload !== "object") {
              nonJson = true;
              payload = null;
            }
          } catch (_err) {
            nonJson = true;
            payload = null;
          }
        }
        return {
          response: response,
          payload: payload,
          nonJson: nonJson,
        };
      });
    });
  }

  function renderScenarios() {
    clearChildren(scenarioList);
    scenarios.forEach(function (scenario) {
      var button = document.createElement("button");
      button.type = "button";
      button.className =
        "scenario-card" +
        (scenario.id === selectedScenarioId ? " selected" : "");

      var title = document.createElement("strong");
      title.textContent = scenario.title || scenario.id;
      button.appendChild(title);

      var description = document.createElement("p");
      description.textContent = scenario.description || "";
      button.appendChild(description);

      var meta = document.createElement("p");
      meta.className = "scenario-meta";
      meta.textContent =
        "Timeline: " +
        String(scenario.timelineWeeks) +
        " weeks · Focus: " +
        (Array.isArray(scenario.focusZones)
          ? scenario.focusZones.join(", ")
          : "");
      button.appendChild(meta);

      button.addEventListener("click", function () {
        selectedScenarioId = scenario.id;
        renderScenarios();
        runButton.disabled = !selectedScenarioId || requestInFlight;
        updatePreviewGenerateEnabled();
      });

      scenarioList.appendChild(button);
    });
    runButton.disabled = !selectedScenarioId || requestInFlight;
    updatePreviewGenerateEnabled();
  }

  function renderStages(stages) {
    clearChildren(stageList);
    (stages || []).forEach(function (stage) {
      var row = document.createElement("div");
      row.className = "stage-item";

      var icon = document.createElement("span");
      icon.className = "stage-icon " + (stage.success ? "ok" : "fail");
      icon.textContent = stage.success ? "OK" : "X";

      var main = document.createElement("div");
      var label = document.createElement("strong");
      label.textContent = stage.label || stage.stage || "";
      var counts = document.createElement("div");
      counts.className = "scenario-meta";
      counts.textContent =
        "warnings: " +
        String(stage.warningsCount || 0) +
        " · errors: " +
        String(stage.errorsCount || 0);
      main.appendChild(label);
      main.appendChild(counts);

      var duration = document.createElement("div");
      duration.className = "scenario-meta";
      duration.textContent = String(stage.durationMs || 0) + " ms";

      row.appendChild(icon);
      row.appendChild(main);
      row.appendChild(duration);
      stageList.appendChild(row);
    });
  }

  function renderRenderHighlights(renderPlan) {
    clearChildren(renderPlanHighlights);
    if (!renderPlan || typeof renderPlan !== "object") return;

    var focusRegions = [];
    var approved = renderPlan.transformation && renderPlan.transformation.approvedChanges;
    if (Array.isArray(approved)) {
      approved.forEach(function (change) {
        if (change && change.region) focusRegions.push(String(change.region));
      });
    }

    appendKv(
      renderPlanHighlights,
      "Focus regions",
      focusRegions.length ? focusRegions.join(", ") : "—"
    );
    appendKv(
      renderPlanHighlights,
      "Protected identity",
      renderPlan.identity && renderPlan.identity.preservePerson === true
        ? "preservePerson"
        : "—"
    );
    appendKv(
      renderPlanHighlights,
      "Identity preservation",
      renderPlan.identity ? pretty(renderPlan.identity) : "—"
    );
    appendKv(
      renderPlanHighlights,
      "Anatomy constraints",
      renderPlan.anatomy && Array.isArray(renderPlan.anatomy.constraints)
        ? renderPlan.anatomy.constraints.join(" | ")
        : "—"
    );
    appendKv(
      renderPlanHighlights,
      "Global exclusions",
      renderPlan.exclusions && Array.isArray(renderPlan.exclusions)
        ? renderPlan.exclusions.join(" | ")
        : "—"
    );
    appendKv(
      renderPlanHighlights,
      "Visual emphasis",
      renderPlan.transformation && renderPlan.transformation.changeVisibility
        ? String(renderPlan.transformation.changeVisibility)
        : "—"
    );
  }

  function renderFormatter(formattedRequest) {
    clearChildren(formatterMeta);
    if (!formattedRequest) return;
    appendKv(formatterMeta, "Formatter", formattedRequest.formatterName || "—");
    appendKv(
      formatterMeta,
      "Version",
      formattedRequest.formatterVersion || "—"
    );
    appendKv(
      formatterMeta,
      "Provider family",
      formattedRequest.providerFamily || "—"
    );
    appendKv(
      formatterMeta,
      "Source operation",
      formattedRequest.sourceOperation || "—"
    );
    appendKv(
      formatterMeta,
      "Aspect ratio",
      formattedRequest.aspectRatio || "—"
    );
    appendKv(
      formatterMeta,
      "Seed",
      formattedRequest.seed == null ? "—" : String(formattedRequest.seed)
    );
    setText(positivePromptView, formattedRequest.positivePrompt || "");
    setText(negativePromptView, formattedRequest.negativePrompt || "");
    if (promptDetails) promptDetails.open = false;
  }

  function renderVersions(versions) {
    clearChildren(versionMatrix);
    var entries = Object.keys(versions || {});
    entries.forEach(function (key) {
      appendKv(versionMatrix, key, versions[key]);
    });
  }

  function renderResult(result) {
    currentResult = result;
    resultPanel.hidden = false;
    renderStages(result.runtime && result.runtime.stages);
    setText(
      transformationPlanView,
      pretty(result.artifacts && result.artifacts.transformationPlan)
    );
    setText(
      visualDirectionView,
      pretty(result.artifacts && result.artifacts.visualDirection)
    );
    renderRenderHighlights(result.artifacts && result.artifacts.renderPlan);
    setText(
      renderPlanView,
      pretty(result.artifacts && result.artifacts.renderPlan)
    );
    renderFormatter(result.artifacts && result.artifacts.formattedRequest);
    renderVersions(result.runtime && result.runtime.versions);
    setText(rawProjectionView, pretty(result));
  }

  function unlock() {
    if (requestInFlight) return;
    var entered = accessKeyInput.value || "";
    if (!entered) {
      setMessage(accessMessage, "Enter an access key.", "error");
      return;
    }
    accessKey = entered;
    requestInFlight = true;
    unlockButton.disabled = true;
    setMessage(accessMessage, "Checking access…", null);

    request("GET")
      .then(function (outcome) {
        var status = outcome.response.status;
        if (outcome.nonJson || outcome.payload == null) {
          accessKey = null;
          setMessage(
            accessMessage,
            formatUnlockFailure("non_json_response", status),
            "error"
          );
          return;
        }

        var payload = outcome.payload;
        var identityOk = metaMatches(payload);

        if (!identityOk) {
          accessKey = null;
          setMessage(
            accessMessage,
            formatUnlockFailure("unexpected_api_response", status, {
              metaMatch: false,
            }),
            "error"
          );
          return;
        }

        if (status === 401 || payload.code === "unauthorized") {
          accessKey = null;
          handleAuthFailure(payload, status);
          return;
        }
        if (status === 404 || payload.code === "control_room_disabled") {
          lockRoom(
            formatUnlockFailure(
              safeCode(payload, "control_room_disabled"),
              status,
              {
                message: apiMessage(payload, "Control Room is disabled."),
                metaMatch: true,
              }
            ),
            "error"
          );
          return;
        }
        if (!outcome.response.ok || payload.ok !== true) {
          accessKey = null;
          setMessage(
            accessMessage,
            formatUnlockFailure(
              safeCode(payload, "api_response_invalid"),
              status,
              {
                diagnostic: safeDiagnostic(payload),
                message: apiMessage(payload, "Unable to unlock Control Room."),
                metaMatch: true,
              }
            ),
            "error"
          );
          return;
        }
        unauthorizedStreak = 0;
        scenarios = Array.isArray(payload.scenarios) ? payload.scenarios : [];
        selectedScenarioId = scenarios.length ? scenarios[0].id : null;
        markAuthorized();
        renderScenarios();
        setMessage(accessMessage, "Control Room unlocked.", "ok");
      })
      .catch(function () {
        accessKey = null;
        setMessage(
          accessMessage,
          formatUnlockFailure("network_failure", "unavailable"),
          "error"
        );
      })
      .then(function () {
        requestInFlight = false;
        unlockButton.disabled = false;
      });
  }

  function runScenario() {
    if (requestInFlight || !accessKey || !selectedScenarioId) return;
    requestInFlight = true;
    runButton.disabled = true;
    unlockButton.disabled = true;
    setMessage(runMessage, "Running deterministic AI OS pipeline…", null);

    request("POST", { scenarioId: selectedScenarioId })
      .then(function (outcome) {
        var status = outcome.response.status;
        if (outcome.nonJson || outcome.payload == null) {
          setMessage(
            runMessage,
            formatUnlockFailure("non_json_response", status).replace(
              "Unable to unlock Control Room.",
              "Unable to run dry run."
            ),
            "error"
          );
          return;
        }

        var payload = outcome.payload;
        if (!metaMatches(payload)) {
          setMessage(
            runMessage,
            "Unable to run dry run.\nCode: unexpected_api_response\nHTTP: " +
              String(status) +
              "\nAPI identity: not matched",
            "error"
          );
          return;
        }

        if (status === 401 || payload.code === "unauthorized") {
          handleAuthFailure(payload, status);
          return;
        }
        if (
          status === 404 &&
          payload.code === "control_room_disabled"
        ) {
          lockRoom(
            formatUnlockFailure("control_room_disabled", status, {
              message: apiMessage(payload, "Control Room is disabled."),
              metaMatch: true,
            }),
            "error"
          );
          return;
        }
        if (payload.code === "scenario_not_found") {
          setMessage(
            runMessage,
            apiMessage(payload, "Scenario was not found."),
            "error"
          );
          return;
        }
        if (payload.code === "runtime_failure") {
          setMessage(
            runMessage,
            formatUnlockFailure("runtime_failure", status, {
              diagnostic: safeDiagnostic(payload),
              message: apiMessage(payload, "Runtime failure."),
              metaMatch: true,
            }).replace(
              "Unable to unlock Control Room.",
              "Unable to run dry run."
            ),
            "error"
          );
          return;
        }
        if (payload.code === "unsafe_result") {
          setMessage(
            runMessage,
            apiMessage(payload, "Unsafe result."),
            "error"
          );
          return;
        }
        if (!outcome.response.ok || payload.ok !== true || !payload.result) {
          setMessage(
            runMessage,
            apiMessage(payload, "Unable to run dry run."),
            "error"
          );
          return;
        }
        unauthorizedStreak = 0;
        renderResult(payload.result);
        setMessage(runMessage, "Dry run complete.", "ok");
      })
      .catch(function () {
        setMessage(
          runMessage,
          "Unable to run dry run.\nCode: network_failure\nHTTP: unavailable",
          "error"
        );
      })
      .then(function () {
        requestInFlight = false;
        unlockButton.disabled = false;
        runButton.disabled = !selectedScenarioId || !accessKey;
      });
  }

  function previewMetaMatches(payload) {
    return (
      !!payload &&
      typeof payload === "object" &&
      payload.meta &&
      typeof payload.meta === "object" &&
      payload.meta.service === EXPECTED_PREVIEW_SERVICE &&
      payload.meta.apiVersion === EXPECTED_PREVIEW_API_VERSION
    );
  }

  function previewRequest(body) {
    var headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (accessKey) {
      headers[ACCESS_HEADER] = accessKey;
    }
    return fetch(PREVIEW_API_PATH, {
      method: "POST",
      headers: headers,
      credentials: "same-origin",
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.text().then(function (text) {
        var payload = null;
        var nonJson = false;
        if (text == null || text === "") {
          nonJson = response.status !== 204;
        } else {
          try {
            payload = JSON.parse(text);
            if (payload == null || typeof payload !== "object") {
              nonJson = true;
              payload = null;
            }
          } catch (_err) {
            nonJson = true;
            payload = null;
          }
        }
        return {
          response: response,
          payload: payload,
          nonJson: nonJson,
        };
      });
    });
  }

  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      previewObjectUrl = url;
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("image_load_failed"));
      };
      img.src = url;
    });
  }

  function compressSourceThroughCanvas(file) {
    return loadImageElement(file).then(function (img) {
      var width = img.naturalWidth || img.width;
      var height = img.naturalHeight || img.height;
      if (!width || !height) {
        throw new Error("invalid_image");
      }
      var longEdge = Math.max(width, height);
      var scale =
        longEdge > PREVIEW_MAX_LONG_EDGE ? PREVIEW_MAX_LONG_EDGE / longEdge : 1;
      // Never upscale.
      if (scale > 1) scale = 1;
      var targetW = Math.max(1, Math.round(width * scale));
      var targetH = Math.max(1, Math.round(height * scale));
      var canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      var ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("canvas_unavailable");
      }
      // Canvas redraw strips EXIF / metadata.
      ctx.drawImage(img, 0, 0, targetW, targetH);
      var dataUri = canvas.toDataURL("image/jpeg", PREVIEW_JPEG_QUALITY);
      var approxBytes = Math.ceil(((dataUri.length - 23) * 3) / 4);
      return {
        dataUri: dataUri,
        width: targetW,
        height: targetH,
        byteLength: approxBytes,
      };
    });
  }

  function clearAdultAndConsentOnSourceRemoval() {
    if (previewAdultCheckbox) previewAdultCheckbox.checked = false;
    if (previewConsentCheckbox) previewConsentCheckbox.checked = false;
  }

  function onPreviewFileSelected() {
    var file =
      previewFileInput && previewFileInput.files && previewFileInput.files[0];
    previewSourceDataUri = null;
    previewSourceMeta = null;
    // Source removal/replacement clears adult + consent (not persisted).
    clearAdultAndConsentOnSourceRemoval();
    if (previewGeneratedImg) {
      previewGeneratedImg.hidden = true;
      previewGeneratedImg.removeAttribute("src");
    }
    if (previewGeneratedPlaceholder) {
      previewGeneratedPlaceholder.hidden = false;
    }
    if (previewGeneratedLinkWrap) previewGeneratedLinkWrap.hidden = true;
    if (!file) {
      if (previewCompare) previewCompare.hidden = true;
      setText(previewImageMeta, "");
      updatePreviewGenerateEnabled();
      return;
    }
    var type = String(file.type || "").toLowerCase();
    if (
      type !== "image/jpeg" &&
      type !== "image/jpg" &&
      type !== "image/png" &&
      type !== "image/webp"
    ) {
      setMessage(
        previewMessage,
        "Unsupported image type. Use JPEG, PNG, or WebP.",
        "error"
      );
      previewFileInput.value = "";
      clearAdultAndConsentOnSourceRemoval();
      updatePreviewGenerateEnabled();
      return;
    }
    setMessage(previewMessage, "Preparing source image…", null);
    compressSourceThroughCanvas(file)
      .then(function (prepared) {
        previewSourceDataUri = prepared.dataUri;
        previewSourceMeta = prepared;
        if (previewCompare) previewCompare.hidden = false;
        if (previewSourceImg) previewSourceImg.src = prepared.dataUri;
        setText(
          previewImageMeta,
          String(prepared.width) +
            "×" +
            String(prepared.height) +
            " · ~" +
            String(Math.round(prepared.byteLength / 1024)) +
            " KB (JPEG canvas, EXIF stripped)"
        );
        setMessage(previewMessage, "Source image ready.", "ok");
        updatePreviewGenerateEnabled();
      })
      .catch(function () {
        previewSourceDataUri = null;
        previewSourceMeta = null;
        setMessage(previewMessage, "Could not prepare source image.", "error");
        updatePreviewGenerateEnabled();
      });
  }

  function renderPreviewStages(stages) {
    clearChildren(previewStageList);
    (stages || []).forEach(function (stage) {
      var row = document.createElement("div");
      row.className = "stage-item";
      var icon = document.createElement("span");
      icon.className = "stage-icon " + (stage.success ? "ok" : "fail");
      icon.textContent = stage.success ? "OK" : "X";
      var main = document.createElement("div");
      var label = document.createElement("strong");
      label.textContent = stage.label || stage.stage || "";
      main.appendChild(label);
      var duration = document.createElement("div");
      duration.className = "scenario-meta";
      duration.textContent = String(stage.durationMs || 0) + " ms";
      row.appendChild(icon);
      row.appendChild(main);
      row.appendChild(duration);
      previewStageList.appendChild(row);
    });
  }

  function renderPreviewSafety(safety) {
    clearChildren(previewSafetyList);
    var entries = [
      ["Internal only", safety && safety.internalOnly === true],
      [
        "Explicit billing confirmation",
        safety && safety.explicitBillingConfirmation === true,
      ],
      ["Request cap applied", safety && safety.requestCapApplied === true],
      [
        "Source image not persisted",
        safety && safety.sourceImagePersisted === false,
      ],
      [
        "Generated image not persisted by HelseApp",
        safety && safety.generatedImagePersistedByHelseApp === false,
      ],
      [
        "Legacy production unchanged",
        safety && safety.legacyProductionChanged === false,
      ],
      [
        "Public cutover disabled",
        safety && safety.publicCutoverEnabled === false,
      ],
    ];
    entries.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = entry[1] ? "ok" : "fail";
      li.textContent = entry[0];
      previewSafetyList.appendChild(li);
    });
  }

  function renderPromptIsolationSummary(isolation, outcome, diagnostic, predictionId) {
    if (!promptIsolationResultSummary) return;
    clearChildren(promptIsolationResultSummary);
    promptIsolationResultSummary.hidden = false;
    appendKv(
      promptIsolationResultSummary,
      "Variant",
      isolation && isolation.variant
    );
    appendKv(
      promptIsolationResultSummary,
      "Radio",
      isolation && isolation.radioLabel
    );
    appendKv(
      promptIsolationResultSummary,
      "Prompt source",
      isolation && isolation.promptSource
    );
    appendKv(
      promptIsolationResultSummary,
      "Formatter",
      isolation && isolation.formatterName
        ? String(isolation.formatterName) +
            " " +
            String(isolation.formatterVersion || "")
        : null
    );
    appendKv(promptIsolationResultSummary, "Model", isolation && isolation.model);
    appendKv(
      promptIsolationResultSummary,
      "Request ID",
      isolation && isolation.requestId
    );
    appendKv(promptIsolationResultSummary, "Outcome", outcome);
    appendKv(promptIsolationResultSummary, "Diagnostic", diagnostic);
    appendKv(promptIsolationResultSummary, "Prediction ID", predictionId);
    appendKv(
      promptIsolationResultSummary,
      "Seed applied",
      isolation && isolation.seedApplied === true
        ? String(isolation.seed)
        : "no (provider nondeterminism possible)"
    );
  }

  function renderPreviewResult(result) {
    if (previewResultPanel) previewResultPanel.hidden = false;
    clearChildren(previewProviderSummary);
    clearChildren(previewValidationSummary);
    var provider = result && result.provider;
    appendKv(
      previewProviderSummary,
      "Provider",
      provider && provider.providerFamily
    );
    appendKv(previewProviderSummary, "Model", provider && provider.model);
    appendKv(
      previewProviderSummary,
      "Prediction",
      provider && provider.predictionId
    );
    appendKv(previewProviderSummary, "Status", provider && provider.status);
    appendKv(
      previewProviderSummary,
      "Duration ms",
      provider && provider.durationMs
    );

    var validation = result && result.validation;
    appendKv(
      previewValidationSummary,
      "Accepted",
      validation && validation.accepted === true ? "yes" : "no"
    );
    appendKv(
      previewValidationSummary,
      "Decision",
      validation && validation.decision
    );

    renderPreviewStages(result.runtime && result.runtime.stages);
    renderPreviewSafety(result.safety);

    var summary =
      result.artifacts && result.artifacts.formattedRequestSummary;
    setText(
      previewPositivePrompt,
      summary && summary.positivePrompt ? summary.positivePrompt : ""
    );
    setText(
      previewNegativePrompt,
      summary && summary.negativePrompt ? summary.negativePrompt : ""
    );
    setText(previewRawProjection, pretty(result));

    renderPromptIsolationSummary(
      result && result.promptIsolation,
      result && result.success === true ? "success" : "failure",
      null,
      provider && provider.predictionId
    );

    var url =
      result.generatedImage && typeof result.generatedImage.url === "string"
        ? result.generatedImage.url
        : "";
    if (url.indexOf("https://") === 0) {
      if (previewGeneratedImg) {
        previewGeneratedImg.hidden = false;
        previewGeneratedImg.src = url;
      }
      if (previewGeneratedPlaceholder) {
        previewGeneratedPlaceholder.hidden = true;
      }
      if (previewGeneratedLinkWrap) previewGeneratedLinkWrap.hidden = false;
      if (previewGeneratedLink) {
        previewGeneratedLink.href = url;
      }
    }
  }

  var PREVIEW_SAFE_CODES = {
    preview_disabled: true,
    unauthorized: true,
    invalid_request: true,
    invalid_image: true,
    image_too_large: true,
    adult_confirmation_required: true,
    consent_confirmation_required: true,
    billing_confirmation_required: true,
    preview_rate_limited: true,
    runtime_failure: true,
    provider_failure: true,
    validation_rejected: true,
    unsafe_result: true,
    network_failure: true,
    non_json_response: true,
    unexpected_api_response: true,
  };

  function formatPreviewFailure(code, httpStatus, options) {
    var safe =
      PREVIEW_SAFE_CODES[code] === true ? code : "unexpected_api_response";
    var message =
      options && typeof options === "object" ? options.message : options;
    var diagnostic =
      options && typeof options === "object" ? options.diagnostic : null;
    var lines = [
      "Unable to generate internal preview.",
      "Code: " + safe,
      "HTTP: " + String(httpStatus),
    ];
    if (diagnostic) {
      lines.push("Diagnostic: " + String(diagnostic));
    }
    if (message) lines.push(String(message));
    return lines.join("\n");
  }

  function generatePreview(options) {
    var fromIsolationLab =
      options && options.fromIsolationLab === true;
    var messageEl = fromIsolationLab ? promptIsolationMessage : previewMessage;
    if (
      previewInFlight ||
      requestInFlight ||
      !accessKey ||
      !selectedScenarioId ||
      !previewSourceDataUri ||
      !(previewAdultCheckbox && previewAdultCheckbox.checked) ||
      !(previewConsentCheckbox && previewConsentCheckbox.checked) ||
      !(previewBillingCheckbox && previewBillingCheckbox.checked)
    ) {
      return;
    }
    var variant = fromIsolationLab
      ? getSelectedPromptIsolationVariant()
      : "current_ai_os";
    previewInFlight = true;
    updatePreviewGenerateEnabled();
    runButton.disabled = true;
    unlockButton.disabled = true;
    setMessage(
      messageEl,
      fromIsolationLab
        ? "Running one paid Prompt Isolation Lab diagnostic preview…"
        : "Running AI OS v2 and generating one paid internal preview…",
      null
    );
    if (fromIsolationLab && promptIsolationResultSummary) {
      clearChildren(promptIsolationResultSummary);
      promptIsolationResultSummary.hidden = true;
    }

    previewRequest({
      scenarioId: selectedScenarioId,
      adultConfirmed: true,
      consentConfirmed: true,
      billingConfirmed: true,
      sourceImageDataUri: previewSourceDataUri,
      promptIsolationVariant: variant,
    })
      .then(function (outcome) {
        var status = outcome.response.status;
        if (outcome.nonJson || outcome.payload == null) {
          setMessage(
            messageEl,
            formatPreviewFailure("non_json_response", status, {
              message: null,
            }),
            "error"
          );
          return;
        }
        var payload = outcome.payload;
        if (!previewMetaMatches(payload) && status !== 404) {
          setMessage(
            messageEl,
            formatPreviewFailure("unexpected_api_response", status, {
              message: null,
            }),
            "error"
          );
          return;
        }
        if (status === 401 || payload.code === "unauthorized") {
          handleAuthFailure(payload, status);
          return;
        }
        if (payload.code === "preview_disabled" || status === 404) {
          setMessage(
            messageEl,
            formatPreviewFailure("preview_disabled", status, {
              message: apiMessage(payload, "Image preview is disabled."),
            }),
            "error"
          );
          return;
        }
        if (!outcome.response.ok || payload.ok !== true || !payload.result) {
          if (payload && payload.promptIsolation) {
            renderPromptIsolationSummary(
              payload.promptIsolation,
              payload.code || "failure",
              safeDiagnostic(payload),
              null
            );
          }
          if (fromIsolationLab) {
            recordIsolationLabExperiment(payload, {
              variant: variant,
              scenarioId: selectedScenarioId,
              diagnostic: safeDiagnostic(payload),
            });
          }
          setMessage(
            messageEl,
            formatPreviewFailure(safeCode(payload, "runtime_failure"), status, {
              diagnostic: safeDiagnostic(payload),
              message: apiMessage(
                payload,
                "Unable to generate internal preview."
              ),
            }),
            "error"
          );
          return;
        }
        unauthorizedStreak = 0;
        if (previewCompare) previewCompare.hidden = false;
        renderPreviewResult(payload.result);
        if (fromIsolationLab) {
          recordIsolationLabExperiment(payload, {
            variant: variant,
            scenarioId: selectedScenarioId,
          });
        }
        setMessage(
          messageEl,
          fromIsolationLab
            ? "Prompt Isolation Lab diagnostic complete."
            : "Internal preview complete.",
          "ok"
        );
      })
      .catch(function () {
        setMessage(
          messageEl,
          formatPreviewFailure("network_failure", "unavailable", {
            message: null,
          }),
          "error"
        );
      })
      .then(function () {
        previewInFlight = false;
        unlockButton.disabled = false;
        runButton.disabled = !selectedScenarioId || !accessKey;
        updatePreviewGenerateEnabled();
      });
  }

  unlockForm.addEventListener("submit", function (event) {
    event.preventDefault();
    unlock();
  });

  lockButton.addEventListener("click", function () {
    lockRoom("Control Room locked.", "ok");
  });

  runButton.addEventListener("click", function () {
    runScenario();
  });

  if (previewFileInput) {
    previewFileInput.addEventListener("change", onPreviewFileSelected);
  }
  if (previewAdultCheckbox) {
    previewAdultCheckbox.addEventListener(
      "change",
      updatePreviewGenerateEnabled
    );
  }
  if (previewConsentCheckbox) {
    previewConsentCheckbox.addEventListener(
      "change",
      updatePreviewGenerateEnabled
    );
  }
  if (previewBillingCheckbox) {
    previewBillingCheckbox.addEventListener("change", updatePreviewGenerateEnabled);
  }
  if (previewGenerateButton) {
    previewGenerateButton.addEventListener("click", function () {
      generatePreview({ fromIsolationLab: false });
    });
  }
  if (promptIsolationGenerateButton) {
    promptIsolationGenerateButton.addEventListener("click", function () {
      generatePreview({ fromIsolationLab: true });
    });
  }
  if (promptExperimentClearButton) {
    promptExperimentClearButton.addEventListener("click", function () {
      clearPromptExperimentHistoryState();
      setMessage(
        promptExperimentHistoryMessage,
        "Session history cleared.",
        "ok"
      );
    });
  }
  if (promptExperimentExportButton) {
    promptExperimentExportButton.addEventListener("click", function () {
      exportPromptExperimentReport();
    });
  }
  renderPromptExperimentHistory();
  updatePreviewGenerateEnabled();
})();
