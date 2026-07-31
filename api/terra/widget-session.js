const { createWidgetSession, setCors, terraConfigured } = require("../../lib/terra");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed." });
  }

  if (!terraConfigured()) {
    return res.status(503).json({
      error:
        "Terra is not configured on the server. Add TERRA_DEV_ID and TERRA_API_KEY in Vercel env.",
    });
  }

  try {
    const referenceId =
      String(req.body?.referenceId || "").trim() ||
      `web_${Date.now().toString(36)}`;
    const language = String(req.body?.language || "en").slice(0, 5);
    const origin = String(req.body?.origin || req.headers.origin || "").replace(/\/$/, "");
    const base =
      origin ||
      process.env.APP_BASE_URL ||
      "https://helseapp-2.vercel.app";

    const successUrl = `${base}/?terra=success`;
    const failureUrl = `${base}/?terra=failure`;

    const session = await createWidgetSession({
      referenceId,
      language,
      successUrl,
      failureUrl,
      providers: req.body?.providers,
    });

    return res.status(200).json({
      ok: true,
      referenceId,
      url: session.url,
      sessionId: session.session_id,
      expiresIn: session.expires_in,
    });
  } catch (error) {
    console.error("[terra/widget-session]", error);
    return res.status(error.status || 500).json({
      error: error.message || "Could not create Terra widget session",
      details: error.details || null,
    });
  }
};
