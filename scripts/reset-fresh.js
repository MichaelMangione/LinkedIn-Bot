#!/usr/bin/env node
/**
 * Fresh start: reset today's counters and optional visit history.
 * Keeps post rotation index and verification queue unless CLEAR_ALL_STATE=true.
 */
require("dotenv").config();
const {
  loadState,
  saveState,
  loadVerifications,
  saveVerifications,
  todayLocal,
} = require("../lib/state");

const state = loadState();
const clearAll = process.env.CLEAR_ALL_STATE === "true";

state.date = todayLocal();
state.daily = { likes: 0, comments: 0, posts: 0, cycles: 0 };
state.cycleLog = [];

if (clearAll) {
  state.engagedItems = {};
  state.postRotationIndex = 0;
  saveVerifications({ queue: [] });
  console.log("Cleared engagedItems, post rotation, and verification queue.");
} else {
  console.log("Kept engagedItems (lastVisited / quality scores) for rotation.");
}

saveState(state);
console.log("Fresh daily state for:", todayLocal());
console.log("Daily:", state.daily);
console.log("\nRun: npm start  or  npm run daemon");
