module.exports = function handler(_req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    ok: true,
    hasReplicateToken: Boolean(process.env.REPLICATE_API_TOKEN),
    model: process.env.REPLICATE_MODEL || "black-forest-labs/flux-kontext-pro",
    mode: "vercel",
  });
};
