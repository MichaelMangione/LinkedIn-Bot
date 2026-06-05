const fs = require("fs");
const path = require("path");
const {
  publishPost,
  applyUtm,
  visitGroup,
  getLinkedInPage,
} = require("../lib/linkedin");
const { ROOT } = require("../lib/config");
const { enqueueVerification } = require("../lib/state");

const POSTS_PATH = path.join(ROOT, "posts.json");

function loadPosts() {
  if (!fs.existsSync(POSTS_PATH)) {
    return [
      {
        id: "default",
        text: "Sharing an update with the group. {{utm}}",
      },
    ];
  }
  const data = JSON.parse(fs.readFileSync(POSTS_PATH, "utf8"));
  return data.posts || data;
}

function pickPost(group, posts, state) {
  if (group.postContent) return { text: group.postContent, id: "sheet" };

  if (!posts.length) {
    return { text: "", id: null };
  }

  const rotate =
    process.env.POST_ROTATION !== "random" &&
    process.env.POST_ROTATION !== "false";
  let idx;
  if (rotate && state) {
    idx = Number(state.postRotationIndex || 0) % posts.length;
    state.postRotationIndex = (idx + 1) % posts.length;
  } else {
    idx = Math.floor(Math.random() * posts.length);
  }

  const post = posts[idx];
  const text = post?.text || post || "";
  const id = post?.id || `post-${idx + 1}`;
  return { text, id, index: idx + 1, total: posts.length };
}

async function runPost(page, group, config, limits, state) {
  if (process.env.ENGAGE_ONLY === "true") return null;
  if (state.daily.posts >= limits.maxDailyPosts) {
    console.log("  → Daily post cap reached, skipping post.");
    return null;
  }

  const posts = loadPosts();
  const picked = pickPost(group, posts, state);
  let text = picked.text;
  text = applyUtm(text, group.utmSlug, config.attribution.defaultUtm);

  if (picked.id && picked.id !== "sheet") {
    console.log(
      `  → Post copy: ${picked.id} (${picked.index || "?"}/${picked.total || posts.length})`
    );
  }

  const liPage = getLinkedInPage(page);
  let onGroup = false;
  try {
    const current = await liPage.url();
    onGroup =
      current.includes(String(group.id)) || current.includes("/groups/");
  } catch {
    onGroup = false;
  }

  if (!onGroup) {
    await visitGroup(page, group.url);
  }

  const result = await publishPost(getLinkedInPage(page), text, group.url);

  if (result.ok) {
    state.daily.posts += 1;

    if (config.verification.enabled && result.postUrl && result.postUrl !== "dry-run") {
      const checkAt = new Date(
        Date.now() + config.verification.checkAfterHours * 3600_000
      ).toISOString();
      enqueueVerification({
        groupId: group.id,
        postUrl: result.postUrl,
        publishedAt: new Date().toISOString(),
        checkAt,
      });
      console.log(`  → Verification queued for ${checkAt}`);
    }
  }

  return result;
}

module.exports = { loadPosts, pickPost, runPost };
