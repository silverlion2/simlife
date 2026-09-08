"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  PRODUCT_NAME,
  INSTALLER_PATTERN,
  parseLifecycleArguments,
  buildLifecyclePlan,
  installationFromRegistry,
  evaluateInstalledState,
  evaluateCleanState,
} = require("./lib/installer-lifecycle");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const parsed = parseLifecycleArguments(process.argv.slice(2));
const candidateDir = path.resolve(root, parsed.candidateDir);
const installers = fs.existsSync(candidateDir)
  ? fs.readdirSync(candidateDir).filter(file => INSTALLER_PATTERN.test(file))
  : [];

if (installers.length !== 1) {
  throw new Error(`expected exactly one Windows installer in ${candidateDir}, found: ${installers.join(", ") || "none"}`);
}

const plan = buildLifecyclePlan({
  root,
  candidateDir: parsed.candidateDir,
  evidenceDir: parsed.evidenceDir,
  installerPath: path.join(candidateDir, installers[0]),
  environment: process.env,
});

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeout || 180000,
    env: options.env || process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} exited ${result.status}: ${(result.stderr || result.stdout || "no output").trim()}`);
  }
  return { ok: true, exitCode: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function getAuthenticodeState(filePath) {
  const escapedPath = filePath.replace(/'/g, "''");
  const powershell = String.raw`
$signatures = @(Get-AuthenticodeSignature -LiteralPath '${escapedPath}')
$signature = if ($signatures.Count -eq 1) { $signatures[0] } else { $null }
$status = if ($signature -and -not [string]::IsNullOrWhiteSpace([string]$signature.Status)) { [string]$signature.Status } else { 'Unknown' }
[pscustomobject]@{
  measurementAvailable = [bool]($signature -and $status -ne 'Unknown')
  returnedSignatures = $signatures.Count
  status = $status
  statusMessage = if ($signature) { [string]$signature.StatusMessage } else { 'Get-AuthenticodeSignature returned no result' }
  signerSubject = if ($signature.SignerCertificate) { [string]$signature.SignerCertificate.Subject } else { $null }
} | ConvertTo-Json -Compress
`;
  return JSON.parse(run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", powershell], { timeout: 30000 }).stdout);
}

function queryWindowsState(extraPaths = [], recordedRegistryKeys = []) {
  const powerShellPaths = extraPaths.map(value => `'${String(value).replace(/'/g, "''")}'`).join(",");
  const powerShellRegistryKeys = recordedRegistryKeys.map(value => `'${String(value).replace(/'/g, "''")}'`).join(",");
  const powershell = String.raw`
$ErrorActionPreference = 'Stop'
$productName = '${PRODUCT_NAME.replace(/'/g, "''")}'
$uninstallDisplayName = '${`${PRODUCT_NAME} ${packageJson.version}`.replace(/'/g, "''")}'
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
$registryRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$installRegistryRoot = 'HKCU:\Software'
$entries = @()
if (Test-Path -LiteralPath $registryRoot) {
  $entries = @(Get-ChildItem -LiteralPath $registryRoot | ForEach-Object {
    $item = Get-ItemProperty -LiteralPath $_.PSPath
    if ($item.DisplayName -eq $productName -or $item.DisplayName -eq $uninstallDisplayName) {
      [pscustomobject]@{
        key = $_.PSChildName
        displayName = [string]$item.DisplayName
        displayVersion = [string]$item.DisplayVersion
        displayIcon = [string]$item.DisplayIcon
        uninstallString = [string]$item.UninstallString
        quietUninstallString = [string]$item.QuietUninstallString
      }
    }
  })
}
$installEntries = @(Get-ChildItem -LiteralPath $installRegistryRoot | ForEach-Object {
  $item = Get-ItemProperty -LiteralPath $_.PSPath
  if ($item.ShortcutName -eq $productName) {
    [pscustomobject]@{
      key = $_.PSChildName
      installLocation = [string]$item.InstallLocation
      shortcutName = [string]$item.ShortcutName
    }
  }
})
$shortcutSpecs = @(
  [pscustomobject]@{ kind = 'desktop'; path = (Join-Path $desktop ($productName + '.lnk')) },
  [pscustomobject]@{ kind = 'startMenu'; path = (Join-Path $programs ($productName + '.lnk')) }
)
$shortcuts = @($shortcutSpecs | Where-Object { Test-Path -LiteralPath $_.path })
$probePaths = @(${powerShellPaths})
$existingPaths = @($probePaths | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
$recordedRegistryKeys = @(${powerShellRegistryKeys})
$remainingRecordedRegistryKeys = @($recordedRegistryKeys | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
[pscustomobject]@{
  localAppData = [Environment]::GetFolderPath('LocalApplicationData')
  registryEntries = $entries
  installRegistryEntries = $installEntries
  shortcuts = $shortcuts
  existingPaths = $existingPaths
  remainingRecordedRegistryKeys = $remainingRecordedRegistryKeys
} | ConvertTo-Json -Depth 6 -Compress
`;
  const result = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", powershell], { timeout: 30000 });
  return JSON.parse(result.stdout);
}

function writeReport(report) {
  fs.mkdirSync(plan.evidenceDir, { recursive: true });
  fs.writeFileSync(plan.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (parsed.dryRun) {
  process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, plan }, null, 2)}\n`);
  process.exit(0);
}

if (!plan.hostEligible) {
  throw new Error("installed lifecycle verification requires CI=true, GITHUB_ACTIONS=true, and SIMLIFE_INSTALLER_LIFECYCLE=1 on Windows; use --dry-run elsewhere");
}

const authenticode = getAuthenticodeState(plan.installerPath);
/** @type {any} */
const report = {
  schemaVersion: 1,
  status: "running",
  startedAt: new Date().toISOString(),
  plan,
  candidate: {
    version: packageJson.version,
    installer: path.basename(plan.installerPath),
    installerBytes: fs.statSync(plan.installerPath).size,
    installerSha256: sha256(plan.installerPath),
    authenticode,
    signingGateSatisfied: authenticode.measurementAvailable === true && authenticode.status === "Valid",
  },
  stages: {},
  rollback: {
    procedure: "silently uninstall the current candidate and verify the current-user install footprint is removed",
    previousArtifactInstallAttempted: false,
    productionRollbackClaim: false,
  },
};
/** @type {(ReturnType<typeof evaluateInstalledState> & { recoveredAfterFailure?: boolean }) | null} */
let installedState = null;
/** @type {Error | null} */
let failure = null;
let installAttempted = false;

try {
  const initialState = queryWindowsState();
  const defaultInstallDirs = [
    path.join(initialState.localAppData, "Programs", PRODUCT_NAME),
    path.join(initialState.localAppData, "Programs", packageJson.name),
  ];
  const before = queryWindowsState(defaultInstallDirs);
  report.stages.preflight = {
    ok: before.registryEntries.length === 0
      && before.installRegistryEntries.length === 0
      && before.shortcuts.length === 0
      && before.existingPaths.length === 0,
    state: before,
  };
  if (!report.stages.preflight.ok) throw new Error("refusing to overwrite a pre-existing SimLife installation or shortcut on the runner");
  writeReport(report);

  installAttempted = true;
  report.stages.install = run(plan.installerPath, ["/S", "/currentuser"], { timeout: 300000 });
  const firstState = queryWindowsState();
  const registryEntry = firstState.registryEntries[0];
  const discoveredInstallation = installationFromRegistry(registryEntry);
  const state = queryWindowsState([
    discoveredInstallation?.installDir,
    discoveredInstallation?.executablePath,
    discoveredInstallation?.uninstallerPath,
  ].filter(Boolean));
  installedState = evaluateInstalledState(state, packageJson.version);
  report.stages.installedFootprint = installedState;
  if (!installedState.ok || !installedState.installation?.executablePath) {
    throw new Error(`installed footprint verification failed: ${JSON.stringify(installedState.checks)}`);
  }
  writeReport(report);

  const runtime = run(process.execPath, [
    path.join(root, "scripts", "verify-packaged-runtime.js"),
    parsed.candidateDir,
    "--executable", installedState.installation.executablePath,
    "--screenshot", plan.runtimeScreenshotPath,
    "--report", plan.runtimeReportPath,
  ], { timeout: 300000 });
  report.stages.installedRuntime = {
    ok: true,
    exitCode: runtime.exitCode,
    reportPath: plan.runtimeReportPath,
    screenshotPath: plan.runtimeScreenshotPath,
  };
  writeReport(report);
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
  report.failure = String(error.stack || error);
} finally {
  if (!installedState) {
    try {
      const recoveryState = queryWindowsState();
      const recoveryEntry = recoveryState.registryEntries[0];
      if (recoveryEntry) {
        const recoveryInstallation = installationFromRegistry(recoveryEntry);
        const probedRecoveryState = queryWindowsState([
          recoveryInstallation?.installDir,
          recoveryInstallation?.executablePath,
          recoveryInstallation?.uninstallerPath,
        ].filter(Boolean));
        installedState = {
          ...evaluateInstalledState(probedRecoveryState, packageJson.version),
          recoveredAfterFailure: true,
        };
      }
    } catch (error) {
      report.cleanupProbeFailure = String(error.stack || error);
      failure ||= error instanceof Error ? error : new Error(String(error));
    }
  }
  if (installedState?.installation?.uninstallerPath && fs.existsSync(installedState.installation.uninstallerPath)) {
    try {
      report.stages.uninstall = run(installedState.installation.uninstallerPath, ["/currentuser", "/S"], { timeout: 300000 });
    } catch (error) {
      report.stages.uninstall = { ok: false, error: String(error.stack || error) };
      failure ||= error instanceof Error ? error : new Error(String(error));
    }
  } else {
    report.stages.uninstall = { ok: !installedState, skipped: true, reason: "no test-owned installed uninstaller was discovered" };
  }

  if (installedState) {
    const recordedRegistryKeys = [
      installedState.entry?.key ? `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${installedState.entry.key}` : null,
      installedState.installRegistryEntry?.key ? `HKCU:\\Software\\${installedState.installRegistryEntry.key}` : null,
    ].filter(Boolean);
    let cleanupState = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      cleanupState = queryWindowsState([
        installedState.installation?.installDir,
        installedState.installation?.executablePath,
        installedState.installation?.uninstallerPath,
      ].filter(Boolean), recordedRegistryKeys);
      report.stages.cleanup = evaluateCleanState(cleanupState, installedState);
      if (report.stages.cleanup.ok) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
    report.rollback.cleanupVerified = Boolean(report.stages.cleanup?.ok);
    if (!report.stages.cleanup?.ok) failure ||= new Error(`post-uninstall cleanup verification failed: ${JSON.stringify(report.stages.cleanup?.checks)}`);
  } else {
    report.rollback.cleanupVerified = null;
    report.rollback.cleanupReason = installAttempted
      ? "installation was attempted but no test-owned footprint was discoverable; the lifecycle remains failed"
      : "installation was not attempted because preflight did not establish a clean runner";
    if (installAttempted) failure ||= new Error(report.rollback.cleanupReason);
  }

  report.finishedAt = new Date().toISOString();
  report.status = failure ? "failed" : "passed";
  report.ok = !failure;
  writeReport(report);
}

if (failure) {
  process.stderr.write(`${failure.stack || failure}\nLifecycle evidence: ${plan.reportPath}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
