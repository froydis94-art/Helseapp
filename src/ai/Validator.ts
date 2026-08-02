/**
 * Validator — placeholder checks for identity, anatomy, and realism.
 *
 * Returns typed pass/fail results with messages. No image analysis, no AI calls,
 * no I/O. Methods always succeed with an informational placeholder message until
 * real validation is implemented.
 */

/**
 * Standard result shape for all validator methods.
 */
export interface ValidationResult {
  /** Whether the check passed. */
  ok: boolean;

  /** Human-readable notes or failure reasons. */
  messages: string[];
}

/**
 * Optional payload for future validators (image refs, plan metadata, etc.).
 * Kept loose so future wiring can extend without breaking the stub API.
 */
export interface ValidationInput {
  /** Opaque reference to a subject / identity image or id. */
  identityRef?: string;

  /** Opaque reference to a candidate / generated image or id. */
  candidateRef?: string;

  /** Free-form metadata for future rules. */
  meta?: Record<string, unknown>;
}

/**
 * Placeholder validation suite for future image / plan quality gates.
 */
export class Validator {
  /**
   * Check that identity (face / distinctive traits) is preserved.
   * Stub: always returns ok with a not-implemented note.
   */
  validateIdentity(_input?: ValidationInput): ValidationResult {
    return {
      ok: true,
      messages: ["validateIdentity is a stub; no identity check performed."],
    };
  }

  /**
   * Check anatomical plausibility of a candidate visualization.
   * Stub: always returns ok with a not-implemented note.
   */
  validateAnatomy(_input?: ValidationInput): ValidationResult {
    return {
      ok: true,
      messages: ["validateAnatomy is a stub; no anatomy check performed."],
    };
  }

  /**
   * Check that estimated / depicted changes stay within realistic bounds.
   * Stub: always returns ok with a not-implemented note.
   */
  validateRealism(_input?: ValidationInput): ValidationResult {
    return {
      ok: true,
      messages: ["validateRealism is a stub; no realism check performed."],
    };
  }
}
