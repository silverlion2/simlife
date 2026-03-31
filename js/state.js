// ============================================================
// SimLife — Game State Management
// ============================================================
window.Game = window.Game || {};

Game.State = (function() {
  const SAVE_KEY = 'simlife_save';

  function createNewState() {
    const cfg = Game.Config;
    const lotW = cfg.STARTING_STATE.lotWidth;
    const lotH = cfg.STARTING_STATE.lotHeight;

    return {
      version: 1,
      character: {
        name: 'Player',
        needs: { hunger: 80, energy: 100, hygiene: 90, fun: 70, social: 60, comfort: 70 },
        skills: { cooking: 0, fitness: 0, charisma: 0, tech: 0, creativity: 0, logic: 0, gardening: 0, handiness: 0 },
        skillXp: { cooking: 0, fitness: 0, charisma: 0, tech: 0, creativity: 0, logic: 0, gardening: 0, handiness: 0 },
        career: null,
        lifeStage: 'young_adult',
        trait: Object.keys(cfg.TRAITS || {})[Math.floor(Math.random() * Object.keys(cfg.TRAITS || {}).length)] || 'neat',
        currentActivity: null,
        activityProgress: 0,
        actionQueue: [],
        moodlets: [],
        position: { x: 3, y: 3 },
        targetPosition: null,
        spouse: null,
        autonomy: { thought: null, lastAutoTime: 0, enabled: true },
      },
      house: {
        lotWidth: lotW,
        lotHeight: lotH,
        rooms: [
          { id: 'room_0', type: 'bedroom', x: 1, y: 1, w: 3, h: 3 }
        ],
        furniture: [
          { id: 'furn_0', type: 'basic_bed', roomId: 'room_0', x: 1, y: 1 },
          { id: 'furn_1', type: 'lamp', roomId: 'room_0', x: 3, y: 1 },
        ],
        nextRoomId: 1,
        nextFurnId: 2,
        brokenFurniture: [], // Array of furniture IDs that are broken
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
        mode: 'live',  // 'live', 'build', 'furniture'
        selectedRoom: null,
        selectedFurniture: null,
        showingPanel: null,
        buildGhost: null,
      },
      events: {
        activeEvent: null,
        cooldown: 300,  // 5 game-hours before first event
        history: [],
      },
      npcWalkers: [], // Active NPC walker instances on the lot
    };
  }

  let state = createNewState();

  return {
    get: function() { return state; },

    reset: function() {
      state = createNewState();
      return state;
    },

    save: function() {
      try {
        const saveData = JSON.parse(JSON.stringify(state));
        delete saveData.ui;
        delete saveData.events;
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        return true;
      } catch(e) {
        console.error('Save failed:', e);
        return false;
      }
    },

    load: function() {
      try {
        const data = localStorage.getItem(SAVE_KEY);
        if (!data) return false;
        const saved = JSON.parse(data);
        const fresh = createNewState();
        // Merge saved over fresh (preserves new fields)
        state = deepMerge(fresh, saved);
        state.ui = fresh.ui;
        state.events = fresh.events;
        return true;
      } catch(e) {
        console.error('Load failed:', e);
        return false;
      }
    },

    hasSave: function() {
      return !!localStorage.getItem(SAVE_KEY);
    },

    deleteSave: function() {
      localStorage.removeItem(SAVE_KEY);
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
        state.house.lotWidth += 2 * ups.bigger_lot;
        state.house.lotHeight += 2 * ups.bigger_lot;
      }
      if (ups.connections && state.character.career) {
        // Applied when choosing career
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
