/**
 * LinkedIn "6-digit code" email verification (triggered by HeadlessChrome / new device).
 * Set LINKEDIN_VERIFICATION_CODE when you receive the email.
 */

const CODE_INPUT_SELECTORS = [
  'input[name="pin"]',
  'input[autocomplete="one-time-code"]',
  'input[id*="verification" i]',
  'input[type="tel"]',
  'input[inputmode="numeric"]',
  'input[maxlength="6"]',
  'input[pattern="[0-9]*"]',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button[aria-label*="Submit" i]',
  'button[aria-label*="Verify" i]',
  'button[aria-label*="Continue" i]',
  "#workspace button",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function verificationCodeFromEnv() {
  const code = (process.env.LINKEDIN_VERIFICATION_CODE || "").trim();
  return /^\d{6}$/.test(code) ? code : null;
}

async function pageNeedsEmailVerification(page) {
  return page.evaluate(() => {
    const t = (document.body?.innerText || "").toLowerCase();
    return (
      /6-digit code|verify your identity|regain access to your linkedin account/i.test(
        t
      ) || /enter the .* code/i.test(t)
    );
  });
}

function logEmailCodeHelp() {
  console.warn(
    "  → LinkedIn sent a 6-digit email code because it detected automated/headless login."
  );
  console.warn(
    "  → Option A: set LINKEDIN_VERIFICATION_CODE=###### in .env or Railway variables, then restart."
  );
  console.warn(
    "  → Option B: run once locally with CHROME_HEADLESS=false, complete login, keep bot profile on /app/data volume."
  );
  console.warn(
    "  → This is not caused by group/like selectors — it happens at login before any automation."
  );
}

async function trySubmitEmailVerificationCode(page) {
  const needs = await pageNeedsEmailVerification(page);
  if (!needs) return { ok: false, reason: "not_needed" };

  const code = verificationCodeFromEnv();
  if (!code) {
    logEmailCodeHelp();
    return { ok: false, reason: "email_code_required" };
  }

  console.log("  → LinkedIn email verification page — entering 6-digit code…");

  let filled = false;
  for (const sel of CODE_INPUT_SELECTORS) {
    try {
      const el = await page.waitForSelector(sel, { visible: true, timeout: 5000 });
      await el.click({ clickCount: 3 });
      await el.type(code, { delay: 80 });
      filled = true;
      console.log(`  → Code entered (${sel})`);
      break;
    } catch {
      /* next */
    }
  }

  if (!filled) {
    const ok = await page.evaluate((c) => {
      const inputs = [...document.querySelectorAll("input")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && el.type !== "hidden";
      });
      const pin = inputs.find(
        (el) =>
          el.maxLength === 6 ||
          el.autocomplete === "one-time-code" ||
          /pin|code/i.test(el.name || el.id || "")
      );
      if (!pin) return false;
      pin.focus();
      pin.value = c;
      pin.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }, code);
    if (!ok) {
      console.warn("  → Could not find 6-digit code input.");
      return { ok: false, reason: "code_field_not_found" };
    }
    filled = true;
  }

  await sleep(500);

  for (const sel of SUBMIT_SELECTORS) {
    try {
      const btn = await page.waitForSelector(sel, { visible: true, timeout: 3000 });
      await btn.click();
      console.log(`  → Verification submit clicked (${sel})`);
      await sleep(3000);
      return { ok: true, reason: "code_submitted" };
    } catch {
      /* next */
    }
  }

  await page.keyboard.press("Enter");
  await sleep(3000);
  return { ok: true, reason: "code_submitted_enter" };
}

module.exports = {
  trySubmitEmailVerificationCode,
  pageNeedsEmailVerification,
  verificationCodeFromEnv,
  logEmailCodeHelp,
};
