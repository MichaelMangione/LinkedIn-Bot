const puppeteer = require("puppeteer-core");
const { wireStealthBrowser, stealthChromeArgs } = require("./browser-stealth");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CHROME_PATH =
  process.env.CHROME_PATH || "/opt/google/chrome/google-chrome";
const BOT_PROFILE = process.env.CHROME_BOT_PROFILE || "Default";
const CHROME_BOT_DATA_DIR =
  process.env.CHROME_BOT_DATA_DIR ||
  path.join(os.homedir(), ".config", "linkedin-bot-chrome");
const QUIT_BOT_SCRIPT = path.join(__dirname, "..", "scripts", "quit-bot-chrome.sh");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function assertBotProfileOnly() {
  if (process.env.USE_MAIN_PROFILE === "true") {
    throw new Error(
      "USE_MAIN_PROFILE is not supported. Bot uses linkedin-bot-chrome only (see CHROME_BOT_DATA_DIR)."
    );
  }
  if (process.env.CHROME_SYNC_PROFILE === "true") {
    throw new Error(
      "CHROME_SYNC_PROFILE is disabled — bot profile only."
    );
  }
}

function pidFromChromeLock(lockPath) {
  try {
    const target = fs.readlinkSync(lockPath);
    const pid = Number(target.split("-").pop());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isBotChromeRunning() {
  const lock = path.join(CHROME_BOT_DATA_DIR, "SingletonLock");
  try {
    fs.lstatSync(lock);
    const pid = pidFromChromeLock(lock);
    if (pid) return isProcessRunning(pid);
    return true;
  } catch {
    return false;
  }
}

function botProfilePath() {
  return path.join(CHROME_BOT_DATA_DIR, BOT_PROFILE);
}

function botProfileReady() {
  return fs.existsSync(path.join(botProfilePath(), "Preferences"));
}

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [scriptPath], {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

async function closeBrowser(browser) {
  if (!browser) return;
  await browser.close();
}

async function prepareBotBrowser() {
  assertBotProfileOnly();

  if (isBotChromeRunning()) {
    console.log("Closing previous bot Chrome (dummy profile)...");
    await runScript(QUIT_BOT_SCRIPT);
    await sleep(2000);
  }

  const headless = process.env.CHROME_HEADLESS === "true";
  const humanClicks = process.env.CHROME_HUMAN_CLICKS !== "false";
  console.log(
    `Launching bot Chrome${headless ? " (headless)" : " (visible window)"} — LinkedIn only\n  ${CHROME_BOT_DATA_DIR} / ${BOT_PROFILE}`
  );
  if (!headless) {
    console.log("  → Visible Chrome — best for login; set CHROME_HEADLESS=true for server.");
  }
  if (humanClicks) {
    console.log("  → Human mouse clicks enabled (real pointer moves, not DOM .click()).");
  }

  const chromeArgs = [
    `--profile-directory=${BOT_PROFILE}`,
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
    ...stealthChromeArgs(),
  ];
  if (headless) {
    chromeArgs.push("--disable-gpu");
  } else {
    chromeArgs.push("--start-maximized");
  }

  const launchOptions = {
    executablePath: CHROME_PATH,
    headless: headless ? "new" : false,
    defaultViewport: null,
    timeout: 60_000,
    protocolTimeout: 60_000,
    userDataDir: CHROME_BOT_DATA_DIR,
    args: chromeArgs,
  };

  try {
    const browser = await puppeteer.launch(launchOptions);
    wireStealthBrowser(browser);
    if (process.env.CHROME_STEALTH !== "false") {
      console.log("  → Stealth UA enabled (reduces HeadlessChrome fingerprint).");
    }
    return browser;
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/browser is already running/i.test(msg)) {
      throw err;
    }
    console.warn("Bot Chrome locked; closing and retrying once...");
    await runScript(QUIT_BOT_SCRIPT);
    await sleep(2000);
    const browser = await puppeteer.launch(launchOptions);
    wireStealthBrowser(browser);
    return browser;
  }
}

async function prepareBrowser() {
  return prepareBotBrowser();
}

module.exports = {
  prepareBrowser,
  closeBrowser,
  botProfileReady,
  BOT_PROFILE,
  CHROME_BOT_DATA_DIR,
};
