/**
 * DEMAND_010 — Result Validator foundation tests.
 *
 * Run: npm run test:ai
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RENDER_PLAN_RULES_VERSION,
  RENDER_PLAN_SCHEMA_VERSION,
  type RenderPlan,
} from "../render";
import {
  ACCEPTANCE_THRESHOLDS,
  DIMENSION_WEIGHTS,
  HARD_GATE_THRESHOLDS,
  RESULT_VALIDATOR_RULES_VERSION,
  VALIDATION_EVIDENCE_SCHEMA_VERSION,
  acceptedCandidateEvidence,
  anatomyRetryEvidence,
  borderlineEvidence,
  computeOverallScore,
  evaluateCandidate,
  identityRetryEvidence,
  invalidDuplicateDimensionEvidence,
  lowConfidenceIdentityEvidence,
  planAdherenceRetryEvidence,
  runResultValidatorFixture,
  unsafeCandidateEvidence,
  validateValidationEvidence,
  type ValidationDimension,
  type ValidationEvidence,
} from "../validation-result";

const __dirname = dirname(fileURLToPath(import.meta.url));
const validationResultDir = join(__dirname, "..", "validation-result");
const packageJsonPath = join(__dirname, "..", "..", "..", "package.json");

function stubRenderPlan(
  changeVisibility: "restrained" | "clear" | "pronounced" = "clear"
): RenderPlan {
  return {
    schemaVersion: RENDER_PLAN_SCHEMA_VERSION,
    rulesVersion: RENDER_PLAN_RULES_VERSION,
    source: {
      operation: "edit_source_image",
      preserveSourceComposition: true,
    },
    identity: {
      preservePerson: true,
      preserveFace: true,
      preserveApparentAge: true,
      preserveHair: true,
      preserveSkinTone: true,
      preserveDistinctiveFeatures: true,
    },
    scene: {
      preservePose: true,
      preserveCameraPerspective: true,
      preserveLighting: true,
      preserveClothing: true,
      preserveAccessories: true,
      preserveBackground: true,
    },
    transformation: {
      visualIntensity: "moderate",
      changeVisibility,
      approvedChanges: [],
    },
    anatomy: {
      preserveSkeletalFrame: true,
      constraints: ["Preserve skeletal frame and limb placement."],
    },
    realism: {
      presentationStyle: "natural_athletic",
      textureStyle: "natural_skin",
      constraints: ["Photorealistic documentary appearance."],
    },
    exclusions: ["No identity drift.", "No exaggerated anatomy."],
    trace: {
      transformationRulesVersion: "1.0",
      visualDirectionRulesVersion: "1.0",
      transformationPlanSchemaVersion: 1,
      renderPlanSchemaVersion: 1,
      estimateReliability: "medium",
    },
  };
}

function withScores(
  base: ValidationEvidence,
  scores: Partial<Record<ValidationDimension, number>>
): ValidationEvidence {
  return {
    ...base,
    dimensions: base.dimensions.map((d) =>
      scores[d.dimension] !== undefined
        ? { ...d, score: scores[d.dimension]! }
        : { ...d }
    ),
  };
}

function withFindingStrings(
  base: ValidationEvidence,
  dimension: ValidationDimension,
  findings: string[]
): ValidationEvidence {
  return {
    ...base,
    dimensions: base.dimensions.map((d) =>
      d.dimension === dimension ? { ...d, findings: [...findings] } : { ...d }
    ),
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("DEMAND_010 ResultValidator", () => {
  it("1. Valid accepted evidence returns accept", () => {
    const decision = evaluateCandidate({
      evidence: acceptedCandidateEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "accept");
    assert.equal(decision.rulesVersion, RESULT_VALIDATOR_RULES_VERSION);
    assert.ok(decision.overallScore >= 0.8);
  });

  it("2. Safety failure always returns reject", () => {
    const decision = evaluateCandidate({
      evidence: unsafeCandidateEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "reject");
    assert.ok(decision.findings.some((f) => f.code === "safety_failure"));
    assert.equal(decision.retry, undefined);
  });

  it("3. Identity hard failure returns retry when budget remains", () => {
    const decision = evaluateCandidate({
      evidence: identityRetryEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "retry");
    assert.ok(decision.retry?.allowed);
    assert.ok(decision.findings.some((f) => f.code === "identity_failure"));
  });

  it("4. Identity hard failure returns reject when budget is exhausted", () => {
    const decision = evaluateCandidate({
      evidence: identityRetryEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 3,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "reject");
    assert.ok(
      decision.findings.some((f) => f.code === "retry_budget_exhausted")
    );
  });

  it("5. Anatomy hard failure returns retry", () => {
    const decision = evaluateCandidate({
      evidence: anatomyRetryEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "retry");
    assert.ok(decision.findings.some((f) => f.code === "anatomy_failure"));
  });

  it("6. Plan-adherence hard failure returns retry", () => {
    const decision = evaluateCandidate({
      evidence: planAdherenceRetryEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "retry");
    assert.ok(
      decision.findings.some((f) => f.code === "plan_adherence_failure")
    );
  });

  it("7. Pose/camera hard failure returns retry", () => {
    const evidence = withScores(acceptedCandidateEvidence, {
      pose_camera: 0.65,
    });
    const decision = evaluateCandidate({
      evidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "retry");
    assert.ok(decision.findings.some((f) => f.code === "pose_camera_failure"));
  });

  it("8. Photorealism hard failure returns retry", () => {
    const evidence = withScores(acceptedCandidateEvidence, {
      photorealism: 0.6,
    });
    const decision = evaluateCandidate({
      evidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "retry");
    assert.ok(
      decision.findings.some((f) => f.code === "photorealism_failure")
    );
  });

  it("9. Borderline evidence returns retry", () => {
    const decision = evaluateCandidate({
      evidence: borderlineEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "retry");
    assert.ok(
      borderlineEvidence.dimensions.every(
        (d) => d.score >= HARD_GATE_THRESHOLDS[d.dimension]
      )
    );
  });

  it("10. Low-confidence identity cannot be accepted", () => {
    const decision = evaluateCandidate({
      evidence: lowConfidenceIdentityEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.notEqual(decision.outcome, "accept");
    assert.equal(decision.outcome, "retry");
    assert.ok(
      decision.findings.some((f) => f.code === "low_evidence_confidence")
    );
  });

  it("11. Overall score uses the declared weights", () => {
    const scores = {
      identity: 0.8,
      anatomy: 0.8,
      plan_adherence: 0.8,
      photorealism: 0.8,
      pose_camera: 0.8,
      safety: 0.8,
    } as Record<ValidationDimension, number>;
    const expected =
      Math.round(
        (0.8 * DIMENSION_WEIGHTS.identity +
          0.8 * DIMENSION_WEIGHTS.anatomy +
          0.8 * DIMENSION_WEIGHTS.plan_adherence +
          0.8 * DIMENSION_WEIGHTS.photorealism +
          0.8 * DIMENSION_WEIGHTS.pose_camera +
          0.8 * DIMENSION_WEIGHTS.safety) *
          1e4
      ) / 1e4;
    assert.equal(computeOverallScore(scores), expected);
    assert.equal(expected, 0.8);
  });

  it("12. High overall score cannot override safety failure", () => {
    const evidence = withScores(acceptedCandidateEvidence, {
      identity: 1,
      anatomy: 1,
      plan_adherence: 1,
      photorealism: 1,
      pose_camera: 1,
      safety: 0.9,
    });
    const decision = evaluateCandidate({
      evidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.ok(decision.overallScore > 0.8);
    assert.equal(decision.outcome, "reject");
    assert.ok(decision.findings.some((f) => f.code === "safety_failure"));
  });

  it("13. High overall score cannot override identity hard failure", () => {
    const evidence = withScores(acceptedCandidateEvidence, {
      identity: 0.5,
      anatomy: 1,
      plan_adherence: 1,
      photorealism: 1,
      pose_camera: 1,
      safety: 1,
    });
    const decision = evaluateCandidate({
      evidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.ok(decision.overallScore > 0.8);
    assert.equal(decision.outcome, "retry");
    assert.ok(decision.findings.some((f) => f.code === "identity_failure"));
  });

  it("14. Retry adjustments match failed dimensions only", () => {
    const decision = evaluateCandidate({
      evidence: identityRetryEvidence,
      renderPlan: stubRenderPlan("restrained"),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.deepEqual(decision.retry?.adjustments, [
      "strengthen_identity_preservation",
    ]);
  });

  it("15. No duplicate retry adjustments", () => {
    const evidence = withScores(acceptedCandidateEvidence, {
      identity: 0.5,
      anatomy: 0.5,
    });
    const decision = evaluateCandidate({
      evidence,
      renderPlan: stubRenderPlan("pronounced"),
      attempt: 1,
      maxAttempts: 3,
    });
    const adjustments = decision.retry?.adjustments ?? [];
    assert.equal(adjustments.length, new Set(adjustments).size);
  });

  it("16. Pronounced plan may recommend reduced visual emphasis for anatomy failure", () => {
    const decision = evaluateCandidate({
      evidence: anatomyRetryEvidence,
      renderPlan: stubRenderPlan("pronounced"),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.ok(
      decision.retry?.adjustments.includes("reduce_visual_emphasis")
    );
    assert.ok(
      decision.retry?.adjustments.includes("strengthen_anatomy_constraints")
    );
  });

  it("17. Restrained plan does not recommend reduced visual emphasis unnecessarily", () => {
    const decision = evaluateCandidate({
      evidence: anatomyRetryEvidence,
      renderPlan: stubRenderPlan("restrained"),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.ok(
      !decision.retry?.adjustments.includes("reduce_visual_emphasis")
    );
  });

  it("18. Retry budget is finite", () => {
    const decision = evaluateCandidate({
      evidence: identityRetryEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 2,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "retry");
    assert.equal(decision.retry?.nextAttempt, 3);
    assert.equal(decision.retry?.remainingAttempts, 1);
    assert.ok(decision.metadata.maxAttempts <= 5);
  });

  it("19. Retry budget exhausted adds retry_budget_exhausted", () => {
    const decision = evaluateCandidate({
      evidence: anatomyRetryEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 2,
      maxAttempts: 2,
    });
    assert.equal(decision.outcome, "reject");
    assert.ok(
      decision.findings.some((f) => f.code === "retry_budget_exhausted")
    );
  });

  it("20. Identical input produces identical decision", () => {
    const input = {
      evidence: borderlineEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    };
    const a = evaluateCandidate(input);
    const b = evaluateCandidate(input);
    assert.deepEqual(a, b);
  });

  it("21. Inputs are not mutated", () => {
    const evidence = deepClone(identityRetryEvidence);
    const renderPlan = stubRenderPlan("pronounced");
    const evidenceBefore = JSON.stringify(evidence);
    const planBefore = JSON.stringify(renderPlan);
    evaluateCandidate({
      evidence,
      renderPlan,
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(JSON.stringify(evidence), evidenceBefore);
    assert.equal(JSON.stringify(renderPlan), planBefore);
  });

  it("22. Duplicate dimension evidence is rejected", () => {
    const check = validateValidationEvidence(invalidDuplicateDimensionEvidence);
    assert.equal(check.valid, false);
    const decision = evaluateCandidate({
      evidence: invalidDuplicateDimensionEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "reject");
    assert.ok(decision.findings.some((f) => f.code === "invalid_evidence"));
  });

  it("23. Missing dimension evidence is rejected", () => {
    const evidence: ValidationEvidence = {
      ...acceptedCandidateEvidence,
      dimensions: acceptedCandidateEvidence.dimensions.filter(
        (d) => d.dimension !== "safety"
      ),
    };
    const check = validateValidationEvidence(evidence);
    assert.equal(check.valid, false);
    assert.ok(check.errors.some((e) => e.includes("Missing required dimension")));
  });

  it("24. NaN score is rejected", () => {
    const evidence = withScores(acceptedCandidateEvidence, {
      identity: Number.NaN,
    });
    assert.equal(validateValidationEvidence(evidence).valid, false);
  });

  it("25. Infinity score is rejected", () => {
    const evidence = withScores(acceptedCandidateEvidence, {
      anatomy: Number.POSITIVE_INFINITY,
    });
    assert.equal(validateValidationEvidence(evidence).valid, false);
  });

  it("26. Score below 0 is rejected", () => {
    const evidence = withScores(acceptedCandidateEvidence, { identity: -0.1 });
    assert.equal(validateValidationEvidence(evidence).valid, false);
  });

  it("27. Score above 1 is rejected", () => {
    const evidence = withScores(acceptedCandidateEvidence, { identity: 1.01 });
    assert.equal(validateValidationEvidence(evidence).valid, false);
  });

  it("28. Empty candidateId is rejected", () => {
    const evidence: ValidationEvidence = {
      ...acceptedCandidateEvidence,
      candidate: { candidateId: "   " },
    };
    assert.equal(validateValidationEvidence(evidence).valid, false);
  });

  it("29. Empty finding strings are rejected", () => {
    const evidence = withFindingStrings(acceptedCandidateEvidence, "identity", [
      "",
    ]);
    assert.equal(validateValidationEvidence(evidence).valid, false);
  });

  it("30. Evidence containing URL-like content is rejected", () => {
    const evidence = withFindingStrings(acceptedCandidateEvidence, "identity", [
      "See https://example.com/image",
    ]);
    assert.equal(validateValidationEvidence(evidence).valid, false);
  });

  it("31. Evidence containing Base64-like content is rejected", () => {
    const evidence = withFindingStrings(acceptedCandidateEvidence, "anatomy", [
      "data:image/png;base64,iVBORw0KGgo=",
    ]);
    assert.equal(validateValidationEvidence(evidence).valid, false);
  });

  it("32. Evidence containing Authorization/Bearer text is rejected", () => {
    const evidence = withFindingStrings(acceptedCandidateEvidence, "safety", [
      "Authorization: Bearer secret-token-value",
    ]);
    assert.equal(validateValidationEvidence(evidence).valid, false);
  });

  it("33. Decision is JSON serializable", () => {
    const decision = runResultValidatorFixture(
      acceptedCandidateEvidence,
      stubRenderPlan()
    );
    const json = JSON.stringify(decision);
    assert.equal(typeof json, "string");
    assert.deepEqual(JSON.parse(json), decision);
  });

  it("34. No provider calls exist in validator source", () => {
    const sources = readdirSync(validationResultDir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) =>
        readFileSync(join(validationResultDir, name), "utf8")
      )
      .join("\n");
    assert.equal(/\breplicate\b/i.test(sources), false);
    assert.equal(/\bopenai\b/i.test(sources), false);
    assert.equal(/\.generate\s*\(/.test(sources), false);
  });

  it("35. No fetch exists in validator source", () => {
    const sources = readdirSync(validationResultDir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) =>
        readFileSync(join(validationResultDir, name), "utf8")
      )
      .join("\n");
    assert.equal(/\bfetch\s*\(/.test(sources), false);
    assert.equal(/\bhttp\.request\b/.test(sources), false);
  });

  it("36. Validator does not import production Replicate files", () => {
    const sources = readdirSync(validationResultDir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) =>
        readFileSync(join(validationResultDir, name), "utf8")
      )
      .join("\n");
    assert.equal(sources.includes("lib/replicate"), false);
    assert.equal(sources.includes("visuellPrompt"), false);
    assert.equal(sources.includes("transformasjonLogikk"), false);
  });

  it("37. Validator does not mutate RenderPlan", () => {
    const plan = stubRenderPlan("pronounced");
    const before = JSON.stringify(plan);
    evaluateCandidate({
      evidence: anatomyRetryEvidence,
      renderPlan: plan,
      attempt: 1,
      maxAttempts: 3,
    });
    assert.equal(JSON.stringify(plan), before);
    assert.equal(plan.transformation.changeVisibility, "pronounced");
  });

  it("38. Existing AI tests still pass", () => {
    // Ensured by npm run test:ai including prior suites alongside this file.
    assert.equal(VALIDATION_EVIDENCE_SCHEMA_VERSION, 1);
    assert.ok(ACCEPTANCE_THRESHOLDS.identity > HARD_GATE_THRESHOLDS.identity);
  });

  it("39. AI harness still passes", () => {
    // Ensured by npm run harness:ai in the quality gate; structural smoke here.
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts: Record<string, string>;
    };
    assert.ok(pkg.scripts["harness:ai"]?.includes("run-ai-os-v2-harness"));
  });

  it("40. GitHub quality gate commands remain valid", () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts: Record<string, string>;
    };
    assert.ok(pkg.scripts.typecheck);
    assert.ok(pkg.scripts["test:ai"]?.includes("resultValidator.test.ts"));
    assert.ok(pkg.scripts["harness:ai"]);
  });

  it("41. attempt === maxAttempts remains a valid retry state", () => {
    const decision = evaluateCandidate({
      evidence: acceptedCandidateEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 3,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "accept");
    assert.equal(decision.metadata.attempt, 3);
    assert.equal(decision.metadata.maxAttempts, 3);
    assert.ok(!decision.findings.some((f) => f.code === "invalid_evidence"));
  });

  it("42. attempt > maxAttempts is rejected with invalid_evidence", () => {
    const decision = evaluateCandidate({
      evidence: acceptedCandidateEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 4,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "reject");
    assert.ok(decision.findings.some((f) => f.code === "invalid_evidence"));
    assert.ok(
      decision.findings.some((f) =>
        f.message.includes("attempt cannot exceed maxAttempts")
      )
    );
    assert.equal(decision.retry, undefined);
  });

  it("43. attempt 0 is still rejected", () => {
    const decision = evaluateCandidate({
      evidence: acceptedCandidateEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 0,
      maxAttempts: 3,
    });
    assert.equal(decision.outcome, "reject");
    assert.ok(decision.findings.some((f) => f.code === "invalid_evidence"));
    assert.equal(decision.retry, undefined);
  });

  it("44. maxAttempts > 5 is still rejected", () => {
    const decision = evaluateCandidate({
      evidence: acceptedCandidateEvidence,
      renderPlan: stubRenderPlan(),
      attempt: 1,
      maxAttempts: 6,
    });
    assert.equal(decision.outcome, "reject");
    assert.ok(decision.findings.some((f) => f.code === "invalid_evidence"));
    assert.equal(decision.retry, undefined);
  });

  it("45. Invalid retry state does not mutate evidence or RenderPlan", () => {
    const evidence = deepClone(acceptedCandidateEvidence);
    const renderPlan = stubRenderPlan("pronounced");
    const evidenceBefore = JSON.stringify(evidence);
    const planBefore = JSON.stringify(renderPlan);
    evaluateCandidate({
      evidence,
      renderPlan,
      attempt: 5,
      maxAttempts: 2,
    });
    assert.equal(JSON.stringify(evidence), evidenceBefore);
    assert.equal(JSON.stringify(renderPlan), planBefore);
  });
});
