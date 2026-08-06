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
    updatePreviewGenerateEnabled();
  }

  function updatePreviewGenerateEnabled() {
    if (!previewGenerateButton) return;
    var ready =
      !!accessKey &&
      !!selectedScenarioId &&
      !!previewSourceDataUri &&
      !!(previewAdultCheckbox && previewAdultCheckbox.checked) &&
      !!(previewConsentCheckbox && previewConsentCheckbox.checked) &&
      !!(previewBillingCheckbox && previewBillingCheckbox.checked) &&
      !previewInFlight &&
      !requestInFlight;
    previewGenerateButton.disabled = !ready;
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

  function onPreviewFileSelected() {
    var file =
      previewFileInput && previewFileInput.files && previewFileInput.files[0];
    previewSourceDataUri = null;
    previewSourceMeta = null;
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

  function generatePreview() {
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
    previewInFlight = true;
    updatePreviewGenerateEnabled();
    runButton.disabled = true;
    unlockButton.disabled = true;
    setMessage(
      previewMessage,
      "Running AI OS v2 and generating one paid internal preview…",
      null
    );

    previewRequest({
      scenarioId: selectedScenarioId,
      adultConfirmed: true,
      consentConfirmed: true,
      billingConfirmed: true,
      sourceImageDataUri: previewSourceDataUri,
    })
      .then(function (outcome) {
        var status = outcome.response.status;
        if (outcome.nonJson || outcome.payload == null) {
          setMessage(
            previewMessage,
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
            previewMessage,
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
            previewMessage,
            formatPreviewFailure("preview_disabled", status, {
              message: apiMessage(payload, "Image preview is disabled."),
            }),
            "error"
          );
          return;
        }
        if (!outcome.response.ok || payload.ok !== true || !payload.result) {
          setMessage(
            previewMessage,
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
        setMessage(previewMessage, "Internal preview complete.", "ok");
      })
      .catch(function () {
        setMessage(
          previewMessage,
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
    previewGenerateButton.addEventListener("click", generatePreview);
  }
  updatePreviewGenerateEnabled();
})();
