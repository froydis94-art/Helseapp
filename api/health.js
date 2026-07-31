module.exports = function handler(_req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    ok: true,
    hasReplicateToken: Boolean(process.env.REPLICATE_API_TOKEN),
    hasTerra: Boolean(process.env.TERRA_DEV_ID && process.env.TERRA_API_KEY),
    model: process.env.REPLICATE_MODEL || "black-forest-labs/flux-kontext-pro",
    fallbackModel:
      process.env.REPLICATE_FALLBACK_MODEL ||
      "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
    mode: "vercel",
  });
};
