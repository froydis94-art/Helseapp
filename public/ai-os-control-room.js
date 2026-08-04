(function () {
  "use strict";

  var API_PATH = "/api/ai-os-control-room";
  var ACCESS_HEADER = "X-AI-OS-Control-Room-Key";
  var EXPECTED_SERVICE = "ai-os-control-room";
  var EXPECTED_API_VERSION = "1.1";
  var UNAUTH_STREAK_LIMIT = 2;

  var accessKey = null;
  var unauthorizedStreak = 0;
  var selectedScenarioId = null;
  var scenarios = [];
  var currentResult = null;
  var requestInFlight = false;

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
    resultPanel.hidden = true;
    clearChildren(scenarioList);
    clearResultViews();
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
    lockButton.disabled = false;
    accessKeyInput.value = "";
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
      });

      scenarioList.appendChild(button);
    });
    runButton.disabled = !selectedScenarioId || requestInFlight;
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
})();
