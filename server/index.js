import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { generateWithReplicate } = require("../lib/replicate.js");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const PORT = process.env.PORT || 8787;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_MODEL =
  process.env.REPLICATE_MODEL || "black-forest-labs/flux-kontext-pro";

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    hasReplicateToken: Boolean(REPLICATE_API_TOKEN),
    model: REPLICATE_MODEL,
    mode: "local",
  });
});

app.post("/api/generate-future-you", upload.single("image"), async (req, res) => {
  try {
    const maal = (req.body?.maal || "").trim();
    const intensity = (req.body?.intensity || "moderate").trim();

    if (!maal) {
      return res.status(400).json({ error: "Mangler mål (maal)." });
    }

    let imageBuffer = req.file?.buffer;
    let mimeType = req.file?.mimetype || "image/jpeg";

    if (!imageBuffer && req.body?.imageBase64) {
      const raw = String(req.body.imageBase64).replace(/^data:image\/\w+;base64,/, "");
      imageBuffer = Buffer.from(raw, "base64");
      mimeType = req.body.mimeType || "image/jpeg";
    }

    if (!imageBuffer?.length) {
      return res.status(400).json({
        error: "Mangler bilde. Last opp et utgangsbilde for å beholde ansikt/identitet.",
      });
    }

    const generated = await generateWithReplicate({
      imageBuffer,
      mimeType,
      maal,
      intensity,
      token: REPLICATE_API_TOKEN,
      model: REPLICATE_MODEL,
    });

    res.json({
      ok: true,
      ...generated,
      disclaimer:
        "Motivational visualization only — not a medical prediction of your body.",
    });
  } catch (error) {
    console.error("[generate-future-you]", error);
    res.status(error.status || 500).json({
      error: error.message || "Ukjent serverfeil",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Helseapp API listening on http://localhost:${PORT}`);
  console.log(`Replicate token loaded: ${Boolean(REPLICATE_API_TOKEN)}`);
  console.log(`Model: ${REPLICATE_MODEL}`);
});
