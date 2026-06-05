const { loadConfig } = require("../lib/config");

function applyLimits(config) {
  const m = config.limits.accountAgeMultiplier ?? 1;
  return {
    maxDailyLikes: Math.floor(config.limits.maxDailyLikes * m),
    maxDailyComments: Math.floor(config.limits.maxDailyComments * m),
    maxDailyPosts: Math.floor(config.limits.maxDailyPosts * m),
    maxGroupsPerCycle: config.limits.maxGroupsPerCycle,
    multiplier: m,
  };
}

function canLike(limits, state) {
  return state.daily.likes < limits.maxDailyLikes;
}

function canComment(limits, state) {
  return state.daily.comments < limits.maxDailyComments;
}

function canPost(limits, state) {
  return state.daily.posts < limits.maxDailyPosts;
}

function canRunCycle(config, state) {
  const limits = applyLimits(config);
  if (state.daily.cycles >= config.scheduling.cyclesPerDay) return false;
  if (!canPost(limits, state) && !config.engagement.enabled) return false;
  return true;
}

module.exports = {
  applyLimits,
  canLike,
  canComment,
  canPost,
  canRunCycle,
};
