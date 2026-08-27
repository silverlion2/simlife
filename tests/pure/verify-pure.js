"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..", "..");

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

function checkElectronSecurityBoundary() {
  const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  for (const contract of [
    'contextIsolation: true',
    'nodeIntegration: false',
    'sandbox: true',
    'setWindowOpenHandler',
    "on('will-navigate'",
  ]) {
    if (!source.includes(contract)) fail(`Expected Electron security contract: ${contract}`);
  }

  const { buildElectronLaunchArguments } = require('../electron/verify-electron');
  const linuxCiArgs = buildElectronLaunchArguments(9222, true, { platform: 'linux', ci: true });
  const linuxLocalArgs = buildElectronLaunchArguments(9222, true, { platform: 'linux', ci: false });
  const windowsCiArgs = buildElectronLaunchArguments(9222, true, { platform: 'win32', ci: true });
  if (!linuxCiArgs.includes('--no-sandbox')) {
    fail('Expected the isolated Linux CI Electron test process to disable the unavailable SUID sandbox');
  }
  if (linuxLocalArgs.includes('--no-sandbox') || windowsCiArgs.includes('--no-sandbox')) {
    fail('Expected Electron sandbox bypass to remain scoped to Linux CI');
  }
  for (const contract of ['--disable-gpu', '--enable-unsafe-swiftshader', root]) {
    if (!linuxCiArgs.includes(contract)) fail(`Expected Electron test launch argument: ${contract}`);
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

function checkFoundationPrimitives() {
  const context = loadBrowserGlobals(['js/random.js', 'js/signals.js', 'js/asset_loader.js'], {
    SIM_ASSETS: { bed: 'bed.png' },
    SIM_AVATAR_ASSETS: { avatar: 'avatar.png' },
    SIM_PRELOADED_IMAGES: {},
    SIM_PRELOADED_AVATAR_IMAGES: {},
  });
  context.Game.Random.seed('foundation');
  const first = [context.Game.Random.float(), context.Game.Random.float(), context.Game.Random.int(2, 5)];
  context.Game.Random.seed('foundation');
  const second = [context.Game.Random.float(), context.Game.Random.float(), context.Game.Random.int(2, 5)];
  if (JSON.stringify(first) !== JSON.stringify(second)) fail('Expected seeded Game.Random sequences to be repeatable');
  context.Game.Random.reset();

  let signalPayload = null;
  const unsubscribe = context.Game.Signals.on('verify', payload => { signalPayload = payload; });
  if (context.Game.Signals.emit('verify', { ok: true }) !== 1 || !signalPayload?.ok) fail('Expected Game.Signals to deliver payloads');
  unsubscribe();
  if (context.Game.Signals.emit('verify', {}) !== 0) fail('Expected Game.Signals unsubscribe to remove handler');

  for (const group of ['shell', 'starterWorld', 'avatars', 'buildCatalog', 'careers', 'optionalMaps']) {
    if (!context.Game.AssetManifest.getGroup(group)) fail(`Missing asset manifest group: ${group}`);
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

  const cacheScene = createMockAvatarScene(textureKeys);
  const cacheInstance = renderer.create(cacheScene);
  const cacheCharacter = { appearance: customHuman };
  for (let index = 0; index < 120; index += 1) {
    renderer.sync(cacheInstance, cacheCharacter, 10 + index, 20, 'S');
  }
  if (cacheInstance.layerBuildCount !== 1) {
    fail(`Expected unchanged avatar frames to build layers once, found ${cacheInstance.layerBuildCount}`);
  }
  renderer.sync(cacheInstance, cacheCharacter, 20, 20, 'N');
  if (cacheInstance.layerBuildCount !== 2) fail('Expected direction change to invalidate avatar layer cache once');
  cacheCharacter.appearance = appearance.setColor(customHuman, 'primary', '#445566');
  renderer.sync(cacheInstance, cacheCharacter, 20, 20, 'N');
  if (cacheInstance.layerBuildCount !== 3) fail('Expected appearance replacement to invalidate avatar layer cache once');
}

function checkRendererAvatarPreloadFailures() {
  const addedTextures = {};
  let createdConfig = null;
  const canvas = {
    style: {},
    parentElement: { clientWidth: 800, clientHeight: 600 },
    addEventListener: () => {},
  };
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
      getElementById: id => id === 'game-canvas' ? canvas : null,
    },
    Phaser: {
      AUTO: 'AUTO',
      CANVAS: 'CANVAS',
      WEBGL: 'WEBGL',
      Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
      Scene: class {},
      Game: class {
        constructor(config) {
          createdConfig = config;
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

  if (createdConfig?.type !== 'WEBGL') fail(`Expected explicit Phaser WebGL renderer selection, found ${createdConfig?.type}`);

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

function checkRendererFallbackAndIdempotence() {
  const attempts = [];
  const canvas = {
    style: {},
    parentElement: { clientWidth: 800, clientHeight: 600 },
    addEventListener: () => {},
  };
  const context = loadBrowserGlobals(['js/renderer_math.js', 'js/renderer_helpers.js', 'js/renderer.js'], {
    console: { log: () => {}, error: () => {}, warn: () => {} },
    SIM_ASSETS: {},
    SIM_AVATAR_ASSETS: {},
    innerWidth: 800,
    innerHeight: 600,
    addEventListener: () => {},
    document: {
      body: { clientWidth: 800, clientHeight: 600 },
      querySelector: () => null,
      getElementById: id => id === 'game-canvas' ? canvas : null,
    },
    Phaser: {
      AUTO: 'AUTO',
      CANVAS: 'CANVAS',
      WEBGL: 'WEBGL',
      Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
      Scene: class {},
      Game: class {
        constructor(config) {
          attempts.push(config.type);
          if (config.type === 'WEBGL') throw new Error('mock WebGL unavailable');
          this.config = config;
        }
      },
    },
  });

  const first = context.Game.Renderer.init(canvas);
  const second = context.Game.Renderer.init(canvas);
  if (typeof first?.then !== 'function' || typeof second?.then !== 'function') {
    fail('Expected renderer initialization to expose a promise-based lifecycle');
  }
  if (JSON.stringify(attempts) !== JSON.stringify(['WEBGL', 'CANVAS'])) {
    fail(`Expected one WebGL attempt followed by one Canvas fallback, found ${JSON.stringify(attempts)}`);
  }
  if (!context.Game.Renderer.isReady()) fail('Expected Canvas fallback to leave renderer ready');
}

function checkMainStartupIdempotence() {
  const counts = { renderer: 0, ui: 0, campaign: 0, shell: 0, interaction: 0, keydown: 0, pagehide: 0, visibilitychange: 0, saves: 0 };
  const lifecycleListeners = {};
  const state = {
    time: { day: 1, hour: 6, minute: 0, totalMinutes: 0, speed: 2 },
    character: {
      actionQueue: [], moodlets: [], currentActivity: null, targetPosition: null, path: null,
      position: { x: 1, y: 1 }, autonomy: { thought: null, lastAutoTime: 0, enabled: true },
    },
    ui: { mode: 'live' },
    npcWalkers: [],
    pets: [],
  };
  const classList = { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false };
  const canvas = { addEventListener: () => {} };
  let resolveRenderer;
  const rendererPromise = new Promise(resolve => { resolveRenderer = resolve; });
  const context = loadBrowserGlobals(['js/main.js'], {
    addEventListener: (type, listener) => {
      if (type === 'pagehide') counts.pagehide += 1;
      lifecycleListeners[type] = listener;
    },
    setTimeout: () => 0,
    document: {
      body: { classList },
      activeElement: null,
      visibilityState: 'visible',
      addEventListener: (type, listener) => {
        if (type === 'keydown') counts.keydown += 1;
        if (type === 'visibilitychange') counts.visibilitychange += 1;
        lifecycleListeners[type] = listener;
      },
      querySelectorAll: () => [],
      getElementById: id => id === 'game-canvas' ? canvas : null,
    },
    Game: {
      Config: {
        TIME: { SPEEDS: [0, 1, 2, 3], SPEED_KEYS: {}, MINUTES_PER_SECOND: 1 },
        DAYS_PER_SEASON: 7,
        SEASON_ORDER: ['spring'],
        SEASONS: { spring: { icon: '', label: 'Spring' } },
      },
      State: {
        get: () => state,
        getActiveMap: () => ({ lotWidth: 10, lotHeight: 10, furniture: [] }),
        getActiveSlotId: () => 'save_test',
        save: () => { counts.saves += 1; return true; },
      },
      Renderer: {
        init: () => { counts.renderer += 1; return rendererPromise; },
        isReady: () => false,
        setBgDirty: () => {},
      },
      UI: {
        init: () => { counts.ui += 1; }, showNotification: () => {}, updateStatusBars: () => {},
        updateMoodletDisplay: () => {}, updateQueueDisplay: () => {},
      },
      Character: { updatePosition: () => {}, updateNeeds: () => {}, updateActivity: () => {}, getLifeStage: () => 'young_adult' },
      Autonomy: { update: () => {} },
      Events: { update: () => {} },
      Social: { decayRelationships: () => {} },
      Economy: { processBills: () => {} },
      Campaign: { init: () => { counts.campaign += 1; }, update: () => {} },
      Shell: { init: () => { counts.shell += 1; } },
      Interaction: { init: () => { counts.interaction += 1; } },
    },
  });

  const first = context.Game.Main.init();
  const second = context.Game.Main.init();
  if (first !== second) fail('Expected concurrent Main.init calls to share one startup promise');
  for (const key of ['renderer', 'ui', 'campaign', 'shell', 'interaction', 'keydown', 'pagehide', 'visibilitychange']) {
    if (counts[key] !== 1) fail(`Expected ${key} startup work once, found ${counts[key]}`);
  }
  if (state.time.totalMinutes !== 0) fail(`Expected fresh-game elapsed time to remain 0, found ${state.time.totalMinutes}`);
  if (state.time.speed !== 2 || context.Game.Main.getSpeed() !== 2) fail('Expected saved game speed to be restored during startup');
  context.Game.Main.setSpeed(1, { silent: true });
  for (let index = 0; index < 6; index += 1) context.Game.Main.tick(0, 5000);
  if (counts.saves !== 1) fail(`Expected 30 seconds of wall time to trigger one autosave, found ${counts.saves}`);
  if (state.time.totalMinutes !== 0) fail('Expected stalled-frame simulation time to remain bounded below one game minute');
  lifecycleListeners.pagehide();
  context.document.visibilityState = 'hidden';
  lifecycleListeners.visibilitychange();
  if (counts.saves !== 3) fail(`Expected pagehide and hidden-tab lifecycle saves, found ${counts.saves}`);
  resolveRenderer(true);
}

function checkStateAppearanceMigration() {
  const context = loadBrowserGlobals([
    'js/random.js',
    'js/signals.js',
    'js/config.js',
    'js/avatar_catalog.js',
    'js/appearance.js',
    'js/state.js',
  ]);

  const state = context.Game.State.get();
  if (state.version !== 2 || context.Game.State.SAVE_VERSION !== 2) fail('Expected new saves to use schema version 2');
  const migrationProbe = { version: 1, character: {}, house: { marker: true }, customFutureField: { keep: true } };
  const migratedProbe = context.Game.State.migrateStatePayload(migrationProbe);
  if (migratedProbe.version !== 2 || !migratedProbe.maps.house.marker || !migratedProbe.customFutureField.keep) {
    fail(`Expected v1 migration to preserve unknown fields: ${JSON.stringify(migratedProbe)}`);
  }
  if (context.Game.State.migrateStatePayload(migratedProbe) !== migratedProbe) fail('Expected save migration to be idempotent');
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

function checkHomeGrowthAndFamilySystems() {
  const context = loadBrowserGlobals([
    'js/random.js',
    'js/signals.js',
    'js/config.js',
    'js/avatar_catalog.js',
    'js/appearance.js',
    'js/state.js',
    'js/economy.js',
    'js/home_growth.js',
    'js/house.js',
    'js/social.js',
    'js/family.js',
  ]);
  const objectMarketPath = path.join(root, 'js', 'object_market.js');
  if (fs.existsSync(objectMarketPath)) {
    vm.runInContext(fs.readFileSync(objectMarketPath, 'utf8'), context, { filename: 'js/object_market.js' });
  }
  const homeGoalsPath = path.join(root, 'js', 'home_goals.js');
  if (fs.existsSync(homeGoalsPath)) {
    vm.runInContext(fs.readFileSync(homeGoalsPath, 'utf8'), context, { filename: 'js/home_goals.js' });
  }
  const objectCraftingPath = path.join(root, 'js', 'object_crafting.js');
  if (fs.existsSync(objectCraftingPath)) {
    vm.runInContext(fs.readFileSync(objectCraftingPath, 'utf8'), context, { filename: 'js/object_crafting.js' });
  }
  const homeCollectionsPath = path.join(root, 'js', 'home_collections.js');
  if (fs.existsSync(homeCollectionsPath)) {
    vm.runInContext(fs.readFileSync(homeCollectionsPath, 'utf8'), context, { filename: 'js/home_collections.js' });
  }

  context.Game.UI = { showNotification: () => {} };
  context.Game.Renderer = { setBgDirty: () => {}, spawnParticles: () => {}, updatePathGrid: () => {} };
  context.Game.Character = { repairFurniture: () => {}, invalidateComfortCache: () => {} };

  const state = context.Game.State.get();
  const house = state.maps.house;
  const growth = context.Game.HomeGrowth.ensureState();

  if (!growth || growth.level !== 1) fail(`Expected starter home growth level 1, found ${JSON.stringify(growth)}`);
  if (house.unlockedFloors !== 1 || house.activeFloor !== 0 || !Array.isArray(house.floors)) {
    fail(`Expected starter house to have one active floor: ${JSON.stringify({ unlockedFloors: house.unlockedFloors, activeFloor: house.activeFloor, floors: house.floors })}`);
  }
  if (house.nextFurnId <= 38) fail(`Expected migrated nextFurnId to avoid starter id collisions, found ${house.nextFurnId}`);

  if (!context.Game.HomeGrowth.isRoomUnlocked('bedroom')) fail('Expected bedroom to be unlocked in starter home');
  if (context.Game.HomeGrowth.isRoomUnlocked('nursery')) fail('Expected nursery to be locked before home growth level 2');
  if (!context.Game.HomeGrowth.isFurnitureUnlocked('basic_bed')) fail('Expected Simple Bed to be unlocked in starter home');
  if (context.Game.HomeGrowth.isFurnitureUnlocked('luxury_bed')) fail('Expected Luxury Bed to be locked before home growth level 3');

  const unavailableLuxury = context.Game.House.placeFurniture('luxury_bed', 'room_0', 2, 2);
  if (unavailableLuxury !== false) fail('Expected locked luxury bed placement to fail');

  const bedroomFurniture = context.Game.House.getAvailableFurniture('bedroom');
  const luxuryEntry = bedroomFurniture.find(item => item.key === 'luxury_bed');
  if (!luxuryEntry || !luxuryEntry.locked || !luxuryEntry.lockReason) {
    fail(`Expected bedroom furniture list to expose locked luxury bed: ${JSON.stringify(luxuryEntry)}`);
  }

  if (!context.Game.HomeCollections) fail('Expected household furniture collections system to be available');
  const collectionState = context.Game.HomeCollections.ensureState();
  if (!collectionState || !Array.isArray(collectionState.completed)) {
    fail(`Expected home collections state to initialize: ${JSON.stringify(collectionState)}`);
  }
  const collections = context.Game.HomeCollections.getCollections();
  if (collections.length < 4) fail(`Expected several furniture collections, found ${JSON.stringify(collections)}`);
  const starterCollection = collections.find(item => item.key === 'starter_comfort');
  if (!starterCollection || !starterCollection.complete || starterCollection.claimed) {
    fail(`Expected starter furniture collection to be ready and unclaimed: ${JSON.stringify(starterCollection)}`);
  }
  if (starterCollection.items.some(item => !item.owned || item.count < 1 || !item.label)) {
    fail(`Expected starter collection items to expose owned progress: ${JSON.stringify(starterCollection.items)}`);
  }
  const moneyBeforeCollection = state.economy.money;
  const objectsBeforeCollection = state.inventory.objects.length;
  const claimedCollection = context.Game.HomeCollections.claimCollection('starter_comfort');
  if (!claimedCollection.success) fail(`Expected starter furniture collection claim to succeed: ${JSON.stringify(claimedCollection)}`);
  if (state.economy.money <= moneyBeforeCollection) fail('Expected collection claim to pay money');
  if (state.inventory.objects.length <= objectsBeforeCollection || !state.inventory.objects.some(item => item.source === 'collection_starter_comfort')) {
    fail(`Expected collection claim to add stored object reward: ${JSON.stringify(state.inventory.objects)}`);
  }
  if (!state.homeCollections.completed.includes('starter_comfort')) fail(`Expected completed collection key in state: ${JSON.stringify(state.homeCollections)}`);
  if (!state.character.collection.includes('starter_comfort')) fail(`Expected legacy collection showcase to include completion: ${JSON.stringify(state.character.collection)}`);
  if (context.Game.HomeCollections.claimCollection('starter_comfort').success) fail('Expected already claimed collection to be rejected');

  context.Game.Economy.addMoney(100000);
  house.furniture.push({ id: `furn_${house.nextFurnId++}`, type: 'grand_piano', roomId: null, x: 9, y: 9, floor: 0 });
  house.furniture.push({ id: `furn_${house.nextFurnId++}`, type: 'hot_tub', roomId: null, x: 12, y: 9, floor: 0 });
  const grown = context.Game.HomeGrowth.refresh();
  if (grown.level < 3) fail(`Expected expensive home items to raise growth level, found ${JSON.stringify(grown)}`);
  if (!context.Game.HomeGrowth.isFurnitureUnlocked('luxury_bed')) fail('Expected Luxury Bed to unlock after home growth');
  if (!state.inventory || !Array.isArray(state.inventory.objects)) fail('Expected home growth to initialize object inventory');
  const rewardedTypes = state.inventory.objects.map(item => item.type);
  if (!rewardedTypes.includes('hammock') || !rewardedTypes.includes('crib')) {
    fail(`Expected home growth milestone rewards to add obtainables, found ${JSON.stringify(state.inventory.objects)}`);
  }
  if (!context.Game.ObjectMarket) fail('Expected continuous object market system to be available');
  const offers = context.Game.ObjectMarket.getDailyOffers();
  if (offers.length < 4) fail(`Expected several daily object offers, found ${JSON.stringify(offers)}`);
  if (offers.some(offer => !context.Game.HomeGrowth.isFurnitureUnlocked(offer.type))) {
    fail(`Expected daily offers to respect home-growth unlocks, found ${JSON.stringify(offers)}`);
  }
  const moneyBeforeOffer = state.economy.money;
  const boughtOffer = context.Game.ObjectMarket.buyOffer(offers[0].id);
  if (!boughtOffer.success || !boughtOffer.object || boughtOffer.object.type !== offers[0].type) {
    fail(`Expected buying a market offer to create a stored object: ${JSON.stringify(boughtOffer)}`);
  }
  if (state.economy.money >= moneyBeforeOffer) fail('Expected buying an object offer to spend money');
  if (!state.inventory.objects.some(item => item.id === boughtOffer.object.id)) {
    fail(`Expected bought market object in inventory: ${JSON.stringify(state.inventory.objects)}`);
  }
  const remainingOfferIds = context.Game.ObjectMarket.getDailyOffers().map(offer => offer.id);
  if (remainingOfferIds.includes(offers[0].id)) fail('Expected bought offer to be removed from daily market');
  const dayOneOfferIds = context.Game.ObjectMarket.getDailyOffers().map(offer => offer.id).join(',');
  state.time.day += 1;
  const refreshedOfferIds = context.Game.ObjectMarket.refreshDailyOffers().map(offer => offer.id).join(',');
  if (refreshedOfferIds === dayOneOfferIds) fail('Expected market offers to refresh on a new day');

  if (!context.Game.HomeGoals) fail('Expected household goals system to be available');
  const starterGoals = context.Game.HomeGoals.getActiveGoals();
  if (starterGoals.length < 3) fail(`Expected household goals to keep several active projects, found ${JSON.stringify(starterGoals)}`);
  const diningGoal = starterGoals.find(goal => goal.key === 'build_dining_room');
  if (!diningGoal) fail(`Expected household goals to include a dining room project, found ${JSON.stringify(starterGoals)}`);
  if (context.Game.HomeGoals.claimGoal(diningGoal.id).success) fail('Expected incomplete dining room goal to be unclaimable');
  const diningBuiltForGoal = context.Game.House.buildRoom('dining', 26, 26, 2, 2);
  if (!diningBuiltForGoal) fail('Expected dining room build to satisfy a household goal');
  const diningRoom = house.rooms.find(room => room.type === 'dining');
  const moneyBeforeResize = state.economy.money;
  const resizedDining = context.Game.House.resizeRoom(diningRoom.id, 4, 3);
  if (!resizedDining) fail('Expected built rooms to be resizable for renovation');
  if (diningRoom.w !== 4 || diningRoom.h !== 3) fail(`Expected dining room to resize to 4x3, found ${JSON.stringify(diningRoom)}`);
  if (state.economy.money >= moneyBeforeResize) fail('Expected room expansion to spend money');
  const chairPlacedForResize = context.Game.House.placeFurniture('dining_chairs', diningRoom.id, diningRoom.x + 3, diningRoom.y + 2);
  if (!chairPlacedForResize) fail('Expected furniture placement in expanded dining room');
  const unsafeShrink = context.Game.House.resizeRoom(diningRoom.id, 2, 2);
  if (unsafeShrink) fail('Expected room shrink to fail when furniture would be outside the new footprint');
  const moneyBeforeGoalClaim = state.economy.money;
  const objectsBeforeGoalClaim = state.inventory.objects.length;
  const claimedDiningGoal = context.Game.HomeGoals.claimGoal(diningGoal.id);
  if (!claimedDiningGoal.success) fail(`Expected completed dining room goal to be claimable: ${JSON.stringify(claimedDiningGoal)}`);
  if (state.economy.money <= moneyBeforeGoalClaim) fail('Expected claimed household goal to pay money');
  if (state.inventory.objects.length <= objectsBeforeGoalClaim) fail(`Expected claimed household goal to add stored object rewards: ${JSON.stringify(state.inventory.objects)}`);
  if (context.Game.HomeGoals.getActiveGoals().some(goal => goal.id === diningGoal.id)) fail('Expected claimed goal to leave active goals');
  if (!state.homeGoals.completed.includes('build_dining_room')) fail(`Expected claimed goal key in completed history: ${JSON.stringify(state.homeGoals)}`);

  if (!context.Game.ObjectCrafting) fail('Expected workshop object crafting system to be available');
  const noWorkbenchCraft = context.Game.ObjectCrafting.craftObject('plant_box');
  if (noWorkbenchCraft.success) fail('Expected crafting to require a workshop workbench first');

  const patioBuilt = context.Game.House.buildRoom('patio', 30, 30, 2, 2);
  if (!patioBuilt) fail('Expected patio build to support placing obtained objects');
  const patio = house.rooms.find(room => room.type === 'patio');
  const hammockReward = state.inventory.objects.find(item => item.type === 'hammock');
  const storedPlaced = context.Game.House.placeStoredFurniture(hammockReward.id, patio.id, patio.x, patio.y);
  if (!storedPlaced) fail('Expected stored hammock reward to place without buying another item');
  if (state.inventory.objects.some(item => item.id === hammockReward.id)) fail('Expected placed stored object to be consumed from inventory');
  if (!house.furniture.some(item => item.type === 'hammock' && item.roomId === patio.id)) fail('Expected placed stored hammock to appear in house furniture');
  const placedHammock = house.furniture.find(item => item.type === 'hammock' && item.roomId === patio.id);
  const storedBack = context.Game.House.storeFurniture(placedHammock.id);
  if (!storedBack || !storedBack.object || storedBack.object.type !== 'hammock') {
    fail(`Expected placed furniture to move back into object storage: ${JSON.stringify(storedBack)}`);
  }
  if (house.furniture.some(item => item.id === placedHammock.id)) fail('Expected stored furniture to be removed from the house');
  if (!state.inventory.objects.some(item => item.id === storedBack.object.id && item.type === 'hammock')) {
    fail(`Expected stored furniture object in inventory: ${JSON.stringify(state.inventory.objects)}`);
  }

  const addFloorResult = context.Game.HomeGrowth.addFloor();
  if (!addFloorResult.success) fail(`Expected addFloor to succeed after growth: ${JSON.stringify(addFloorResult)}`);
  if (house.unlockedFloors !== 2 || house.activeFloor !== 1) {
    fail(`Expected second floor to become active after purchase: ${JSON.stringify({ unlockedFloors: house.unlockedFloors, activeFloor: house.activeFloor })}`);
  }
  const staircaseReward = state.inventory.objects.find(item => item.type === 'staircase' && item.source === 'floor_1_unlock');
  if (!staircaseReward) fail(`Expected adding a second floor to deliver a stored staircase, found ${JSON.stringify(state.inventory.objects)}`);
  const upstairsRoomBuilt = context.Game.House.buildRoom('bedroom', 40, 40, 2, 2);
  if (!upstairsRoomBuilt) fail('Expected bedroom build on second floor to support vertical expansion');
  const upstairsRoom = house.rooms.find(room => room.floor === 1 && room.x === 40 && room.y === 40);
  const staircasePlaced = context.Game.House.placeStoredFurniture(staircaseReward.id, upstairsRoom.id, upstairsRoom.x, upstairsRoom.y);
  if (!staircasePlaced) fail('Expected stored staircase to place inside an upstairs room');
  if (state.inventory.objects.some(item => item.id === staircaseReward.id)) fail('Expected placed staircase reward to be consumed from storage');
  const upstairsTravel = context.Game.HomeGrowth.travelToFloor(1);
  if (!upstairsTravel.success) fail(`Expected staircase to let household travel upstairs: ${JSON.stringify(upstairsTravel)}`);
  if (state.character.floor !== 1 || house.activeFloor !== 1) {
    fail(`Expected household travel to update character and active floor: ${JSON.stringify({ characterFloor: state.character.floor, activeFloor: house.activeFloor })}`);
  }
  const upstairsFamilyRenderables = context.Game.Family.getRenderableMembers();
  if (upstairsFamilyRenderables.some(member => member.floor !== 1 || member.position.floor !== 1)) {
    fail(`Expected family renderables to inherit household floor: ${JSON.stringify(upstairsFamilyRenderables)}`);
  }
  const invalidTravel = context.Game.HomeGrowth.travelToFloor(5);
  if (invalidTravel.success) fail('Expected travel to locked floor to fail');
  if (!context.Game.HomeGrowth.setActiveFloor(0) || context.Game.HomeGrowth.getActiveFloor() !== 0) {
    fail('Expected switching back to ground floor to succeed');
  }
  if (!context.Game.HomeGrowth.getLotInfo || !context.Game.HomeGrowth.expandLot) {
    fail('Expected home growth to expose land expansion APIs');
  }
  const lotBefore = context.Game.HomeGrowth.getLotInfo();
  if (!lotBefore.canExpand || lotBefore.width !== house.lotWidth || lotBefore.height !== house.lotHeight) {
    fail(`Expected grown household to be eligible for lot expansion: ${JSON.stringify(lotBefore)}`);
  }
  const moneyBeforeLot = state.economy.money;
  const expandedLot = context.Game.HomeGrowth.expandLot();
  if (!expandedLot.success) fail(`Expected lot expansion to succeed: ${JSON.stringify(expandedLot)}`);
  if (house.lotWidth <= lotBefore.width || house.lotHeight <= lotBefore.height) {
    fail(`Expected lot dimensions to grow after expansion: ${JSON.stringify({ before: lotBefore, after: context.Game.HomeGrowth.getLotInfo() })}`);
  }
  if (state.economy.money >= moneyBeforeLot) fail('Expected lot expansion to spend money');
  if ((state.stats.lotExpansions || 0) < 1) fail(`Expected lot expansion stat to update: ${JSON.stringify(state.stats)}`);
  const edgeBedroom = context.Game.House.buildRoom('bedroom', lotBefore.width + 1, lotBefore.height + 1, 2, 2);
  if (!edgeBedroom) fail('Expected expanded land to allow building beyond the previous lot edge');
  const emptyBedroom = house.rooms.find(room => room.type === 'bedroom' && room.x === lotBefore.width + 1 && room.y === lotBefore.height + 1);
  if (!context.Game.House.getFurnishingOptions || !context.Game.House.applyFurnishingPreset) {
    fail('Expected room furnishing preset APIs to be available');
  }
  const bedroomFurnishingOptions = context.Game.House.getFurnishingOptions(emptyBedroom.id);
  const starterBedroomPreset = bedroomFurnishingOptions.find(option => option.key === 'bedroom_starter');
  if (!starterBedroomPreset || !starterBedroomPreset.available || starterBedroomPreset.cost <= 0) {
    fail(`Expected starter bedroom furnishing preset to be available for empty room: ${JSON.stringify(bedroomFurnishingOptions)}`);
  }
  const furnitureBeforePreset = house.furniture.length;
  const moneyBeforePreset = state.economy.money;
  const furnishedBedroom = context.Game.House.applyFurnishingPreset(emptyBedroom.id, 'bedroom_starter');
  if (!furnishedBedroom.success) fail(`Expected starter bedroom preset to furnish room: ${JSON.stringify(furnishedBedroom)}`);
  if (house.furniture.length <= furnitureBeforePreset) fail('Expected furnishing preset to add room furniture');
  for (const type of ['basic_bed', 'lamp', 'dresser']) {
    if (!house.furniture.some(item => item.roomId === emptyBedroom.id && item.type === type)) {
      fail(`Expected furnished bedroom to contain ${type}: ${JSON.stringify(house.furniture.filter(item => item.roomId === emptyBedroom.id))}`);
    }
  }
  if (state.economy.money >= moneyBeforePreset) fail('Expected furnishing preset to spend money');
  if ((state.stats.roomsFurnished || 0) < 1) fail(`Expected room furnishing stat to update: ${JSON.stringify(state.stats)}`);

  const workshopBuilt = context.Game.House.buildRoom('workshop', 36, 36, 2, 2);
  if (!workshopBuilt) fail('Expected workshop build to unlock crafting');
  const workshop = house.rooms.find(room => room.type === 'workshop');
  const workbenchPlaced = context.Game.House.placeFurniture('workbench', workshop.id, workshop.x, workshop.y);
  if (!workbenchPlaced) fail('Expected workbench placement in workshop');
  state.character.skills.handiness = 2;
  const recipes = context.Game.ObjectCrafting.getAvailableRecipes();
  if (!recipes.some(recipe => recipe.id === 'plant_box' && recipe.available)) {
    fail(`Expected plant_box crafting recipe after placing workbench: ${JSON.stringify(recipes)}`);
  }
  const moneyBeforeCraft = state.economy.money;
  const crafted = context.Game.ObjectCrafting.craftObject('plant_box');
  if (!crafted.success || !crafted.object || crafted.object.type !== 'plant') {
    fail(`Expected crafting to add a stored plant object: ${JSON.stringify(crafted)}`);
  }
  if (state.economy.money >= moneyBeforeCraft) fail('Expected crafting to spend material money');
  if (!state.inventory.objects.some(item => item.id === crafted.object.id && item.source === 'crafted')) {
    fail(`Expected crafted object to appear in storage: ${JSON.stringify(state.inventory.objects)}`);
  }

  const nurseryBuilt = context.Game.House.buildRoom('nursery', 20, 20, 2, 2);
  if (!nurseryBuilt) fail('Expected nursery build to succeed after home growth');
  const nursery = house.rooms.find(room => room.type === 'nursery');
  if (!nursery || nursery.floor !== 0) fail(`Expected nursery to be built on active floor 0, found ${JSON.stringify(nursery)}`);
  const cribPlaced = context.Game.House.placeFurniture('crib', nursery.id, nursery.x, nursery.y);
  if (!cribPlaced) fail('Expected crib placement in nursery to succeed');

  if (context.Game.Family.canStartFamily().allowed) fail('Expected family start to require marriage first');
  state.social.married = true;
  state.social.romanticTarget = 'npc_alex';
  state.character.spouse = 'npc_alex';
  const familyReady = context.Game.Family.canStartFamily();
  if (!familyReady.allowed) fail(`Expected married household with nursery and crib to start family: ${JSON.stringify(familyReady)}`);
  const spouse = context.Game.Family.getMembers().find(member => member.role === 'spouse');
  if (!spouse || spouse.name !== 'Alex Chen') fail(`Expected spouse member to sync from social state, found ${JSON.stringify(context.Game.Family.getMembers())}`);
  const childResult = context.Game.Family.tryForChild('Luna');
  if (!childResult.success) fail(`Expected child creation to succeed: ${JSON.stringify(childResult)}`);
  if (state.family.members.length !== 3 || !state.family.members.some(member => member.name === 'Luna')) {
    fail(`Expected family member Luna to be added: ${JSON.stringify(state.family)}`);
  }

  const baby = state.family.members.find(member => member.name === 'Luna');
  const hungerBefore = baby.needs.hunger;
  context.Game.Family.update(1440 * 4);
  if (baby.lifeStage !== 'child') fail(`Expected baby to age into child after 4 days, found ${JSON.stringify(baby)}`);
  if (!(baby.needs.hunger < hungerBefore)) fail(`Expected child needs to decay over time, found ${JSON.stringify(baby.needs)}`);
  if (!state.inventory.objects.some(item => item.type === 'toy_chest' && item.source === 'family_child_age_up')) {
    fail(`Expected child age-up to add a family object reward, found ${JSON.stringify(state.inventory.objects)}`);
  }
  const hungerAfterAge = baby.needs.hunger;
  const careActions = context.Game.Family.getCareActions(baby.id);
  if (!careActions.some(action => action.key === 'feed')) fail(`Expected child care actions to include feeding, found ${JSON.stringify(careActions)}`);
  const careResult = context.Game.Family.performCare(baby.id, 'feed');
  if (!careResult.success) fail(`Expected feeding a child to succeed: ${JSON.stringify(careResult)}`);
  if (!(baby.needs.hunger > hungerAfterAge)) fail(`Expected family care to improve hunger, found ${JSON.stringify(baby.needs)}`);
  if ((state.stats.familyCareActions || 0) < 1) fail(`Expected family care actions to update stats, found ${JSON.stringify(state.stats)}`);

  if (!context.Game.Family.getAssignments || !context.Game.Family.assignRoutine) {
    fail('Expected family household routine assignment APIs to be available');
  }
  const spouseAssignments = context.Game.Family.getAssignments(spouse.id);
  if (!spouseAssignments.some(item => item.key === 'collect_objects' && item.available)) {
    fail(`Expected spouse to be available for object collecting routine: ${JSON.stringify(spouseAssignments)}`);
  }
  const childAssignments = context.Game.Family.getAssignments(baby.id);
  if (!childAssignments.some(item => item.key === 'homework' && item.available)) {
    fail(`Expected child to be available for homework routine: ${JSON.stringify(childAssignments)}`);
  }
  if (context.Game.Family.assignRoutine(baby.id, 'collect_objects').success) {
    fail('Expected child to be blocked from adult object collecting routine');
  }
  const objectsBeforeRoutine = state.inventory.objects.length;
  const collectAssigned = context.Game.Family.assignRoutine(spouse.id, 'collect_objects');
  if (!collectAssigned.success) fail(`Expected spouse object collecting routine assignment to succeed: ${JSON.stringify(collectAssigned)}`);
  context.Game.Family.update(1440);
  if (!spouse.assignment || spouse.assignment.key !== 'collect_objects' || spouse.assignment.completions < 1) {
    fail(`Expected spouse collecting routine to complete after a day: ${JSON.stringify(spouse.assignment)}`);
  }
  if (state.inventory.objects.length <= objectsBeforeRoutine || !state.inventory.objects.some(item => item.source === 'family_collect_objects')) {
    fail(`Expected completed family routine to add a stored object: ${JSON.stringify(state.inventory.objects)}`);
  }
  const educationBefore = baby.education || 0;
  const homeworkAssigned = context.Game.Family.assignRoutine(baby.id, 'homework');
  if (!homeworkAssigned.success) fail(`Expected child homework routine assignment to succeed: ${JSON.stringify(homeworkAssigned)}`);
  context.Game.Family.update(1440);
  if (!((baby.education || 0) > educationBefore)) {
    fail(`Expected child homework routine to build education progress: ${JSON.stringify(baby)}`);
  }
  if ((state.stats.familyRoutineCompletions || 0) < 2) {
    fail(`Expected family routine completions to update stats: ${JSON.stringify(state.stats)}`);
  }

  const renderables = context.Game.Family.getRenderableMembers();
  if (renderables.length < 2 || !renderables.some(member => member.role === 'child')) {
    fail(`Expected spouse/child renderable household members, found ${JSON.stringify(renderables)}`);
  }
}

function checkResources() {
  const context = loadBrowserGlobals(['js/assets.js', 'js/world_assets.js', 'js/avatar_catalog.js', 'js/avatar_assets.js', 'js/config.js']);
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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
  const generatedDir = path.join(root, 'assets', 'custom', 'generated_furniture');
  const generatedPngNames = listPngFiles(generatedDir).filter(name => name.startsWith('generated_')).sort();

  if (/https:\/\/cdn\.jsdelivr\.net/i.test(indexHtml)) {
    fail('Expected production game dependencies to load locally, found a jsDelivr runtime script');
  }
  const vendorRuntimes = [
    'phaser.min.js',
    'easystar.min.js',
    'navmesh.js',
    'rexstatemanagerplugin.min.js'
  ];
  for (const runtime of vendorRuntimes) {
    if (!fs.existsSync(path.join(root, 'vendor', runtime))) {
      fail(`Expected the bundled runtime at vendor/${runtime}`);
    }
    if (!indexHtml.includes(`vendor/${runtime}`)) {
      fail(`Expected index.html to load vendor/${runtime}`);
    }
  }

  if (!indexHtml.includes('js/world_assets.js')) fail('Expected index.html to load js/world_assets.js');
  if (assetKeys.length < 125) fail(`Expected at least 125 embedded render assets, found ${assetKeys.length}`);
  if (furnitureKeys.length < 70) fail(`Expected at least 70 furniture types, found ${furnitureKeys.length}`);
  if (pngCount < 1000) fail(`Expected an abundant PNG resource library, found ${pngCount}`);
  if (generatedPngNames.length !== 32) fail(`Expected 32 custom furniture sprites, found ${generatedPngNames.length}`);
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
    'generated_bed',
    'generated_sofa',
    'generated_stove',
    'generated_fridge',
    'generated_toilet',
    'generated_shower',
    'generated_indoor_tree',
    'generated_computer_desk',
    'generated_arcade',
    'generated_workbench',
    'generated_kitchen_sink',
    'generated_microwave',
    'generated_espresso',
    'generated_dishwasher',
    'generated_bathroom_vanity',
    'generated_flat_tv',
    'generated_stereo',
    'generated_game_console',
    'generated_aquarium',
    'generated_standing_mirror',
    'generated_bbq_grill',
    'generated_weight_bench',
    'generated_changing_table',
    'generated_3d_printer',
    'generated_fireplace',
    'generated_vanity',
    'farm_plot_e',
    'library_bookcase_e',
    'dungeon_chair_e',
  ];
  const missing = requiredTextureKeys.filter(key => !context.SIM_ASSETS[key]);
  if (missing.length) fail(`Missing embedded texture keys: ${missing.join(', ')}`);

  const missingAvatar = expectedAvatarKeys.filter(key => !avatarAssetKeySet.has(key));
  if (missingAvatar.length) fail(`Missing avatar texture keys: ${missingAvatar.join(', ')}`);

  const extraAvatar = avatarAssetKeys.filter(key => !expectedAvatarKeySet.has(key));
  if (extraAvatar.length) fail(`Unexpected avatar texture keys: ${extraAvatar.join(', ')}`);

  const generatedHashes = new Set();
  for (const name of generatedPngNames) {
    const png = parsePngRgba(path.join(generatedDir, name));
    if (png.width !== 256 || png.height !== 256) fail(`Expected ${name} to be 256x256, found ${png.width}x${png.height}`);
    const cornerIndexes = [0, (png.width - 1) * 4, ((png.height - 1) * png.width) * 4, ((png.height * png.width) - 1) * 4];
    if (cornerIndexes.some(index => png.pixels[index + 3] > 8)) fail(`Expected transparent corners in ${name}`);
    let opaquePixels = 0;
    let magentaPixels = 0;
    let hash = 2166136261;
    for (let index = 0; index < png.pixels.length; index += 4) {
      const red = png.pixels[index];
      const green = png.pixels[index + 1];
      const blue = png.pixels[index + 2];
      const alpha = png.pixels[index + 3];
      if (alpha > 8) opaquePixels += 1;
      if (alpha > 8 && red > 220 && blue > 220 && green < 80) magentaPixels += 1;
      hash ^= red + (green << 8) + (blue << 16) + alpha;
      hash = Math.imul(hash, 16777619);
    }
    if (opaquePixels < 1000) fail(`Expected substantial visible artwork in ${name}, found ${opaquePixels} opaque pixels`);
    if (magentaPixels > 0) fail(`Expected chroma key removal in ${name}, found ${magentaPixels} magenta pixels`);
    generatedHashes.add(hash >>> 0);
  }
  if (generatedHashes.size !== generatedPngNames.length) {
    fail(`Expected every custom furniture sprite to be distinct, found ${generatedHashes.size}/${generatedPngNames.length} hashes`);
  }

  const avatarQuality = checkAvatarLayerQuality(context.Game.AvatarCatalog);

  return {
    assetKeys: assetKeys.length,
    avatarAssetKeys: avatarAssetKeys.length,
    avatarLayerPngs: avatarLayerPngNames.length,
    avatarDirectionalItems: avatarQuality.directionalItems,
    avatarMaxLayerHeight: avatarQuality.maxLayerHeight,
    furnitureTypes: furnitureKeys.length,
    generatedFurnitureSprites: generatedPngNames.length,
    pngResources: pngCount,
  };
}

function createGameLogicContext() {
  const context = loadBrowserGlobals([
    'js/random.js',
    'js/signals.js',
    'js/config.js',
    'js/avatar_catalog.js',
    'js/appearance.js',
    'js/state.js',
    'js/economy.js',
    'js/character.js',
    'js/social.js',
  ], {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document: {
      createElement: () => ({
        setAttribute: () => {},
        click: () => {},
        remove: () => {},
      }),
      body: { appendChild: () => {} },
    },
  });
  context.Game.UI = { showNotification: () => {} };
  context.Game.Renderer = {
    transitionMap: () => {},
    spawnFloatingBubble: () => {},
    spawnExplosion: () => {},
  };
  return context;
}

function checkTraitBehavior() {
  const context = createGameLogicContext();
  const character = context.Game.Character;
  const earnedXp = (trait, skill) => {
    context.Game.State.reset();
    const traitState = context.Game.State.get().character;
    traitState.trait = trait;
    for (const need of Object.keys(traitState.needs)) traitState.needs[need] = 60;
    character.addSkillXp(skill, 10);
    return traitState.skillXp[skill];
  };
  const expectXpMultiplier = (trait, skill, multiplier) => {
    const base = earnedXp('neat', skill);
    const boosted = earnedXp(trait, skill);
    if (Math.abs(boosted / base - multiplier) > 0.0001) {
      fail(`Expected ${trait} ${skill} XP multiplier ${multiplier}, found ${boosted / base}`);
    }
  };

  expectXpMultiplier('creative', 'creativity', 1.3);
  expectXpMultiplier('genius', 'logic', 1.25);
  expectXpMultiplier('genius', 'tech', 1.25);
  expectXpMultiplier('athletic', 'fitness', 1.25);
  expectXpMultiplier('glutton', 'cooking', 1.2);

  context.Game.State.get().character.trait = 'neat';
  context.Game.State.get().character.needs.hygiene = 100;
  character.updateNeeds(60);
  if (Math.abs(context.Game.State.get().character.needs.hygiene - 98.6) > 0.001) fail('Expected Neat hygiene decay multiplier');

  context.Game.State.reset();
  context.Game.State.get().character.trait = 'lazy';
  context.Game.State.get().character.needs.energy = 100;
  character.updateNeeds(60);
  if (Math.abs(context.Game.State.get().character.needs.energy - 94.8) > 0.001) fail('Expected Lazy energy decay multiplier');

  context.Game.State.reset();
  context.Game.State.get().character.trait = 'glutton';
  context.Game.State.get().character.needs.hunger = 100;
  character.updateNeeds(60);
  if (Math.abs(context.Game.State.get().character.needs.hunger - 95.8) > 0.001) fail('Expected Glutton hunger decay multiplier');

  context.Game.State.reset();
  context.Game.State.get().character.trait = 'creative';
  character.addMoodlet({ name: 'Test', value: 1, duration: 100, icon: 'T' });
  if (context.Game.State.get().character.moodlets[0].duration !== 130) fail('Expected Creative moodlet duration multiplier');

  context.Game.State.reset();
  context.Game.State.get().character.trait = 'athletic';
  if (character.getEffectiveEnergyCost({ energyCost: 20 }) !== 15) fail('Expected Athletic energy cost multiplier');

  context.Game.State.reset();
  context.Game.State.get().character.trait = 'lazy';
  context.Game.State.get().character.needs.energy = 40;
  if (!character.startActivity('nap', false)) fail('Expected nap to start');
  context.Game.State.get().character.targetPosition = null;
  context.Game.State.get().character.currentActivity.elapsed = 120;
  character.updateActivity(1);
  if (context.Game.State.get().character.needs.energy !== 85) fail(`Expected Lazy nap to restore 45 energy, found ${context.Game.State.get().character.needs.energy}`);

  context.Game.State.reset();
  const socialState = context.Game.State.get();
  socialState.character.trait = 'neat';
  context.Game.Random.seed('social-trait');
  const base = context.Game.Social.interact('npc_maya', 'small_talk').gain;
  socialState.social.relationships.npc_maya = 0;
  socialState.character.trait = 'charming';
  context.Game.Random.seed('social-trait');
  const charming = context.Game.Social.interact('npc_maya', 'small_talk').gain;
  if (!(charming > base)) fail(`Expected Charming relationship gain above ${base}, found ${charming}`);

  let breakSeed = null;
  for (let index = 0; index < 100 && breakSeed === null; index++) {
    context.Game.Random.seed(`break-${index}`);
    const roll = context.Game.Random.float();
    if (roll >= 0.4 && roll < 0.8) breakSeed = `break-${index}`;
  }
  if (!breakSeed) fail('Expected to find deterministic furniture break seed');
  const runBreakCheck = trait => {
    context.Game.State.reset();
    const breakState = context.Game.State.get();
    breakState.character.trait = trait;
    breakState.maps.house.rooms.find(room => room.id === 'room_2').type = 'kitchen';
    context.Game.Config.FURNITURE.basic_stove.breakChance = 0.4;
    context.Game.Random.seed(breakSeed);
    if (!character.startActivity('cook', false)) {
      const availability = character.getActivityAvailability('cook');
      fail(`Expected cooking activity to start for ${trait} breakage trait test: ${JSON.stringify(availability)}`);
    }
    breakState.character.targetPosition = null;
    breakState.character.currentActivity.elapsed = breakState.character.currentActivity.duration;
    character.updateActivity(1);
    return breakState.maps.house.brokenFurniture.includes('furn_7');
  };
  if (runBreakCheck('neat')) fail('Expected base trait not to break stove at deterministic roll');
  if (!runBreakCheck('clumsy')) fail('Expected Clumsy break multiplier to break stove at deterministic roll');
}

function checkActivityLifecycleGuards() {
  const context = createGameLogicContext();
  const { Character, Signals, State } = context.Game;
  const state = State.get();
  const house = state.maps.house;

  state.character.mapId = 'culinary_kitchen';
  let availability = Character.getActivityAvailability('gourmet_feast', { targetFurnId: 'furn_0', source: 'test' });
  if (availability.allowed || !availability.reason.includes('Cooking level 5')) {
    fail(`Expected Gourmet Feast to enforce its skill lock: ${JSON.stringify(availability)}`);
  }
  if (Character.startActivity('gourmet_feast', false, 'furn_0', { source: 'test' })) {
    fail('Expected direct startActivity to reject a locked Gourmet Feast');
  }
  state.character.skills.cooking = 5;
  availability = Character.getActivityAvailability('gourmet_feast', { targetFurnId: 'furn_0', source: 'test' });
  if (!availability.allowed || availability.targetFurnId !== 'furn_0') {
    fail(`Expected Gourmet Feast to unlock at Cooking 5: ${JSON.stringify(availability)}`);
  }

  Character.cancelActivity();
  state.character.mapId = 'house';
  const handinessBefore = state.character.skillXp.handiness;
  availability = Character.getActivityAvailability('repair', { source: 'test' });
  if (availability.allowed || Character.startActivity('repair', false, null, { source: 'test' })) {
    fail('Expected Repair to require a broken furniture target');
  }
  if (state.character.skillXp.handiness !== handinessBefore) fail('Invalid Repair changed Handiness XP');

  Character.breakFurniture('furn_7');
  availability = Character.getActivityAvailability('repair', { source: 'test' });
  if (!availability.allowed || availability.targetFurnId !== 'furn_7') {
    fail(`Expected Repair to resolve the broken stove: ${JSON.stringify(availability)}`);
  }
  if (!Character.startActivity('repair', false, null, { source: 'test' })) fail('Expected valid Repair to start');
  state.character.targetPosition = null;
  state.character.currentActivity.elapsed = state.character.currentActivity.duration;
  Character.updateActivity(1);
  if (Character.isFurnitureBroken('furn_7')) fail('Expected completed Repair to clear the broken target');
  if (!(state.character.skillXp.handiness > handinessBefore)) fail('Expected completed Repair to award Handiness XP');

  const firstPlot = house.furniture.find(item => item.id === 'furn_16');
  const secondPlot = house.furniture.find(item => item.id === 'furn_17');
  house.rooms.push({ id: 'room_test_garden', type: 'garden', x: 1, y: 9, w: 4, h: 3 });
  firstPlot.roomId = 'room_test_garden';
  secondPlot.roomId = 'room_test_garden';
  firstPlot.cropState = 'empty';
  firstPlot.cropType = null;
  firstPlot.growth = 0;
  firstPlot.needsWater = false;
  secondPlot.cropState = 'growing';
  secondPlot.cropType = 'tomato';
  secondPlot.growth = 25;
  secondPlot.needsWater = true;

  const invalidHarvest = Character.getActivityAvailability('harvest_crop', { targetFurnId: firstPlot.id, source: 'test' });
  if (invalidHarvest.allowed || Character.startActivity('harvest_crop', false, firstPlot.id, { source: 'test' })) {
    fail('Expected an empty garden plot to reject Harvest');
  }
  if (!Character.queueActivity('water_crop', secondPlot.id, { source: 'interaction' })) {
    fail('Expected a thirsty crop action to queue');
  }
  const queued = state.character.actionQueue[0];
  if (!queued || queued.key !== 'water_crop' || queued.targetFurnId !== secondPlot.id) {
    fail(`Expected queue to preserve the selected crop target: ${JSON.stringify(queued)}`);
  }
  Character.processQueue();
  if (state.character.currentActivity?.targetFurnId !== secondPlot.id) {
    fail(`Expected queued crop action to start on ${secondPlot.id}`);
  }
  Character.cancelActivity();

  const hygieneBefore = state.character.needs.hygiene;
  const skillBefore = state.character.skillXp.handiness;
  const moneyBefore = state.economy.money;
  const moodletsBefore = state.character.moodlets.length;
  let pathCallback = null;
  let failedPayload = null;
  let completedCount = 0;
  Signals.on('path:find', payload => {
    pathCallback = payload.callback;
  });
  Signals.on('activity:failed', payload => {
    failedPayload = payload;
  });
  Signals.on('activity:completed', () => {
    completedCount += 1;
  });

  if (!Character.startActivity('shower', false, 'furn_4', { source: 'test' })) {
    fail('Expected targeted Shower to start before path failure');
  }
  Character.updatePosition(0.01);
  if (typeof pathCallback !== 'function') fail('Expected Shower to request a path');
  pathCallback(null);
  Character.updateActivity(60);
  if (state.character.currentActivity || state.character.targetPosition || state.character.path || state.character.isPathfinding) {
    fail('Expected unreachable Shower to clear all activity and movement state');
  }
  if (!failedPayload || failedPayload.activityKey !== 'shower' || failedPayload.reason !== 'unreachable') {
    fail(`Expected unreachable activity failure payload: ${JSON.stringify(failedPayload)}`);
  }
  if (completedCount !== 0) fail('Unreachable activity emitted activity:completed');
  if (state.character.needs.hygiene !== hygieneBefore || state.character.skillXp.handiness !== skillBefore ||
      state.economy.money !== moneyBefore || state.character.moodlets.length !== moodletsBefore) {
    fail('Unreachable activity changed gameplay rewards');
  }
}

function checkEventChoiceGuards() {
  const context = createGameLogicContext();
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'events.js'), 'utf8'), context, { filename: 'js/events.js' });
  const state = context.Game.State.get();
  state.economy.money = 0;
  state.events.activeEvent = {
    id: 'cost_guard',
    title: 'Cost Guard',
    choices: [
      { label: 'Pay', effects: { money: -50, fun: 10 } },
      { label: 'Decline', effects: {} },
    ],
  };
  const paidAvailability = context.Game.Events.getChoiceAvailability(0);
  if (paidAvailability.allowed || paidAvailability.cost !== 50) {
    fail(`Expected unaffordable event choice to be blocked: ${JSON.stringify(paidAvailability)}`);
  }
  if (context.Game.Events.handleChoice(0) || state.economy.money !== 0 || !state.events.activeEvent) {
    fail('Expected blocked event choice to preserve money and keep the event open');
  }
  if (!context.Game.Events.handleChoice(1) || state.events.activeEvent || state.stats.eventsHandled !== 1) {
    fail('Expected free event recovery choice to resolve the event once');
  }

  state.economy.money = 20;
  state.events.activeEvent = {
    id: 'skill_cost_guard',
    title: 'Skill Cost Guard',
    choices: [{ label: 'Risk it', effects: { money: -25 }, skillCheck: { logic: 3, failCost: -50 } }],
  };
  const riskAvailability = context.Game.Events.getChoiceAvailability(0);
  if (riskAvailability.allowed || riskAvailability.cost !== 75) {
    fail(`Expected potential failed skill cost to be included: ${JSON.stringify(riskAvailability)}`);
  }
  state.economy.money = 100;
  if (!context.Game.Events.handleChoice(0) || state.economy.money !== 25) {
    fail(`Expected affordable event costs to spend without going negative, found $${state.economy.money}`);
  }
}

function checkSaveManagerRobustness() {
  const context = createGameLogicContext();
  const storage = context.localStorage;

  storage.setItem('simlife_saves_index', '{}');
  if (context.Game.State.getSaves().length !== 0) fail('Expected object-shaped save index to recover as an empty list');

  storage.setItem('simlife_save', '{broken');
  if (context.Game.State.hasSave()) fail('Expected malformed legacy save not to create a slot');
  if (storage.getItem('simlife_save') !== '{broken') fail('Expected malformed legacy data to remain available for recovery');

  storage.setItem('simlife_saves_index', JSON.stringify([{ id: 'bad_slot', name: 'Bad Slot' }]));
  storage.setItem('bad_slot', '{broken');
  if (context.Game.State.exportToFile('bad_slot')) fail('Expected malformed slot export to fail safely');

  const invalidImports = [
    '{}',
    JSON.stringify({ metadata: {}, state: 'not-an-object' }),
    JSON.stringify({ metadata: {}, state: { character: {}, economy: {}, time: {}, maps: [] } }),
    '{"metadata":{"name":"Unsafe"},"state":{"__proto__":{"polluted":true}}}',
    'x'.repeat(2 * 1024 * 1024 + 1),
  ];
  for (const payload of invalidImports) {
    if (context.Game.State.importFromFile(payload)) fail(`Expected invalid import to fail: ${payload}`);
  }

  const state = context.Game.State.get();
  const legacyState = JSON.parse(JSON.stringify(state));
  legacyState.version = 1;
  legacyState.house = legacyState.maps.house;
  delete legacyState.maps;
  const validImport = JSON.stringify({ metadata: { name: 'Imported v1 World' }, state: legacyState });
  if (!context.Game.State.importFromFile(validImport)) fail('Expected structurally valid v1 save import to succeed');
  const importedMeta = context.Game.State.getSaves().find(entry => entry.name === 'Imported v1 World');
  const importedState = importedMeta && JSON.parse(storage.getItem(importedMeta.id));
  if (!importedState || importedState.version !== 2 || !importedState.maps?.house) {
    fail('Expected imported v1 save to be migrated before storage');
  }

  const originalSetItem = storage.setItem;
  const indexBeforeCreateFailure = JSON.stringify(context.Game.State.getSaves());
  const stateBeforeCreateFailure = context.Game.State.get();
  const activeBeforeCreateFailure = context.Game.State.getActiveSlotId();
  let failedCreateSlot = null;
  storage.setItem = (key, value) => {
    if (key !== 'simlife_saves_index' && key.startsWith('save_')) {
      failedCreateSlot = key;
      throw new Error('mock slot payload quota failure');
    }
    originalSetItem(key, value);
  };
  if (context.Game.State.createSave('Should Roll Back', { name: 'Nope' })) {
    fail('Expected createSave to fail when the initial payload cannot be persisted');
  }
  storage.setItem = originalSetItem;
  if (!failedCreateSlot || storage.getItem(failedCreateSlot) !== null) fail('Expected failed create slot to leave no payload');
  if (JSON.stringify(context.Game.State.getSaves()) !== indexBeforeCreateFailure) fail('Expected failed create slot to leave the index intact');
  if (context.Game.State.get() !== stateBeforeCreateFailure || context.Game.State.getActiveSlotId() !== activeBeforeCreateFailure) {
    fail('Expected failed create slot to preserve live state and active slot');
  }

  const indexBeforeImportFailure = JSON.stringify(context.Game.State.getSaves());
  let importedPayloadKey = null;
  storage.setItem = (key, value) => {
    if (key === 'simlife_saves_index' && importedPayloadKey) throw new Error('mock index quota failure');
    if (key !== 'simlife_saves_index' && key.startsWith('save_')) importedPayloadKey = key;
    originalSetItem(key, value);
  };
  if (context.Game.State.importFromFile(validImport)) fail('Expected import to fail when index persistence fails');
  storage.setItem = originalSetItem;
  if (!importedPayloadKey || storage.getItem(importedPayloadKey) !== null) fail('Expected failed import to roll back its payload');
  if (JSON.stringify(context.Game.State.getSaves()) !== indexBeforeImportFailure) fail('Expected failed import to preserve the slot index');

  const durableSlot = context.Game.State.createSave('Durable World', { name: 'Durable' });
  if (!durableSlot) fail('Expected durable test slot to be created');
  const stableState = context.Game.State.get();
  const durablePayloadBeforeFailedSave = storage.getItem(durableSlot);
  const durableIndexBeforeFailedSave = storage.getItem('simlife_saves_index');
  stableState.economy.money += 123;
  let failedUpdateIndexWrite = false;
  storage.setItem = (key, value) => {
    if (key === 'simlife_saves_index' && !failedUpdateIndexWrite) {
      failedUpdateIndexWrite = true;
      throw new Error('mock update index quota failure');
    }
    originalSetItem(key, value);
  };
  if (context.Game.State.save()) fail('Expected an existing-slot save to fail when index persistence fails');
  storage.setItem = originalSetItem;
  if (storage.getItem(durableSlot) !== durablePayloadBeforeFailedSave || storage.getItem('simlife_saves_index') !== durableIndexBeforeFailedSave) {
    fail('Expected failed existing-slot save to restore both payload and index');
  }
  storage.setItem('malformed_maps', JSON.stringify({ ...JSON.parse(storage.getItem(durableSlot)), maps: [] }));
  if (context.Game.State.loadSlot('malformed_maps')) fail('Expected malformed map arrays to be rejected');
  if (context.Game.State.get() !== stableState || context.Game.State.getActiveSlotId() !== durableSlot) {
    fail('Expected malformed load to preserve the active state and slot');
  }
  const malformedFurniturePayload = JSON.parse(storage.getItem(durableSlot));
  malformedFurniturePayload.maps.house.furniture = [null];
  storage.setItem('malformed_furniture', JSON.stringify(malformedFurniturePayload));
  if (context.Game.State.loadSlot('malformed_furniture')) fail('Expected malformed nested furniture entries to be rejected');
  if (context.Game.State.get() !== stableState || context.Game.State.getActiveSlotId() !== durableSlot) {
    fail('Expected malformed nested load to preserve the active state and slot');
  }

  const malformedPersistentArrays = [
    ['pets', payload => { payload.pets = [null]; }],
    ['action_queue', payload => { payload.character.actionQueue = [null]; }],
    ['moodlets', payload => { payload.character.moodlets = [null]; }],
    ['inventory_objects', payload => { payload.inventory.objects = [null]; }],
    ['family_members', payload => { payload.family.members = [null]; }],
  ];
  for (const [label, mutate] of malformedPersistentArrays) {
    const payload = JSON.parse(storage.getItem(durableSlot));
    mutate(payload);
    storage.setItem(`malformed_${label}`, JSON.stringify(payload));
    if (context.Game.State.loadSlot(`malformed_${label}`)) fail(`Expected malformed ${label} entries to be rejected`);
    if (context.Game.State.importFromFile(JSON.stringify({ metadata: { name: `Malformed ${label}` }, state: payload }))) {
      fail(`Expected malformed ${label} import to be rejected`);
    }
    if (context.Game.State.get() !== stableState || context.Game.State.getActiveSlotId() !== durableSlot) {
      fail(`Expected malformed ${label} validation to preserve the active world`);
    }
  }

  const originalGetItem = storage.getItem;
  storage.getItem = () => { throw new Error('mock disabled storage'); };
  if (context.Game.State.getSaves().length !== 0) fail('Expected disabled storage to recover as an empty save list');
  storage.getItem = originalGetItem;

  const validPayload = storage.getItem(durableSlot);
  storage.setItem('ensure_failure', validPayload);
  context.Game.HomeGrowth = { ensureState: () => { throw new Error('mock derived-state failure'); } };
  if (context.Game.State.loadSlot('ensure_failure')) fail('Expected derived-state failure to reject load');
  delete context.Game.HomeGrowth;
  if (context.Game.State.get() !== stableState || context.Game.State.getActiveSlotId() !== durableSlot) {
    fail('Expected derived-state failure to preserve the active state and slot');
  }

  const moving = context.Game.State.get().character;
  moving.targetPosition = { x: 8, y: 8 };
  moving.path = null;
  moving.isPathfinding = true;
  moving.pathRequestId = 42;
  if (!context.Game.State.save()) fail('Expected in-flight movement save to succeed');
  const persistedMovement = JSON.parse(storage.getItem(durableSlot)).character;
  if (persistedMovement.isPathfinding || persistedMovement.path !== null || persistedMovement.pathRequestId !== 0) {
    fail(`Expected persisted pathfinding state to be normalized: ${JSON.stringify(persistedMovement)}`);
  }
  if (!context.Game.State.loadSlot(durableSlot)) fail('Expected normalized movement slot to reload');
  let pathRequests = 0;
  const stopPathListener = context.Game.Signals.on('path:find', payload => {
    pathRequests += 1;
    payload.callback([{ x: payload.endX, y: payload.endY }]);
  });
  context.Game.Character.updatePosition(0.016);
  stopPathListener();
  if (pathRequests !== 1) fail(`Expected loaded target to request a fresh path once, found ${pathRequests}`);

  storage.setItem('simlife_settings_v3', '{"volume":12}');
  const resetPayloadKey = durableSlot;
  if (!context.Game.State.deleteAllSaves()) fail('Expected scoped save reset to succeed');
  if (storage.getItem('simlife_settings_v3') !== '{"volume":12}') fail('Expected scoped save reset to preserve settings');
  if (storage.getItem(resetPayloadKey) !== null || storage.getItem('simlife_saves_index') !== null) {
    fail('Expected scoped save reset to remove slot payloads and index');
  }
}

function checkGameDataIntegrity() {
  const context = createGameLogicContext();
  const { Config, State, Economy, Character } = context.Game;
  const state = State.get();
  const careerEntries = Object.entries(Config.CAREERS);

  if (careerEntries.length < 8) fail(`Expected eight complete careers, found ${careerEntries.length}`);
  for (const [careerKey, career] of careerEntries) {
    const map = state.maps[career.mapId];
    const activity = Config.ACTIVITIES[career.actionKey];
    if (!map) fail(`Career ${careerKey} references missing map ${career.mapId}`);
    if (!activity) fail(`Career ${careerKey} references missing activity ${career.actionKey}`);
    if (!career.levels || career.levels.length < 5) fail(`Career ${careerKey} lost progression levels`);
    if (activity.furniture && !map.furniture.some(item => item.type.includes(activity.furniture))) {
      fail(`Career ${careerKey} map lacks activity target ${activity.furniture}`);
    }
  }

  for (const [mapId, map] of Object.entries(state.maps)) {
    const roomIds = new Set(map.rooms.map(room => room.id));
    const occupied = new Map();
    for (const room of map.rooms) {
      if (!Config.ROOMS[room.type]) fail(`Map ${mapId} uses unknown room type ${room.type}`);
      if (room.x < 0 || room.y < 0 || room.x + room.w > map.lotWidth || room.y + room.h > map.lotHeight) {
        fail(`Map ${mapId} room ${room.id} is outside lot bounds`);
      }
    }
    for (const item of map.furniture) {
      const def = Config.FURNITURE[item.type];
      if (!def) fail(`Map ${mapId} uses unknown furniture ${item.type}`);
      if (item.roomId !== null && item.roomId !== undefined && !roomIds.has(item.roomId)) {
        fail(`Map ${mapId} furniture ${item.id} references missing room ${item.roomId}`);
      }
      const w = item.rotated ? def.h : def.w;
      const h = item.rotated ? def.w : def.h;
      if (item.x < 0 || item.y < 0 || item.x + w > map.lotWidth || item.y + h > map.lotHeight) {
        fail(`Map ${mapId} furniture ${item.id} is outside lot bounds`);
      }
      for (let y = item.y; y < item.y + h; y += 1) {
        for (let x = item.x; x < item.x + w; x += 1) {
          const key = `${x},${y}`;
          if (occupied.has(key)) fail(`Map ${mapId} furniture overlap at ${key}: ${occupied.get(key)} and ${item.id}`);
          occupied.set(key, item.id);
        }
      }
    }
  }

  const houseValue = Economy.calculateHouseValue();
  state.character.mapId = 'downtown';
  if (Economy.calculateHouseValue() !== houseValue) fail('Expected house value to remain stable while the character is away');

  state.economy.money = 999999;
  Economy.addMoney(1);
  if (!state.character.achievements.includes('millionaire')) fail('Expected millionaire achievement to read economy money');

  state.character.mapId = 'house';
  const portal = state.maps.house.furniture.find(item => item.type === 'map_portal');
  if (!Character.startActivity('travel', false, portal.id)) fail('Expected map portal travel activity to start');
  state.character.targetPosition = null;
  state.character.path = null;
  state.character.isPathfinding = false;
  Character.updateActivity(Config.ACTIVITIES.travel.duration);
  if (state.character.mapId !== portal.config.targetMap) fail('Expected map portal activity to transition maps');

  state.character.mapId = 'house';
  const gate = state.maps.house.furniture.find(item => item.type === 'subway_gate');
  gate.config.targetMap = 'downtown';
  Character.startActivity('take_subway', false, gate.id);
  state.character.targetPosition = null;
  Character.updateActivity(Config.ACTIVITIES.take_subway.duration);
  const universityGate = state.maps.downtown.furniture.find(item => item.type === 'subway_gate');
  universityGate.config.targetMap = 'university';
  Character.startActivity('take_subway', false, universityGate.id);
  state.character.targetPosition = null;
  Character.updateActivity(Config.ACTIVITIES.take_subway.duration);
  if (!state.character.achievements.includes('globe_trotter')) fail('Expected major-location travel to unlock Globe Trotter');

  context.addEventListener = () => {};
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8'), context, { filename: 'js/main.js' });
  state.character.mapId = 'house';
  state.character.needs.energy = 100;
  state.character.currentActivity = null;
  if (!Economy.joinCareer('tech')) fail('Expected tech career join for shift lifecycle test');
  const career = Economy.getCareer();
  const moneyBeforeShift = state.economy.money;
  const energyBeforeShift = state.character.needs.energy;
  const techXpBeforeShift = state.character.skillXp.tech;
  context.Game.Main.checkWorkSchedule(10);
  if (!career.activeShift?.started || state.character.mapId !== 'tech_office' || state.character.currentActivity?.type !== 'work_tech') {
    fail(`Expected deterministic tech shift start: ${JSON.stringify({ career, mapId: state.character.mapId, activity: state.character.currentActivity })}`);
  }
  context.Game.Main.checkWorkSchedule(18);
  if (career.activeShift || career.daysWorked !== 1 || state.character.mapId !== 'house' || state.character.currentActivity) {
    fail(`Expected deterministic tech shift completion: ${JSON.stringify({ career, mapId: state.character.mapId, activity: state.character.currentActivity })}`);
  }
  if (state.economy.money <= moneyBeforeShift || state.character.needs.energy >= energyBeforeShift || state.character.skillXp.tech <= techXpBeforeShift) {
    fail('Expected completed shift to award salary and apply work need/skill effects exactly once');
  }

  let pathCallback = null;
  context.Game.Renderer.findPath = (x, y, tx, ty, callback) => { pathCallback = callback; };
  state.character.mapId = 'house';
  state.character.targetPosition = { x: 7, y: 7 };
  Character.updatePosition(0.016);
  if (!pathCallback || !state.character.isPathfinding) fail('Expected movement to request an asynchronous path');
  Character.cancelActivity();
  pathCallback([{ x: 4, y: 4 }]);
  if (state.character.path || state.character.isPathfinding) fail('Expected cancelled path callback to remain invalidated');
}

function checkCampaignBehavior() {
  const state = {
    character: {
      career: null,
      currentActivity: null,
      skills: { cooking: 0 },
    },
    economy: { money: 500 },
    homeGoals: { completed: [] },
    homeCollections: { completed: [] },
    homeGrowth: { level: 1 },
    stats: { furnitureBought: 0, friendsMade: 0 },
    time: { day: 1 },
  };
  let saves = 0;
  const context = loadBrowserGlobals(['js/signals.js', 'js/campaign.js'], {
    Game: {
      State: {
        get: () => state,
        save: () => { saves += 1; return true; },
      },
      UI: {
        showNotification: () => {},
        playAnnouncer: () => {},
      },
      Audio: {
        playChime: () => {},
      },
    },
    document: {
      getElementById: () => null,
    },
  });

  const campaign = context.Game.Campaign.ensureState();
  if (!campaign || campaign.id !== 'new_roots_v1' || campaign.completed.length !== 0) {
    fail(`Expected missing campaign state to migrate safely: ${JSON.stringify(campaign)}`);
  }

  context.Game.Campaign.init();
  state.character.currentActivity = { type: 'verify_activity' };
  if (context.Game.Campaign.evaluateCurrent() || campaign.completed.length) {
    fail(`Expected a loaded or autonomous activity not to complete chapter one: ${JSON.stringify(campaign)}`);
  }
  context.Game.Signals.emit('activity:started', { activityKey: 'read', source: 'autonomy' });
  if (campaign.completed.length) fail('Expected autonomous activity start not to complete the Do objective');
  context.Game.Signals.emit('activity:started', { activityKey: 'read', source: 'do' });
  if (campaign.completed[0] !== 'first_move') {
    fail(`Expected a successful Do activity to complete chapter one: ${JSON.stringify(campaign)}`);
  }
  if (state.economy.money !== 575 || campaign.xp !== 100 || saves !== 1) {
    fail(`Expected the first campaign reward exactly once: ${JSON.stringify({ campaign, money: state.economy.money, saves })}`);
  }

  context.Game.Campaign.evaluateCurrent();
  if (state.economy.money !== 575 || saves !== 1) {
    fail('Expected campaign rewards to remain idempotent');
  }

  state.character.career = 'tech';
  const secondCompleted = context.Game.Campaign.evaluateCurrent();
  if (!secondCompleted || !campaign.completed.includes('first_paycheck')) {
    fail(`Expected career selection to complete chapter two: ${JSON.stringify(campaign)}`);
  }
  if (state.economy.money !== 675 || campaign.xp !== 200 || campaign.level !== 2) {
    fail(`Unexpected second campaign reward or level: ${JSON.stringify({ campaign, money: state.economy.money })}`);
  }
}

function parsePngRgba(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.readUInt32BE(0) !== 0x89504e47) fail(`Expected PNG signature for ${filePath}`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const chunks = [];
  let pos = 8;
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') chunks.push(buffer.slice(pos + 8, pos + 8 + length));
    if (type === 'IEND') break;
    pos += length + 12;
  }

  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  let offset = 0;

  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
  }

  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset++];
    const row = Buffer.from(raw.slice(offset, offset + stride));
    offset += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? row[i - 4] : 0;
      const up = previous[i];
      const upLeft = i >= 4 ? previous[i - 4] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, upLeft)) & 255;
    }
    row.copy(pixels, y * stride);
    previous = row;
  }

  return { width, height, pixels };
}

function avatarPngMetrics(textureKey) {
  const png = parsePngRgba(path.join(root, 'assets', 'avatar_layers', `${textureKey}.png`));
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  let hash = 2166136261;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (y * png.width + x) * 4;
      const alpha = png.pixels[idx + 3];
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      hash ^= x + 31 * y + 131 * alpha + 8191 * png.pixels[idx] + 131071 * png.pixels[idx + 1] + 524287 * png.pixels[idx + 2];
      hash = Math.imul(hash, 16777619);
    }
  }
  return {
    width: png.width,
    height: png.height,
    bboxWidth: maxX >= minX ? maxX - minX + 1 : 0,
    bboxHeight: maxY >= minY ? maxY - minY + 1 : 0,
    hash: hash >>> 0,
  };
}

function checkAvatarLayerQuality(catalog) {
  const directions = catalog.DIRECTIONS;
  let maxLayerHeight = 0;
  let directionalItems = 0;
  for (const item of Object.values(catalog.ITEMS)) {
    const metrics = directions.map(direction => avatarPngMetrics(item.textures[direction]));
    for (const metric of metrics) {
      if (metric.width !== 96 || metric.height !== 128) {
        fail(`Expected avatar layer ${item.id} to be 96x128, found ${metric.width}x${metric.height}`);
      }
      maxLayerHeight = Math.max(maxLayerHeight, metric.bboxHeight);
    }
    if (item.value === 'none') continue;
    directionalItems += 1;
    const uniqueHashes = new Set(metrics.map(metric => metric.hash));
    const uniqueBounds = new Set(metrics.map(metric => `${metric.bboxWidth}x${metric.bboxHeight}`));
    if (uniqueHashes.size < 3 || uniqueBounds.size < 2) {
      fail(`Expected distinct directional avatar assets for ${item.id}, found hashes=${uniqueHashes.size}, bounds=${uniqueBounds.size}`);
    }
  }
  if (maxLayerHeight > 76) {
    fail(`Expected avatar layer art to stay within scale-safe bounds, max opaque height ${maxLayerHeight}`);
  }
  return { directionalItems, maxLayerHeight };
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

function runPureChecks() {
  checkSyntax();
  checkElectronSecurityBoundary();
  checkFoundationPrimitives();
  checkRendererMathHelpers();
  checkRendererDataHelpers();
  checkAppearanceHelpers();
  checkAvatarRendererBehavior();
  checkRendererAvatarPreloadFailures();
  checkRendererFallbackAndIdempotence();
  checkMainStartupIdempotence();
  checkStateAppearanceMigration();
  checkSaveManagerRobustness();
  checkGameDataIntegrity();
  checkHomeGrowthAndFamilySystems();
  checkCampaignBehavior();
  checkActivityLifecycleGuards();
  checkTraitBehavior();
  checkEventChoiceGuards();
  return checkResources();
}

module.exports = { runPureChecks, checkActivityLifecycleGuards };
