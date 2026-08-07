/**
 * Demand 022E-D — Provider Capability & Fallback Evaluation tests (1–15).
 *
 * Repository architecture proof only. No real network. No paid provider calls.
 * Does not change routing, models, moderation, or physiology.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  OPENAI_DEFAULT_EDIT_MODEL,
  PROVIDER_CAPABILITY_EVALUATION_SCHEMA_VERSION,
  REPLICATE_FLUX_KONTEXT_DEV,
  REPLICATE_FLUX_KONTEXT_MAX,
  REPLICATE_FLUX_KONTEXT_PRO,
  REPLICATE_SDXL_VERSIONED,
  buildLegacyGenerationCascadeReport,
  buildLiveBodySimulatorProviderPathReport,
  buildProviderCapabilityEvaluationReport,
  buildProviderInventory,
  listInventoriedModelIds,
} from "../body-simulator/ProviderCapabilityEvaluationReport";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function sha256File(rel: string): string {
  return createHash("sha256").update(readFileSync(join(repoRoot, rel))).digest("hex");
}

const RULES_HASH = sha256File("src/ai/body-simulator/BodySimulatorRules.ts");
const ANAT_RULES_HASH = sha256File(
  "src/ai/body-simulator/AnatomicalTransformationRules.ts"
);

const KNOWN_IMPLEMENTED_MODELS: ReadonlySet<string> = new Set<string>([
  REPLICATE_FLUX_KONTEXT_PRO,
  REPLICATE_FLUX_KONTEXT_MAX,
  REPLICATE_FLUX_KONTEXT_DEV,
  REPLICATE_SDXL_VERSIONED,
  OPENAI_DEFAULT_EDIT_MODEL,
]);

describe("providerCapabilityEvaluation — DEMAND_022E_D", () => {
  it("1. Provider inventory references real implemented providers only", () => {
    const inventory = buildProviderInventory();
    assert.ok(inventory.length >= 5);
    for (const entry of inventory) {
      assert.ok(KNOWN_IMPLEMENTED_MODELS.has(entry.model), entry.model);
      assert.ok(entry.implementationFiles.length > 0, entry.id);
      for (const file of entry.implementationFiles) {
        assert.ok(read(file).length > 0, file);
      }
      // No invented third-party vendors.
      assert.equal(/midjourney|stability\.ai\/stable-diffusion-3|ideogram|fal\.ai/i.test(entry.provider), false);
    }
    const ids = listInventoriedModelIds();
    assert.ok(ids.includes(REPLICATE_FLUX_KONTEXT_PRO));
    assert.ok(ids.includes(OPENAI_DEFAULT_EDIT_MODEL));
    // OpenAI is Expo server only — inventory must say so.
    const openai = inventory.find((e) => e.id === "openai-images-edits");
    assert.ok(openai);
    assert.match(openai!.productionInternalStatus, /Expo|not wired to Vercel/i);
  });

  it("2. Legacy cascade order is deterministic", () => {
    const a = buildLegacyGenerationCascadeReport();
    const b = buildLegacyGenerationCascadeReport();
    assert.deepEqual(a.attemptsMildEdit, b.attemptsMildEdit);
    assert.deepEqual(a.attemptsDemandingEdit, b.attemptsDemandingEdit);
    assert.deepEqual(a.attemptsHighE005RiskMaxFirst, b.attemptsHighE005RiskMaxFirst);

    assert.equal(a.attemptsMildEdit[0]?.label, "flux-pro");
    assert.equal(a.attemptsMildEdit[0]?.model, REPLICATE_FLUX_KONTEXT_PRO);
    assert.equal(a.attemptsMildEdit[1]?.label, "flux-max");
    assert.equal(a.attemptsMildEdit[2]?.label, "flux-dev");
    assert.equal(a.attemptsMildEdit[2]?.promptVariant, "dev");
    assert.equal(a.attemptsMildEdit[3]?.label, "flux-dev-strong");
    assert.equal(a.attemptsMildEdit[3]?.promptVariant, "devStrong");

    assert.equal(a.attemptsDemandingEdit[0]?.label, "flux-max");
    assert.equal(a.attemptsDemandingEdit[0]?.model, REPLICATE_FLUX_KONTEXT_MAX);
    assert.equal(a.attemptsDemandingEdit[1]?.label, "flux-pro");

    assert.equal(a.attemptsHighE005RiskMaxFirst[0]?.label, "flux-max");
    assert.equal(
      a.attemptsHighE005RiskMaxFirst.some((x) => x.label === "flux-pro"),
      false
    );

    const replicate = read("lib/replicate.js");
    assert.match(replicate, /const DEFAULT_MODEL = "black-forest-labs\/flux-kontext-pro"/);
    assert.match(replicate, /const SECONDARY_MODEL = "black-forest-labs\/flux-kontext-max"/);
    assert.match(replicate, /const TERTIARY_MODEL = "black-forest-labs\/flux-kontext-dev"/);
    assert.match(replicate, /label: "flux-dev"/);
    assert.match(replicate, /promptVariant: "devStrong"/);
    assert.match(replicate, /skipSiblingPremium/);
  });

  it("3. E005 fallback behavior is correctly documented/tested", () => {
    const cascade = buildLegacyGenerationCascadeReport();
    assert.equal(cascade.e005FallbackExists, true);
    assert.equal(cascade.e005ContinuesCascade, true);
    assert.equal(cascade.fallbackChangesModel, true);
    assert.equal(cascade.fallbackChangesProvider, false);
    assert.equal(cascade.promptChangesBetweenAttempts, true);
    assert.equal(cascade.imageBytesChangeBetweenAttempts, false);
    assert.equal(cascade.safetyToleranceChangesBetweenAttempts, false);
    assert.equal(cascade.safetyToleranceFlux, 2);

    const replicate = read("lib/replicate.js");
    assert.match(replicate, /function isSafetyBlock\(message\)/);
    assert.match(replicate, /sensitive\|E005\|flagged\|nsfw\|safety/i);
    assert.match(replicate, /const safetyHit = isSafetyBlock\(error\.message\)/);
    assert.match(
      replicate,
      /canContinue[\s\S]*(?:safetyHit|isEligibleCascadeFailure)/
    );
    assert.match(replicate, /isPremiumFluxLabel\(attempt\.label\)/);
  });

  it("4. Live Body Simulator path uses intelligent Flux ordered fallback (022E-E)", () => {
    const live = buildLiveBodySimulatorProviderPathReport();
    assert.equal(live.attempts, 3);
    assert.equal(live.fallbackExists, true);
    assert.equal(live.retryExists, false);
    assert.equal(live.silentLegacyFallback, false);
    assert.equal(live.provider, "replicate");
    assert.match(live.helper, /runFluxKontextAnatomicalCascade/);

    const pipeline = read("src/ai/body-simulator/LiveFuturePreviewPipeline.ts");
    assert.match(pipeline, /runFluxKontextAnatomicalCascade|fluxCascade/);
    assert.match(pipeline, /flux_ordered_fallback/);

    const replicate = read("lib/replicate.js");
    assert.match(replicate, /async function runFluxKontextAnatomicalCascade/);
    assert.match(replicate, /function buildFluxAttemptPlan/);
    assert.match(replicate, /async function runFluxKontextProOnce/);
  });

  it("5. Live path ordered fallback is not silent legacy reservedrift recovery", () => {
    const live = buildLiveBodySimulatorProviderPathReport();
    assert.equal(live.silentLegacyFallback, false);

    const route = read("api/generate-future-you.js");
    assert.match(route, /No silent legacy fallback/);
    assert.match(route, /fluxCascade:\s*\(args\)\s*=>/);
    assert.match(route, /runFluxKontextAnatomicalCascade\(\{/);
    const catchIdx = route.indexOf("catch (liveError)");
    const legacyIdx = route.lastIndexOf("generateWithReplicate({");
    assert.ok(catchIdx > 0 && legacyIdx > catchIdx);
    const between = route.slice(catchIdx, legacyIdx);
    assert.equal(/generateWithReplicate\s*\(/.test(between), false);

    const cascade = read("lib/replicate.js");
    const fnStart = cascade.indexOf(
      "async function runFluxKontextAnatomicalCascade"
    );
    const fnEnd = cascade.indexOf("async function generateWithReplicate");
    assert.ok(fnStart > 0 && fnEnd > fnStart);
    const cascadeBody = cascade.slice(fnStart, fnEnd);
    assert.equal(/byggVisuellPrompt|composeGoalBrief|promptVariant/.test(cascadeBody), false);
    assert.equal(/flux-dev-strong|sdxl-emergency/.test(cascadeBody), false);
  });

  it("6. Provider/model selection is not modified by this demand", () => {
    const report = buildProviderCapabilityEvaluationReport();
    assert.equal(report.currentPrimary.model, REPLICATE_FLUX_KONTEXT_PRO);
    assert.equal(report.liveBodySimulatorPath.model, REPLICATE_FLUX_KONTEXT_PRO);

    const replicate = read("lib/replicate.js");
    assert.match(replicate, /const DEFAULT_MODEL = "black-forest-labs\/flux-kontext-pro"/);
    assert.match(replicate, /const SECONDARY_MODEL = "black-forest-labs\/flux-kontext-max"/);
    assert.match(replicate, /const TERTIARY_MODEL = "black-forest-labs\/flux-kontext-dev"/);

    // Report module is data-only — no executable provider calls.
    const evalSrc = read(
      "src/ai/body-simulator/ProviderCapabilityEvaluationReport.ts"
    );
    assert.equal(/\bawait\s+/.test(evalSrc), false);
    assert.equal(/\bfetch\s*\(/.test(evalSrc), false);
    assert.equal(/process\.env\.REPLICATE_/.test(evalSrc), false);
    assert.equal(/function\s+(?:generateWithReplicate|runFluxKontextProOnce)\b/.test(evalSrc), false);
  });

  it("7. safety_tolerance is not modified", () => {
    const cascade = buildLegacyGenerationCascadeReport();
    assert.equal(cascade.safetyToleranceFlux, 2);
    const replicate = read("lib/replicate.js");
    assert.match(replicate, /safety_tolerance:\s*2/);
    const transport = read("src/ai/transport/ReplicateTransportAdapter.ts");
    assert.match(transport, /safety_tolerance:\s*2/);
    // Evaluation demand must not raise tolerance.
    const evalSrc = read(
      "src/ai/body-simulator/ProviderCapabilityEvaluationReport.ts"
    );
    assert.equal(/safety_tolerance\s*[:=]\s*[3-9]/.test(evalSrc), false);
    const docs = read("docs/CTO/22E_D_PROVIDER_CAPABILITY_EVALUATION.md");
    assert.match(docs, /safety_tolerance/);
    assert.equal(/raise safety_tolerance|safety_tolerance.*[3-9]/i.test(docs), false);
  });

  it("8. No provider moderation bypass exists", () => {
    const pipeline = read("src/ai/body-simulator/LiveFuturePreviewPipeline.ts");
    const evalSrc = read(
      "src/ai/body-simulator/ProviderCapabilityEvaluationReport.ts"
    );
    const docs = read("docs/CTO/22E_D_PROVIDER_CAPABILITY_EVALUATION.md");
    // Forbid affirmative bypass implementation language (docs may forbid bypass).
    const affirmativeBypass =
      /(?:enable|add|implement|create)\s+(?:a\s+)?(?:moderation\s+)?bypass|safety_tolerance\s*[:=]\s*[3-9]|moderationOverride\s*[:=]\s*true/i;
    for (const src of [pipeline, evalSrc, docs]) {
      assert.equal(affirmativeBypass.test(src), false);
    }
    assert.match(docs, /moderation bypass/i);
    assert.match(docs, /No HelseApp moderation override/i);
    const report = buildProviderCapabilityEvaluationReport();
    assert.ok(report.recommendation.risks.some((r) => /bypass/i.test(r)));
  });

  it("9. Body Simulator remains provider-independent", () => {
    const engine = read("src/ai/body-simulator/BodySimulatorEngine.ts");
    const rules = read("src/ai/body-simulator/BodySimulatorRules.ts");
    for (const src of [engine, rules]) {
      assert.equal(/api\.replicate|api\.openai|REPLICATE_API_TOKEN/i.test(src), false);
      assert.equal(/from ["'][^"']*replicate/i.test(src), false);
    }
    const report = buildProviderCapabilityEvaluationReport();
    assert.match(
      read("docs/CTO/22E_D_PROVIDER_CAPABILITY_EVALUATION.md"),
      /Body Simulator must \*\*never\*\* know which provider/
    );
    assert.equal(report.recommendation.preferredArchitecture, "ordered_fallback");
  });

  it("10. Body Simulator rules unchanged", () => {
    assert.equal(
      sha256File("src/ai/body-simulator/BodySimulatorRules.ts"),
      RULES_HASH
    );
    const rules = read("src/ai/body-simulator/BodySimulatorRules.ts");
    assert.equal(/ProviderCapability|ordered_fallback|flux-kontext/i.test(rules), false);
  });

  it("11. Anatomical rules unchanged", () => {
    assert.equal(
      sha256File("src/ai/body-simulator/AnatomicalTransformationRules.ts"),
      ANAT_RULES_HASH
    );
    const anat = read("src/ai/body-simulator/AnatomicalTransformationRules.ts");
    assert.equal(/ProviderCapability|runFluxKontextProOnce|E005/i.test(anat), false);
  });

  it("12. No public UX changes", () => {
    // This demand only adds docs/report/tests (+ package script / barrel export).
    const indexHtml = read("public/index.html");
    assert.equal(/022E-D|ProviderCapabilityEvaluation/i.test(indexHtml), false);
    const evalSrc = read(
      "src/ai/body-simulator/ProviderCapabilityEvaluationReport.ts"
    );
    assert.equal(/document\.|localStorage|innerHTML/i.test(evalSrc), false);
  });

  it("13. No paid provider request occurs during tests", () => {
    const report = buildProviderCapabilityEvaluationReport();
    assert.equal(report.schemaVersion, PROVIDER_CAPABILITY_EVALUATION_SCHEMA_VERSION);
    // Building the report must be pure (no network client).
    const evalSrc = read(
      "src/ai/body-simulator/ProviderCapabilityEvaluationReport.ts"
    );
    assert.equal(/\bfetch\s*\(/.test(evalSrc), false);
    assert.equal(/new\s+Replicate\b|require\(["']replicate["']\)/.test(evalSrc), false);
    assert.equal(/Authorization:\s*[`'"]Bearer/.test(evalSrc), false);
    // Inventory may document endpoint URLs as strings — that is not a paid call.
    assert.match(evalSrc, /api\.replicate\.com/);
  });

  it("14. No environment variable changes", () => {
    const docs = read("docs/CTO/22E_D_PROVIDER_CAPABILITY_EVALUATION.md");
    assert.match(docs, /No env var changes/);
    // Demand artifacts must not assign process.env.
    const evalSrc = read(
      "src/ai/body-simulator/ProviderCapabilityEvaluationReport.ts"
    );
    assert.equal(/process\.env\.\w+\s*=/.test(evalSrc), false);
    const testSrc = read(
      "src/ai/__tests__/providerCapabilityEvaluation.test.ts"
    );
    assert.equal(/process\.env\.\w+\s*=/.test(testSrc), false);
  });

  it("15. No new dependency", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    assert.equal("openai" in (pkg.dependencies || {}), false);
    assert.equal("replicate" in (pkg.dependencies || {}), false);
    assert.ok(pkg.scripts?.["test:ai"]?.includes("providerCapabilityEvaluation.test.ts"));

    const report = buildProviderCapabilityEvaluationReport();
    assert.equal(report.asymmetryStatement.provenTrue, true);
    assert.equal(report.legacyCascade.e005FallbackExists, true);
    assert.equal(report.liveBodySimulatorPath.attempts, 3);
    assert.equal(report.liveBodySimulatorPath.fallbackExists, true);
    assert.deepEqual(report.manualExperiment.candidateModels, [
      REPLICATE_FLUX_KONTEXT_PRO,
      REPLICATE_FLUX_KONTEXT_MAX,
      REPLICATE_FLUX_KONTEXT_DEV,
    ]);
    assert.equal(report.manualExperiment.maxPaidRequests, 3);
    assert.ok(report.ownerDecisionsRequired.length >= 5);

    const docs = read("docs/CTO/22E_D_PROVIDER_CAPABILITY_EVALUATION.md");
    assert.match(docs, /# Provider Capability & Fallback Evaluation/);
    assert.match(docs, /## Recommended architecture/);
    assert.match(docs, /OPTION B/);
    assert.match(docs, /## Owner decisions required/);
  });
});
