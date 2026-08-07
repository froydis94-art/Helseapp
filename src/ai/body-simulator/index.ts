/**
 * Body Simulator v1 — public barrel (Demand 022 / 022B / 022D / 022E).
 *
 * Deterministic provider-independent Transformation Engine.
 * Formatter adapter (022B) is internal-preview only — not production cutover.
 * Anatomical Transformation Engine v2 (022D) is the higher-detail canonical intent.
 * Live Future preview bridge (022E) is feature-flagged; default OFF.
 * Neutral anatomical prompt conditioning (022E-B) is provider-facing only.
 * Provider safety attribution diagnostics (022E-C) are secret-free.
 * Provider capability evaluation report (022E-D) is investigation-only.
 */

export {
  ANATOMICAL_TRANSFORMATION_SCHEMA_VERSION,
  BODY_SIMULATOR_FOCUS_ZONES,
} from "./AnatomicalTransformationTypes";

export type {
  AnatomicalChangeDirection,
  AnatomicalFeature,
  AnatomicalMagnitude,
  AnatomicalSuppressionReason,
  AnatomicalTransformationResult,
  AnatomicalTransformationRule,
  BodySimulatorFocusZone,
  GoalConsistencyIssue,
  GoalConsistencySeverity,
  MuscleGainMode,
  OptionalNoteOutcome,
} from "./AnatomicalTransformationTypes";

export {
  ANATOMICAL_EFFORT_HARD,
  ANATOMICAL_EFFORT_MODERATE,
  ANATOMICAL_EFFORT_STRICT,
  ANATOMICAL_BF_DELTA_CLEAR_PP,
  ANATOMICAL_BF_DELTA_MODEST_PP,
  ANATOMICAL_FOCUS_PRIORITY_BOOST,
  ANATOMICAL_PRIORITY_BODY_FAT,
  ANATOMICAL_PRIORITY_OPTIONAL_NOTE,
  effortCoefficientForIntensity,
  magnitudeFromScore,
  magnitudeOrdinal,
} from "./AnatomicalTransformationRules";

export {
  anatomicalMagnitudeScore,
  buildAnatomicalTransformation,
  deriveMuscleGainMode,
  resolveBodyFatContext,
} from "./AnatomicalTransformationEngine";

export { validateGoalConsistency } from "./GoalConsistencyValidator";

export {
  BODY_SIMULATION_GOAL_TYPES,
  BODY_SIMULATION_INTENSITIES,
  BODY_SIMULATOR_CONFIDENCE_REASONS,
  BODY_SIMULATOR_FORBIDDEN_OUTPUTS,
  BODY_SIMULATOR_INPUT_SCHEMA_VERSION,
  BODY_SIMULATOR_PRIMARY_PURPOSE,
  BODY_SIMULATOR_REGIONS,
  BODY_SIMULATOR_RULES_SCHEMA_VERSION,
  BODY_SIMULATOR_RULES_VERSION,
  BODY_SIMULATOR_TIMELINE_MAX_WEEKS,
  BODY_SIMULATOR_TIMELINE_MIN_WEEKS,
  DEFAULT_BODY_SIMULATION_INTENSITY,
  REPORTED_EFFECT_DIRECTIONS,
  createDefaultMedicationEffects,
  createReservedBodyAnalysisStub,
} from "./BodySimulatorTypes";

export type {
  BodyAnalysisResult,
  BodyAnalysisResultStub,
  BodySimulationGoalType,
  BodySimulationIntensity,
  BodySimulatorActivityProfile,
  BodySimulatorConfidenceReason,
  BodySimulatorInput,
  BodySimulatorProfile,
  BodySimulatorReadiness,
  BodySimulatorRegion,
  BodySimulatorRegionRule,
  BodySimulatorSimulateResult,
  BodySimulatorTransformationRules,
  BodySimulatorValidationError,
  BodySimulatorValidationErrorCode,
  MedicationWeightEffectProfile,
  ModerationReason,
  RegionFatChange,
  RegionMuscleChange,
  ReportedEffectDirection,
  SimulationRange,
  TransformationRuleProvenance,
} from "./BodySimulatorTypes";

export {
  BODY_SIM_DEFAULT_FAT_LOSS_PP_PER_WEEK,
  BODY_SIM_DEFAULT_MUSCLE_GAIN_KG_PER_WEEK,
  BODY_SIM_INTENSITY_AMBITIOUS_EXPECTED,
  BODY_SIM_INTENSITY_CONSERVATIVE_EXPECTED,
  BODY_SIM_INTENSITY_REALISTIC_EXPECTED,
  BODY_SIM_MAX_FAT_LOSS_PP_ABSOLUTE,
  BODY_SIM_MAX_FAT_LOSS_PP_PER_WEEK,
  BODY_SIM_MAX_MUSCLE_GAIN_KG_ABSOLUTE,
  BODY_SIM_MAX_MUSCLE_GAIN_KG_PER_WEEK,
  BODY_SIM_MED_MAX_MUSCLE_INFLUENCE,
  BODY_SIM_MED_MAX_WEIGHT_FAT_INFLUENCE,
  BODY_SIM_MED_METABOLISM_SCALE,
  BODY_SIM_MUSCLE_RATE_ADVANCED,
  BODY_SIM_MUSCLE_RATE_BEGINNER,
  BODY_SIM_WEEKS_PER_MONTH,
  appetiteModifier,
  energyModifier,
  intensityExpectedMultiplier,
  metabolismModifier,
  muscleMedModifier,
  muscleRateForExperience,
} from "./BodySimulatorRules";

export {
  assessBodySimulatorReadiness,
  buildBodySimulatorTransformationRules,
  computeTimelineMagnitude,
  simulateBodyTransformation,
} from "./BodySimulatorEngine";

export { validateBodySimulatorInput } from "./BodySimulatorValidation";

export {
  projectBodySimulatorRules,
  serializeBodySimulatorProjection,
} from "./BodySimulatorProjection";
export type { BodySimulatorSafeProjection } from "./BodySimulatorProjection";

export {
  CANONICAL_BODY_TRANSFORMATION_SCHEMA_VERSION,
  CANONICAL_BODY_TRANSFORMATION_SOURCE,
  CONTROL_ROOM_TO_BODY_SIMULATOR_SCENARIO,
  adaptBodySimulatorRulesToFormatterInput,
  applyCanonicalBodyTransformation,
  buildFormatterInputInspectionView,
  buildFormatterPreviewView,
  resolveBodySimulatorScenarioForPreview,
} from "./BodySimulatorFormatterAdapter";
export type {
  CanonicalBodyTransformation,
  CanonicalChangeVisibility,
  FormatterInputInspectionView,
  FormatterPreviewView,
} from "./BodySimulatorFormatterAdapter";

export {
  BODY_SIMULATOR_LIVE_PREVIEW_ENV,
  PUBLIC_FOCUS_ZONE_MAP,
  adaptPublicFutureToBodySimulator,
  isBodySimulatorLivePreviewEnabled,
  mapPublicBodyFat,
  mapPublicEffort,
  mapPublicFocusZones,
  mapPublicTimeline,
} from "./PublicFutureToBodySimulatorAdapter";
export type {
  PublicBodyFatMappingResult,
  PublicEffortMappingResult,
  PublicFocusZoneMappingResult,
  PublicFutureAdapterFailure,
  PublicFutureAdapterResult,
  PublicFuturePayload,
  PublicTimelineMappingResult,
} from "./PublicFutureToBodySimulatorAdapter";

export {
  LiveFuturePreviewError,
  assertAnatomicalRulesTranslated,
  buildLiveFuturePreviewTraceStages,
  buildLiveProviderDiagnostics,
  classifyLiveProviderErrorCategory,
  loadProvenFluxKontextProHelpers,
  prepareLiveFuturePreview,
  runLiveFuturePreview,
  sha256FileBytes,
} from "./LiveFuturePreviewPipeline";
export type {
  LiveBodySimulatorDiagnostics,
  LiveFuturePreviewPreparation,
  LiveFuturePreviewRunInput,
  LiveFuturePreviewSuccess,
  LiveFuturePreviewTraceStage,
  LivePreviewErrorClass,
  LiveProviderDiagnostics,
  ProvenFluxKontextProHelpers,
  ProviderErrorCategory,
} from "./LiveFuturePreviewPipeline";

export {
  CONTROL_ROOM_ACCESS_HEADER,
  CONTROL_ROOM_ACCESS_KEY_ENV,
  CONTROL_ROOM_ENABLED_ENV,
  IMAGE_TRANSFORMATION_PROOF_SCHEMA_VERSION,
  TRANSFORM_PROOF_DIAGNOSTIC_ENV,
  TRANSFORM_PROOF_DIAGNOSTIC_MODE,
  TRANSFORM_PROOF_PROMPT_MARKER,
  averageHashFromRgba,
  averageHashFromRawBytes,
  buildTransformationProofDiagnosticPrompt,
  buildTransformationProofReport,
  compareImageBytes,
  decodeDataUriToBytes,
  decodePngRgba,
  downloadProviderImageBytes,
  encodeSolidPngRgba,
  fingerprintImageBytes,
  hammingHex64,
  inspectFluxStrengthParams,
  isTransformProofDiagnosticAllowed,
  isTransformProofDiagnosticEnvEnabled,
  isTransformProofDiagnosticRequested,
  outputUrlHostOnly,
  parseImageDimensions,
  projectTransformationProofForControlRoom,
  sha256ImageBytes,
  verifyControlRoomAccessKey,
} from "./ImageTransformationProof";
export type {
  FluxStrengthParamSnapshot,
  ImageByteFingerprint,
  ImageDeltaMetrics,
  SafeTransformationProofProjection,
  TransformProofLayer,
  TransformProofVerdict,
  TransformationProofReport,
} from "./ImageTransformationProof";

export {
  BANNED_SEMANTIC_SUPPORT_TERMS,
  CLOTHING_COVERAGE_PRESERVATION_PHRASE,
  PROVIDER_SENSITIVE_LEXEMES,
  conditionAnatomicalProviderPrompt,
  conditionOptionalNoteForProvider,
  measureProviderPromptDiagnostics,
} from "./NeutralAnatomicalPromptConditioner";
export type {
  NeutralPromptConditioningInput,
  NeutralPromptConditioningResult,
  NeutralPromptDiagnostics,
  OptionalNoteProviderConditioning,
  ProviderPromptLexemeSuppression,
  ProviderPromptLexemeSuppressionReason,
} from "./NeutralAnatomicalPromptConditioner";

export {
  PROVIDER_SAFETY_ATTRIBUTION_SCHEMA_VERSION,
  buildProviderSafetyAttributionDiagnostic,
  countAnatomyInstructionLines,
  countPreservationSentences,
  countSemanticSupportMentions,
  hashProviderPromptSafe,
  inspectSourceImageDataUriSafe,
  isE005SensitiveProviderMessage,
  projectProviderSafetyAttributionForControlRoom,
  serializeImageDataUriLikeLegacy,
} from "./ProviderSafetyAttributionDiagnostic";
export type {
  BuildProviderSafetyAttributionInput,
  ProviderSafetyAttributionClassification,
  ProviderSafetyAttributionConfidence,
  ProviderSafetyAttributionDiagnostic,
  SafeSourceImageInspection,
} from "./ProviderSafetyAttributionDiagnostic";

export {
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
} from "./ProviderCapabilityEvaluationReport";
export type {
  ArchitectureOptionEvaluation,
  ArchitectureOptionId,
  CapabilityRating,
  CapabilityRow,
  LegacyCascadeAttemptSpec,
  LegacyGenerationCascadeReport,
  LiveBodySimulatorProviderPathReport,
  ProviderCapabilityEvaluationReport,
  ProviderInventoryEntry,
  ProviderModelRole,
} from "./ProviderCapabilityEvaluationReport";

export {
  BODY_SIMULATOR_FIXTURE_BUILDERS,
  fixtureAdvancedMuscleGain24w,
  fixtureAmbitiousWeightLoss12w,
  fixtureBeginnerMuscleGain24w,
  fixtureConservativeWeightLoss12w,
  fixtureDeviceMeasuredBodyFat,
  fixtureFatLossMusclePreservation,
  fixtureFutureVisualBodyFatReserved,
  fixtureGeneralFitnessLimitedBaseline,
  fixtureMedAppetiteDecrease,
  fixtureMedAppetiteIncrease,
  fixtureMedEnergyDecrease,
  fixtureMedEnergyIncrease,
  fixtureMedMetabolismDecrease,
  fixtureMedMetabolismIncrease,
  fixtureMedMusclePreservation,
  fixtureMissingBodyFat,
  fixtureMultiViewReservation,
  fixtureNoMedicationEffect,
  fixtureNonStandardPose,
  fixturePartialBodyVisibility,
  fixtureRealisticWeightLoss12w,
  fixtureRecomposition16w,
  fixtureSingleFrontView,
  fixtureUnrealisticTargetModerated,
  fixtureUnusualProportions,
  getBodySimulatorFixtureById,
  listBodySimulatorFixtures,
} from "./BodySimulatorFixtures";
