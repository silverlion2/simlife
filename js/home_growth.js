// ============================================================
// SimLife - Home Growth, Unlocks, And Floor Progression
// ============================================================
window.Game = window.Game || {};

Game.HomeGrowth = (function() {
  const MAX_FLOORS = 6;
  const FLOOR_BASE_COST = 2500;
  const LOT_STEP = 8;
  const MAX_LOT_SIZE = 96;
  const LOT_BASE_COST = 1800;
  const MILESTONE_REWARDS = {
    2: ['hammock'],
    3: ['crib'],
    4: ['hot_tub'],
    5: ['grand_piano'],
  };

  const LEVELS = [
    { level: 1, label: 'Starter Home', minValue: 0, maxFloors: 1 },
    { level: 2, label: 'Growing Home', minValue: 1800, maxFloors: 2 },
    { level: 3, label: 'Family Home', minValue: 3500, maxFloors: 3 },
    { level: 4, label: 'Estate', minValue: 8000, maxFloors: 4 },
    { level: 5, label: 'Legacy Estate', minValue: 16000, maxFloors: 6 },
  ];

  const ROOM_UNLOCK_LEVEL = {
    bedroom: 1,
    bathroom: 1,
    living: 1,
    kitchen: 1,
    garden: 1,
    dining: 2,
    study: 2,
    patio: 2,
    nursery: 2,
    gym: 3,
    gameroom: 3,
    library: 3,
    workshop: 3,
    subway: 1,
  };

  function getState(targetState) {
    return targetState || Game.State.get();
  }

  function getHouse(targetState) {
    const state = getState(targetState);
    return state.maps && state.maps.house ? state.maps.house : Game.State.getActiveMap();
  }

  function ensureState(targetState) {
    const state = getState(targetState);
    if (!state.homeGrowth) {
      state.homeGrowth = { level: 1, homeValue: 0, baselineValue: null, milestones: [] };
    }
    ensureInventory(state);
    if (!Array.isArray(state.homeGrowth.milestones)) state.homeGrowth.milestones = [];
    ensureMapGrowth(getHouse(state));
    if (!Number.isFinite(state.homeGrowth.baselineValue)) {
      state.homeGrowth.baselineValue = calculateRawHomeValue(getHouse(state));
    }
    return refresh(state);
  }

  function ensureMapGrowth(map) {
    if (!map) return null;
    if (!Array.isArray(map.floors)) {
      map.floors = [{ level: 0, label: floorLabel(0) }];
    }
    if (!Number.isInteger(map.unlockedFloors) || map.unlockedFloors < 1) {
      map.unlockedFloors = Math.max(1, map.floors.length || 1);
    }
    if (!Number.isInteger(map.activeFloor)) map.activeFloor = 0;
    map.activeFloor = clamp(map.activeFloor, 0, map.unlockedFloors - 1);

    for (let floor = map.floors.length; floor < map.unlockedFloors; floor++) {
      map.floors.push({ level: floor, label: floorLabel(floor) });
    }
    for (const room of map.rooms || []) {
      if (!Number.isInteger(room.floor)) room.floor = 0;
    }
    for (const furniture of map.furniture || []) {
      if (!Number.isInteger(furniture.floor)) furniture.floor = 0;
    }
    const state = Game.State && Game.State.get ? Game.State.get() : null;
    if (state && state.character && !Number.isInteger(state.character.floor)) state.character.floor = map.activeFloor || 0;
    map.nextRoomId = Math.max(map.nextRoomId || 0, nextNumericId(map.rooms || [], 'room_'));
    map.nextFurnId = Math.max(map.nextFurnId || 0, nextNumericId(map.furniture || [], 'furn_'));
    return map;
  }

  function ensureInventory(state) {
    if (!state.inventory) state.inventory = { objects: [], nextObjectId: 1 };
    if (!Array.isArray(state.inventory.objects)) state.inventory.objects = [];
    if (!Number.isInteger(state.inventory.nextObjectId) || state.inventory.nextObjectId < 1) {
      state.inventory.nextObjectId = nextNumericId(state.inventory.objects, 'object_');
    }
    return state.inventory;
  }

  function nextNumericId(items, prefix) {
    let next = 0;
    for (const item of items) {
      const id = String(item.id || '');
      if (!id.startsWith(prefix)) continue;
      const parsed = Number.parseInt(id.slice(prefix.length), 10);
      if (Number.isInteger(parsed)) next = Math.max(next, parsed + 1);
    }
    return next;
  }

  function refresh(targetState) {
    const state = getState(targetState);
    const growth = state.homeGrowth || ensureState(state);
    if (!Number.isFinite(growth.baselineValue)) growth.baselineValue = calculateRawHomeValue(getHouse(state));
    const homeValue = calculateHomeValue(getHouse(state), growth.baselineValue);
    const levelInfo = getLevelForValue(homeValue);
    growth.homeValue = homeValue;
    growth.level = levelInfo.level;
    growth.label = levelInfo.label;
    growth.nextLevelValue = getNextLevelValue(levelInfo.level);
    awardMilestoneRewards(state, growth);
    return growth;
  }

  function calculateRawHomeValue(map) {
    if (!map) return 0;
    ensureMapGrowth(map);
    let value = 0;
    for (const room of map.rooms || []) {
      const roomCfg = Game.Config.ROOMS[room.type];
      if (!roomCfg) continue;
      value += roomCfg.baseCost + Math.max(0, (room.w * room.h) - (roomCfg.minW * roomCfg.minH)) * 100;
    }
    for (const furniture of map.furniture || []) {
      const furnitureCfg = Game.Config.FURNITURE[furniture.type];
      if (furnitureCfg) value += furnitureCfg.cost;
    }
    const startWidth = Game.Config.STARTING_STATE && Game.Config.STARTING_STATE.lotWidth ? Game.Config.STARTING_STATE.lotWidth : map.lotWidth;
    const startHeight = Game.Config.STARTING_STATE && Game.Config.STARTING_STATE.lotHeight ? Game.Config.STARTING_STATE.lotHeight : map.lotHeight;
    const extraLotArea = Math.max(0, (map.lotWidth * map.lotHeight) - (startWidth * startHeight));
    value += extraLotArea * 12;
    value += Math.max(0, (map.unlockedFloors || 1) - 1) * FLOOR_BASE_COST;
    return value;
  }

  function calculateHomeValue(map, baselineValue) {
    const baseline = Number.isFinite(baselineValue)
      ? baselineValue
      : (Game.State.get().homeGrowth && Number.isFinite(Game.State.get().homeGrowth.baselineValue) ? Game.State.get().homeGrowth.baselineValue : 0);
    return Math.max(0, calculateRawHomeValue(map) - baseline);
  }

  function getLevelForValue(value) {
    let current = LEVELS[0];
    for (const level of LEVELS) {
      if (value >= level.minValue) current = level;
    }
    return current;
  }

  function getNextLevelValue(level) {
    const next = LEVELS.find(item => item.level === level + 1);
    return next ? next.minValue : null;
  }

  function getCurrentLevelInfo() {
    const growth = ensureState();
    return LEVELS.find(item => item.level === growth.level) || LEVELS[0];
  }

  function getMaxFloors() {
    return Math.min(MAX_FLOORS, getCurrentLevelInfo().maxFloors);
  }

  function getActiveFloor(map) {
    const activeMap = map || getHouse();
    ensureMapGrowth(activeMap);
    return activeMap.activeFloor || 0;
  }

  function setActiveFloor(floor, map) {
    const activeMap = map || getHouse();
    ensureMapGrowth(activeMap);
    const floorNumber = Number.parseInt(floor, 10);
    if (!Number.isInteger(floorNumber) || floorNumber < 0 || floorNumber >= activeMap.unlockedFloors) return false;
    activeMap.activeFloor = floorNumber;
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    if (Game.Renderer && Game.Renderer.updatePathGrid) Game.Renderer.updatePathGrid();
    return true;
  }

  function getFloorInfo(map) {
    const activeMap = map || getHouse();
    ensureMapGrowth(activeMap);
    const floors = activeMap.floors.slice(0, activeMap.unlockedFloors).map(floor => ({
      level: floor.level,
      label: floor.label || floorLabel(floor.level),
      active: floor.level === activeMap.activeFloor,
    }));
    const add = canAddFloor(activeMap);
    return {
      activeFloor: activeMap.activeFloor,
      unlockedFloors: activeMap.unlockedFloors,
      maxFloors: getMaxFloors(),
      floors,
      canAddFloor: add.allowed,
      addFloorCost: add.cost,
      addFloorReason: add.reason,
    };
  }

  function canAddFloor(map) {
    const activeMap = map || getHouse();
    ensureMapGrowth(activeMap);
    const maxFloors = getMaxFloors();
    const nextFloor = activeMap.unlockedFloors;
    const cost = getFloorCost(nextFloor);
    const isSandbox = Game.State.get().ui && Game.State.get().ui.sandboxMode;
    if (nextFloor >= maxFloors) {
      return { allowed: false, cost, reason: `Reach home level ${nextFloor + 1} to expand higher.` };
    }
    if (!isSandbox && Game.Economy && !Game.Economy.canAfford(cost)) {
      return { allowed: false, cost, reason: `Need $${cost.toLocaleString()} to add a floor.` };
    }
    return { allowed: true, cost, reason: '' };
  }

  function addFloor(map) {
    const activeMap = map || getHouse();
    const check = canAddFloor(activeMap);
    if (!check.allowed) return { success: false, ...check };

    const isSandbox = Game.State.get().ui && Game.State.get().ui.sandboxMode;
    if (!isSandbox && Game.Economy) Game.Economy.spend(check.cost);

    const newFloor = activeMap.unlockedFloors;
    activeMap.unlockedFloors += 1;
    activeMap.floors.push({ level: newFloor, label: floorLabel(newFloor) });
    activeMap.activeFloor = newFloor;
    awardFloorReward(Game.State.get(), newFloor);
    refresh();
    if (Game.UI && Game.UI.showNotification) Game.UI.showNotification(`Added ${floorLabel(newFloor)}.`);
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    if (Game.Renderer && Game.Renderer.updatePathGrid) Game.Renderer.updatePathGrid();
    return { success: true, floor: newFloor, cost: check.cost };
  }

  function travelToFloor(floor, map) {
    const state = Game.State.get();
    const activeMap = map || getHouse(state);
    ensureMapGrowth(activeMap);
    const floorNumber = Number.parseInt(floor, 10);
    if (!Number.isInteger(floorNumber) || floorNumber < 0 || floorNumber >= activeMap.unlockedFloors) {
      return { success: false, reason: 'That floor is not unlocked.' };
    }
    if (!canReachFloor(activeMap, floorNumber)) {
      return { success: false, reason: 'Place a staircase on that floor first.' };
    }

    activeMap.activeFloor = floorNumber;
    state.character.floor = floorNumber;
    state.character.targetPosition = null;
    state.character.path = null;
    const landing = getFloorLanding(activeMap, floorNumber);
    if (landing) {
      state.character.position.x = landing.x;
      state.character.position.y = landing.y;
    }
    if (state.family && Array.isArray(state.family.members)) {
      for (const member of state.family.members) member.floor = floorNumber;
    }
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    if (Game.Renderer && Game.Renderer.updatePathGrid) Game.Renderer.updatePathGrid();
    if (Game.UI && Game.UI.showNotification) Game.UI.showNotification(`Household moved to ${floorLabel(floorNumber)}.`);
    return { success: true, floor: floorNumber };
  }

  function canReachFloor(map, floor) {
    if (floor === 0) return true;
    return (map.furniture || []).some(item => item.type === 'staircase' && (item.floor || 0) === floor);
  }

  function getFloorLanding(map, floor) {
    const staircase = (map.furniture || []).find(item => item.type === 'staircase' && (item.floor || 0) === floor);
    if (staircase) return { x: staircase.x, y: staircase.y };
    const room = (map.rooms || []).find(item => (item.floor || 0) === floor);
    if (room) return { x: room.x + 0.5, y: room.y + 0.5 };
    return null;
  }

  function awardFloorReward(state, floor) {
    ensureInventory(state);
    const growth = state.homeGrowth || ensureState(state);
    if (!Array.isArray(growth.milestones)) growth.milestones = [];
    const milestoneKey = `floor_${floor}_unlock`;
    if (growth.milestones.includes(milestoneKey)) return null;
    growth.milestones.push(milestoneKey);
    return addInventoryObjectToState(state, 'staircase', milestoneKey);
  }

  function getFloorCost(nextFloor) {
    return FLOOR_BASE_COST + Math.max(0, nextFloor - 1) * 2500;
  }

  function getLotInfo(map) {
    const activeMap = map || getHouse();
    ensureMapGrowth(activeMap);
    const expansion = canExpandLot(activeMap);
    return {
      width: activeMap.lotWidth,
      height: activeMap.lotHeight,
      maxSize: getMaxLotSize(),
      canExpand: expansion.allowed,
      expandCost: expansion.cost,
      expandReason: expansion.reason,
      step: LOT_STEP,
    };
  }

  function getMaxLotSize() {
    const state = Game.State.get();
    const growth = state.homeGrowth || { level: 1 };
    const startSize = Math.max(
      Game.Config.STARTING_STATE && Game.Config.STARTING_STATE.lotWidth ? Game.Config.STARTING_STATE.lotWidth : 64,
      Game.Config.STARTING_STATE && Game.Config.STARTING_STATE.lotHeight ? Game.Config.STARTING_STATE.lotHeight : 64
    );
    return Math.min(MAX_LOT_SIZE, startSize + Math.max(0, (growth.level || 1) - 1) * LOT_STEP);
  }

  function canExpandLot(map) {
    const activeMap = map || getHouse();
    ensureMapGrowth(activeMap);
    const currentSize = Math.max(activeMap.lotWidth || 0, activeMap.lotHeight || 0);
    const maxSize = getMaxLotSize();
    const cost = getLotExpansionCost(activeMap);
    const isSandbox = Game.State.get().ui && Game.State.get().ui.sandboxMode;
    if (currentSize >= maxSize) {
      const nextLevel = Math.min(5, (Game.State.get().homeGrowth && Game.State.get().homeGrowth.level ? Game.State.get().homeGrowth.level : 1) + 1);
      return { allowed: false, cost, reason: `Reach home level ${nextLevel} to buy more land.` };
    }
    if (!isSandbox && Game.Economy && !Game.Economy.canAfford(cost)) {
      return { allowed: false, cost, reason: `Need $${cost.toLocaleString()} to expand the lot.` };
    }
    return { allowed: true, cost, reason: '' };
  }

  function getLotExpansionCost(map) {
    const activeMap = map || getHouse();
    const startSize = Math.max(
      Game.Config.STARTING_STATE && Game.Config.STARTING_STATE.lotWidth ? Game.Config.STARTING_STATE.lotWidth : activeMap.lotWidth,
      Game.Config.STARTING_STATE && Game.Config.STARTING_STATE.lotHeight ? Game.Config.STARTING_STATE.lotHeight : activeMap.lotHeight
    );
    const currentSize = Math.max(activeMap.lotWidth || startSize, activeMap.lotHeight || startSize);
    const expansions = Math.max(0, Math.floor((currentSize - startSize) / LOT_STEP));
    return LOT_BASE_COST + expansions * 1200;
  }

  function expandLot(map) {
    const activeMap = map || getHouse();
    const check = canExpandLot(activeMap);
    if (!check.allowed) return { success: false, ...check };

    const isSandbox = Game.State.get().ui && Game.State.get().ui.sandboxMode;
    if (!isSandbox && Game.Economy) Game.Economy.spend(check.cost);

    activeMap.lotWidth += LOT_STEP;
    activeMap.lotHeight += LOT_STEP;
    if (Game.State.get().stats) Game.State.get().stats.lotExpansions = (Game.State.get().stats.lotExpansions || 0) + 1;
    refresh();
    if (Game.UI && Game.UI.showNotification) Game.UI.showNotification(`Expanded lot to ${activeMap.lotWidth}x${activeMap.lotHeight}.`);
    if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
    if (Game.Renderer && Game.Renderer.updatePathGrid) Game.Renderer.updatePathGrid();
    return { success: true, width: activeMap.lotWidth, height: activeMap.lotHeight, cost: check.cost };
  }

  function awardMilestoneRewards(state, growth) {
    ensureInventory(state);
    if (!Array.isArray(growth.milestones)) growth.milestones = [];

    for (const [levelText, rewardTypes] of Object.entries(MILESTONE_REWARDS)) {
      const level = Number.parseInt(levelText, 10);
      if (growth.level < level) continue;
      const milestoneKey = `home_level_${level}`;
      if (growth.milestones.includes(milestoneKey)) continue;

      for (const type of rewardTypes) {
        addInventoryObjectToState(state, type, milestoneKey);
      }
      growth.milestones.push(milestoneKey);
    }
  }

  function addInventoryObjectToState(state, type, source, extra) {
    const inventory = ensureInventory(state);
    const furniture = Game.Config.FURNITURE[type];
    if (!furniture) return null;
    const object = {
      id: `object_${inventory.nextObjectId++}`,
      type,
      source: source || 'found',
      acquiredDay: state.time ? state.time.day : 1,
      ...extra,
    };
    inventory.objects.push(object);
    return object;
  }

  function addInventoryObject(type, source, extra) {
    const state = Game.State.get();
    ensureState(state);
    return addInventoryObjectToState(state, type, source, extra);
  }

  function getInventoryObjects() {
    ensureState();
    return Game.State.get().inventory.objects.slice();
  }

  function consumeInventoryObject(objectId) {
    ensureState();
    const objects = Game.State.get().inventory.objects;
    const index = objects.findIndex(item => item.id === objectId);
    if (index === -1) return null;
    return objects.splice(index, 1)[0];
  }

  function isOnActiveFloor(map, item) {
    if (!item) return false;
    const activeMap = map || getHouse();
    ensureMapGrowth(activeMap);
    return (item.floor || 0) === (activeMap.activeFloor || 0);
  }

  function getRoomUnlockLevel(roomType) {
    return ROOM_UNLOCK_LEVEL[roomType] || 1;
  }

  function getFurnitureUnlockLevel(furnitureType) {
    const furniture = Game.Config.FURNITURE[furnitureType];
    if (!furniture) return 1;
    if (Number.isInteger(furniture.unlockLevel)) return furniture.unlockLevel;
    if (furniture.cost <= 0) return 1;
    const qualityLevel = Math.max(1, furniture.quality || 1);
    const priceLevel = furniture.cost >= 1200 ? 3 : furniture.cost >= 500 ? 2 : 1;
    const roomLevel = furniture.room && furniture.room !== '*' ? getRoomUnlockLevel(furniture.room) : 1;
    return Math.max(qualityLevel, priceLevel, roomLevel);
  }

  function isRoomUnlocked(roomType) {
    if (Game.State.get().ui && Game.State.get().ui.sandboxMode) return true;
    return getRoomUnlockLevel(roomType) <= ensureState().level;
  }

  function isFurnitureUnlocked(furnitureType) {
    if (Game.State.get().ui && Game.State.get().ui.sandboxMode) return true;
    return getFurnitureUnlockLevel(furnitureType) <= ensureState().level;
  }

  function getRoomLockReason(roomType) {
    const required = getRoomUnlockLevel(roomType);
    return required <= ensureState().level ? '' : `Unlocks at home level ${required}`;
  }

  function getFurnitureLockReason(furnitureType) {
    const required = getFurnitureUnlockLevel(furnitureType);
    return required <= ensureState().level ? '' : `Unlocks at home level ${required}`;
  }

  function floorLabel(floor) {
    if (floor === 0) return 'Ground Floor';
    if (floor === 1) return 'Second Floor';
    if (floor === 2) return 'Third Floor';
    return `Floor ${floor + 1}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return {
    LEVELS,
    ROOM_UNLOCK_LEVEL,
    MILESTONE_REWARDS,
    ensureState,
    ensureMapGrowth,
    refresh,
    calculateHomeValue,
    calculateRawHomeValue,
    getCurrentLevelInfo,
    getMaxFloors,
    getActiveFloor,
    setActiveFloor,
    getFloorInfo,
    canAddFloor,
    addFloor,
    travelToFloor,
    getLotInfo,
    canExpandLot,
    expandLot,
    isOnActiveFloor,
    isRoomUnlocked,
    isFurnitureUnlocked,
    getInventoryObjects,
    addInventoryObject,
    consumeInventoryObject,
    getRoomUnlockLevel,
    getFurnitureUnlockLevel,
    getRoomLockReason,
    getFurnitureLockReason,
  };
})();
