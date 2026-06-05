const fs = require("fs");
const path = require("path");
const { ROOT } = require("./config");

const DATA_DIR = process.env.DATA_DIR || ROOT;
const STATE_PATH = path.join(DATA_DIR, ".engagement-state.json");
const VERIFICATIONS_PATH = path.join(DATA_DIR, ".verifications.json");

function todayLocal() {
  return new Date().toLocaleDateString("en-CA");
}

function emptyState() {
  return {
    date: todayLocal(),
    daily: { likes: 0, comments: 0, posts: 0, cycles: 0 },
    postRotationIndex: 0,
    engagedItems: {},
    cycleLog: [],
  };
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return emptyState();
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  if (state.date !== todayLocal()) {
    return {
      ...emptyState(),
      engagedItems: state.engagedItems || {},
      postRotationIndex: state.postRotationIndex ?? 0,
    };
  }
  if (state.postRotationIndex == null) {
    state.postRotationIndex = 0;
  }
  return state;
}

function saveState(state) {
  state.date = todayLocal();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function getGroupState(state, groupId) {
  if (!state.engagedItems[groupId]) {
    state.engagedItems[groupId] = {
      lastVisited: null,
      qualityScore: 3,
      postsPublished: 0,
      postsRemoved: 0,
      likesGiven: 0,
      commentsLeft: 0,
    };
  }
  return state.engagedItems[groupId];
}

function loadVerifications() {
  if (!fs.existsSync(VERIFICATIONS_PATH)) {
    return { queue: [] };
  }
  return JSON.parse(fs.readFileSync(VERIFICATIONS_PATH, "utf8"));
}

function saveVerifications(data) {
  fs.writeFileSync(VERIFICATIONS_PATH, JSON.stringify(data, null, 2));
}

function enqueueVerification(entry) {
  const data = loadVerifications();
  data.queue.push(entry);
  saveVerifications(data);
}

module.exports = {
  STATE_PATH,
  VERIFICATIONS_PATH,
  loadState,
  saveState,
  getGroupState,
  loadVerifications,
  saveVerifications,
  enqueueVerification,
  todayLocal,
};
