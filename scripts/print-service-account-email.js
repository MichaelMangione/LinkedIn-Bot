#!/usr/bin/env node
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS=./credentials.json in .env");
  process.exit(1);
}

const resolved = path.isAbsolute(credPath)
  ? credPath
  : path.join(process.cwd(), credPath);

if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`);
  console.error("Follow docs/PRIVATE-SHEET-SETUP.txt");
  process.exit(1);
}

const json = JSON.parse(fs.readFileSync(resolved, "utf8"));
console.log("\nShare your private Google Sheet with this email (Viewer):\n");
console.log(`  ${json.client_email}\n`);
console.log("Sheet → Share → Add people → paste → Viewer → Share\n");
