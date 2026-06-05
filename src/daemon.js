require("../lib/bootstrap");
const { botProfileReady, CHROME_BOT_DATA_DIR } = require("../lib/chrome");
const { spawn } = require("child_process");
const path = require("path");
const { loadConfig } = require("../lib/config");
const { loadState } = require("../lib/state");
const { runOneCycle } = require("./index");
const {
  isWithinActiveHours,
  msUntilActiveStart,
  getCycleDelayMs,
  plannedCycleHours,
} = require("./scheduler");

const ROOT = path.join(__dirname, "..");

function isTestMode() {
  return process.env.TEST_MODE === "true";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runNode(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [script], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
}

async function daemonLoop() {
  const config = loadConfig();
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log("LinkedIn Bot v1.1.0 — scheduler running (no API, fully automatic)");
  const profileDir = CHROME_BOT_DATA_DIR;
  const hasProfile = botProfileReady();
  const onRailwayVolume = profileDir.startsWith("/app/data");
  console.log(`Bot Chrome profile: ${profileDir}`);
  console.log(
    hasProfile
      ? "  → Profile has saved data — restarts should reuse session (no new OTP) if volume persists."
      : "  → Profile empty — first login will need OTP; mount /app/data volume on Railway."
  );
  if (
    (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production") &&
    !onRailwayVolume
  ) {
    console.warn(
      "  ⚠ CHROME_BOT_DATA_DIR is not on /app/data — each redeploy may wipe login and trigger new OTP emails."
    );
  }
  console.log("");
  if (isTestMode()) {
    console.log("  ⚠ TEST_MODE=true — fast schedule (short delays, 24h active window)");
  }
  console.log(
    `Cycles/day: ${config.scheduling.cyclesPerDay} | Active hours: ${config.scheduling.activeHoursStart}:00–${config.scheduling.activeHoursEnd}:00 (${tz})`
  );
  console.log(`Planned cycle hours: ${plannedCycleHours(config).join(", ")}`);
  const delayMin = config.scheduling.interCycleDelayMinMs;
  const delayMax = config.scheduling.interCycleDelayMaxMs;
  console.log(
    `Delay between cycles: ~${Math.round(delayMin / 60000)}–${Math.round(delayMax / 60000)} min\n`
  );

  let lastVerify = 0;
  const VERIFY_INTERVAL_MS = isTestMode() ? 5 * 60 * 1000 : 30 * 60 * 1000;

  while (true) {
    const state = loadState();

    if (!isTestMode() && !isWithinActiveHours(config)) {
      const wait = msUntilActiveStart(config);
      console.log(
        `Outside active hours. Sleeping until ${config.scheduling.activeHoursStart}:00 (${Math.round(wait / 3600000)}h)...`
      );
      await sleep(Math.min(wait, 60 * 60 * 1000));
      continue;
    }

    if (Date.now() - lastVerify >= VERIFY_INTERVAL_MS) {
      console.log("\n--- Verification pass ---");
      await runNode("src/verify.js");
      lastVerify = Date.now();
    }

    if (state.daily.cycles >= config.scheduling.cyclesPerDay) {
      console.log(
        `Daily cycles complete (${state.daily.cycles}/${config.scheduling.cyclesPerDay}). Waiting for tomorrow...`
      );
      await sleep(15 * 60 * 1000);
      continue;
    }

    console.log(`\n--- Starting cycle ${state.daily.cycles + 1} ---`);
    try {
      await runOneCycle();
    } catch (err) {
      console.warn(`Cycle error: ${err.message}`);
    }

    const after = loadState();

    if (config.scheduling.cyclesPerDay > 1) {
      const delay = getCycleDelayMs(config);
      console.log(
        `Next cycle in ~${Math.round(delay / 60000)} min (${after.daily.cycles}/${config.scheduling.cyclesPerDay} done today)`
      );
      await sleep(delay);
    } else {
      await sleep(60 * 60 * 1000);
    }
  }
}

daemonLoop().catch((err) => {
  console.error("Daemon fatal:", err);
  process.exit(1);
});
