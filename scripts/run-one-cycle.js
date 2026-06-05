#!/usr/bin/env node
require("../lib/bootstrap");
const { runOneCycle } = require("../src/index");

runOneCycle()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
