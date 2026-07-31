const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

/** Soften user goals so Replicate's safety filter (E005) is less likely to trip. */
function sanitizeGoal(maal) {
  return String(maal || "")
    .replace(/mage(?:muskel|r)?|abs|six[\s-]?pack|nak(en|ent)|nude|sexy|hot/gi, "fitness")
    .replace(/muskel(?:er|masse)?|shredded|bulking|bodybuilding/gi, "athletic tone")
    .replace(/fett(?:prosent)?|body\s*fat/gi, "fitness condition")
    .trim();
}

function buildPrompt(maal, intensity = "moderate") {
  const safeGoal = sanitizeGoal(maal);
  const strength =
    intensity === "strong"
      ? "a clear but tasteful improvement in athletic fitness appearance"
      : intensity === "subtle"
        ? "a subtle, realistic improvement in healthy fitness appearance"
        : "a moderate, realistic improvement in athletic fitness appearance";

  return [
    "Edit this exact same person for a motivational fitness-app progress preview.",
    "Keep the identical face, hair, age, skin tone, identity, pose, framing, and background.",
    "Keep the exact same clothing type and coverage — do not remove clothes, do not make clothing more revealing.",
    "If the person wears underwear or minimal clothing, keep it exactly as-is; do not eroticize the image.",
    "Only apply light, tasteful fitness progress cues (posture, healthy athletic look).",
    `User goal (keep G-rated): ${safeGoal || "healthy athletic fitness progress"}.`,
    `Change intensity: ${strength}.`,
    "Photorealistic, natural lighting, family-friendly, no text, no watermark, no logo, no nudity.",
  ].join(" ");
}

function toDataUri(imageBuffer, mimeType) {
  const mime = mimeType || "image/jpeg";
  return `data:${mime};base64,${imageBuffer.toString("base64")}`;
}

function extractOutputUrl(output) {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length) {
    return extractOutputUrl(output[0]);
  }
  if (typeof output === "object" && output.url) return output.url;
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyError(message) {
  const text = String(message || "");
  if (/sensitive|E005|flagged/i.test(text)) {
    return [
      "Replicate blokkerte bildet (sikkerhetsfilter E005).",
      "Prøv: bilde i treningstøy (t-skjorte/shorts), mildere måltekst, intensitet «Mild».",
      "Unngå bar overkropp / undertøy hvis filteret stopper deg.",
    ].join(" ");
  }
  return text;
}

async function pollPrediction(getUrl, token) {
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const response = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const prediction = await response.json();

    if (!response.ok) {
      const err = new Error(
        friendlyError(
          prediction?.detail || `Replicate polling feilet (${response.status})`
        )
      );
      err.status = response.status;
      throw err;
    }

    if (prediction.status === "succeeded") return prediction;

    if (prediction.status === "failed" || prediction.status === "canceled") {
      const err = new Error(
        friendlyError(
          prediction?.error || `Replicate-jobben feilet (${prediction.status})`
        )
      );
      err.status = 502;
      throw err;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  const err = new Error("Replicate brukte for lang tid. Prøv igjen.");
  err.status = 504;
  throw err;
}

async function generateWithReplicate({
  imageBuffer,
  mimeType,
  maal,
  intensity,
  token = process.env.REPLICATE_API_TOKEN,
  model = process.env.REPLICATE_MODEL || "black-forest-labs/flux-kontext-pro",
}) {
  if (!token) {
    const err = new Error(
      "REPLICATE_API_TOKEN mangler. Sett den som miljøvariabel i Vercel/skyen."
    );
    err.status = 503;
    throw err;
  }

  if (!model.includes("/")) {
    const err = new Error(
      'REPLICATE_MODEL må være "eier/modellnavn", f.eks. black-forest-labs/flux-kontext-pro'
    );
    err.status = 500;
    throw err;
  }

  const prompt = buildPrompt(maal, intensity);
  const imageDataUri = toDataUri(imageBuffer, mimeType);

  // safety_tolerance: 0 = strict, 6 = most permissive (Black Forest Labs)
  const input = model.includes("flux-kontext")
    ? {
        prompt,
        input_image: imageDataUri,
        aspect_ratio: "match_input_image",
        output_format: "jpg",
        safety_tolerance: 6,
      }
    : {
        prompt,
        image: imageDataUri,
        prompt_strength:
          intensity === "strong" ? 0.65 : intensity === "subtle" ? 0.4 : 0.55,
        num_inference_steps: 28,
        disable_safety_checker: true,
      };

  const createUrl = `https://api.replicate.com/v1/models/${model}/predictions`;
  const createResponse = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ input }),
  });

  let prediction = await createResponse.json();

  if (!createResponse.ok) {
    const detail =
      typeof prediction?.detail === "string"
        ? prediction.detail
        : JSON.stringify(prediction?.detail || prediction);
    const err = new Error(
      friendlyError(
        detail ||
          `Replicate feilet (${createResponse.status}). Sjekk token, kreditt og modell.`
      )
    );
    err.status = createResponse.status;
    throw err;
  }

  if (
    prediction.status !== "succeeded" &&
    prediction?.urls?.get &&
    prediction.status !== "failed"
  ) {
    prediction = await pollPrediction(prediction.urls.get, token);
  }

  if (prediction.status === "failed") {
    const err = new Error(
      friendlyError(prediction.error || "Replicate-jobben feilet.")
    );
    err.status = 502;
    throw err;
  }

  const imageUrl = extractOutputUrl(prediction.output);
  if (!imageUrl) {
    // Empty output often means safety blocked the result
    throw new Error(
      friendlyError(
        "The input or output was flagged as sensitive. Please try again with different inputs. (E005)"
      )
    );
  }

  return { imageUrl, model };
}

module.exports = { generateWithReplicate, buildPrompt, sanitizeGoal };
