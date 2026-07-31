const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Linear pace model: expected metric between start and target by today.
 * Positive daysDelta = ahead of schedule; negative = behind.
 */
export function computePace({
  startDate,
  endDate,
  startValue,
  targetValue,
  currentValue,
  asOf = new Date(),
}) {
  const start = toDate(startDate);
  const end = toDate(endDate);
  const now = toDate(asOf);

  if (!start || !end || now < start) {
    return {
      status: "not_started",
      label: "Planen har ikke startet ennå",
      daysDelta: 0,
      expectedValue: startValue,
      progressPct: 0,
    };
  }

  const totalDays = Math.max((end - start) / DAY_MS, 1);
  const elapsedDays = Math.min(Math.max((now - start) / DAY_MS, 0), totalDays);
  const remainingDays = Math.max(totalDays - elapsedDays, 0);

  const totalChange = targetValue - startValue;
  const expectedValue = startValue + totalChange * (elapsedDays / totalDays);
  const actualChange = currentValue - startValue;
  const expectedChange = expectedValue - startValue;

  const dailyRate = totalChange / totalDays;
  let daysDelta = 0;
  if (Math.abs(dailyRate) > 1e-9) {
    daysDelta = (actualChange - expectedChange) / dailyRate;
  }

  // For goals where lower is better (e.g. weight loss), invert sense of ahead/behind
  const lowerIsBetter = targetValue < startValue;
  if (lowerIsBetter) {
    daysDelta = -daysDelta;
  }

  const progressPct = Math.max(
    0,
    Math.min(100, (actualChange / (totalChange || 1)) * 100)
  );

  let status = "on_track";
  let label = "Du er omtrent i rute";

  if (daysDelta >= 2) {
    status = "ahead";
    label = `Du er ca. ${Math.round(daysDelta)} dager foran planen`;
  } else if (daysDelta <= -2) {
    status = "behind";
    label = `Du er ca. ${Math.abs(Math.round(daysDelta))} dager bak planen`;
  } else if (now > end) {
    const done =
      (lowerIsBetter && currentValue <= targetValue) ||
      (!lowerIsBetter && currentValue >= targetValue);
    status = done ? "completed" : "missed";
    label = done ? "Målet er nådd" : "Fristen er passert uten at målet er nådd";
  }

  return {
    status,
    label,
    daysDelta: Math.round(daysDelta * 10) / 10,
    expectedValue: Math.round(expectedValue * 10) / 10,
    currentValue,
    targetValue,
    progressPct: Math.round(progressPct),
    remainingDays: Math.ceil(remainingDays),
    totalDays: Math.ceil(totalDays),
  };
}
