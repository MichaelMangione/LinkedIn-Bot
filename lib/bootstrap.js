/**
 * Load optional .env, then apply hardcoded production config.
 * TEST_MODE / RAILWAY_TEST_SCHEDULE re-applies a 5-minute fast schedule after hardcoded.
 */
require("dotenv").config();

const headlessFromEnv = process.env.CHROME_HEADLESS;

const wantFastSchedule =
  process.env.TEST_MODE === "true" ||
  process.env.RAILWAY_TEST_SCHEDULE === "true";

const HARDCODED = require("./hardcoded-config");

const RAILWAY_OVERRIDES = new Set([
  "LINKEDIN_VERIFICATION_CODE",
  "TWOCAPTCHA_API_KEY",
]);

for (const [key, value] of Object.entries(HARDCODED)) {
  if (value === undefined || value === null) continue;
  const str = String(value);
  // Keep Railway/dashboard secrets when hardcoded placeholder is empty
  if (str === "" && RAILWAY_OVERRIDES.has(key) && process.env[key]) continue;
  process.env[key] = str;
}

const fastFromHardcoded = HARDCODED.RAILWAY_TEST_SCHEDULE === "true";
if (wantFastSchedule || fastFromHardcoded) {
  const { applyTestSchedule } = require("./test-schedule");
  applyTestSchedule(process.env);
}

if (headlessFromEnv === "true" || headlessFromEnv === "false") {
  process.env.CHROME_HEADLESS = headlessFromEnv;
}

module.exports = { HARDCODED };
