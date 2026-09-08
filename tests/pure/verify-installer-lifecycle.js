"use strict";

const path = require("node:path");
const {
  PRODUCT_NAME,
  parseLifecycleArguments,
  stripCommandPath,
  stripDisplayIcon,
  installationFromRegistry,
  buildLifecyclePlan,
  evaluateInstalledState,
  evaluateCleanState,
} = require("../../scripts/lib/installer-lifecycle");

function fail(message) {
  throw new Error(message);
}

function runInstallerLifecycleChecks() {
  const parsed = parseLifecycleArguments(["artifacts/candidate", "--dry-run", "--evidence-dir", "artifacts/evidence"]);
  if (!parsed.dryRun || parsed.candidateDir !== "artifacts/candidate" || parsed.evidenceDir !== "artifacts/evidence") {
    fail(`Unexpected lifecycle arguments: ${JSON.stringify(parsed)}`);
  }

  const installDir = path.win32.join("C:\\Users\\runneradmin\\AppData\\Local", "Programs", PRODUCT_NAME);
  const executablePath = path.win32.join(installDir, `${PRODUCT_NAME}.exe`);
  const uninstallerPath = path.win32.join(installDir, `Uninstall ${PRODUCT_NAME}.exe`);
  const registryEntry = {
    displayName: `${PRODUCT_NAME} 2.0.0`,
    displayVersion: "2.0.0",
    displayIcon: `${executablePath},0`,
    quietUninstallString: `"${uninstallerPath}" /currentuser /S`,
  };
  if (stripCommandPath(registryEntry.quietUninstallString) !== uninstallerPath) fail("Expected quoted uninstall path parsing");
  if (stripDisplayIcon(registryEntry.displayIcon) !== executablePath) fail("Expected display icon index stripping");
  if (installationFromRegistry(registryEntry)?.installDir !== installDir) fail("Expected installation paths from registry values");

  const state = {
    localAppData: "C:\\Users\\runneradmin\\AppData\\Local",
    registryEntries: [registryEntry],
    installRegistryEntries: [{ key: "simlife-guid", installLocation: installDir, shortcutName: PRODUCT_NAME }],
    shortcuts: [{ kind: "desktop" }, { kind: "startMenu" }],
    existingPaths: [executablePath, uninstallerPath],
  };
  const installed = evaluateInstalledState(state, "2.0.0");
  if (!installed.ok) fail(`Expected complete installed footprint: ${JSON.stringify(installed.checks)}`);
  if (evaluateInstalledState({ ...state, shortcuts: [{ kind: "desktop" }] }, "2.0.0").ok) {
    fail("Expected a missing Start Menu shortcut to fail the installed footprint");
  }

  const clean = evaluateCleanState({
    registryEntries: [],
    installRegistryEntries: [],
    remainingRecordedRegistryKeys: [],
    shortcuts: [],
    existingPaths: [],
  }, installed);
  if (!clean.ok) fail(`Expected complete cleanup: ${JSON.stringify(clean.checks)}`);
  if (evaluateCleanState({
    registryEntries: [registryEntry],
    installRegistryEntries: [{ key: "simlife-guid", installLocation: installDir }],
    remainingRecordedRegistryKeys: ["HKCU:\\Software\\simlife-guid"],
    shortcuts: [],
    existingPaths: [installDir],
  }, installed).ok) {
    fail("Expected leftover registry/install directory state to fail cleanup");
  }

  const plan = buildLifecyclePlan({
    root: "C:\\repo",
    candidateDir: "artifacts\\candidate",
    evidenceDir: null,
    installerPath: "C:\\repo\\artifacts\\candidate\\SimLife-Hearthbyte-2.0.0-Setup.exe",
    environment: { CI: "true", GITHUB_ACTIONS: "true", SIMLIFE_INSTALLER_LIFECYCLE: "1" },
    platform: "win32",
  });
  if (!plan.hostEligible || !plan.currentUserOnly || plan.nonClaims.length < 5 || !plan.reportPath.endsWith("installer-lifecycle.json")) {
    fail(`Expected explicit lifecycle safety contract: ${JSON.stringify(plan)}`);
  }

  return { lifecycleHelperChecks: 12 };
}

module.exports = { runInstallerLifecycleChecks };
