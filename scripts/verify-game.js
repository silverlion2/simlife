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

function loadBrowserGlobals(files, globals = {}) {
  const context = { console, ...globals };
  const localStorageData = {};
  context.window = context;
  context.document = context.document || {};
  context.localStorage = {
    getItem: key => Object.prototype.hasOwnProperty.call(localStorageData, key) ? localStorageData[key] : null,
    setItem: (key, value) => { localStorageData[key] = String(value); },
    removeItem: key => { delete localStorageData[key]; },
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

class MockImage {
  constructor(x, y, textureKey) {
    this.x = x;
    this.y = y;
    this.texture = { key: textureKey };
    this.tintTopLeft = null;
    this.destroyed = false;
  }

  setOrigin(x, y) {
    this.originX = x;
    this.originY = y;
    return this;
  }

  setScale(x, y) {
    this.scaleX = x;
    this.scaleY = y === undefined ? x : y;
    return this;
  }

  setTint(value) {
    this.tintTopLeft = value;
    return this;
  }

  clearTint() {
    this.tintTopLeft = null;
    return this;
  }

  destroy() {
    this.destroyed = true;
  }
}

class MockContainer {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.list = [];
    this.destroyed = false;
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  add(item) {
    this.list.push(item);
    return this;
  }

  removeAll(destroyChildren) {
    if (destroyChildren) this.list.forEach(item => item.destroy && item.destroy());
    this.list = [];
    return this;
  }

  sort(prop) {
    this.list.sort((a, b) => (a[prop] || 0) - (b[prop] || 0));
    return this;
  }

  destroy() {
    this.destroyed = true;
    this.removeAll(true);
  }
}

function createMockAvatarScene(textureKeys) {
  const textureKeySet = new Set(textureKeys);
  return {
    textures: {
      exists: key => textureKeySet.has(key),
    },
    add: {
      image: (x, y, key) => new MockImage(x, y, key),
      container: (x, y) => new MockContainer(x, y),
    },
  };
}

function resolveColorValue(catalog, value) {
  const resolved = catalog.COLOR_VALUES[value] || value;
  return Number.parseInt(String(resolved).replace('#', ''), 16);
}

function checkAvatarRendererBehavior() {
  const context = loadBrowserGlobals(['js/avatar_catalog.js', 'js/appearance.js', 'js/avatar_renderer.js']);
  const catalog = context.Game.AvatarCatalog;
  const appearance = context.Game.Appearance;
  const renderer = context.Game.AvatarRenderer;

  if (!renderer) fail('Expected Game.AvatarRenderer to be defined');

  const customHuman = appearance.setColor(
    appearance.setColor(
      appearance.normalizeAppearance({ form: 'human' }),
      'skin',
      'cool_deep'
    ),
    'primary',
    '#112233'
  );
  const layers = appearance.getRenderLayers(customHuman, 'S');
  const textureKeys = layers.map(layer => layer.textureKey);

  const missingScene = createMockAvatarScene(textureKeys.slice(1));
  const missingInstance = renderer.create(missingScene);
  const missingResult = renderer.sync(missingInstance, { appearance: customHuman }, 10, 20, 'S');
  if (missingResult !== null) {
    fail('Expected avatar renderer to return null when any requested layer texture is missing');
  }
  if (missingInstance.layerCount !== 0 || missingInstance.container) {
    fail(`Expected missing avatar render to clear container state, found layerCount=${missingInstance.layerCount}`);
  }

  const scene = createMockAvatarScene(textureKeys);
  const instance = renderer.create(scene);
  const result = renderer.sync(instance, { appearance: customHuman }, 10, 20, 'S');
  if (!result || instance.layerCount !== layers.length) {
    fail(`Expected all avatar layers to render, found layerCount=${instance.layerCount}`);
  }

  const bodyLayer = instance.layerMap.get('body');
  const topLayer = instance.layerMap.get('top');
  if (!bodyLayer) fail('Expected rendered avatar body layer');
  if (!topLayer) fail('Expected rendered avatar top layer');

  const expectedSkinTint = resolveColorValue(catalog, 'cool_deep');
  const expectedPrimaryTint = resolveColorValue(catalog, '#112233');
  if (bodyLayer.tintTopLeft !== expectedSkinTint) {
    fail(`Expected body layer skin tint ${expectedSkinTint}, found ${bodyLayer.tintTopLeft}`);
  }
  if (topLayer.tintTopLeft !== expectedPrimaryTint) {
    fail(`Expected top layer primary tint ${expectedPrimaryTint}, found ${topLayer.tintTopLeft}`);
  }
}

function checkRendererAvatarPreloadFailures() {
  const addedTextures = {};
  const context = loadBrowserGlobals(['js/renderer_math.js', 'js/renderer_helpers.js', 'js/renderer.js'], {
    console: { log: () => {}, error: () => {}, warn: () => {} },
    SIM_ASSETS: { base_missing: 'base-missing.png' },
    SIM_AVATAR_ASSETS: { avatar_missing: 'avatar-missing.png' },
    SIM_PRELOADED_IMAGES: {},
    SIM_PRELOADED_AVATAR_IMAGES: { avatar_blank: { naturalWidth: 0, width: 0 } },
    innerWidth: 800,
    addEventListener: () => {},
    document: {
      body: { clientWidth: 800, clientHeight: 600 },
      querySelector: () => null,
      getElementById: () => ({
        style: {},
        parentElement: { clientWidth: 800, clientHeight: 600 },
      }),
    },
    Phaser: {
      WEBGL: 'WEBGL',
      Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
      Scene: class {},
      Game: class {
        constructor(config) {
          this.config = config;
          const scene = new config.scene();
          scene.textures = {
            addImage: (key, image) => {
              addedTextures[key] = image;
            },
          };
          scene.preload();
        }
      },
    },
    Image: class {
      set src(value) {
        this._src = value;
        if (this.onerror) this.onerror(new Error(`mock failed: ${value}`));
      }
    },
  });

  vm.runInContext('Game.Renderer.init(document.getElementById("game-canvas"));', context);

  if (!Object.prototype.hasOwnProperty.call(context.window.SIM_PRELOADED_IMAGES, 'base_missing')) {
    fail('Expected failed base asset to keep legacy blank-image fallback');
  }
  if (Object.prototype.hasOwnProperty.call(context.window.SIM_PRELOADED_AVATAR_IMAGES, 'avatar_missing')) {
    fail('Expected failed avatar asset to remain absent from preloaded avatar images');
  }
  if (Object.prototype.hasOwnProperty.call(addedTextures, 'avatar_blank')) {
    fail('Expected blank avatar image to be skipped during Phaser preload');
  }
  if (Object.prototype.hasOwnProperty.call(context.window.SIM_PRELOADED_AVATAR_IMAGES, 'avatar_blank')) {
    fail('Expected blank avatar image to be removed during Phaser preload');
  }
}

function checkStateAppearanceMigration() {
  const context = loadBrowserGlobals([
    'js/config.js',
    'js/avatar_catalog.js',
    'js/appearance.js',
    'js/state.js',
  ]);

  const state = context.Game.State.get();
  if (!state.character.appearance) fail('Expected new state character.appearance');
  if (state.character.appearance.form !== 'witch') fail(`Expected default form witch, found ${state.character.appearance.form}`);

  const slotId = context.Game.State.createSave('World', {
    name: 'Tester',
    trait: 'neat',
    form: 'robot',
    color: '#44aaee',
    appearance: context.Game.Appearance.setForm(state.character.appearance, 'robot'),
  });
  if (!slotId) fail('Expected createSave to return slot id');
  const created = context.Game.State.get().character;
  if (created.appearance.form !== 'robot') fail(`Expected created appearance robot, found ${created.appearance.form}`);
  if (created.name !== 'Tester') fail(`Expected character name Tester, found ${created.name}`);

  const blackSlotId = context.Game.State.createSave('Black World', {
    name: 'Black',
    trait: 'neat',
    form: 'robot',
    color: 0x000000,
  });
  if (!blackSlotId) fail('Expected black createSave to return slot id');
  const blackCreated = context.Game.State.get().character;
  if (blackCreated.color !== 0x000000) fail(`Expected created black color 0, found ${blackCreated.color}`);
  if (blackCreated.appearance.forms.robot.colors.primary !== '#000000') {
    fail(`Expected created black appearance #000000, found ${blackCreated.appearance.forms.robot.colors.primary}`);
  }

  context.localStorage.setItem('legacy_black', JSON.stringify({
    character: {
      name: 'Legacy Black',
      trait: 'neat',
      form: 'robot',
      color: 0x000000,
    },
  }));
  if (!context.Game.State.loadSlot('legacy_black')) fail('Expected legacy black slot to load');
  const blackLoaded = context.Game.State.get().character;
  if (blackLoaded.color !== 0x000000) fail(`Expected loaded black color 0, found ${blackLoaded.color}`);
  if (blackLoaded.appearance.forms.robot.colors.primary !== '#000000') {
    fail(`Expected loaded black appearance #000000, found ${blackLoaded.appearance.forms.robot.colors.primary}`);
  }

  const appearanceOnly = context.Game.Appearance.setColor(
    context.Game.Appearance.normalizeAppearance({ form: 'robot' }),
    'primary',
    '#000000'
  );
  const appearanceOnlySlotId = context.Game.State.createSave('Appearance Only', {
    name: 'Appearance Only',
    trait: 'neat',
    appearance: appearanceOnly,
  });
  const appearanceOnlyPayload = JSON.parse(context.localStorage.getItem(appearanceOnlySlotId));
  if (appearanceOnlyPayload.character.appearance.form !== 'robot') {
    fail(`Expected persisted appearance form robot, found ${appearanceOnlyPayload.character.appearance.form}`);
  }
  if (appearanceOnlyPayload.character.form !== 'robot') {
    fail(`Expected persisted legacy form robot, found ${appearanceOnlyPayload.character.form}`);
  }
  if (appearanceOnlyPayload.character.color !== 0x000000) {
    fail(`Expected persisted legacy color 0, found ${appearanceOnlyPayload.character.color}`);
  }
  if (appearanceOnlyPayload.character.appearance.forms.robot.colors.primary !== '#000000') {
    fail(`Expected persisted appearance primary #000000, found ${appearanceOnlyPayload.character.appearance.forms.robot.colors.primary}`);
  }

  const witchSlotId = context.Game.State.createSave('Witch Appearance', {
    name: 'Witch Appearance',
    trait: 'neat',
    appearance: context.Game.Appearance.normalizeAppearance({ form: 'witch' }),
  });
  const witchPayload = JSON.parse(context.localStorage.getItem(witchSlotId));
  if (witchPayload.character.form !== 'online_witch') {
    fail(`Expected persisted witch legacy form online_witch, found ${witchPayload.character.form}`);
  }

  context.localStorage.setItem('transitional_black', JSON.stringify({
    character: {
      name: 'Transitional Black',
      trait: 'neat',
      form: 'robot',
      color: 0x000000,
      appearance: { form: 'robot' },
    },
  }));
  if (!context.Game.State.loadSlot('transitional_black')) fail('Expected transitional black slot to load');
  const transitionalLoaded = context.Game.State.get().character;
  if (transitionalLoaded.color !== 0x000000) fail(`Expected transitional black color 0, found ${transitionalLoaded.color}`);
  if (transitionalLoaded.appearance.forms.robot.colors.primary !== '#000000') {
    fail(`Expected transitional black appearance #000000, found ${transitionalLoaded.appearance.forms.robot.colors.primary}`);
  }
}

function checkResources() {
  const context = loadBrowserGlobals(['js/assets.js', 'js/avatar_catalog.js', 'js/avatar_assets.js', 'js/config.js']);
  const assetKeys = Object.keys(context.SIM_ASSETS || {});
  const avatarAssetKeys = Object.keys(context.SIM_AVATAR_ASSETS || {});
  const expectedAvatarKeys = Object.values(context.Game.AvatarCatalog.ITEMS)
    .flatMap(item => Object.values(item.textures));
  const expectedAvatarKeySet = new Set(expectedAvatarKeys);
  const avatarAssetKeySet = new Set(avatarAssetKeys);
  const expectedAvatarPngNames = expectedAvatarKeys.map(key => `${key}.png`);
  const expectedAvatarPngNameSet = new Set(expectedAvatarPngNames);
  const furnitureKeys = Object.keys(context.Game.Config.FURNITURE || {});
  const pngCount = countFiles(path.join(root, 'assets'), '.png');
  const avatarLayerPngNames = listPngFiles(path.join(root, 'assets', 'avatar_layers'));
  const avatarLayerPngNameSet = new Set(avatarLayerPngNames);

  if (assetKeys.length < 40) fail(`Expected at least 40 embedded render assets, found ${assetKeys.length}`);
  if (furnitureKeys.length < 70) fail(`Expected at least 70 furniture types, found ${furnitureKeys.length}`);
  if (pngCount < 1000) fail(`Expected an abundant PNG resource library, found ${pngCount}`);
  const missingAvatarPngs = expectedAvatarPngNames.filter(name => !avatarLayerPngNameSet.has(name));
  if (missingAvatarPngs.length) fail(`Missing avatar layer PNGs: ${missingAvatarPngs.join(', ')}`);

  const extraAvatarPngs = avatarLayerPngNames.filter(name => !expectedAvatarPngNameSet.has(name));
  if (extraAvatarPngs.length) fail(`Unexpected avatar layer PNGs: ${extraAvatarPngs.join(', ')}`);

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

  const missingAvatar = expectedAvatarKeys.filter(key => !avatarAssetKeySet.has(key));
  if (missingAvatar.length) fail(`Missing avatar texture keys: ${missingAvatar.join(', ')}`);

  const extraAvatar = avatarAssetKeys.filter(key => !expectedAvatarKeySet.has(key));
  if (extraAvatar.length) fail(`Unexpected avatar texture keys: ${extraAvatar.join(', ')}`);

  return {
    assetKeys: assetKeys.length,
    avatarAssetKeys: avatarAssetKeys.length,
    avatarLayerPngs: avatarLayerPngNames.length,
    furnitureTypes: furnitureKeys.length,
    pngResources: pngCount,
  };
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

function listPngFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.png')
    .map(entry => entry.name);
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
    await page.waitForSelector('#cc-avatar-editor .avatar-editor', { timeout: 10000 });
    await page.click('#cc-avatar-editor [data-avatar-form="robot"]');
    await page.click('#cc-avatar-editor [data-avatar-tab="colors"]');
    await page.click('#cc-avatar-editor [data-color-channel="primary"]');
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
        initialAvatarDebug: window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug(),
        activeFurniture: window.Game.State.getActiveMap().furniture.length,
        activeRooms: window.Game.State.getActiveMap().rooms.length,
        gameCanvasVisible: canvas.clientWidth > 0 && canvas.clientHeight > 0,
        menuHidden: document.getElementById('main-menu-screen').classList.contains('hidden'),
      };
    });

    await page.evaluate(() => Game.UI.openEditModal());
    await page.waitForSelector('#ec-avatar-editor .avatar-editor', { timeout: 10000 });
    await page.click('#ec-avatar-editor [data-avatar-form="cat"]');
    await page.click('#btn-ec-save');
    await page.waitForFunction(() => {
      const character = window.Game.State.get().character;
      const debug = window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug();
      return character.appearance.form === 'cat' &&
        debug &&
        debug.layerCount > 0 &&
        debug.layers.some(layer => layer.textureKey && layer.textureKey.startsWith('avatar_cat_'));
    }, null, { timeout: 10000 });
    await page.evaluate(() => Game.UI.openEditModal());
    await page.waitForSelector('#ec-avatar-editor .avatar-editor', { timeout: 10000 });
    await page.click('#ec-avatar-editor [data-avatar-form="robot"]');
    await page.click('#btn-ec-close');
    await page.waitForFunction(() => window.Game.State.get().character.appearance.form === 'cat', null, { timeout: 10000 });
    await page.evaluate(() => Game.UI.openEditModal());
    await page.waitForSelector('#ec-avatar-editor .avatar-editor', { timeout: 10000 });
    await page.click('#ec-avatar-editor [data-avatar-form="witch"]');
    await page.click('#ec-avatar-editor [data-avatar-tab="colors"]');
    await page.click('#ec-avatar-editor [data-color-channel="primary"]');
    await page.click('#btn-ec-save');
    await page.waitForFunction(() => {
      const character = window.Game.State.get().character;
      const debug = window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug();
      return character.appearance.form === 'witch' &&
        character.form === 'online_witch' &&
        character.appearance.forms.witch.colors.primary === 'sky_denim' &&
        debug &&
        debug.layerCount > 0 &&
        debug.layers.some(layer => layer.textureKey && layer.textureKey.startsWith('avatar_witch_')) &&
        debug.layers.some(layer => layer.slot === 'top' && layer.tint === 0x3f7fb8);
    }, null, { timeout: 10000 });

    if (pageErrors.length) fail(`Page errors:\n${pageErrors.join('\n')}`);
    if (consoleErrors.length) fail(`Console errors:\n${consoleErrors.join('\n')}`);
    if (result.canvases.length !== 1) fail(`Expected Phaser to use one canvas, found ${result.canvases.length}`);
    if (!result.gameCanvasVisible) fail('Expected #game-canvas to be visible and sized');
    if (result.preloadedKeys !== result.assetKeys) {
      fail(`Expected all embedded assets to preload (${result.assetKeys}), loaded ${result.preloadedKeys}`);
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
    await page.waitForFunction(() => {
      const debug = window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug();
      return debug && debug.direction === 'NE' && debug.flipX === true;
    }, null, { timeout: 10000 });

    await page.evaluate(() => {
      const character = window.Game.State.get().character;
      character.currentActivity = { type: 'verify_glow' };
    });
    await page.waitForFunction(() => {
      const debug = window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug();
      return debug && debug.activityGlowActive === true;
    }, null, { timeout: 10000 });

    await page.evaluate(() => {
      window.Game.State.get().character.currentActivity = null;
    });
    await page.waitForFunction(() => {
      const debug = window.Game.Renderer.getAvatarDebug && window.Game.Renderer.getAvatarDebug();
      return debug && debug.activityGlowActive === false;
    }, null, { timeout: 10000 });

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
  checkAvatarRendererBehavior();
  checkRendererAvatarPreloadFailures();
  checkStateAppearanceMigration();
  const resources = checkResources();
  const runtime = await checkElectronRuntime();
  console.log(JSON.stringify({ ok: true, resources, runtime }, null, 2));
})().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
