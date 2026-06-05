const PAGE_TIMEOUT_MS = Number(process.env.PAGE_TIMEOUT_MS || 60_000);
const POST_CLICK_TIMEOUT_MS = Number(process.env.POST_CLICK_TIMEOUT_MS || 12_000);
const GROUP_PAGE_LOAD_MS = Number(process.env.GROUP_PAGE_LOAD_MS || 15_000);

const START_POST_SELECTOR = ".artdeco-button__text";
// Legacy constant referenced by older selector lists.
// Keep defined to avoid runtime crashes.
const COMPOSER_BUTTON_SELECTOR = "button.share-box-feed-entry__trigger";

const DEFAULT_START_SELECTORS = [
  'button[aria-label*="Start a post" i]',
  'button[aria-label*="Create a post" i]',
  'button[aria-label*="Write" i]',
  '[data-control-name="create_post"]',
  ".groups-share-box__create-post-button",
  ".share-box-feed-entry__trigger",
  "button.share-box-feed-entry__trigger",
  COMPOSER_BUTTON_SELECTOR,
  "button.artdeco-button.artdeco-button--muted.artdeco-button--4.artdeco-button--tertiary.ember-view",
];

const EMBER_POST_PATH_TEMPLATE = {
  editor:
    "{root} > div > div.share-creation-state.share-creation-state__share-box-v2.share-creation-state__share-box-v2--redesigned-detours > div.share-creation-state__content-scrollable > div > div > div > div > div > div > div.ql-editor.ql-blank > p",
  editorShort: "{root} div.share-creation-state .ql-editor[contenteditable='true']",
  submit:
    "{root} > div > div.share-creation-state.share-creation-state__share-box-v2.share-creation-state__share-box-v2--redesigned-detours > div.share-creation-state__bottom.share-creation-state__bottom--margin > div.share-creation-state__footer > div",
  submitShort:
    "{root} div.share-creation-state__footer button, {root} div.share-creation-state__footer > div",
};

const DEFAULT_EDITOR_SELECTORS = [
  "[id^='ember'] div.share-creation-state .ql-editor[contenteditable='true']",
  "div.share-creation-state div.ql-editor.ql-blank > p",
  'div.share-creation-state div.ql-editor[contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  'div.ql-editor[contenteditable="true"]',
  "div.ql-editor",
];

const DEFAULT_SUBMIT_SELECTORS = [
  "[id^='ember'] div.share-creation-state__footer button",
  "[id^='ember'] div.share-creation-state__footer > div",
  'button.share-actions__primary-action',
  'button[aria-label*="Post" i]:not([aria-label*="comment" i])',
  'button[aria-label="Post"]',
  "button.artdeco-button--primary",
];

function emberIdsFromEnv() {
  const raw =
    process.env.POST_EMBER_IDS ||
    "ember131,ember276";
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^#/, ""))
    .filter((id) => /^ember\d+$/i.test(id));
}

function selectorsForEmberRoots(ids) {
  const editors = [];
  const submits = [];
  const triggers = [];
  for (const id of ids) {
    const root = `#${id}`;
    triggers.push(
      `${root} .share-box-feed-entry__trigger`,
      `${root} button[aria-label*='post' i]`,
      root
    );
    editors.push(
      EMBER_POST_PATH_TEMPLATE.editor.replaceAll("{root}", root),
      EMBER_POST_PATH_TEMPLATE.editorShort.replaceAll("{root}", root)
    );
    submits.push(
      EMBER_POST_PATH_TEMPLATE.submit.replaceAll("{root}", root),
      ...EMBER_POST_PATH_TEMPLATE.submitShort
        .split(",")
        .map((s) => s.trim().replaceAll("{root}", root))
    );
  }
  return { editors, submits, triggers };
}

function uniqueSelectors(list) {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

function buildPostUiSelectorLists() {
  const ember = selectorsForEmberRoots(emberIdsFromEnv());
  const editorSelectors = uniqueSelectors([
    ...selectorList("POST_EDITOR_SELECTOR", []),
    ...ember.editors,
    ...DEFAULT_EDITOR_SELECTORS,
  ]);
  const submitSelectors = uniqueSelectors([
    ...selectorList("POST_SUBMIT_SELECTOR", []),
    ...ember.submits,
    ...DEFAULT_SUBMIT_SELECTORS,
  ]);
  return { editorSelectors, submitSelectors, composerTriggers: ember.triggers };
}

async function discoverShareCreationSelectors(page) {
  return page.evaluate(() => {
    const editors = [];
    const submits = [];
    const triggers = [];
    for (const root of document.querySelectorAll('[id^="ember"]')) {
      const state = root.querySelector(".share-creation-state");
      if (!state) continue;
      const r = root.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;

      const id = root.id;
      const esc = CSS.escape(id);
      const trigger = root.querySelector(
        ".share-box-feed-entry__trigger, button[aria-label*='post' i]"
      );
      if (trigger) triggers.push(`#${esc} .share-box-feed-entry__trigger`);

      const ed = state.querySelector(
        ".ql-editor[contenteditable='true'], div.ql-editor.ql-blank > p, div.ql-editor"
      );
      if (ed) {
        editors.push(`#${esc} div.share-creation-state .ql-editor[contenteditable='true']`);
        editors.push(`#${esc} div.ql-editor.ql-blank > p`);
      }

      const footer = state.querySelector(".share-creation-state__footer");
      if (footer) {
        submits.push(`#${esc} div.share-creation-state__footer button`);
        submits.push(`#${esc} div.share-creation-state__footer > div`);
      }
    }
    return {
      editors: [...new Set(editors)],
      submits: [...new Set(submits)],
      triggers: [...new Set(triggers)],
    };
  });
}

async function mergeDiscoveredPostSelectors(page, base) {
  const found = await discoverShareCreationSelectors(page);
  if (found.editors.length) {
    console.log(
      `  → Composer UI detected: ${found.editors.map((s) => s.split(" ")[0]).join(", ")}`
    );
  }
  return {
    editorSelectors: uniqueSelectors([...found.editors, ...base.editorSelectors]),
    submitSelectors: uniqueSelectors([...found.submits, ...base.submitSelectors]),
    composerTriggers: uniqueSelectors([
      ...found.triggers,
      ...base.composerTriggers,
    ]),
  };
}

const DEFAULT_COMMENT_OPEN_SELECTORS = [
  ".feed-shared-social-action-bar button[aria-label*='Comment' i]",
  "button[aria-label*='Comment on' i]",
  "button.social-actions-button[aria-label*='Comment' i]",
  ".comments-comment-box-comment__button",
  "button[aria-label*='comment' i]",
];

const DEFAULT_COMMENT_EDITOR_SELECTORS = [
  "div.comments-comment-box__form div.ql-editor[contenteditable='true']",
  "div.comments-comment-texteditor div[contenteditable='true']",
  "form.comments-comment-box__form div[contenteditable='true'][role='textbox']",
  "div[contenteditable='true'][role='textbox']",
];

const DEFAULT_COMMENT_SUBMIT_SELECTORS = [
  "form.comments-comment-box__form div.display-flex.justify-space-between div.display-flex.align-items-center",
  "button.comments-comment-box__submit-button--cr",
  "button.comments-comment-box__submit-button",
  'button[aria-label*="Post comment" i]',
  'button[type="submit"].comments-comment-box__submit-button',
];
function selectorList(envKey, defaults) {
  const raw = process.env[envKey];
  if (!raw) return defaults;
  return raw
    .split("||")
    .map((s) => s.trim())
    .filter(Boolean);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function waitForLinkedIn(page) {
  await page.waitForFunction(
    () => location.hostname.includes("linkedin.com"),
    { timeout: PAGE_TIMEOUT_MS }
  );
}

async function visitGroup(page, groupUrl) {
  const active = page.__linkedInActivePage || page;
  const { logBotUrl } = require("./linkedin-login");

  console.log(`  → Opening group: ${groupUrl}`);
  try {
    await active.goto(groupUrl, {
      waitUntil: "networkidle2",
      timeout: PAGE_TIMEOUT_MS,
    });
  } catch {
    await active.goto(groupUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
  }
  await waitForLinkedIn(active);
  await sleep(Number(process.env.GROUP_PAGE_LOAD_MS || 15_000) / 3);
  await logBotUrl(page, "group");

  const { ensureAuthForTarget, needsLinkedInAuth } = require("./linkedin-login");
  if (needsLinkedInAuth(page)) {
    console.log("  → Group opened login page — running full auth flow…");
    const auth = await ensureAuthForTarget(page, groupUrl);
    if (!auth.ok) {
      console.warn(`  → Auth failed after group redirect (${auth.reason || "login_failed"}).`);
      return active;
    }
    if (!active.url().includes(groupUrl.match(/groups\/(\d+)/)?.[1] || "___")) {
      try {
        await active.goto(groupUrl, {
          waitUntil: "domcontentloaded",
          timeout: PAGE_TIMEOUT_MS,
        });
      } catch {
        /* continue */
      }
      await sleep(2000);
      await logBotUrl(page, "group after auth");
    }
  }

  return active;
}

/** Scroll and wait for lazy-loaded group feed + composer (headless needs longer). */
async function prepareGroupPage(page, groupUrl) {
  const active = getLinkedInPage(page);
  const groupId = groupUrl?.match(/groups\/(\d+)/)?.[1];
  let url = "";
  try {
    url = active.url();
  } catch {
    url = "";
  }

  if (groupId && !url.includes(groupId)) {
    await visitGroup(page, groupUrl);
  }

  await waitForGroupPageReady(page);

  const openedTab = await active.evaluate(() => {
    const tabs = [
      ...document.querySelectorAll(
        'button, a[role="tab"], [role="tab"] button, .artdeco-tab'
      ),
    ];
    for (const t of tabs) {
      const label = (
        t.textContent ||
        t.getAttribute("aria-label") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (
        /^(discussions?|feed|posts|recent|all activity)$/i.test(label) ||
        (label.includes("discussion") && label.length < 40)
      ) {
        t.click();
        return label;
      }
    }
    return null;
  });
  if (openedTab) {
    console.log(`  → Group tab: ${openedTab}`);
    await sleep(2000);
  }

  console.log("  → Loading group feed (scroll)...");
  for (let i = 0; i < 5; i++) {
    await scrollFeed(active);
  }

  const waitMs = Number(process.env.GROUP_FEED_WAIT_MS || 12_000);
  const startLabel = (process.env.START_POST_TEXT || "start a post").toLowerCase();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const ready = await active.evaluate((needle) => {
      const hasFeed = !!document.querySelector(
        "div.feed-shared-update-v2, article.occludable-update, div.occludable-update, main.scaffold-layout__main"
      );
      const hasComposer = [...document.querySelectorAll(
        "button, [role='button'], .share-box-feed-entry__trigger"
      )].some((el) =>
        (el.textContent || el.getAttribute("aria-label") || "")
          .toLowerCase()
          .includes(needle)
      );
      return hasFeed || hasComposer;
    }, startLabel);
    if (ready) break;
    await scrollFeed(active);
    await sleep(1500);
  }

  return active;
}

async function tryClick(page, selectors, timeout = POST_CLICK_TIMEOUT_MS) {
  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { visible: true, timeout });
      if (el) {
        await el.click();
        console.log(`  → Clicked: ${selector.slice(0, 72)}${selector.length > 72 ? "…" : ""}`);
        return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

async function waitForGroupPageReady(page) {
  try {
    await page.waitForFunction(
      () =>
        document.readyState === "complete" &&
        location.hostname.includes("linkedin.com") &&
        !location.pathname.includes("/login"),
      { timeout: PAGE_TIMEOUT_MS }
    );
  } catch {
    /* page may still be usable */
  }
  await sleep(Number(process.env.POST_STEP_DELAY_MS || 2000));
}

const FEED_POST_ROOT_SELECTORS = [
  "div.feed-shared-update-v2",
  "article.occludable-update",
  "div.occludable-update",
];

async function scrollFeed(page) {
  await page.evaluate(() => window.scrollBy(0, 700));
  await sleep(1500);
}

async function collectFeedPostCards(page) {
  return page.$$(FEED_POST_ROOT_SELECTORS.join(", "));
}

async function isFeedPostVisible(post) {
  return post.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.height > 60 && r.top >= 40 && r.top < window.innerHeight * 0.92;
  });
}

async function isPostAlreadyEngaged(post, action) {
  return post.evaluate((root, kind) => {
    const flag = root.getAttribute("data-bot-engaged") || "";
    return flag === kind || flag === "both";
  }, action);
}

async function markPostEngaged(post, action) {
  await post.evaluate((root, kind) => {
    const prev = root.getAttribute("data-bot-engaged");
    if (prev && prev !== kind) {
      root.setAttribute("data-bot-engaged", "both");
    } else {
      root.setAttribute("data-bot-engaged", kind);
    }
  }, action);
}

async function getFeedPostKey(post) {
  return post.evaluate((root) => {
    const urn =
      root.getAttribute("data-urn") ||
      root.querySelector("[data-urn]")?.getAttribute("data-urn") ||
      root.getAttribute("data-id");
    if (urn) return urn;
    const name =
      root
        .querySelector(
          ".update-components-actor__name, .feed-shared-actor__name, .feed-shared-actor__title"
        )
        ?.textContent?.trim()
        .slice(0, 48) || "";
    return `feed:${name}:${Math.round(root.getBoundingClientRect().top)}`;
  });
}

function pickCommentEmoji(index) {
  const emojis = (process.env.COMMENT_EMOJIS || "👍,👏,❤️,🔥")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!emojis.length) return "👍";
  return emojis[index % emojis.length];
}

async function likePostCard(post) {
  return post.evaluate((root) => {
    const bar = root.querySelector(".feed-shared-social-action-bar");
    if (!bar) return { ok: false, reason: "no-action-bar" };

    const btn =
      bar.querySelector(
        'button[aria-label*="Like" i]:not([aria-pressed="true"])'
      ) || bar.querySelector('button.react-button__trigger:not([aria-pressed="true"])');

    if (!btn) return { ok: false, reason: "no-like-button" };
    if (btn.closest(".comments-comment-item, .comments-comments-list")) {
      return { ok: false, reason: "comment-thread" };
    }

    const label = (btn.getAttribute("aria-label") || "").toLowerCase();
    if (/comment|reply/.test(label)) {
      return { ok: false, reason: "not-post-like" };
    }

    const r = btn.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return { ok: false, reason: "hidden" };

    btn.click();
    return { ok: true };
  });
}

async function likePostsInFeed(page, count, delays) {
  const engaged = new Set();
  let done = 0;
  let scrolls = 0;
  const maxScrolls = count + 12;

  await scrollFeed(page);
  await sleep(1500);

  while (done < count && scrolls < maxScrolls) {
    if (scrolls > 0) await scrollFeed(page);
    scrolls++;

    const posts = await collectFeedPostCards(page);
    for (const post of posts) {
      if (done >= count) break;

      const key = await getFeedPostKey(post);
      if (engaged.has(key)) continue;
      if (await isPostAlreadyEngaged(post, "like")) continue;
      if (!(await isFeedPostVisible(post))) continue;

      const result = await likePostCard(post);
      if (!result.ok) continue;

      engaged.add(key);
      await markPostEngaged(post, "like");
      done++;
      console.log(`  → Liked feed post ${done}/${count}`);
      await sleep(randomBetween(delays.min, delays.max));
    }
  }

  if (done < count) {
    console.warn(`  → Only liked ${done}/${count} distinct feed posts.`);
  }
  return done;
}

async function fillContentEditableOnce(editor, text) {
  await editor.evaluate((el, value) => {
    el.focus();
    const safe = String(value).replace(/</g, "");
    if (el.classList.contains("ql-editor")) {
      el.innerHTML = `<p>${safe}</p>`;
    } else {
      el.textContent = safe;
    }
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: safe })
    );
  }, text);
}

async function openCommentOnPostCard(post) {
  return post.evaluate((root) => {
    const bar = root.querySelector(".feed-shared-social-action-bar");
    if (!bar) return false;
    const btn = bar.querySelector("button[aria-label*='Comment' i]");
    if (!btn || btn.closest(".comments-comment-item")) return false;
    const r = btn.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    btn.click();
    return true;
  });
}

async function waitForVisibleEditorHandle(scope, selectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const editor = await scope.$(sel);
      if (!editor) continue;
      const visible = await editor.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (visible) return editor;
    }
    await sleep(350);
  }
  return null;
}

async function waitForCommentEditorOnPost(post, selectors, timeoutMs = 5_000) {
  return waitForVisibleEditorHandle(post, selectors, timeoutMs);
}

async function waitForCommentEditorOnPage(page, selectors, timeoutMs = 5_000) {
  return waitForVisibleEditorHandle(getLinkedInPage(page), selectors, timeoutMs);
}

async function skipPostForComments(post, engaged, reason) {
  const key = await getFeedPostKey(post);
  engaged.add(key);
  await markPostEngaged(post, "comment-skip");
  return key;
}

async function submitCommentOnPostCard(post, submitSelectors) {
  return post.evaluate((root, selectors) => {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (!el) continue;
      const target =
        el.tagName === "BUTTON" ? el : el.querySelector("button") || el;
      const r = target.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        target.click();
        return { ok: true, selector: sel };
      }
    }
    const fallback = root.querySelector(
      "form.comments-comment-box__form button.comments-comment-box__submit-button, form.comments-comment-box__form button[aria-label*='Post comment' i]"
    );
    if (fallback) {
      fallback.click();
      return { ok: true, selector: "fallback-submit" };
    }
    return { ok: false };
  }, submitSelectors);
}

async function closeCommentBox(page) {
  try {
    await page.keyboard.press("Escape");
  } catch {
    /* ignore */
  }
  await sleep(500);
}

async function commentOnPostsInFeed(page, count, delays, commentText) {
  const engaged = new Set();
  let done = 0;
  let scrolls = 0;
  let consecutiveSkips = 0;
  const maxConsecutiveSkips = Number(process.env.COMMENT_MAX_CONSECUTIVE_SKIPS || 3);
  const maxScrolls = count + 10;
  const editorSelectors = selectorList(
    "COMMENT_EDITOR_SELECTOR",
    DEFAULT_COMMENT_EDITOR_SELECTORS
  );
  const submitSelectors = selectorList(
    "COMMENT_SUBMIT_SELECTOR",
    DEFAULT_COMMENT_SUBMIT_SELECTORS
  );
  const stepDelay = Number(process.env.COMMENT_STEP_DELAY_MS || 1500);
  let abortComments = false;

  while (done < count && scrolls < maxScrolls && !abortComments) {
    if (scrolls > 0) await scrollFeed(page);
    scrolls++;

    const posts = await collectFeedPostCards(page);
    for (const post of posts) {
      if (done >= count || abortComments) break;

      const key = await getFeedPostKey(post);
      if (engaged.has(key)) continue;
      if (await isPostAlreadyEngaged(post, "comment")) continue;
      if (await isPostAlreadyEngaged(post, "comment-skip")) continue;
      if (!(await isFeedPostVisible(post))) continue;

      const emoji =
        commentText && /^[\p{Emoji}\s]+$/u.test(commentText)
          ? commentText
          : pickCommentEmoji(done);

      console.log(`  → Comment on feed post ${done + 1}/${count} (${emoji})...`);

      const opened = await openCommentOnPostCard(post);
      if (!opened) {
        await skipPostForComments(post, engaged, "no-comment-button");
        consecutiveSkips++;
        console.warn("  → No comment button on this post — skipping.");
        if (consecutiveSkips >= maxConsecutiveSkips) {
          console.warn(
            "  → Comments not available in this group — skipping remaining comments."
          );
          abortComments = true;
        }
        continue;
      }

      await sleep(stepDelay);

      let editor = await waitForCommentEditorOnPost(post, editorSelectors, 4000);
      if (!editor) {
        editor = await waitForCommentEditorOnPage(page, editorSelectors, 4000);
      }
      if (!editor) {
        await skipPostForComments(post, engaged, "no-editor");
        await closeCommentBox(page);
        consecutiveSkips++;
        console.warn(
          "  → Comment editor not found — post/group may not allow comments, skipping."
        );
        if (consecutiveSkips >= maxConsecutiveSkips) {
          console.warn(
            "  → Stopping comment phase for this group (comments disabled or blocked)."
          );
          abortComments = true;
        }
        continue;
      }

      consecutiveSkips = 0;

      await fillContentEditableOnce(editor, emoji);
      await sleep(600);

      const submitted = await submitCommentOnPostCard(post, submitSelectors);
      if (!submitted.ok) {
        await skipPostForComments(post, engaged, "no-submit");
        await closeCommentBox(page);
        console.warn("  → Comment submit not found — skipping this post.");
        continue;
      }

      engaged.add(key);
      await markPostEngaged(post, "comment");
      done++;
      console.log(`  → Commented on feed post ${done}/${count}`);
      await closeCommentBox(page);
      await sleep(randomBetween(delays.min, delays.max));
    }
  }

  if (done < count && !abortComments) {
    console.warn(`  → Only commented on ${done}/${count} distinct feed posts.`);
  }
  return done;
}

function applyUtm(text, utmSlug, defaultUtm) {
  const slug = utmSlug || defaultUtm;
  return text.replace(/\{\{utm\}\}/g, slug);
}

async function waitForEditor(page, selectors) {
  const joined = selectors.join(", ");
  try {
    return await page.waitForSelector(joined, {
      visible: true,
      timeout: POST_CLICK_TIMEOUT_MS,
    });
  } catch {
    for (const selector of selectors) {
      try {
        const el = await page.waitForSelector(selector, {
          visible: true,
          timeout: 4000,
        });
        if (el) return el;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

async function discoverPostComposerButtons(page) {
  return page.evaluate(() => {
    const items = [];
    const seen = new Set();
    for (const el of document.querySelectorAll(
      '[id^="ember"], button, [role="button"], .share-box-feed-entry__trigger'
    )) {
      const label = (el.getAttribute("aria-label") || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      const haystack = `${label} ${el.id} ${el.className || ""}`;
      if (!/post|share|start|create|write|composer/i.test(haystack)) continue;
      const key = el.id || label;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: el.id || null,
        tag: el.tagName,
        label: label.slice(0, 120),
        selector: el.id ? `#${CSS.escape(el.id)}` : null,
      });
    }
    return items.slice(0, 25);
  });
}

async function clickComposerByText(page, text) {
  return page.evaluate((needle) => {
    const n = String(needle).toLowerCase();
    const candidates = document.querySelectorAll(
      "button, [role='button'], .artdeco-button__text, .share-box-feed-entry__trigger"
    );
    for (const el of candidates) {
      const label = (
        el.getAttribute("aria-label") ||
        el.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (!label.includes(n)) continue;
      const clickTarget = el.closest("button") || el;
      const r = clickTarget.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        clickTarget.click();
        return true;
      }
    }
    return false;
  }, text);
}

async function waitForComposerButton(page, extraTriggers = [], groupUrl = "") {
  if (groupUrl) {
    await prepareGroupPage(page, groupUrl);
  }

  const waitMs = Number(process.env.COMPOSER_BUTTON_WAIT_MS || 60_000);
  const startTexts = [
    (process.env.START_POST_TEXT || "").trim(),
    "start a post in this group",
    "start a post",
    "write something",
    "share",
  ].filter(Boolean);
  const pollMs = Number(process.env.POLL_CLICK_INTERVAL_MS || 500);
  const selectors = uniqueSelectors([
    COMPOSER_BUTTON_SELECTOR,
    ...selectorList("START_POST_SELECTOR", DEFAULT_START_SELECTORS),
    ...extraTriggers,
  ]);
  const unique = selectors;

  console.log(
    `  → Waiting for composer (up to ${Math.round(waitMs / 1000)}s)...`
  );

  const deadline = Date.now() + waitMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    if (attempt % 8 === 1) {
      await activeScrollForComposer(page);
    }

    for (const startText of startTexts) {
      const byText = await clickComposerByText(page, startText);
      if (byText) {
        console.log(`  → [BUTTON] Clicked: "${startText}"`);
        return { el: null, selector: `text:${startText}`, clickedByText: true };
      }
    }
    if (attempt % 10 === 1) {
      console.log(`  → [BUTTON] Looking for composer (${startTexts[0] || "start a post"})...`);
    }

    for (const selector of unique) {
      try {
        const el = await page.waitForSelector(selector, {
          visible: true,
          timeout: 1500,
        });
        if (el) {
          return { el, selector };
        }
      } catch {
        /* try next selector */
      }
    }
    await sleep(pollMs);
  }
  return null;
}

async function activeScrollForComposer(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    window.scrollBy(0, 200);
  });
  await sleep(600);
}

async function preparePageForGroupPost(page, groupUrl) {
  const active = getLinkedInPage(page);
  await active.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);
  try {
    await active.keyboard.press("Escape");
  } catch {
    /* ignore */
  }
  await sleep(400);

  const groupId = groupUrl.match(/groups\/(\d+)/)?.[1];
  let url = "";
  try {
    url = await active.url();
  } catch {
    url = "";
  }
  await prepareGroupPage(page, groupUrl);
}

async function clickGroupPostButton(page, groupUrl, extraTriggers = []) {
  const { isLoggedIn, ensureAuthForTarget, needsLinkedInAuth, logBotUrl } =
    require("./linkedin-login");

  if (!(await isLoggedIn(page)) || needsLinkedInAuth(page)) {
    const login = await ensureAuthForTarget(page, groupUrl);
    if (!login.ok) {
      console.warn("  → LinkedIn login failed before posting.");
      return { ok: false, reason: "login" };
    }
    if (groupUrl) await visitGroup(page, groupUrl);
  }

  await logBotUrl(page, "before composer");

  const found = await waitForComposerButton(page, extraTriggers, groupUrl);
  if (found) {
    if (!found.clickedByText && found.el) {
      await found.el.click();
    }
    console.log(
      `  → Clicked composer: ${found.selector.slice(0, 80)}${found.selector.length > 80 ? "…" : ""}`
    );
    return { ok: true, clicked: true, selector: found.selector };
  }

  let debugUrl = "";
  try {
    debugUrl = (await getLinkedInPage(page).url()) || "";
  } catch {
    debugUrl = "";
  }
  if (debugUrl) {
    console.log(`  → Composer miss on: ${debugUrl.replace(/^https?:\/\//, "").slice(0, 120)}`);
  }

  const candidates = await discoverPostComposerButtons(page);
  console.log("  → Composer button not found after load. Possible buttons on page:");
  for (const c of candidates) {
    const idPart = c.selector ? c.selector : c.tag;
    console.log(`     ${idPart} — ${c.label || "(no label)"}`);
  }

  return { ok: false, clicked: false, candidates };
}

async function trySubmitNearEditor(page, editor, submitSelectors) {
  const scoped = await editor.evaluate((el) => {
    let node = el;
    while (node && node !== document.body) {
      if (node.id && node.id.startsWith("ember")) {
        const esc = CSS.escape(node.id);
        return [
          `#${esc} div.share-creation-state__footer button`,
          `#${esc} div.share-creation-state__footer > div`,
          `#${esc} button.share-actions__primary-action`,
        ];
      }
      node = node.parentElement;
    }
    return [];
  });
  if (scoped.length && (await tryClick(page, scoped))) {
    console.log("  → Submit via editor's ember root");
    return true;
  }
  return tryClick(page, submitSelectors);
}

async function publishPost(page, postContent, groupUrl) {
  if (!postContent) return { ok: false, postUrl: null };

  if (process.env.DRY_RUN === "true") {
    console.log(`  → [DRY RUN] Post: ${postContent.slice(0, 80)}...`);
    return { ok: true, postUrl: "dry-run" };
  }

  const baseUi = buildPostUiSelectorLists();
  console.log(
    `  → Post UI variants: ${emberIdsFromEnv().join(", ")} + auto-detect`
  );

  if (groupUrl) {
    await preparePageForGroupPost(page, groupUrl);
  }

  let postUi = await mergeDiscoveredPostSelectors(page, baseUi);

  console.log("  → Step 1: open group post composer...");
  await sleep(Number(process.env.POST_STEP_DELAY_MS || 2000));

  const clickResult = await clickGroupPostButton(
    page,
    groupUrl,
    postUi.composerTriggers
  );
  if (!clickResult.ok || !clickResult.clicked) {
    return { ok: false, postUrl: null };
  }

  await sleep(Number(process.env.POST_STEP_DELAY_MS || 1500));
  postUi = await mergeDiscoveredPostSelectors(page, baseUi);

  console.log("  → Step 2: type post content...");
  const editor = await waitForEditor(page, postUi.editorSelectors);

  if (!editor) {
    console.warn("  → Post editor not found (ember131 / ember276 / fallbacks).");
    return { ok: false, postUrl: null };
  }

  await editor.click({ clickCount: 3 });
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(postContent, { delay: 18 });
  await sleep(1000);

  console.log("  → Step 3: submit post...");
  const submitted = await trySubmitNearEditor(
    page,
    editor,
    postUi.submitSelectors
  );

  if (!submitted) {
    console.warn("  → Post typed; submit button not found (ember131 / ember276).");
    return { ok: false, postUrl: null };
  }

  await sleep(4000);
  const postUrl = page.url();
  console.log("  → Post published.");
  return { ok: true, postUrl };
}

function getLinkedInPage(page) {
  return page.__linkedInActivePage || page;
}

async function assessGroupPage(page) {
  const active = getLinkedInPage(page);
  let url = "";
  try {
    url = await active.url();
  } catch {
    return { accessible: false, reason: "navigation_error" };
  }

  const { isLoggedIn, logBotUrl, isAuthPageUrl } = require("./linkedin-login");
  await logBotUrl(page, "group assess");
  if (isAuthPageUrl(url) || !(await isLoggedIn(page))) {
    return { accessible: false, reason: "login_required" };
  }

  const startPostText = (process.env.START_POST_TEXT || "start a post").trim();
  const signals = await active.evaluate((startLabel) => {
    const text = (document.body?.innerText || "").slice(0, 8000);
    const joinBtn = document.querySelector(
      'button[aria-label*="Join" i], button.join-group, .groups-join-button'
    );
    const n = String(startLabel).toLowerCase();
    const hasComposerByText = [...document.querySelectorAll(
      "button, [role='button'], .artdeco-button__text, .share-box-feed-entry__trigger"
    )].some((el) =>
      (el.textContent || el.getAttribute("aria-label") || "")
        .toLowerCase()
        .includes(n)
    );
    return {
      requestJoin:
        /request to join|join this group|pending approval|membership pending/i.test(
          text
        ) || !!joinBtn,
      notFound: /page doesn't exist|page not found|content unavailable/i.test(
        text
      ),
      restricted: /you don.t have access|not a member of this group/i.test(text),
      hasFeed: !!document.querySelector(
        "div.feed-shared-update-v2, article.occludable-update, div.occludable-update, div.groups-feed, [data-test-id='groups-feed'], main.scaffold-layout__main"
      ),
      hasComposer:
        hasComposerByText ||
        !!document.querySelector(
          'button[aria-label*="Start a post" i], button[aria-label*="Create a post" i], .groups-share-box__create-post-button, .share-box-feed-entry__trigger, button.share-box-feed-entry__trigger, [data-control-name="create_post"]'
        ),
    };
  }, startPostText);

  if (signals.notFound) {
    return { accessible: false, reason: "group_not_found" };
  }
  if (signals.requestJoin || signals.restricted) {
    return { accessible: false, reason: "not_joined" };
  }

  return {
    accessible: true,
    hasFeed: signals.hasFeed,
    hasComposer: signals.hasComposer,
  };
}

module.exports = {
  sleep,
  waitForLinkedIn,
  getLinkedInPage,
  visitGroup,
  prepareGroupPage,
  assessGroupPage,
  ensureLinkedInLoggedIn: require("./linkedin-login").ensureLinkedInLoggedIn,
  waitForGroupPageReady,
  likePostsInFeed,
  commentOnPostsInFeed,
  publishPost,
  clickGroupPostButton,
  applyUtm,
};
