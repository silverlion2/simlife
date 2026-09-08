"use strict";

const { runPureChecks } = require("./verify-pure");
const { runInstallerLifecycleChecks } = require("./verify-installer-lifecycle");

try {
  const resources = runPureChecks();
  const installerLifecycle = runInstallerLifecycleChecks();
  console.log(JSON.stringify({ ok: true, resources, installerLifecycle, runtime: null }, null, 2));
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
