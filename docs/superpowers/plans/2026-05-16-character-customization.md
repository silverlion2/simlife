# Character Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cosmetic-only, form-aware character customization system with selectable body parts, clothing, accessories, and color sets for human, witch, robot, cat, and banana avatars.

**Architecture:** Add a catalog-driven `Game.Appearance` module, deterministic generated avatar layer assets, a small Phaser avatar composer, and a shared editor used by both character creation and in-game makeover. Keep the existing global browser script architecture and leave gameplay systems untouched.

**Tech Stack:** Plain browser JavaScript on `window.Game`, Phaser 4 renderer, localStorage save state, Playwright-backed asset generation and smoke verification, existing `npm test`.

---

## File Structure

- Create `js/avatar_catalog.js`: form, slot, item, palette, and default appearance definitions.
- Create `js/appearance.js`: pure helper API for migration, validation, editor mutation, and render-layer resolution.
- Create `scripts/generate-avatar-assets.js`: deterministic asset generator that renders SVG layer specs to transparent PNGs through Playwright and writes `js/avatar_assets.js`.
- Create `js/avatar_assets.js`: generated `window.SIM_AVATAR_ASSETS` data URI map.
- Create `js/avatar_renderer.js`: Phaser layer composer for player avatar containers.
- Create `js/avatar_editor.js`: shared DOM editor for new-game creation and in-game makeover.
- Modify `index.html`: load new scripts in dependency order and replace simple form/color fields with editor containers.
- Modify `js/state.js`: add appearance defaults, migration, and create-save support.
- Modify `js/ui.js`: delegate character creation and makeover to `Game.AvatarEditor`.
- Modify `js/renderer.js`: use `Game.AvatarRenderer` from `syncCharacter`.
- Modify `scripts/verify-game.js`: add catalog/helper/resource checks and in-game customization smoke checks.
- Modify `css/main.css`: style the editor with compact tabs, swatches, option grids, and preview.
- Modify `README.md`: add a short customization feature note after implementation passes.

---

### Task 1: Catalog And Appearance Helpers

**Files:**
- Create: `js/avatar_catalog.js`
- Create: `js/appearance.js`
- Modify: `index.html`
- Modify: `scripts/verify-game.js`

- [ ] **Step 1: Write failing catalog/helper verification**

Add this function to `scripts/verify-game.js` after `checkRendererDataHelpers()`:

```js
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
}
```

Call it from the main async block before `checkResources()`:

```js
checkAppearanceHelpers();
```

- [ ] **Step 2: Run verification to confirm it fails**

Run: `npm test`

Expected: FAIL with `ENOENT` or `Expected Game.AvatarCatalog to be defined`.

- [ ] **Step 3: Create the avatar catalog**

Create `js/avatar_catalog.js`:

```js
// ============================================================
// SimLife - Avatar Customization Catalog
// ============================================================
window.Game = window.Game || {};

Game.AvatarCatalog = (function() {
  const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S'];

  const FORM_SLOTS = {
    human: ['body', 'hair', 'top', 'bottom', 'shoes', 'hat', 'accessory'],
    witch: ['body', 'hair', 'top', 'bottom', 'shoes', 'hat', 'accessory'],
    robot: ['chassis', 'headModule', 'torsoTrim', 'legTrim', 'face', 'accessory'],
    cat: ['coat', 'ears', 'face', 'collar', 'hat', 'accessory'],
    banana: ['peel', 'face', 'hat', 'accessory'],
  };

  const FORMS = {
    human: { label: 'Human', family: 'humanoid', slots: FORM_SLOTS.human, defaultDirection: 'S' },
    witch: { label: 'Witch', family: 'humanoid', slots: FORM_SLOTS.witch, defaultDirection: 'S' },
    robot: { label: 'Robot', family: 'robot', slots: FORM_SLOTS.robot, defaultDirection: 'S' },
    cat: { label: 'Cat', family: 'cat', slots: FORM_SLOTS.cat, defaultDirection: 'S' },
    banana: { label: 'Banana', family: 'banana', slots: FORM_SLOTS.banana, defaultDirection: 'S' },
  };

  const SLOT_ORDER = {
    coat: 5,
    chassis: 5,
    peel: 5,
    body: 10,
    legTrim: 20,
    bottom: 20,
    shoes: 30,
    torsoTrim: 40,
    top: 40,
    collar: 45,
    hair: 55,
    ears: 57,
    headModule: 60,
    face: 65,
    hat: 70,
    accessory: 80,
  };

  const PALETTES = {
    skin: ['warm_light', 'warm_medium', 'warm_deep', 'cool_light', 'cool_medium', 'cool_deep'],
    hair: ['black', 'dark_brown', 'chestnut', 'blonde', 'silver', 'rose'],
    clothing: ['sky_denim', 'forest_gold', 'charcoal_red', 'cream_navy', 'plum_teal', 'mint_coral', 'rust_blue', 'black_white', 'pink_gray', 'green_black', 'yellow_violet', 'white_gold'],
    robot: ['steel_blue', 'white_orange', 'black_lime', 'navy_cyan', 'red_gold', 'gray_purple', 'green_silver', 'copper_teal'],
    cat: ['tabby', 'tuxedo', 'calico', 'ginger', 'gray', 'cream', 'black', 'white'],
    banana: ['classic', 'ripe_spots', 'green_tip', 'golden', 'sunset', 'neon', 'chocolate', 'stickered'],
  };

  const COLOR_VALUES = {
    warm_light: '#e8b58a', warm_medium: '#c78b62', warm_deep: '#8f563b',
    cool_light: '#dfb39c', cool_medium: '#a96f5e', cool_deep: '#6f423a',
    black: '#1b1715', dark_brown: '#2c1c14', chestnut: '#6e3b22', blonde: '#d8b65a', silver: '#c6c8c7', rose: '#b45c75',
    sky_denim: '#3f7fb8', forest_gold: '#2f6f52', charcoal_red: '#26313a', cream_navy: '#e8dcc3',
    plum_teal: '#6c4a8d', mint_coral: '#65b8a6', rust_blue: '#a55232', black_white: '#1b1f24',
    pink_gray: '#d77fa1', green_black: '#396b45', yellow_violet: '#d7b83f', white_gold: '#f2ede0',
  };

  const ITEM_GROUPS = {
    human: {
      body: ['average', 'slim', 'strong', 'soft'],
      hair: ['short_side_part', 'bob', 'curly', 'ponytail', 'buzz', 'long_wave', 'bun', 'spiky'],
      top: ['hoodie', 'jacket', 'tee', 'sweater', 'vest', 'dress_shirt', 'overalls', 'sport_top', 'kimono_top', 'coat'],
      bottom: ['jeans', 'skirt', 'shorts', 'slacks', 'cargo', 'leggings', 'wide_pants', 'overalls_bottom'],
      shoes: ['sneakers', 'boots', 'flats', 'loafers', 'sandals', 'high_tops'],
      hat: ['none', 'beanie', 'cap', 'wide_hat', 'headband', 'beret', 'visor', 'flower'],
      accessory: ['none', 'glasses', 'scarf', 'satchel', 'necklace', 'watch', 'backpack', 'earrings'],
    },
    witch: {
      body: ['classic', 'slim', 'strong', 'soft'],
      hair: ['short_side_part', 'bob', 'curly', 'ponytail', 'buzz', 'long_wave', 'bun', 'spiky'],
      top: ['robe', 'hoodie', 'jacket', 'tee', 'sweater', 'vest', 'dress_shirt', 'coat', 'moon_cloak', 'star_tunic'],
      bottom: ['jeans', 'skirt', 'shorts', 'slacks', 'cargo', 'leggings', 'wide_pants', 'robe_bottom'],
      shoes: ['sneakers', 'boots', 'flats', 'loafers', 'sandals', 'high_tops'],
      hat: ['witch_hat', 'none', 'beanie', 'cap', 'wide_hat', 'headband', 'beret', 'flower'],
      accessory: ['none', 'glasses', 'scarf', 'satchel', 'necklace', 'watch', 'backpack', 'moon_pin'],
    },
    robot: {
      chassis: ['round', 'boxy', 'tall', 'compact', 'retro'],
      headModule: ['visor', 'antenna', 'screen', 'dome', 'single_eye', 'twin_eye'],
      torsoTrim: ['stripe', 'panel', 'battery', 'vents', 'badge', 'core'],
      legTrim: ['boots', 'wheels', 'springs', 'treads', 'hover', 'feet'],
      face: ['neutral', 'happy', 'sleepy', 'focus', 'spark', 'blush'],
      accessory: ['none', 'toolpack', 'bowtie', 'scanner', 'tiny_cape', 'side_lamp'],
    },
    cat: {
      coat: ['tabby', 'tuxedo', 'calico', 'ginger', 'gray', 'cream'],
      ears: ['round', 'pointed', 'tufted', 'folded', 'tall'],
      face: ['neutral', 'happy', 'sleepy', 'curious', 'grumpy'],
      collar: ['none', 'red_bell', 'blue_tag', 'green_band', 'bow', 'stars'],
      hat: ['none', 'tiny_cap', 'flower', 'wizard', 'sunhat', 'ribbon'],
      accessory: ['none', 'backpack', 'fish_charm', 'cape', 'glasses', 'scarf'],
    },
    banana: {
      peel: ['classic', 'ripe_spots', 'green_tip', 'golden', 'sunset'],
      face: ['smile', 'cool', 'sleepy', 'surprised', 'focus', 'wink'],
      hat: ['none', 'cap', 'beanie', 'sunhat', 'crown', 'flower', 'wizard', 'bandana'],
      accessory: ['none', 'sticker', 'sunglasses', 'scarf', 'satchel', 'tiny_cape', 'bowtie', 'badge'],
    },
  };

  function textureFor(form, slot, value, direction) {
    return `avatar_${form}_${slot}_${value}_${direction}`;
  }

  function makeItem(form, slot, value) {
    const textures = {};
    for (const dir of DIRECTIONS) textures[dir] = textureFor(form, slot, value, dir);
    return {
      id: `${form}_${slot}_${value}`,
      label: value.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' '),
      form,
      slot,
      value,
      order: SLOT_ORDER[slot] || 50,
      textures,
      colorChannels: colorChannelsFor(form, slot),
    };
  }

  function colorChannelsFor(form, slot) {
    if (slot === 'body') return ['skin'];
    if (slot === 'hair') return ['hair'];
    if (slot === 'top' || slot === 'bottom' || slot === 'shoes' || slot === 'hat' || slot === 'accessory') return ['primary', 'secondary', 'accent'];
    if (form === 'robot') return ['metal', 'primary', 'accent'];
    if (form === 'cat') return ['fur', 'secondary', 'accent'];
    if (form === 'banana') return ['peel', 'secondary', 'accent'];
    return ['primary'];
  }

  const ITEMS = {};
  for (const [form, slots] of Object.entries(ITEM_GROUPS)) {
    for (const [slot, values] of Object.entries(slots)) {
      for (const value of values) {
        const item = makeItem(form, slot, value);
        ITEMS[item.id] = item;
      }
    }
  }

  const DEFAULTS = {
    human: {
      slots: { body: 'human_body_average', hair: 'human_hair_short_side_part', top: 'human_top_hoodie', bottom: 'human_bottom_jeans', shoes: 'human_shoes_sneakers', hat: 'human_hat_none', accessory: 'human_accessory_none' },
      colors: { skin: 'warm_medium', hair: 'dark_brown', primary: '#3f7fb8', secondary: '#202935', accent: '#f3c24f' },
    },
    witch: {
      slots: { body: 'witch_body_classic', hair: 'witch_hair_long_wave', top: 'witch_top_robe', bottom: 'witch_bottom_robe_bottom', shoes: 'witch_shoes_boots', hat: 'witch_hat_witch_hat', accessory: 'witch_accessory_none' },
      colors: { skin: 'warm_medium', hair: 'dark_brown', primary: '#6c4a8d', secondary: '#202935', accent: '#f3c24f' },
    },
    robot: {
      slots: { chassis: 'robot_chassis_round', headModule: 'robot_headModule_visor', torsoTrim: 'robot_torsoTrim_stripe', legTrim: 'robot_legTrim_boots', face: 'robot_face_neutral', accessory: 'robot_accessory_none' },
      colors: { metal: '#9aa7b0', primary: '#3f7fb8', secondary: '#202935', accent: '#f3c24f' },
    },
    cat: {
      slots: { coat: 'cat_coat_tabby', ears: 'cat_ears_pointed', face: 'cat_face_neutral', collar: 'cat_collar_red_bell', hat: 'cat_hat_none', accessory: 'cat_accessory_none' },
      colors: { fur: '#b57942', primary: '#d64a4a', secondary: '#ffffff', accent: '#f3c24f' },
    },
    banana: {
      slots: { peel: 'banana_peel_classic', face: 'banana_face_smile', hat: 'banana_hat_none', accessory: 'banana_accessory_none' },
      colors: { peel: '#f0cf4f', primary: '#f0cf4f', secondary: '#6b8f3a', accent: '#2b1f12' },
    },
  };

  return { DIRECTIONS, FORMS, FORM_SLOTS, SLOT_ORDER, PALETTES, COLOR_VALUES, ITEM_GROUPS, ITEMS, DEFAULTS };
})();
```

- [ ] **Step 4: Create appearance helper API**

Create `js/appearance.js`:

```js
// ============================================================
// SimLife - Avatar Appearance Helpers
// ============================================================
window.Game = window.Game || {};

Game.Appearance = (function() {
  const catalog = Game.AvatarCatalog;
  if (!catalog) throw new Error('Game.Appearance requires Game.AvatarCatalog to be loaded first');

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function colorNumberToHex(value) {
    if (typeof value !== 'number') return '#3f7fb8';
    return '#' + value.toString(16).padStart(6, '0').slice(-6);
  }

  function legacyFormToCatalog(form) {
    if (form === 'online_witch') return 'witch';
    if (form === 'robot' || form === 'cat' || form === 'banana' || form === 'human' || form === 'witch') return form;
    return 'human';
  }

  function defaultFormState(form) {
    const defaults = catalog.DEFAULTS[form] || catalog.DEFAULTS.human;
    return clone(defaults);
  }

  function fromLegacy(character) {
    const form = legacyFormToCatalog(character && character.form);
    const state = {
      form,
      forms: {},
      outfitId: 'everyday',
    };
    state.forms[form] = defaultFormState(form);
    if (character && character.color !== undefined) {
      const legacyHex = typeof character.color === 'string' ? character.color : colorNumberToHex(character.color);
      state.forms[form].colors.primary = legacyHex;
      if (form === 'robot') state.forms[form].colors.accent = legacyHex;
      if (form === 'cat') state.forms[form].colors.accent = legacyHex;
      if (form === 'banana') state.forms[form].colors.peel = legacyHex;
    }
    return normalizeAppearance(state);
  }

  function normalizeAppearance(input) {
    const appearance = input && typeof input === 'object' ? clone(input) : {};
    const activeForm = legacyFormToCatalog(appearance.form);
    const result = {
      form: activeForm,
      forms: appearance.forms && typeof appearance.forms === 'object' ? appearance.forms : {},
      outfitId: appearance.outfitId || 'everyday',
    };

    for (const form of Object.keys(catalog.FORMS)) {
      if (!result.forms[form]) result.forms[form] = defaultFormState(form);
      result.forms[form] = normalizeFormState(form, result.forms[form]);
    }
    return result;
  }

  function normalizeFormState(form, formState) {
    const defaults = defaultFormState(form);
    const slots = { ...defaults.slots, ...(formState && formState.slots ? formState.slots : {}) };
    const colors = { ...defaults.colors, ...(formState && formState.colors ? formState.colors : {}) };
    for (const slot of catalog.FORMS[form].slots) {
      const itemId = slots[slot];
      const item = catalog.ITEMS[itemId];
      if (!item || item.form !== form || item.slot !== slot) slots[slot] = defaults.slots[slot];
    }
    return { slots, colors };
  }

  function getActiveFormState(appearance) {
    const normalized = normalizeAppearance(appearance);
    return normalized.forms[normalized.form];
  }

  function setForm(appearance, form) {
    const normalized = normalizeAppearance(appearance);
    normalized.form = catalog.FORMS[form] ? form : 'human';
    if (!normalized.forms[normalized.form]) normalized.forms[normalized.form] = defaultFormState(normalized.form);
    return normalizeAppearance(normalized);
  }

  function setSlot(appearance, slot, itemId) {
    const normalized = normalizeAppearance(appearance);
    const form = normalized.form;
    const item = catalog.ITEMS[itemId];
    if (item && item.form === form && item.slot === slot) normalized.forms[form].slots[slot] = itemId;
    return normalizeAppearance(normalized);
  }

  function setColor(appearance, channel, value) {
    const normalized = normalizeAppearance(appearance);
    normalized.forms[normalized.form].colors[channel] = value;
    return normalizeAppearance(normalized);
  }

  function getItemsForSlot(form, slot) {
    return Object.values(catalog.ITEMS).filter(item => item.form === form && item.slot === slot);
  }

  function getRenderLayers(appearance, direction) {
    const normalized = normalizeAppearance(appearance);
    const formState = normalized.forms[normalized.form];
    const dir = catalog.DIRECTIONS.includes(direction) ? direction : catalog.FORMS[normalized.form].defaultDirection;
    return Object.entries(formState.slots)
      .map(([slot, itemId]) => catalog.ITEMS[itemId])
      .filter(Boolean)
      .filter(item => item.value !== 'none')
      .map(item => ({
        id: item.id,
        slot: item.slot,
        order: item.order,
        textureKey: item.textures[dir] || item.textures.S,
        colorChannels: item.colorChannels,
        colors: formState.colors,
      }))
      .sort((a, b) => a.order - b.order);
  }

  return {
    normalizeAppearance,
    normalizeFormState,
    fromLegacy,
    setForm,
    setSlot,
    setColor,
    getActiveFormState,
    getItemsForSlot,
    getRenderLayers,
    legacyFormToCatalog,
  };
})();
```

- [ ] **Step 5: Load scripts before state/UI/renderer consumers**

Modify `index.html` script order so the new helpers load after config and before state:

```html
<script src="js/config.js?v=2"></script>
<script src="js/avatar_catalog.js?v=1"></script>
<script src="js/appearance.js?v=1"></script>
<script src="js/state.js?v=2"></script>
```

- [ ] **Step 6: Run helper verification**

Run: `npm test`

Expected: FAIL may move to missing runtime assets or unrelated existing local dirty source, but `checkAppearanceHelpers()` must no longer fail.

- [ ] **Step 7: Commit**

```bash
git add index.html js/avatar_catalog.js js/appearance.js scripts/verify-game.js
git commit -m "feat: add avatar appearance catalog"
```

---

### Task 2: Deterministic Avatar Asset Generator

**Files:**
- Create: `scripts/generate-avatar-assets.js`
- Create generated: `assets/avatar_layers/*.png`
- Create generated: `js/avatar_assets.js`
- Modify: `package.json`
- Modify: `index.html`
- Modify: `scripts/verify-game.js`

- [ ] **Step 1: Write failing resource checks**

In `checkResources()`, load avatar assets:

```js
const context = loadBrowserGlobals(['js/assets.js', 'js/avatar_assets.js', 'js/config.js']);
const avatarAssetKeys = Object.keys(context.SIM_AVATAR_ASSETS || {});
if (avatarAssetKeys.length < 250) fail(`Expected at least 250 avatar layer assets, found ${avatarAssetKeys.length}`);
```

Add required avatar keys:

```js
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
```

- [ ] **Step 2: Run verification to confirm it fails**

Run: `npm test`

Expected: FAIL with `ENOENT` for `js/avatar_assets.js` or `Expected at least 250 avatar layer assets`.

- [ ] **Step 3: Create the generator**

Create `scripts/generate-avatar-assets.js`:

```js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'assets', 'avatar_layers');
const outJs = path.join(root, 'js', 'avatar_assets.js');
fs.mkdirSync(outDir, { recursive: true });

function loadCatalog() {
  const context = { console };
  context.window = context;
  context.Game = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'avatar_catalog.js'), 'utf8'), context, { filename: 'js/avatar_catalog.js' });
  return context.Game.AvatarCatalog;
}

function svgFor(item, direction) {
  const base = shapeFor(item, direction);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="160" viewBox="0 0 128 160">
    <rect width="128" height="160" fill="none"/>
    ${base}
  </svg>`;
}

function shapeFor(item, direction) {
  const skew = direction === 'NE' ? -6 : direction === 'SE' ? 6 : direction === 'E' ? 10 : direction === 'N' ? -2 : 0;
  const colors = colorsFor(item);
  const outline = '#090b0e';
  const slot = item.slot;

  if (slot === 'body') return isoPerson(colors.skin, outline, skew);
  if (slot === 'hair') return `<path d="M43 38 L64 22 L86 38 L80 52 L48 52 Z" fill="${colors.hair}" stroke="${outline}" stroke-width="4"/>`;
  if (slot === 'top') return `<path d="M39 72 L64 56 L91 72 L83 112 L45 112 Z" fill="${colors.primary}" stroke="${outline}" stroke-width="4"/><path d="M48 80 L64 70 L80 80 L75 96 L53 96 Z" fill="${colors.secondary}" opacity=".35"/>`;
  if (slot === 'bottom') return `<path d="M47 110 L61 104 L61 144 L42 144 Z" fill="${colors.secondary}" stroke="${outline}" stroke-width="4"/><path d="M67 104 L84 110 L86 144 L67 144 Z" fill="${colors.secondary}" stroke="${outline}" stroke-width="4"/>`;
  if (slot === 'shoes') return `<path d="M38 142 L62 142 L59 152 L34 152 Z" fill="${colors.accent}" stroke="${outline}" stroke-width="4"/><path d="M66 142 L91 142 L96 152 L69 152 Z" fill="${colors.accent}" stroke="${outline}" stroke-width="4"/>`;
  if (slot === 'hat') return item.value === 'none' ? '' : `<path d="M35 34 L64 12 L94 34 Z" fill="${colors.accent}" stroke="${outline}" stroke-width="4"/><path d="M28 42 L100 42 L88 54 L40 54 Z" fill="${colors.primary}" stroke="${outline}" stroke-width="4"/>`;
  if (slot === 'accessory') return item.value === 'none' ? '' : `<path d="M88 78 L108 90 L98 120 L82 110 Z" fill="${colors.accent}" stroke="${outline}" stroke-width="4"/>`;
  if (slot === 'chassis') return `<path d="M38 46 L64 28 L92 46 L90 118 L64 138 L38 118 Z" fill="${colors.metal}" stroke="${outline}" stroke-width="4"/><path d="M48 62 L80 62 L80 92 L48 92 Z" fill="${colors.primary}" stroke="${outline}" stroke-width="3"/>`;
  if (slot === 'headModule') return `<path d="M44 30 L64 18 L84 30 L84 52 L64 64 L44 52 Z" fill="${colors.metal}" stroke="${outline}" stroke-width="4"/>`;
  if (slot === 'torsoTrim') return `<path d="M48 76 L80 76 L76 86 L52 86 Z" fill="${colors.accent}" stroke="${outline}" stroke-width="3"/>`;
  if (slot === 'legTrim') return `<path d="M46 120 L60 128 L56 150 L40 142 Z" fill="${colors.primary}" stroke="${outline}" stroke-width="4"/><path d="M68 128 L84 120 L90 142 L72 150 Z" fill="${colors.primary}" stroke="${outline}" stroke-width="4"/>`;
  if (slot === 'coat') return `<path d="M30 78 L64 42 L100 78 L90 132 L64 148 L38 132 Z" fill="${colors.fur}" stroke="${outline}" stroke-width="4"/><path d="M44 86 L84 86 L78 112 L50 112 Z" fill="${colors.secondary}" opacity=".35"/>`;
  if (slot === 'ears') return `<path d="M40 54 L48 26 L60 58 Z" fill="${colors.fur}" stroke="${outline}" stroke-width="4"/><path d="M88 54 L80 26 L68 58 Z" fill="${colors.fur}" stroke="${outline}" stroke-width="4"/>`;
  if (slot === 'face') return `<circle cx="54" cy="70" r="4" fill="${outline}"/><circle cx="74" cy="70" r="4" fill="${outline}"/><path d="M56 84 Q64 92 74 84" fill="none" stroke="${outline}" stroke-width="4" stroke-linecap="round"/>`;
  if (slot === 'collar') return item.value === 'none' ? '' : `<path d="M42 92 L86 92 L82 102 L46 102 Z" fill="${colors.accent}" stroke="${outline}" stroke-width="3"/>`;
  if (slot === 'peel') return `<path d="M44 142 C28 84 45 34 64 18 C84 34 100 84 84 142 C70 152 58 152 44 142 Z" fill="${colors.peel}" stroke="${outline}" stroke-width="4"/><path d="M62 24 C54 70 56 112 64 146" fill="none" stroke="${outline}" stroke-width="3" opacity=".35"/>`;
  return '';
}

function isoPerson(skin, outline, skew) {
  return `<g transform="skewX(${skew})">
    <path d="M47 44 L64 30 L82 44 L78 64 L50 64 Z" fill="${skin}" stroke="${outline}" stroke-width="4"/>
    <path d="M36 80 L46 72 L50 120 L38 124 Z" fill="${skin}" stroke="${outline}" stroke-width="4"/>
    <path d="M92 80 L82 72 L78 120 L90 124 Z" fill="${skin}" stroke="${outline}" stroke-width="4"/>
  </g>`;
}

function colorsFor(item) {
  const palettes = {
    skin: '#c78b62', hair: '#2c1c14', primary: '#3f7fb8', secondary: '#202935', accent: '#f3c24f',
    metal: '#9aa7b0', fur: '#b57942', peel: '#f0cf4f',
  };
  const hash = Array.from(item.id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const variants = ['#3f7fb8', '#2f6f52', '#6c4a8d', '#a55232', '#65b8a6', '#d77fa1', '#d7b83f', '#26313a'];
  palettes.primary = variants[hash % variants.length];
  palettes.accent = variants[(hash + 3) % variants.length];
  return palettes;
}

(async () => {
  const catalog = loadCatalog();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 128, height: 160, deviceScaleFactor: 1 } });
  const assets = {};

  for (const item of Object.values(catalog.ITEMS)) {
    for (const dir of catalog.DIRECTIONS) {
      const key = item.textures[dir];
      const svg = svgFor(item, dir);
      await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
      const buffer = await page.locator('svg').screenshot({ omitBackground: true });
      const fileName = `${key}.png`;
      fs.writeFileSync(path.join(outDir, fileName), buffer);
      assets[key] = `data:image/png;base64,${buffer.toString('base64')}`;
    }
  }

  await browser.close();
  const body = `// Generated by scripts/generate-avatar-assets.js\nwindow.SIM_AVATAR_ASSETS = ${JSON.stringify(assets, null, 2)};\n`;
  fs.writeFileSync(outJs, body);
  console.log(JSON.stringify({ ok: true, count: Object.keys(assets).length, outJs, outDir }, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Add npm script**

Modify `package.json` scripts:

```json
"generate:avatars": "node scripts/generate-avatar-assets.js"
```

- [ ] **Step 5: Generate assets**

Run: `npm run generate:avatars`

Expected: PASS with JSON containing `"ok": true` and a count greater than `250`.

- [ ] **Step 6: Load generated avatar assets**

Modify `index.html` so avatar assets load after `js/assets.js` and before renderer:

```html
<script src="js/assets.js?v=1"></script>
<script src="js/avatar_assets.js?v=1"></script>
<script src="js/renderer_math.js?v=1"></script>
```

- [ ] **Step 7: Run resource verification**

Run: `npm test`

Expected: resource checks pass for avatar assets. Runtime may still fail until renderer integration is implemented.

- [ ] **Step 8: Commit**

```bash
git add package.json scripts/generate-avatar-assets.js assets/avatar_layers js/avatar_assets.js index.html scripts/verify-game.js
git commit -m "feat: generate avatar layer assets"
```

---

### Task 3: Save-State Migration

**Files:**
- Modify: `js/state.js`
- Modify: `scripts/verify-game.js`

- [ ] **Step 1: Write failing state migration test**

Add `checkStateAppearanceMigration()` after `checkAppearanceHelpers()`:

```js
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
}
```

Call it after `checkAppearanceHelpers()`:

```js
checkStateAppearanceMigration();
```

- [ ] **Step 2: Run verification to confirm it fails**

Run: `npm test`

Expected: FAIL with `Expected new state character.appearance`.

- [ ] **Step 3: Add appearance defaults to new state**

In `js/state.js`, inside `createNewState().character`, replace the appearance-adjacent fields:

```js
trait: Object.keys(cfg.TRAITS || {})[Math.floor(Math.random() * Object.keys(cfg.TRAITS || {}).length)] || 'neat',
form: 'online_witch',
color: 0x88CCFF,
appearance: Game.Appearance ? Game.Appearance.fromLegacy({ form: 'online_witch', color: 0x88CCFF }) : null,
currentActivity: null,
```

- [ ] **Step 4: Normalize loaded saves**

In `loadSlot`, after the legacy `mapId` migration, add:

```js
if (Game.Appearance) {
  if (!saved.character) saved.character = {};
  saved.character.appearance = saved.character.appearance
    ? Game.Appearance.normalizeAppearance(saved.character.appearance)
    : Game.Appearance.fromLegacy(saved.character);
}
```

Replace the old color-only fallback:

```js
if (!state.character.color) state.character.color = 0x88CCFF;
```

with:

```js
if (!state.character.color) state.character.color = 0x88CCFF;
if (Game.Appearance) state.character.appearance = Game.Appearance.normalizeAppearance(state.character.appearance);
```

- [ ] **Step 5: Apply character creation data**

In `createSave`, replace the form/color assignment block with:

```js
if (characterData) {
  fresh.character.name = characterData.name || fresh.character.name;
  fresh.character.trait = characterData.trait || fresh.character.trait;

  let c = characterData.color || '#88CCFF';
  if (typeof c === 'string' && c.startsWith('#')) c = parseInt(c.replace('#', '0x'), 16);
  fresh.character.color = c;
  fresh.character.form = characterData.form || fresh.character.form || 'online_witch';

  if (Game.Appearance) {
    fresh.character.appearance = characterData.appearance
      ? Game.Appearance.normalizeAppearance(characterData.appearance)
      : Game.Appearance.fromLegacy({ form: fresh.character.form, color: fresh.character.color });
  }
}
```

- [ ] **Step 6: Run migration verification**

Run: `npm test`

Expected: `checkStateAppearanceMigration()` passes.

- [ ] **Step 7: Commit**

```bash
git add js/state.js scripts/verify-game.js
git commit -m "feat: migrate character appearance saves"
```

---

### Task 4: Shared Avatar Editor UI

**Files:**
- Create: `js/avatar_editor.js`
- Modify: `index.html`
- Modify: `js/ui.js`
- Modify: `css/main.css`
- Modify: `scripts/verify-game.js`

- [ ] **Step 1: Write failing editor smoke check**

Inside `checkElectronRuntime()`, after opening the new-game screen and before clicking start, add:

```js
await page.waitForSelector('#cc-avatar-editor .avatar-editor', { timeout: 10000 });
await page.click('#cc-avatar-editor [data-avatar-form="robot"]');
await page.click('#cc-avatar-editor [data-avatar-tab="colors"]');
await page.click('#cc-avatar-editor [data-color-channel="primary"]');
```

After starting the game, open the in-game editor:

```js
await page.evaluate(() => Game.UI.openEditModal());
await page.waitForSelector('#ec-avatar-editor .avatar-editor', { timeout: 10000 });
await page.click('#ec-avatar-editor [data-avatar-form="cat"]');
await page.click('#btn-ec-save');
await page.waitForFunction(() => window.Game.State.get().character.appearance.form === 'cat', null, { timeout: 10000 });
```

- [ ] **Step 2: Run verification to confirm it fails**

Run: `npm test`

Expected: FAIL waiting for `#cc-avatar-editor .avatar-editor`.

- [ ] **Step 3: Replace simple form/color markup with editor containers**

In `index.html`, replace the character creation `Skin / Shirt Color` and `Avatar Form` fields with:

```html
<div class="cc-field">
  <label>Appearance:</label>
  <div id="cc-avatar-editor"></div>
</div>
```

In the edit modal, replace `Color Tint` and `Avatar Form` fields with:

```html
<div class="cc-field">
  <label>Appearance:</label>
  <div id="ec-avatar-editor"></div>
</div>
```

Load the editor before UI:

```html
<script src="js/avatar_editor.js?v=1"></script>
<script src="js/ui.js?v=2"></script>
```

- [ ] **Step 4: Create editor module**

Create `js/avatar_editor.js`:

```js
// ============================================================
// SimLife - Shared Avatar Editor
// ============================================================
window.Game = window.Game || {};

Game.AvatarEditor = (function() {
  const instances = new Map();
  const tabs = ['body', 'clothes', 'accessories', 'colors'];

  function mount(containerId, initialAppearance, options) {
    const el = document.getElementById(containerId);
    if (!el) return null;
    const state = {
      containerId,
      appearance: Game.Appearance.normalizeAppearance(initialAppearance),
      activeTab: 'body',
      onChange: options && options.onChange,
    };
    instances.set(containerId, state);
    render(state);
    return {
      getAppearance: () => Game.Appearance.normalizeAppearance(state.appearance),
      setAppearance: (appearance) => {
        state.appearance = Game.Appearance.normalizeAppearance(appearance);
        render(state);
      },
    };
  }

  function render(state) {
    const el = document.getElementById(state.containerId);
    if (!el) return;
    const catalog = Game.AvatarCatalog;
    const form = state.appearance.form;
    const formState = Game.Appearance.getActiveFormState(state.appearance);
    el.innerHTML = `
      <div class="avatar-editor">
        <div class="avatar-preview" aria-label="Avatar preview">${previewHtml(state.appearance)}</div>
        <div class="avatar-form-row">
          ${Object.entries(catalog.FORMS).map(([key, item]) => `
            <button type="button" class="avatar-form-btn ${key === form ? 'selected' : ''}" data-avatar-form="${key}">${item.label}</button>
          `).join('')}
        </div>
        <div class="avatar-tabs">
          ${tabs.map(tab => `<button type="button" class="${state.activeTab === tab ? 'selected' : ''}" data-avatar-tab="${tab}">${label(tab)}</button>`).join('')}
        </div>
        <div class="avatar-tab-body">${tabHtml(state, formState)}</div>
      </div>
    `;
    bind(el, state);
  }

  function previewHtml(appearance) {
    const form = appearance.form;
    return `<div class="avatar-preview-figure avatar-preview-${form}"><span>${form[0].toUpperCase()}</span></div>`;
  }

  function tabHtml(state, formState) {
    if (state.activeTab === 'colors') return colorsHtml(formState);
    const slots = slotsForTab(state.appearance.form, state.activeTab);
    return slots.map(slot => slotHtml(state.appearance.form, slot, formState.slots[slot])).join('');
  }

  function slotsForTab(form, tab) {
    const slots = Game.AvatarCatalog.FORMS[form].slots;
    if (tab === 'body') return slots.filter(slot => ['body', 'hair', 'chassis', 'headModule', 'coat', 'ears', 'peel', 'face'].includes(slot));
    if (tab === 'clothes') return slots.filter(slot => ['top', 'bottom', 'shoes', 'torsoTrim', 'legTrim', 'collar'].includes(slot));
    if (tab === 'accessories') return slots.filter(slot => ['hat', 'accessory'].includes(slot));
    return [];
  }

  function slotHtml(form, slot, selectedId) {
    const items = Game.Appearance.getItemsForSlot(form, slot);
    return `<div class="avatar-slot-group">
      <div class="avatar-slot-title">${label(slot)}</div>
      <div class="avatar-option-grid">
        ${items.map(item => `<button type="button" class="${item.id === selectedId ? 'selected' : ''}" data-avatar-slot="${slot}" data-avatar-item="${item.id}">${item.label}</button>`).join('')}
      </div>
    </div>`;
  }

  function colorsHtml(formState) {
    return `<div class="avatar-slot-group">
      <div class="avatar-slot-title">Colors</div>
      <div class="avatar-swatch-grid">
        ${Object.entries(formState.colors).map(([channel, value]) => `
          <button type="button" class="avatar-swatch" data-color-channel="${channel}" title="${label(channel)}">
            <span style="background:${resolveColor(value)}"></span>${label(channel)}
          </button>
        `).join('')}
      </div>
    </div>`;
  }

  function bind(el, state) {
    el.querySelectorAll('[data-avatar-form]').forEach(btn => btn.addEventListener('click', () => update(state, Game.Appearance.setForm(state.appearance, btn.dataset.avatarForm))));
    el.querySelectorAll('[data-avatar-tab]').forEach(btn => btn.addEventListener('click', () => { state.activeTab = btn.dataset.avatarTab; render(state); }));
    el.querySelectorAll('[data-avatar-item]').forEach(btn => btn.addEventListener('click', () => update(state, Game.Appearance.setSlot(state.appearance, btn.dataset.avatarSlot, btn.dataset.avatarItem))));
    el.querySelectorAll('[data-color-channel]').forEach(btn => btn.addEventListener('click', () => cycleColor(state, btn.dataset.colorChannel)));
  }

  function cycleColor(state, channel) {
    const palette = ['#3f7fb8', '#2f6f52', '#6c4a8d', '#a55232', '#65b8a6', '#d77fa1', '#d7b83f', '#26313a'];
    const formState = Game.Appearance.getActiveFormState(state.appearance);
    const current = resolveColor(formState.colors[channel]);
    const idx = palette.indexOf(current);
    update(state, Game.Appearance.setColor(state.appearance, channel, palette[(idx + 1) % palette.length]));
  }

  function update(state, appearance) {
    state.appearance = Game.Appearance.normalizeAppearance(appearance);
    if (state.onChange) state.onChange(state.appearance);
    render(state);
  }

  function resolveColor(value) {
    return Game.AvatarCatalog.COLOR_VALUES[value] || value || '#3f7fb8';
  }

  function label(value) {
    return String(value).replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
  }

  return { mount };
})();
```

- [ ] **Step 5: Wire UI creation and save**

In `js/ui.js`, add module-level handles near `let notifications = []`:

```js
let createAvatarEditor = null;
let editAvatarEditor = null;
```

In `initMainMenu()`, after trait grids are populated:

```js
createAvatarEditor = Game.AvatarEditor.mount('cc-avatar-editor', Game.Appearance.fromLegacy({ form: 'online_witch', color: 0x88CCFF }));
```

In the new-game start handler, replace color/form reads with:

```js
const appearance = createAvatarEditor ? createAvatarEditor.getAppearance() : Game.Appearance.fromLegacy({ form: 'online_witch', color: 0x88CCFF });
const form = appearance.form;
const color = Game.Appearance.getActiveFormState(appearance).colors.primary || '#88CCFF';
```

Pass `appearance` into `createSave`:

```js
Game.State.createSave(worldName, { name: simName, trait: traitKey, color: color, form: form, appearance: appearance });
```

In `openEditModal()`, replace form/color DOM assignments with:

```js
editAvatarEditor = Game.AvatarEditor.mount('ec-avatar-editor', char.appearance || Game.Appearance.fromLegacy(char), {
  onChange: (appearance) => {
    char.appearance = appearance;
    char.form = appearance.form === 'witch' ? 'online_witch' : appearance.form;
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
  }
});
```

In the edit-save handler, replace color/form reads with:

```js
const appearance = editAvatarEditor ? editAvatarEditor.getAppearance() : Game.Appearance.fromLegacy(char);
char.appearance = appearance;
char.form = appearance.form === 'witch' ? 'online_witch' : appearance.form;
const activeColors = Game.Appearance.getActiveFormState(appearance).colors;
if (activeColors.primary && activeColors.primary.startsWith('#')) char.color = parseInt(activeColors.primary.replace('#', '0x'), 16);
```

- [ ] **Step 6: Add CSS**

Append to `css/main.css`:

```css
.avatar-editor {
  display: grid;
  gap: 10px;
}
.avatar-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
}
.avatar-preview-figure {
  width: 76px;
  height: 96px;
  display: grid;
  place-items: center;
  color: white;
  font-weight: 800;
  border: 3px solid #101317;
  box-shadow: 0 10px 0 rgba(0, 0, 0, 0.2);
  transform: skewY(-8deg);
}
.avatar-preview-human { background: #3f7fb8; }
.avatar-preview-witch { background: #6c4a8d; }
.avatar-preview-robot { background: #8e9aa3; }
.avatar-preview-cat { background: #b57942; }
.avatar-preview-banana { background: #f0cf4f; color: #2b1f12; }
.avatar-form-row,
.avatar-tabs,
.avatar-option-grid,
.avatar-swatch-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.avatar-form-btn,
.avatar-tabs button,
.avatar-option-grid button,
.avatar-swatch {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-light);
  border-radius: 6px;
  padding: 7px 9px;
  cursor: pointer;
  font-size: 12px;
}
.avatar-form-btn.selected,
.avatar-tabs button.selected,
.avatar-option-grid button.selected {
  border-color: var(--gold);
  background: rgba(240, 196, 90, 0.22);
}
.avatar-slot-title {
  margin: 8px 0 5px;
  color: var(--gold);
  font-weight: 700;
  font-size: 12px;
}
.avatar-swatch span {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.45);
  vertical-align: -2px;
}
```

- [ ] **Step 7: Run editor smoke test**

Run: `npm test`

Expected: editor selectors pass and runtime reaches canvas.

- [ ] **Step 8: Commit**

```bash
git add index.html js/avatar_editor.js js/ui.js css/main.css scripts/verify-game.js
git commit -m "feat: add avatar customization editor"
```

---

### Task 5: Renderer Avatar Composer

**Files:**
- Create: `js/avatar_renderer.js`
- Modify: `index.html`
- Modify: `js/renderer.js`
- Modify: `scripts/verify-game.js`

- [ ] **Step 1: Write failing runtime render assertion**

In the `page.evaluate()` result object in `checkElectronRuntime()`, add:

```js
avatarDebug: window.Game.Renderer.getAvatarDebug ? window.Game.Renderer.getAvatarDebug() : null,
```

After result validation, add:

```js
if (!result.avatarDebug || result.avatarDebug.layerCount < 1) {
  fail(`Expected rendered avatar layers, found ${JSON.stringify(result.avatarDebug)}`);
}
```

- [ ] **Step 2: Run verification to confirm it fails**

Run: `npm test`

Expected: FAIL with `Expected rendered avatar layers`.

- [ ] **Step 3: Create Phaser avatar renderer helper**

Create `js/avatar_renderer.js`:

```js
// ============================================================
// SimLife - Phaser Avatar Renderer
// ============================================================
window.Game = window.Game || {};

Game.AvatarRenderer = (function() {
  function create(scene) {
    return {
      scene,
      container: null,
      layers: new Map(),
      lastSignature: '',
      layerCount: 0,
    };
  }

  function sync(instance, character, x, y, direction) {
    if (!instance.container) {
      instance.container = instance.scene.add.container(x, y);
    }
    instance.container.setPosition(x, y);

    const appearance = character.appearance || (Game.Appearance ? Game.Appearance.fromLegacy(character) : null);
    const layers = Game.Appearance.getRenderLayers(appearance, direction || 'S');
    const signature = JSON.stringify(layers.map(layer => [layer.id, layer.textureKey, layer.colors]));

    if (signature !== instance.lastSignature) {
      rebuild(instance, layers);
      instance.lastSignature = signature;
    }

    instance.layerCount = layers.length;
    return instance.container;
  }

  function rebuild(instance, layers) {
    const liveKeys = new Set();
    for (const layer of layers) {
      liveKeys.add(layer.id);
      let sprite = instance.layers.get(layer.id);
      if (!sprite) {
        sprite = instance.scene.add.image(0, 0, layer.textureKey);
        sprite.setOrigin(0.5, 0.9);
        instance.container.add(sprite);
        instance.layers.set(layer.id, sprite);
      }
      sprite.setTexture(layer.textureKey);
      sprite.setDepth(layer.order);
      sprite.clearTint();
    }

    for (const [id, sprite] of Array.from(instance.layers.entries())) {
      if (!liveKeys.has(id)) {
        sprite.destroy();
        instance.layers.delete(id);
      }
    }

    instance.container.sort('depth');
  }

  function destroy(instance) {
    if (instance && instance.container) instance.container.destroy(true);
  }

  return { create, sync, destroy };
})();
```

- [ ] **Step 4: Load generated avatar assets into Phaser**

In `js/renderer.js` preload, after preloading `SIM_PRELOADED_IMAGES`, add:

```js
for (const key in window.SIM_PRELOADED_AVATAR_IMAGES || {}) {
  this.textures.addImage(key, window.SIM_PRELOADED_AVATAR_IMAGES[key]);
}
```

In `js/renderer.js` `init(canvasEl)`, replace the first two lines:

```js
let keys = Object.keys(window.SIM_ASSETS || {});
if (keys.length === 0) {
```

with:

```js
window.SIM_PRELOADED_IMAGES = window.SIM_PRELOADED_IMAGES || {};
window.SIM_PRELOADED_AVATAR_IMAGES = window.SIM_PRELOADED_AVATAR_IMAGES || {};
const baseAssets = window.SIM_ASSETS || {};
const avatarAssets = window.SIM_AVATAR_ASSETS || {};
let entries = [
  ...Object.entries(baseAssets).map(([key, src]) => ({ key, src, target: window.SIM_PRELOADED_IMAGES })),
  ...Object.entries(avatarAssets).map(([key, src]) => ({ key, src, target: window.SIM_PRELOADED_AVATAR_IMAGES })),
];
if (entries.length === 0) {
```

Then replace the preload loop:

```js
for (let key of keys) {
  let img = new Image();
  img.onload = () => {
    window.SIM_PRELOADED_IMAGES[key] = img;
    loadedCount++;
    if (loadedCount === keys.length) {
      startPhaser(canvasEl);
    }
  };
  img.onerror = () => {
    console.error('Failed to load image for key:', key);
    window.SIM_PRELOADED_IMAGES[key] = new Image();
    loadedCount++;
    if (loadedCount === keys.length) {
      startPhaser(canvasEl);
    }
  };
  img.src = window.SIM_ASSETS[key];
}
```

with:

```js
for (let entry of entries) {
  let img = new Image();
  img.onload = () => {
    entry.target[entry.key] = img;
    loadedCount++;
    if (loadedCount === entries.length) startPhaser(canvasEl);
  };
  img.onerror = () => {
    console.error('Failed to load image for key:', entry.key);
    entry.target[entry.key] = new Image();
    loadedCount++;
    if (loadedCount === entries.length) startPhaser(canvasEl);
  };
  img.src = entry.src;
}
```

- [ ] **Step 5: Integrate with `syncCharacter`**

In `js/renderer.js`, add module-level state near `characterSprite`:

```js
let avatarRenderer = null;
let avatarContainer = null;
let avatarDirection = 'S';
```

Inside `syncCharacter`, after computing `ptActual`, create the helper:

```js
if (!avatarRenderer && Game.AvatarRenderer) {
  avatarRenderer = Game.AvatarRenderer.create(this);
}
```

Replace the single `characterSprite` creation/update path with:

```js
if (avatarRenderer && Game.Appearance && charObj.appearance) {
  avatarDirection = this.resolveAvatarDirection ? this.resolveAvatarDirection(charObj) : avatarDirection;
  avatarContainer = Game.AvatarRenderer.sync(avatarRenderer, charObj, ptActual.x, ptActual.y, avatarDirection);
  characterSprite = avatarContainer;
} else {
  // keep existing legacy single-sprite branch here unchanged
}
```

Add `resolveAvatarDirection(charObj)` as a `MainScene` method:

```js
resolveAvatarDirection(charObj) {
  if (!charObj.targetPosition) return avatarDirection || 'S';
  const dx = charObj.targetPosition.x - charObj.position.x;
  const dy = charObj.targetPosition.y - charObj.position.y;
  if (dx < -0.1 && dy < -0.1) return 'N';
  if (dx > 0.1 && dy < -0.1) return 'E';
  if (dx < -0.1 && dy > 0.1) return 'E';
  if (dx > 0.1 && Math.abs(dy) < 0.1) return 'SE';
  if (dx < -0.1 && Math.abs(dy) < 0.1) return 'NE';
  if (Math.abs(dx) < 0.1 && dy < -0.1) return 'NE';
  return 'S';
}
```

Keep label, thought bubble, shadow, activity glow, marker, and depth logic using `avatarContainer` when layered mode is active.

- [ ] **Step 6: Expose debug info**

In the `Game.Renderer` return object, add:

```js
getAvatarDebug: function() {
  return {
    layerCount: avatarRenderer ? avatarRenderer.layerCount : 0,
    hasContainer: !!avatarContainer,
    direction: avatarDirection,
  };
},
```

- [ ] **Step 7: Load avatar renderer script**

In `index.html`, load before `renderer.js`:

```html
<script src="js/avatar_renderer.js?v=1"></script>
<script src="js/renderer.js?v=5"></script>
```

- [ ] **Step 8: Run renderer verification**

Run: `npm test`

Expected: runtime passes with `avatarDebug.layerCount >= 1`.

- [ ] **Step 9: Commit**

```bash
git add index.html js/avatar_renderer.js js/renderer.js scripts/verify-game.js
git commit -m "feat: render layered avatar sprites"
```

---

### Task 6: Final Smoke Coverage And Documentation

**Files:**
- Modify: `scripts/verify-game.js`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-05-16-character-customization-design.md` only if implementation intentionally differs from the approved spec.

- [ ] **Step 1: Expand browser form-switch smoke test**

In `checkElectronRuntime()`, after opening the edit modal, add this loop:

```js
for (const form of ['human', 'witch', 'robot', 'cat', 'banana']) {
  await page.click(`#ec-avatar-editor [data-avatar-form="${form}"]`);
  await page.waitForFunction(expected => window.Game.State.get().character.appearance.form === expected, form, { timeout: 10000 });
}
await page.click('#ec-avatar-editor [data-avatar-tab="colors"]');
await page.click('#ec-avatar-editor [data-color-channel="primary"]');
await page.click('#btn-ec-save');
```

- [ ] **Step 2: Add canvas nonblank check**

After the game starts, add:

```js
const pixelCheck = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { supported: false, nonBlank: true };
  const data = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 20, 20).data;
  let alpha = 0;
  for (let i = 3; i < data.length; i += 4) alpha += data[i];
  return { supported: true, nonBlank: alpha > 0 };
});
if (!pixelCheck.nonBlank) fail(`Expected nonblank canvas pixels, found ${JSON.stringify(pixelCheck)}`);
```

- [ ] **Step 3: Update README**

Add this bullet to the feature list in `README.md`:

```markdown
- **Character Customization** - Edit avatar form, body parts, clothing, accessories, and color sets during creation or any time in-game.
```

- [ ] **Step 4: Run complete verification**

Run: `npm test`

Expected: PASS and print JSON with `"ok": true`.

- [ ] **Step 5: Inspect git status**

Run: `git status --short`

Expected: only files from this customization implementation are modified or untracked.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-game.js README.md
git commit -m "test: cover avatar customization flow"
```

---

## Self-Review Checklist

- Spec coverage:
  - Full support for all current forms is covered by Task 1 catalog, Task 2 generated assets, Task 4 editor, and Task 6 form-switch smoke test.
  - Cosmetic-only scope is preserved because tasks touch appearance, UI, renderer, state migration, and tests only.
  - Any-time in-game editing is covered by Task 4 editor wiring and Task 6 smoke test.
  - Pre-generated selectable assets are covered by Task 2.
  - Renderer composition, migration, fallback, and tests are covered by Tasks 3-6.
- Type consistency:
  - Active appearance key is `character.appearance.form`.
  - Per-form state is `character.appearance.forms[form].slots` and `.colors`.
  - Catalog item ids use `${form}_${slot}_${value}`.
  - Texture keys use `avatar_${form}_${slot}_${value}_${direction}`.
- Execution rule:
  - Do not edit unrelated dirty files except where this plan names them.
  - Commit after each task with only the files listed for that task.
