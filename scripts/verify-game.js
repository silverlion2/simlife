const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '..');

function fail(message) {
  throw new Error(message);
}

function checkSyntax() {
  const files = [
    'main.js',
    'preload.js',
    ...fs.readdirSync(path.join(root, 'js'))
      .filter(file => file.endsWith('.js'))
      .map(file => path.join('js', file)),
  ];

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      fail(`Syntax check failed for ${file}\n${result.stderr || result.stdout}`);
    }
  }
}

function loadBrowserGlobals(files) {
  const context = { console };
  context.window = context;
  context.document = {};
  context.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  vm.createContext(context);

  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }

  return context;
}

function checkResources() {
  const context = loadBrowserGlobals(['js/assets.js', 'js/config.js']);
  const assetKeys = Object.keys(context.SIM_ASSETS || {});
  const furnitureKeys = Object.keys(context.Game.Config.FURNITURE || {});
  const pngCount = countFiles(path.join(root, 'assets'), '.png');

  if (assetKeys.length < 40) fail(`Expected at least 40 embedded render assets, found ${assetKeys.length}`);
  if (furnitureKeys.length < 70) fail(`Expected at least 70 furniture types, found ${furnitureKeys.length}`);
  if (pngCount < 1000) fail(`Expected an abundant PNG resource library, found ${pngCount}`);

  const requiredTextureKeys = [
    'floor',
    'planks',
    'wall_e',
    'wall_n',
    'new_iso_human',
    'online_witch_iso',
    'crate',
    'hay',
    'hayStack',
    'displayCase',
    'longTable',
    'libraryChair',
    'subway_turnstile',
    'map_portal',
  ];
  const missing = requiredTextureKeys.filter(key => !context.SIM_ASSETS[key]);
  if (missing.length) fail(`Missing embedded texture keys: ${missing.join(', ')}`);

  return { assetKeys: assetKeys.length, furnitureTypes: furnitureKeys.length, pngResources: pngCount };
}

function countFiles(dir, ext) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(fullPath, ext);
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ext) count++;
  }
  return count;
}

async function checkElectronRuntime() {
  const app = await electron.launch({ args: [root] });
  const page = await app.firstWindow({ timeout: 60000 });
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', err => pageErrors.push(String(err.stack || err.message || err)));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 });

    await page.click('#btn-mm-new');
    await page.waitForSelector('#char-creation-screen:not(.hidden)', { timeout: 10000 });
    await page.click('#btn-cc-start');
    await page.waitForFunction(() => {
      const state = window.Game?.State?.get?.();
      const canvas = document.getElementById('game-canvas');
      return state &&
        Object.keys(window.SIM_PRELOADED_IMAGES || {}).length >= 40 &&
        canvas &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0;
    }, null, { timeout: 60000 });

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
        activeFurniture: window.Game.State.getActiveMap().furniture.length,
        activeRooms: window.Game.State.getActiveMap().rooms.length,
        gameCanvasVisible: canvas.clientWidth > 0 && canvas.clientHeight > 0,
        menuHidden: document.getElementById('main-menu-screen').classList.contains('hidden'),
      };
    });

    if (pageErrors.length) fail(`Page errors:\n${pageErrors.join('\n')}`);
    if (consoleErrors.length) fail(`Console errors:\n${consoleErrors.join('\n')}`);
    if (result.canvases.length !== 1) fail(`Expected Phaser to use one canvas, found ${result.canvases.length}`);
    if (!result.gameCanvasVisible) fail('Expected #game-canvas to be visible and sized');
    if (result.preloadedKeys !== result.assetKeys) {
      fail(`Expected all embedded assets to preload (${result.assetKeys}), loaded ${result.preloadedKeys}`);
    }
    if (result.activeFurniture < 30) fail(`Expected starter world furniture, found ${result.activeFurniture}`);
    if (result.activeRooms < 3) fail(`Expected starter rooms, found ${result.activeRooms}`);
    if (!result.menuHidden) fail('Expected main menu to hide after starting the game');

    return result;
  } finally {
    await app.close();
  }
}

(async () => {
  checkSyntax();
  const resources = checkResources();
  const runtime = await checkElectronRuntime();
  console.log(JSON.stringify({ ok: true, resources, runtime }, null, 2));
})().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
