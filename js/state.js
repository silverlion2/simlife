// ============================================================
// SimLife — Game State Management
// ============================================================
window.Game = window.Game || {};

Game.State = (function() {
  const SAVE_INDEX_KEY = 'simlife_saves_index';
  let activeSlotId = null;

  function isMissingColor(color) {
    return color === undefined || color === null;
  }

  function legacyFormFromAppearance(form) {
    return form === 'witch' ? 'online_witch' : (form || 'online_witch');
  }

  function colorToNumber(color) {
    if (typeof color === 'number') return color;
    let value = color;
    if (typeof value === 'string' && Game.AvatarCatalog && Game.AvatarCatalog.COLOR_VALUES[value]) {
      value = Game.AvatarCatalog.COLOR_VALUES[value];
    }
    if (typeof value === 'string' && value.startsWith('#')) {
      return parseInt(value.replace('#', '0x'), 16);
    }
    return 0x88CCFF;
  }

  function colorToHex(color) {
    if (typeof color === 'string') return color;
    return '#' + colorToNumber(color).toString(16).padStart(6, '0').slice(-6);
  }

  function syncLegacyAppearanceFields(character) {
    if (!character) return;
    if (isMissingColor(character.color)) character.color = 0x88CCFF;
    if (!Game.Appearance) return;

    if (!character.appearance) {
      character.appearance = Game.Appearance.fromLegacy(character);
    } else {
      const legacyForm = Game.Appearance.legacyFormToCatalog(character.form);
      const rawAppearance = character.appearance;
      const rawForm = rawAppearance.form || legacyForm;
      const rawFormState = rawAppearance.forms && rawAppearance.forms[rawForm];
      const rawColors = rawFormState && rawFormState.colors;
      const hasPrimary = rawColors && !isMissingColor(rawColors.primary);
      const hasAccent = rawColors && !isMissingColor(rawColors.accent);
      const appearanceInput = rawAppearance.form ? rawAppearance : { ...rawAppearance, form: rawForm };
      const normalized = Game.Appearance.normalizeAppearance(appearanceInput);

      if (!hasPrimary && !isMissingColor(character.color)) {
        normalized.forms[normalized.form].colors.primary = colorToHex(character.color);
      }
      if (normalized.form === 'robot' && !hasAccent && !isMissingColor(character.color)) {
        normalized.forms.robot.colors.accent = colorToHex(character.color);
      }
      character.appearance = Game.Appearance.normalizeAppearance(normalized);
    }

    const activeForm = character.appearance.form;
    const activeColors = character.appearance.forms[activeForm].colors;
    character.form = legacyFormFromAppearance(activeForm);
    character.color = colorToNumber(activeColors.primary);
  }

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
        form: 'online_witch',
        color: 0x88CCFF, // Default corn tint
        appearance: Game.Appearance ? Game.Appearance.fromLegacy({ form: 'online_witch', color: 0x88CCFF }) : null,
        currentActivity: null,
        activityProgress: 0,
        actionQueue: [],
        moodlets: [],
        achievements: [],
        collection: [],
        position: { x: 3, y: 3 },
        floor: 0,
        targetPosition: null,
        spouse: null,
        autonomy: { thought: null, lastAutoTime: 0, enabled: true },
        mapId: 'house',
      },
      maps: {
        house: {
          lotWidth: lotW,
          lotHeight: lotH,
          activeFloor: 0,
          unlockedFloors: 1,
          floors: [
            { level: 0, label: 'Ground Floor' }
          ],
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
            { id: 'furn_36', type: 'arcade_machine', roomId: 'room_2', x: 6, y: 6 },

            // Yard / Transport
            { id: 'furn_16', type: 'garden_plot', roomId: null, x: 2, y: 10 },
            { id: 'furn_17', type: 'garden_plot', roomId: null, x: 3, y: 10 },
            { id: 'furn_18', type: 'garden_plot', roomId: null, x: 4, y: 10 },
            { id: 'furn_37', type: 'garden_bench', roomId: null, x: 8, y: 10 },
            { id: 'furn_38', type: 'bonsai_shrine', roomId: null, x: 11, y: 10 },
            
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
          nextFurnId: 39,
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
        },
        tech_office: {
          lotWidth: 16, lotHeight: 16,
          rooms: [ { id: 'room_0', type: 'study', x: 0, y: 0, w: 16, h: 16 } ],
          furniture: [
            { id: 'furn_0', type: 'computer', roomId: 'room_0', x: 8, y: 8 },
            { id: 'furn_1', type: 'basic_desk', roomId: 'room_0', x: 8, y: 8 },
            { id: 'furn_2', type: 'coffee_table', roomId: 'room_0', x: 4, y: 4 },
            { id: 'furn_3', type: 'wide_bookcase', roomId: 'room_0', x: 4, y: 12 }
          ],
          nextRoomId: 1, nextFurnId: 4, brokenFurniture: []
        },
        culinary_kitchen: {
          lotWidth: 16, lotHeight: 16,
          rooms: [ { id: 'room_0', type: 'kitchen', x: 0, y: 0, w: 16, h: 16 } ],
          furniture: [
            { id: 'furn_0', type: 'smart_stove', roomId: 'room_0', x: 8, y: 8 },
            { id: 'furn_1', type: 'smart_fridge', roomId: 'room_0', x: 6, y: 8 },
            { id: 'furn_2', type: 'counter', roomId: 'room_0', x: 10, y: 8 },
            { id: 'furn_3', type: 'espresso', roomId: 'room_0', x: 10, y: 8 }
          ],
          nextRoomId: 1, nextFurnId: 4, brokenFurniture: []
        },
        business_hq: {
          lotWidth: 16, lotHeight: 16,
          rooms: [ { id: 'room_0', type: 'office', x: 0, y: 0, w: 16, h: 16 } ],
          furniture: [
            { id: 'furn_0', type: 'basic_desk', roomId: 'room_0', x: 8, y: 8 },
            { id: 'furn_1', type: 'nice_sofa', roomId: 'room_0', x: 4, y: 12 },
            { id: 'furn_2', type: 'big_tv', roomId: 'room_0', x: 4, y: 4 },
            { id: 'furn_3', type: 'indoor_tree', roomId: 'room_0', x: 12, y: 4 }
          ],
          nextRoomId: 1, nextFurnId: 4, brokenFurniture: []
        }
      },
      economy: {
        money: cfg.STARTING_STATE.money,
        totalEarned: 0,
        totalSpent: 0,
        daysWorked: 0,
        workPerformance: 0,
      },
      homeGrowth: {
        level: 1,
        homeValue: 0,
        baselineValue: null,
        milestones: [],
      },
      inventory: {
        objects: [],
        nextObjectId: 1,
        market: {
          generatedDay: null,
          offers: [],
        },
      },
      homeGoals: {
        active: [],
        completed: [],
        nextGoalId: 1,
        generatedDay: null,
      },
      homeCollections: {
        completed: [],
      },
      social: {
        relationships: {},
        romanticTarget: null,
        married: false,
      },
      family: {
        members: [
          { id: 'player', name: 'Player', role: 'self', lifeStage: 'young_adult', dayJoined: 1 }
        ],
        nextMemberId: 1,
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
      campaign: {
        id: 'new_roots_v1',
        completed: [],
        awarded: {},
        xp: 0,
        level: 1,
        flags: {},
        startedDay: 1,
        finishedDay: null,
      },
      stats: {
        buildingsBuilt: 0,
        furnitureBought: 0,
        mealsCooked: 0,
        promotionsEarned: 0,
        friendsMade: 0,
        eventsHandled: 0,
        totalDaysPlayed: 0,
        familyRoutineCompletions: 0,
        lotExpansions: 0,
        homeCollectionsCompleted: 0,
        roomsFurnished: 0,
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
        // Create a deep clone for saving so we don't modify the live state
        const saveData = JSON.parse(JSON.stringify(state));
        syncLegacyAppearanceFields(saveData.character);
        
        // Strip transient/runtime-only properties from the saved data
        delete saveData.ui;
        delete saveData.events;
        delete saveData.npcWalkers; 
        
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
        if (!saved.character) saved.character = {};
        syncLegacyAppearanceFields(saved.character);

        state = deepMerge(fresh, saved);
        state.ui = fresh.ui;
        state.events = fresh.events;
        
        if (!state.character.achievements) state.character.achievements = [];
        if (!state.character.collection) state.character.collection = [];
        if (!state.maps.downtown) state.maps.downtown = fresh.maps.downtown;
        if (!state.maps.university) state.maps.university = fresh.maps.university;
        
        // Ensure legacy saves get a color if missing
        syncLegacyAppearanceFields(state.character);
        if (Game.HomeGrowth && Game.HomeGrowth.ensureState) Game.HomeGrowth.ensureState(state);
        if (Game.Family && Game.Family.ensureState) Game.Family.ensureState(state);
        if (Game.ObjectMarket && Game.ObjectMarket.ensureState) Game.ObjectMarket.ensureState(state);
        if (Game.HomeGoals && Game.HomeGoals.ensureState) Game.HomeGoals.ensureState(state);
        
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
        fresh.character.name = characterData.name || fresh.character.name;
        fresh.character.trait = characterData.trait || fresh.character.trait;

        fresh.character.form = characterData.form || fresh.character.form || 'online_witch';
        fresh.character.color = isMissingColor(characterData.color) ? fresh.character.color : characterData.color;
        if (characterData.appearance) {
          fresh.character.appearance = characterData.appearance;
        } else if (Game.Appearance) {
          fresh.character.appearance = Game.Appearance.fromLegacy({ form: fresh.character.form, color: fresh.character.color });
        }
        syncLegacyAppearanceFields(fresh.character);
      }
      state = fresh;
      if (Game.HomeGrowth && Game.HomeGrowth.ensureState) Game.HomeGrowth.ensureState(state);
      if (Game.Family && Game.Family.ensureState) Game.Family.ensureState(state);
      if (Game.ObjectMarket && Game.ObjectMarket.ensureState) Game.ObjectMarket.ensureState(state);
      if (Game.HomeGoals && Game.HomeGoals.ensureState) Game.HomeGoals.ensureState(state);
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

    exportToFile: function(slotId) {
      const targetSlot = slotId || activeSlotId;
      if (!targetSlot) return false;
      if (targetSlot === activeSlotId) this.save(); // ensure local storage is up to date
      
      const saveData = JSON.parse(localStorage.getItem(targetSlot));
      if (!saveData) return false;

      let idx = getIndex();
      const meta = idx.find(s => s.id === targetSlot);
      
      const exportObject = {
          metadata: meta,
          state: saveData
      };
      
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObject));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "simlife_save_" + (meta ? meta.name.replace(/\s+/g, '_') : 'world') + ".json");
      document.body.appendChild(downloadAnchorNode); 
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      return true;
    },

    importFromFile: function(fileContent) {
      try {
        const importObject = JSON.parse(fileContent);
        if (!importObject.metadata || !importObject.state) {
            console.error('Invalid save file format.');
            return false;
        }
        
        let idx = getIndex();
        // Generate a new slot ID to avoid collisions
        const newSlotId = 'save_' + Date.now();
        importObject.metadata.id = newSlotId;
        importObject.metadata.lastPlayed = Date.now();
        
        // Add to index
        idx.push(importObject.metadata);
        saveIndex(idx);
        
        // Save state payload
        localStorage.setItem(newSlotId, JSON.stringify(importObject.state));
        return true;
      } catch (e) {
        console.error('Failed to import save:', e);
        return false;
      }
    },

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
