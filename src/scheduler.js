const { loadConfig } = require("../lib/config");

function jitterMs(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function jitterPct(base, pct) {
  const delta = base * (pct / 100);
  return base + (Math.random() * 2 - 1) * delta;
}

function isWithinActiveHours(config, now = new Date()) {
  const hour = now.getHours();
  const { activeHoursStart, activeHoursEnd } = config.scheduling;
  return hour >= activeHoursStart && hour < activeHoursEnd;
}

function msUntilActiveStart(config, now = new Date()) {
  const next = new Date(now);
  next.setHours(config.scheduling.activeHoursStart, 0, 0, 0);
  if (now.getHours() >= config.scheduling.activeHoursStart) {
    next.setDate(next.getDate() + 1);
  }
  return next - now;
}

function canStartCycleNow(config, state, now = new Date()) {
  if (!config.scheduling.enabled) return false;
  if (!isWithinActiveHours(config, now)) return false;
  if (state.daily.cycles >= config.scheduling.cyclesPerDay) return false;
  return true;
}

function pickGroupForCycle(groups, state, excludeIds = null) {
  const floor =
    loadConfig().verification?.qualityScoreFloor ?? 0;
  const skip = excludeIds instanceof Set ? excludeIds : new Set();
  const active = groups.filter(
    (g) => (g.qualityScore ?? 3) > floor && !skip.has(g.id)
  );
  if (!active.length) return null;

  active.sort((a, b) => {
    const lvA = state.engagedItems[a.id]?.lastVisited || "1970-01-01";
    const lvB = state.engagedItems[b.id]?.lastVisited || "1970-01-01";
    if (lvA !== lvB) return Date.parse(lvA) - Date.parse(lvB);
    return (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
  });

  return active[0];
}

function getCycleDelayMs(config) {
  const { interCycleDelayMinMs, interCycleDelayMaxMs } = config.scheduling;
  return jitterMs(interCycleDelayMinMs, interCycleDelayMaxMs);
}

function getCooldownMs(config) {
  const { cooldownMs, cooldownJitterPct } = config.engagement;
  return Math.round(jitterPct(cooldownMs, cooldownJitterPct));
}

function plannedCycleHours(config) {
  const { cyclesPerDay, activeHoursStart, activeHoursEnd } = config.scheduling;
  if (cyclesPerDay <= 1) return [activeHoursStart];

  const span = activeHoursEnd - activeHoursStart;
  const step = span / (cyclesPerDay - 1);
  return Array.from({ length: cyclesPerDay }, (_, i) =>
    Math.round(activeHoursStart + step * i)
  );
}

module.exports = {
  jitterMs,
  isWithinActiveHours,
  msUntilActiveStart,
  canStartCycleNow,
  pickGroupForCycle,
  getCycleDelayMs,
  getCooldownMs,
  plannedCycleHours,
};
