const { getConfiguredModels } = require("../lib/replicate");

module.exports = function handler(_req, res) {
  const models = getConfiguredModels();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    ok: true,
    hasReplicateToken: Boolean(process.env.REPLICATE_API_TOKEN),
    hasTerra: Boolean(process.env.TERRA_DEV_ID && process.env.TERRA_API_KEY),
    model: models.model,
    fallbackModel: models.fallbackModel,
    modelFromEnv: models.modelFromEnv,
    ignoredEnvModel: models.ignoredEnvModel,
    mode: "vercel",
  });
};
