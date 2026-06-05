/**
 * 2Captcha integration for LinkedIn login — detect type, log, solve, inject token.
 * API key: TWOCAPTCHA_API_KEY env or lib/hardcoded-config.js
 */

const API_IN = "https://2captcha.com/in.php";
const API_RES = "https://2captcha.com/res.php";
const POLL_MS = Number(process.env.CAPTCHA_POLL_MS || 4000);
const POLL_MAX = Number(process.env.CAPTCHA_POLL_MAX || 45);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function apiKey() {
  return (process.env.TWOCAPTCHA_API_KEY || "").trim();
}

function solverEnabled() {
  return process.env.CAPTCHA_SOLVER_ENABLED !== "false" && Boolean(apiKey());
}

function maskKey(key) {
  if (!key || key.length < 8) return "(missing)";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Scan page + frames for captcha widgets (LinkedIn login / checkpoint). */
async function detectCaptcha(page) {
  const pageUrl = page.url();
  const frameUrls = page.frames().map((f) => {
    try {
      return f.url();
    } catch {
      return "";
    }
  });

  const dom = await page
    .evaluate(() => {
      const text = (document.body?.innerText || "").slice(0, 6000);
      const lower = text.toLowerCase();
      const pickSitekey = (sel) => {
        const el = document.querySelector(sel);
        return el?.getAttribute("data-sitekey") || el?.dataset?.sitekey || null;
      };
      const recaptchaEl = document.querySelector(".g-recaptcha, [data-sitekey]");
      const hcaptchaEl = document.querySelector(".h-captcha, [data-hcaptcha-sitekey]");
      const turnstileEl = document.querySelector("[data-sitekey].cf-turnstile, .cf-turnstile");
      const arkoseEl = document.querySelector(
        '[data-pkey], [data-public-key], #FunCaptcha, [class*="arkose"], [id*="arkose"]'
      );
      const recaptchaResponse = document.querySelector(
        '#g-recaptcha-response, textarea[name="g-recaptcha-response"]'
      );
      const fcToken = document.querySelector('input[name="fc-token"], #fc-token');
      const captchaImg = document.querySelector(
        'img[src*="captcha"], img[alt*="captcha" i], #captcha-internal img'
      );
      const iframes = [...document.querySelectorAll("iframe")].map((f) => ({
        src: (f.src || "").slice(0, 200),
        id: f.id || "",
      }));

      const isVisible = (el) => {
        if (!el || el.type === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8;
      };
      const pinCandidates = [
        ...document.querySelectorAll(
          'input[name="pin"], input[id*="pin" i], input[autocomplete="one-time-code"]'
        ),
      ].filter(isVisible);
      const hasRealPinField = pinCandidates.length > 0;
      const pin2faText =
        /enter the code|verification code we sent|6-digit code|two-step verification|authenticator app|enter your pin/i.test(
          lower
        );
      const securityNot2fa =
        /let's do a quick security check|unusual activity|verify it's you|security verification|puzzle/i.test(
          lower
        );

      return {
        textSample: text.slice(0, 280),
        pathname: location.pathname,
        hasRealPinField,
        pin2faText,
        securityNot2fa,
        hasPhoneVerify: /verify your phone|text a code|sms verification/i.test(lower),
        recaptchaSitekey:
          pickSitekey("[data-sitekey]") ||
          recaptchaEl?.getAttribute("data-sitekey") ||
          null,
        hcaptchaSitekey:
          document.querySelector("[data-hcaptcha-sitekey]")?.getAttribute(
            "data-hcaptcha-sitekey"
          ) || hcaptchaEl?.getAttribute("data-sitekey") || null,
        turnstileSitekey: turnstileEl?.getAttribute("data-sitekey") || null,
        funcaptchaPublicKey:
          arkoseEl?.getAttribute("data-pkey") ||
          arkoseEl?.getAttribute("data-public-key") ||
          document.querySelector("[data-pkey]")?.getAttribute("data-pkey") ||
          null,
        hasRecaptchaResponse: !!recaptchaResponse,
        hasFcToken: !!fcToken,
        hasCaptchaImg: !!captchaImg,
        iframes,
        isCheckpointUrl: /checkpoint|challenge|security/i.test(location.pathname),
      };
    })
    .catch(() => ({}));

  const framesJoined = frameUrls.join(" ");
  let type = "none";
  let confidence = "low";
  const details = { pageUrl, frameCount: frameUrls.length, pageText: dom.textSample };

  if (!dom.recaptchaSitekey) {
    details.sitekey =
      extractSitekeyFromFrames(frameUrls, "recaptcha") ||
      extractSitekeyFromFrames(
        (dom.iframes || []).map((f) => f.src),
        "recaptcha"
      ) ||
      null;
  } else {
    details.sitekey = dom.recaptchaSitekey;
  }

  // Captcha widgets first (login page often has hidden one-time-code fields — not 2FA)
  if (/arkoselabs|funcaptcha|fcapi/i.test(framesJoined) || dom.funcaptchaPublicKey) {
    type = "funcaptcha_arkose";
    details.publickey = dom.funcaptchaPublicKey || extractPublicKeyFromFrames(frameUrls);
    confidence = details.publickey ? "high" : "medium";
  } else if (/hcaptcha\.com/i.test(framesJoined) || dom.hcaptchaSitekey) {
    type = "hcaptcha";
    details.sitekey = dom.hcaptchaSitekey || extractSitekeyFromFrames(frameUrls, "hcaptcha");
    confidence = details.sitekey ? "high" : "medium";
  } else if (
    /recaptcha|google\.com\/recaptcha/i.test(framesJoined) ||
    dom.recaptchaSitekey ||
    details.sitekey ||
    (dom.securityNot2fa && dom.iframes?.some((f) => /recaptcha/i.test(f.src)))
  ) {
    type = /recaptcha\/enterprise|enterprise/i.test(framesJoined)
      ? "recaptcha_enterprise"
      : "recaptcha_v2";
    details.sitekey =
      extractAnchorSitekey(frameUrls) ||
      dom.recaptchaSitekey ||
      details.sitekey ||
      extractSitekeyFromFrames(frameUrls, "recaptcha");
    confidence = details.sitekey ? "high" : "medium";
  } else if (/challenges\.cloudflare\.com|turnstile/i.test(framesJoined) || dom.turnstileSitekey) {
    type = "cloudflare_turnstile";
    details.sitekey = dom.turnstileSitekey;
    confidence = details.sitekey ? "high" : "medium";
  } else if (dom.hasCaptchaImg) {
    type = "image_captcha";
    confidence = "medium";
  } else if (
    dom.isCheckpointUrl ||
    /checkpoint|security verification|captcha|puzzle/i.test(dom.textSample || "")
  ) {
    type = "linkedin_checkpoint_unknown";
    confidence = "medium";
  } else if (dom.iframes?.some((f) => /captcha/i.test(f.src))) {
    type = "iframe_captcha_unknown";
    details.iframeSrcs = dom.iframes.filter((f) => /captcha/i.test(f.src)).map((f) => f.src);
    confidence = "low";
  } else if (
    /6-digit code|verify your identity|regain access to your linkedin account/i.test(
      (dom.textSample || "").toLowerCase()
    ) &&
    dom.hasRealPinField
  ) {
    type = "linkedin_email_verification";
    confidence = "high";
  } else if (dom.hasPhoneVerify) {
    type = "linkedin_phone_verification";
    confidence = "high";
  } else if (
    dom.hasRealPinField &&
    dom.pin2faText &&
    !dom.securityNot2fa &&
    /checkpoint|challenge|verify/i.test(dom.pathname || "")
  ) {
    type = "linkedin_pin_2fa";
    confidence = "high";
  } else if (dom.securityNot2fa || dom.isCheckpointUrl) {
    type = "linkedin_security_check";
    confidence = "medium";
  }

  if (
    !details.sitekey &&
    page &&
    (type === "linkedin_security_check" ||
      type === "linkedin_checkpoint_unknown" ||
      type === "none")
  ) {
    for (const frame of page.frames()) {
      try {
        const sk = await frame.evaluate(() => {
          const el = document.querySelector(".g-recaptcha, [data-sitekey]");
          if (el) return el.getAttribute("data-sitekey");
          for (const f of document.querySelectorAll("iframe")) {
            const m = (f.src || "").match(/[?&]k=([^&]+)/i);
            if (m) return decodeURIComponent(m[1]);
          }
          return null;
        });
        if (sk) {
          details.sitekey = sk;
          type = /enterprise/i.test(framesJoined) ? "recaptcha_enterprise" : "recaptcha_v2";
          confidence = "high";
          break;
        }
      } catch {
        /* cross-origin frame */
      }
    }
  }

  const present = type !== "none";
  const solvable = isSolvableBy2Captcha(type);
  const real2fa = type === "linkedin_pin_2fa" || type === "linkedin_phone_verification";
  return {
    present,
    type,
    confidence,
    solvable,
    real2fa,
    details,
    dom,
    frameUrls: frameUrls.filter(Boolean),
  };
}

function isSolvableBy2Captcha(type) {
  return [
    "funcaptcha_arkose",
    "recaptcha_v2",
    "recaptcha_enterprise",
    "hcaptcha",
    "cloudflare_turnstile",
    "image_captcha",
    "linkedin_checkpoint_unknown",
    "iframe_captcha_unknown",
    "linkedin_security_check",
  ].includes(type);
}

function isReal2FA(type) {
  return (
    type === "linkedin_pin_2fa" ||
    type === "linkedin_phone_verification" ||
    type === "linkedin_email_verification"
  );
}

function extractPublicKeyFromFrames(frameUrls) {
  for (const u of frameUrls) {
    const m = u.match(/[?&]pkey=([^&]+)/i) || u.match(/public_key=([^&]+)/i);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

function extractSitekeyFromFrames(frameUrls, kind) {
  for (const u of frameUrls) {
    const m =
      u.match(/[?&]sitekey=([^&]+)/i) ||
      u.match(/[?&]k=([^&]+)/i) ||
      u.match(/[?&]render=([^&]+)/i);
    if (m) return decodeURIComponent(m[1]);
    if (kind === "hcaptcha" && /hcaptcha/.test(u)) {
      const k = u.match(/#([^&]+)/);
      if (k) return k[1];
    }
  }
  return null;
}

/** LinkedIn checkpoint: use anchor iframe key (not bframe challenge key). */
function extractAnchorSitekey(frameUrls) {
  for (const u of frameUrls) {
    if (!/recaptcha.*anchor/i.test(u) || /bframe/i.test(u)) continue;
    const m = u.match(/[?&]k=([^&]+)/i);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

function collectRecaptchaKeys(frameUrls, fallback) {
  const anchorKeys = [];
  const bframeKeys = [];
  for (const u of frameUrls) {
    const m = u.match(/[?&]k=([^&]+)/i);
    if (!m) continue;
    const k = decodeURIComponent(m[1]);
    if (/bframe/i.test(u)) bframeKeys.push(k);
    else if (/anchor/i.test(u)) anchorKeys.push(k);
  }

  const keys = [];
  const add = (k) => {
    if (k && !keys.includes(k)) keys.push(k);
  };

  // LinkedIn pairs anchor+bframe on the same key — that key is the one 2Captcha needs.
  for (const k of anchorKeys) {
    if (bframeKeys.includes(k)) add(k);
  }
  for (const k of bframeKeys) add(k);
  for (const k of anchorKeys) add(k);
  add(fallback);
  add(extractSitekeyFromFrames(frameUrls, "recaptcha"));
  return keys;
}

async function readRecaptchaDataS(page) {
  if (!page) return null;
  return page
    .evaluate(() => {
      const el = document.querySelector("[data-s]");
      if (el) return el.getAttribute("data-s");
      const html = document.documentElement.innerHTML;
      const m = html.match(/data-s="([^"]+)"/i);
      return m ? m[1] : null;
    })
    .catch(() => null);
}

function logCaptchaDetection(info) {
  console.log("  ══ Captcha detection ══");
  console.log(`  → Type: ${info.type} (confidence: ${info.confidence})`);
  console.log(`  → Page: ${(info.details.pageUrl || "").replace(/^https?:\/\//, "")}`);
  if (info.details.sitekey) {
    console.log(`  → Site key: ${String(info.details.sitekey).slice(0, 24)}…`);
  }
  if (info.details.publickey) {
    console.log(`  → Public key: ${String(info.details.publickey).slice(0, 24)}…`);
  }
  if (info.details.iframeSrcs?.length) {
    console.log(`  → Captcha iframes: ${info.details.iframeSrcs.length}`);
    for (const src of info.details.iframeSrcs.slice(0, 3)) {
      console.log(`     ${src.slice(0, 100)}`);
    }
  }
  const captchaFrames = (info.frameUrls || []).filter((u) =>
    /captcha|recaptcha|hcaptcha|arkose|turnstile|funcaptcha/i.test(u)
  );
  if (captchaFrames.length) {
    console.log(`  → Frames (${captchaFrames.length}):`);
    for (const u of captchaFrames.slice(0, 5)) {
      console.log(`     ${u.replace(/^https?:\/\//, "").slice(0, 110)}`);
    }
  }
  if (info.details.pageText) {
    console.log(`  → Page text: ${info.details.pageText.replace(/\s+/g, " ").slice(0, 120)}…`);
  }
  if (info.real2fa) {
    console.log("  → Account 2FA/PIN — 2Captcha cannot solve; complete in browser once.");
  } else if (info.type === "linkedin_security_check") {
    console.log(
      "  → LinkedIn security check (not your account 2FA) — bot will try 2Captcha if puzzle/captcha present."
    );
  }
  console.log("  ═══════════════════════");
}

async function submit2Captcha(params) {
  const key = apiKey();
  const body = new URLSearchParams({ key, ...params });
  const res = await fetch(API_IN, { method: "POST", body });
  const text = await res.text();
  if (!text.startsWith("OK|")) {
    throw new Error(`2Captcha submit failed: ${text}`);
  }
  return text.split("|")[1];
}

async function poll2Captcha(taskId, maxPolls = POLL_MAX) {
  const key = apiKey();
  for (let i = 0; i < maxPolls; i++) {
    await sleep(POLL_MS);
    const url = `${API_RES}?key=${encodeURIComponent(key)}&action=get&id=${encodeURIComponent(taskId)}`;
    const res = await fetch(url);
    const text = await res.text();
    if (text === "CAPCHA_NOT_READY") {
      if (i > 0 && i % 8 === 0) {
        console.log(`  → 2Captcha still solving… (${Math.round((i * POLL_MS) / 1000)}s)`);
      }
      continue;
    }
    if (text.startsWith("OK|")) return text.split("|")[1];
    throw new Error(`2Captcha poll failed: ${text}`);
  }
  throw new Error("2Captcha timeout waiting for solution");
}

async function solveRecaptchaViaApiV2(pageUrl, googlekey, enterprise, dataS) {
  const clientKey = apiKey();
  const taskType = enterprise
    ? "RecaptchaV2EnterpriseTaskProxyless"
    : "RecaptchaV2TaskProxyless";
  const task = {
    type: taskType,
    websiteURL: pageUrl,
    websiteKey: googlekey,
    isInvisible: false,
  };
  if (enterprise && dataS) {
    task.enterprisePayload = { s: dataS };
  }
  const body = { clientKey, task };
  const createRes = await fetch("https://api.2captcha.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const createJson = await createRes.json();
  if (createJson.errorId) {
    throw new Error(`2Captcha createTask: ${createJson.errorDescription || createJson.errorCode}`);
  }
  const taskId = createJson.taskId;
  console.log(`  → 2Captcha API v2 task: ${taskId} (${taskType})`);
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_MS);
    const res = await fetch("https://api.2captcha.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey, taskId }),
    });
    const json = await res.json();
    if (json.status === "processing") {
      if (i > 0 && i % 8 === 0) {
        console.log(`  → 2Captcha API v2 solving… (${Math.round((i * POLL_MS) / 1000)}s)`);
      }
      continue;
    }
    if (json.status === "ready" && json.solution?.gRecaptchaResponse) {
      return json.solution.gRecaptchaResponse;
    }
    throw new Error(`2Captcha getTaskResult: ${json.errorDescription || json.status}`);
  }
  throw new Error("2Captcha API v2 timeout");
}

async function solveRecaptchaWithRetries(pageUrl, page, info) {
  const frameUrls = info.frameUrls || [];
  const keys = collectRecaptchaKeys(frameUrls, info.details.sitekey);
  if (!keys.length && page) {
    const sk = await page
      .evaluate(() => {
        for (const f of document.querySelectorAll("iframe")) {
          if (/bframe/i.test(f.src || "")) continue;
          const m = (f.src || "").match(/[?&]k=([^&]+)/i);
          if (m) return decodeURIComponent(m[1]);
        }
        const el = document.querySelector("[data-sitekey]");
        return el?.getAttribute("data-sitekey") || null;
      })
      .catch(() => null);
    if (sk) keys.push(sk);
  }
  if (!keys.length) throw new Error("reCAPTCHA sitekey not found on page");

  const dataS = await readRecaptchaDataS(page);
  const isEnterprise = /recaptcha\/enterprise/i.test(frameUrls.join(" "));
  const variants = [];
  const addForKey = (googlekey, prefix) => {
    if (isEnterprise) {
      variants.push({
        label: `${prefix}-api-v2-enterprise`,
        googlekey,
        enterprise: true,
        apiV2: true,
      });
      variants.push({
        label: `${prefix}-inphp-enterprise`,
        googlekey,
        enterprise: true,
        apiV2: false,
      });
      return;
    }
    variants.push({ label: `${prefix}-api-v2`, googlekey, enterprise: false, apiV2: true });
    variants.push({ label: `${prefix}-inphp-v2`, googlekey, enterprise: false, apiV2: false });
  };
  keys.forEach((k, i) => addForKey(k, i === 0 ? "primary" : `key${i + 1}`));

  let lastErr = null;
  for (const v of variants) {
    try {
      console.log(
        `  → 2Captcha: ${v.label} key=${v.googlekey.slice(0, 18)}…${dataS ? " +data-s" : ""}`
      );
      if (v.apiV2) {
        const token = await solveRecaptchaViaApiV2(
          pageUrl,
          v.googlekey,
          v.enterprise,
          dataS
        );
        return { token, method: "userrecaptcha", solvedAs: v.label };
      }
      const params = {
        method: "userrecaptcha",
        googlekey: v.googlekey,
        pageurl: pageUrl,
      };
      if (v.enterprise) params.enterprise = "1";
      if (dataS) params["data-s"] = dataS;
      const taskId = await submit2Captcha(params);
      console.log(`  → 2Captcha task id: ${taskId}`);
      const token = await poll2Captcha(taskId, 35);
      return { token, method: "userrecaptcha", solvedAs: v.label };
    } catch (err) {
      lastErr = err;
      console.warn(`  → 2Captcha ${v.label} failed: ${err.message}`);
    }
  }
  throw lastErr || new Error("All reCAPTCHA solve attempts failed");
}

async function solve2Captcha(info, pageUrl, page) {
  const type = info.type;
  let taskId;
  let method;

  if (type === "recaptcha_v2" || type === "recaptcha_enterprise") {
    const result = await solveRecaptchaWithRetries(pageUrl, page, info);
    console.log(
      `  → 2Captcha solved (${result.solvedAs}), token length: ${result.token.length}`
    );
    return result;
  } else if (type === "hcaptcha") {
    const sitekey = info.details.sitekey;
    if (!sitekey) throw new Error("hCaptcha sitekey not found");
    method = "hcaptcha";
    console.log("  → 2Captcha: solving hcaptcha…");
    taskId = await submit2Captcha({ method: "hcaptcha", sitekey, pageurl: pageUrl });
  } else if (type === "funcaptcha_arkose") {
    const publickey = info.details.publickey;
    if (!publickey) throw new Error("FunCaptcha public key not found");
    method = "funcaptcha";
    console.log("  → 2Captcha: solving funcaptcha/arkose…");
    taskId = await submit2Captcha({
      method: "funcaptcha",
      publickey,
      pageurl: pageUrl,
    });
  } else if (type === "cloudflare_turnstile") {
    const sitekey = info.details.sitekey;
    if (!sitekey) throw new Error("Turnstile sitekey not found");
    method = "turnstile";
    console.log("  → 2Captcha: solving cloudflare turnstile…");
    taskId = await submit2Captcha({
      method: "turnstile",
      sitekey,
      pageurl: pageUrl,
    });
  } else if (type === "image_captcha") {
    method = "image";
    const base64 = await screenshotCaptchaBase64(page);
    if (!base64) throw new Error("Could not capture image captcha");
    console.log("  → 2Captcha: solving image captcha…");
    taskId = await submit2Captcha({
      method: "base64",
      body: base64,
      textinstructions: "Enter the characters from the image",
    });
  } else if (type === "linkedin_security_check" || type === "linkedin_checkpoint_unknown") {
    const publickey =
      info.details.publickey || extractPublicKeyFromFrames(info.frameUrls || []);
    if (publickey) {
      method = "funcaptcha";
      console.log("  → 2Captcha: security check → funcaptcha/arkose…");
      taskId = await submit2Captcha({
        method: "funcaptcha",
        publickey,
        pageurl: pageUrl,
      });
    } else if (info.details.sitekey) {
      method = "userrecaptcha";
      console.log("  → 2Captcha: security check → recaptcha…");
      taskId = await submit2Captcha({
        method: "userrecaptcha",
        googlekey: info.details.sitekey,
        pageurl: pageUrl,
      });
    } else {
      throw new Error(`Security check without solvable widget (type=${type})`);
    }
  } else {
    throw new Error(`Unsupported captcha type for 2Captcha: ${type}`);
  }

  console.log(`  → 2Captcha task id: ${taskId} (${method})`);
  const token = await poll2Captcha(taskId);
  console.log(`  → 2Captcha solved (${method}), token length: ${token.length}`);
  return { token, method };
}

async function screenshotCaptchaBase64(page) {
  if (!page) return null;
  try {
    const el = await page.$(
      'img[src*="captcha"], #captcha-internal img, .captcha img'
    );
    if (el) {
      const buf = await el.screenshot({ encoding: "base64" });
      return buf;
    }
    const buf = await page.screenshot({ encoding: "base64", fullPage: false });
    return buf;
  } catch {
    return null;
  }
}

async function applyCaptchaToken(page, info, token) {
  const type = info.type;
  const applied = await page.evaluate(
    (t, captchaType) => {
      const setVal = (sel, val) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
          el.value = val;
        } else {
          el.innerHTML = val;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };

      if (captchaType.startsWith("recaptcha")) {
        const fireCallback = (cb) => {
          if (typeof cb === "function") {
            cb(t);
            return true;
          }
          return false;
        };
        const walk = (obj, depth = 0) => {
          if (!obj || depth > 6) return null;
          if (typeof obj === "function") return obj;
          if (typeof obj !== "object") return null;
          for (const v of Object.values(obj)) {
            if (typeof v === "function") return v;
            const nested = walk(v, depth + 1);
            if (nested) return nested;
          }
          return null;
        };

        let touched = false;
        for (const sel of [
          "#g-recaptcha-response",
          'textarea[name="g-recaptcha-response"]',
          'textarea[id*="g-recaptcha-response"]',
        ]) {
          document.querySelectorAll(sel).forEach((el) => {
            el.value = t;
            el.innerHTML = t;
            el.style.display = "block";
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            touched = true;
          });
        }

        if (typeof window.grecaptcha !== "undefined") {
          try {
            if (typeof window.grecaptcha.enterprise?.execute === "function") {
              const cb = walk(window.___grecaptcha_cfg?.clients);
              if (cb && fireCallback(cb)) return "grecaptcha-enterprise-callback";
            }
            const clients = window.___grecaptcha_cfg?.clients || {};
            for (const id of Object.keys(clients)) {
              const cb = walk(clients[id]);
              if (cb && fireCallback(cb)) return "grecaptcha-callback";
            }
          } catch {
            /* ignore */
          }
        }
        if (touched) return "g-recaptcha-response";
      }

      if (captchaType === "hcaptcha") {
        if (setVal('[name="h-captcha-response"]', t)) return "h-captcha-response";
        if (setVal('[name="g-recaptcha-response"]', t)) return "hcaptcha-fallback";
      }

      if (captchaType === "funcaptcha_arkose") {
        if (setVal('input[name="fc-token"]', t)) return "fc-token";
        if (setVal("#fc-token", t)) return "fc-token-id";
        if (setVal("#verification-token", t)) return "verification-token";
      }

      if (captchaType === "cloudflare_turnstile") {
        if (setVal('[name="cf-turnstile-response"]', t)) return "cf-turnstile-response";
        const input = document.querySelector(
          'input[name="cf-turnstile-response"]'
        );
        if (input) {
          input.value = t;
          return "cf-turnstile-input";
        }
      }

      return null;
    },
    token,
    type
  );

  console.log(`  → Token injected: ${applied || "(callback/DOM fallback)"}`);
  await sleep(1500);
  return Boolean(applied);
}

function shortUrl(url) {
  return String(url || "")
    .replace(/^https?:\/\//, "")
    .slice(0, 120);
}

/** LinkedIn security captcha lives on /checkpoint/challenge/ (not login or /verify). */
function isChallengeCaptchaUrl(url) {
  return (
    /linkedin\.com\/checkpoint\/challenge\//i.test(url || "") &&
    !/checkpoint\/challenge\/verify/i.test(url || "")
  );
}

/** Wait until browser is on /checkpoint/challenge/ with reCAPTCHA loaded. */
async function waitForChallengeCaptchaPage(page, maxMs = 60_000) {
  const deadline = Date.now() + maxMs;
  let lastLog = 0;

  while (Date.now() < deadline) {
    let url = "";
    try {
      url = page.url();
    } catch {
      url = "";
    }

    if (/checkpoint\/challenge\/verify/i.test(url)) {
      if (Date.now() - lastLog > 5000) {
        console.log("  → On /challenge/verify (error page) — need back navigation first");
        lastLog = Date.now();
      }
    } else if (isChallengeCaptchaUrl(url)) {
      const hasWidget = await page
        .evaluate(() => {
          const text = (document.body?.innerText || "").toLowerCase();
          const hasRecaptchaFrame = [...document.querySelectorAll("iframe")].some(
            (f) => /recaptcha|google\.com\/recaptcha/i.test(f.src || "")
          );
          return (
            hasRecaptchaFrame ||
            /quick security check|i'm not a robot/.test(text)
          );
        })
        .catch(() => false);

      if (hasWidget) {
        console.log(`  → Captcha page ready: ${shortUrl(url)}`);
        return { ok: true, url };
      }
      if (Date.now() - lastLog > 5000) {
        console.log("  → On /challenge — waiting for reCAPTCHA widget…");
        lastLog = Date.now();
      }
    } else if (Date.now() - lastLog > 5000) {
      console.log(`  → Waiting for /checkpoint/challenge/ (now: ${shortUrl(url)})`);
      lastLog = Date.now();
    }

    await sleep(1500);
    await page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 4000 })
      .catch(() => null);
  }

  let finalUrl = "";
  try {
    finalUrl = page.url();
  } catch {
    finalUrl = "";
  }
  return { ok: false, reason: "challenge_url_timeout", url: finalUrl };
}

/** Wait for lazy captcha iframes on the challenge page. */
async function waitForCaptchaWidgets(page, maxMs = 20_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const info = await detectCaptcha(page);
    if (info.solvable && (info.details.sitekey || info.details.publickey)) {
      return info;
    }
    if (/recaptcha|hcaptcha|arkose|funcaptcha/i.test((info.frameUrls || []).join(" "))) {
      return info;
    }
    if (info.type === "linkedin_security_check" || /checkpoint/i.test(page.url() || "")) {
      await sleep(1200);
      continue;
    }
    await sleep(800);
  }
  return detectCaptcha(page);
}

async function trySolveLoginCaptcha(page, clickSignInFn, options = {}) {
  const requireChallenge = options.requireChallenge !== false;

  if (requireChallenge) {
    const ready = await waitForChallengeCaptchaPage(
      page,
      Number(process.env.CHALLENGE_URL_WAIT_MS || 60_000)
    );
    if (!ready.ok) {
      return {
        ok: false,
        reason: ready.reason || "no_challenge_url",
        url: ready.url,
      };
    }
  }

  let info = await waitForCaptchaWidgets(page);

  if (!info.present) {
    return { ok: false, reason: "no_captcha" };
  }

  if (
    (info.type === "linkedin_security_check" || info.type === "linkedin_checkpoint_unknown") &&
    info.details.sitekey
  ) {
    info.type = /enterprise/i.test((info.frameUrls || []).join(""))
      ? "recaptcha_enterprise"
      : "recaptcha_v2";
    info.solvable = true;
  }

  logCaptchaDetection(info);

  if (info.real2fa) {
    return { ok: false, reason: info.type, unsolvable: true };
  }

  if (info.type === "linkedin_checkpoint_unknown" || info.type === "iframe_captcha_unknown") {
    console.warn(
      "  → Captcha present but type unclear — check logs above; may need manual login once."
    );
    if (!solverEnabled()) {
      return { ok: false, reason: info.type, unsolvable: true };
    }
  }

  if (!solverEnabled()) {
    console.warn(
      `  → 2Captcha disabled or TWOCAPTCHA_API_KEY missing (key=${maskKey(apiKey())}).`
    );
    return { ok: false, reason: "no_api_key" };
  }

  console.log(`  → 2Captcha API key: ${maskKey(apiKey())}`);

  try {
    const pageUrl = page.url() || "https://www.linkedin.com/login";
    const injectType =
      info.type === "recaptcha_enterprise" || info.type === "recaptcha_v2"
        ? info.type
        : "recaptcha_v2";
    const solved = await solve2Captcha(info, pageUrl, page);
    await applyCaptchaToken(page, { ...info, type: injectType }, solved.token);
    await sleep(3000);

    if (typeof clickSignInFn === "function") {
      console.log("  → Submitting checkpoint after captcha token…");
      await clickSignInFn(page);
      await sleep(3000);
      await page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20_000 })
        .catch(() => null);
    }

    return { ok: true, type: info.type, method: solved.method, solvedAs: solved.solvedAs };
  } catch (err) {
    console.warn(`  → 2Captcha solve failed (${info.type}): ${err.message}`);
    return { ok: false, reason: info.type, error: err.message };
  }
}

module.exports = {
  detectCaptcha,
  logCaptchaDetection,
  isChallengeCaptchaUrl,
  waitForChallengeCaptchaPage,
  waitForCaptchaWidgets,
  trySolveLoginCaptcha,
  solverEnabled,
  isSolvableBy2Captcha,
  isReal2FA,
};
