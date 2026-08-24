"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..", "..");
const output = path.join(root, "artifacts", new Date().toISOString().slice(0, 10), "browser-smoke");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function findBrowser() {
  const candidates = [
    process.env.SIMLIFE_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function startServer() {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
    const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const resolved = path.resolve(root, relative);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(resolved, (error, body) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Unavailable");
        return;
      }
      response.writeHead(200, { "Content-Type": contentTypes[path.extname(resolved).toLowerCase()] || "application/octet-stream" });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const executablePath = findBrowser();
  if (!executablePath) throw new Error("No supported Chrome/Chromium executable found. Set SIMLIFE_CHROME_PATH.");
  fs.mkdirSync(output, { recursive: true });
  const server = await startServer();
  const address = server.address();
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => pageErrors.push(String(error.message || error)));

  try {
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "domcontentloaded" });
    await page.click("#btn-mm-load");
    await page.waitForSelector("#load-game-screen:not(.hidden)");
    const emptySaves = await page.locator("#load-saves-list").textContent();
    assert(/No saved worlds found/i.test(emptySaves || ""), "Expected a useful empty-state message when no local worlds exist");
    await page.click("#btn-ls-back");
    await page.click("#btn-mm-new");
    await page.waitForSelector("#char-creation-screen:not(.hidden)");
    await page.screenshot({ path: path.join(output, "creator-desktop.png"), animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#cc-avatar-editor").scrollIntoViewIfNeeded();
    const mobileCreator = await page.evaluate(() => {
      const preview = document.querySelector("#cc-avatar-editor .avatar-preview-stage")?.getBoundingClientRect();
      const start = document.getElementById("btn-cc-start")?.getBoundingClientRect();
      return {
        previewVisible: Boolean(preview && preview.top < innerHeight && preview.bottom > 0 && preview.width >= 90),
        startVisible: Boolean(start && start.top < innerHeight && start.bottom > 0 && start.height >= 44),
      };
    });
    assert(mobileCreator.previewVisible, "Expected the mobile creator preview to be visible and readable");
    assert(mobileCreator.startVisible, "Expected the mobile creator start action to remain visible");
    await page.screenshot({ path: path.join(output, "creator-mobile.png"), animations: "disabled" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#char-creation-screen").evaluate(element => { element.scrollTop = 0; });
    await page.click("#btn-cc-start");
    await page.waitForFunction(() => window.Game?.Renderer?.isReady?.() === true, null, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector(".daily-focus-kicker")?.textContent === "First Move", null, { timeout: 10000 });
    await page.waitForFunction(() => (window.Game?.State?.get?.().time.totalMinutes || 0) >= 1, null, { timeout: 20000 });

    const live = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll("canvas").length,
      runtimeHidden: document.getElementById("runtime-status").classList.contains("hidden"),
      rendererReady: window.Game.Renderer.isReady(),
      totalMinutes: window.Game.State.get().time.totalMinutes,
      dailyFocus: document.querySelector(".daily-focus-kicker")?.textContent,
      gourmet: window.Game.Character.getActivityAvailability("gourmet_feast"),
    }));
    assert(live.canvasCount === 1, `Expected one game canvas, found ${live.canvasCount}`);
    assert(live.runtimeHidden && live.rendererReady, "Expected a ready renderer with no recovery overlay");
    assert(live.dailyFocus === "First Move", `Expected First Move onboarding, found ${live.dailyFocus}`);
    assert(!live.gourmet.allowed && /Cooking level 5/.test(live.gourmet.reason), "Expected Gourmet Feast to remain skill locked");
    await page.screenshot({ path: path.join(output, "gameplay-desktop.png"), animations: "disabled" });

    const eventPause = await page.evaluate(() => new Promise(resolve => {
      const trigger = document.getElementById("btn-ingame-menu");
      trigger.focus();
      window.Game.Main.setSpeed(3, { silent: true });
      window.Game.UI.showEvent({ title: "Smoke Event", desc: "Pause contract", choices: [{ label: "Continue", effects: {} }] });
      const pausedSpeed = window.Game.Main.getSpeed();
      const focused = document.activeElement?.classList.contains("event-choice") || false;
      const uiInert = document.getElementById("ui-layer").hasAttribute("inert");
      window.Game.UI.hideEvent();
      window.setTimeout(() => resolve({ pausedSpeed, restoredSpeed: window.Game.Main.getSpeed(), focused, uiInert, uiRestored: !document.getElementById("ui-layer").hasAttribute("inert"), focusRestored: document.activeElement === trigger }), 0);
    }));
    assert(eventPause.pausedSpeed === 0 && eventPause.restoredSpeed === 3, "Expected event modal to restore its prior speed");
    assert(eventPause.focused, "Expected event modal to focus its first available choice");
    assert(eventPause.uiInert && eventPause.uiRestored && eventPause.focusRestored, "Expected event modal to isolate input and restore trigger focus");

    const pauseShell = await page.evaluate(() => new Promise(resolve => {
      const trigger = document.getElementById("btn-ingame-menu");
      trigger.focus();
      window.Game.Main.setSpeed(0, { silent: true });
      window.Game.Shell.open();
      const opened = { speed: window.Game.Main.getSpeed(), uiInert: document.getElementById("ui-layer").hasAttribute("inert"), focused: document.activeElement?.id };
      window.Game.Shell.close();
      window.setTimeout(() => resolve({ opened, restoredSpeed: window.Game.Main.getSpeed(), uiRestored: !document.getElementById("ui-layer").hasAttribute("inert"), focusRestored: document.activeElement === trigger }), 0);
    }));
    assert(pauseShell.opened.speed === 0 && pauseShell.opened.uiInert && pauseShell.opened.focused === "btn-pause-resume", "Expected pause shell to isolate game input and focus Resume");
    assert(pauseShell.restoredSpeed === 0 && pauseShell.uiRestored && pauseShell.focusRestored, "Expected pause shell to preserve an already-paused state and restore trigger focus");

    const sidePanel = await page.evaluate(() => new Promise(resolve => {
      const trigger = document.getElementById("btn-ingame-menu");
      trigger.focus();
      window.Game.UI.togglePanel("activities");
      const panel = document.getElementById("side-panel");
      const close = panel.querySelector(".panel-close, .close-btn");
      const snapshot = { role: panel.getAttribute("role"), modal: panel.getAttribute("aria-modal"), closeLabel: close?.getAttribute("aria-label"), focused: document.activeElement === close };
      window.Game.UI.togglePanel("activities");
      window.setTimeout(() => resolve({ ...snapshot, focusRestored: document.activeElement === trigger }), 0);
    }));
    assert(sidePanel.role === "dialog" && sidePanel.modal === "false" && sidePanel.closeLabel && sidePanel.focused && sidePanel.focusRestored, "Expected modeless side panel dialog and close/restore focus semantics");

    const makeover = await page.evaluate(() => new Promise(resolve => {
      const trigger = document.getElementById("btn-ingame-menu");
      trigger.focus();
      window.Game.Main.setSpeed(3, { silent: true });
      window.Game.UI.openEditModal();
      const modal = document.getElementById("edit-char-modal");
      const opened = {
        role: modal.getAttribute("role"),
        modal: modal.getAttribute("aria-modal"),
        labelledBy: modal.getAttribute("aria-labelledby"),
        closeLabel: document.getElementById("btn-ec-close").getAttribute("aria-label"),
        focused: document.activeElement?.id,
        speed: window.Game.Main.getSpeed(),
        uiInert: document.getElementById("ui-layer").hasAttribute("inert"),
      };
      document.getElementById("btn-ec-cancel").click();
      window.setTimeout(() => resolve({
        opened,
        restoredSpeed: window.Game.Main.getSpeed(),
        uiRestored: !document.getElementById("ui-layer").hasAttribute("inert"),
        focusRestored: document.activeElement === trigger,
      }), 0);
    }));
    assert(makeover.opened.role === "dialog" && makeover.opened.modal === "true" && makeover.opened.labelledBy === "edit-char-title", "Expected labelled modal semantics for Sim Makeover");
    assert(makeover.opened.closeLabel && makeover.opened.focused === "ec-sim-name" && makeover.opened.speed === 0 && makeover.opened.uiInert, "Expected Sim Makeover to pause, isolate input, and focus the name field");
    assert(makeover.restoredSpeed === 3 && makeover.uiRestored && makeover.focusRestored, `Expected Sim Makeover to restore speed, input, and trigger focus: ${JSON.stringify(makeover)}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const mobileGameplay = await page.evaluate(() => {
      const menu = document.querySelector(".menu-bar")?.getBoundingClientRect();
      const needs = document.getElementById("needs-bars")?.getBoundingClientRect();
      return {
        menuVisible: Boolean(menu && menu.bottom <= innerHeight && menu.height >= 44),
        needsVisible: Boolean(needs && needs.bottom <= innerHeight && needs.height > 0),
        campaignVisible: Boolean(document.querySelector(".campaign-chip")?.getBoundingClientRect().height >= 36),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        furniture: window.Game.Renderer.getFurnitureDebug(),
      };
    });
    assert(mobileGameplay.menuVisible && mobileGameplay.needsVisible && mobileGameplay.campaignVisible, `Expected mobile HUD actions, needs, and campaign context to remain visible: ${JSON.stringify(mobileGameplay)}`);
    assert(!mobileGameplay.horizontalOverflow, "Expected no horizontal overflow at mobile width");
    assert(mobileGameplay.furniture.spriteCount >= 30 && mobileGameplay.furniture.missingSprites === 0 && mobileGameplay.furniture.positionMismatches === 0, `Expected furniture to stay synchronized through responsive resize: ${JSON.stringify(mobileGameplay.furniture)}`);
    await page.screenshot({ path: path.join(output, "gameplay-mobile.png"), animations: "disabled" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      const event = new Event("webglcontextlost", { cancelable: true });
      document.getElementById("game-canvas").dispatchEvent(event);
      window.Game.Shell.open();
      window.Game.UI.togglePanel("activities");
    });
    const recovery = await page.evaluate(() => ({
      blocked: document.body.classList.contains("runtime-input-blocked"),
      uiInert: document.getElementById("ui-layer").hasAttribute("inert"),
      speed: window.Game.Main.getSpeed(),
      pauseHidden: document.getElementById("pause-overlay").classList.contains("hidden"),
      panelHidden: document.getElementById("side-panel").classList.contains("hidden"),
      role: document.getElementById("runtime-status").getAttribute("role"),
    }));
    assert(recovery.blocked && recovery.uiInert && recovery.speed === 0, "Expected renderer recovery to block and pause gameplay");
    assert(recovery.pauseHidden && recovery.panelHidden, "Expected recovery modal to prevent stacked panels");
    assert(recovery.role === "alertdialog", `Expected alertdialog recovery semantics, found ${recovery.role}`);

    await page.screenshot({ path: path.join(output, "recovery-desktop.png"), animations: "disabled" });
    const diagnostics = { executablePath, consoleErrors, pageErrors, mobileCreator, live, eventPause, pauseShell, sidePanel, makeover, mobileGameplay, recovery };
    fs.writeFileSync(path.join(output, "diagnostics.json"), `${JSON.stringify(diagnostics, null, 2)}\n`);
    assert(consoleErrors.length === 0, `Browser console errors:\n${consoleErrors.join("\n")}`);
    assert(pageErrors.length === 0, `Browser page errors:\n${pageErrors.join("\n")}`);
    process.stdout.write(`${JSON.stringify({ ok: true, ...diagnostics }, null, 2)}\n`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
