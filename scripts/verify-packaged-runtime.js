"use strict";

const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const candidateArgument = process.argv.slice(2).find(argument => !argument.startsWith("--")) || "dist";
const softwareRendering = process.argv.includes("--software-rendering") || process.env.SIMLIFE_PACKAGED_SOFTWARE === "1";
const candidateDir = path.resolve(root, candidateArgument);
const executablePath = path.join(candidateDir, "win-unpacked", "SimLife Hearthbyte Edition.exe");
const screenshotPath = path.join(
  candidateDir,
  softwareRendering ? "packaged-runtime-smoke-software.png" : "packaged-runtime-smoke.png",
);

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("expected a TCP address while allocating the CDP port"));
        return;
      }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function readJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once("error", reject);
    request.setTimeout(1000, () => request.destroy(new Error("request timed out")));
  });
}

async function waitForCdp(port) {
  const endpoint = `http://127.0.0.1:${port}`;
  /** @type {Error | null} */
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await readJson(`${endpoint}/json/version`);
      return endpoint;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(`packaged Electron CDP endpoint did not start: ${lastError?.message || "unknown error"}`);
}

async function findGamePage(browser) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const pages = browser.contexts().flatMap(context => context.pages());
    const gamePage = pages.find(page => /(?:^file:|index\.html)/i.test(page.url()));
    if (gamePage) return gamePage;
    await delay(250);
  }
  throw new Error("packaged Electron game page did not open");
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  const exited = await Promise.race([
    new Promise(resolve => child.once("exit", () => resolve(true))),
    delay(3000).then(() => false),
  ]);
  if (exited || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    if (child.exitCode === null) {
      await Promise.race([
        new Promise(resolve => child.once("exit", resolve)),
        delay(2000),
      ]);
    }
  } else {
    child.kill("SIGTERM");
  }
}

async function verifyPackagedControls(page) {
  const speedKeys = [];
  for (const [key, expectedSpeed] of [["1", 1], ["2", 3], ["3", 10]]) {
    await page.keyboard.press(key);
    await page.waitForFunction(expected => (
      window.Game.Main.getSpeed() === expected
      && document.querySelector(`.speed-btn[data-speed="${expected}"]`)?.classList.contains("active")
    ), expectedSpeed, { timeout: 10000 });
    speedKeys.push({ key, speed: expectedSpeed });
  }

  await page.keyboard.press("1");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.Game.Main.getSpeed() === 0, null, { timeout: 10000 });
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.Game.Main.getSpeed() === 1, null, { timeout: 10000 });

  const panels = [];
  for (const [key, panelName] of [["b", "build"], ["j", "campaign"]]) {
    await page.keyboard.press(key);
    await page.waitForFunction(expected => {
      const panel = document.getElementById("side-panel");
      return Boolean(panel && panel.dataset.active === expected && !panel.classList.contains("hidden"));
    }, panelName, { timeout: 10000 });
    panels.push({ key, panel: panelName });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("side-panel")?.classList.contains("hidden"), null, { timeout: 10000 });
  }

  const autonomyBefore = await page.evaluate(() => window.Game.State.get().character.autonomy.enabled);
  await page.keyboard.press("q");
  await page.waitForFunction(expected => window.Game.State.get().character.autonomy.enabled === expected, !autonomyBefore, { timeout: 10000 });
  await page.keyboard.press("q");
  await page.waitForFunction(expected => window.Game.State.get().character.autonomy.enabled === expected, autonomyBefore, { timeout: 10000 });

  const graphicsBefore = await page.evaluate(() => window.Game.Main.getGraphicsMode());
  await page.keyboard.press("l");
  await page.waitForFunction(expected => window.Game.Main.getGraphicsMode() !== expected, graphicsBefore, { timeout: 10000 });
  const graphicsAfter = await page.evaluate(() => window.Game.Main.getGraphicsMode());

  const camera = [];
  for (const [key, axis, direction] of [
    ["w", "y", 1],
    ["s", "y", -1],
    ["a", "x", 1],
    ["d", "x", -1],
    ["ArrowUp", "y", 1],
    ["ArrowDown", "y", -1],
    ["ArrowLeft", "x", 1],
    ["ArrowRight", "x", -1],
  ]) {
    await page.keyboard.press("c");
    await page.waitForFunction(() => {
      const debug = window.Game.Renderer.getCameraDebug();
      return debug?.followsCharacter && debug.scrollFinite && debug.focusFinite && debug.targetScrollFinite;
    }, null, { timeout: 10000 });
    const before = await page.evaluate(() => window.Game.Renderer.getCameraDebug().scroll);
    await page.keyboard.press(key);
    await page.waitForFunction(({ expectedAxis, expectedDirection, previous }) => {
      const debug = window.Game.Renderer.getCameraDebug();
      if (!debug || debug.followsCharacter || !debug.scrollFinite) return false;
      return expectedDirection > 0
        ? debug.scroll[expectedAxis] > previous[expectedAxis]
        : debug.scroll[expectedAxis] < previous[expectedAxis];
    }, { expectedAxis: axis, expectedDirection: direction, previous: before }, { timeout: 10000 });
    camera.push({ key, axis, direction });
  }
  await page.keyboard.press("Home");
  await page.waitForFunction(() => window.Game.Renderer.getCameraDebug()?.followsCharacter === true, null, { timeout: 10000 });

  await page.keyboard.press("2");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => (
    window.Game.Shell.isOpen()
    && window.Game.Main.getSpeed() === 0
    && document.activeElement?.id === "btn-pause-resume"
    && document.getElementById("ui-layer")?.hasAttribute("inert")
    && document.getElementById("ui-layer")?.getAttribute("aria-hidden") === "true"
  ), null, { timeout: 10000 });
  await page.click("#btn-pause-settings");
  await page.waitForSelector("#pause-settings-panel:not(.hidden)", { timeout: 10000 });
  await page.locator("#setting-volume").fill("65");
  for (const selector of ["#setting-muted", "#setting-scanlines", "#setting-reduced-motion", "#setting-high-contrast"]) {
    await page.locator(selector).check();
  }

  const expectedSettings = {
    volume: 65,
    muted: true,
    scanlines: true,
    reducedMotion: true,
    highContrast: true,
  };
  await page.waitForFunction(expected => {
    const current = window.Game.Shell.getSettings();
    const stored = JSON.parse(localStorage.getItem("simlife_settings_v3") || "null");
    const valuesMatch = Object.keys(expected).every(key => current[key] === expected[key] && stored?.[key] === expected[key]);
    return valuesMatch
      && document.body.classList.contains("audio-muted")
      && document.body.classList.contains("reduced-motion")
      && document.body.classList.contains("high-contrast-hud")
      && !document.body.classList.contains("crt-off")
      && document.getElementById("setting-volume-value")?.textContent === "65%";
  }, expectedSettings, { timeout: 10000 });
  await page.click("#btn-pause-resume");
  await page.waitForFunction(() => (
    !window.Game.Shell.isOpen()
    && window.Game.Main.getSpeed() === 3
    && !document.getElementById("ui-layer")?.hasAttribute("inert")
    && !document.getElementById("ui-layer")?.hasAttribute("aria-hidden")
  ), null, { timeout: 10000 });

  return {
    speedKeys,
    spacePauseResume: true,
    panels,
    autonomyRestored: true,
    graphics: { before: graphicsBefore, after: graphicsAfter },
    camera,
    pause: { restoredSpeed: 3, focusTarget: "btn-pause-resume", uiInertWhileOpen: true },
    expectedSettings,
  };
}

async function verifyRehydratedPreferences(page, expectedSettings, expectedGraphics) {
  await page.waitForFunction(({ settings, graphics }) => {
    const current = window.Game.Shell?.getSettings?.();
    const stored = JSON.parse(localStorage.getItem("simlife_settings_v3") || "null");
    /** @type {HTMLInputElement | null} */
    const volume = document.querySelector("#setting-volume");
    /** @type {HTMLInputElement | null} */
    const muted = document.querySelector("#setting-muted");
    /** @type {HTMLInputElement | null} */
    const scanlines = document.querySelector("#setting-scanlines");
    /** @type {HTMLInputElement | null} */
    const reducedMotion = document.querySelector("#setting-reduced-motion");
    /** @type {HTMLInputElement | null} */
    const highContrast = document.querySelector("#setting-high-contrast");
    return current
      && Object.keys(settings).every(key => current[key] === settings[key] && stored?.[key] === settings[key])
      && window.Game.Main?.getGraphicsMode?.() === graphics
      && localStorage.getItem("graphicsQuality") === graphics
      && document.body.classList.contains("audio-muted")
      && document.body.classList.contains("reduced-motion")
      && document.body.classList.contains("high-contrast-hud")
      && !document.body.classList.contains("crt-off")
      && volume?.value === "65"
      && document.getElementById("setting-volume-value")?.textContent === "65%"
      && muted?.checked
      && scanlines?.checked
      && reducedMotion?.checked
      && highContrast?.checked;
  }, { settings: expectedSettings, graphics: expectedGraphics }, { timeout: 15000 });

  return page.evaluate(() => {
    /** @type {HTMLInputElement | null} */
    const volume = document.querySelector("#setting-volume");
    /** @type {HTMLInputElement | null} */
    const muted = document.querySelector("#setting-muted");
    /** @type {HTMLInputElement | null} */
    const scanlines = document.querySelector("#setting-scanlines");
    /** @type {HTMLInputElement | null} */
    const reducedMotion = document.querySelector("#setting-reduced-motion");
    /** @type {HTMLInputElement | null} */
    const highContrast = document.querySelector("#setting-high-contrast");
    return {
      settings: window.Game.Shell.getSettings(),
      graphics: window.Game.Main.getGraphicsMode(),
      storedSettings: JSON.parse(localStorage.getItem("simlife_settings_v3") || "null"),
      storedGraphics: localStorage.getItem("graphicsQuality"),
      bodyClasses: Array.from(document.body.classList).sort(),
      controls: {
        volume: volume?.value,
        volumeLabel: document.getElementById("setting-volume-value")?.textContent,
        muted: muted?.checked,
        scanlines: scanlines?.checked,
        reducedMotion: reducedMotion?.checked,
        highContrast: highContrast?.checked,
      },
    };
  });
}

async function resetPackagedPreferences(page) {
  await page.evaluate(() => {
    const updates = {
      "setting-volume": "30",
      "setting-muted": false,
      "setting-scanlines": false,
      "setting-reduced-motion": false,
      "setting-high-contrast": false,
    };
    Object.entries(updates).forEach(([id, value]) => {
      /** @type {HTMLInputElement | null} */
      const element = document.querySelector(`#${id}`);
      if (!element) return;
      if (typeof value === "boolean") element.checked = value;
      else element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    window.Game.Main.setGraphicsMode("high");
  });
  await page.waitForFunction(() => {
    const settings = window.Game.Shell.getSettings();
    return settings.volume === 30
      && !settings.muted
      && !settings.scanlines
      && !settings.reducedMotion
      && !settings.highContrast
      && window.Game.Main.getGraphicsMode() === "high";
  }, null, { timeout: 10000 });
}

async function main() {
  if (!fs.existsSync(executablePath)) throw new Error(`missing unpacked candidate executable: ${executablePath}`);
  const port = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "simlife-packaged-smoke-"));
  const electronEnvironment = { ...process.env };
  delete electronEnvironment.SIMLIFE_TEST_RENDERER;
  delete electronEnvironment.SIMLIFE_TEST_USER_DATA;
  electronEnvironment.ELECTRON_ENABLE_LOGGING = "1";
  electronEnvironment.SIMLIFE_TEST_USER_DATA = profileDir;
  if (softwareRendering) electronEnvironment.SIMLIFE_TEST_RENDERER = "canvas";
  const stderr = [];
  /** @type {import("node:child_process").ChildProcess | null} */
  let child = null;
  /** @type {import("playwright").Browser | null} */
  let browser = null;

  try {
    const launchArguments = [
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--host-rules=MAP * ~NOTFOUND",
      "--disable-background-networking",
      "--disable-component-update",
    ];
    if (softwareRendering) launchArguments.push("--disable-gpu", "--enable-unsafe-swiftshader");
    const launchedChild = spawn(executablePath, launchArguments, {
      cwd: path.dirname(executablePath),
      windowsHide: true,
      detached: process.platform === "win32",
      stdio: ["ignore", "ignore", "pipe"],
      env: electronEnvironment,
    });
    launchedChild.stderr.on("data", chunk => stderr.push(String(chunk)));
    child = launchedChild;

    const endpoint = await waitForCdp(port);
    const connectedBrowser = await chromium.connectOverCDP(endpoint);
    browser = connectedBrowser;
    const page = await findGamePage(connectedBrowser);
    const consoleErrors = [];
    const pageErrors = [];
    const externalRequests = [];
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", error => pageErrors.push(String(error.stack || error.message || error)));
    page.on("request", request => {
      if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
    });

    await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
    await page.waitForSelector("#main-menu-screen:not(.hidden)", { timeout: 30000 });
    await page.click("#btn-mm-new");
    await page.waitForSelector("#char-creation-screen:not(.hidden)", { timeout: 20000 });
    await page.click("#btn-cc-start");
    await page.waitForFunction(() => window.Game?.Renderer?.isReady?.() === true, null, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll("canvas").length === 1, null, { timeout: 30000 });
    await page.waitForTimeout(1000);

    const created = await page.evaluate(() => ({
      activeSlotId: window.Game.State.getActiveSlotId(),
      saved: window.Game.State.save(),
      canvasCount: document.querySelectorAll("canvas").length,
      rendererReady: window.Game.Renderer.isReady(),
      rendererOverride: new URLSearchParams(window.location.search).get("renderer"),
      campaign: window.Game.Campaign.getCurrentChapter()?.id || null,
      furniture: window.Game.Renderer.getFurnitureDebug(),
      preloadedAssets: Object.keys(window.SIM_PRELOADED_IMAGES || {}).length,
      declaredAssets: Object.keys(window.SIM_ASSETS || {}).length,
    }));
    if (!created.activeSlotId || !created.saved || created.canvasCount !== 1 || !created.rendererReady || !created.campaign) {
      throw new Error(`packaged new-world journey failed: ${JSON.stringify(created)}`);
    }
    if (created.rendererOverride !== (softwareRendering ? "canvas" : null)) {
      throw new Error(`packaged renderer mode was contaminated: ${JSON.stringify(created)}`);
    }
    if (created.furniture.missingSprites || created.furniture.positionMismatches || created.preloadedAssets !== created.declaredAssets) {
      throw new Error(`packaged renderer/assets failed: ${JSON.stringify(created)}`);
    }

    const controls = await verifyPackagedControls(page);

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("#main-menu-screen:not(.hidden)", { timeout: 30000 });
    await page.click("#btn-mm-load");
    await page.waitForSelector("#load-game-screen:not(.hidden) .btn-load", { timeout: 20000 });
    await page.click("#load-game-screen .btn-load");
    await page.waitForFunction(expectedSlot => (
      window.Game?.Renderer?.isReady?.() === true
      && window.Game.State.getActiveSlotId() === expectedSlot
      && document.querySelectorAll("canvas").length === 1
    ), created.activeSlotId, { timeout: 60000 });
    const rehydratedPreferences = await verifyRehydratedPreferences(page, controls.expectedSettings, controls.graphics.after);
    await resetPackagedPreferences(page);
    await page.screenshot({ path: screenshotPath, animations: "disabled" });

    const loaded = await page.evaluate(() => ({
      activeSlotId: window.Game.State.getActiveSlotId(),
      canvasCount: document.querySelectorAll("canvas").length,
      rendererReady: window.Game.Renderer.isReady(),
      furniture: window.Game.Renderer.getFurnitureDebug(),
    }));
    if (loaded.activeSlotId !== created.activeSlotId || loaded.canvasCount !== 1 || !loaded.rendererReady
      || loaded.furniture.missingSprites || loaded.furniture.positionMismatches) {
      throw new Error(`packaged load-world journey failed: ${JSON.stringify(loaded)}`);
    }
    if (consoleErrors.length || pageErrors.length || externalRequests.length) {
      throw new Error(`packaged runtime diagnostics failed: ${JSON.stringify({ consoleErrors, pageErrors, externalRequests })}`);
    }

    process.stdout.write(`${JSON.stringify({
      ok: true,
      executablePath,
      renderingMode: softwareRendering ? "Canvas with Chromium GPU disabled/SwiftShader allowed" : "production default",
      networkPolicy: "Chromium host rules map external hosts to NOTFOUND",
      created,
      controls,
      rehydratedPreferences,
      loaded,
      consoleErrors,
      pageErrors,
      externalRequests,
      screenshotPath,
    }, null, 2)}\n`);
  } catch (error) {
    if (stderr.length) process.stderr.write(`Packaged Electron stderr:\n${stderr.join("")}\n`);
    throw error;
  } finally {
    await stopProcessTree(child);
    try {
      await browser?.close();
    } catch (_) {
      // Process-tree cleanup below is authoritative on Windows.
    }
    const resolvedTemp = path.resolve(os.tmpdir());
    const resolvedProfile = path.resolve(profileDir);
    if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`) && path.basename(resolvedProfile).startsWith("simlife-packaged-smoke-")) {
      let cleaned = false;
      for (let attempt = 0; attempt < 8 && !cleaned; attempt += 1) {
        try {
          fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
          cleaned = true;
        } catch (error) {
          if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error.code)) throw error;
          await delay(200 * (attempt + 1));
        }
      }
      if (!cleaned) process.stderr.write(`Packaged runtime passed; deferred locked profile cleanup: ${resolvedProfile}\n`);
    }
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
