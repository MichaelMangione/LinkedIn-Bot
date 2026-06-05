const PAGE_TIMEOUT_MS = Number(process.env.PAGE_TIMEOUT_MS || 60_000);
const GMAIL_URL =
  process.env.GMAIL_INBOX_URL || "https://mail.google.com/mail/u/0/";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForLinkedIn(page) {
  await page.waitForFunction(
    () => location.hostname.includes("linkedin.com"),
    { timeout: PAGE_TIMEOUT_MS }
  );
}

function extractGroupId(groupUrl) {
  const match = String(groupUrl).match(
    /linkedin\.com\/(?:groups|comm\/groups)\/(\d+)/i
  );
  return match ? match[1] : null;
}

function gmailSearchUrl(query) {
  return `${GMAIL_URL}#search/${encodeURIComponent(query)}`;
}

async function waitForGmailInbox(page) {
  await page.goto(GMAIL_URL, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_TIMEOUT_MS,
  });

  const loginUrl = await page
    .waitForFunction(
      () => {
        const host = location.hostname;
        if (host.includes("accounts.google.com")) return "login";
        if (
          host.includes("mail.google.com") &&
          (document.querySelector('div[role="main"]') ||
            document.querySelector("table[role='grid']") ||
            document.querySelector('div[gh="tl"]'))
        ) {
          return "inbox";
        }
        return null;
      },
      { timeout: PAGE_TIMEOUT_MS, polling: 500 }
    )
    .then((h) => h.jsonValue())
    .catch(() => "timeout");

  if (loginUrl === "login") {
    throw new Error(
      "Gmail is not signed in in the bot profile. " +
        "Log in via bot Chrome (npm run cycle)"
    );
  }

  await sleep(2500);
}

async function runGmailSearch(page, query) {
  console.log(`  → Gmail search: ${query}`);
  await page.goto(gmailSearchUrl(query), {
    waitUntil: "domcontentloaded",
    timeout: PAGE_TIMEOUT_MS,
  });
  await sleep(4000);
}

async function openFirstSearchResult(page) {
  const row = await page
    .waitForSelector("tr.zA", { visible: true, timeout: 25_000 })
    .catch(() => null);

  if (!row) return false;
  await row.click();
  await sleep(3500);
  return true;
}

async function findGroupLinkInContext(ctx, groupId, groupUrl) {
  return ctx.evaluate(
    (id, url) => {
      const anchors = [
        ...document.querySelectorAll('a[href*="linkedin.com"]'),
      ];
      const normalized = (href) => decodeURIComponent(href || "").toLowerCase();

      const exact = anchors.find((a) => {
        const h = normalized(a.href);
        return h.includes(`/groups/${id}`) || h.includes(`groups%2f${id}`);
      });
      if (exact) return exact.href;

      if (url) {
        const slug = url.split("?")[0].replace(/\/$/, "").toLowerCase();
        const byUrl = anchors.find((a) => normalized(a.href).includes(slug));
        if (byUrl) return byUrl.href;
      }

      const loose = anchors.find((a) => {
        const h = normalized(a.href);
        return h.includes("linkedin.com") && h.includes("groups");
      });
      return loose ? loose.href : null;
    },
    groupId,
    groupUrl
  );
}

async function findGroupLinkHref(page, groupId, groupUrl) {
  const contexts = [page, ...page.frames()];
  for (const ctx of contexts) {
    try {
      const href = await findGroupLinkInContext(ctx, groupId, groupUrl);
      if (href) return { href, ctx };
    } catch {
      /* frame detached */
    }
  }
  return null;
}

async function clickGroupLink(ctx, href) {
  return ctx.evaluate((targetHref) => {
    const anchors = [...document.querySelectorAll('a[href*="linkedin.com"]')];
    const link = anchors.find((a) => {
      const h = a.href;
      return (
        h === targetHref ||
        h.split("?")[0] === targetHref.split("?")[0] ||
        decodeURIComponent(h).includes(
          decodeURIComponent(targetHref).split("?")[0]
        )
      );
    });
    if (link) {
      link.click();
      return true;
    }
    return false;
  }, href);
}

async function followLinkedInLink(page, browser, href, linkCtx) {
  const ctx = linkCtx || page;
  const popupPromise = browser
    .waitForTarget(
      (t) => t.type() === "page" && /linkedin\.com/i.test(t.url()),
      { timeout: 45_000 }
    )
    .catch(() => null);

  const clicked = await clickGroupLink(ctx, href);
  if (!clicked) {
    const liPage =
      (await browser.newPage()) ||
      (await browser.pages()).find((p) => !p.url().includes("mail.google"));
    const target = liPage || page;
    await target.goto(href, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    await waitForLinkedIn(target);
    return target;
  }

  const popup = await popupPromise;
  if (popup) {
    const linkedInPage = (await popup.page()) || page;
    await linkedInPage.bringToFront();
    await waitForLinkedIn(linkedInPage);
    return linkedInPage;
  }

  const pages = await browser.pages();
  const linkedTab = pages.find((p) => {
    try {
      return /linkedin\.com/i.test(p.url());
    } catch {
      return false;
    }
  });
  if (linkedTab) {
    await linkedTab.bringToFront();
    await waitForLinkedIn(linkedTab);
    return linkedTab;
  }

  await waitForLinkedIn(page);
  return page;
}

async function openGroupDirect(page, groupUrl) {
  console.log("  → Opening group URL directly (Gmail fallback)...");
  const browser = page.browser();
  let liPage = page;
  if (page.url().includes("mail.google.com")) {
    liPage = await browser.newPage();
  }
  await liPage.goto(groupUrl, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_TIMEOUT_MS,
  });
  await waitForLinkedIn(liPage);
  await sleep(2000);
  return liPage;
}

/**
 * Open Gmail, find an email with the group link, click through to LinkedIn.
 */
async function visitGroupViaGmail(page, groupUrl) {
  const groupId = extractGroupId(groupUrl);
  if (!groupId) {
    throw new Error(`Could not parse LinkedIn group id from: ${groupUrl}`);
  }

  const browser = page.browser();
  console.log("  → Opening Gmail...");

  await waitForGmailInbox(page);

  const searchQuery =
    process.env.GMAIL_SEARCH_QUERY || `linkedin.com/groups/${groupId}`;
  await runGmailSearch(page, searchQuery);

  const opened = await openFirstSearchResult(page);
  if (!opened) {
    if (process.env.GMAIL_FALLBACK_DIRECT !== "false") {
      console.warn(
        `  → No email for "${searchQuery}" — opening LinkedIn directly.`
      );
      return openGroupDirect(page, groupUrl);
    }
    throw new Error(
      `No Gmail thread for "${searchQuery}". Set GMAIL_SEARCH_QUERY or GMAIL_FALLBACK_DIRECT=true.`
    );
  }

  const found = await findGroupLinkHref(page, groupId, groupUrl);
  if (!found?.href) {
    if (process.env.GMAIL_FALLBACK_DIRECT !== "false") {
      console.warn("  → No LinkedIn link in email — opening group URL directly.");
      return openGroupDirect(page, groupUrl);
    }
    throw new Error(`No LinkedIn group link in email (group ${groupId}).`);
  }

  console.log("  → Following group link from email...");
  const linkedInPage = await followLinkedInLink(
    page,
    browser,
    found.href,
    found.ctx
  );
  console.log(`  → LinkedIn: ${linkedInPage.url()}`);
  return linkedInPage;
}

module.exports = {
  extractGroupId,
  visitGroupViaGmail,
  waitForGmailInbox,
};
