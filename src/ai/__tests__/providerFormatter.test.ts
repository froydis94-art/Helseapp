/**
 * DEMAND_007 — Provider Formatter foundation tests.
 *
 * Run: npm run test:ai
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BODY_PROFILE_SCHEMA_VERSION,
  type BodyProfile,
} from "../BodyProfile";
import {
  TRANSFORMATION_GOAL_SCHEMA_VERSION,
  type TransformationGoal,
} from "../TransformationGoal";
import { TransformationEngine } from "../TransformationEngine";
import { directVisual } from "../visual";
import { buildRenderPlan, type RenderPlan } from "../render";
import {
  FLUX_FORMATTER_VERSION,
  FluxFormatter,
  toImageGenerationRequest,
  validateFormattedImageRequest,
  type FormattedImageRequest,
} from "../formatters";

function baseProfile(overrides: Partial<BodyProfile> = {}): BodyProfile {
  return {
    schemaVersion: BODY_PROFILE_SCHEMA_VERSION,
    sex: "female",
    age: 32,
    heightCm: 168,
    weightKg: 70,
    bodyFatPct: 28,
    trainingLevel: "intermediate",
    trainingAgeYears: 2,
    activityLevel: "moderate",
    nutritionQuality: "good",
    ...overrides,
  };
}

function baseGoal(overrides: Partial<TransformationGoal> = {}): TransformationGoal {
  return {
    schemaVersion: TRANSFORMATION_GOAL_SCHEMA_VERSION,
    fatDirection: "decrease",
    muscleDirection: "increase",
    targetBodyFatPct: 22,
    targetWeightKg: 65,
    timelineWeeks: 24,
    effortLevel: "moderate",
    focusZones: ["waist", "glutes"],
    musclePriority: 0.5,
    fatLossPriority: 0.7,
    ...overrides,
  };
}

function sampleRenderPlan(
  goalOverrides: Partial<TransformationGoal> = {}
): RenderPlan {
  const engine = new TransformationEngine();
  const profile = baseProfile();
  const goal = baseGoal(goalOverrides);
  const plan = engine.compute(profile, goal);
  const direction = directVisual(profile, goal, plan);
  return buildRenderPlan(plan, direction);
}

const ENUM_KEYS =
  /\b(source_faithful|natural_athletic|documentary_fitness|restrained|pronounced|preserve_exactly|preserve_with_natural_upright_emphasis|slightly_defined)\b/;

const SECTIONS = [
  "SOURCE",
  "IDENTITY",
  "SCENE",
  "TRANSFORM",
  "ANATOMY",
  "REALISM",
] as const;

describe("providerFormatter — DEMAND_007", () => {
  const formatter = new FluxFormatter();

  it("1. identical RenderPlan and options produce identical output", () => {
    const render = sampleRenderPlan();
    const options = { aspectRatio: "1:1", seed: 7, quality: "high" as const };
    const a = formatter.format(render, options);
    const b = formatter.format(render, options);
    assert.deepEqual(a, b);
  });

  it("2. RenderPlan and options are not mutated", () => {
    const render = sampleRenderPlan();
    const options = { aspectRatio: "3:4", seed: 3, quality: "standard" as const };
    const renderBefore = structuredClone(render);
    const optionsBefore = structuredClone(options);
    formatter.format(render, options);
    assert.deepEqual(render, renderBefore);
    assert.deepEqual(options, optionsBefore);
  });

  it("3. output has all six prompt sections", () => {
    const formatted = formatter.format(sampleRenderPlan());
    for (const section of SECTIONS) {
      assert.equal(formatted.prompt.includes(section), true, section);
    }
  });

  it("4. prompt contains no raw enum keys", () => {
    const formatted = formatter.format(sampleRenderPlan(), {
      styleOverride: "documentary_fitness",
    });
    assert.equal(ENUM_KEYS.test(formatted.prompt), false);
  });

  it("5. prompt contains only approved RenderChanges", () => {
    const render = sampleRenderPlan();
    const formatted = formatter.format(render);
    for (const change of render.transformation.approvedChanges) {
      assert.equal(formatted.prompt.includes(change.description), true);
    }
    const transformBlock = formatted.prompt.split("ANATOMY")[0] ?? "";
    assert.equal(/shoulder widening|superhero proportions/i.test(transformBlock), false);
  });

  it("6. unselected regions are not introduced", () => {
    const render = sampleRenderPlan({ focusZones: ["waist", "glutes"] });
    const formatted = formatter.format(render);
    const approvedRegions = new Set(
      render.transformation.approvedChanges
        .map((c) => c.region)
        .filter((r): r is string => typeof r === "string")
    );
    for (const forbidden of ["shoulders", "chest", "arms", "back", "legs"]) {
      if (approvedRegions.has(forbidden)) continue;
      const regionRe = new RegExp(`\\b${forbidden}\\b`, "i");
      assert.equal(regionRe.test(formatted.prompt), false, forbidden);
    }
  });

  it("7. prompt contains no kg or cm values", () => {
    const formatted = formatter.format(sampleRenderPlan());
    assert.equal(/\b\d+(\.\d+)?\s*kg\b/i.test(formatted.prompt), false);
    assert.equal(/\b\d+(\.\d+)?\s*cm\b/i.test(formatted.prompt), false);
  });

  it("8. prompt contains no body-fat percentages", () => {
    const formatted = formatter.format(sampleRenderPlan());
    assert.equal(/body-?fat[^\n]{0,40}\d+(\.\d+)?\s*%/i.test(formatted.prompt), false);
    assert.equal(/\b\d+(\.\d+)?\s*%\b/.test(formatted.prompt), false);
  });

  it("9. prompt contains no Replicate API syntax", () => {
    const formatted = formatter.format(sampleRenderPlan());
    const raw = `${formatted.prompt}\n${formatted.negativePrompt ?? ""}`;
    assert.equal(/replicate|REPLICATE_API_TOKEN|api\.replicate/i.test(raw), false);
  });

  it("10. prompt contains no model IDs or version hashes", () => {
    const formatted = formatter.format(sampleRenderPlan());
    const raw = `${formatted.prompt}\n${formatted.negativePrompt ?? ""}`;
    assert.equal(/model_version|version hash|model id|[a-f0-9]{32,}/i.test(raw), false);
  });

  it("11. negative prompt includes all exclusions", () => {
    const render = sampleRenderPlan();
    const formatted = formatter.format(render);
    assert.ok(formatted.negativePrompt);
    for (const exclusion of render.exclusions) {
      assert.equal(
        (formatted.negativePrompt as string).includes(exclusion),
        true,
        exclusion
      );
    }
  });

  it("12. negative prompt is deduplicated", () => {
    const render = sampleRenderPlan();
    const withDupes: RenderPlan = {
      ...render,
      exclusions: [...render.exclusions, ...render.exclusions],
    };
    const formatted = formatter.format(withDupes);
    const parts = (formatted.negativePrompt ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    assert.equal(parts.length, new Set(parts).size);
  });

  it("13. supported aspect ratios pass through", () => {
    for (const aspectRatio of ["1:1", "4:5", "3:4", "9:16", "16:9"]) {
      const formatted = formatter.format(sampleRenderPlan(), { aspectRatio });
      assert.equal(formatted.aspectRatio, aspectRatio);
      assert.equal(
        formatted.warnings.some((w) => w.code === "unsupported_aspect_ratio"),
        false
      );
    }
  });

  it("14. unsupported aspect ratio is omitted with warning", () => {
    const formatted = formatter.format(sampleRenderPlan(), {
      aspectRatio: "21:9",
    });
    assert.equal(formatted.aspectRatio, undefined);
    assert.equal(
      formatted.warnings.some((w) => w.code === "unsupported_aspect_ratio"),
      true
    );
  });

  it("15. valid seed passes through", () => {
    const formatted = formatter.format(sampleRenderPlan(), { seed: 42 });
    assert.equal(formatted.seed, 42);
  });

  it("16. invalid seed is omitted with warning", () => {
    const formatted = formatter.format(sampleRenderPlan(), {
      seed: -1 as unknown as number,
    });
    assert.equal(formatted.seed, undefined);
    assert.equal(
      formatted.warnings.some((w) => w.code === "provider_limitation"),
      true
    );
  });

  it("17. quality passes through", () => {
    const standard = formatter.format(sampleRenderPlan(), {
      quality: "standard",
    });
    const high = formatter.format(sampleRenderPlan(), { quality: "high" });
    assert.equal(standard.quality, "standard");
    assert.equal(high.quality, "high");
  });

  it("18. style override changes presentation language only", () => {
    const render = sampleRenderPlan();
    const baseStyle = render.realism.presentationStyle;
    const override =
      baseStyle === "natural_athletic"
        ? ("documentary_fitness" as const)
        : ("natural_athletic" as const);
    const base = formatter.format(render);
    const overridden = formatter.format(render, {
      styleOverride: override,
    });
    assert.notEqual(base.prompt, overridden.prompt);
    if (override === "documentary_fitness") {
      assert.match(
        overridden.prompt,
        /documentary fitness-photo presentation/i
      );
    } else {
      assert.match(overridden.prompt, /natural athletic appearance/i);
    }
    assert.equal(overridden.style, override);
    assert.equal(ENUM_KEYS.test(overridden.prompt), false);
  });

  it("19. style override does not alter approvedChanges", () => {
    const render = sampleRenderPlan();
    const before = structuredClone(render.transformation.approvedChanges);
    const formatted = formatter.format(render, {
      styleOverride: "natural_athletic",
    });
    assert.deepEqual(render.transformation.approvedChanges, before);
    for (const change of before) {
      assert.equal(formatted.prompt.includes(change.description), true);
    }
  });

  it("20. source, identity, scene, anatomy, and realism requirements survive", () => {
    const formatted = formatter.format(sampleRenderPlan());
    assert.match(formatted.prompt, /exact source photograph/i);
    assert.match(formatted.prompt, /same person/i);
    assert.match(formatted.prompt, /same face/i);
    assert.match(formatted.prompt, /original pose/i);
    assert.match(formatted.prompt, /skeletal frame/i);
    assert.match(formatted.prompt, /artificial waist compression/i);
    assert.match(formatted.prompt, /natural skin texture|photographic texture/i);
  });

  it("21. formatter metadata matches RenderPlan trace", () => {
    const render = sampleRenderPlan();
    const formatted = formatter.format(render);
    assert.equal(formatted.metadata.formatterName, "FluxFormatter");
    assert.equal(formatted.metadata.formatterVersion, FLUX_FORMATTER_VERSION);
    assert.equal(
      formatted.metadata.renderPlanSchemaVersion,
      render.schemaVersion
    );
    assert.equal(
      formatted.metadata.renderPlanRulesVersion,
      render.rulesVersion
    );
    assert.equal(
      formatted.metadata.transformationRulesVersion,
      render.trace.transformationRulesVersion
    );
    assert.equal(
      formatted.metadata.visualDirectionRulesVersion,
      render.trace.visualDirectionRulesVersion
    );
    assert.equal(
      formatted.metadata.estimateReliability,
      render.trace.estimateReliability
    );
  });

  it("22. validateFormattedImageRequest accepts valid output", () => {
    const formatted = formatter.format(sampleRenderPlan(), {
      aspectRatio: "1:1",
      seed: 1,
      quality: "high",
    });
    const result = validateFormattedImageRequest(formatted);
    assert.equal(result.valid, true, result.errors.join("; "));
  });

  it("23. validator rejects Base64", () => {
    const formatted = formatter.format(sampleRenderPlan());
    const bad: FormattedImageRequest = {
      ...formatted,
      prompt: `${formatted.prompt}\ndata:image/png;base64,AAAA`,
    };
    const result = validateFormattedImageRequest(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /base64/i.test(e)));
  });

  it("24. validator rejects URL-like content", () => {
    const formatted = formatter.format(sampleRenderPlan());
    const bad: FormattedImageRequest = {
      ...formatted,
      prompt: `${formatted.prompt}\nhttps://example.com/image.png`,
    };
    const result = validateFormattedImageRequest(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /url/i.test(e)));
  });

  it("25. validator rejects authorization text", () => {
    const formatted = formatter.format(sampleRenderPlan());
    const bad: FormattedImageRequest = {
      ...formatted,
      prompt: `${formatted.prompt}\nAuthorization: Bearer secret`,
    };
    const result = validateFormattedImageRequest(bad);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => /authorization|bearer/i.test(e))
    );
  });

  it("26. validator rejects prompt_strength and inference-step fields", () => {
    const formatted = formatter.format(sampleRenderPlan());
    const bad: FormattedImageRequest = {
      ...formatted,
      prompt: `${formatted.prompt}\nprompt_strength 0.8 num_inference_steps 28`,
    };
    const result = validateFormattedImageRequest(bad);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) =>
        /prompt_strength|num_inference_steps/i.test(e)
      )
    );
  });

  it("27. formatter contains no fetch, network, or API-key logic", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fluxSrc = readFileSync(
      join(here, "..", "formatters", "FluxFormatter.ts"),
      "utf8"
    );
    const contractSrc = readFileSync(
      join(here, "..", "formatters", "ProviderFormatter.ts"),
      "utf8"
    );
    const joined = `${fluxSrc}\n${contractSrc}`;
    assert.equal(/\bfetch\s*\(/.test(joined), false);
    assert.equal(/\baxios\b|\bhttp\.request\b|\bhttps\.request\b/.test(joined), false);
    assert.equal(/\bprocess\.env\b/.test(joined), false);
    assert.equal(/REPLICATE_API_TOKEN\s*=/.test(joined), false);
    assert.equal(/headers\s*:\s*\{[\s\S]*Authorization/.test(joined), false);
  });

  it("28. existing RenderPlan exports remain usable", () => {
    const render = sampleRenderPlan();
    assert.equal(render.source.operation, "edit_source_image");
    assert.ok(Array.isArray(render.transformation.approvedChanges));
  });

  it("29. toImageGenerationRequest compatibility preserves PromptPackage shape", () => {
    const formatted = formatter.format(sampleRenderPlan(), {
      aspectRatio: "1:1",
      seed: 9,
      quality: "standard",
      styleOverride: "source_faithful",
    });
    const request = toImageGenerationRequest(formatted);
    assert.equal(request.promptPackage.primaryPrompt, formatted.prompt);
    assert.equal(
      request.promptPackage.negativePrompt,
      formatted.negativePrompt ?? ""
    );
    assert.equal(request.aspectRatio, "1:1");
    assert.equal(request.seed, 9);
    assert.equal(request.quality, "standard");
    assert.ok(request.providerOptions);
    assert.equal(request.providerOptions?.providerFamily, "flux");
  });

  it("30. FluxFormatter version and family are stable", () => {
    assert.equal(formatter.version, "1.0");
    assert.equal(formatter.providerFamily, "flux");
    assert.equal(formatter.name, "FluxFormatter");
    assert.ok(formatter.capabilities.includes("negative_prompt"));
    assert.ok(formatter.capabilities.includes("source_image_edit"));
  });
});

describe("providerFormatter — PATCH 017C preserve original presentation", () => {
  const formatter = new FluxFormatter();
  const previewOptions = {
    previewSafetyContext: "non_sexual_fitness_visualization" as const,
  };

  function previewPrompt(): string {
    return formatter.format(sampleRenderPlan(), previewOptions).prompt;
  }

  function previewNegative(): string {
    return formatter.format(sampleRenderPlan(), previewOptions).negativePrompt ?? "";
  }

  const forbiddenJudgment =
    /ordinary underwear only|modest underwear|inappropriate underwear|provocative clothing|sexual clothing|appears young|possibly minor|looks underage|mature-looking|youthful body/i;

  it("1. The formatter preserves original pose", () => {
    const prompt = previewPrompt();
    assert.match(prompt, /original pose/i);
    assert.match(prompt, /original presentation[^\n]*pose/i);
  });

  it("2. The formatter preserves original facial expression", () => {
    assert.match(previewPrompt(), /expression/i);
  });

  it("3. The formatter preserves original camera framing", () => {
    assert.match(previewPrompt(), /camera framing/i);
  });

  it("4. The formatter preserves existing clothing", () => {
    const prompt = previewPrompt();
    assert.match(prompt, /Preserve the clothing/i);
    assert.match(prompt, /Preserve the existing clothing/i);
  });

  it("5. The formatter preserves clothing coverage", () => {
    assert.match(previewPrompt(), /clothing coverage/i);
  });

  it("6. The formatter does not classify underwear as sexual by garment type", () => {
    const prompt = previewPrompt();
    assert.equal(/underwear[^\n]{0,80}sexual|sexual[^\n]{0,80}underwear/i.test(prompt), false);
    assert.equal(forbiddenJudgment.test(prompt), false);
  });

  it("7. The formatter does not classify swimwear as sexual by garment type", () => {
    const prompt = previewPrompt();
    assert.equal(/swimwear[^\n]{0,80}sexual|sexual[^\n]{0,80}swimwear/i.test(prompt), false);
    assert.equal(forbiddenJudgment.test(prompt), false);
  });

  it("8. The formatter does not classify sports bras as sexual by garment type", () => {
    const prompt = previewPrompt();
    assert.equal(
      /sports\s*bras?[^\n]{0,80}sexual|sexual[^\n]{0,80}sports\s*bras?/i.test(prompt),
      false
    );
    assert.equal(forbiddenJudgment.test(prompt), false);
  });

  it("9. The formatter does not judge attractive, confident or glamorous presentation", () => {
    const prompt = previewPrompt();
    assert.match(
      prompt,
      /Do not change the subject's identity, confidence, attractiveness/i
    );
    assert.equal(
      /reduce attractiveness|desexualize|less glamorous|tone down confidence|make less attractive/i.test(
        prompt
      ),
      false
    );
  });

  it("10. The formatter does not infer age from appearance", () => {
    const prompt = previewPrompt();
    assert.equal(
      /estimate age|infer age|age from (appearance|height|weight|body shape|breast|facial|youthful|ethnicity|clothing|pose)/i.test(
        prompt
      ),
      false
    );
    assert.equal(forbiddenJudgment.test(prompt), false);
  });

  it("11. The formatter does not use age estimation language", () => {
    const joined = `${previewPrompt()}\n${previewNegative()}`;
    assert.equal(/appears young|underage|possibly minor|looks underage|mature-looking|youthful body|minor appearance|childlike features|age reduction|age ambiguity/i.test(joined), false);
  });

  it("12. The formatter limits changes to the approved body-progress plan", () => {
    const prompt = previewPrompt();
    assert.match(
      prompt,
      /Only modify the body characteristics required by the approved health and body-progress transformation plan/i
    );
    assert.match(prompt, /Do not introduce unrelated styling changes/i);
  });

  it("13. The formatter includes a narrow prohibition against introducing explicit pornographic content absent from the source", () => {
    const prompt = previewPrompt();
    assert.match(
      prompt,
      /must not introduce explicit pornographic content that is absent from the source image/i
    );
    assert.equal(/No erotic pose|No sexualization|erotic framing/i.test(prompt), false);
  });

  it("14. Existing formatter contracts remain compatible", () => {
    const render = sampleRenderPlan();
    const base = formatter.format(render);
    const preview = formatter.format(render, previewOptions);
    const baseValidation = validateFormattedImageRequest(base);
    const previewValidation = validateFormattedImageRequest(preview);
    assert.equal(baseValidation.valid, true, baseValidation.errors.join("; "));
    assert.equal(previewValidation.valid, true, previewValidation.errors.join("; "));
    assert.equal(base.sourceOperation, "edit_source_image");
    assert.equal(preview.sourceOperation, "edit_source_image");
    assert.equal(preview.prompt.includes("SAFETY"), true);
    assert.equal(base.prompt.includes("SAFETY"), false);
    for (const change of render.transformation.approvedChanges) {
      assert.equal(preview.prompt.includes(change.description), true);
    }
  });

  it("15. No provider, transport, runtime or production file changes", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const repoRoot = join(here, "..", "..", "..");
    const guarded = [
      "src/ai/transport",
      "src/ai/runtime",
      "src/ai/provider",
      "api/generate-future-you.js",
      "lib/replicate.js",
      "lib/visuellPrompt.js",
    ];
    // imagePreviewRuntime.bundle.cjs may be regenerated when ImagePreviewService
    // / formatter diagnostic options change (Demand 018A companion artifact).
    const status = execSync("git status --porcelain -- " + guarded.join(" "), {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    assert.equal(status, "", `unexpected guarded changes:\n${status}`);
  });
});
