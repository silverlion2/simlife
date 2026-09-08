"use strict";

const path = require("node:path");

const PRODUCT_NAME = "SimLife Hearthbyte Edition";
const INSTALLED_EXE_NAME = `${PRODUCT_NAME}.exe`;
const INSTALLER_PATTERN = /^SimLife-Hearthbyte-.*-Setup\.exe$/i;

function optionValue(argumentsList, optionName) {
  const index = argumentsList.indexOf(optionName);
  if (index === -1) return null;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${optionName} requires a value`);
  return value;
}

function parseLifecycleArguments(argumentsList) {
  const positional = argumentsList.filter((argument, index) => (
    !argument.startsWith("--")
    && !["--evidence-dir"].includes(argumentsList[index - 1])
  ));
  return {
    candidateDir: positional[0] || "dist",
    evidenceDir: optionValue(argumentsList, "--evidence-dir"),
    dryRun: argumentsList.includes("--dry-run"),
  };
}

function stripCommandPath(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const quoted = trimmed.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  const executable = trimmed.match(/^(.+?\.exe)(?:\s|$)/i);
  return executable ? executable[1] : null;
}

function stripDisplayIcon(value) {
  if (typeof value !== "string") return null;
  return value.trim().replace(/,\s*-?\d+$/, "").replace(/^"|"$/g, "");
}

function installationFromRegistry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const displayIcon = stripDisplayIcon(entry.displayIcon);
  const uninstaller = stripCommandPath(entry.quietUninstallString || entry.uninstallString);
  const executablePath = displayIcon && path.win32.basename(displayIcon).toLowerCase() === INSTALLED_EXE_NAME.toLowerCase()
    ? displayIcon
    : (uninstaller ? path.win32.join(path.win32.dirname(uninstaller), INSTALLED_EXE_NAME) : null);
  return {
    executablePath,
    installDir: executablePath ? path.win32.dirname(executablePath) : null,
    uninstallerPath: uninstaller,
  };
}

function buildLifecyclePlan({ root, candidateDir, evidenceDir, installerPath, environment, platform = process.platform }) {
  const resolvedCandidate = path.resolve(root, candidateDir);
  const resolvedEvidence = path.resolve(root, evidenceDir || path.join(candidateDir, "lifecycle-evidence"));
  return {
    schemaVersion: 1,
    productName: PRODUCT_NAME,
    candidateDir: resolvedCandidate,
    installerPath: path.resolve(installerPath),
    evidenceDir: resolvedEvidence,
    reportPath: path.join(resolvedEvidence, "installer-lifecycle.json"),
    runtimeReportPath: path.join(resolvedEvidence, "installed-runtime.json"),
    runtimeScreenshotPath: path.join(resolvedEvidence, "installed-runtime-smoke.png"),
    currentUserOnly: true,
    requiredHost: "GitHub Actions windows-latest",
    hostEligible: platform === "win32"
      && environment.GITHUB_ACTIONS === "true"
      && environment.CI === "true"
      && environment.SIMLIFE_INSTALLER_LIFECYCLE === "1",
    mutations: [
      "silent current-user install of the candidate",
      "launch of the installed executable with an isolated temporary profile",
      "silent uninstall of the candidate",
    ],
    nonClaims: [
      "Authenticode signing",
      "license ownership",
      "production smoke testing",
      "public release",
      "installation of a previous rollback artifact",
    ],
  };
}

function evaluateInstalledState(state, expectedVersion) {
  const registryEntries = Array.isArray(state?.registryEntries) ? state.registryEntries : [];
  const installRegistryEntries = Array.isArray(state?.installRegistryEntries) ? state.installRegistryEntries : [];
  const shortcuts = Array.isArray(state?.shortcuts) ? state.shortcuts : [];
  const entry = registryEntries.find(candidate => (
    candidate.displayName === PRODUCT_NAME || candidate.displayName === `${PRODUCT_NAME} ${expectedVersion}`
  )) || null;
  const installation = installationFromRegistry(entry);
  const checks = {
    oneCurrentUserRegistryEntry: registryEntries.length === 1,
    oneInstallMetadataEntry: installRegistryEntries.length === 1,
    versionMatches: Boolean(entry && entry.displayVersion === expectedVersion),
    executablePresent: Boolean(installation?.executablePath && state.existingPaths?.includes(installation.executablePath)),
    uninstallerPresent: Boolean(installation?.uninstallerPath && state.existingPaths?.includes(installation.uninstallerPath)),
    desktopShortcutPresent: shortcuts.some(shortcut => shortcut.kind === "desktop"),
    startMenuShortcutPresent: shortcuts.some(shortcut => shortcut.kind === "startMenu"),
    currentUserInstallLocation: Boolean(
      installation?.installDir
      && state.localAppData
      && path.win32.resolve(installation.installDir).toLowerCase().startsWith(`${path.win32.resolve(state.localAppData).toLowerCase()}${path.win32.sep}`)
    ),
    installMetadataLocationMatches: Boolean(
      installation?.installDir
      && installRegistryEntries[0]?.installLocation
      && path.win32.resolve(installRegistryEntries[0].installLocation).toLowerCase() === path.win32.resolve(installation.installDir).toLowerCase()
    ),
  };
  return { ok: Object.values(checks).every(Boolean), checks, entry, installRegistryEntry: installRegistryEntries[0] || null, installation };
}

function evaluateCleanState(state, installedState) {
  const installDir = installedState?.installation?.installDir;
  const checks = {
    registryRemoved: (state?.registryEntries || []).length === 0,
    installMetadataRemoved: (state?.installRegistryEntries || []).length === 0,
    recordedRegistryKeysRemoved: (state?.remainingRecordedRegistryKeys || []).length === 0,
    shortcutsRemoved: (state?.shortcuts || []).length === 0,
    installDirectoryRemoved: !installDir || !(state?.existingPaths || []).includes(installDir),
    executableRemoved: !installedState?.installation?.executablePath
      || !(state?.existingPaths || []).includes(installedState.installation.executablePath),
    uninstallerRemoved: !installedState?.installation?.uninstallerPath
      || !(state?.existingPaths || []).includes(installedState.installation.uninstallerPath),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

module.exports = {
  PRODUCT_NAME,
  INSTALLED_EXE_NAME,
  INSTALLER_PATTERN,
  parseLifecycleArguments,
  stripCommandPath,
  stripDisplayIcon,
  installationFromRegistry,
  buildLifecyclePlan,
  evaluateInstalledState,
  evaluateCleanState,
};
