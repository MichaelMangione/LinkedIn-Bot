require("../lib/bootstrap");
const readline = require("readline");
const { loadConfig } = require("../lib/config");
const { loadState, saveState, getGroupState } = require("../lib/state");
const { loadGroupsPortfolio } = require("../lib/groups");
const { prepareBrowser, closeBrowser } = require("../lib/chrome");
const {
  visitGroup,
  assessGroupPage,
  ensureLinkedInLoggedIn,
} = require("../lib/linkedin");
const { applyLimits, canRunCycle, canPost } = require("./limits");
const {
  pickGroupForCycle,
  isWithinActiveHours,
  canStartCycleNow,
} = require("./scheduler");
const { runEngagement, runCooldown } = require("./engagement");
const { runPost } = require("./post");

function isTestMode() {
  return process.env.TEST_MODE === "true";
}

function shouldKeepBrowserOpen() {
  if (process.env.KEEP_BROWSER_OPEN === "true") return true;
  if (process.env.KEEP_BROWSER_OPEN === "false") return false;
  return isTestMode();
}

async function waitUntilUserFinishes(browser) {
  console.log(
    "\n[BROWSER] Cycle finished. Close Chrome or press Enter here to exit..."
  );
  await Promise.race([
    new Promise((resolve) => browser.once("disconnected", resolve)),
    new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question("", () => {
        rl.close();
        resolve();
      });
    }),
  ]);
}

function fixedGroupUrl() {
  return (process.env.FIXED_GROUP_URL || process.env.TEST_GROUP_URL || "").trim();
}

function shouldLoadGroupsFromSheet() {
  if (process.env.USE_SHEET_GROUPS === "false") return false;
  if (isTestMode() && fixedGroupUrl()) return false;
  return true;
}

function groupFromFixedUrl(url) {
  const id = url.match(/groups\/(\d+)/)?.[1] || "fixed";
  const name =
    (process.env.FIXED_GROUP_NAME || "").trim() ||
    (isTestMode() ? "Test group" : `Group ${id}`);
  return {
    id,
    name,
    url,
    qualityScore: 3,
    utmSlug: id,
  };
}

async function loadPortfolio() {
  if (!shouldLoadGroupsFromSheet()) {
    const url = fixedGroupUrl();
    if (!url) {
      throw new Error(
        "USE_SHEET_GROUPS=false but no FIXED_GROUP_URL / TEST_GROUP_URL in .env."
      );
    }
    console.log("Fixed group mode: sheet skipped.");
    return [groupFromFixedUrl(url)];
  }

  console.log("Loading groups from Google Sheet + schedule.json...");
  const groups = await loadGroupsPortfolio();
  if (!groups.length) {
    throw new Error(
      "No groups in portfolio. Add group URLs to the sheet (Link column) or schedule.json."
    );
  }
  console.log(`  → ${groups.length} group(s) in rotation.`);
  return groups;
}

function maxGroupAttempts(portfolioSize) {
  const configured = Number(process.env.MAX_GROUP_ATTEMPTS_PER_CYCLE || 5);
  return Math.min(Math.max(1, configured), portfolioSize);
}

async function runCycleOnGroup(page, group, config, state, limits, options = {}) {
  const gs = getGroupState(state, group.id);
  let partial = false;

  if (!options.skipLogin) {
    console.log("  → Step 1: LinkedIn login (bot profile)...");
    const login = await ensureLinkedInLoggedIn(page);
    if (!login.ok && !login.alreadyLoggedIn) {
      console.warn(`  → Skipping group — login failed (${login.reason})`);
      gs.lastSkipReason = login.reason || "login_failed";
      gs.lastVisited = new Date().toISOString();
      return { skipped: true, reason: login.reason || "login_failed", partial: true, gs };
    }
  }

  console.log(`  → Step 2: Open group: ${group.url}`);
  await visitGroup(page, group.url);
  const { prepareGroupPage } = require("../lib/linkedin");
  await prepareGroupPage(page, group.url);
  await sleepBrief();

  let check = await assessGroupPage(page);
  if (!check.accessible && check.reason === "login_required") {
    const { ensureAuthForTarget } = require("../lib/linkedin-login");
    console.log("  → Still on login — running email/password + captcha flow…");
    const auth = await ensureAuthForTarget(page, group.url);
    if (auth.ok) {
      await visitGroup(page, group.url);
      const { prepareGroupPage } = require("../lib/linkedin");
      await prepareGroupPage(page, group.url);
      check = await assessGroupPage(page);
    }
  }
  if (check.accessible) {
    console.log(
      `  → Group ready: feed=${check.hasFeed ? "yes" : "no"} composer=${check.hasComposer ? "yes" : "no"}`
    );
  }
  if (!check.accessible) {
    console.warn(`  → Skipping group — ${check.reason}`);
    gs.lastSkipReason = check.reason;
    gs.lastVisited = new Date().toISOString();
    return { skipped: true, reason: check.reason, partial: true, gs };
  }

  const doEngage =
    config.engagement.enabled &&
    process.env.POST_ONLY !== "true" &&
    process.env.CLICK_POST_BUTTON_ONLY !== "true";

  if (doEngage) {
    console.log("  → Step 3: Engagement (likes + comments)...");
    if (!check.hasFeed) {
      console.warn("  → No feed posts visible — skipping likes/comments.");
    } else {
      const { likes, comments } = await runEngagement(
        page,
        group,
        config,
        state,
        limits
      );
      gs.likesGiven = (gs.likesGiven || 0) + likes;
      gs.commentsLeft = (gs.commentsLeft || 0) + comments;
      console.log(`  → Engagement done: ${likes} likes, ${comments} comments`);
      if (likes === 0 && comments === 0) {
        console.warn("  → No engagement actions completed (selectors/feed).");
        partial = true;
      }
    }

    if (
      process.env.SKIP_COOLDOWN === "true" ||
      process.env.ENGAGE_ONLY === "true"
    ) {
      console.log("  → Cooldown skipped (ENGAGE_ONLY or SKIP_COOLDOWN).");
    } else {
      await runCooldown(config);
    }
  }

  const doPost =
    process.env.ENGAGE_ONLY !== "true" && canPost(limits, state);

  if (doPost) {
    console.log("  → Step 4: Publishing post...");
    const postResult = await runPost(page, group, config, limits, state);
    if (!postResult?.ok) {
      partial = true;
      console.warn("  → Post step did not complete (selector/UI). Skipping.");
    }
  } else if (process.env.ENGAGE_ONLY !== "true") {
    console.log("  → Daily post cap reached, skipping publish.");
    partial = true;
  }

  gs.lastVisited = new Date().toISOString();
  return { skipped: false, partial, gs };
}

function sleepBrief() {
  return new Promise((r) => setTimeout(r, 500));
}

async function runOneCycle() {
  const config = loadConfig();
  const state = loadState();
  const limits = applyLimits(config);

  if (!isTestMode()) {
    if (!isWithinActiveHours(config)) {
      console.log(
        `Outside active hours (${config.scheduling.activeHoursStart}:00–${config.scheduling.activeHoursEnd}:00). Skipping cycle.`
      );
      return { skipped: true, reason: "outside_hours" };
    }
    if (!canStartCycleNow(config, state)) {
      if (state.daily.cycles >= config.scheduling.cyclesPerDay) {
        console.log(
          `Daily cycle cap reached (${state.daily.cycles}/${config.scheduling.cyclesPerDay}).`
        );
        console.log("  → To run again today: npm run reset-today");
      } else if (
        state.daily.posts >= limits.maxDailyPosts &&
        !config.engagement.enabled
      ) {
        console.log(
          `Daily post cap reached (${state.daily.posts}/${limits.maxDailyPosts}).`
        );
        console.log("  → To run again today: npm run reset-today");
      }
      return { skipped: true, reason: "cycle_cap" };
    }
    if (!canRunCycle(config, state)) {
      console.log(
        "Daily limits reached — no post or engagement actions left today."
      );
      return { skipped: true, reason: "daily_limits" };
    }
  }

  const portfolio = await loadPortfolio();
  const tried = new Set();
  const maxAttempts = maxGroupAttempts(portfolio.length);
  let lastGroup = null;
  let partial = false;
  let cycleWorked = false;

  const browser = await prepareBrowser();
  const page = await browser.newPage();
  page.__browser = browser;
  browser.__lastPage = page;
  const { applyStealthToPage } = require("../lib/browser-stealth");
  await applyStealthToPage(page);
  const keepBrowserOpen = shouldKeepBrowserOpen();

  try {
    console.log("\n  → Step 1: LinkedIn login (once per cycle)...");
    const cycleLogin = await ensureLinkedInLoggedIn(page);
    if (!cycleLogin.ok && !cycleLogin.alreadyLoggedIn) {
      partial = true;
      console.warn(
        `  → Cycle aborted — login failed (${cycleLogin.reason}). Set LINKEDIN_VERIFICATION_CODE on Railway or log in locally once.`
      );
    } else {
      page.__cycleLoginOk = true;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const group = pickGroupForCycle(portfolio, state, tried);
        if (!group) {
          console.log("No more groups to try this cycle.");
          break;
        }
        tried.add(group.id);
        lastGroup = group;

        console.log(`\n══ Cycle ${state.daily.cycles + 1}/${config.scheduling.cyclesPerDay} ══`);
        if (maxAttempts > 1) {
          console.log(`Attempt ${attempt + 1}/${maxAttempts} in this cycle`);
        }
        console.log(`Group: ${group.name} (${group.id})`);
        console.log(
          `Quality: ${group.qualityScore ?? 3} | UTM: ${group.utmSlug || group.id} | Limits: ${limits.multiplier * 100}%`
        );
        console.log(
          `Today so far: ${state.daily.likes} likes, ${state.daily.comments} comments, ${state.daily.posts} posts`
        );

        const result = await runCycleOnGroup(page, group, config, state, limits, {
          skipLogin: true,
        });
        state.engagedItems[group.id] = result.gs;

        if (result.skipped) {
          partial = true;
          if (attempt + 1 < maxAttempts) {
            console.log("  → Trying next group in rotation...");
          }
          continue;
        }

        cycleWorked = true;
        partial = result.partial;
        break;
      }
    }

    if (!cycleWorked && lastGroup) {
      console.warn(
        `  → Cycle finished without a usable group (${tried.size} tried).`
      );
      partial = true;
    }
  } catch (err) {
    partial = true;
    console.error("Cycle error:", err.message);
  } finally {
    state.daily.cycles += 1;
    state.cycleLog.push({
      at: new Date().toISOString(),
      groupId: lastGroup?.id || null,
      groupName: lastGroup?.name || null,
      partial,
      groupsTried: [...tried],
    });
    saveState(state);
    if (!keepBrowserOpen) {
      await closeBrowser(browser);
    }
  }

  console.log(
    `Cycle done. Today: ${state.daily.likes} likes, ${state.daily.comments} comments, ${state.daily.posts} posts`
  );

  if (keepBrowserOpen) {
    await waitUntilUserFinishes(browser);
    await closeBrowser(browser);
  }

  return {
    skipped: !cycleWorked && !lastGroup,
    partial,
    group: lastGroup,
  };
}

async function main() {
  await runOneCycle();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
}

module.exports = { runOneCycle, isTestMode };
