"use strict";

async function main() {
  const runtime = process.env.SIMLIFE_SKIP_ELECTRON === "1"
    ? { skipped: true, reason: "SIMLIFE_SKIP_ELECTRON=1" }
    : await require("./verify-electron").checkElectronRuntime();
  console.log(JSON.stringify({ ok: true, resources: null, runtime }, null, 2));
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
