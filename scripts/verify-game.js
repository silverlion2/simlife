"use strict";

function fail(message) {
  throw new Error(message);
}

async function main() {
  const scopeArg = process.argv.find(argument => argument.startsWith("--scope="));
  const scope = scopeArg ? scopeArg.split("=")[1] : "all";
  if (!["all", "pure", "electron"].includes(scope)) {
    fail(`Unknown verification scope: ${scope}`);
  }

  let resources = null;
  let runtime = null;

  if (scope !== "electron") {
    const { runPureChecks } = require("../tests/pure/verify-pure");
    resources = runPureChecks();
  }

  if (scope !== "pure") {
    runtime = process.env.SIMLIFE_SKIP_ELECTRON === "1"
      ? { skipped: true, reason: "SIMLIFE_SKIP_ELECTRON=1" }
      : await require("../tests/electron/verify-electron").checkElectronRuntime();
  }

  console.log(JSON.stringify({ ok: true, resources, runtime }, null, 2));
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
