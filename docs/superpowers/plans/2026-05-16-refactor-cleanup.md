# Refactor Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce codebase dirt by extracting low-risk renderer helpers while preserving runtime behavior.

**Architecture:** Keep the current global browser-script architecture. Add small `Game.RendererMath` and `Game.RendererHelpers` namespaces that are loaded before `js/renderer.js`, then move projection, footprint, hit-test, and path-grid calculations into those helpers. Update verification so the new files are syntax checked and exercised before touching renderer behavior.

**Tech Stack:** Browser JavaScript with global `window.Game`, Phaser 4, Electron, Node-based verification in `scripts/verify-game.js`.

---

## File Structure

- Create `js/renderer_math.js`: tile constants and pure isometric projection/unprojection helpers.
- Create `js/renderer_helpers.js`: pure footprint, hit-test, and path-grid helpers that depend on config/map data passed as arguments.
- Modify `index.html`: load new helper scripts before `js/renderer.js`.
- Modify `js/renderer.js`: delegate math, hit testing, and path-grid construction to helpers while keeping `Game.Renderer` public API stable.
- Modify `scripts/verify-game.js`: add helper unit checks before the Electron smoke test.

## Task 1: Add Renderer Math Helper

**Files:**
- Create: `js/renderer_math.js`
- Modify: `index.html`
- Modify: `scripts/verify-game.js`

- [ ] **Step 1: Write the failing helper test**

Add this function to `scripts/verify-game.js` after `loadBrowserGlobals`:

```js
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
```

Call it near the start of the main async function:

```js
(async () => {
  checkSyntax();
  checkRendererMathHelpers();
  const resources = checkResources();
  const runtime = await checkElectronRuntime();
  console.log(JSON.stringify({ ok: true, resources, runtime }, null, 2));
})().catch(err => {
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node scripts/verify-game.js`

Expected: FAIL with `ENOENT` or `Expected Game.RendererMath to be defined` because `js/renderer_math.js` does not exist yet.

- [ ] **Step 3: Implement the helper**

Create `js/renderer_math.js`:

```js
// ============================================================
// SimLife - Renderer Math Helpers
// ============================================================
window.Game = window.Game || {};

Game.RendererMath = (function() {
  const TILE_W = 64;
  const TILE_H = 32;
  let offsetX = window.innerWidth / 2;
  let offsetY = 200;

  function setOffset(x, y) {
    offsetX = x;
    offsetY = y;
  }

  function getOffset() {
    return { x: offsetX, y: offsetY };
  }

  function isoProject(gx, gy, gz = 0) {
    return {
      x: (gx - gy) * (TILE_W / 2) + offsetX,
      y: (gx + gy) * (TILE_H / 2) + offsetY - (gz * TILE_H),
    };
  }

  function isoUnproject(sx, sy, gz = 0) {
    const dx = sx - offsetX;
    const dy = sy - offsetY + (gz * TILE_H);
    return {
      x: (dy / (TILE_H / 2) + dx / (TILE_W / 2)) / 2,
      y: (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2,
    };
  }

  return {
    TILE_W,
    TILE_H,
    getOffset,
    setOffset,
    isoProject,
    isoUnproject,
  };
})();
```

Add this script before `js/renderer.js` in `index.html`:

```html
<script src="js/assets.js?v=1"></script>
<script src="js/renderer_math.js?v=1"></script>
<script src="js/renderer.js?v=5"></script>
```

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `node scripts/verify-game.js`

Expected: The new math helper check passes. Any later failure should be unrelated to `Game.RendererMath`.

## Task 2: Add Renderer Data Helpers

**Files:**
- Create: `js/renderer_helpers.js`
- Modify: `index.html`
- Modify: `scripts/verify-game.js`

- [ ] **Step 1: Write the failing helper test**

Add this function to `scripts/verify-game.js` after `checkRendererMathHelpers`:

```js
function checkRendererDataHelpers() {
  const context = loadBrowserGlobals(['js/renderer_helpers.js']);
  const helpers = context.Game.RendererHelpers;

  if (!helpers) fail('Expected Game.RendererHelpers to be defined');

  const furnitureConfig = {
    sofa: { w: 2, h: 1 },
    table: { w: 1, h: 2, blocksPath: false },
  };
  const map = {
    lotWidth: 5,
    lotHeight: 4,
    rooms: [{ id: 'room_0', x: 1, y: 1, w: 2, h: 2 }],
    furniture: [
      { id: 'f1', type: 'sofa', x: 2, y: 1 },
      { id: 'f2', type: 'table', x: 0, y: 0 },
    ],
  };

  const footprint = helpers.getFurnitureFootprint(map.furniture[0], furnitureConfig.sofa);
  if (footprint.w !== 2 || footprint.h !== 1) {
    fail(`Unexpected furniture footprint: ${JSON.stringify(footprint)}`);
  }

  const hit = helpers.hitTestFurniture(map, furnitureConfig, 3, 1);
  if (!hit || hit.id !== 'f1') fail(`Expected hit f1, found ${JSON.stringify(hit)}`);

  const room = helpers.hitTestRoom(map, 2, 2);
  if (!room || room.id !== 'room_0') fail(`Expected room_0, found ${JSON.stringify(room)}`);

  const grid = helpers.buildPathGrid(map, furnitureConfig);
  if (grid.length !== 4 || grid[0].length !== 5) fail('Unexpected path grid dimensions');
  if (grid[1][2] !== 1 || grid[1][3] !== 1) fail(`Expected sofa footprint to block path: ${JSON.stringify(grid[1])}`);
  if (grid[0][0] !== 0) fail('Expected blocksPath:false furniture not to block path');
}
```

Call it after the math helper check:

```js
checkRendererMathHelpers();
checkRendererDataHelpers();
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node scripts/verify-game.js`

Expected: FAIL with `ENOENT` or `Expected Game.RendererHelpers to be defined` because `js/renderer_helpers.js` does not exist yet.

- [ ] **Step 3: Implement the helper**

Create `js/renderer_helpers.js`:

```js
// ============================================================
// SimLife - Renderer Data Helpers
// ============================================================
window.Game = window.Game || {};

Game.RendererHelpers = (function() {
  function getFurnitureFootprint(furniture, config) {
    const baseW = config ? config.w : 1;
    const baseH = config ? config.h : 1;
    return {
      x: Math.floor(furniture.x),
      y: Math.floor(furniture.y),
      w: furniture.rotated ? baseH : baseW,
      h: furniture.rotated ? baseW : baseH,
    };
  }

  function hitTestFurniture(activeMap, furnitureConfig, gx, gy) {
    if (!activeMap || !Array.isArray(activeMap.furniture)) return null;

    for (let i = activeMap.furniture.length - 1; i >= 0; i--) {
      const furniture = activeMap.furniture[i];
      const footprint = getFurnitureFootprint(furniture, furnitureConfig[furniture.type]);
      if (
        gx >= footprint.x &&
        gx < footprint.x + footprint.w &&
        gy >= footprint.y &&
        gy < footprint.y + footprint.h
      ) {
        return furniture;
      }
    }

    return null;
  }

  function hitTestRoom(activeMap, gx, gy) {
    if (!activeMap || !Array.isArray(activeMap.rooms)) return null;

    return activeMap.rooms.find(room =>
      gx >= room.x &&
      gx < room.x + room.w &&
      gy >= room.y &&
      gy < room.y + room.h
    ) || null;
  }

  function buildPathGrid(activeMap, furnitureConfig) {
    const width = activeMap.lotWidth || 10;
    const height = activeMap.lotHeight || 10;
    const grid = [];

    for (let y = 0; y < height; y++) {
      grid[y] = [];
      for (let x = 0; x < width; x++) {
        grid[y][x] = 0;
      }
    }

    for (const furniture of activeMap.furniture || []) {
      const config = furnitureConfig[furniture.type];
      if (config && config.blocksPath === false) continue;

      const footprint = getFurnitureFootprint(furniture, config);
      for (let fy = 0; fy < footprint.h; fy++) {
        for (let fx = 0; fx < footprint.w; fx++) {
          const px = footprint.x + fx;
          const py = footprint.y + fy;
          if (px >= 0 && py >= 0 && px < width && py < height) {
            grid[py][px] = 1;
          }
        }
      }
    }

    return grid;
  }

  return {
    getFurnitureFootprint,
    hitTestFurniture,
    hitTestRoom,
    buildPathGrid,
  };
})();
```

Add this script before `js/renderer.js` in `index.html`:

```html
<script src="js/assets.js?v=1"></script>
<script src="js/renderer_math.js?v=1"></script>
<script src="js/renderer_helpers.js?v=1"></script>
<script src="js/renderer.js?v=5"></script>
```

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `node scripts/verify-game.js`

Expected: The new helper checks pass. Any later failure should be unrelated to `Game.RendererHelpers`.

## Task 3: Wire Renderer to Helpers

**Files:**
- Modify: `js/renderer.js`
- Modify: `scripts/verify-game.js`

- [ ] **Step 1: Write the failing integration check**

Extend `checkRendererDataHelpers` with this rotated furniture assertion:

```js
  const rotated = helpers.getFurnitureFootprint({ type: 'sofa', x: 1, y: 2, rotated: true }, furnitureConfig.sofa);
  if (rotated.w !== 1 || rotated.h !== 2) {
    fail(`Expected rotated footprint 1x2, found ${JSON.stringify(rotated)}`);
  }
```

This should already pass after Task 2. The real integration protection comes from running the existing Electron smoke test after wiring `renderer.js`.

- [ ] **Step 2: Run checks before wiring**

Run: `node scripts/verify-game.js`

Expected: PASS before production refactor, establishing a green baseline.

- [ ] **Step 3: Replace local math wrappers**

In `js/renderer.js`, replace `TILE_W`, `TILE_H`, `_isoOffsetX`, `_isoOffsetY`, `isoProject`, and `isoUnproject` internals with delegations:

```js
  const RendererMath = Game.RendererMath;
  const RendererHelpers = Game.RendererHelpers;
  if (!RendererMath || !RendererHelpers) {
    throw new Error('Game.Renderer requires Game.RendererMath and Game.RendererHelpers to be loaded first');
  }

  const TILE_W = RendererMath.TILE_W;
  const TILE_H = RendererMath.TILE_H;
```

```js
  function isoProject(gx, gy, gz = 0) {
    return RendererMath.isoProject(gx, gy, gz);
  }

  function isoUnproject(sx, sy, gz = 0) {
    return RendererMath.isoUnproject(sx, sy, gz);
  }
```

Keep local wrapper names so existing renderer methods do not need broad edits.

- [ ] **Step 4: Replace local hit-test and grid logic**

In `js/renderer.js`, rewrite these functions to delegate:

```js
  function hitTestFurniture(gx, gy) {
    return RendererHelpers.hitTestFurniture(
      Game.State.getActiveMap(),
      Game.Config.FURNITURE,
      gx,
      gy
    );
  }

  function hitTestRoom(gx, gy) {
    return RendererHelpers.hitTestRoom(Game.State.getActiveMap(), gx, gy);
  }
```

In `updatePathGrid`, replace the hand-built grid loops with:

```js
    currentGrid = RendererHelpers.buildPathGrid(activeMap, Game.Config.FURNITURE);
```

Keep the existing EasyStar configuration and callback behavior unchanged.

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: PASS with JSON output containing `"ok": true`.

## Task 4: Final Cleanup Pass

**Files:**
- Modify: `js/renderer.js`
- Modify: `scripts/verify-game.js`
- Modify: `index.html`

- [ ] **Step 1: Remove stale duplicated code**

Remove now-unused local hit-test loops, local projection state, and old comments that only describe migrated image loading when they obscure current behavior. Do not remove active Phaser preload behavior.

- [ ] **Step 2: Run syntax verification**

Run: `node --check js/renderer.js`

Expected: no output and exit code 0.

- [ ] **Step 3: Run full verification**

Run: `npm test`

Expected: PASS with JSON output containing `"ok": true`.

- [ ] **Step 4: Review diff scope**

Run: `git diff --stat`

Expected: source changes are limited to the new helper files, `index.html`, `js/renderer.js`, `scripts/verify-game.js`, and the plan file, with no generated asset churn.
