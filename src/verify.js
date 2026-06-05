require("../lib/bootstrap");
const { loadConfig } = require("../lib/config");
const { loadState, saveState, loadVerifications, saveVerifications } = require("../lib/state");
const { prepareBrowser } = require("../lib/chrome");

async function checkPostVisible(page, postUrl) {
  try {
    const res = await page.goto(postUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (res && res.status() === 404) return false;
    const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
    if (/not available|was removed|no longer/i.test(body)) return false;
    return true;
  } catch {
    return false;
  }
}

async function runVerifications() {
  const config = loadConfig();
  if (!config.verification.enabled) {
    console.log("Verification disabled.");
    return;
  }

  const data = loadVerifications();
  const now = Date.now();
  const due = data.queue.filter((e) => Date.parse(e.checkAt) <= now);
  if (!due.length) {
    console.log("No verifications due.");
    return;
  }

  console.log(`Processing ${due.length} verification(s)...`);
  const state = loadState();
  const browser = await prepareBrowser();
  const page = await browser.newPage();

  const remaining = [];

  for (const entry of data.queue) {
    if (Date.parse(entry.checkAt) > now) {
      remaining.push(entry);
      continue;
    }

    const visible = await checkPostVisible(page, entry.postUrl);
    const gs = state.engagedItems[entry.groupId] || {
      qualityScore: 3,
      postsRemoved: 0,
      postsPublished: 0,
    };

    if (visible) {
      console.log(`  ✓ Post still visible (group ${entry.groupId})`);
      gs.qualityScore = Math.min(5, (gs.qualityScore ?? 3) + 1);
    } else {
      console.log(`  ✗ Post removed/hidden (group ${entry.groupId})`);
      gs.postsRemoved = (gs.postsRemoved ?? 0) + 1;
      gs.qualityScore = (gs.qualityScore ?? 3) - 1;
      if (
        config.verification.removeLowQualityGroups &&
        gs.qualityScore <= config.verification.qualityScoreFloor
      ) {
        console.log(`  → Group ${entry.groupId} removed from rotation`);
      }
    }

    state.engagedItems[entry.groupId] = gs;
  }

  saveVerifications({ queue: remaining });
  saveState(state);
  await browser.close();
  console.log("Verification run complete.");
}

if (require.main === module) {
  runVerifications().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runVerifications };
