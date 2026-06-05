/**
 * Real mouse moves + clicks via CDP (trusted events), not DOM .click().
 * Helps LinkedIn treat interactions as user-driven vs headless automation.
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function humanClicksEnabled() {
  return process.env.CHROME_HUMAN_CLICKS !== "false";
}

function getLastMouse(page) {
  if (!page.__lastMouse) {
    page.__lastMouse = {
      x: randomBetween(120, 480),
      y: randomBetween(120, 360),
    };
  }
  return page.__lastMouse;
}

async function humanMove(page, x, y) {
  const from = getLastMouse(page);
  const steps = Math.floor(randomBetween(10, 22));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const cx = from.x + (x - from.x) * ease + randomBetween(-1.5, 1.5);
    const cy = from.y + (y - from.y) * ease + randomBetween(-1.5, 1.5);
    await page.mouse.move(cx, cy);
    await sleep(randomBetween(6, 22));
  }
  page.__lastMouse = { x, y };
}

async function resolveHandle(page, target) {
  if (!target) return null;
  if (typeof target === "string") return page.$(target);
  if (typeof target.click === "function") return target;
  return null;
}

async function humanClick(page, target, options = {}) {
  const { button = "left", clickCount = 1 } = options;
  const el = await resolveHandle(page, target);
  if (!el) return { ok: false, reason: "element_not_found" };

  try {
    await el.evaluate((node) =>
      node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })
    );
  } catch {
    /* detached */
  }

  await sleep(randomBetween(100, 280));

  let box;
  try {
    box = await el.boundingBox();
  } catch {
    return { ok: false, reason: "no_bounding_box" };
  }
  if (!box || box.width < 2 || box.height < 2) {
    return { ok: false, reason: "no_bounding_box" };
  }

  const x = box.x + box.width * randomBetween(0.28, 0.72);
  const y = box.y + box.height * randomBetween(0.32, 0.68);

  await humanMove(page, x, y);
  await sleep(randomBetween(60, 180));

  if (clickCount > 1) {
    await page.mouse.click(x, y, {
      button,
      clickCount,
      delay: randomBetween(70, 130),
    });
  } else {
    await page.mouse.down({ button });
    await sleep(randomBetween(45, 110));
    await page.mouse.up({ button });
  }

  return { ok: true, x, y, method: "human-mouse" };
}

async function humanClickOrFallback(page, target, options = {}) {
  if (!humanClicksEnabled()) {
    const el = await resolveHandle(page, target);
    if (!el) return { ok: false, reason: "element_not_found" };
    await el.click(options);
    return { ok: true, method: "puppeteer-click" };
  }
  const result = await humanClick(page, target, options);
  if (result.ok) return result;
  const el = await resolveHandle(page, target);
  if (!el) return result;
  await el.click(options);
  return { ok: true, method: "puppeteer-click-fallback" };
}

async function humanType(page, text, options = {}) {
  const baseDelay = options.delay ?? 42;
  for (const ch of text) {
    await page.keyboard.sendCharacter(ch);
    await sleep(randomBetween(baseDelay * 0.55, baseDelay * 1.45));
  }
}

module.exports = {
  humanClicksEnabled,
  humanClick,
  humanClickOrFallback,
  humanMove,
  humanType,
  randomBetween,
  sleep,
};
