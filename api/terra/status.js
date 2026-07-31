const { terraConfigured, setCors } = require("../../lib/terra");

module.exports = function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  return res.status(200).json({
    ok: true,
    configured: terraConfigured(),
    hasWebhookSecret: Boolean(process.env.TERRA_WEBHOOK_SECRET),
    webhookUrlHint: "https://helseapp-2.vercel.app/api/terra/webhook",
  });
};
