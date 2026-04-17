// ============================================================
// SimLife — House Building System
// ============================================================
window.Game = window.Game || {};

Game.House = (function() {
  const cfg = Game.Config;

  function getHouse() { return Game.State.getActiveMap(); }

  // Check if a grid area is free (no rooms overlap)
  function isAreaFree(x, y, w, h, excludeRoomId) {
    const house = getHouse();
    if (x < 0 || y < 0 || x + w > house.lotWidth || y + h > house.lotHeight) return false;
    for (const room of house.rooms) {
      if (excludeRoomId && room.id === excludeRoomId) continue;
      if (x < room.x + room.w && x + w > room.x && y < room.y + room.h && y + h > room.y) return false;
    }
    return true;
  }

  // Build a room
  function buildRoom(type, x, y, w, h) {
    const house = getHouse();
    const roomCfg = cfg.ROOMS[type];
    if (!roomCfg) return false;
    if (w < roomCfg.minW || h < roomCfg.minH || w > roomCfg.maxW || h > roomCfg.maxH) return false;
    if (!isAreaFree(x, y, w, h)) return false;

    const cost = roomCfg.baseCost + (w * h - roomCfg.minW * roomCfg.minH) * 100;
    if (!Game.Economy.canAfford(cost)) return false;

    Game.Economy.spend(cost);
    const id = 'room_' + house.nextRoomId++;
    house.rooms.push({ id, type, x, y, w, h });
    Game.State.get().stats.buildingsBuilt++;
    Game.UI && Game.UI.showNotification(`🏗️ Built ${roomCfg.label}! (-$${cost})`);
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    if (Game.Renderer && Game.Renderer.spawnParticles) Game.Renderer.spawnParticles(x + w/2, y + h/2, 30, '#FFFF00');
    return true;
  }

  // Remove a room (and its furniture)
  function removeRoom(roomId) {
    const house = getHouse();
    const idx = house.rooms.findIndex(r => r.id === roomId);
    if (idx === -1) return false;

    // Remove furniture in this room
    house.furniture = house.furniture.filter(f => f.roomId !== roomId);
    // Refund 50% of room cost
    const room = house.rooms[idx];
    const roomCfg = cfg.ROOMS[room.type];
    if (roomCfg) {
      const refund = Math.floor(roomCfg.baseCost * 0.5);
      Game.Economy.addMoney(refund);
      Game.UI && Game.UI.showNotification(`🗑️ Demolished ${roomCfg.label}. Refund: $${refund}`);
    }
    if (Game.Renderer && Game.Renderer.spawnParticles) {
      Game.Renderer.spawnParticles(room.x + room.w/2, room.y + room.h/2, 25, '#FF3300');
    }
    house.rooms.splice(idx, 1);
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    return true;
  }

  // Sell furniture
  function sellFurniture(furnId, refundPercent = 1.0) {
    const house = getHouse();
    const idx = house.furniture.findIndex(f => f.id === furnId);
    if (idx === -1) return null;
    const furn = house.furniture[idx];
    const furnCfg = cfg.FURNITURE[furn.type];
    
    house.furniture.splice(idx, 1);
    
    if (furnCfg) {
       const refund = Math.floor(furnCfg.cost * refundPercent);
       Game.Economy.addMoney(refund);
       Game.UI && Game.UI.showNotification(`🪑 Sold ${furnCfg.label}. Refund: $${refund}`);
    }
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    // Invalidate caches after furniture change
    if (Game.Character && Game.Character.invalidateComfortCache) Game.Character.invalidateComfortCache();
    if (Game.Renderer && Game.Renderer.updatePathGrid) Game.Renderer.updatePathGrid();
    return furn;
  }

  // Place furniture
  function placeFurniture(furnitureType, roomId, gridX, gridY, rotated = false) {
    const house = getHouse();
    const furnCfg = cfg.FURNITURE[furnitureType];
    if (!furnCfg) return false;

    // Check room exists
    const room = house.rooms.find(r => r.id === roomId);
    if (!room) return false;

    // Check furniture fits the room type
    if (furnCfg.room !== '*' && furnCfg.room !== room.type) return false;

    const w = rotated ? furnCfg.h : furnCfg.w;
    const h = rotated ? furnCfg.w : furnCfg.h;

    // Check position is within room
    if (gridX < room.x || gridY < room.y || gridX + w > room.x + room.w || gridY + h > room.y + room.h) return false;

    // Check no overlap with existing furniture
    for (const furn of house.furniture) {
      if (furn.roomId !== roomId) continue;
      const fc = cfg.FURNITURE[furn.type];
      if (!fc) continue;
      const fw = furn.rotated ? fc.h : fc.w;
      const fh = furn.rotated ? fc.w : fc.h;
      if (gridX < furn.x + fw && gridX + w > furn.x && gridY < furn.y + fh && gridY + h > furn.y) return false;
    }

    if (!Game.Economy.canAfford(furnCfg.cost)) return false;

    Game.Economy.spend(furnCfg.cost);
    const id = 'furn_' + house.nextFurnId++;
    house.furniture.push({ id, type: furnitureType, roomId, x: gridX, y: gridY, rotated });
    Game.State.get().stats.furnitureBought++;
    Game.UI && Game.UI.showNotification(`🛒 Bought ${furnCfg.label}! (-$${furnCfg.cost})`);
    if (Game.Renderer && Game.Renderer.spawnParticles) {
        Game.Renderer.spawnParticles(gridX + w/2, gridY + h/2, 20, '#00FFFF');
    }
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    // Invalidate caches after furniture change
    if (Game.Character && Game.Character.invalidateComfortCache) Game.Character.invalidateComfortCache();
    if (Game.Renderer && Game.Renderer.updatePathGrid) Game.Renderer.updatePathGrid();
    return true;
  }

  // [REMOVED] Duplicate sellFurniture — see L68 for the canonical version with refundPercent param

  // Get room at position
  function getRoomAt(x, y) {
    return getHouse().rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  }

  // Get furniture at position
  function getFurnitureAt(gridX, gridY) {
    const house = getHouse();
    for (const furn of house.furniture) {
      const fc = cfg.FURNITURE[furn.type];
      if (!fc) continue;
      if (gridX >= furn.x && gridX < furn.x + fc.w && gridY >= furn.y && gridY < furn.y + fc.h) return furn;
    }
    return null;
  }

  // Get furniture list for a room
  function getRoomFurniture(roomId) {
    return getHouse().furniture.filter(f => f.roomId === roomId);
  }

  // Check if room has specific furniture type
  function roomHasFurniture(roomType, furnitureKeyword) {
    const house = getHouse();
    const room = house.rooms.find(r => r.type === roomType);
    if (!room) return false;
    return house.furniture.some(f => f.roomId === room.id && f.type.includes(furnitureKeyword));
  }

  // Available furniture for a room type
  function getAvailableFurniture(roomType) {
    return Object.entries(cfg.FURNITURE)
      .filter(([key, f]) => f.room === roomType || f.room === '*')
      .map(([key, f]) => ({ key, ...f, affordable: Game.Economy.canAfford(f.cost) }));
  }

  return {
    isAreaFree,
    buildRoom,
    removeRoom,
    placeFurniture,
    sellFurniture,
    getRoomAt,
    getFurnitureAt,
    getRoomFurniture,
    roomHasFurniture,
    getAvailableFurniture,
    getHouse,
  };
})();
