const fs = require("fs");
const path = require("path");

const DEFAULT_GROUP_KEYS = [
  "group_url",
  "group url",
  "group link",
  "group",
  "link",
  "url",
  "linkedin group",
];
const DEFAULT_POST_KEYS = [
  "post",
  "post content",
  "content",
  "message",
  "text",
  "caption",
  "body",
];
const DEFAULT_STATUS_KEYS = ["status", "done", "posted"];

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (ch === "\r") i++;
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => String(c).trim()));
}

function pickColumn(headers, candidates, fallbackIndex = -1) {
  const normalized = headers.map(normalizeHeader);
  for (const key of candidates) {
    const idx = normalized.indexOf(key);
    if (idx >= 0) return idx;
  }
  return fallbackIndex;
}

function findHeaderRowIndex(table) {
  for (let i = 0; i < Math.min(table.length, 20); i++) {
    const normalized = table[i].map(normalizeHeader);
    if (normalized.includes("link") || normalized.includes("group name")) {
      return i;
    }
  }
  return 0;
}

function findLinkColumnIndex(rows, startIdx) {
  for (const row of rows.slice(startIdx, startIdx + 30)) {
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || "").trim();
      if (val.includes("linkedin.com/groups")) return c;
    }
  }
  return -1;
}

function rowsToTasks(table) {
  if (!table.length) return [];

  const headerIdx = findHeaderRowIndex(table);
  const headers = table[headerIdx];
  const dataRows = table.slice(headerIdx + 1);

  let groupIdx = pickColumn(headers, DEFAULT_GROUP_KEYS, -1);
  if (groupIdx < 0) {
    groupIdx = findLinkColumnIndex(dataRows, 0);
  }
  if (groupIdx < 0) groupIdx = pickColumn(headers, ["link"], 3);

  const postIdx = pickColumn(headers, DEFAULT_POST_KEYS, -1);
  const statusIdx = pickColumn(
    headers,
    [...DEFAULT_STATUS_KEYS, "actively posting"],
    -1
  );

  const skipStatuses = new Set(
    (process.env.SHEET_SKIP_STATUSES || "done,posted,completed,skip")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  return dataRows.flatMap((row, i) => {
    const groupUrl = String(row[groupIdx] || "").trim();
    const postContent = postIdx >= 0 ? String(row[postIdx] || "").trim() : "";
    const status =
      statusIdx >= 0 ? String(row[statusIdx] || "").trim().toLowerCase() : "";

    if (!groupUrl || !groupUrl.includes("linkedin.com")) return [];
    if (status && skipStatuses.has(status)) return [];

    return [
      {
        rowNumber: headerIdx + i + 2,
        groupName:
          pickColumn(headers, ["group name", "group"], -1) >= 0
            ? String(row[pickColumn(headers, ["group name", "group"], -1)] || "").trim()
            : "",
        groupUrl,
        postContent,
        status,
      },
    ];
  });
}

function sheetCsvUrl() {
  const { GOOGLE_SHEET_ID, GOOGLE_SHEET_GID } = require("./hardcoded-config");

  if (process.env.GOOGLE_SHEET_CSV_URL) {
    return process.env.GOOGLE_SHEET_CSV_URL;
  }

  const sheetId = process.env.GOOGLE_SHEET_ID || GOOGLE_SHEET_ID;
  if (!sheetId) return null;

  const gid = process.env.GOOGLE_SHEET_GID || GOOGLE_SHEET_GID || "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function formatError(err, context = {}) {
  const lines = [`\n--- Sheet error ---`];
  if (context.url) lines.push(`URL: ${context.url}`);
  if (context.status) lines.push(`HTTP status: ${context.status}`);
  lines.push(`Message: ${err.message}`);
  if (err.code) lines.push(`Code: ${err.code}`);
  if (err.errno) lines.push(`Errno: ${err.errno}`);
  if (err.cause) {
    lines.push(`Cause: ${err.cause.message || err.cause}`);
    if (err.cause.code) lines.push(`Cause code: ${err.cause.code}`);
  }
  if (err.stack) lines.push(`Stack:\n${err.stack}`);
  lines.push(`---\n`);
  return lines.join("\n");
}

function fetchWithHttps(url) {
  const https = require("https");
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "linkedIn-bot" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchWithHttps(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, text: data }));
    });
    request.on("error", reject);
    request.setTimeout(30_000, () => {
      request.destroy();
      reject(new Error("HTTPS request timed out after 30s"));
    });
  });
}

async function fetchSheetCsv() {
  const url = sheetCsvUrl();
  if (!url) {
    throw new Error(
      "Set GOOGLE_SHEET_ID (and optional GOOGLE_SHEET_GID) or GOOGLE_SHEET_CSV_URL in .env"
    );
  }

  console.log(`Fetching sheet CSV:\n  ${url}`);

  let res;
  let text;

  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "linkedIn-bot" },
    });
    text = await res.text();
  } catch (fetchErr) {
    console.warn(`fetch() failed (${fetchErr.message}), trying https module...`);
    try {
      const fallback = await fetchWithHttps(url);
      res = { ok: fallback.status >= 200 && fallback.status < 300, status: fallback.status };
      text = fallback.text;
    } catch (httpsErr) {
      const wrapped = new Error("Failed to download Google Sheet CSV");
      wrapped.cause = fetchErr;
      console.error(formatError(wrapped, { url }));
      console.error(formatError(httpsErr, { url }));
      throw wrapped;
    }
  }

  console.log(`Response: HTTP ${res.status}`);

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Sheet returned HTTP ${res.status} (not accessible). ` +
        'Share the sheet: Share → General access → "Anyone with the link" → Viewer.'
    );
  }

  if (
    !res.ok ||
    text.trimStart().startsWith("<!DOCTYPE") ||
    text.includes("<html")
  ) {
    const preview = text.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `Could not read sheet (HTTP ${res.status}). ` +
        'Share as "Anyone with the link" → Viewer. ' +
        `Response preview: ${preview}`
    );
  }

  return text;
}

function getServiceAccountEmail(credPath) {
  try {
    const json = JSON.parse(fs.readFileSync(credPath, "utf8"));
    return json.client_email || null;
  } catch {
    return null;
  }
}

async function readSheetFromApi() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!credPath || !sheetId) {
    throw new Error(
      "For private sheets set GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_SHEET_ID in .env"
    );
  }

  const resolvedPath = path.isAbsolute(credPath)
    ? credPath
    : path.join(process.cwd(), credPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Credentials file not found: ${resolvedPath}\n` +
        "See docs/PRIVATE-SHEET-SETUP.txt for how to create it."
    );
  }

  let google;
  try {
    ({ google } = require("googleapis"));
  } catch {
    throw new Error("Run: npm install googleapis");
  }

  const serviceEmail = getServiceAccountEmail(resolvedPath);
  console.log(
    `Reading private sheet via API (sheet: ${sheetId}, tab: ${process.env.GOOGLE_SHEET_RANGE || "Sheet1"})`
  );
  if (serviceEmail) {
    console.log(`Service account: ${serviceEmail}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const range = process.env.GOOGLE_SHEET_RANGE || "Sheet1";

  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });
    return rowsToTasks(data.values || []);
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes("403") || msg.includes("permission") || msg.includes("PERMISSION_DENIED")) {
      throw new Error(
        "Sheet API: permission denied.\n" +
          `Share your private sheet with this email as Viewer (or Editor):\n` +
          `  ${serviceEmail || "(open credentials.json and copy client_email)"}\n` +
          "Google Sheet → Share → Add people → paste email → Viewer → Send"
      );
    }
    if (msg.includes("404") || msg.includes("not found")) {
      throw new Error(
        `Sheet or tab not found. Check GOOGLE_SHEET_ID and GOOGLE_SHEET_RANGE (current: "${range}").`
      );
    }
    throw err;
  }
}

async function loadTasksFromSheet() {
  const useServiceAccount =
    process.env.GOOGLE_USE_SERVICE_ACCOUNT === "true" &&
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (useServiceAccount) {
    return readSheetFromApi();
  }

  console.log("Reading public sheet (CSV export)...");
  const csv = await fetchSheetCsv();
  const table = parseCsv(csv);
  return rowsToTasks(table);
}

module.exports = {
  loadTasksFromSheet,
  parseCsv,
  rowsToTasks,
  formatError,
  sheetCsvUrl,
};
