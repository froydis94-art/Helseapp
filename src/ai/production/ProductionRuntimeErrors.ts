/**
 * Production Runtime safe error / redaction constants.
 * Never include secrets, stack traces, or raw Shadow failures.
 */

export const REDACTED_PRODUCTION_CONTENT = "[REDACTED_PRODUCTION_CONTENT]";

export const PRODUCTION_FORBIDDEN_CONTENT_WARNING =
  "Production gateway result contained forbidden content and was redacted.";

export const PRODUCTION_SHADOW_UNAVAILABLE_WARNING =
  "Shadow dry-run was requested but no shadow runtime dependency is available.";

export const PRODUCTION_SHADOW_TIMEOUT_WARNING =
  "Shadow dry-run exceeded the local timeout and was skipped.";

export const PRODUCTION_SHADOW_FAILURE_WARNING =
  "Shadow dry-run failed safely; legacy ownership is unchanged.";

export const PRODUCTION_SHADOW_INPUT_REJECTED_WARNING =
  "Shadow dry-run input was rejected; only runtime_only mode is permitted.";

export const PRODUCTION_TELEMETRY_UNSAFE_WARNING =
  "Shadow telemetry was removed because it failed the production safety check.";
