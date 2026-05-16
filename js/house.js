// ============================================================
// SimLife — House Building System
// ============================================================
window.Game = window.Game || {};

Game.House = (function() {
  const cfg = Game.Config;
  const FURNISHING_PRESETS = {
    bedroom: [
      { key: 'bedroom_starter', label: 'Starter Bedroom', items: ['basic_bed', 'lamp', 'dresser'] },
    ],
    bathroom: [
      { key: 'bathroom_starter', label: 'Starter Bathroom', items: ['toilet', 'basic_shower', 'sink_b'] },
    ],
    living: [
      { key: 'living_starter', label: 'Starter Living Room', items: ['basic_sofa', 'basic_tv', 'bookshelf'] },
    ],
    dining: [
      { key: 'dining_starter', label: 'Starter Dining Room', items: ['dining_table', 'dining_chairs'] },
    ],
    nursery: [
      { key: 'nursery_starter', label: 'Starter Nursery', items: ['crib', 'changing_table', 'toy_chest'] },
    ],
    workshop: [
      { key: 'workshop_starter', label: 'Starter Workshop', items: ['workbench'] },
    ],
  };

  function getHouse() {
    const house = Game.State.getActiveMap();
    if (Game.HomeGrowth && Game.HomeGrowth.ensureMapGrowth) Game.HomeGrowth.ensureMapGrowth(house);
    return house;
  }

  function getBuildFloor(house) {
    if (Game.HomeGrowth && Game.HomeGrowth.getActiveFloor) return Game.HomeGrowth.getActiveFloor(house);
    return house.activeFloor || 0;
  }

  function isSameFloor(item, floor) {
    return (item.floor || 0) === floor;
  }

  function getFurnitureFootprint(furn) {
    const furnCfg = cfg.FURNITURE[furn.type];
    if (!furnCfg) return null;
    return {
      x: furn.x,
      y: furn.y,
      w: furn.rotated ? furnCfg.h : furnCfg.w,
      h: furn.rotated ? furnCfg.w : furnCfg.h,
    };
  }

  function isAreaFreeOnFloor(house, x, y, w, h, floor, excludeRoomId) {
    if (x < 0 || y < 0 || x + w > house.lotWidth || y + h > house.lotHeight) return false;
    for (const room of house.rooms) {
      if (!isSameFloor(room, floor)) continue;
      if (excludeRoomId && room.id === excludeRoomId) continue;
      if (x < room.x + room.w && x + w > room.x && y < room.y + room.h && y + h > room.y) return false;
    }
    return true;
  }

  function refreshBuildSystems(x, y, w, h, particleColor) {
    if (Game.HomeGrowth && Game.HomeGrowth.refresh) Game.HomeGrowth.refresh();
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    if (Game.Character && Game.Character.invalidateComfortCache) Game.Character.invalidateComfortCache();
    if (Game.Renderer && Game.Renderer.updatePathGrid) Game.Renderer.updatePathGrid();
    if (Game.Renderer && Game.Renderer.spawnParticles && Number.isFinite(x) && Number.isFinite(y)) {
      Game.Renderer.spawnParticles(x + (w || 1) / 2, y + (h || 1) / 2, 22, particleColor || '#FFFF00');
    }
  }

  // Check if a grid area is free (no rooms overlap)
  function isAreaFree(x, y, w, h, excludeRoomId) {
    const house = getHouse();
    const floor = getBuildFloor(house);
    return isAreaFreeOnFloor(house, x, y, w, h, floor, excludeRoomId);
  }

  // Build a room
  function buildRoom(type, x, y, w, h) {
    const house = getHouse();
    const roomCfg = cfg.ROOMS[type];
    if (!roomCfg) return false;
    if (Game.HomeGrowth && !Game.HomeGrowth.isRoomUnlocked(type)) return false;
    if (w < roomCfg.minW || h < roomCfg.minH || w > roomCfg.maxW || h > roomCfg.maxH) return false;
    if (!isAreaFree(x, y, w, h)) return false;

    const isSandbox = Game.State.get().ui.sandboxMode;
    const cost = roomCfg.baseCost + (w * h - roomCfg.minW * roomCfg.minH) * 100;
    
    if (!isSandbox && !Game.Economy.canAfford(cost)) return false;

    if (!isSandbox) Game.Economy.spend(cost);
    const id = 'room_' + house.nextRoomId++;
    house.rooms.push({ id, type, x, y, w, h, floor: getBuildFloor(house) });
    Game.State.get().stats.buildingsBuilt++;
    Game.UI && Game.UI.showNotification(`🏗️ Built ${roomCfg.label}! ${isSandbox ? '(Free)' : `(-$${cost})`}`);
    if (Game.HomeGrowth && Game.HomeGrowth.refresh) Game.HomeGrowth.refresh();
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    if (Game.Renderer && Game.Renderer.spawnParticles) Game.Renderer.spawnParticles(x + w/2, y + h/2, 30, '#FFFF00');
    return true;
  }

  function resizeRoom(roomId, newW, newH) {
    const house = getHouse();
    const room = house.rooms.find(r => r.id === roomId);
    if (!room) return false;
    const roomCfg = cfg.ROOMS[room.type];
    if (!roomCfg) return false;
    const width = Number.parseInt(newW, 10);
    const height = Number.parseInt(newH, 10);
    if (!Number.isInteger(width) || !Number.isInteger(height)) return false;
    if (width < roomCfg.minW || height < roomCfg.minH || width > roomCfg.maxW || height > roomCfg.maxH) return false;
    if (!isAreaFreeOnFloor(house, room.x, room.y, width, height, room.floor || 0, room.id)) return false;

    for (const furn of house.furniture) {
      if (furn.roomId !== room.id) continue;
      if (!isSameFloor(furn, room.floor || 0)) continue;
      const footprint = getFurnitureFootprint(furn);
      if (!footprint) continue;
      if (footprint.x < room.x || footprint.y < room.y || footprint.x + footprint.w > room.x + width || footprint.y + footprint.h > room.y + height) {
        return false;
      }
    }

    const oldArea = room.w * room.h;
    const newArea = width * height;
    const addedArea = Math.max(0, newArea - oldArea);
    const removedArea = Math.max(0, oldArea - newArea);
    const isSandbox = Game.State.get().ui.sandboxMode;
    const cost = addedArea * 100;
    if (!isSandbox && cost > 0 && !Game.Economy.canAfford(cost)) return false;

    if (!isSandbox && cost > 0) Game.Economy.spend(cost);
    if (!isSandbox && removedArea > 0 && Game.Economy) Game.Economy.addMoney(Math.floor(removedArea * 25));

    room.w = width;
    room.h = height;
    Game.State.get().stats.roomsRenovated = (Game.State.get().stats.roomsRenovated || 0) + 1;
    Game.UI && Game.UI.showNotification(`Renovated ${roomCfg.label}.`);
    refreshBuildSystems(room.x, room.y, room.w, room.h, '#FFD700');
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
    if (Game.HomeGrowth && Game.HomeGrowth.refresh) Game.HomeGrowth.refresh();
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

    // CRITICAL FIX: Also remove from broken furniture list if it was broken
    if (Game.Character && Game.Character.repairFurniture) {
       Game.Character.repairFurniture(furnId);
    }
    
    if (furnCfg) {
       const refund = Math.floor(furnCfg.cost * refundPercent);
       Game.Economy.addMoney(refund);
       Game.UI && Game.UI.showNotification(`🪑 Sold ${furnCfg.label}. Refund: $${refund}`);
    }
    if (Game.HomeGrowth && Game.HomeGrowth.refresh) Game.HomeGrowth.refresh();
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    // Invalidate caches after furniture change
    if (Game.Character && Game.Character.invalidateComfortCache) Game.Character.invalidateComfortCache();
    if (Game.Renderer && Game.Renderer.updatePathGrid) Game.Renderer.updatePathGrid();
    return furn;
  }

  // Place furniture
  function placeFurniture(furnitureType, roomId, gridX, gridY, rotated = false, options = {}) {
    const house = getHouse();
    const furnCfg = cfg.FURNITURE[furnitureType];
    if (!furnCfg) return false;
    if (Game.HomeGrowth && !Game.HomeGrowth.isFurnitureUnlocked(furnitureType)) return false;
    const freePlacement = !!(options && options.free);

    // Check room exists
    const room = house.rooms.find(r => r.id === roomId);
    if (!room) return false;
    const floor = room.floor || 0;

    // Check furniture fits the room type
    if (furnCfg.room !== '*' && furnCfg.room !== room.type) return false;

    const w = rotated ? furnCfg.h : furnCfg.w;
    const h = rotated ? furnCfg.w : furnCfg.h;

    // Check position is within room
    if (gridX < room.x || gridY < room.y || gridX + w > room.x + room.w || gridY + h > room.y + room.h) return false;

    // Check no overlap with existing furniture
    for (const furn of house.furniture) {
      if (furn.roomId !== roomId) continue;
      if (!isSameFloor(furn, floor)) continue;
      const fc = cfg.FURNITURE[furn.type];
      if (!fc) continue;
      const fw = furn.rotated ? fc.h : fc.w;
      const fh = furn.rotated ? fc.w : fc.h;
      if (gridX < furn.x + fw && gridX + w > furn.x && gridY < furn.y + fh && gridY + h > furn.y) return false;
    }

    const isSandbox = Game.State.get().ui.sandboxMode;
    if (!isSandbox && !freePlacement && !Game.Economy.canAfford(furnCfg.cost)) return false;

    if (!isSandbox && !freePlacement) Game.Economy.spend(furnCfg.cost);
    const id = 'furn_' + house.nextFurnId++;
    house.furniture.push({ id, type: furnitureType, roomId, x: gridX, y: gridY, rotated, floor, sourceObjectId: options.sourceObjectId || null });
    if (Game.HomeGrowth && Game.HomeGrowth.refresh) Game.HomeGrowth.refresh();
    Game.State.get().stats.furnitureBought++;
    Game.UI && Game.UI.showNotification(`🛒 Bought ${furnCfg.label}! ${isSandbox ? '(Free)' : `(-$${furnCfg.cost})`}`);
    if (Game.Renderer && Game.Renderer.spawnParticles) {
        Game.Renderer.spawnParticles(gridX + w/2, gridY + h/2, 20, '#00FFFF');
    }
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    // Invalidate caches after furniture change
    if (Game.Character && Game.Character.invalidateComfortCache) Game.Character.invalidateComfortCache();
    if (Game.Renderer && Game.Renderer.updatePathGrid) Game.Renderer.updatePathGrid();
    return true;
  }

  function placeStoredFurniture(objectId, roomId, gridX, gridY, rotated = false) {
    if (!Game.HomeGrowth || !Game.HomeGrowth.getInventoryObjects || !Game.HomeGrowth.consumeInventoryObject) return false;
    const object = Game.HomeGrowth.getInventoryObjects().find(item => item.id === objectId);
    if (!object || !object.type) return false;

    const placed = placeFurniture(object.type, roomId, gridX, gridY, rotated, {
      free: true,
      sourceObjectId: object.id,
    });
    if (!placed) return false;
    Game.HomeGrowth.consumeInventoryObject(object.id);
    return true;
  }

  function storeFurniture(furnId) {
    const house = getHouse();
    const idx = house.furniture.findIndex(f => f.id === furnId);
    if (idx === -1) return null;
    if (!Game.HomeGrowth || !Game.HomeGrowth.addInventoryObject) return null;

    const furn = house.furniture[idx];
    const furnCfg = cfg.FURNITURE[furn.type];
    if (!furnCfg) return null;
    house.furniture.splice(idx, 1);

    if (Game.Character && Game.Character.repairFurniture) Game.Character.repairFurniture(furnId);
    const object = Game.HomeGrowth.addInventoryObject(furn.type, 'stored_from_house', {
      previousFurnitureId: furn.id,
      roomId: furn.roomId,
    });
    Game.State.get().stats.objectsStored = (Game.State.get().stats.objectsStored || 0) + 1;
    Game.UI && Game.UI.showNotification(`${furnCfg.label} moved to storage.`);
    refreshBuildSystems(furn.x, furn.y, 1, 1, '#66BB6A');
    return { success: true, furniture: furn, object };
  }

  // [REMOVED] Duplicate sellFurniture — see L68 for the canonical version with refundPercent param

  function getFurnishingOptions(roomId) {
    const house = getHouse();
    const room = house.rooms.find(r => r.id === roomId);
    if (!room) return [];
    return (FURNISHING_PRESETS[room.type] || []).map(preset => {
      const plan = planFurnishing(room, preset);
      const isSandbox = Game.State.get().ui.sandboxMode;
      const affordable = isSandbox || Game.Economy.canAfford(plan.cost || 0);
      const available = plan.success && plan.placements.length > 0 && affordable;
      return {
        key: preset.key,
        label: preset.label,
        roomId,
        items: preset.items.map(type => cfg.FURNITURE[type]?.label || type),
        cost: plan.cost || 0,
        missingCount: plan.placements ? plan.placements.length : 0,
        available,
        reason: available ? '' : (plan.reason || (affordable ? 'Room already has this set.' : `Need $${(plan.cost || 0).toLocaleString()}.`)),
      };
    });
  }

  function applyFurnishingPreset(roomId, presetKey) {
    const house = getHouse();
    const room = house.rooms.find(r => r.id === roomId);
    if (!room) return { success: false, reason: 'Room not found.' };
    const preset = (FURNISHING_PRESETS[room.type] || []).find(item => item.key === presetKey);
    if (!preset) return { success: false, reason: 'Furnishing preset not found.' };

    const plan = planFurnishing(room, preset);
    if (!plan.success) return { success: false, reason: plan.reason };
    if (!plan.placements.length) return { success: false, reason: 'Room already has this set.' };

    const isSandbox = Game.State.get().ui.sandboxMode;
    if (!isSandbox && !Game.Economy.canAfford(plan.cost)) {
      return { success: false, reason: `Need $${plan.cost.toLocaleString()}.` };
    }

    const placed = [];
    for (const item of plan.placements) {
      const ok = placeFurniture(item.type, room.id, item.x, item.y, false);
      if (!ok) return { success: false, reason: `Could not place ${cfg.FURNITURE[item.type]?.label || item.type}.`, placed };
      placed.push(item.type);
    }

    Game.State.get().stats.roomsFurnished = (Game.State.get().stats.roomsFurnished || 0) + 1;
    Game.UI && Game.UI.showNotification(`${preset.label} added.`);
    refreshBuildSystems(room.x, room.y, room.w, room.h, '#81C784');
    return { success: true, roomId, preset: preset.key, placed, cost: plan.cost };
  }

  function planFurnishing(room, preset) {
    const existing = getRoomFurniture(room.id);
    const drafts = existing.map(getFurnitureFootprint).filter(Boolean);
    const placements = [];
    let cost = 0;

    for (const type of preset.items) {
      if (existing.some(item => item.type === type)) continue;
      const furnCfg = cfg.FURNITURE[type];
      if (!furnCfg) return { success: false, reason: `${type} is not configured.`, placements, cost };
      if (furnCfg.room !== '*' && furnCfg.room !== room.type) {
        return { success: false, reason: `${furnCfg.label} does not belong in this room.`, placements, cost };
      }
      if (Game.HomeGrowth && !Game.HomeGrowth.isFurnitureUnlocked(type)) {
        const reason = Game.HomeGrowth.getFurnitureLockReason ? Game.HomeGrowth.getFurnitureLockReason(type) : 'Furniture is locked.';
        return { success: false, reason, placements, cost };
      }
      const spot = findPresetSpot(room, type, drafts);
      if (!spot) return { success: false, reason: `No space for ${furnCfg.label}.`, placements, cost };
      drafts.push({ x: spot.x, y: spot.y, w: furnCfg.w, h: furnCfg.h });
      placements.push({ type, x: spot.x, y: spot.y });
      cost += furnCfg.cost || 0;
    }
    return { success: true, placements, cost };
  }

  function findPresetSpot(room, type, drafts) {
    const furnCfg = cfg.FURNITURE[type];
    if (!furnCfg) return null;
    for (let y = room.y; y <= room.y + room.h - furnCfg.h; y++) {
      for (let x = room.x; x <= room.x + room.w - furnCfg.w; x++) {
        const footprint = { x, y, w: furnCfg.w, h: furnCfg.h };
        if (!drafts.some(item => overlaps(footprint, item))) return { x, y };
      }
    }
    return null;
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Get room at position
  function getRoomAt(x, y) {
    const house = getHouse();
    const floor = getBuildFloor(house);
    return house.rooms.find(r => isSameFloor(r, floor) && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  }

  // Get furniture at position
  function getFurnitureAt(gridX, gridY) {
    const house = getHouse();
    const floor = getBuildFloor(house);
    for (const furn of house.furniture) {
      if (!isSameFloor(furn, floor)) continue;
      const fc = cfg.FURNITURE[furn.type];
      if (!fc) continue;
      const fw = furn.rotated ? fc.h : fc.w;
      const fh = furn.rotated ? fc.w : fc.h;
      if (gridX >= furn.x && gridX < furn.x + fw && gridY >= furn.y && gridY < furn.y + fh) return furn;
    }
    return null;
  }

  // Get furniture list for a room
  function getRoomFurniture(roomId) {
    const house = getHouse();
    const room = house.rooms.find(r => r.id === roomId);
    const floor = room ? (room.floor || 0) : getBuildFloor(house);
    return house.furniture.filter(f => f.roomId === roomId && isSameFloor(f, floor));
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
    const isSandbox = Game.State.get().ui.sandboxMode;
    return Object.entries(cfg.FURNITURE)
      .filter(([key, f]) => f.room === roomType || f.room === '*')
      .map(([key, f]) => {
        const locked = !!(Game.HomeGrowth && !Game.HomeGrowth.isFurnitureUnlocked(key));
        return {
          key,
          ...f,
          locked,
          lockReason: locked && Game.HomeGrowth.getFurnitureLockReason ? Game.HomeGrowth.getFurnitureLockReason(key) : '',
          affordable: !locked && (isSandbox || Game.Economy.canAfford(f.cost)),
        };
      });
  }

  return {
    isAreaFree,
    buildRoom,
    resizeRoom,
    removeRoom,
    placeFurniture,
    placeStoredFurniture,
    storeFurniture,
    getFurnishingOptions,
    applyFurnishingPreset,
    sellFurniture,
    getRoomAt,
    getFurnitureAt,
    getRoomFurniture,
    roomHasFurniture,
    getAvailableFurniture,
    getHouse,
  };
})();
