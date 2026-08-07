/**
 * Public Future form → BodySimulatorInput adapter (Demand 022E).
 *
 * Maps only user/profile fields already present in the public payload.
 * No invention, prompt parsing, vision, or NLP.
 */

import { createEmptyBodyAnalysisEvidence } from "../body-analysis/types";
import {
  BODY_SIMULATOR_FOCUS_ZONES,
  type BodySimulatorFocusZone,
} from "./AnatomicalTransformationTypes";
import { effortCoefficientForIntensity } from "./AnatomicalTransformationRules";
import { BODY_SIM_WEEKS_PER_MONTH } from "./BodySimulatorRules";
import {
  BODY_SIMULATOR_INPUT_SCHEMA_VERSION,
  createDefaultMedicationEffects,
  type BodySimulationGoalType,
  type BodySimulationIntensity,
  type BodySimulatorInput,
} from "./BodySimulatorTypes";

/** Feature-flag env name (server-authoritative). */
export const BODY_SIMULATOR_LIVE_PREVIEW_ENV =
  "BODY_SIMULATOR_LIVE_PREVIEW_ENABLED" as const;

/**
 * True only when server env is exactly "1".
 * Browser cannot enable this.
 */
export function isBodySimulatorLivePreviewEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return env[BODY_SIMULATOR_LIVE_PREVIEW_ENV] === "1";
}

/** Public Future POST body fields used by the adapter (subset). */
export interface PublicFuturePayload {
  maal?: unknown;
  intensity?: unknown;
  horizon?: unknown;
  horizonDate?: unknown;
  focus?: unknown;
  zone?: unknown;
  zones?: unknown;
  fat?: unknown;
  muscle?: unknown;
  gender?: unknown;
  bfNow?: unknown;
  bfGoal?: unknown;
  medicine?: unknown;
  bmi?: unknown;
  heightCm?: unknown;
  weightKg?: unknown;
  ageYears?: unknown;
  optionalNotes?: unknown;
  goalTitle?: unknown;
}

export interface PublicFocusZoneMappingResult {
  publicFocusZonesReceived: string[];
  canonicalFocusZonesMapped: BodySimulatorFocusZone[];
  unmappedFocusZones: string[];
}

export interface PublicTimelineMappingResult {
  timelineSource: string;
  timelineMonths: number | null;
  timelineWeeks: number;
  timelineScalingCoefficient: number;
}

export interface PublicEffortMappingResult {
  publicEffort: string;
  canonicalIntensity: BodySimulationIntensity;
  anatomicalEffortCoefficient: number;
}

export interface PublicBodyFatMappingResult {
  currentBodyFatPercentReceived: number | null;
  targetBodyFatPercentReceived: number | null;
  computedBodyFatDeltaPercentagePoints: number | null;
}

export interface PublicFutureAdapterResult {
  ok: true;
  input: BodySimulatorInput;
  bodyFat: PublicBodyFatMappingResult;
  timeline: PublicTimelineMappingResult;
  focus: PublicFocusZoneMappingResult;
  effort: PublicEffortMappingResult;
  optionalNotePresent: boolean;
  warnings: string[];
}

export interface PublicFutureAdapterFailure {
  ok: false;
  errorClass: "live_preview_adapter_failed";
  message: string;
  warnings: string[];
}

/**
 * Explicit public zone id → canonical Body Simulator focus zone(s).
 * "shoulders" public label is "Shoulders / upper body".
 */
export const PUBLIC_FOCUS_ZONE_MAP: Readonly<
  Record<string, readonly BodySimulatorFocusZone[]>
> = Object.freeze({
  abs: Object.freeze(["abs", "core"] as const),
  core: Object.freeze(["core", "abs"] as const),
  glutes: Object.freeze(["glutes"] as const),
  thighs: Object.freeze(["thighs"] as const),
  arms: Object.freeze(["arms"] as const),
  chest: Object.freeze(["chest"] as const),
  shoulders: Object.freeze(["shoulders", "upper_body"] as const),
  upper: Object.freeze(["upper_body", "shoulders"] as const),
  upper_body: Object.freeze(["upper_body", "shoulders"] as const),
  back: Object.freeze(["back"] as const),
  posture: Object.freeze(["posture"] as const),
  overall: Object.freeze([] as const),
});

function asFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function collectPublicZones(payload: PublicFuturePayload): string[] {
  const out: string[] = [];
  if (Array.isArray(payload.zones)) {
    for (const z of payload.zones) {
      const s = asTrimmedString(z).toLowerCase();
      if (s) out.push(s);
    }
  }
  if (out.length === 0 && payload.zone != null) {
    const raw = asTrimmedString(payload.zone);
    for (const part of raw.split(/[,|/]+/)) {
      const s = part.trim().toLowerCase();
      if (s) out.push(s);
    }
  }
  if (out.length === 0 && payload.focus != null) {
    const s = asTrimmedString(payload.focus).toLowerCase();
    if (s) out.push(s);
  }
  return out;
}

export function mapPublicFocusZones(
  payload: PublicFuturePayload
): PublicFocusZoneMappingResult {
  const publicFocusZonesReceived = collectPublicZones(payload);
  const mapped = new Set<BodySimulatorFocusZone>();
  const unmappedFocusZones: string[] = [];

  for (const zone of publicFocusZonesReceived) {
    const hit = PUBLIC_FOCUS_ZONE_MAP[zone];
    if (hit == null) {
      unmappedFocusZones.push(zone);
      continue;
    }
    for (const canonical of hit) {
      if (
        (BODY_SIMULATOR_FOCUS_ZONES as readonly string[]).includes(canonical)
      ) {
        mapped.add(canonical);
      }
    }
  }

  return {
    publicFocusZonesReceived,
    canonicalFocusZonesMapped: [...mapped],
    unmappedFocusZones,
  };
}

/**
 * Map public horizon keys to canonical weeks via BODY_SIM_WEEKS_PER_MONTH.
 * 12w → 3 months, 24w → 6 months, 12m → 12 months.
 */
export function mapPublicTimeline(
  payload: PublicFuturePayload
): PublicTimelineMappingResult {
  const horizon = asTrimmedString(payload.horizon) || "12w";
  const horizonDate = asTrimmedString(payload.horizonDate);

  const fixedMonths: Record<string, number> = {
    "4w": 1,
    "8w": 2,
    "12w": 3,
    "24w": 6,
    "12m": 12,
    "52w": 12,
    "18m": 12,
  };

  let timelineMonths: number | null = null;
  let timelineSource = horizon;

  if (horizon === "custom" && horizonDate) {
    const target = new Date(`${horizonDate}T12:00:00`);
    if (!Number.isNaN(target.getTime())) {
      const days = Math.max(
        7,
        Math.round((target.getTime() - Date.now()) / 86400000)
      );
      timelineMonths = Math.max(0.25, Math.round((days / 30) * 10) / 10);
      timelineSource = `custom:${horizonDate}`;
    }
  }

  if (timelineMonths == null) {
    timelineMonths = fixedMonths[horizon] ?? 3;
    timelineSource = horizon;
  }

  let timelineWeeks = Math.round(timelineMonths * BODY_SIM_WEEKS_PER_MONTH);
  if (timelineWeeks < 4) timelineWeeks = 4;
  if (timelineWeeks > 52) timelineWeeks = 52;

  const timelineScalingCoefficient =
    timelineMonths <= 0 ? 0 : timelineWeeks / (timelineMonths * BODY_SIM_WEEKS_PER_MONTH);

  return {
    timelineSource,
    timelineMonths,
    timelineWeeks,
    timelineScalingCoefficient: Number.isFinite(timelineScalingCoefficient)
      ? timelineScalingCoefficient
      : 1,
  };
}

/**
 * Public effort: subtle=Moderate, moderate=Hard, strong=Strict/max.
 * Maps onto 022D intensity → anatomical effort coefficients.
 */
export function mapPublicEffort(
  payload: PublicFuturePayload
): PublicEffortMappingResult {
  const raw = asTrimmedString(payload.intensity).toLowerCase() || "moderate";
  let canonicalIntensity: BodySimulationIntensity;
  if (raw === "subtle" || raw === "moderate_effort" || raw === "conservative") {
    canonicalIntensity = "conservative";
  } else if (raw === "strong" || raw === "strict" || raw === "max" || raw === "ambitious") {
    canonicalIntensity = "ambitious";
  } else {
    canonicalIntensity = "realistic";
  }
  const effort = effortCoefficientForIntensity(canonicalIntensity);
  return {
    publicEffort: raw,
    canonicalIntensity,
    anatomicalEffortCoefficient: effort.coefficient,
  };
}

export function mapPublicBodyFat(
  payload: PublicFuturePayload
): PublicBodyFatMappingResult {
  const currentBodyFatPercentReceived = asFiniteNumber(payload.bfNow);
  const targetBodyFatPercentReceived = asFiniteNumber(payload.bfGoal);
  let computedBodyFatDeltaPercentagePoints: number | null = null;
  if (
    currentBodyFatPercentReceived != null &&
    targetBodyFatPercentReceived != null
  ) {
    computedBodyFatDeltaPercentagePoints =
      targetBodyFatPercentReceived - currentBodyFatPercentReceived;
  }
  return {
    currentBodyFatPercentReceived,
    targetBodyFatPercentReceived,
    computedBodyFatDeltaPercentagePoints,
  };
}

function mapGoalType(payload: PublicFuturePayload): BodySimulationGoalType {
  const fat = asTrimmedString(payload.fat).toLowerCase() || "decrease";
  const muscle = asTrimmedString(payload.muscle).toLowerCase() || "toned";

  if (fat === "increase" && (muscle === "volume" || muscle === "gain")) {
    return "muscle_gain";
  }
  if (fat === "maintain" && (muscle === "volume" || muscle === "gain")) {
    return "muscle_gain";
  }
  if (fat === "decrease" && (muscle === "volume" || muscle === "gain")) {
    return "body_recomposition";
  }
  if (fat === "decrease") {
    return "fat_loss_with_muscle_preservation";
  }
  if (fat === "increase") {
    return "muscle_gain";
  }
  if (fat === "maintain") {
    return "general_fitness_improvement";
  }
  return "fat_loss_with_muscle_preservation";
}

function mapSex(
  gender: unknown
): BodySimulatorInput["profile"]["sexForPhysiology"] {
  const g = asTrimmedString(gender).toLowerCase();
  if (g === "female" || g === "kvinne" || g === "f") return "female";
  if (g === "male" || g === "mann" || g === "m") return "male";
  if (g === "intersex" || g === "other" || g === "annet") {
    return "intersex_or_other";
  }
  return "not_provided";
}

function collectOptionalNotes(payload: PublicFuturePayload): string[] {
  const notes: string[] = [];
  if (Array.isArray(payload.optionalNotes)) {
    for (const n of payload.optionalNotes) {
      const s = asTrimmedString(n);
      if (s) notes.push(s);
    }
  }
  const maal = asTrimmedString(payload.maal);
  if (maal) notes.push(maal);
  return notes;
}

function createSimulationId(nowMs: number): string {
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `live-fut-${nowMs.toString(36)}-${rand}`;
}

/**
 * Deterministic adapter: public Future payload → BodySimulatorInput.
 */
export function adaptPublicFutureToBodySimulator(
  payload: PublicFuturePayload,
  options?: { nowMs?: number; simulationId?: string }
): PublicFutureAdapterResult | PublicFutureAdapterFailure {
  const warnings: string[] = [];
  try {
    if (payload == null || typeof payload !== "object") {
      return {
        ok: false,
        errorClass: "live_preview_adapter_failed",
        message: "Public Future payload missing.",
        warnings,
      };
    }

    const bodyFat = mapPublicBodyFat(payload);
    const timeline = mapPublicTimeline(payload);
    const focus = mapPublicFocusZones(payload);
    const effort = mapPublicEffort(payload);

    if (focus.unmappedFocusZones.length > 0) {
      warnings.push(
        `unmapped_focus_zones:${focus.unmappedFocusZones.join(",")}`
      );
    }

    const notes = collectOptionalNotes(payload);
    const optionalNotePresent = notes.length > 0;
    const nowMs = options?.nowMs ?? Date.now();
    const simulationId =
      options?.simulationId ?? createSimulationId(nowMs);

    const heightCm = asFiniteNumber(payload.heightCm);
    const weightKg = asFiniteNumber(payload.weightKg);
    const ageYears = asFiniteNumber(payload.ageYears);

    const delta = bodyFat.computedBodyFatDeltaPercentagePoints;
    const goalType = mapGoalType(payload);

    const input: BodySimulatorInput = {
      schemaVersion: BODY_SIMULATOR_INPUT_SCHEMA_VERSION,
      simulationId,
      createdAt: new Date(nowMs).toISOString(),
      goal: {
        type: goalType,
        timelineWeeks: timeline.timelineWeeks,
        targetWeightChangeKg: null,
        targetBodyFatChangePercentagePoints: delta,
        targetMuscleChangeKg:
          goalType === "muscle_gain" || goalType === "body_recomposition"
            ? 1
            : null,
        intensity: effort.canonicalIntensity,
        targetBodyFatPercent: bodyFat.targetBodyFatPercentReceived,
      },
      profile: {
        ageYears,
        sexForPhysiology: mapSex(payload.gender),
        heightCm,
        currentWeightKg: weightKg,
        currentBodyFatPercent: bodyFat.currentBodyFatPercentReceived,
        bodyFatBasis:
          bodyFat.currentBodyFatPercentReceived != null
            ? "user_estimate"
            : "not_provided",
        trainingExperience: "not_provided",
        evidence: {
          profile: createEmptyBodyAnalysisEvidence("unknown"),
        },
      },
      activity: {
        generalActivity: "not_provided",
        resistanceTrainingSessionsPerWeek: null,
        cardioSessionsPerWeek: null,
        trainingConsistency: "not_provided",
        proteinIntakeSupport: "not_provided",
        recoverySupport: "not_provided",
        evidence: {
          activity: createEmptyBodyAnalysisEvidence("unknown"),
        },
      },
      medicationEffects: (() => {
        const med = createDefaultMedicationEffects();
        if (Boolean(payload.medicine)) {
          med.medicationMayAffectWeight = true;
          med.evidence.confidence = "low";
          med.evidence.notes = ["user_declared_medicine_toggle"];
        }
        return med;
      })(),
      bodyAnalysis: null,
      sourceImageContext: {
        available: true,
        progressPhotoView: "front",
      },
      options: {
        preserveIdentity: true,
        preserveOriginalPresentation: true,
        preservePose: true,
        preserveCameraFraming: true,
        preserveClothing: true,
        preserveBackground: true,
        preserveLightingCharacter: true,
      },
      focusZones: focus.canonicalFocusZonesMapped,
      ...(optionalNotePresent ? { optionalNotes: notes } : {}),
    };

    return {
      ok: true,
      input,
      bodyFat,
      timeline,
      focus,
      effort,
      optionalNotePresent,
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      errorClass: "live_preview_adapter_failed",
      message:
        error instanceof Error
          ? error.message
          : "Public Future adapter failed.",
      warnings,
    };
  }
}
