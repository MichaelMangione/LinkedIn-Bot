const { loadTasksFromSheet } = require("./sheets");
const { loadConfig } = require("./config");
const { loadState } = require("./state");

function extractGroupId(url) {
  const m = String(url).match(/groups\/(\d+)/);
  return m ? m[1] : null;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function taskToGroup(task, state) {
  const id = extractGroupId(task.groupUrl);
  if (!id) return null;

  const saved = state.engagedItems[id] || {};
  const fromSchedule = loadConfig().groups.find((g) => g.id === id);

  return {
    id,
    name: task.groupName || fromSchedule?.name || `Group ${id}`,
    url: task.groupUrl,
    qualityScore:
      fromSchedule?.qualityScore ?? saved.qualityScore ?? 3,
    utmSlug:
      fromSchedule?.utmSlug ||
      slugify(task.groupName) ||
      id,
    postContent: task.postContent || "",
  };
}

async function loadGroupsPortfolio() {
  const state = loadState();
  const config = loadConfig();
  const tasks = await loadTasksFromSheet();

  const fromSheet = tasks
    .map((t) => taskToGroup(t, state))
    .filter(Boolean);

  const byId = new Map();
  for (const g of config.groups) byId.set(g.id, { ...g });
  for (const g of fromSheet) {
    byId.set(g.id, { ...byId.get(g.id), ...g });
  }

  return [...byId.values()].filter((g) => g.url && g.id);
}

module.exports = {
  extractGroupId,
  slugify,
  loadGroupsPortfolio,
  taskToGroup,
};
