const crypto = require("crypto");

const TERRA_API = "https://api.tryterra.co/v2";

function terraConfigured() {
  return Boolean(process.env.TERRA_DEV_ID && process.env.TERRA_API_KEY);
}

function terraHeaders() {
  if (!terraConfigured()) {
    const err = new Error(
      "Terra er ikke konfigurert. Sett TERRA_DEV_ID og TERRA_API_KEY i Vercel."
    );
    err.status = 503;
    throw err;
  }
  return {
    "dev-id": process.env.TERRA_DEV_ID,
    "x-api-key": process.env.TERRA_API_KEY,
    "Content-Type": "application/json",
  };
}

async function terraFetch(path, { method = "GET", body } = {}) {
  const response = await fetch(`${TERRA_API}${path}`, {
    method,
    headers: terraHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const err = new Error(
      data?.message || data?.error || `Terra HTTP ${response.status}`
    );
    err.status = response.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function createWidgetSession({
  referenceId,
  language = "en",
  successUrl,
  failureUrl,
  providers,
}) {
  const payload = {
    reference_id: referenceId,
    language,
    auth_success_redirect_url: successUrl,
    auth_failure_redirect_url: failureUrl,
  };
  if (providers?.length) payload.providers = providers;

  return terraFetch("/auth/generateWidgetSession", {
    method: "POST",
    body: payload,
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchTerraResource(resource, userId, startDate, endDate) {
  const qs = new URLSearchParams({
    user_id: userId,
    start_date: startDate,
    end_date: endDate || startDate,
    to_webhook: "false",
  });
  return terraFetch(`/${resource}?${qs.toString()}`);
}

function pickNumber(...candidates) {
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function extractSteps(dailyPayload) {
  const rows = dailyPayload?.data || [];
  let steps = 0;
  for (const row of rows) {
    const n = pickNumber(
      row?.distance_data?.steps,
      row?.distance_data?.summary?.steps,
      row?.steps_data?.summary?.count,
      row?.steps
    );
    if (n != null) steps = Math.max(steps, n);
  }
  return steps || null;
}

function extractActivityCount(activityPayload) {
  const rows = activityPayload?.data || [];
  return rows.length || null;
}

function extractWeightKg(bodyPayload) {
  const rows = bodyPayload?.data || [];
  for (const row of rows) {
    const measurements = row?.measurements_data?.measurements || [];
    for (const m of measurements) {
      const kg = pickNumber(m?.weight_kg, m?.weight);
      if (kg != null) return kg;
    }
    const kg = pickNumber(
      row?.measurements_data?.weight_kg,
      row?.body_data?.weight_kg,
      row?.weight_kg
    );
    if (kg != null) return kg;
  }
  return null;
}

function extractNutrition(nutritionPayload) {
  const rows = nutritionPayload?.data || [];
  let kcal = 0;
  let protein = 0;
  let found = false;
  for (const row of rows) {
    const rowKcal = pickNumber(
      row?.calories_data?.total_burned_calories,
      row?.calories_data?.calorie_intake_kcal,
      row?.summary?.calories,
      row?.calories
    );
    const rowProtein = pickNumber(
      row?.macros?.protein_g,
      row?.nutrition_macros?.protein_g,
      row?.protein_g,
      row?.summary?.protein_g
    );
    if (rowKcal != null) {
      kcal += rowKcal;
      found = true;
    }
    if (rowProtein != null) {
      protein += rowProtein;
      found = true;
    }
    const meals = row?.meals || row?.meals_data?.meals || [];
    for (const meal of meals) {
      const mealKcal = pickNumber(meal?.calories, meal?.calories_kcal);
      const mealProtein = pickNumber(meal?.protein_g, meal?.macros?.protein_g);
      if (mealKcal != null) {
        kcal += mealKcal;
        found = true;
      }
      if (mealProtein != null) {
        protein += mealProtein;
        found = true;
      }
    }
  }
  if (!found) return { kcal: null, protein: null };
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
  };
}

async function syncMetricsForUser(userId) {
  const start = daysAgoIso(7);
  const end = todayIso();
  const today = todayIso();

  const [daily, activity, body, nutrition] = await Promise.allSettled([
    fetchTerraResource("daily", userId, today, today),
    fetchTerraResource("activity", userId, start, end),
    fetchTerraResource("body", userId, start, end),
    fetchTerraResource("nutrition", userId, today, today),
  ]);

  const dailyData = daily.status === "fulfilled" ? daily.value : null;
  const activityData = activity.status === "fulfilled" ? activity.value : null;
  const bodyData = body.status === "fulfilled" ? body.value : null;
  const nutritionData = nutrition.status === "fulfilled" ? nutrition.value : null;

  const food = extractNutrition(nutritionData || {});
  const provider =
    dailyData?.user?.provider ||
    activityData?.user?.provider ||
    bodyData?.user?.provider ||
    nutritionData?.user?.provider ||
    null;

  return {
    userId,
    provider,
    syncedAt: new Date().toISOString(),
    stepsToday: extractSteps(dailyData || {}),
    activitiesLast7Days: extractActivityCount(activityData || {}),
    weightKg: extractWeightKg(bodyData || {}),
    kcalToday: food.kcal,
    proteinToday: food.protein,
    errors: {
      daily: daily.status === "rejected" ? daily.reason.message : null,
      activity: activity.status === "rejected" ? activity.reason.message : null,
      body: body.status === "rejected" ? body.reason.message : null,
      nutrition:
        nutrition.status === "rejected" ? nutrition.reason.message : null,
    },
  };
}

function verifyTerraSignature(rawBody, signatureHeader) {
  const secret = process.env.TERRA_WEBHOOK_SECRET;
  if (!secret) return { ok: true, skipped: true };
  if (!signatureHeader) return { ok: false, reason: "Missing terra-signature" };

  const parts = Object.fromEntries(
    String(signatureHeader)
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((p) => p.length === 2)
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) {
    return { ok: false, reason: "Malformed terra-signature" };
  }

  const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (Number.isFinite(ageSec) && ageSec > 5 * 60) {
    return { ok: false, reason: "Signature timestamp too old" };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "Invalid signature" };
  }
  return { ok: true };
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = {
  terraConfigured,
  createWidgetSession,
  syncMetricsForUser,
  verifyTerraSignature,
  setCors,
};
