/**
 * Anatomical Transformation Engine v2 — named coefficients (Demand 022D).
 *
 * Every constant has a descriptive name, purpose comment, and regression coverage.
 * These are simulation heuristics for visualization intent — not medical advice.
 */

import type { BodySimulationIntensity } from "./BodySimulatorTypes";
import type {
  AnatomicalFeature,
  AnatomicalMagnitude,
  BodySimulatorFocusZone,
} from "./AnatomicalTransformationTypes";

// ─── Effort / intensity → anatomical magnitude multipliers ───────────────────
// Product Moderate / Hard / Strict-max mapped onto Body Simulator intensity.

/** Moderate effort ≈ conservative intensity — lower plausible visual end. */
export const ANATOMICAL_EFFORT_MODERATE = 0.7;

/** Hard effort ≈ realistic intensity — default midpoint. */
export const ANATOMICAL_EFFORT_HARD = 0.85;

/** Strict / max effort ≈ ambitious intensity — upper bound inside realism. */
export const ANATOMICAL_EFFORT_STRICT = 1.0;

// ─── Body-fat delta thresholds (percentage points, absolute) ─────────────────

/** Below this |delta|: no fat-driven anatomical change (treat as stable). */
export const ANATOMICAL_BF_DELTA_NEGLIGIBLE_PP = 0.5;

/**
 * Modest fat change band (e.g. 18→15 ≈ 3 pp).
 * Purpose: slight waist/definition shifts without dramatic carving.
 */
export const ANATOMICAL_BF_DELTA_MODEST_PP = 3.5;

/**
 * Clear fat change band (e.g. 18→12 ≈ 6 pp).
 * Purpose: visibly stronger definition and waist reduction.
 */
export const ANATOMICAL_BF_DELTA_CLEAR_PP = 5.5;

/**
 * Substantial fat-gain band for fat_gain_bulk classification.
 * Purpose: distinguish modest mixed bulk from substantial fat-gain bulk.
 */
export const ANATOMICAL_BF_DELTA_SUBSTANTIAL_GAIN_PP = 4.0;

/**
 * Cap on waist-increase magnitude score under fat gain.
 * Purpose: prevent automatic extreme belly enlargement.
 */
export const ANATOMICAL_FAT_GAIN_WAIST_CAP_SCORE = 0.55;

// ─── Timeline magnitude score bands (after diminishing-returns progress) ─────

/**
 * Progress×effort score → subtle (≈ 3 months under moderate effort).
 * Purpose: short timelines stay visually restrained.
 */
export const ANATOMICAL_TIMELINE_SUBTLE_MAX = 0.38;

/**
 * Score → moderate (≈ 6 months typical).
 */
export const ANATOMICAL_TIMELINE_MODERATE_MAX = 0.58;

/**
 * Score → clear; above this → pronounced (≈ 12 months when supported).
 */
export const ANATOMICAL_TIMELINE_CLEAR_MAX = 0.78;

// ─── Priority ladder (higher wins same-feature conflicts) ────────────────────

/** Realism / safety boundary priority. */
export const ANATOMICAL_PRIORITY_REALISM = 1000;

/** Identity / presentation preservation priority. */
export const ANATOMICAL_PRIORITY_PRESERVATION = 900;

/** Explicit body-fat delta driver priority. */
export const ANATOMICAL_PRIORITY_BODY_FAT = 800;

/** Canonical simulation goal priority. */
export const ANATOMICAL_PRIORITY_GOAL = 700;

/** Focus-zone emphasis priority (base before material boost). */
export const ANATOMICAL_PRIORITY_FOCUS = 560;

/** Material priority boost applied to focus-mapped features. */
export const ANATOMICAL_FOCUS_PRIORITY_BOOST = 120;

/** Timeline contribution priority (magnitude mainly; low conflict weight). */
export const ANATOMICAL_PRIORITY_TIMELINE = 450;

/** Training / activity priority. */
export const ANATOMICAL_PRIORITY_TRAINING = 400;

/** Effort / intensity priority. */
export const ANATOMICAL_PRIORITY_EFFORT = 300;

/** Optional notes — lowest structured priority. */
export const ANATOMICAL_PRIORITY_OPTIONAL_NOTE = 100;

// ─── Muscle volume primary regions (no skeletal / height / hand-foot) ─────────

export const ANATOMICAL_MUSCLE_VOLUME_REGIONS = Object.freeze([
  "shoulders",
  "chest_and_upper_torso",
  "upper_back",
  "arms",
  "glutes",
  "thighs",
  "lower_legs",
] as const);

// ─── Focus zone → feature mapping ────────────────────────────────────────────

export const ANATOMICAL_FOCUS_FEATURE_MAP: Readonly<
  Record<BodySimulatorFocusZone, readonly AnatomicalFeature[]>
> = Object.freeze({
  core: [
    "abdominal_definition",
    "oblique_definition",
    "serratus_definition",
    "waist_width",
  ] as const satisfies readonly AnatomicalFeature[],
  abs: [
    "abdominal_definition",
    "oblique_definition",
    "serratus_definition",
    "waist_width",
  ] as const satisfies readonly AnatomicalFeature[],
  chest: ["chest_definition", "chest_volume"] as const satisfies readonly AnatomicalFeature[],
  arms: ["arm_definition", "arm_volume"] as const satisfies readonly AnatomicalFeature[],
  shoulders: [
    "shoulder_definition",
    "shoulder_volume",
    "chest_definition",
    "upper_back_definition",
  ] as const satisfies readonly AnatomicalFeature[],
  upper_body: [
    "shoulder_definition",
    "shoulder_volume",
    "chest_definition",
    "chest_volume",
    "upper_back_definition",
    "arm_definition",
    "arm_volume",
  ] as const satisfies readonly AnatomicalFeature[],
  back: ["upper_back_definition", "lat_width"] as const satisfies readonly AnatomicalFeature[],
  glutes: ["glute_volume", "thigh_definition"] as const satisfies readonly AnatomicalFeature[],
  thighs: ["thigh_volume", "thigh_definition"] as const satisfies readonly AnatomicalFeature[],
  /** Posture: no skeletal change — empty anatomical feature map. */
  posture: [] as const satisfies readonly AnatomicalFeature[],
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function effortCoefficientForIntensity(
  intensity: BodySimulationIntensity
): { label: "moderate" | "hard" | "strict"; coefficient: number } {
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

export function magnitudeFromScore(score: number): AnatomicalMagnitude {
  if (score < ANATOMICAL_TIMELINE_SUBTLE_MAX) return "subtle";
  if (score < ANATOMICAL_TIMELINE_MODERATE_MAX) return "moderate";
  if (score < ANATOMICAL_TIMELINE_CLEAR_MAX) return "clear";
  return "pronounced";
}

/** Ordinal for magnitude comparisons in tests / resolution. */
export function magnitudeOrdinal(m: AnatomicalMagnitude): number {
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

export function scaleMagnitude(
  base: AnatomicalMagnitude,
  factor: number
): AnatomicalMagnitude {
  const scaled = magnitudeOrdinal(base) * factor;
  if (scaled < 1.5) return "subtle";
  if (scaled < 2.5) return "moderate";
  if (scaled < 3.5) return "clear";
  return "pronounced";
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
