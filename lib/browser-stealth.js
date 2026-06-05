/**
 * Reduce automation signals LinkedIn uses to send "HeadlessChrome" security emails.
 * Does not replace a trusted session — log in once locally when possible.
 */

const DEFAULT_UA =
  process.env.CHROME_USER_AGENT ||
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function applyStealthToPage(page) {
  if (!page || page.__stealthApplied) return;
  page.__stealthApplied = true;

  try {
    await page.setUserAgent(DEFAULT_UA);
  } catch {
    /* ignore */
  }

  try {
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });
  } catch {
    /* ignore */
  }

  try {
    const client = await page.createCDPSession();
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = window.chrome || { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      `,
    });
  } catch {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      window.chrome = window.chrome || { runtime: {} };
    });
  }
}

function wireStealthBrowser(browser) {
  if (!browser || browser.__stealthWired) return;
  browser.__stealthWired = true;

  browser.on("targetcreated", async (target) => {
    try {
      if (target.type() !== "page") return;
      const page = await target.page();
      if (page) await applyStealthToPage(page);
    } catch {
      /* ignore */
    }
  });
}

function stealthChromeArgs() {
  return [
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--window-size=1366,768",
  ];
}

module.exports = {
  applyStealthToPage,
  wireStealthBrowser,
  stealthChromeArgs,
  DEFAULT_UA,
};
