// ============================================================
// SimLife — Game State Management
// ============================================================
window.Game = window.Game || {};

Game.State = (function() {
  const SAVE_INDEX_KEY = 'simlife_saves_index';
  let activeSlotId = null;

  function createNewState() {
    const cfg = Game.Config;
    const lotW = cfg.STARTING_STATE.lotWidth;
    const lotH = cfg.STARTING_STATE.lotHeight;

    return {
      version: 1,
      character: {
        name: 'Player',
        needs: { hunger: 80, energy: 100, hygiene: 90, fun: 70, social: 60, comfort: 70, bladder: 100 },
        skills: { cooking: 0, fitness: 0, charisma: 0, tech: 0, creativity: 0, logic: 0, gardening: 0, handiness: 0, language: 0 },
        skillXp: { cooking: 0, fitness: 0, charisma: 0, tech: 0, creativity: 0, logic: 0, gardening: 0, handiness: 0, language: 0 },
        career: null,
        lifeStage: 'young_adult',
        trait: Object.keys(cfg.TRAITS || {})[Math.floor(Math.random() * Object.keys(cfg.TRAITS || {}).length)] || 'neat',
        color: 0x88CCFF, // Default corn tint
        currentActivity: null,
        activityProgress: 0,
        actionQueue: [],
        moodlets: [],
        achievements: [],
        collection: [],
        position: { x: 3, y: 3 },
        targetPosition: null,
        spouse: null,
        autonomy: { thought: null, lastAutoTime: 0, enabled: true },
        mapId: 'house',
      },
      maps: {
        house: {
          lotWidth: lotW,
          lotHeight: lotH,
          rooms: [
            { id: 'room_0', type: 'bedroom', x: 2, y: 2, w: 3, h: 3 },
            { id: 'room_1', type: 'bathroom', x: 5, y: 2, w: 2, h: 3 },
            { id: 'room_2', type: 'living', x: 2, y: 5, w: 5, h: 4 }
          ],
          furniture: [
            // Bedroom
            { id: 'furn_0', type: 'basic_bed', roomId: 'room_0', x: 2, y: 2 },
            { id: 'furn_1', type: 'lamp', roomId: 'room_0', x: 4, y: 2 },
            { id: 'furn_2', type: 'wardrobe', roomId: 'room_0', x: 3, y: 4 },
            
            // Bathroom
            { id: 'furn_3', type: 'toilet', roomId: 'room_1', x: 5, y: 2 },
            { id: 'furn_4', type: 'basic_shower', roomId: 'room_1', x: 6, y: 2 },
            { id: 'furn_5', type: 'sink_b', roomId: 'room_1', x: 5, y: 4 },

            // Kitchen / Living
            { id: 'furn_6', type: 'fridge', roomId: 'room_2', x: 2, y: 5 },
            { id: 'furn_7', type: 'basic_stove', roomId: 'room_2', x: 3, y: 5 },
            { id: 'furn_8', type: 'counter', roomId: 'room_2', x: 4, y: 5 },
            { id: 'furn_9', type: 'sink_k', roomId: 'room_2', x: 5, y: 5 },
            { id: 'furn_10', type: 'computer', roomId: 'room_2', x: 6, y: 5 },
            
            { id: 'furn_11', type: 'basic_tv', roomId: 'room_2', x: 2, y: 6 },
            { id: 'furn_12', type: 'basic_sofa', roomId: 'room_2', x: 2, y: 7 }, // w=2 (2,7 & 3,7)
            
            { id: 'furn_13', type: 'decorated_table', roomId: 'room_2', x: 4, y: 6 }, // w=2 (4,6 & 5,6)
            
            { id: 'furn_14', type: 'wide_bookcase', roomId: 'room_2', x: 2, y: 8 }, // w=3 (2,8 & 3,8 & 4,8)
            { id: 'furn_15', type: 'display_case', roomId: 'room_2', x: 6, y: 7 }, // h=2 (6,7 & 6,8)

            // Yard / Transport
            { id: 'furn_16', type: 'garden_plot', roomId: null, x: 2, y: 10 },
            { id: 'furn_17', type: 'garden_plot', roomId: null, x: 3, y: 10 },
            { id: 'furn_18', type: 'garden_plot', roomId: null, x: 4, y: 10 },
            
            { id: 'furn_19', type: 'map_portal', roomId: null, x: 4, y: 9, config: { targetMap: 'mail_room', targetX: 2, targetY: 2 } },
            { id: 'furn_20', type: 'subway_gate', roomId: null, x: 5, y: 9, config: { isHub: true } },

            // Expanded Yard Decor
            { id: 'furn_21', type: 'fountain', roomId: null, x: 16, y: 16 },
            { id: 'furn_22', type: 'garden_bench', roomId: null, x: 14, y: 16 },
            { id: 'furn_23', type: 'garden_bench', roomId: null, x: 18, y: 16 },
            
            // Trees around the borders
            { id: 'furn_24', type: 'indoor_tree', roomId: null, x: 1, y: 20 },
            { id: 'furn_25', type: 'indoor_tree', roomId: null, x: 5, y: 20 },
            { id: 'furn_26', type: 'indoor_tree', roomId: null, x: 9, y: 20 },
            { id: 'furn_27', type: 'indoor_tree', roomId: null, x: 13, y: 20 },
            { id: 'furn_28', type: 'indoor_tree', roomId: null, x: 17, y: 20 },
            { id: 'furn_29', type: 'indoor_tree', roomId: null, x: 21, y: 20 },

            { id: 'furn_30', type: 'indoor_tree', roomId: null, x: 20, y: 2 },
            { id: 'furn_31', type: 'indoor_tree', roomId: null, x: 20, y: 6 },
            { id: 'furn_32', type: 'indoor_tree', roomId: null, x: 20, y: 10 },
            { id: 'furn_33', type: 'indoor_tree', roomId: null, x: 20, y: 14 },

            // Extra flair
            { id: 'furn_34', type: 'bbq_grill', roomId: null, x: 16, y: 13 },
            { id: 'furn_35', type: 'telescope', roomId: null, x: 18, y: 13 }
          ],
          nextRoomId: 3,
          nextFurnId: 36,
          brokenFurniture: [],
        },
        mail_room: {
          lotWidth: 8,
          lotHeight: 8,
          rooms: [
            { id: 'room_0', type: 'office', x: 0, y: 0, w: 8, h: 8 }
          ],
          furniture: [
            { id: 'furn_0', type: 'basic_desk', roomId: 'room_0', x: 4, y: 4 },
            { id: 'furn_1', type: 'map_portal', roomId: 'room_0', x: 1, y: 0, config: { targetMap: 'house', targetX: 2, targetY: 2 } }
          ],
          nextRoomId: 1,
          nextFurnId: 2,
          brokenFurniture: [],
        },
        downtown: {
          lotWidth: 40, lotHeight: 40,
          rooms: [ { id: 'room_0', type: 'subway', x: 0, y: 0, w: 40, h: 40 } ],
          furniture: [
            { id: 'furn_0', type: 'subway_gate', roomId: 'room_0', x: 19, y: 38, config: { isHub: true } },
            { id: 'furn_1', type: 'display_shelf', roomId: 'room_0', x: 19, y: 2 }
          ],
          nextRoomId: 1, nextFurnId: 2, brokenFurniture: []
        },
        university: {
          lotWidth: 40, lotHeight: 40,
          rooms: [ { id: 'room_0', type: 'subway', x: 0, y: 0, w: 40, h: 40 } ],
          furniture: [
            { id: 'furn_0', type: 'subway_gate', roomId: 'room_0', x: 19, y: 38, config: { isHub: true } },
            { id: 'furn_1', type: 'language_book', roomId: 'room_0', x: 19, y: 2 }
          ],
          nextRoomId: 1, nextFurnId: 2, brokenFurniture: []
        }
      },
      economy: {
        money: cfg.STARTING_STATE.money,
        totalEarned: 0,
        totalSpent: 0,
        daysWorked: 0,
        workPerformance: 0,
      },
      social: {
        relationships: {},
        romanticTarget: null,
        married: false,
      },
      time: {
        day: 1,
        hour: 6,
        minute: 0,
        speed: 1,
        totalMinutes: 0,
        season: 'spring',
        weather: 'clear',
      },
      prestige: {
        legacyPoints: 0,
        totalLegacyPoints: 0,
        generation: 1,
        upgrades: {},
      },
      stats: {
        buildingsBuilt: 0,
        furnitureBought: 0,
        mealsCooked: 0,
        promotionsEarned: 0,
        friendsMade: 0,
        eventsHandled: 0,
        totalDaysPlayed: 0,
      },
      ui: {
        mode: 'live',
        selectedRoom: null,
        selectedFurniture: null,
        showingPanel: null,
        buildGhost: null,
      },
      events: {
        activeEvent: null,
        cooldown: 300,
        history: [],
      },
      npcWalkers: [],
    };
  }

  let state = createNewState();

  // ----- SAVE MANAGER logic -----
  function getIndex() {
    try {
      const data = localStorage.getItem(SAVE_INDEX_KEY);
      return data ? JSON.parse(data) : [];
    } catch(e) {
      return [];
    }
  }

  function saveIndex(idxArr) {
    localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(idxArr));
  }

  function migrateLegacySaveIfNeeded() {
    const legacy = localStorage.getItem('simlife_save');
    const idx = getIndex();
    if (legacy && idx.length === 0) {
      // Create a slot 1 from legacy
      const stateObj = JSON.parse(legacy);
      const slotId = 'save_old_1';
      localStorage.setItem(slotId, legacy);
      idx.push({
        id: slotId,
        name: 'Legacy World',
        characterName: stateObj.character ? stateObj.character.name : 'Unknown',
        money: stateObj.economy ? stateObj.economy.money : 0,
        day: stateObj.time ? stateObj.time.day : 1,
        lastPlayed: Date.now()
      });
      saveIndex(idx);
      localStorage.removeItem('simlife_save'); // Clean up
      console.log('Migrated legacy save to slot:', slotId);
    }
  }

  return {
    get: function() { return state; },
    getActiveMap: function() { return state.maps[state.character.mapId]; },

    reset: function() {
      state = createNewState();
      activeSlotId = null;
      return state;
    },

    save: function() {
      if (!activeSlotId) return false;
      try {
        const saveData = JSON.parse(JSON.stringify(state));
        delete saveData.ui;
        delete saveData.events;
        localStorage.setItem(activeSlotId, JSON.stringify(saveData));

        // Update index metadata
        let idx = getIndex();
        let slot = idx.find(s => s.id === activeSlotId);
        if (slot) {
          slot.characterName = state.character.name;
          slot.money = state.economy.money;
          slot.day = state.time.day;
          slot.lastPlayed = Date.now();
        } else {
          // Should normally have been created during createSave, but fallback
          idx.push({
            id: activeSlotId,
            name: `World ${state.time.day}`,
            characterName: state.character.name,
            money: state.economy.money,
            day: state.time.day,
            lastPlayed: Date.now()
          });
        }
        saveIndex(idx);
        return true;
      } catch(e) {
        console.error('Save failed:', e);
        return false;
      }
    },

    // Used before starting game loop
    loadSlot: function(slotId) {
      try {
        const data = localStorage.getItem(slotId);
        if (!data) return false;
        const saved = JSON.parse(data);
        const fresh = createNewState();

        // Data Migration: single house to maps object
        if (saved.house && !saved.maps) {
          saved.maps = { house: saved.house, mail_room: fresh.maps.mail_room };
          delete saved.house;
        }
        if (saved.character && !saved.character.mapId) {
          saved.character.mapId = 'house';
        }

        state = deepMerge(fresh, saved);
        state.ui = fresh.ui;
        state.events = fresh.events;
        
        if (!state.character.achievements) state.character.achievements = [];
        if (!state.character.collection) state.character.collection = [];
        if (!state.maps.downtown) state.maps.downtown = fresh.maps.downtown;
        if (!state.maps.university) state.maps.university = fresh.maps.university;
        
        // Ensure legacy saves get a color if missing
        if (!state.character.color) state.character.color = 0x88CCFF;
        
        activeSlotId = slotId;
        return true;
      } catch(e) {
        console.error('Load slot failed:', e);
        return false;
      }
    },

    createSave: function(worldName, characterData) {
      const fresh = createNewState();
      // Apply Char Data
      if (characterData) {
        fresh.character.name = characterData.name;
        fresh.character.trait = characterData.trait;
        // Parse hex color (e.g. "#FF0000" to 0xFF0000)
        let c = characterData.color || '#88CCFF';
        if (typeof c === 'string' && c.startsWith('#')) {
          c = parseInt(c.replace('#', '0x'), 16);
        }
        fresh.character.color = c;
      }
      state = fresh;
      activeSlotId = 'save_' + Date.now();
      
      let idx = getIndex();
      idx.push({
        id: activeSlotId,
        name: worldName || 'New World',
        characterName: fresh.character.name,
        money: fresh.economy.money,
        day: fresh.time.day,
        lastPlayed: Date.now()
      });
      saveIndex(idx);
      
      // Save it immediately
      this.save();
      return activeSlotId;
    },

    getSaves: function() {
      migrateLegacySaveIfNeeded();
      return getIndex().sort((a,b) => b.lastPlayed - a.lastPlayed);
    },

    deleteSave: function(slotId) {
      let idx = getIndex();
      idx = idx.filter(s => s.id !== slotId);
      saveIndex(idx);
      localStorage.removeItem(slotId);
      if (activeSlotId === slotId) activeSlotId = null;
    },

    hasSave: function() {
      migrateLegacySaveIfNeeded();
      return getIndex().length > 0;
    },

    getActiveSlotId: function() { return activeSlotId; },

    // Apply prestige bonuses to a new state
    applyPrestige: function(prestigeData) {
      state.prestige = prestigeData;
      const cfg = Game.Config;
      const ups = prestigeData.upgrades;

      if (ups.inheritance) {
        const saved = state.economy.money;
        state.economy.money += Math.floor(saved * 0.3 * ups.inheritance);
      }
      if (ups.bigger_lot) {
        state.maps.house.lotWidth += 2 * ups.bigger_lot;
        state.maps.house.lotHeight += 2 * ups.bigger_lot;
      }
    },
  };

  function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
})();
