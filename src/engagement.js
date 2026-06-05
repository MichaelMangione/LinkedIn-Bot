const {
  getLinkedInPage,
  likePostsInFeed,
  commentOnPostsInFeed,
  sleep,
} = require("../lib/linkedin");
const { applyLimits, canLike, canComment } = require("./limits");
const { getCooldownMs } = require("./scheduler");

async function runEngagement(page, group, config, state, limits) {
  if (!config.engagement.enabled || process.env.POST_ONLY === "true") {
    return { likes: 0, comments: 0 };
  }

  const liPage = getLinkedInPage(page);

  let likes = 0;
  let comments = 0;

  const targetLikes = Math.min(
    config.engagement.likesPerGroup,
    limits.maxDailyLikes - state.daily.likes
  );
  const targetComments = Math.min(
    config.engagement.commentsPerGroup,
    limits.maxDailyComments - state.daily.comments
  );

  if (canLike(limits, state) && targetLikes > 0) {
    likes = await likePostsInFeed(liPage, targetLikes, {
      min: config.engagement.likeDelayMinMs,
      max: config.engagement.likeDelayMaxMs,
    });
    state.daily.likes += likes;
  }

  if (canComment(limits, state) && targetComments > 0) {
    comments = await commentOnPostsInFeed(liPage, targetComments, {
      min: config.engagement.commentDelayMinMs,
      max: config.engagement.commentDelayMaxMs,
    });
    state.daily.comments += comments;
  }

  return { likes, comments };
}

async function runCooldown(config) {
  const ms = getCooldownMs(config);
  console.log(`  → Cooldown ${Math.round(ms / 60000)} min...`);
  await sleep(ms);
}

module.exports = { runEngagement, runCooldown };
