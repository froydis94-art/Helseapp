/**
 * Lightweight Node tests for DEMAND_001 progress-curve alignment.
 * Uses the built-in test runner (no Jest/Vitest — avoids build-system churn).
 *
 * Run: node --test src/ai/__tests__/progressCurve.test.cjs
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  transformProgress,
  bfAtHorizon,
  progressBand,
} = require("../../../lib/transformProgress.js");

describe("diminishing-return progression (3 / 6 / 12 months)", () => {
  it("front-loads progress: 3 < 6 < 12 and gaps shrink", () => {
    const p3 = transformProgress(3);
    const p6 = transformProgress(6);
    const p12 = transformProgress(12);
    assert.ok(p3 > 0.45 && p3 < 0.6, `3mo expected ~0.53, got ${p3}`);
    assert.ok(p6 > 0.7 && p6 < 0.85, `6mo expected ~0.78, got ${p6}`);
    assert.ok(p12 > 0.9 && p12 < 0.99, `12mo expected ~0.95, got ${p12}`);
    assert.ok(p6 - p3 > p12 - p6, "early gap should exceed late gap");
  });

  it("bfAtHorizon interpolates with the same curve", () => {
    const bf = bfAtHorizon(22, 16, 3);
    assert.equal(bf, Math.round((22 + (16 - 22) * transformProgress(3)) * 10) / 10);
  });

  it("progressBand maps ladder rungs", () => {
    assert.equal(progressBand(3), "early");
    assert.equal(progressBand(6), "mid");
    assert.equal(progressBand(12), "nearGoal");
  });

  it("missing BF inputs yield null (no invented certainty)", () => {
    assert.equal(bfAtHorizon(undefined, 16, 3), null);
    assert.equal(bfAtHorizon(22, null, 3), null);
  });
});
