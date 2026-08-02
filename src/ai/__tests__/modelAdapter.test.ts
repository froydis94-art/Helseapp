/**
 * DEMAND_004 — Model adapter layer tests.
 *
 * Covers ModelRegistry, adapter contract (stub), and PromptPackage compatibility.
 * Run: npm run test:ai
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BODY_PROFILE_SCHEMA_VERSION,
  type BodyProfile,
} from "../BodyProfile";
import {
  TRANSFORMATION_GOAL_SCHEMA_VERSION,
  type TransformationGoal,
} from "../TransformationGoal";
import { TransformationEngine } from "../TransformationEngine";
import { buildPromptPackage, type PromptPackage } from "../PromptBuilder";
import {
  ModelRegistry,
  ReplicateAdapter,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ModelAdapter,
} from "../model";

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

function samplePromptPackage(): PromptPackage {
  const engine = new TransformationEngine();
  const plan = engine.compute(baseProfile(), baseGoal());
  return buildPromptPackage(baseProfile(), baseGoal(), plan);
}

describe("modelAdapter — ModelRegistry", () => {
  it("register / get / default resolve the same adapter", () => {
    const registry = new ModelRegistry();
    const adapter = new ReplicateAdapter();
    registry.register(adapter, { default: true });
    assert.equal(registry.get("replicate-stub"), adapter);
    assert.equal(registry.default(), adapter);
    assert.deepEqual(registry.ids(), ["replicate-stub"]);
  });

  it("first registered adapter becomes default when not marked", () => {
    const registry = new ModelRegistry();
    const first = new ReplicateAdapter();
    registry.register(first);
    assert.equal(registry.default().id, "replicate-stub");
  });

  it("default() throws when empty", () => {
    const registry = new ModelRegistry();
    assert.throws(() => registry.default(), /no default adapter/);
  });

  it("rejects empty adapter id", () => {
    const registry = new ModelRegistry();
    const bad: ModelAdapter = {
      id: "  ",
      provider: "test",
      async generate(): Promise<ImageGenerationResult> {
        return {
          success: false,
          imageUrl: null,
          provider: "test",
          model: "x",
          generationTimeMs: 0,
          warnings: [],
          metadata: {},
        };
      },
    };
    assert.throws(() => registry.register(bad), /non-empty/);
  });
});

describe("modelAdapter — ReplicateAdapter contract (stub)", () => {
  it("toRequest maps PromptPackage without provider-specific fields", () => {
    const pkg = samplePromptPackage();
    const request = ReplicateAdapter.toRequest(pkg, {
      aspectRatio: "3:4",
      seed: 42,
      quality: "standard",
      style: "photorealistic",
    });

    assert.equal(request.promptPackage, pkg);
    assert.equal(request.aspectRatio, "3:4");
    assert.equal(request.seed, 42);
    assert.equal(request.quality, "standard");
    assert.equal(request.style, "photorealistic");

    const keys = Object.keys(request);
    assert.ok(!keys.includes("predictionId"));
    assert.ok(!keys.includes("replicatePredictionId"));
    assert.ok(!("version" in request));
  });

  it("generate returns structured stub result without success image", async () => {
    const adapter = new ReplicateAdapter();
    const request = ReplicateAdapter.toRequest(samplePromptPackage());
    const result = await adapter.generate(request);

    assert.equal(result.success, false);
    assert.equal(result.imageUrl, null);
    assert.equal(result.provider, "replicate");
    assert.equal(result.model, "replicate-stub");
    assert.ok(result.generationTimeMs >= 0);
    assert.ok(result.warnings.length >= 1);
    assert.equal(result.metadata.stub, true);
    assert.ok(
      typeof result.metadata.primaryPromptLength === "number" &&
        (result.metadata.primaryPromptLength as number) > 0
    );
  });

  it("satisfies ModelAdapter via registry.default().generate", async () => {
    const registry = new ModelRegistry();
    registry.register(new ReplicateAdapter(), { default: true });
    const result = await registry.default().generate(
      ReplicateAdapter.toRequest(samplePromptPackage(), { quality: "draft" })
    );
    assert.equal(result.provider, "replicate");
    assert.equal(result.success, false);
  });
});

describe("modelAdapter — PromptPackage compatibility", () => {
  it("request retains all PromptPackage fields from buildPromptPackage", () => {
    const pkg = samplePromptPackage();
    const request: ImageGenerationRequest = ReplicateAdapter.toRequest(pkg);

    assert.ok(typeof request.promptPackage.primaryPrompt === "string");
    assert.ok(request.promptPackage.primaryPrompt.length > 0);
    assert.ok(typeof request.promptPackage.negativePrompt === "string");
    assert.ok(Array.isArray(request.promptPackage.identityConstraints));
    assert.ok(Array.isArray(request.promptPackage.anatomyConstraints));
    assert.ok(Array.isArray(request.promptPackage.transformationInstructions));
    assert.ok(request.promptPackage.transformationInstructions.length > 0);
    assert.equal(
      typeof request.promptPackage.metadata.rulesVersion,
      "string"
    );
    assert.equal(
      typeof request.promptPackage.metadata.visualIntensity,
      "string"
    );
    assert.equal(
      typeof request.promptPackage.metadata.estimateReliability,
      "string"
    );
  });

  it("plan → prompt → adapter request chain preserves intensity metadata", () => {
    const engine = new TransformationEngine();
    const plan = engine.compute(baseProfile(), baseGoal());
    const pkg = buildPromptPackage(baseProfile(), baseGoal(), plan);
    const request = ReplicateAdapter.toRequest(pkg);

    assert.equal(
      request.promptPackage.metadata.visualIntensity,
      plan.visualIntensity
    );
    assert.equal(
      request.promptPackage.metadata.estimateReliability,
      plan.estimateReliability
    );
    assert.equal(
      request.promptPackage.metadata.rulesVersion,
      plan.rulesVersion
    );
  });
});
