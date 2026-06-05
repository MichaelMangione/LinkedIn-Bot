const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCHEDULE_PATH = path.join(ROOT, "schedule.json");

function envNum(key, fallback) {
  const v = process.env[key];
  return v !== undefined && v !== "" ? Number(v) : fallback;
}

function envBool(key, fallback = false) {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1";
}

function loadScheduleFile() {
  if (!fs.existsSync(SCHEDULE_PATH)) return {};
  return JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf8"));
}

function loadConfig() {
  const file = loadScheduleFile();

  return {
    scheduling: {
      cyclesPerDay: envNum("CYCLES_PER_DAY", file.scheduling?.cyclesPerDay ?? 5),
      activeHoursStart: envNum(
        "ACTIVE_HOURS_START",
        file.scheduling?.activeHoursStart ?? 8
      ),
      activeHoursEnd: envNum(
        "ACTIVE_HOURS_END",
        file.scheduling?.activeHoursEnd ?? 20
      ),
      interCycleDelayMinMs: envNum(
        "INTER_CYCLE_DELAY_MIN_MS",
        file.scheduling?.interCycleDelayMinMs ?? 7_200_000
      ),
      interCycleDelayMaxMs: envNum(
        "INTER_CYCLE_DELAY_MAX_MS",
        file.scheduling?.interCycleDelayMaxMs ?? 10_800_000
      ),
      enabled: file.scheduling?.enabled !== false,
    },
    engagement: {
      enabled: envBool("ENGAGEMENT_ENABLED", file.engagement?.enabled !== false),
      likesPerGroup: envNum("LIKES_PER_GROUP", file.engagement?.likesPerGroup ?? 3),
      commentsPerGroup: envNum(
        "COMMENTS_PER_GROUP",
        file.engagement?.commentsPerGroup ?? 2
      ),
      cooldownMs: envNum("COOLDOWN_MS", file.engagement?.cooldownMs ?? 1_200_000),
      cooldownJitterPct: envNum(
        "COOLDOWN_JITTER_PCT",
        file.engagement?.cooldownJitterPct ?? 10
      ),
      likeDelayMinMs: envNum("LIKE_DELAY_MIN_MS", 10_000),
      likeDelayMaxMs: envNum("LIKE_DELAY_MAX_MS", 30_000),
      commentDelayMinMs: envNum("COMMENT_DELAY_MIN_MS", 60_000),
      commentDelayMaxMs: envNum("COMMENT_DELAY_MAX_MS", 180_000),
    },
    limits: {
      maxDailyLikes: envNum("MAX_DAILY_LIKES", file.limits?.maxDailyLikes ?? 30),
      maxDailyComments: envNum(
        "MAX_DAILY_COMMENTS",
        file.limits?.maxDailyComments ?? 15
      ),
      maxDailyPosts: envNum("MAX_DAILY_POSTS", file.limits?.maxDailyPosts ?? 5),
      maxGroupsPerCycle: envNum("MAX_GROUPS_PER_CYCLE", 1),
      accountAgeMultiplier: envNum(
        "ACCOUNT_AGE_MULTIPLIER",
        file.limits?.accountAgeMultiplier ?? 1
      ),
    },
    verification: {
      enabled: envBool(
        "VERIFY_POSTS_ENABLED",
        file.verification?.enabled !== false
      ),
      checkAfterHours: envNum(
        "VERIFY_POSTS_AFTER_HOURS",
        file.verification?.checkAfterHours ?? 24
      ),
      removeLowQualityGroups: envBool(
        "AUTO_REMOVE_LOW_QUALITY_GROUPS",
        file.verification?.removeLowQualityGroups !== false
      ),
      qualityScoreFloor: envNum(
        "QUALITY_SCORE_FLOOR",
        file.verification?.qualityScoreFloor ?? 0
      ),
    },
    attribution: {
      defaultUtm: process.env.ATTRIBUTION_DEFAULT_UTM || "linkedin-group",
    },
    groups: file.groups || [],
  };
}

module.exports = { loadConfig, ROOT, SCHEDULE_PATH };
