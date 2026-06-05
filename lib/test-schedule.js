/** Fast schedule for local/Railway testing — applied when TEST_MODE or RAILWAY_TEST_SCHEDULE is on. */
const FIVE_MIN_MS = 5 * 60 * 1000;

function applyTestSchedule(env = process.env) {
  env.TEST_MODE = "true";
  env.INTER_CYCLE_DELAY_MIN_MS = String(FIVE_MIN_MS);
  env.INTER_CYCLE_DELAY_MAX_MS = String(FIVE_MIN_MS);
  env.ACTIVE_HOURS_START = "0";
  env.ACTIVE_HOURS_END = "24";
  env.SKIP_COOLDOWN = "true";
  env.COOLDOWN_MS = "60000";
}

module.exports = { applyTestSchedule, FIVE_MIN_MS };
