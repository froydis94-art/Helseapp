/**
 * Transformation Rule Projection (Demand 018E).
 *
 * Deterministic, provider-independent projection from existing AI OS artifacts
 * (TransformationPlan / VisualDirection / RenderPlan) into a structured
 * Transformation Rules view. Does not invent a parallel rule engine.
 *
 * Prompts are generated artifacts; these rules are the inspectable intent.
 */

export const TRANSFORM_RULES_VIEW_SCHEMA_VERSION = 1 as const;
export const TRANSFORM_RULES_PROJECTION_ID =
  "transformation-rule-projection" as const;

/** Preferred inspector fields — stable keys for compare / export / UI. */
export const TRANSFORM_RULE_FIELD_KEYS = [
  "identity",
  "pose",
  "camera",
  "background",
  "lighting",
  "clothing",
  "bodyFatChange",
  "muscleChange",
  "weightGoal",
  "timeline",
  "photographicRealism",
  "priorityOrder",
  "scenario",
  "bodyRegionEmphasis",
] as const;

export type TransformationRuleFieldKey =
  (typeof TRANSFORM_RULE_FIELD_KEYS)[number];

export interface TransformationRuleField {
  key: TransformationRuleFieldKey;
  label: string;
  /** Deterministic JSON-serializable value for display and exact compare. */
  value: unknown;
}

export interface TransformationRulesView {
  schemaVersion: typeof TRANSFORM_RULES_VIEW_SCHEMA_VERSION;
  projectionId: typeof TRANSFORM_RULES_PROJECTION_ID;
  /** Provider-independent structured rules (preferred fields). */
  fields: TransformationRuleField[];
  /** Flat map of field key → value for export / compare convenience. */
  rules: Record<TransformationRuleFieldKey, unknown>;
  /** Traceability from source artifacts (no secrets). */
  source: {
    transformationPlanPresent: boolean;
    visualDirectionPresent: boolean;
    renderPlanPresent: boolean;
    transformationRulesVersion: string | null;
    visualDirectionRulesVersion: string | null;
    renderPlanRulesVersion: string | null;
  };
}

export interface ProjectTransformationRulesInput {
  scenarioId?: string | null;
  transformationPlan?: unknown;
  visualDirection?: unknown;
  renderPlan?: unknown;
}

const FIELD_LABELS: Record<TransformationRuleFieldKey, string> = {
  identity: "Identity",
  pose: "Pose",
  camera: "Camera",
  background: "Background",
  lighting: "Lighting",
  clothing: "Clothing",
  bodyFatChange: "Body Fat Change",
  muscleChange: "Muscle Change",
  weightGoal: "Weight Goal",
  timeline: "Timeline",
  photographicRealism: "Photographic Realism",
  priorityOrder: "Priority Order",
  scenario: "Scenario",
  bodyRegionEmphasis: "Body Region Emphasis",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatKgRange(range: unknown): unknown {
  const rec = asRecord(range);
  if (!rec) return range ?? null;
  const min = readNumber(rec.min);
  const max = readNumber(rec.max);
  if (min == null || max == null) return range;
  return { min, max };
}

function projectIdentity(
  _plan: Record<string, unknown> | null,
  visual: Record<string, unknown> | null,
  render: Record<string, unknown> | null
): unknown {
  const renderIdentity = asRecord(render?.identity);
  const visualPreserve = asRecord(visual?.preserve);
  return {
    preservePerson: renderIdentity?.preservePerson === true,
    preserveFace: renderIdentity?.preserveFace === true,
    preserveApparentAge:
      renderIdentity?.preserveApparentAge === true ||
      visualPreserve?.apparentAge === true,
    preserveHair:
      renderIdentity?.preserveHair === true || visualPreserve?.hair === true,
    preserveSkinTone:
      renderIdentity?.preserveSkinTone === true ||
      visualPreserve?.skinTone === true,
    preserveDistinctiveFeatures:
      renderIdentity?.preserveDistinctiveFeatures === true,
    preserveSkeletalFrame:
      asRecord(render?.anatomy)?.preserveSkeletalFrame === true ||
      visualPreserve?.skeletalFrame === true,
    identityFlag: visualPreserve?.identity === true,
  };
}

function projectSceneFlag(
  render: Record<string, unknown> | null,
  visual: Record<string, unknown> | null,
  sceneKey: string,
  preserveKey: string
): unknown {
  const scene = asRecord(render?.scene);
  const preserve = asRecord(visual?.preserve);
  return {
    preserve:
      scene?.[sceneKey] === true || preserve?.[preserveKey] === true,
  };
}

function projectBodyFatChange(plan: Record<string, unknown> | null): unknown {
  if (!plan) return null;
  return {
    estimatedFatLossKg: formatKgRange(plan.estimatedFatLossKg),
    estimatedFatChangeKg: plan.estimatedFatChangeKg ?? null,
    currentBodyFatPct: plan.currentBodyFatPct ?? null,
    targetBodyFatPct: plan.targetBodyFatPct ?? null,
    interimBodyFatPct: plan.interimBodyFatPct ?? null,
    expectedBodyFatPct: plan.expectedBodyFatPct ?? null,
  };
}

function projectMuscleChange(plan: Record<string, unknown> | null): unknown {
  if (!plan) return null;
  return {
    estimatedMuscleGainKg: formatKgRange(plan.estimatedMuscleGainKg),
    estimatedLeanMassChangeKg: plan.estimatedLeanMassChangeKg ?? null,
  };
}

function projectWeightGoal(plan: Record<string, unknown> | null): unknown {
  if (!plan) return null;
  return {
    expectedWeightKg: plan.expectedWeightKg ?? null,
    waistChangeCm: plan.waistChangeCm ?? null,
  };
}

function projectTimeline(plan: Record<string, unknown> | null): unknown {
  if (!plan) return null;
  const checkpoints = Array.isArray(plan.timelineCheckpoints)
    ? plan.timelineCheckpoints.map((cp) => {
        const rec = asRecord(cp);
        if (!rec) return cp;
        return {
          weeks: rec.weeks ?? null,
          months: rec.months ?? null,
          progress: rec.progress ?? null,
          band: rec.band ?? null,
          expectedBodyFatPct: rec.expectedBodyFatPct ?? null,
          expectedWeightKg: rec.expectedWeightKg ?? null,
        };
      })
    : [];
  return {
    effectiveTimelineWeeks: plan.effectiveTimelineWeeks ?? null,
    progress: plan.progress ?? null,
    visualIntensity: plan.visualIntensity ?? null,
    checkpoints,
  };
}

function projectPhotographicRealism(
  visual: Record<string, unknown> | null,
  render: Record<string, unknown> | null
): unknown {
  const realism = asRecord(render?.realism);
  return {
    presentationStyle:
      realism?.presentationStyle ?? visual?.presentationStyle ?? null,
    textureStyle: realism?.textureStyle ?? visual?.textureStyle ?? null,
    changeVisibility:
      asRecord(render?.transformation)?.changeVisibility ??
      visual?.changeVisibility ??
      null,
    postureTreatment: visual?.postureTreatment ?? null,
    realismConstraints: Array.isArray(realism?.constraints)
      ? realism?.constraints
      : Array.isArray(visual?.realismConstraints)
        ? visual?.realismConstraints
        : [],
    photographicInstructions: Array.isArray(visual?.photographicInstructions)
      ? visual?.photographicInstructions
      : [],
  };
}

function projectPriorityOrder(
  plan: Record<string, unknown> | null,
  render: Record<string, unknown> | null
): unknown {
  const approved = asRecord(render?.transformation)?.approvedChanges;
  if (Array.isArray(approved) && approved.length > 0) {
    return approved.map((change, index) => {
      const rec = asRecord(change);
      return {
        order: index + 1,
        id: rec?.id ?? null,
        kind: rec?.kind ?? null,
        direction: rec?.direction ?? null,
        region: rec?.region ?? null,
        visibility: rec?.visibility ?? null,
        sourcePlanField: rec?.sourcePlanField ?? null,
      };
    });
  }
  const regions = Array.isArray(plan?.regionalTargets)
    ? plan!.regionalTargets
    : [];
  return regions.map((target, index) => {
    const rec = asRecord(target);
    return {
      order: index + 1,
      region: rec?.region ?? null,
      magnitude: rec?.magnitude ?? null,
    };
  });
}

function projectBodyRegionEmphasis(
  plan: Record<string, unknown> | null,
  visual: Record<string, unknown> | null,
  render: Record<string, unknown> | null
): unknown {
  const regional = Array.isArray(plan?.regionalTargets)
    ? plan!.regionalTargets.map((target) => {
        const rec = asRecord(target);
        return {
          region: rec?.region ?? null,
          magnitude: rec?.magnitude ?? null,
          note: rec?.note ?? null,
        };
      })
    : [];
  const emphasis = Array.isArray(visual?.emphasisInstructions)
    ? visual!.emphasisInstructions
    : [];
  const approved = asRecord(render?.transformation)?.approvedChanges;
  const regionalChanges = Array.isArray(approved)
    ? approved
        .map((change) => asRecord(change))
        .filter(
          (rec) =>
            rec != null &&
            (rec.kind === "regional_change" || typeof rec.region === "string")
        )
        .map((rec) => ({
          id: rec!.id ?? null,
          kind: rec!.kind ?? null,
          region: rec!.region ?? null,
          direction: rec!.direction ?? null,
          visibility: rec!.visibility ?? null,
        }))
    : [];
  return {
    regionalTargets: regional,
    emphasisInstructions: emphasis,
    regionalRenderChanges: regionalChanges,
  };
}

/**
 * Project Transformation Rules from existing AI OS artifacts.
 * Missing artifacts yield null/empty field values — never invents physiology.
 */
export function projectTransformationRules(
  input: ProjectTransformationRulesInput
): TransformationRulesView {
  const plan = asRecord(input.transformationPlan);
  const visual = asRecord(input.visualDirection);
  const render = asRecord(input.renderPlan);
  const visualMeta = asRecord(visual?.metadata);
  const renderTrace = asRecord(render?.trace);

  const rules: Record<TransformationRuleFieldKey, unknown> = {
    identity: projectIdentity(plan, visual, render),
    pose: projectSceneFlag(render, visual, "preservePose", "pose"),
    camera: projectSceneFlag(
      render,
      visual,
      "preserveCameraPerspective",
      "cameraPerspective"
    ),
    background: projectSceneFlag(
      render,
      visual,
      "preserveBackground",
      "background"
    ),
    lighting: projectSceneFlag(render, visual, "preserveLighting", "lighting"),
    clothing: projectSceneFlag(render, visual, "preserveClothing", "clothing"),
    bodyFatChange: projectBodyFatChange(plan),
    muscleChange: projectMuscleChange(plan),
    weightGoal: projectWeightGoal(plan),
    timeline: projectTimeline(plan),
    photographicRealism: projectPhotographicRealism(visual, render),
    priorityOrder: projectPriorityOrder(plan, render),
    scenario: readString(input.scenarioId) ?? null,
    bodyRegionEmphasis: projectBodyRegionEmphasis(plan, visual, render),
  };

  const fields: TransformationRuleField[] = TRANSFORM_RULE_FIELD_KEYS.map(
    (key) => ({
      key,
      label: FIELD_LABELS[key],
      value: rules[key],
    })
  );

  return {
    schemaVersion: TRANSFORM_RULES_VIEW_SCHEMA_VERSION,
    projectionId: TRANSFORM_RULES_PROJECTION_ID,
    fields,
    rules,
    source: {
      transformationPlanPresent: plan != null,
      visualDirectionPresent: visual != null,
      renderPlanPresent: render != null,
      transformationRulesVersion:
        readString(plan?.rulesVersion) ||
        readString(renderTrace?.transformationRulesVersion) ||
        null,
      visualDirectionRulesVersion:
        readString(visualMeta?.rulesVersion) ||
        readString(renderTrace?.visualDirectionRulesVersion) ||
        null,
      renderPlanRulesVersion: readString(render?.rulesVersion) || null,
    },
  };
}

/** Stable JSON for exact value compare (sorted object keys recursively). */
export function stableStringifyRuleValue(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = canonicalize(rec[key]);
  }
  return out;
}
