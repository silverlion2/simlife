"use strict";

const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const UI_TIMEOUT = 20000;
const RENDER_TIMEOUT = 30000;
const STARTUP_TIMEOUT = 90000;

function fail(message) {
  throw new Error(message);
}

async function step(label, action) {
  try {
    return await action();
  } catch (err) {
    const original = err && (err.stack || err.message) ? err : new Error(String(err));
    const wrapped = new Error(`${label} failed: ${original.message || original}`);
    wrapped.cause = err;
    wrapped.stack = `${wrapped.stack}\nCaused by: ${original.stack || original.message || original}`;
    throw wrapped;
  }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function readJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once('error', reject);
    request.setTimeout(1000, () => request.destroy(new Error('request timed out')));
  });
}

async function waitForCdp(port) {
  const endpoint = `http://127.0.0.1:${port}`;
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
  throw new Error(`development Electron CDP endpoint did not start: ${lastError?.message || 'unknown error'}`);
}

async function findGamePage(browser) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const pages = browser.contexts().flatMap(context => context.pages());
    const gamePage = pages.find(page => /(?:^file:|index\.html)/i.test(page.url()));
    if (gamePage) return gamePage;
    await delay(250);
  }
  throw new Error('development Electron game page did not open');
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  const exited = await Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    delay(3000).then(() => false),
  ]);
  if (exited || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    if (child.exitCode === null) {
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        delay(2000),
      ]);
    }
  } else {
    child.kill('SIGTERM');
  }
}

function waitForSelector(page, label, selector, options = {}) {
  return step(label, () => page.waitForSelector(selector, {
    timeout: UI_TIMEOUT,
    ...options,
  }));
}

function waitForGameFunction(page, label, predicate, arg = null, options = {}) {
  return step(label, () => page.waitForFunction(predicate, arg, {
    timeout: UI_TIMEOUT,
    ...options,
  }));
}

function click(page, label, selector, options = {}) {
  return step(label, () => page.click(selector, {
    timeout: UI_TIMEOUT,
    ...options,
  }));
}

async function waitForCanvasNonBlank(page) {
  const handle = await waitForGameFunction(page, 'wait for varied renderer canvas pixels', () => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return false;

    const gl = canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (gl && gl.isContextLost && gl.isContextLost()) return false;
    const context2d = gl ? null : canvas.getContext('2d', { willReadFrequently: true });
    if (!gl && !context2d) return false;

    const width = gl ? (gl.drawingBufferWidth || canvas.width) : canvas.width;
    const height = gl ? (gl.drawingBufferHeight || canvas.height) : canvas.height;
    if (width <= 0 || height <= 0) return false;

    let pixels;
    if (gl) {
      pixels = new Uint8Array(width * height * 4);
      gl.finish();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } else {
      pixels = context2d.getImageData(0, 0, width, height).data;
    }

    const maxSamples = 20000;
    const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / maxSamples)));
    let sampledPixels = 0;
    let alphaPixels = 0;
    let coloredPixels = 0;
    let minLuma = Infinity;
    let maxLuma = -Infinity;
    const colorBuckets = new Set();

    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const i = ((y * width) + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        sampledPixels += 1;
        if (a > 0) alphaPixels += 1;
        if (a > 0 && (r + g + b) > 12) {
          coloredPixels += 1;
          const luma = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
          minLuma = Math.min(minLuma, luma);
          maxLuma = Math.max(maxLuma, luma);
          if (colorBuckets.size < 64) {
            colorBuckets.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 6}`);
          }
        }
      }
    }

    if (coloredPixels < 20) return false;
    if (colorBuckets.size < 4) return false;
    if (maxLuma - minLuma < 10) return false;
    return {
      width,
      height,
      renderer: gl ? 'webgl' : 'canvas',
      stride,
      sampledPixels,
      alphaPixels,
      coloredPixels,
      colorBuckets: colorBuckets.size,
      lumaRange: Math.round((maxLuma - minLuma) * 100) / 100,
    };
  }, null, { timeout: RENDER_TIMEOUT });

  return handle.jsonValue();
}

async function checkCameraControls(page) {
  const initial = await step('read initial camera debug', async () => {
    const debug = await page.evaluate(() => window.Game.Renderer.getCameraDebug ? window.Game.Renderer.getCameraDebug() : null);
    if (!debug) fail('Expected camera debug API');
    return debug;
  });

  if (!initial.scrollFinite || !initial.focusFinite || !initial.targetScrollFinite) {
    fail(`Expected finite initial camera debug values: ${JSON.stringify(initial)}`);
  }
  if (initial.nativeFollowActive) {
    fail(`Expected custom camera follow to avoid Phaser native follow: ${JSON.stringify(initial)}`);
  }

  await step('pan camera manually', () => page.evaluate(() => window.Game.Renderer.setCameraOffset(80, 0)));
  const afterPanHandle = await waitForGameFunction(page, 'wait for manual pan to disable camera follow', () => {
    const debug = window.Game.Renderer.getCameraDebug && window.Game.Renderer.getCameraDebug();
    return debug && debug.followsCharacter === false ? debug : false;
  }, null, { timeout: RENDER_TIMEOUT });
  const afterPan = await afterPanHandle.jsonValue();
  if (afterPan.nativeFollowActive) {
    fail(`Expected manual pan to clear Phaser native follow: ${JSON.stringify(afterPan)}`);
  }

  await step('recenter camera on character', () => page.evaluate(() => window.Game.Renderer.centerCameraOnCharacter()));
  const afterCenterHandle = await waitForGameFunction(page, 'wait for camera recenter to resume follow', () => {
    const debug = window.Game.Renderer.getCameraDebug && window.Game.Renderer.getCameraDebug();
    if (!debug || debug.followsCharacter !== true) return false;
    if (!debug.scrollFinite || !debug.focusFinite || !debug.targetScrollFinite) return false;
    return debug;
  }, null, { timeout: RENDER_TIMEOUT });
  const afterCenter = await afterCenterHandle.jsonValue();
  if (afterCenter.nativeFollowActive) {
    fail(`Expected recentered camera to keep using custom follow: ${JSON.stringify(afterCenter)}`);
  }

  return { initial, afterPan, afterCenter };
}

async function checkObjectMarketPanel(page) {
  await click(page, 'open Object Market panel', '[data-panel="market"]');
  await waitForSelector(page, 'wait for Object Market panel', '#side-panel:not(.hidden)', { timeout: UI_TIMEOUT });

  const initial = await step('read Object Market panel state', async () => page.evaluate(() => {
    const panel = document.getElementById('side-panel');
    const offers = window.Game.ObjectMarket.getDailyOffers();
    const items = [...document.querySelectorAll('#side-panel .market-item')];
    const affordableButtons = [...document.querySelectorAll('#side-panel .market-item button:not([disabled])')];
    return {
      activePanel: panel && panel.dataset.active,
      title: panel ? panel.textContent : '',
      offers: offers.length,
      items: items.length,
      craftingItems: document.querySelectorAll('#side-panel .crafting-item').length,
      affordable: affordableButtons.length,
      inventoryBefore: window.Game.HomeGrowth.getInventoryObjects().length,
    };
  }));

  if (initial.activePanel !== 'market') fail(`Expected Market panel to be active: ${JSON.stringify(initial)}`);
  if (!initial.title.includes('Object Market')) fail(`Expected Market panel title, found ${JSON.stringify(initial.title)}`);
  if (initial.offers < 4 || initial.items < 4) fail(`Expected rendered market offers: ${JSON.stringify(initial)}`);
  if (initial.craftingItems < 3) fail(`Expected crafting recipes to render in Market panel: ${JSON.stringify(initial)}`);
  if (initial.affordable < 1) fail(`Expected at least one affordable market offer: ${JSON.stringify(initial)}`);

  const firstAffordable = page.locator('#side-panel .market-item button:not([disabled])').first();
  await firstAffordable.click({ timeout: UI_TIMEOUT });
  const boughtHandle = await waitForGameFunction(page, 'wait for bought market object in storage', (before) => {
    const inventory = window.Game.HomeGrowth.getInventoryObjects();
    const panel = document.getElementById('side-panel');
    return inventory.length > before && panel && panel.dataset.active === 'market'
      ? {
          inventoryAfter: inventory.length,
          marketItemsAfter: document.querySelectorAll('#side-panel .market-item').length,
        }
      : false;
  }, initial.inventoryBefore, { timeout: UI_TIMEOUT });
  const bought = await boughtHandle.jsonValue();

  return { ...initial, ...bought };
}

async function checkGoalsPanel(page) {
  await click(page, 'open Household Goals panel', '[data-panel="goals"]');
  await waitForSelector(page, 'wait for Household Goals panel', '#side-panel:not(.hidden)', { timeout: UI_TIMEOUT });
  const result = await step('read Household Goals panel state', async () => page.evaluate(() => {
    const panel = document.getElementById('side-panel');
    const goals = window.Game.HomeGoals.getActiveGoals();
    return {
      activePanel: panel && panel.dataset.active,
      title: panel ? panel.textContent : '',
      goals: goals.length,
      cards: document.querySelectorAll('#side-panel .goal-card').length,
      disabledClaimButtons: document.querySelectorAll('#side-panel .goal-card button:disabled').length,
    };
  }));

  if (result.activePanel !== 'goals') fail(`Expected Goals panel to be active: ${JSON.stringify(result)}`);
  if (!result.title.includes('Household Goals')) fail(`Expected Goals panel title, found ${JSON.stringify(result.title)}`);
  if (result.goals < 2 || result.cards < 2) fail(`Expected starter household goals to render: ${JSON.stringify(result)}`);
  return result;
}

async function checkCollectionsPanel(page) {
  await click(page, 'open Collections panel', '[data-panel="collections"]');
  await waitForSelector(page, 'wait for Collections panel', '#side-panel:not(.hidden)', { timeout: UI_TIMEOUT });
  const initial = await step('read Collections panel state', async () => page.evaluate(() => {
    const panel = document.getElementById('side-panel');
    const collections = window.Game.HomeCollections.getCollections();
    return {
      activePanel: panel && panel.dataset.active,
      title: panel ? panel.textContent : '',
      collections: collections.length,
      completeCollections: collections.filter(item => item.complete).length,
      cards: document.querySelectorAll('#side-panel .collection-card').length,
      itemChips: document.querySelectorAll('#side-panel .collection-item-chip').length,
      readyButtons: document.querySelectorAll('#side-panel .collection-card.complete button:not([disabled])').length,
      completedBefore: window.Game.State.get().homeCollections?.completed?.length || 0,
    };
  }));

  if (initial.activePanel !== 'collections') fail(`Expected Collections panel to be active: ${JSON.stringify(initial)}`);
  if (!initial.title.includes('Home Collections')) fail(`Expected Collections panel title, found ${JSON.stringify(initial.title)}`);
  if (initial.collections < 4 || initial.cards < 4) fail(`Expected several collection cards to render: ${JSON.stringify(initial)}`);
  if (initial.itemChips < 8) fail(`Expected collection item progress chips to render: ${JSON.stringify(initial)}`);
  if (initial.readyButtons < 1) fail(`Expected at least one ready starter collection: ${JSON.stringify(initial)}`);

  await page.locator('#side-panel .collection-card.complete button:not([disabled])').first().click({ timeout: UI_TIMEOUT });
  const claimedHandle = await waitForGameFunction(page, 'wait for collection claim reward', (before) => {
    const completed = window.Game.State.get().homeCollections?.completed?.length || 0;
    const panel = document.getElementById('side-panel');
    return completed > before && panel && panel.dataset.active === 'collections'
      ? {
          completedAfter: completed,
          disabledClaimsAfter: document.querySelectorAll('#side-panel .collection-card button:disabled').length,
        }
      : false;
  }, initial.completedBefore, { timeout: UI_TIMEOUT });
  const claimed = await claimedHandle.jsonValue();
  await step('close Collections panel after claim check', () => page.evaluate(() => {
    const panel = document.getElementById('side-panel');
    if (panel) {
      panel.classList.add('hidden');
      panel.dataset.active = '';
    }
  }));
  return { ...initial, ...claimed };
}

async function checkBuildRenovationPanel(page) {
  await step('close previous side panel before Build controls check', () => page.evaluate(() => {
    const panel = document.getElementById('side-panel');
    if (panel && !panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      panel.dataset.active = '';
    }
  }));
  await click(page, 'open Build panel for renovation controls', '[data-panel="build"]');
  await waitForSelector(page, 'wait for Build panel', '#side-panel:not(.hidden)', { timeout: UI_TIMEOUT });
  await click(page, 'open Build Renovate tab', '#side-panel [data-action="build-tab"][data-tab="renovate"]');
  const result = await step('read Build renovation controls', async () => page.evaluate(() => {
    const panel = document.getElementById('side-panel');
    return {
      activePanel: panel && panel.dataset.active,
      title: panel ? panel.textContent : '',
      renovationRows: document.querySelectorAll('#side-panel .renovation-room').length,
      resizeButtons: document.querySelectorAll('#side-panel [data-action="resize-room"]').length,
      furnishButtons: document.querySelectorAll('#side-panel [data-action="furnish-room"]').length,
      travelButtons: document.querySelectorAll('#side-panel [data-action="travel-floor"]').length,
      lotControls: document.querySelectorAll('#side-panel [data-action="expand-lot"]').length,
      hasStoreMode: Boolean(document.querySelector('#side-panel [data-action="toggle-store"]')),
    };
  }));

  if (result.activePanel !== 'build') fail(`Expected Build panel to be active: ${JSON.stringify(result)}`);
  if (!result.title.includes('Renovation')) fail(`Expected Build panel renovation section, found ${JSON.stringify(result.title)}`);
  if (result.renovationRows < 1 || result.resizeButtons < 2) fail(`Expected room resize controls in Build panel: ${JSON.stringify(result)}`);
  if (result.furnishButtons < 1) fail(`Expected Build panel to expose room furnishing presets: ${JSON.stringify(result)}`);
  if (result.travelButtons < 1) fail(`Expected Build panel to expose household floor travel controls: ${JSON.stringify(result)}`);
  if (result.lotControls < 1) fail(`Expected Build panel to expose land expansion controls: ${JSON.stringify(result)}`);
  if (!result.hasStoreMode) fail(`Expected Build panel to expose Store Mode: ${JSON.stringify(result)}`);
  return result;
}

async function checkFamilyAssignmentsPanel(page) {
  await step('seed household members for Social assignment controls', () => page.evaluate(() => {
    const state = window.Game.State.get();
    state.social.married = true;
    state.social.romanticTarget = 'npc_alex';
    state.character.spouse = 'npc_alex';
    window.Game.Family.ensureState();
    if (!state.family.members.some(member => member.id === 'child_ui')) {
      state.family.members.push({
        id: 'child_ui',
        name: 'Mina',
        role: 'child',
        lifeStage: 'child',
        dayJoined: state.time.day,
        needs: { hunger: 80, energy: 80, hygiene: 80, fun: 80, social: 80 },
      });
    }
  }));
  await step('close previous side panel before Social family controls check', () => page.evaluate(() => {
    const panel = document.getElementById('side-panel');
    if (panel && !panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      panel.dataset.active = '';
    }
  }));
  await click(page, 'open Social panel for family assignments', '[data-panel="social"]');
  await waitForSelector(page, 'wait for Social panel', '#side-panel:not(.hidden)', { timeout: UI_TIMEOUT });
  const initial = await step('read Social family assignment controls', async () => page.evaluate(() => {
    const panel = document.getElementById('side-panel');
    return {
      activePanel: panel && panel.dataset.active,
      title: panel ? panel.textContent : '',
      memberRows: document.querySelectorAll('#side-panel .family-member-row').length,
      assignmentLists: document.querySelectorAll('#side-panel .family-assignment-list').length,
      assignmentButtons: document.querySelectorAll('#side-panel .family-assignment-btn').length,
      enabledAssignments: document.querySelectorAll('#side-panel .family-assignment-btn:not([disabled])').length,
    };
  }));

  if (initial.activePanel !== 'social') fail(`Expected Social panel to be active: ${JSON.stringify(initial)}`);
  if (initial.memberRows < 2 || initial.assignmentLists < 2) fail(`Expected family member assignment rows: ${JSON.stringify(initial)}`);
  if (initial.assignmentButtons < 4 || initial.enabledAssignments < 2) fail(`Expected assignable family routine buttons: ${JSON.stringify(initial)}`);

  const assigned = await step('assign spouse routine through Social UI', () => page.evaluate(() => {
    const button = document.querySelector('#side-panel [data-family-member="spouse_npc_alex"] [data-routine-key="collect_objects"]');
    if (!button) return { clicked: false, reason: 'button missing' };
    button.click();
    const spouse = window.Game.State.get().family.members.find(member => member.id === 'spouse_npc_alex');
    return {
      clicked: true,
      activeRoutine: spouse && spouse.assignment && spouse.assignment.key,
      activeButtons: document.querySelectorAll('#side-panel .family-assignment-btn.active').length,
    };
  }));
  if (!assigned.clicked || assigned.activeRoutine !== 'collect_objects' || assigned.activeButtons < 1) {
    fail(`Expected Social routine button to assign and render active state: ${JSON.stringify(assigned)}`);
  }
  await step('close Social panel after family assignment check', () => page.evaluate(() => {
    const panel = document.getElementById('side-panel');
    if (panel) {
      panel.classList.add('hidden');
      panel.dataset.active = '';
    }
  }));
  return { ...initial, ...assigned };
}

async function checkMobileHudLayout(page) {
  await step('resize Electron viewport for mobile HUD check', () => page.setViewportSize({
    width: 390,
    height: 844,
  }));
  await page.waitForTimeout(250);

  const result = await step('read compact mobile HUD layout', () => page.evaluate(() => {
    const hud = document.getElementById('status-panel');
    const needs = document.getElementById('needs-bars');
    const bars = [...document.querySelectorAll('#needs-bars .need-bar')];
    const visibleButtons = [...document.querySelectorAll('.menu-bar button')]
      .filter(button => getComputedStyle(button).display !== 'none');
    const rowTops = [...new Set(bars.map(bar => Math.round(bar.getBoundingClientRect().top)))];
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hudHeight: Math.round(hud.getBoundingClientRect().height),
      needsHeight: Math.round(needs.getBoundingClientRect().height),
      needBars: bars.length,
      configuredNeeds: Object.keys(window.Game.Config.NEEDS).length,
      needRows: rowTops.length,
      visibleMenuButtons: visibleButtons.map(button => button.textContent.trim()),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }));

  if (result.needBars !== result.configuredNeeds) {
    fail(`Expected every need in the mobile HUD: ${JSON.stringify(result)}`);
  }
  if (result.needRows > 2 || result.needsHeight > 80) {
    fail(`Expected compact two-row mobile needs layout: ${JSON.stringify(result)}`);
  }
  if (result.hudHeight > 270) {
    fail(`Expected mobile HUD to stay at or below 270px: ${JSON.stringify(result)}`);
  }
  if (result.visibleMenuButtons.length !== 5) {
    fail(`Expected five persistent mobile menu buttons: ${JSON.stringify(result)}`);
  }
  if (result.horizontalOverflow > 0) {
    fail(`Expected no mobile horizontal overflow: ${JSON.stringify(result)}`);
  }
  return result;
}

async function openEditAvatarEditor(page) {
  await step('open Skills panel', async () => {
    const skillsPanelOpen = await page.evaluate(() => {
      const panel = document.getElementById('side-panel');
      return Boolean(panel && panel.dataset.active === 'skills' && !panel.classList.contains('hidden'));
    });
    if (!skillsPanelOpen) {
      await page.click('[data-panel="skills"]', { timeout: UI_TIMEOUT });
    }
  });
  await waitForSelector(page, 'wait for Skills panel', '#side-panel:not(.hidden)', { timeout: UI_TIMEOUT });
  await step('click Customise Sim button', async () => {
    const button = page.locator('#side-panel button').filter({ hasText: 'Customise Sim' }).first();
    await button.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
    await button.click({ timeout: UI_TIMEOUT });
  });
  await waitForSelector(page, 'wait for edit avatar editor', '#ec-avatar-editor .avatar-editor', { timeout: UI_TIMEOUT });
}

function legacyFormForAvatarForm(form) {
  return form === 'witch' ? 'online_witch' : form;
}

async function saveInGameAvatarForm(page, form, options = {}) {
  await openEditAvatarEditor(page);
  await click(page, `select ${form} avatar form in editor`, `#ec-avatar-editor [data-avatar-form="${form}"]`);

  if (options.primaryColorClick) {
    await click(page, 'open edit avatar color tab', '#ec-avatar-editor [data-avatar-tab="colors"]');
    await click(page, 'select edit avatar primary color', '#ec-avatar-editor [data-color-channel="primary"]');
  }

  await click(page, `save ${form} avatar editor changes`, '#btn-ec-save');
  await waitForGameFunction(page, `wait for saved ${form} avatar render`, (expected) => {
    const character = window.Game.State.get().character;
    const debug = window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug();
    if (!debug || debug.layerCount <= 0) return false;
    if (character.appearance.form !== expected.form) return false;
    if (character.form !== expected.legacyForm) return false;
    if (!debug.layers.some(layer => layer.textureKey && layer.textureKey.startsWith(expected.texturePrefix))) return false;
    if (expected.primaryColor && character.appearance.forms[expected.form].colors.primary !== expected.primaryColor) return false;
    if (expected.topTint !== undefined && !debug.layers.some(layer => layer.slot === 'top' && layer.tint === expected.topTint)) return false;
    return true;
  }, {
    form,
    legacyForm: legacyFormForAvatarForm(form),
    texturePrefix: `avatar_${form}_`,
    primaryColor: options.primaryColor,
    topTint: options.topTint,
  }, { timeout: RENDER_TIMEOUT });
}

async function checkPauseShell(page) {
  const before = await page.evaluate(() => window.Game.Main.getSpeed());
  await page.keyboard.press('Escape');
  await waitForSelector(page, 'wait for pause shell to open', '#pause-overlay:not(.hidden)', { timeout: UI_TIMEOUT });
  const paused = await page.evaluate(() => ({
    speed: window.Game.Main.getSpeed(),
    open: window.Game.Shell.isOpen(),
    title: document.getElementById('pause-title')?.textContent || '',
  }));
  await page.keyboard.press('Escape');
  await waitForGameFunction(page, 'wait for pause shell to close', () => (
    document.getElementById('pause-overlay')?.classList.contains('hidden') &&
    !window.Game.Shell.isOpen()
  ), null, { timeout: UI_TIMEOUT });
  const after = await page.evaluate(() => window.Game.Main.getSpeed());

  if (!paused.open || paused.speed !== 0) {
    fail(`Expected Escape to pause the simulation: ${JSON.stringify(paused)}`);
  }
  if (after !== before) {
    fail(`Expected resume to restore speed ${before}, found ${after}`);
  }
  return { before, paused, after };
}

async function checkGraphicsMode(page) {
  const initial = await page.evaluate(() => ({
    mode: window.Game.Main.getGraphicsMode(),
    stored: localStorage.getItem('graphicsQuality'),
    lowClass: document.body.classList.contains('low-graphics'),
    pressed: document.getElementById('btn-toggle-graphics')?.getAttribute('aria-pressed'),
  }));
  if (initial.mode !== 'low' || initial.stored !== 'low' || !initial.lowClass || initial.pressed !== 'false') {
    fail(`Expected stored low graphics mode to apply at boot: ${JSON.stringify(initial)}`);
  }

  await click(page, 'toggle enhanced graphics button', '#btn-toggle-graphics');
  await waitForGameFunction(page, 'wait for enhanced graphics mode', () => (
    window.Game.Main.getGraphicsMode() === 'high'
      && localStorage.getItem('graphicsQuality') === 'high'
      && !document.body.classList.contains('low-graphics')
      && document.getElementById('btn-toggle-graphics')?.getAttribute('aria-pressed') === 'true'
  ));

  await page.keyboard.press('l');
  await waitForGameFunction(page, 'wait for graphics keyboard toggle', () => (
    window.Game.Main.getGraphicsMode() === 'low'
      && localStorage.getItem('graphicsQuality') === 'low'
      && document.body.classList.contains('low-graphics')
  ));

  return page.evaluate(() => {
    window.Game.Main.setGraphicsMode('high');
    return {
      mode: window.Game.Main.getGraphicsMode(),
      stored: localStorage.getItem('graphicsQuality'),
      lowClass: document.body.classList.contains('low-graphics'),
    };
  });
}

async function checkLoadSlotJourney(page) {
  const fixture = await step('persist Load Game journey fixture', () => page.evaluate(() => {
    const state = window.Game.State.get();
    state.character.name = 'Load Journey Sim';
    state.economy.money = 4321;
    return {
      saved: window.Game.State.save(),
      slotId: window.Game.State.getActiveSlotId(),
      characterName: state.character.name,
      money: state.economy.money,
    };
  }));
  if (!fixture.saved || !fixture.slotId) {
    fail(`Expected the active world to persist before the Load Game journey: ${JSON.stringify(fixture)}`);
  }

  await step('reload Electron shell for Load Game journey', () => page.reload({
    waitUntil: 'domcontentloaded',
    timeout: STARTUP_TIMEOUT,
  }));
  await waitForSelector(page, 'wait for main menu after reload', '#main-menu-screen:not(.hidden)', { timeout: STARTUP_TIMEOUT });
  await click(page, 'open Load Game screen', '#btn-mm-load');
  await waitForSelector(page, 'wait for persisted save slot', '#load-game-screen:not(.hidden) .save-slot .btn-load', { timeout: UI_TIMEOUT });

  const slotSummary = await page.locator('#load-saves-list .save-slot').first().textContent();
  if (!slotSummary || !slotSummary.includes(fixture.characterName) || !slotSummary.includes(String(fixture.money))) {
    fail(`Expected the Load Game slot to show persisted metadata: ${JSON.stringify({ fixture, slotSummary })}`);
  }

  await click(page, 'load first persisted world', '#load-saves-list .save-slot .btn-load', { timeout: STARTUP_TIMEOUT });
  await waitForGameFunction(page, 'wait for loaded world gameplay', expected => {
    const state = window.Game?.State?.get?.();
    const canvas = document.getElementById('game-canvas');
    return state?.character?.name === expected.characterName
      && state?.economy?.money === expected.money
      && window.Game.State.getActiveSlotId() === expected.slotId
      && document.getElementById('load-game-screen')?.classList.contains('hidden')
      && canvas
      && canvas.clientWidth > 0
      && canvas.clientHeight > 0;
  }, fixture, { timeout: STARTUP_TIMEOUT });

  const rendered = await waitForCanvasNonBlank(page);
  return {
    ...fixture,
    rendered,
  };
}

function buildElectronLaunchArguments(port, softwareRendering, options = {}) {
  const platform = options.platform || process.platform;
  const ci = options.ci ?? Boolean(process.env.CI);
  return [
    // Hosted Linux runners do not configure Electron's SUID helper. Keep this
    // bypass confined to the isolated test process instead of production code.
    ...(platform === 'linux' && ci ? ['--no-sandbox'] : []),
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    ...(softwareRendering ? ['--disable-gpu', '--enable-unsafe-swiftshader'] : []),
    root,
  ];
}

async function checkElectronRuntime() {
  const electronExecutable = require("electron");
  const { chromium } = require("playwright");
  const softwareRendering = process.env.SIMLIFE_ELECTRON_GPU !== '1';
  const port = await getFreePort();
  const testUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'simlife-test-'));
  const electronArgs = buildElectronLaunchArguments(port, softwareRendering);
  const electronEnvironment = { ...process.env };
  delete electronEnvironment.SIMLIFE_TEST_RENDERER;
  delete electronEnvironment.SIMLIFE_TEST_USER_DATA;
  electronEnvironment.SIMLIFE_TEST_USER_DATA = testUserData;
  if (softwareRendering) electronEnvironment.SIMLIFE_TEST_RENDERER = 'canvas';
  let browser = null;
  let electronProcess = null;
  const electronStderr = [];
  const pageErrors = [];
  const consoleErrors = [];

  try {
    electronProcess = spawn(electronExecutable, electronArgs, {
      cwd: root,
      windowsHide: true,
      detached: process.platform === 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
      env: electronEnvironment,
    });
    electronProcess?.stderr?.on('data', chunk => electronStderr.push(String(chunk)));
    const endpoint = await waitForCdp(port);
    browser = await chromium.connectOverCDP(endpoint);
    const page = await findGamePage(browser);

    page.on('pageerror', err => pageErrors.push(String(err.stack || err.message || err)));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await step('wait for Electron DOMContentLoaded', () => page.waitForLoadState('domcontentloaded', { timeout: STARTUP_TIMEOUT }));

    await page.evaluate(() => localStorage.setItem('graphicsQuality', 'low'));

    await page.evaluate(() => {
      if (!window.Phaser || !window.Phaser.Game || window.__SIM_PERF_GAME_WRAPPED) return;
      const OriginalGame = window.Phaser.Game;
      function WrappedGame(config) {
        const game = new OriginalGame(config);
        window.__SIM_PHASER_GAME = game;
        return game;
      }
      WrappedGame.prototype = OriginalGame.prototype;
      Object.setPrototypeOf(WrappedGame, OriginalGame);
      window.Phaser.Game = WrappedGame;
      window.__SIM_PERF_GAME_WRAPPED = true;
    });

    await click(page, 'start new game from main menu', '#btn-mm-new');
    await waitForSelector(page, 'wait for character creation screen', '#char-creation-screen:not(.hidden)', { timeout: UI_TIMEOUT });
    await waitForSelector(page, 'wait for character creation avatar editor', '#cc-avatar-editor .avatar-editor', { timeout: UI_TIMEOUT });
    await click(page, 'select initial robot avatar form', '#cc-avatar-editor [data-avatar-form="robot"]');
    await click(page, 'open character creation color tab', '#cc-avatar-editor [data-avatar-tab="colors"]');
    await click(page, 'select character creation primary color', '#cc-avatar-editor [data-color-channel="primary"]');
    const avatarPreview = await step('verify layered character creation preview', () => page.evaluate(async () => {
      const images = [...document.querySelectorAll('#cc-avatar-editor .avatar-preview-layer')];
      await Promise.all(images.map(image => image.complete
        ? Promise.resolve()
        : new Promise(resolve => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        })));
      return {
        layers: images.length,
        loadedLayers: images.filter(image => image.naturalWidth > 0 && image.naturalHeight > 0).length,
        stageWidth: Math.round(document.querySelector('#cc-avatar-editor .avatar-preview-stage')?.getBoundingClientRect().width || 0),
        stageHeight: Math.round(document.querySelector('#cc-avatar-editor .avatar-preview-stage')?.getBoundingClientRect().height || 0),
      };
    }));
    if (avatarPreview.layers < 2 || avatarPreview.loadedLayers !== avatarPreview.layers || avatarPreview.stageHeight < 70) {
      fail(`Expected a loaded layered avatar preview: ${JSON.stringify(avatarPreview)}`);
    }
    await click(page, 'start gameplay from character creation', '#btn-cc-start', { timeout: STARTUP_TIMEOUT });
    await waitForGameFunction(page, 'wait for gameplay state, assets, and canvas', () => {
      const state = window.Game?.State?.get?.();
      const canvas = document.getElementById('game-canvas');
      return state &&
        Object.keys(window.SIM_PRELOADED_IMAGES || {}).length >= 40 &&
        canvas &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0;
    }, null, { timeout: STARTUP_TIMEOUT });

    const graphicsMode = await checkGraphicsMode(page);
    const canvasNonBlank = await waitForCanvasNonBlank(page);
    const outOfBoundsPathResult = await page.evaluate(() => new Promise(resolve => {
      try {
        window.Game.Renderer.findPath(999, 999, 1000, 1000, path => {
          resolve({ threw: false, path });
        });
      } catch (err) {
        resolve({ threw: true, message: String(err && (err.message || err)) });
      }
    }));
    const cameraControls = await checkCameraControls(page);
    await page.evaluate(() => window.Game.UI.updateStatusBars());
    const result = await page.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      const canvases = [...document.querySelectorAll('canvas')].map(item => ({
        id: item.id,
        width: item.width,
        height: item.height,
        clientWidth: item.clientWidth,
        clientHeight: item.clientHeight,
      }));
      return {
        canvases,
        assetKeys: Object.keys(window.SIM_ASSETS || {}).length,
        preloadedKeys: Object.keys(window.SIM_PRELOADED_IMAGES || {}).length,
        sceneChildren: window.__SIM_PHASER_GAME?.scene?.scenes?.[0]?.children?.list?.length || 0,
        initialAvatarDebug: window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug(),
        furnitureTextureReport: window.Game.Renderer.getFurnitureTextureReport && window.Game.Renderer.getFurnitureTextureReport(),
        campaignShell: {
          current: window.Game.Campaign?.getCurrentChapter?.()?.id || null,
          objective: document.querySelector('.campaign-objective')?.textContent || '',
          dailyKicker: document.querySelector('.daily-focus-kicker')?.textContent || '',
          dailyText: document.querySelector('.daily-focus-text')?.textContent || '',
        },
        activeFurniture: window.Game.State.getActiveMap().furniture.length,
        activeRooms: window.Game.State.getActiveMap().rooms.length,
        gameCanvasVisible: canvas.clientWidth > 0 && canvas.clientHeight > 0,
        menuHidden: document.getElementById('main-menu-screen').classList.contains('hidden'),
      };
    });
    result.canvasNonBlank = canvasNonBlank;
    result.testRenderingMode = softwareRendering ? 'deterministic canvas' : 'production default';
    result.rendererOverride = await page.evaluate(() => new URLSearchParams(window.location.search).get('renderer'));
    if (result.rendererOverride !== (softwareRendering ? 'canvas' : null)) {
      fail(`Expected an explicit renderer override only for software mode: ${JSON.stringify(result.rendererOverride)}`);
    }
    result.graphicsMode = graphicsMode;
    result.avatarPreview = avatarPreview;
    result.outOfBoundsPathResult = outOfBoundsPathResult;
    result.cameraControls = cameraControls;
    result.pauseShell = await checkPauseShell(page);
    result.objectMarketPanel = await checkObjectMarketPanel(page);
    result.collectionsPanel = await checkCollectionsPanel(page);
    result.goalsPanel = await checkGoalsPanel(page);
    result.buildRenovationPanel = await checkBuildRenovationPanel(page);
    result.familyAssignmentsPanel = await checkFamilyAssignmentsPanel(page);

    await saveInGameAvatarForm(page, 'cat');
    await openEditAvatarEditor(page);
    await click(page, 'select unsaved robot avatar form in editor', '#ec-avatar-editor [data-avatar-form="robot"]');
    await click(page, 'close edit avatar editor without saving', '#btn-ec-close');
    await waitForGameFunction(page, 'wait for unsaved edit close to preserve cat form', () => window.Game.State.get().character.appearance.form === 'cat', null, { timeout: UI_TIMEOUT });
    await saveInGameAvatarForm(page, 'human');
    await saveInGameAvatarForm(page, 'robot');
    await saveInGameAvatarForm(page, 'banana');
    await saveInGameAvatarForm(page, 'witch', {
      primaryColorClick: true,
      primaryColor: 'sky_denim',
      topTint: 0x3f7fb8,
    });

    if (pageErrors.length) fail(`Page errors:\n${pageErrors.join('\n')}`);
    if (consoleErrors.length) fail(`Console errors:\n${consoleErrors.join('\n')}`);
    if (result.canvases.length !== 1) fail(`Expected Phaser to use one canvas, found ${result.canvases.length}`);
    if (!result.gameCanvasVisible) fail('Expected #game-canvas to be visible and sized');
    if (!result.canvasNonBlank ||
      result.canvasNonBlank.coloredPixels < 20 ||
      result.canvasNonBlank.colorBuckets < 4 ||
      result.canvasNonBlank.lumaRange < 10) {
      fail(`Expected #game-canvas to contain varied rendered pixels: ${JSON.stringify(result.canvasNonBlank)}`);
    }
    if (result.preloadedKeys !== result.assetKeys) {
      fail(`Expected all embedded assets to preload (${result.assetKeys}), loaded ${result.preloadedKeys}`);
    }
    if (result.sceneChildren > 2000) {
      fail(`Expected starter scene to stay under 2000 Phaser children, found ${result.sceneChildren}`);
    }
    if (result.outOfBoundsPathResult.threw) {
      fail(`Expected out-of-bounds path requests to fail gracefully: ${result.outOfBoundsPathResult.message}`);
    }
    if (!result.initialAvatarDebug || result.initialAvatarDebug.layerCount <= 0) {
      fail(`Expected initial robot avatar to render layers: ${JSON.stringify(result.initialAvatarDebug)}`);
    }
    const initialMissingTextureKeys = result.initialAvatarDebug.missingTextureKeys || [];
    if (initialMissingTextureKeys.length) {
      fail(`Expected initial robot avatar to have no missing texture keys: ${initialMissingTextureKeys.join(', ')}`);
    }
    const initialAvatarLayers = result.initialAvatarDebug.layers || [];
    const initialLayersMissingTextureKeys = initialAvatarLayers
      .filter(layer => !layer.textureKey)
      .map(layer => layer.slot || layer.id || '<unknown>');
    if (initialLayersMissingTextureKeys.length) {
      fail(`Expected initial robot avatar layers to include texture keys, missing: ${initialLayersMissingTextureKeys.join(', ')}`);
    }
    if (!initialAvatarLayers.some(layer => layer.textureKey && layer.textureKey.startsWith('avatar_robot_'))) {
      fail(`Expected initial robot avatar layers to include avatar_robot_ texture keys: ${JSON.stringify(initialAvatarLayers)}`);
    }
    await page.evaluate(() => {
      const character = window.Game.State.get().character;
      character.targetPosition = {
        x: character.position.x - 1,
        y: character.position.y,
      };
    });
    await waitForGameFunction(page, 'wait for avatar facing NE with flipX', () => {
      const debug = window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug();
      return debug && debug.direction === 'NE' && debug.flipX === true;
    }, null, { timeout: RENDER_TIMEOUT });

    const glowCheckSpeed = await page.evaluate(() => {
      const character = window.Game.State.get().character;
      const speed = window.Game.Main.getSpeed();
      window.Game.Main.setSpeed(0);
      character.currentActivity = { type: 'verify_glow' };
      return speed;
    });
    await waitForGameFunction(page, 'wait for avatar activity glow to activate', () => {
      const debug = window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug();
      return debug && debug.activityGlowActive === true;
    }, null, { timeout: RENDER_TIMEOUT });

    await page.evaluate(() => {
      window.Game.State.get().character.currentActivity = null;
    });
    await waitForGameFunction(page, 'wait for avatar activity glow to clear', () => {
      const debug = window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug();
      return debug && debug.activityGlowActive === false;
    }, null, { timeout: RENDER_TIMEOUT });
    await page.evaluate(speed => window.Game.Main.setSpeed(speed), glowCheckSpeed);

    if (result.activeFurniture < 30) fail(`Expected starter world furniture, found ${result.activeFurniture}`);
    if (result.activeRooms < 3) fail(`Expected starter rooms, found ${result.activeRooms}`);
    if (!result.menuHidden) fail('Expected main menu to hide after starting the game');
    if (!result.campaignShell.current || !result.campaignShell.objective) {
      fail(`Expected an active campaign objective in the HUD: ${JSON.stringify(result.campaignShell)}`);
    }
    if (!result.furnitureTextureReport || result.furnitureTextureReport.uniqueTextureCount < 30) {
      fail(`Expected at least 30 distinct furniture texture mappings: ${JSON.stringify(result.furnitureTextureReport)}`);
    }
    if (result.furnitureTextureReport.generatedTextureCount < 28) {
      fail(`Expected generated household art across at least 28 furniture categories: ${JSON.stringify(result.furnitureTextureReport)}`);
    }
    if (result.campaignShell.dailyKicker.startsWith('Chapter')) {
      fail(`Expected Daily Focus to remain contextual instead of duplicating the campaign chip: ${JSON.stringify(result.campaignShell)}`);
    }
    result.loadSlotJourney = await checkLoadSlotJourney(page);
    if (pageErrors.length) fail(`Page errors:\n${pageErrors.join('\n')}`);
    if (consoleErrors.length) fail(`Console errors:\n${consoleErrors.join('\n')}`);
    result.mobileHud = await checkMobileHudLayout(page);

    return result;
  } catch (error) {
    if (electronStderr.length) process.stderr.write(`[electron]\n${electronStderr.join('')}\n`);
    throw error;
  } finally {
    // Kill the Windows process tree while its root PID still exists. Closing the
    // CDP browser first can let Electron exit ahead of orphaned helper processes.
    await stopProcessTree(electronProcess);
    try {
      await browser?.close();
    } catch (_) {
      // The explicit process-tree cleanup above is authoritative on Windows.
    }
    const resolvedTemp = path.resolve(os.tmpdir());
    const resolvedUserData = path.resolve(testUserData);
    if (resolvedUserData.startsWith(resolvedTemp + path.sep) && path.basename(resolvedUserData).startsWith('simlife-test-')) {
      let cleaned = false;
      for (let attempt = 0; attempt < 8 && !cleaned; attempt++) {
        try {
          fs.rmSync(resolvedUserData, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
          cleaned = true;
        } catch (error) {
          if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code)) throw error;
          await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }
      if (!cleaned) console.warn(`Electron assertions passed, but deferred temp cleanup: ${resolvedUserData}`);
    }
  }
}

module.exports = { buildElectronLaunchArguments, checkElectronRuntime };
