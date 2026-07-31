const { verifyTerraSignature } = require("../../lib/terra");

/**
 * Terra webhook destination.
 * Without a database we acknowledge events and keep a tiny in-memory cache
 * for the latest payload per user (best-effort on the same instance).
 * The app uses /api/terra/sync for reliable pulls.
 */
const latestByUser = new Map();

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "terra-webhook",
      hint: "Point Terra Dashboard webhook URL here.",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed." });
  }

  try {
    const rawBody =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body || {});
    const signature =
      req.headers["terra-signature"] || req.headers["Terra-Signature"] || "";
    const verified = verifyTerraSignature(rawBody, signature);
    if (!verified.ok) {
      return res.status(401).json({ error: verified.reason || "Unauthorized" });
    }

    const payload =
      typeof req.body === "object" && req.body ? req.body : JSON.parse(rawBody);
    const userId = payload?.user?.user_id;
    if (userId) {
      latestByUser.set(userId, {
        type: payload.type,
        receivedAt: new Date().toISOString(),
        provider: payload?.user?.provider || null,
        referenceId: payload?.user?.reference_id || null,
      });
    }

    console.log("[terra/webhook]", {
      type: payload?.type,
      userId,
      provider: payload?.user?.provider,
      verified: !verified.skipped,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[terra/webhook]", error);
    return res.status(500).json({ error: error.message || "Webhook error" });
  }
};

// Prefer raw body for signature verification when available
module.exports.config = {
  api: {
    bodyParser: true,
  },
};
