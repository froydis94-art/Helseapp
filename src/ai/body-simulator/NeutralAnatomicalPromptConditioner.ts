/**
 * Neutral Anatomical Prompt Conditioning (Patch 022E-B).
 *
 * Provider-facing text layer only. Converts canonical anatomical intent into
 * concise, technical, non-erotic Flux prompt wording to reduce E005 false
 * positives. Does not alter Body Simulator / Anatomical coefficients, BF delta,
 * focus selection, or stored optional notes.
 */

import type { AnatomicalTransformationRule } from "./AnatomicalTransformationTypes";
import type { CanonicalBodyTransformation } from "./BodySimulatorFormatterAdapter";

/**
 * Single clothing preservation phrase for provider prompts.
 * Patch 022E-C: drop "coverage" meta-framing (false-positive risk with
 * ordinary progress photos). Legacy slim path says "clothing" only.
 */
export const CLOTHING_COVERAGE_PRESERVATION_PHRASE =
  "Preserve the subject's original clothing." as const;

/** Lexemes guarded on provider-facing text only (not user-content moderation). */
export const PROVIDER_SENSITIVE_LEXEMES = [
  "erotic",
  "sexual",
  "sexy",
  "sensual",
  "fetish",
  "lingerie",
  "underwear",
  "nude",
  "naked",
  "nipples",
  "groin",
  "cleavage",
  "breasts",
  "buttocks",
  "seductive",
  "provocative",
] as const;

/** Semantic support terms banned unless later owner-approved. */
export const BANNED_SEMANTIC_SUPPORT_TERMS = [
  "shredded",
  "ripped",
  "sexy",
  "hot",
  "glamour",
  "provocative",
] as const;

const MIDSECTION_FEATURES = new Set([
  "subcutaneous_fat",
  "waist_width",
  "abdominal_definition",
  "oblique_definition",
  "serratus_definition",
]);

const ANATOMICAL_COUNT_TERMS = [
  "midsection",
  "abdomen",
  "abdominal",
  "waist",
  "oblique",
  "serratus",
  "chest",
  "shoulder",
  "arm",
  "thigh",
  "glute",
  "back",
  "lat",
  "muscle",
  "fat",
  "subcutaneous",
  "definition",
  "volume",
] as const;

const PRESERVATION_COUNT_TERMS = [
  "preserve",
  "clothing",
  "coverage",
  "identity",
  "pose",
  "lighting",
  "background",
  "camera",
] as const;

export type ProviderPromptLexemeSuppressionReason =
  | "provider_false_positive_risk"
  | "optional_note_sexualized_suppressed"
  | "optional_note_neutralized"
  | "banned_semantic_support"
  | "duplicate_preservation_compressed"
  | "synonym_stack_compressed";

export interface ProviderPromptLexemeSuppression {
  term: string;
  reason: ProviderPromptLexemeSuppressionReason;
}

export interface OptionalNoteProviderConditioning {
  original: string;
  disposition: "neutralized" | "suppressed" | "skipped_covered";
  providerText: string | null;
}

export interface NeutralPromptDiagnostics {
  providerPromptCharacterCount: number;
  providerPromptWordCount: number;
  providerPromptAnatomicalTermCount: number;
  providerPromptSensitiveLexemeCount: number;
  providerPromptPreservationTermCount: number;
  providerPromptLexemeSuppressed: ProviderPromptLexemeSuppression[];
  neutralPromptConditioningApplied: boolean;
  removedReplacedTokenCategories: string[];
  originalProviderPromptCharacterCount: number;
  originalProviderPromptWordCount: number;
  compressedAnatomicalRuleIds: string[];
  optionalNoteConditioning: OptionalNoteProviderConditioning[];
}

export interface NeutralPromptConditioningInput {
  formattedPrompt: string;
  canonical: CanonicalBodyTransformation;
  anatomicalRules: readonly AnatomicalTransformationRule[];
  optionalNotes?: readonly string[];
}

export interface NeutralPromptConditioningResult {
  conditionedPrompt: string;
  diagnostics: NeutralPromptDiagnostics;
}

function wordCount(text: string): number {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.length;
}

function countTermHits(text: string, terms: readonly string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const term of terms) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = lower.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

function findSensitiveLexemes(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const term of PROVIDER_SENSITIVE_LEXEMES) {
    const re = new RegExp(
      `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    if (re.test(lower)) found.push(term);
  }
  return found;
}

/**
 * Safe prompt metrics — counts only; never returns the raw prompt.
 */
export function measureProviderPromptDiagnostics(text: string): {
  providerPromptCharacterCount: number;
  providerPromptWordCount: number;
  providerPromptAnatomicalTermCount: number;
  providerPromptSensitiveLexemeCount: number;
  providerPromptPreservationTermCount: number;
} {
  return {
    providerPromptCharacterCount: text.length,
    providerPromptWordCount: wordCount(text),
    providerPromptAnatomicalTermCount: countTermHits(text, ANATOMICAL_COUNT_TERMS),
    providerPromptSensitiveLexemeCount: findSensitiveLexemes(text).length,
    providerPromptPreservationTermCount: countTermHits(
      text,
      PRESERVATION_COUNT_TERMS
    ),
  };
}

function isDecrease(direction: string): boolean {
  return direction.includes("decrease");
}

function isIncrease(direction: string): boolean {
  return (
    direction.includes("increase") ||
    direction === "more_defined"
  );
}

function isProviderEmitRule(rule: AnatomicalTransformationRule): boolean {
  if (rule.direction === "stable" && rule.source === "realism_constraint") {
    return false;
  }
  if (rule.direction === "stable" || rule.direction === "unknown") {
    return false;
  }
  return true;
}

/**
 * Condition optional notes for provider text only. Canonical note storage unchanged.
 */
export function conditionOptionalNoteForProvider(
  note: string
): OptionalNoteProviderConditioning & {
  suppressions: ProviderPromptLexemeSuppression[];
} {
  const original = String(note || "").trim();
  const suppressions: ProviderPromptLexemeSuppression[] = [];
  if (!original) {
    return {
      original,
      disposition: "skipped_covered",
      providerText: null,
      suppressions,
    };
  }

  const lower = original.toLowerCase();
  if (/defined\s+abs|abs\s+definition|six[\s-]?pack/.test(lower)) {
    suppressions.push({
      term: "defined abs",
      reason: "optional_note_neutralized",
    });
    return {
      original,
      disposition: "neutralized",
      providerText: "increase natural abdominal definition",
      suppressions,
    };
  }

  const sensitive = findSensitiveLexemes(original);
  if (sensitive.length > 0) {
    for (const term of sensitive) {
      suppressions.push({
        term,
        reason: "optional_note_sexualized_suppressed",
      });
    }
    return {
      original,
      disposition: "suppressed",
      providerText: null,
      suppressions,
    };
  }

  if (
    BANNED_SEMANTIC_SUPPORT_TERMS.some((t) =>
      new RegExp(`\\b${t}\\b`, "i").test(lower)
    )
  ) {
    for (const term of BANNED_SEMANTIC_SUPPORT_TERMS) {
      if (new RegExp(`\\b${term}\\b`, "i").test(lower)) {
        suppressions.push({
          term,
          reason: "banned_semantic_support",
        });
      }
    }
    // Neutral body-composition fallback when note only pushed banned aesthetics.
    if (/shred|ripped|cut|etch/.test(lower)) {
      return {
        original,
        disposition: "neutralized",
        providerText: "increase natural abdominal definition",
        suppressions,
      };
    }
    return {
      original,
      disposition: "suppressed",
      providerText: null,
      suppressions,
    };
  }

  // Do not pass free-text notes through verbatim — anatomical rules carry intent.
  return {
    original,
    disposition: "skipped_covered",
    providerText: null,
    suppressions,
  };
}

function scrubSensitiveLexemes(
  text: string,
  suppressions: ProviderPromptLexemeSuppression[]
): string {
  let out = text;
  for (const term of PROVIDER_SENSITIVE_LEXEMES) {
    const re = new RegExp(
      `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "gi"
    );
    if (re.test(out)) {
      suppressions.push({
        term,
        reason: "provider_false_positive_risk",
      });
      out = out.replace(re, "");
    }
  }
  // Collapse leftover whitespace / empty clauses.
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}

function pickSemanticSupport(
  terms: readonly string[],
  suppressions: ProviderPromptLexemeSuppression[]
): string[] {
  const out: string[] = [];
  for (const raw of terms) {
    const term = String(raw || "")
      .trim()
      .toLowerCase();
    if (!term) continue;
    if (
      (BANNED_SEMANTIC_SUPPORT_TERMS as readonly string[]).includes(term) ||
      (PROVIDER_SENSITIVE_LEXEMES as readonly string[]).includes(term)
    ) {
      suppressions.push({
        term,
        reason: "banned_semantic_support",
      });
      continue;
    }
    // Prefer neutral pair: lean / defined (max two).
    if (term !== "lean" && term !== "defined" && term !== "athletic") {
      continue;
    }
    if (out.includes(term)) continue;
    out.push(term);
    if (out.length >= 2) break;
  }
  return out;
}

interface CompressedAnatomicalText {
  lines: string[];
  compressedRuleIds: string[];
  categories: string[];
  featureKeys: string[];
}

function compressAnatomicalRules(
  rules: readonly AnatomicalTransformationRule[]
): CompressedAnatomicalText {
  const emit = rules.filter(isProviderEmitRule);
  const compressedRuleIds = emit.map((r) => r.id);
  const categories: string[] = [];
  const featureKeys: string[] = [];
  const lines: string[] = [];
  const usedFeature = new Set<string>();

  const mid = emit.filter(
    (r) =>
      MIDSECTION_FEATURES.has(r.feature) ||
      (r.feature === "subcutaneous_fat" &&
        (r.region === "abdomen" || r.region === "whole_body"))
  );
  const rest = emit.filter((r) => !mid.includes(r));

  if (mid.length > 0) {
    categories.push("midsection_merged");
    for (const r of mid) {
      featureKeys.push(r.feature);
      usedFeature.add(r.feature);
    }
    const fatDecrease = mid.some(
      (r) =>
        (r.feature === "subcutaneous_fat" || r.feature === "waist_width") &&
        isDecrease(r.direction)
    );
    const fatIncrease = mid.some(
      (r) =>
        r.feature === "subcutaneous_fat" && isIncrease(r.direction)
    );
    const defParts: string[] = [];
    if (mid.some((r) => r.feature === "abdominal_definition" && isIncrease(r.direction))) {
      defParts.push("abdominal");
    }
    if (mid.some((r) => r.feature === "oblique_definition" && isIncrease(r.direction))) {
      defParts.push("oblique");
    }
    if (
      mid.some(
        (r) =>
          (r.feature === "waist_width" && isDecrease(r.direction)) ||
          (r.feature === "serratus_definition" && isIncrease(r.direction))
      )
    ) {
      if (!defParts.includes("waist")) defParts.push("waist");
    }
    if (mid.some((r) => r.feature === "serratus_definition" && isIncrease(r.direction))) {
      if (!defParts.includes("serratus")) defParts.push("serratus");
    }

    if (fatDecrease && defParts.length > 0) {
      lines.push(
        `Reduce midsection subcutaneous fat while increasing natural ${defParts.join(", ")} definition.`
      );
    } else if (fatDecrease) {
      lines.push(
        "Reduce overall subcutaneous fat in the midsection and slightly narrow the waist."
      );
    } else if (fatIncrease) {
      lines.push(
        "Increase midsection soft-tissue fullness modestly while preserving natural proportions."
      );
    } else if (defParts.length > 0) {
      lines.push(
        `Increase natural ${defParts.join(", ")} definition in the midsection.`
      );
    }
  }

  // Muscle volume (once).
  const muscleVol = rest.filter(
    (r) =>
      r.feature === "whole_body_muscle_volume" ||
      r.feature.endsWith("_volume")
  );
  const musclePreserve = muscleVol.filter(
    (r) => r.direction === "stable" || !isIncrease(r.direction)
  );
  const muscleIncrease = muscleVol.filter((r) => isIncrease(r.direction));
  if (muscleIncrease.length > 0 && !usedFeature.has("muscle_volume_increase")) {
    usedFeature.add("muscle_volume_increase");
    featureKeys.push("whole_body_muscle_volume");
    categories.push("muscle_volume");
    for (const r of muscleIncrease) compressedRuleIds.includes(r.id) || compressedRuleIds.push(r.id);
    lines.push(
      "Increase natural muscle volume proportionally while preserving the original skeletal frame."
    );
  } else if (
    (musclePreserve.length > 0 ||
      emit.some((r) => r.feature === "whole_body_muscle_volume")) &&
    !usedFeature.has("muscle_volume_preserve")
  ) {
    usedFeature.add("muscle_volume_preserve");
    featureKeys.push("whole_body_muscle_volume");
    categories.push("muscle_volume");
    lines.push("Preserve existing muscle volume and natural proportions.");
  }

  function addOnce(featureKey: string, phrase: string, matched: AnatomicalTransformationRule[]) {
    if (matched.length === 0) return;
    if (usedFeature.has(featureKey)) return;
    usedFeature.add(featureKey);
    featureKeys.push(featureKey);
    categories.push(featureKey);
    lines.push(phrase);
  }

  addOnce(
    "chest_shoulder_definition",
    "Improve shoulder and chest definition.",
    rest.filter(
      (r) =>
        (r.feature === "chest_definition" ||
          r.feature === "shoulder_definition") &&
        isIncrease(r.direction)
    )
  );

  addOnce(
    "chest_volume",
    "Preserve natural chest muscle volume with modest refinement.",
    rest.filter(
      (r) => r.feature === "chest_volume" && isIncrease(r.direction)
    )
  );

  addOnce(
    "arm_definition",
    "Increase natural arm definition.",
    rest.filter(
      (r) =>
        (r.feature === "arm_definition" || r.feature === "arm_volume") &&
        isIncrease(r.direction)
    )
  );

  addOnce(
    "thigh_definition",
    "Increase natural thigh definition.",
    rest.filter(
      (r) =>
        (r.feature === "thigh_definition" || r.feature === "thigh_volume") &&
        isIncrease(r.direction)
    )
  );

  addOnce(
    "glute_volume",
    "Increase natural glute muscle volume with realistic proportions.",
    rest.filter(
      (r) => r.feature === "glute_volume" && isIncrease(r.direction)
    )
  );

  addOnce(
    "back_definition",
    "Increase natural upper-back definition.",
    rest.filter(
      (r) =>
        (r.feature === "upper_back_definition" || r.feature === "lat_width") &&
        isIncrease(r.direction)
    )
  );

  addOnce(
    "whole_body_definition",
    "Increase natural whole-body muscle definition.",
    rest.filter(
      (r) =>
        r.feature === "whole_body_definition" && isIncrease(r.direction)
    )
  );

  if (lines.length === 0) {
    // Fail-open: keep meaningful transformation summary from goal type.
    lines.push(
      "Apply the approved body-composition change with natural proportions."
    );
    categories.push("fallback_summary");
  }

  return {
    lines,
    compressedRuleIds: [...new Set(compressedRuleIds)],
    categories: [...new Set(categories)],
    featureKeys: [...new Set(featureKeys)],
  };
}

/**
 * Build conditioned provider prompt from canonical anatomical intent.
 * Deterministic. Does not mutate inputs.
 */
export function conditionAnatomicalProviderPrompt(
  input: NeutralPromptConditioningInput
): NeutralPromptConditioningResult {
  const original = String(input.formattedPrompt || "");
  const originalMetrics = measureProviderPromptDiagnostics(original);
  const suppressions: ProviderPromptLexemeSuppression[] = [];
  const removedReplacedTokenCategories: string[] = [];
  const optionalNoteConditioning: OptionalNoteProviderConditioning[] = [];

  if (originalMetrics.providerPromptSensitiveLexemeCount > 0) {
    removedReplacedTokenCategories.push("sensitive_lexemes");
  }
  if (/\bPreserve\b/i.test(original)) {
    const preserveHits = (original.match(/\bPreserve\b/gi) || []).length;
    if (preserveHits > 2) {
      removedReplacedTokenCategories.push("repeated_preservation");
      suppressions.push({
        term: "Preserve",
        reason: "duplicate_preservation_compressed",
      });
    }
  }
  if (/shredded|ripped|toned,\s*athletic|lean,\s*shredded/i.test(original)) {
    removedReplacedTokenCategories.push("synonym_stack");
    suppressions.push({
      term: "synonym_stack",
      reason: "synonym_stack_compressed",
    });
  }

  const compressed = compressAnatomicalRules(input.anatomicalRules);
  if (compressed.categories.includes("midsection_merged")) {
    removedReplacedTokenCategories.push("midsection_duplicates_merged");
  }

  const notes = input.optionalNotes ?? [];
  const notePhrases: string[] = [];
  for (const note of notes) {
    const conditioned = conditionOptionalNoteForProvider(note);
    optionalNoteConditioning.push({
      original: conditioned.original,
      disposition: conditioned.disposition,
      providerText: conditioned.providerText,
    });
    suppressions.push(...conditioned.suppressions);
    if (conditioned.disposition === "neutralized" && conditioned.providerText) {
      removedReplacedTokenCategories.push("optional_note_neutralized");
      // Append only if abdominal phrasing not already present.
      const already =
        compressed.lines.some((l) => /abdominal definition/i.test(l)) ||
        notePhrases.some((l) => /abdominal definition/i.test(l));
      if (!already) notePhrases.push(conditioned.providerText);
    } else if (conditioned.disposition === "suppressed") {
      removedReplacedTokenCategories.push("optional_note_suppressed");
    }
  }

  const semantic = pickSemanticSupport(
    input.canonical.semanticSupportTerms ?? [],
    suppressions
  );
  if ((input.canonical.semanticSupportTerms?.length ?? 0) > semantic.length) {
    removedReplacedTokenCategories.push("semantic_support_capped");
  }

  const weeks = input.canonical.goal.timelineWeeks;
  const intensity = input.canonical.goal.intensity;
  const goalType = input.canonical.goal.effectiveType.replace(/_/g, " ");

  // Patch 022E-C: no "adult status" / "coverage" / safety-meta framing.
  // Keep identity + clothing locks photographic and concise (legacy-like block).
  const sections = [
    "Preserve the same person, identity, face, hairstyle, pose, camera framing, lighting and background.",
    CLOTHING_COVERAGE_PRESERVATION_PHRASE,
    `Simulate the requested future ${goalType} body-composition change over ${weeks} weeks at ${intensity} intensity.`,
    ...compressed.lines,
    ...notePhrases,
    "Keep the result realistic, photographic and consistent with the source image.",
  ];

  if (semantic.length > 0) {
    sections.push(
      semantic.length === 1
        ? `Look: ${semantic[0]}.`
        : `Look: ${semantic[0]} and ${semantic[1]}.`
    );
  }

  // Single photographic block (space-joined) — reduces preservation overload vs
  // multi-paragraph FluxFormatter / earlier 022E-B newlines.
  let conditionedPrompt = sections.filter(Boolean).join(" ");
  conditionedPrompt = scrubSensitiveLexemes(conditionedPrompt, suppressions);
  if (/\badult\b/i.test(conditionedPrompt)) {
    removedReplacedTokenCategories.push("adult_status_framing");
    conditionedPrompt = conditionedPrompt
      .replace(/\bsame adult person\b/gi, "same person")
      .replace(/\badult\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  if (/\bcoverage\b/i.test(conditionedPrompt)) {
    removedReplacedTokenCategories.push("clothing_coverage_meta");
    conditionedPrompt = conditionedPrompt
      .replace(/\bclothing and coverage\b/gi, "clothing")
      .replace(/\bcoverage\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // Final guard: never emit banned lexemes.
  const remaining = findSensitiveLexemes(conditionedPrompt);
  for (const term of remaining) {
    suppressions.push({
      term,
      reason: "provider_false_positive_risk",
    });
    conditionedPrompt = scrubSensitiveLexemes(conditionedPrompt, []);
  }

  const finalMetrics = measureProviderPromptDiagnostics(conditionedPrompt);

  return {
    conditionedPrompt,
    diagnostics: {
      ...finalMetrics,
      providerPromptLexemeSuppressed: dedupeSuppressions(suppressions),
      neutralPromptConditioningApplied: true,
      removedReplacedTokenCategories: [...new Set(removedReplacedTokenCategories)],
      originalProviderPromptCharacterCount:
        originalMetrics.providerPromptCharacterCount,
      originalProviderPromptWordCount: originalMetrics.providerPromptWordCount,
      compressedAnatomicalRuleIds: compressed.compressedRuleIds,
      optionalNoteConditioning,
    },
  };
}

function dedupeSuppressions(
  items: ProviderPromptLexemeSuppression[]
): ProviderPromptLexemeSuppression[] {
  const seen = new Set<string>();
  const out: ProviderPromptLexemeSuppression[] = [];
  for (const item of items) {
    const key = `${item.term}|${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
