#!/usr/bin/env node
/**
 * Reset today's daily counters (cycles, likes, comments, posts) so you can run again.
 * Keeps group history, post rotation index, and verification queue.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { STATE_PATH, loadState, saveState, todayLocal } = require("../lib/state");

const state = loadState();
const before = { ...state.daily };

state.date = todayLocal();
state.daily = { likes: 0, comments: 0, posts: 0, cycles: 0 };
saveState(state);

console.log("Daily counters reset for today:", todayLocal());
console.log("Before:", before);
console.log("After:", state.daily);
console.log("\nRun: npm start  or  npm run daemon");
