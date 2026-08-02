/**
 * TransformationValidator — contract for identity, anatomy, realism, and
 * transformation-adherence checks. No AI service calls in this foundation.
 *
 * Note (DEMAND_002): the former export name `ValidationResult` now refers to
 * input validation in `./validation.ts`. This module uses `ValidatorCheckResult`.
 */

import type { TransformationPlan } from "./TransformationPlan";

/** Standard result shape for validator methods (stub / future image checks). */
export interface ValidatorCheckResult {
  ok: boolean;
  messages: string[];
}

/**
 * @deprecated DEMAND_002: prefer `ValidatorCheckResult`.
 * `ValidationResult` is reserved for `./validation.ts` input validation.
 */
export type ValidationResult = ValidatorCheckResult;

/** Optional refs / metadata for future image or plan checks. */
export interface ValidationInput {
  identityRef?: string;
  candidateRef?: string;
  plan?: TransformationPlan;
  meta?: Record<string, unknown>;
}

/**
 * Validator contract. Implementations must stay free of model I/O for now.
 */
export interface TransformationValidator {
  validateIdentity(input?: ValidationInput): ValidatorCheckResult;
  validateAnatomy(input?: ValidationInput): ValidatorCheckResult;
  validateRealism(input?: ValidationInput): ValidatorCheckResult;
  validateTransformationAdherence(input?: ValidationInput): ValidatorCheckResult;
}

/**
 * Stub validator — always passes with not-implemented notes.
 */
export class StubTransformationValidator implements TransformationValidator {
  validateIdentity(_input?: ValidationInput): ValidatorCheckResult {
    return {
      ok: true,
      messages: ["validateIdentity is a stub; no identity check performed."],
    };
  }

  validateAnatomy(_input?: ValidationInput): ValidatorCheckResult {
    return {
      ok: true,
      messages: ["validateAnatomy is a stub; no anatomy check performed."],
    };
  }

  validateRealism(_input?: ValidationInput): ValidatorCheckResult {
    return {
      ok: true,
      messages: ["validateRealism is a stub; no realism check performed."],
    };
  }

  validateTransformationAdherence(_input?: ValidationInput): ValidatorCheckResult {
    return {
      ok: true,
      messages: [
        "validateTransformationAdherence is a stub; no adherence check performed.",
      ],
    };
  }
}

/**
 * @deprecated Prefer TransformationValidator / StubTransformationValidator.
 * Alias kept so early foundation imports keep compiling.
 */
export type Validator = TransformationValidator;

/** @deprecated Prefer StubTransformationValidator. */
export const Validator = StubTransformationValidator;
