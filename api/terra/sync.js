const { syncMetricsForUser, setCors, terraConfigured } = require("../../lib/terra");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Only GET/POST allowed." });
  }

  if (!terraConfigured()) {
    return res.status(503).json({
      error:
        "Terra is not configured on the server. Add TERRA_DEV_ID and TERRA_API_KEY in Vercel env.",
    });
  }

  try {
    const userId = String(
      req.body?.userId || req.query?.userId || ""
    ).trim();
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const metrics = await syncMetricsForUser(userId);
    return res.status(200).json({ ok: true, metrics });
  } catch (error) {
    console.error("[terra/sync]", error);
    return res.status(error.status || 500).json({
      error: error.message || "Terra sync failed",
      details: error.details || null,
    });
  }
};
