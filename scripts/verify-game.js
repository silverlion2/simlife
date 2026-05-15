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

function checkRendererMathHelpers() {
  const context = loadBrowserGlobals(['js/renderer_math.js']);
  const math = context.Game.RendererMath;

  if (!math) fail('Expected Game.RendererMath to be defined');
  if (math.TILE_W !== 64) fail(`Expected TILE_W to be 64, found ${math.TILE_W}`);
  if (math.TILE_H !== 32) fail(`Expected TILE_H to be 32, found ${math.TILE_H}`);

  math.setOffset(512, 200);
  const projected = math.isoProject(3, 5, 2);
  if (projected.x !== 448 || projected.y !== 264) {
    fail(`Unexpected projection result: ${JSON.stringify(projected)}`);
  }

  const unprojected = math.isoUnproject(projected.x, projected.y, 2);
  if (Math.abs(unprojected.x - 3) > 0.0001 || Math.abs(unprojected.y - 5) > 0.0001) {
    fail(`Unexpected unprojection result: ${JSON.stringify(unprojected)}`);
  }
}

function checkRendererDataHelpers() {
  const context = loadBrowserGlobals(['js/renderer_helpers.js']);
  const helpers = context.Game.RendererHelpers;

  if (!helpers) fail('Expected Game.RendererHelpers to be defined');

  const furnitureConfig = {
    sofa: { w: 2, h: 1 },
    table: { w: 1, h: 2, blocksPath: false },
    rug: { w: 2, h: 2 },
  };
  const map = {
    lotWidth: 5,
    lotHeight: 4,
    rooms: [{ id: 'room_0', x: 1, y: 1, w: 2, h: 2 }],
    furniture: [
      { id: 'f1', type: 'sofa', x: 2, y: 1 },
      { id: 'f2', type: 'table', x: 0, y: 0 },
      { id: 'f3', type: 'rug', x: 1, y: 3 },
    ],
  };

  const footprint = helpers.getFurnitureFootprint(map.furniture[0], furnitureConfig.sofa);
  if (footprint.w !== 2 || footprint.h !== 1) {
    fail(`Unexpected furniture footprint: ${JSON.stringify(footprint)}`);
  }

  const rotated = helpers.getFurnitureFootprint({ type: 'sofa', x: 1, y: 2, rotated: true }, furnitureConfig.sofa);
  if (rotated.w !== 1 || rotated.h !== 2) {
    fail(`Expected rotated footprint 1x2, found ${JSON.stringify(rotated)}`);
  }

  const hit = helpers.hitTestFurniture(map, furnitureConfig, 3, 1);
  if (!hit || hit.id !== 'f1') fail(`Expected hit f1, found ${JSON.stringify(hit)}`);
  if (hit === map.furniture[0]) fail('Expected hit furniture to be a copy, not the state object');
  if (hit.config !== furnitureConfig.sofa) fail('Expected hit furniture copy to include furniture config');

  const room = helpers.hitTestRoom(map, 2, 2);
  if (!room || room.id !== 'room_0') fail(`Expected room_0, found ${JSON.stringify(room)}`);

  const grid = helpers.buildPathGrid(map, furnitureConfig);
  if (grid.length !== 4 || grid[0].length !== 5) fail('Unexpected path grid dimensions');
  if (grid[1][2] !== 1 || grid[1][3] !== 1) fail(`Expected sofa footprint to block path: ${JSON.stringify(grid[1])}`);
  if (grid[0][0] !== 0) fail('Expected blocksPath:false furniture not to block path');
  if (grid[3][1] !== 0 || grid[3][2] !== 0) fail(`Expected rug-like furniture not to block path: ${JSON.stringify(grid[3])}`);
}

function checkAppearanceHelpers() {
  const context = loadBrowserGlobals(['js/avatar_catalog.js', 'js/appearance.js']);
  const catalog = context.Game.AvatarCatalog;
  const appearance = context.Game.Appearance;

  if (!catalog) fail('Expected Game.AvatarCatalog to be defined');
  if (!appearance) fail('Expected Game.Appearance to be defined');

  const forms = Object.keys(catalog.FORMS);
  const expectedForms = ['human', 'witch', 'robot', 'cat', 'banana'];
  for (const form of expectedForms) {
    if (!forms.includes(form)) fail(`Missing avatar form: ${form}`);
    const normalized = appearance.normalizeAppearance({ form });
    if (normalized.form !== form) fail(`Expected normalized form ${form}, found ${normalized.form}`);
    if (!normalized.forms[form]) fail(`Expected form state for ${form}`);
  }

  const migrated = appearance.fromLegacy({ form: 'online_witch', color: 0x3366aa });
  if (migrated.form !== 'witch') fail(`Expected online_witch to migrate to witch, found ${migrated.form}`);
  if (migrated.forms.witch.colors.primary !== '#3366aa') {
    fail(`Expected legacy color #3366aa, found ${migrated.forms.witch.colors.primary}`);
  }

  const human = appearance.normalizeAppearance({ form: 'human' });
  const changed = appearance.setSlot(human, 'top', 'human_top_jacket');
  if (changed.forms.human.slots.top !== 'human_top_jacket') {
    fail(`Expected top to change, found ${changed.forms.human.slots.top}`);
  }

  const cat = appearance.setForm(changed, 'cat');
  if (cat.form !== 'cat') fail(`Expected active form cat, found ${cat.form}`);
  if (cat.forms.human.slots.top !== 'human_top_jacket') fail('Expected human slot selections to persist across form switch');

  const layers = appearance.getRenderLayers(cat, 'S');
  if (!layers.length) fail('Expected cat render layers');
  if (!layers.every(layer => layer.textureKey && layer.slot && Number.isFinite(layer.order))) {
    fail(`Invalid render layers: ${JSON.stringify(layers)}`);
  }

  const injectedSlots = appearance.normalizeAppearance({
    form: 'human',
    forms: {
      human: {
        slots: {
          ...human.forms.human.slots,
          coat: 'cat_coat_tabby',
          madeUp: 'human_top_jacket',
        },
      },
    },
  });
  if (Object.prototype.hasOwnProperty.call(injectedSlots.forms.human.slots, 'coat')) {
    fail(`Expected invalid cross-form slot to be pruned: ${JSON.stringify(injectedSlots.forms.human.slots)}`);
  }
  if (Object.prototype.hasOwnProperty.call(injectedSlots.forms.human.slots, 'madeUp')) {
    fail(`Expected unknown slot to be pruned: ${JSON.stringify(injectedSlots.forms.human.slots)}`);
  }

  const injectedLayers = appearance.getRenderLayers({
    form: 'human',
    forms: {
      human: {
        slots: {
          ...human.forms.human.slots,
          coat: 'cat_coat_tabby',
          top: 'cat_coat_tabby',
        },
      },
    },
  }, 'S');
  if (injectedLayers.some(layer => layer.id === 'cat_coat_tabby' || layer.slot === 'coat')) {
    fail(`Expected cross-form injected layers to be filtered: ${JSON.stringify(injectedLayers)}`);
  }

  const invalidChannel = appearance.setColor(human, 'notAChannel', '#123456');
  if (Object.prototype.hasOwnProperty.call(invalidChannel.forms.human.colors, 'notAChannel')) {
    fail(`Expected invalid color channel to be ignored: ${JSON.stringify(invalidChannel.forms.human.colors)}`);
  }

  const invalidValue = appearance.setColor(human, 'primary', 'not_a_color');
  if (invalidValue.forms.human.colors.primary !== human.forms.human.colors.primary) {
    fail(`Expected invalid color value to be ignored, found ${invalidValue.forms.human.colors.primary}`);
  }

  const tokenValue = appearance.setColor(human, 'primary', 'steel_blue');
  if (tokenValue.forms.human.colors.primary !== 'steel_blue') fail('Expected known palette token color to be accepted');

  for (const [paletteName, tokens] of Object.entries(catalog.PALETTES)) {
    for (const token of tokens) {
      if (!catalog.COLOR_VALUES[token] || !/^#[0-9a-f]{6}$/i.test(catalog.COLOR_VALUES[token])) {
        fail(`Palette token ${paletteName}.${token} does not resolve to a concrete color`);
      }
    }
  }
}

function checkResources() {
  const context = loadBrowserGlobals(['js/assets.js', 'js/avatar_assets.js', 'js/config.js']);
  const assetKeys = Object.keys(context.SIM_ASSETS || {});
  const avatarAssetKeys = Object.keys(context.SIM_AVATAR_ASSETS || {});
  const furnitureKeys = Object.keys(context.Game.Config.FURNITURE || {});
  const pngCount = countFiles(path.join(root, 'assets'), '.png');

  if (assetKeys.length < 40) fail(`Expected at least 40 embedded render assets, found ${assetKeys.length}`);
  if (avatarAssetKeys.length < 250) fail(`Expected at least 250 avatar layer assets, found ${avatarAssetKeys.length}`);
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

  const requiredAvatarKeys = [
    'avatar_human_body_average_S',
    'avatar_human_top_hoodie_S',
    'avatar_witch_hat_witch_hat_S',
    'avatar_robot_chassis_round_S',
    'avatar_cat_coat_tabby_S',
    'avatar_banana_peel_classic_S',
  ];
  const missingAvatar = requiredAvatarKeys.filter(key => !context.SIM_AVATAR_ASSETS[key]);
  if (missingAvatar.length) fail(`Missing avatar texture keys: ${missingAvatar.join(', ')}`);

  return { assetKeys: assetKeys.length, avatarAssetKeys: avatarAssetKeys.length, furnitureTypes: furnitureKeys.length, pngResources: pngCount };
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
  checkRendererMathHelpers();
  checkRendererDataHelpers();
  checkAppearanceHelpers();
  const resources = checkResources();
  const runtime = await checkElectronRuntime();
  console.log(JSON.stringify({ ok: true, resources, runtime }, null, 2));
})().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
