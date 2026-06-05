#!/usr/bin/env node
require("dotenv").config();
const { loadTasksFromSheet, sheetCsvUrl, formatError } = require("../lib/sheets");

(async () => {
  try {
    console.log("Sheet URL:", sheetCsvUrl());
    const tasks = await loadTasksFromSheet();
    console.log(`OK — ${tasks.length} task(s):`);
    console.log(JSON.stringify(tasks, null, 2));
  } catch (err) {
    console.error(formatError(err, { url: sheetCsvUrl() }));
    process.exit(1);
  }
})();
