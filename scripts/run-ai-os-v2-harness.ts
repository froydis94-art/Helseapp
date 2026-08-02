/**
 * Optional CLI for the AI OS v2 dry-run harness.
 * No network calls — prints a sanitized JSON report only.
 */

import {
  runAiOsV2Harness,
  sanitizeHarnessReport,
  validRecompositionFixture,
} from "../src/ai/harness";

const report = sanitizeHarnessReport(runAiOsV2Harness(validRecompositionFixture));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.success ? 0 : 1;
