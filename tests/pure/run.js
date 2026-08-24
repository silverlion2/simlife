"use strict";

const { runPureChecks } = require("./verify-pure");

try {
  const resources = runPureChecks();
  console.log(JSON.stringify({ ok: true, resources, runtime: null }, null, 2));
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
