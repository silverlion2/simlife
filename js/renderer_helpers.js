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
        return { ...furniture, config: furnitureConfig[furniture.type] };
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
      if (!blocksPath(furniture, config)) continue;

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

  function blocksPath(furniture, config) {
    if (config && config.blocksPath === false) return false;

    const type = furniture.type || '';
    return !(
      type.includes('rug') ||
      type.includes('portal') ||
      type.includes('door') ||
      type.includes('mat')
    );
  }

  return {
    getFurnitureFootprint,
    hitTestFurniture,
    hitTestRoom,
    buildPathGrid,
    blocksPath,
  };
})();
