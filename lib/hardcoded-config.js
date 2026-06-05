/**
 * Production defaults — used when .env is missing (Railway deploy).
 * Edit this file instead of setting Railway env variables.
 */
const path = require("path");
const os = require("os");

const IS_SERVER =
  process.env.RAILWAY_ENVIRONMENT === "production" ||
  process.env.NODE_ENV === "production";

const HOME = os.homedir();

module.exports = {
  // Google Sheet — group list
  GOOGLE_SHEET_ID: "1Hu_jdGKNbkfIeuL6aNyHaHC4mt-Sbu90SliU1NunbN8",
  GOOGLE_SHEET_GID: "0",

  // Mode — set RAILWAY_TEST_SCHEDULE to "false" for production (2–3h between cycles)
  USE_SHEET_GROUPS: "true",
  TEST_MODE: "false",
  RAILWAY_TEST_SCHEDULE: IS_SERVER ? "true" : "false",
  ENGAGE_ONLY: "false",
  POST_ONLY: "false",
  KEEP_BROWSER_OPEN: "false",
  SKIP_COOLDOWN: "false",
  MAX_GROUP_ATTEMPTS_PER_CYCLE: "5",
  DRY_RUN: "false",

  // Chrome — bot profile only (no Profile 1 / main Chrome / sync)
  CHROME_PATH: IS_SERVER
    ? "/usr/bin/chromium"
    : "/opt/google/chrome/google-chrome",
  CHROME_BOT_DATA_DIR: IS_SERVER
    ? "/app/data/linkedin-bot-chrome"
    : path.join(HOME, ".config/linkedin-bot-chrome"),
  CHROME_BOT_PROFILE: "Default",
  DATA_DIR: IS_SERVER ? "/app/data" : path.join(__dirname, ".."),
  // Local: visible Chrome. Railway/production: headless (no window).
  CHROME_HEADLESS: IS_SERVER ? "true" : "false",
  // Real mouse moves/clicks on login (set false to use fast puppeteer .click()).
  CHROME_HUMAN_CLICKS: "true",
  USE_MAIN_PROFILE: "false",
  CHROME_SYNC_PROFILE: "false",
  CHROME_AUTO_DEBUG: "false",
  CHROME_AUTO_QUIT: "false",
  GMAIL_FIRST: "false",

  // 2Captcha (LinkedIn login) — set TWOCAPTCHA_API_KEY in Railway or .env
  TWOCAPTCHA_API_KEY: process.env.TWOCAPTCHA_API_KEY || "",
  CAPTCHA_SOLVER_ENABLED: "true",
  CAPTCHA_LOGIN_WAIT_MS: "420000",
  CHALLENGE_URL_WAIT_MS: "60000",
  LOGIN_TO_CHALLENGE_WAIT_MS: "8000",
  CAPTCHA_MAX_ATTEMPTS: "4",
  CHROME_STEALTH: "true",
  // Set LINKEDIN_VERIFICATION_CODE in Railway Variables (not here — codes expire)

  // Scheduling v1.1 production
  CYCLES_PER_DAY: "5",
  ACTIVE_HOURS_START: "8",
  ACTIVE_HOURS_END: "20",
  INTER_CYCLE_DELAY_MIN_MS: "7200000",
  INTER_CYCLE_DELAY_MAX_MS: "10800000",
  TZ: "America/New_York",

  ACCOUNT_AGE_MULTIPLIER: "1.0",
  VERIFY_POSTS_ENABLED: "true",
  VERIFY_POSTS_AFTER_HOURS: "24",
  AUTO_REMOVE_LOW_QUALITY_GROUPS: "true",
  QUALITY_SCORE_FLOOR: "0",
  ATTRIBUTION_DEFAULT_UTM: "linkedin-group",

  ENGAGEMENT_ENABLED: "true",
  LIKES_PER_GROUP: "3",
  COMMENTS_PER_GROUP: "2",
  COOLDOWN_MS: "1200000",
  COOLDOWN_JITTER_PCT: "10",
  LIKE_DELAY_MIN_MS: "10000",
  LIKE_DELAY_MAX_MS: "30000",
  COMMENT_DELAY_MIN_MS: "60000",
  COMMENT_DELAY_MAX_MS: "180000",
  COMMENT_MAX_CONSECUTIVE_SKIPS: "3",

  MAX_DAILY_LIKES: "30",
  MAX_DAILY_COMMENTS: "15",
  MAX_DAILY_POSTS: "5",
  MAX_GROUPS_PER_CYCLE: "1",

  COMMENT_EMOJIS: "👍,👏,❤️,🔥",
  DEFAULT_COMMENT_TEXT: "👍",
  COMMENT_STEP_DELAY_MS: "2000",
  COMMENT_SUBMIT_SELECTOR:
    "form.comments-comment-box__form div.display-flex.justify-space-between div.display-flex.align-items-center||button.comments-comment-box__submit-button",

  POST_EMBER_IDS: "ember131,ember276",
  START_POST_TEXT: "Start a post in this group",
  POLL_CLICK_INTERVAL_MS: "500",
  COMPOSER_BUTTON_WAIT_MS: "60000",
  POST_STEP_DELAY_MS: "2000",
  GROUP_PAGE_LOAD_MS: "15000",
  GROUP_FEED_WAIT_MS: "12000",
  CAPTCHA_MAX_ATTEMPTS: "4",
  LOGIN_MAX_WAIT_MS: "45000",
  LOGIN_POLL_MS: "2000",
  LOGIN_PROGRESS_LOG_MS: "5000",
  POST_EDITOR_SELECTOR:
    "#ember131 > div > div.share-creation-state.share-creation-state__share-box-v2.share-creation-state__share-box-v2--redesigned-detours > div.share-creation-state__content-scrollable > div > div > div > div > div > div > div.ql-editor.ql-blank > p||#ember276 > div > div.share-creation-state.share-creation-state__share-box-v2.share-creation-state__share-box-v2--redesigned-detours > div.share-creation-state__content-scrollable > div > div > div > div > div > div > div.ql-editor.ql-blank > p",
  POST_SUBMIT_SELECTOR:
    "#ember131 > div > div.share-creation-state.share-creation-state__share-box-v2.share-creation-state__share-box-v2--redesigned-detours > div.share-creation-state__bottom.share-creation-state__bottom--margin > div.share-creation-state__footer > div||#ember276 > div > div.share-creation-state.share-creation-state__share-box-v2.share-creation-state__share-box-v2--redesigned-detours > div.share-creation-state__bottom.share-creation-state__bottom--margin > div.share-creation-state__footer > div",
};
