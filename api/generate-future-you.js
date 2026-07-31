const { generateWithReplicate } = require("../lib/replicate");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Kun POST er tillatt." });
  }

  try {
    const maal = String(req.body?.maal || "").trim() || "visible athletic body transformation";
    const intensity = String(req.body?.intensity || "moderate").trim();
    const horizon = String(req.body?.horizon || "8w").trim();
    const focus = String(req.body?.focus || "overall").trim();
    const zone = String(req.body?.zone || "").trim();
    const zones = Array.isArray(req.body?.zones)
      ? req.body.zones.map(String)
      : String(req.body?.zones || "")
          .split(",")
          .map((z) => z.trim())
          .filter(Boolean);
    const fat = String(req.body?.fat || "decrease").trim();
    const muscle = String(req.body?.muscle || "toned").trim();
    const bfNow = req.body?.bfNow;
    const bfGoal = req.body?.bfGoal;
    const medicine = Boolean(req.body?.medicine);
    const paceLabel = String(req.body?.paceLabel || "").trim();
    const goalTitle = String(req.body?.goalTitle || "").trim();
    const horizonDate = String(req.body?.horizonDate || "").trim();
    const occasionLabel = String(req.body?.occasionLabel || "").trim();

    const imageBase64 = req.body?.imageBase64;
    if (!imageBase64) {
      return res.status(400).json({
        error: "Mangler bilde. Send imageBase64 fra appen.",
      });
    }

    const raw = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(raw, "base64");
    const mimeType = req.body?.mimeType || "image/jpeg";

    if (!imageBuffer.length) {
      return res.status(400).json({ error: "Tomt bilde." });
    }

    const generated = await generateWithReplicate({
      imageBuffer,
      mimeType,
      maal,
      intensity,
      horizon,
      focus,
      zone,
      zones: zones.length ? zones : zone ? [zone] : [],
      fat,
      muscle,
      bfNow,
      bfGoal,
      medicine,
      paceLabel,
      goalTitle,
      horizonDate,
      occasionLabel,
    });

    return res.status(200).json({
      ok: true,
      ...generated,
      disclaimer:
        "Motivational visualization only — not a medical prediction of your body.",
    });
  } catch (error) {
    console.error("[generate-future-you]", error);
    return res.status(error.status || 500).json({
      error: error.message || "Ukjent serverfeil",
    });
  }
}

handler.config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 120,
};

module.exports = handler;
