/**
 * Image Transformation Proof (Demand 022E-F).
 *
 * Cryptographic + perceptual/byte delta metrics to attribute where body
 * transformation is lost. Never logs full image bytes, data URIs, or tokens.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

export const IMAGE_TRANSFORMATION_PROOF_SCHEMA_VERSION = 1 as const;

export const TRANSFORM_PROOF_DIAGNOSTIC_MODE = "transformation_proof" as const;

/** Env: when "1", diagnostic mode may run (also allowed when Control Room enabled). */
export const TRANSFORM_PROOF_DIAGNOSTIC_ENV =
  "BODY_SIMULATOR_TRANSFORM_PROOF_DIAGNOSTIC" as const;

export const CONTROL_ROOM_ENABLED_ENV = "AI_OS_CONTROL_ROOM_ENABLED" as const;
export const CONTROL_ROOM_ACCESS_KEY_ENV =
  "AI_OS_CONTROL_ROOM_ACCESS_KEY" as const;
export const CONTROL_ROOM_ACCESS_HEADER = "x-ai-os-control-room-key" as const;

/** Marker injected only in diagnostic prompt path — never production calibration. */
export const TRANSFORM_PROOF_PROMPT_MARKER =
  "[DIAGNOSTIC_TRANSFORM_PROOF_022E_F]" as const;

export type TransformProofLayer =
  | "prompt_construction"
  | "provider_capability"
  | "provider_parameters"
  | "fallback_routing"
  | "result_storage_cache"
  | "frontend_rendering"
  | "inconclusive_pending_owner_run";

export type TransformProofVerdict =
  | "identical_bytes"
  | "near_identical"
  | "clearly_transformed"
  | "dimensions_mismatch"
  | "output_unavailable"
  | "comparison_skipped";

export interface ImageByteFingerprint {
  sha256: string;
  byteLength: number;
  mimeGuess: "image/png" | "image/jpeg" | "image/webp" | "application/octet-stream";
  dimensions: string | null;
  /** 16-char hex average-hash (8×8 bit pack). */
  averageHash: string | null;
  averageHashSource: "png_pixels" | "raw_byte_buckets" | "none";
}

export interface ImageDeltaMetrics {
  identicalSha256: boolean;
  byteLengthDelta: number;
  dimensionsMatch: boolean | null;
  /** Root-mean-square error on comparable samples (0–255 scale). */
  rmse: number | null;
  /** Percent of compared samples that differ. */
  percentDiffering: number | null;
  /** Hamming distance on 64-bit average-hash (0–64). */
  averageHashHamming: number | null;
  verdict: TransformProofVerdict;
}

export interface FluxStrengthParamSnapshot {
  aspectRatio: string | null;
  outputFormat: string | null;
  safetyTolerance: number | null;
  promptUpsampling: boolean | null;
  hasImageStrength: boolean;
  hasDenoise: boolean;
  hasPromptStrength: boolean;
  hasGuidanceScale: boolean;
  hasSeed: boolean;
  strengthLikeFieldsPresent: string[];
  strengthLikeFieldsAbsent: string[];
  /** Code-proven: Flux Kontext edit contract has no denoise/image_strength. */
  fluxKontextLacksDenoiseStrength: boolean;
}

export interface TransformationProofReport {
  schemaVersion: 1;
  diagnosticMode: boolean;
  diagnosticPromptInjected: boolean;
  paidProviderCallAttempted: boolean;
  paidProviderCallCompleted: boolean;
  providerModel: string | null;
  providerRoutingStrategy: string | null;
  providerRoutingReason: string | null;
  providerFallbackUsed: boolean;
  providerRequestCount: number;
  predictionIds: string[];
  input: ImageByteFingerprint | null;
  output: ImageByteFingerprint | null;
  outputUrlHost: string | null;
  delta: ImageDeltaMetrics | null;
  strengthParams: FluxStrengthParamSnapshot | null;
  implicatedLayers: TransformProofLayer[];
  layerNotes: string[];
  secretsRedacted: true;
}

export interface SafeTransformationProofProjection {
  schemaVersion: 1;
  diagnosticMode: boolean;
  diagnosticPromptInjected: boolean;
  paidProviderCallAttempted: boolean;
  paidProviderCallCompleted: boolean;
  providerModel: string | null;
  providerFallbackUsed: boolean;
  providerRequestCount: number;
  predictionIds: string;
  inputSha256: string | null;
  inputBytes: number | null;
  inputDimensions: string | null;
  inputAverageHash: string | null;
  outputSha256: string | null;
  outputBytes: number | null;
  outputDimensions: string | null;
  outputAverageHash: string | null;
  outputUrlHost: string | null;
  identicalSha256: boolean | null;
  byteLengthDelta: number | null;
  rmse: number | null;
  percentDiffering: number | null;
  averageHashHamming: number | null;
  verdict: TransformProofVerdict | null;
  promptUpsampling: boolean | null;
  safetyTolerance: number | null;
  aspectRatio: string | null;
  fluxKontextLacksDenoiseStrength: boolean | null;
  strengthLikeFieldsAbsent: string;
  implicatedLayers: string;
  layerNotes: string;
}

function sha256Hex(bytes: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256ImageBytes(bytes: Buffer | Uint8Array | string): string {
  return sha256Hex(bytes);
}

/** Strip data-URI body; never return the full URI. */
export function decodeDataUriToBytes(dataUri: string): {
  bytes: Buffer;
  mime: string;
  prefix: string;
} | null {
  const raw = String(dataUri || "");
  const m = raw.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!m) return null;
  try {
    const bytes = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
    if (!bytes.length) return null;
    return {
      bytes,
      mime: m[1].toLowerCase(),
      prefix: `data:${m[1].toLowerCase()};base64,`,
    };
  } catch {
    return null;
  }
}

export function guessImageMime(
  bytes: Buffer
): ImageByteFingerprint["mimeGuess"] {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

export function parseImageDimensions(bytes: Buffer): string | null {
  const mime = guessImageMime(bytes);
  if (mime === "image/png" && bytes.length >= 24) {
    const w = bytes.readUInt32BE(16);
    const h = bytes.readUInt32BE(20);
    if (w > 0 && h > 0 && w < 100000 && h < 100000) return `${w}x${h}`;
  }
  if (mime === "image/jpeg") {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = bytes.readUInt16BE(i + 2);
      if (len < 2 || i + 2 + len > bytes.length) break;
      if (
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3
      ) {
        const h = bytes.readUInt16BE(i + 5);
        const w = bytes.readUInt16BE(i + 7);
        if (w > 0 && h > 0) return `${w}x${h}`;
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Minimal PNG → RGBA decode (8-bit color types 0/2/4/6). Fail-soft → null.
 */
export function decodePngRgba(
  bytes: Buffer
): { width: number; height: number; rgba: Buffer } | null {
  if (guessImageMime(bytes) !== "image/png" || bytes.length < 33) return null;
  try {
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = -1;
    const idat: Buffer[] = [];
    while (offset + 8 <= bytes.length) {
      const len = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      const dataStart = offset + 8;
      const dataEnd = dataStart + len;
      if (dataEnd + 4 > bytes.length) break;
      const chunk = bytes.subarray(dataStart, dataEnd);
      if (type === "IHDR" && len >= 13) {
        width = chunk.readUInt32BE(0);
        height = chunk.readUInt32BE(4);
        bitDepth = chunk[8];
        colorType = chunk[9];
      } else if (type === "IDAT") {
        idat.push(Buffer.from(chunk));
      } else if (type === "IEND") {
        break;
      }
      offset = dataEnd + 4;
    }
    if (
      !width ||
      !height ||
      bitDepth !== 8 ||
      width > 4096 ||
      height > 4096 ||
      idat.length === 0
    ) {
      return null;
    }
    const compressed = Buffer.concat(idat);
    const raw = inflateSync(compressed);
    const bpp =
      colorType === 0
        ? 1
        : colorType === 2
          ? 3
          : colorType === 4
            ? 2
            : colorType === 6
              ? 4
              : 0;
    if (!bpp) return null;
    const stride = 1 + width * bpp;
    if (raw.length < stride * height) return null;
    const rgba = Buffer.alloc(width * height * 4);
    const prior = Buffer.alloc(width * bpp);
    for (let y = 0; y < height; y++) {
      const rowStart = y * stride;
      const filter = raw[rowStart];
      const row = raw.subarray(rowStart + 1, rowStart + stride);
      const recon = Buffer.alloc(width * bpp);
      for (let i = 0; i < row.length; i++) {
        const left = i >= bpp ? recon[i - bpp] : 0;
        const up = prior[i];
        const upLeft = i >= bpp ? prior[i - bpp] : 0;
        let val = row[i];
        if (filter === 1) val = (val + left) & 255;
        else if (filter === 2) val = (val + up) & 255;
        else if (filter === 3) val = (val + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          val = (val + pr) & 255;
        } else if (filter !== 0) {
          return null;
        }
        recon[i] = val;
      }
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (colorType === 0) {
          const g = recon[x];
          rgba[o] = g;
          rgba[o + 1] = g;
          rgba[o + 2] = g;
          rgba[o + 3] = 255;
        } else if (colorType === 2) {
          rgba[o] = recon[x * 3];
          rgba[o + 1] = recon[x * 3 + 1];
          rgba[o + 2] = recon[x * 3 + 2];
          rgba[o + 3] = 255;
        } else if (colorType === 4) {
          const g = recon[x * 2];
          rgba[o] = g;
          rgba[o + 1] = g;
          rgba[o + 2] = g;
          rgba[o + 3] = recon[x * 2 + 1];
        } else {
          rgba[o] = recon[x * 4];
          rgba[o + 1] = recon[x * 4 + 1];
          rgba[o + 2] = recon[x * 4 + 2];
          rgba[o + 3] = recon[x * 4 + 3];
        }
      }
      prior.set(recon);
    }
    return { width, height, rgba };
  } catch {
    return null;
  }
}

/** Classic 8×8 average-hash → 16 hex chars. */
export function averageHashFromRgba(
  width: number,
  height: number,
  rgba: Buffer
): string {
  const gray: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / 8));
      const sy = Math.min(height - 1, Math.floor((y * height) / 8));
      const i = (sy * width + sx) * 4;
      gray.push(
        0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
      );
    }
  }
  const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
  let bits = 0n;
  for (let i = 0; i < 64; i++) {
    if (gray[i] >= avg) bits |= 1n << BigInt(63 - i);
  }
  return bits.toString(16).padStart(16, "0");
}

/** Dep-free fallback fingerprint when pixels cannot be decoded. */
export function averageHashFromRawBytes(bytes: Buffer): string {
  if (!bytes.length) return "0".repeat(16);
  const bucketSize = Math.max(1, Math.floor(bytes.length / 64));
  const means: number[] = [];
  for (let i = 0; i < 64; i++) {
    const start = i * bucketSize;
    const end = Math.min(bytes.length, start + bucketSize);
    let sum = 0;
    for (let j = start; j < end; j++) sum += bytes[j];
    means.push(end > start ? sum / (end - start) : 0);
  }
  const avg = means.reduce((a, b) => a + b, 0) / means.length;
  let bits = 0n;
  for (let i = 0; i < 64; i++) {
    if (means[i] >= avg) bits |= 1n << BigInt(63 - i);
  }
  return bits.toString(16).padStart(16, "0");
}

export function hammingHex64(a: string | null, b: string | null): number | null {
  if (!a || !b || a.length !== 16 || b.length !== 16) return null;
  try {
    let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
    let count = 0;
    while (x > 0n) {
      count += Number(x & 1n);
      x >>= 1n;
    }
    return count;
  } catch {
    return null;
  }
}

export function fingerprintImageBytes(bytes: Buffer): ImageByteFingerprint {
  const mimeGuess = guessImageMime(bytes);
  const dimensions = parseImageDimensions(bytes);
  let averageHash: string | null = null;
  let averageHashSource: ImageByteFingerprint["averageHashSource"] = "none";
  const png = mimeGuess === "image/png" ? decodePngRgba(bytes) : null;
  if (png) {
    averageHash = averageHashFromRgba(png.width, png.height, png.rgba);
    averageHashSource = "png_pixels";
  } else if (bytes.length > 0) {
    averageHash = averageHashFromRawBytes(bytes);
    averageHashSource = "raw_byte_buckets";
  }
  return {
    sha256: sha256ImageBytes(bytes),
    byteLength: bytes.length,
    mimeGuess,
    dimensions,
    averageHash,
    averageHashSource,
  };
}

/**
 * Pixel RMSE / % differing when both PNG-decodable and same dimensions;
 * else byte-sample RMSE when lengths match.
 */
export function compareImageBytes(
  input: Buffer,
  output: Buffer
): ImageDeltaMetrics {
  const inFp = fingerprintImageBytes(input);
  const outFp = fingerprintImageBytes(output);
  const identicalSha256 = inFp.sha256 === outFp.sha256;
  const dimensionsMatch =
    inFp.dimensions && outFp.dimensions
      ? inFp.dimensions === outFp.dimensions
      : null;
  const averageHashHamming = hammingHex64(inFp.averageHash, outFp.averageHash);

  let rmse: number | null = null;
  let percentDiffering: number | null = null;

  const inPng = decodePngRgba(input);
  const outPng = decodePngRgba(output);
  if (
    inPng &&
    outPng &&
    inPng.width === outPng.width &&
    inPng.height === outPng.height
  ) {
    const n = inPng.rgba.length;
    let sumSq = 0;
    let differing = 0;
    const pixels = inPng.width * inPng.height;
    for (let i = 0; i < n; i += 4) {
      const dr = inPng.rgba[i] - outPng.rgba[i];
      const dg = inPng.rgba[i + 1] - outPng.rgba[i + 1];
      const db = inPng.rgba[i + 2] - outPng.rgba[i + 2];
      sumSq += dr * dr + dg * dg + db * db;
      if (dr !== 0 || dg !== 0 || db !== 0) differing += 1;
    }
    rmse = Math.sqrt(sumSq / Math.max(1, pixels * 3));
    percentDiffering = (differing / Math.max(1, pixels)) * 100;
  } else if (input.length === output.length && input.length > 0) {
    let sumSq = 0;
    let differing = 0;
    for (let i = 0; i < input.length; i++) {
      const d = input[i] - output[i];
      sumSq += d * d;
      if (d !== 0) differing += 1;
    }
    rmse = Math.sqrt(sumSq / input.length);
    percentDiffering = (differing / input.length) * 100;
  }

  let verdict: TransformProofVerdict;
  if (identicalSha256) {
    verdict = "identical_bytes";
  } else if (dimensionsMatch === false) {
    verdict = "dimensions_mismatch";
  } else if (
    (averageHashHamming != null && averageHashHamming <= 6) ||
    (rmse != null && rmse < 8 && (percentDiffering == null || percentDiffering < 5))
  ) {
    verdict = "near_identical";
  } else if (
    (averageHashHamming != null && averageHashHamming >= 12) ||
    (rmse != null && rmse >= 15) ||
    (percentDiffering != null && percentDiffering >= 10)
  ) {
    verdict = "clearly_transformed";
  } else if (rmse == null && averageHashHamming == null) {
    verdict = inFp.sha256 === outFp.sha256 ? "identical_bytes" : "clearly_transformed";
  } else {
    verdict = "near_identical";
  }

  return {
    identicalSha256,
    byteLengthDelta: outFp.byteLength - inFp.byteLength,
    dimensionsMatch,
    rmse: rmse != null ? Math.round(rmse * 1000) / 1000 : null,
    percentDiffering:
      percentDiffering != null
        ? Math.round(percentDiffering * 1000) / 1000
        : null,
    averageHashHamming,
    verdict,
  };
}

const STRENGTH_LIKE_ABSENT = [
  "image_strength",
  "denoise",
  "denoising_strength",
  "prompt_strength",
  "guidance_scale",
  "strength",
] as const;

export function inspectFluxStrengthParams(
  input: Record<string, unknown> | null | undefined
): FluxStrengthParamSnapshot {
  const obj = input && typeof input === "object" ? input : {};
  const present: string[] = [];
  for (const key of STRENGTH_LIKE_ABSENT) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) present.push(key);
  }
  const absent = STRENGTH_LIKE_ABSENT.filter((k) => !present.includes(k));
  return {
    aspectRatio:
      typeof obj.aspect_ratio === "string" ? obj.aspect_ratio : null,
    outputFormat:
      typeof obj.output_format === "string" ? obj.output_format : null,
    safetyTolerance:
      typeof obj.safety_tolerance === "number" ? obj.safety_tolerance : null,
    promptUpsampling:
      typeof obj.prompt_upsampling === "boolean"
        ? obj.prompt_upsampling
        : null,
    hasImageStrength: present.includes("image_strength"),
    hasDenoise:
      present.includes("denoise") || present.includes("denoising_strength"),
    hasPromptStrength: present.includes("prompt_strength"),
    hasGuidanceScale: present.includes("guidance_scale"),
    hasSeed: Object.prototype.hasOwnProperty.call(obj, "seed"),
    strengthLikeFieldsPresent: present,
    strengthLikeFieldsAbsent: [...absent],
    fluxKontextLacksDenoiseStrength:
      !present.includes("image_strength") &&
      !present.includes("denoise") &&
      !present.includes("denoising_strength") &&
      !present.includes("prompt_strength"),
  };
}

export function buildTransformationProofDiagnosticPrompt(
  basePrompt: string
): string {
  const base = String(basePrompt || "").trim();
  const diagnosticBlock = [
    TRANSFORM_PROOF_PROMPT_MARKER,
    "INTERNAL DIAGNOSTIC ATTRIBUTION ONLY — not production prompt calibration.",
    "Apply an unmistakable, anatomically safe adult progress-photo transformation:",
    "- visibly broader shoulders and thicker upper arms;",
    "- clearly narrower waist;",
    "- replace the entire background with a solid unexpected vivid teal (#008080) as a no-op marker.",
    "Keep the same person identity and face. Photorealistic. No cartoon, no nudity, no text overlays.",
  ].join(" ");
  return base ? `${base}\n\n${diagnosticBlock}` : diagnosticBlock;
}

export function isTransformProofDiagnosticRequested(
  value: unknown
): value is typeof TRANSFORM_PROOF_DIAGNOSTIC_MODE {
  return value === TRANSFORM_PROOF_DIAGNOSTIC_MODE;
}

export function isTransformProofDiagnosticEnvEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return (
    env[TRANSFORM_PROOF_DIAGNOSTIC_ENV] === "1" ||
    env[CONTROL_ROOM_ENABLED_ENV] === "1"
  );
}

/** Timing-safe Control Room access-key check (header only — never body). */
export function verifyControlRoomAccessKey(
  presented: unknown,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const expected =
    typeof env[CONTROL_ROOM_ACCESS_KEY_ENV] === "string"
      ? env[CONTROL_ROOM_ACCESS_KEY_ENV]!.trim()
      : "";
  const got = typeof presented === "string" ? presented.trim() : "";
  if (!expected || expected.length < 16 || !got) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  if (a.length !== b.length) {
    // Still run a compare to reduce length-leak timing skew on equal-length path.
    const padded = Buffer.alloc(a.length);
    b.copy(padded, 0, 0, Math.min(b.length, a.length));
    timingSafeEqual(a, padded);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function isTransformProofDiagnosticAllowed(args: {
  requested: boolean;
  controlRoomAuthorized: boolean;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): boolean {
  if (!args.requested || !args.controlRoomAuthorized) return false;
  return isTransformProofDiagnosticEnvEnabled(args.env ?? process.env);
}

export function outputUrlHostOnly(url: string | null | undefined): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const u = new URL(url);
    return u.host || null;
  } catch {
    return null;
  }
}

export function buildTransformationProofReport(args: {
  diagnosticMode: boolean;
  diagnosticPromptInjected: boolean;
  paidProviderCallAttempted: boolean;
  paidProviderCallCompleted: boolean;
  providerModel?: string | null;
  providerRoutingStrategy?: string | null;
  providerRoutingReason?: string | null;
  providerFallbackUsed?: boolean;
  providerRequestCount?: number;
  predictionIds?: string[];
  inputBytes?: Buffer | null;
  outputBytes?: Buffer | null;
  outputImageUrl?: string | null;
  strengthInput?: Record<string, unknown> | null;
  clientDisplayedUrlHost?: string | null;
}): TransformationProofReport {
  const strengthParams = inspectFluxStrengthParams(args.strengthInput);
  const input = args.inputBytes ? fingerprintImageBytes(args.inputBytes) : null;
  const output = args.outputBytes
    ? fingerprintImageBytes(args.outputBytes)
    : null;
  const delta =
    args.inputBytes && args.outputBytes
      ? compareImageBytes(args.inputBytes, args.outputBytes)
      : args.paidProviderCallCompleted
        ? {
            identicalSha256: false,
            byteLengthDelta: 0,
            dimensionsMatch: null,
            rmse: null,
            percentDiffering: null,
            averageHashHamming: null,
            verdict: "output_unavailable" as const,
          }
        : {
            identicalSha256: false,
            byteLengthDelta: 0,
            dimensionsMatch: null,
            rmse: null,
            percentDiffering: null,
            averageHashHamming: null,
            verdict: "comparison_skipped" as const,
          };

  const implicated: TransformProofLayer[] = [];
  const notes: string[] = [];

  if (strengthParams.fluxKontextLacksDenoiseStrength) {
    implicated.push("provider_parameters");
    notes.push(
      "Flux Kontext request has no image_strength/denoise/prompt_strength — change is language-only; weak adherence can look like a no-op."
    );
  }
  if (strengthParams.aspectRatio === "match_input_image") {
    notes.push(
      "aspect_ratio=match_input_image preserves framing; does not by itself prove identity lock, but pairs with strong input conditioning."
    );
  }
  if (
    strengthParams.promptUpsampling === false &&
    args.diagnosticMode === false
  ) {
    implicated.push("provider_parameters");
    notes.push(
      "prompt_upsampling was false for this request — may reduce instruction amplification on mild BF/timeline cases."
    );
  }
  if (args.providerFallbackUsed) {
    implicated.push("fallback_routing");
    notes.push("Ordered Flux fallback was used; compare successful model vs initial plan.");
  }
  if (delta.verdict === "identical_bytes") {
    implicated.push("provider_capability");
    notes.push(
      "Server-downloaded output SHA-256 matches input — provider (or cache) returned near/exact copy before client render."
    );
  } else if (delta.verdict === "near_identical") {
    implicated.push("provider_capability");
    implicated.push("prompt_construction");
    notes.push(
      "Output differs in bytes but perceptual/byte delta is small — transformation strength likely lost at provider adherence or prompt force."
    );
  } else if (delta.verdict === "clearly_transformed") {
    notes.push(
      "Server-side output differs clearly from input — if UI still looks unchanged, suspect frontend_rendering or wrong URL display."
    );
    if (
      args.clientDisplayedUrlHost &&
      args.outputImageUrl &&
      outputUrlHostOnly(args.outputImageUrl) !== args.clientDisplayedUrlHost
    ) {
      implicated.push("frontend_rendering");
      notes.push("Client displayed URL host differs from provider output host.");
    }
  } else if (
    delta.verdict === "output_unavailable" ||
    delta.verdict === "comparison_skipped"
  ) {
    implicated.push("inconclusive_pending_owner_run");
    notes.push(
      "Paid diagnostic image comparison not completed — code suspects remain; run Control Room gated diagnostic when REPLICATE_API_TOKEN is configured."
    );
  }

  // Deduplicate layers preserving order
  const seen = new Set<TransformProofLayer>();
  const implicatedLayers = implicated.filter((l) => {
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  return {
    schemaVersion: 1,
    diagnosticMode: Boolean(args.diagnosticMode),
    diagnosticPromptInjected: Boolean(args.diagnosticPromptInjected),
    paidProviderCallAttempted: Boolean(args.paidProviderCallAttempted),
    paidProviderCallCompleted: Boolean(args.paidProviderCallCompleted),
    providerModel: args.providerModel ?? null,
    providerRoutingStrategy: args.providerRoutingStrategy ?? null,
    providerRoutingReason: args.providerRoutingReason ?? null,
    providerFallbackUsed: Boolean(args.providerFallbackUsed),
    providerRequestCount:
      typeof args.providerRequestCount === "number"
        ? args.providerRequestCount
        : 0,
    predictionIds: Array.isArray(args.predictionIds)
      ? args.predictionIds.filter((id) => typeof id === "string" && id)
      : [],
    input,
    output,
    outputUrlHost: outputUrlHostOnly(args.outputImageUrl),
    delta,
    strengthParams,
    implicatedLayers,
    layerNotes: notes,
    secretsRedacted: true,
  };
}

export function projectTransformationProofForControlRoom(
  report: TransformationProofReport | null | undefined
): SafeTransformationProofProjection | Record<string, string | number | boolean | null> {
  if (!report) {
    return {
      available: false,
      note: "No transformation proof in this session. Run gated diagnosticMode=transformation_proof.",
    };
  }
  return {
    schemaVersion: report.schemaVersion,
    diagnosticMode: report.diagnosticMode,
    diagnosticPromptInjected: report.diagnosticPromptInjected,
    paidProviderCallAttempted: report.paidProviderCallAttempted,
    paidProviderCallCompleted: report.paidProviderCallCompleted,
    providerModel: report.providerModel,
    providerFallbackUsed: report.providerFallbackUsed,
    providerRequestCount: report.providerRequestCount,
    predictionIds: report.predictionIds.join(",") || "—",
    inputSha256: report.input?.sha256 ?? null,
    inputBytes: report.input?.byteLength ?? null,
    inputDimensions: report.input?.dimensions ?? null,
    inputAverageHash: report.input?.averageHash ?? null,
    outputSha256: report.output?.sha256 ?? null,
    outputBytes: report.output?.byteLength ?? null,
    outputDimensions: report.output?.dimensions ?? null,
    outputAverageHash: report.output?.averageHash ?? null,
    outputUrlHost: report.outputUrlHost,
    identicalSha256: report.delta?.identicalSha256 ?? null,
    byteLengthDelta: report.delta?.byteLengthDelta ?? null,
    rmse: report.delta?.rmse ?? null,
    percentDiffering: report.delta?.percentDiffering ?? null,
    averageHashHamming: report.delta?.averageHashHamming ?? null,
    verdict: report.delta?.verdict ?? null,
    promptUpsampling: report.strengthParams?.promptUpsampling ?? null,
    safetyTolerance: report.strengthParams?.safetyTolerance ?? null,
    aspectRatio: report.strengthParams?.aspectRatio ?? null,
    fluxKontextLacksDenoiseStrength:
      report.strengthParams?.fluxKontextLacksDenoiseStrength ?? null,
    strengthLikeFieldsAbsent:
      report.strengthParams?.strengthLikeFieldsAbsent.join(",") || "—",
    implicatedLayers: report.implicatedLayers.join(",") || "—",
    layerNotes: report.layerNotes.join(" | ") || "—",
  };
}

/**
 * Download provider output for server-side compare. Test-injectable.
 * Never logs body; returns bytes + host only.
 */
export async function downloadProviderImageBytes(
  imageUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ bytes: Buffer; host: string | null } | null> {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) return null;
  if (!/^https:\/\//i.test(imageUrl)) return null;
  const host = outputUrlHostOnly(imageUrl);
  try {
    const res = await fetchImpl(imageUrl, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "image/*,*/*" },
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const bytes = Buffer.from(ab);
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) return null;
    return { bytes, host };
  } catch {
    return null;
  }
}

/** Encode a tiny synthetic PNG (solid RGB) for tests — no deps. */
export function encodeSolidPngRgba(
  width: number,
  height: number,
  rgb: [number, number, number]
): Buffer {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  function chunk(type: string, data: Buffer): Buffer {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    crc.writeUInt32BE(crcVal >>> 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }
  function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const o = row + 1 + x * 3;
      raw[o] = rgb[0];
      raw[o + 1] = rgb[1];
      raw[o + 2] = rgb[2];
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
