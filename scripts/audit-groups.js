#!/usr/bin/env node
require("dotenv").config();
const { loadGroupsPortfolio } = require("../lib/groups");
const { loadState } = require("../lib/state");

(async () => {
  const state = loadState();
  const groups = await loadGroupsPortfolio();

  console.log(`\nGroup portfolio (${groups.length} groups)\n`);
  console.log(
    "ID".padEnd(12) +
      "Score".padEnd(7) +
      "Published".padEnd(12) +
      "Removed".padEnd(10) +
      "Last visit".padEnd(22) +
      "Name"
  );
  console.log("-".repeat(90));

  for (const g of groups.sort(
    (a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
  )) {
    const s = state.engagedItems[g.id] || {};
    console.log(
      String(g.id).padEnd(12) +
        String(g.qualityScore ?? 3).padEnd(7) +
        String(s.postsPublished ?? 0).padEnd(12) +
        String(s.postsRemoved ?? 0).padEnd(10) +
        String(s.lastVisited || "never").slice(0, 20).padEnd(22) +
        g.name.slice(0, 40)
    );
  }

  console.log(
    `\nToday: ${state.daily.likes} likes, ${state.daily.comments} comments, ${state.daily.posts} posts, ${state.daily.cycles} cycles\n`
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
