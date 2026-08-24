// ============================================================
// SimLife — Game State Management
// ============================================================
window.Game = window.Game || {};

Game.State = (function() {
  const SAVE_INDEX_KEY = 'simlife_saves_index';
  const SAVE_VERSION = 2;
  /** @type {string | null} */
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
      version: SAVE_VERSION,
      character: {
        name: 'Player',
        needs: { hunger: 80, energy: 100, hygiene: 90, fun: 70, social: 60, comfort: 70, bladder: 100 },
        skills: { cooking: 0, fitness: 0, charisma: 0, tech: 0, creativity: 0, logic: 0, gardening: 0, handiness: 0, language: 0 },
        skillXp: { cooking: 0, fitness: 0, charisma: 0, tech: 0, creativity: 0, logic: 0, gardening: 0, handiness: 0, language: 0 },
        career: null,
        lifeStage: 'young_adult',
        trait: Object.keys(cfg.TRAITS || {})[Game.Random.int(0, Math.max(0, Object.keys(cfg.TRAITS || {}).length - 1))] || 'neat',
        form: 'online_witch',
        color: 0x88CCFF, // Default corn tint
        appearance: Game.Appearance ? Game.Appearance.fromLegacy({ form: 'online_witch', color: 0x88CCFF }) : null,
        currentActivity: null,
        activityProgress: 0,
        actionQueue: [],
        moodlets: [],
        achievements: [],
        collection: [],
        visitedMaps: ['house'],
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
            { id: 'furn_39', type: 'potted_flower', roomId: 'room_0', x: 2, y: 4 },
            
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
            { id: 'furn_36', type: 'arcade_machine', roomId: 'room_2', x: 5, y: 7 },

            // Yard / Transport
            { id: 'furn_16', type: 'garden_plot', roomId: null, x: 2, y: 10 },
            { id: 'furn_17', type: 'garden_plot', roomId: null, x: 3, y: 10 },
            { id: 'furn_18', type: 'garden_plot', roomId: null, x: 4, y: 10 },
            { id: 'furn_37', type: 'garden_bench', roomId: null, x: 8, y: 10 },
            { id: 'furn_38', type: 'bonsai_shrine', roomId: null, x: 11, y: 10 },
            { id: 'furn_40', type: 'potted_flower', roomId: null, x: 6, y: 10 },
            
            { id: 'furn_19', type: 'map_portal', roomId: null, x: 4, y: 9, config: { targetMap: 'mail_room', targetX: 2, targetY: 2 } },
            { id: 'furn_20', type: 'subway_gate', roomId: null, x: 5, y: 9, config: { isHub: true } },

            // Courtyard
            { id: 'furn_21', type: 'fountain', roomId: null, x: 10, y: 13 },
            { id: 'furn_22', type: 'garden_bench', roomId: null, x: 8, y: 13 },
            { id: 'furn_23', type: 'garden_bench', roomId: null, x: 12, y: 13 },
            
            // Trees frame the active starter garden.
            { id: 'furn_24', type: 'indoor_tree', roomId: null, x: 1, y: 13 },
            { id: 'furn_25', type: 'indoor_tree', roomId: null, x: 4, y: 15 },
            { id: 'furn_26', type: 'indoor_tree', roomId: null, x: 7, y: 16 },
            { id: 'furn_27', type: 'indoor_tree', roomId: null, x: 10, y: 16 },
            { id: 'furn_28', type: 'indoor_tree', roomId: null, x: 13, y: 15 },
            { id: 'furn_29', type: 'indoor_tree', roomId: null, x: 16, y: 13 },

            { id: 'furn_30', type: 'indoor_tree', roomId: null, x: 15, y: 1 },
            { id: 'furn_31', type: 'indoor_tree', roomId: null, x: 16, y: 5 },
            { id: 'furn_32', type: 'indoor_tree', roomId: null, x: 16, y: 9 },
            { id: 'furn_33', type: 'indoor_tree', roomId: null, x: 16, y: 11 },

            // Outdoor living nook
            { id: 'furn_34', type: 'bbq_grill', roomId: null, x: 10, y: 10 },
            { id: 'furn_35', type: 'telescope', roomId: null, x: 12, y: 10 }
          ],
          nextRoomId: 3,
          nextFurnId: 41,
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
            { id: 'furn_1', type: 'basic_desk', roomId: 'room_0', x: 10, y: 8 },
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
            { id: 'furn_3', type: 'espresso', roomId: 'room_0', x: 11, y: 8 }
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
        },
        science_lab: {
          lotWidth: 16, lotHeight: 16,
          rooms: [ { id: 'room_0', type: 'lab', x: 0, y: 0, w: 16, h: 16 } ],
          furniture: [
            { id: 'furn_0', type: 'printer_3d', roomId: 'room_0', x: 8, y: 8 },
            { id: 'furn_1', type: 'workbench', roomId: 'room_0', x: 5, y: 8 },
            { id: 'furn_2', type: 'aquarium', roomId: 'room_0', x: 11, y: 8 },
            { id: 'furn_3', type: 'wide_bookcase', roomId: 'room_0', x: 5, y: 12 },
            { id: 'furn_4', type: 'indoor_tree', roomId: 'room_0', x: 12, y: 3 }
          ],
          nextRoomId: 1, nextFurnId: 5, brokenFurniture: []
        },
        creative_studio: {
          lotWidth: 16, lotHeight: 16,
          rooms: [ { id: 'room_0', type: 'studio', x: 0, y: 0, w: 16, h: 16 } ],
          furniture: [
            { id: 'furn_0', type: 'drafting_table', roomId: 'room_0', x: 8, y: 8 },
            { id: 'furn_1', type: 'grand_piano', roomId: 'room_0', x: 5, y: 3 },
            { id: 'furn_2', type: 'decorated_table', roomId: 'room_0', x: 10, y: 4 },
            { id: 'furn_3', type: 'vanity', roomId: 'room_0', x: 12, y: 10 },
            { id: 'furn_4', type: 'potted_flower', roomId: 'room_0', x: 3, y: 12 }
          ],
          nextRoomId: 1, nextFurnId: 5, brokenFurniture: []
        },
        clinic: {
          lotWidth: 16, lotHeight: 16,
          rooms: [ { id: 'room_0', type: 'clinic', x: 0, y: 0, w: 16, h: 16 } ],
          furniture: [
            { id: 'furn_0', type: 'computer', roomId: 'room_0', x: 8, y: 8 },
            { id: 'furn_1', type: 'basic_desk', roomId: 'room_0', x: 8, y: 9 },
            { id: 'furn_2', type: 'good_bed', roomId: 'room_0', x: 11, y: 8 },
            { id: 'furn_3', type: 'aquarium', roomId: 'room_0', x: 4, y: 4 },
            { id: 'furn_4', type: 'nice_sofa', roomId: 'room_0', x: 4, y: 12 }
          ],
          nextRoomId: 1, nextFurnId: 5, brokenFurniture: []
        },
        entertainment_venue: {
          lotWidth: 16, lotHeight: 16,
          rooms: [ { id: 'room_0', type: 'stage', x: 0, y: 0, w: 16, h: 16 } ],
          furniture: [
            { id: 'furn_0', type: 'grand_piano', roomId: 'room_0', x: 8, y: 8 },
            { id: 'furn_1', type: 'stereo', roomId: 'room_0', x: 5, y: 6 },
            { id: 'furn_2', type: 'nice_sofa', roomId: 'room_0', x: 5, y: 12 },
            { id: 'furn_3', type: 'arcade_machine', roomId: 'room_0', x: 12, y: 6 },
            { id: 'furn_4', type: 'potted_flower', roomId: 'room_0', x: 12, y: 12 }
          ],
          nextRoomId: 1, nextFurnId: 5, brokenFurniture: []
        },
        education_campus: {
          lotWidth: 16, lotHeight: 16,
          rooms: [ { id: 'room_0', type: 'classroom', x: 0, y: 0, w: 16, h: 16 } ],
          furniture: [
            { id: 'furn_0', type: 'bookshelf', roomId: 'room_0', x: 8, y: 8 },
            { id: 'furn_1', type: 'basic_desk', roomId: 'room_0', x: 4, y: 6 },
            { id: 'furn_2', type: 'basic_desk', roomId: 'room_0', x: 7, y: 6 },
            { id: 'furn_3', type: 'basic_desk', roomId: 'room_0', x: 10, y: 6 },
            { id: 'furn_4', type: 'wide_bookcase', roomId: 'room_0', x: 5, y: 12 },
            { id: 'furn_5', type: 'globe', roomId: 'room_0', x: 12, y: 10 }
          ],
          nextRoomId: 1, nextFurnId: 6, brokenFurniture: []
        }
      },
      pets: [],
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
  const SAVE_LIMITS = Object.freeze({
    serializedCharacters: 2 * 1024 * 1024,
    maps: 32,
    roomsPerMap: 2048,
    furniturePerMap: 5000,
    floorsPerMap: 16,
    brokenPerMap: 5000,
    actionQueue: 6,
    moodlets: 8,
    pets: 64,
    householdMembers: 256,
    persistentArray: 5000,
    depth: 32,
    nodes: 100000,
    stringLength: 262144,
  });
  const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isPayloadWithinLimits(value, depth = 0, counter = { nodes: 0 }) {
    if (depth > SAVE_LIMITS.depth || ++counter.nodes > SAVE_LIMITS.nodes) return false;
    if (typeof value === 'string') return value.length <= SAVE_LIMITS.stringLength;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return true;
    if (Array.isArray(value)) {
      if (value.length > SAVE_LIMITS.nodes) return false;
      return value.every(entry => isPayloadWithinLimits(entry, depth + 1, counter));
    }
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    if (keys.some(key => UNSAFE_OBJECT_KEYS.has(key))) return false;
    return keys.every(key => isPayloadWithinLimits(value[key], depth + 1, counter));
  }

  function isValidRoomPayload(value) {
    return isPlainObject(value)
      && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128
      && typeof value.type === 'string' && value.type.length > 0 && value.type.length <= 128
      && Number.isFinite(value.x) && Number.isFinite(value.y)
      && Number.isFinite(value.w) && value.w > 0
      && Number.isFinite(value.h) && value.h > 0
      && (value.floor === undefined || Number.isFinite(value.floor));
  }

  function isValidFurniturePayload(value) {
    return isPlainObject(value)
      && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128
      && typeof value.type === 'string' && value.type.length > 0 && value.type.length <= 128
      && Number.isFinite(value.x) && Number.isFinite(value.y)
      && (value.floor === undefined || Number.isFinite(value.floor))
      && (value.roomId === undefined || value.roomId === null || typeof value.roomId === 'string')
      && (value.config === undefined || isPlainObject(value.config));
  }

  function isValidFloorPayload(value) {
    return isPlainObject(value)
      && Number.isFinite(value.level)
      && (value.label === undefined || typeof value.label === 'string');
  }

  function isBoundedArray(value, limit, predicate) {
    return value === undefined || (Array.isArray(value) && value.length <= limit && value.every(predicate));
  }

  function isShortString(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128;
  }

  function isValidPositionPayload(value) {
    return isPlainObject(value)
      && Number.isFinite(value.x) && Number.isFinite(value.y)
      && (value.z === undefined || Number.isFinite(value.z));
  }

  function isValidActionQueuePayload(value) {
    return isShortString(value) || (isPlainObject(value)
      && isShortString(value.key)
      && (value.targetFurnId === undefined || value.targetFurnId === null || isShortString(value.targetFurnId))
      && (value.source === undefined || isShortString(value.source)));
  }

  function isValidMoodletPayload(value) {
    return isPlainObject(value)
      && isShortString(value.name)
      && Number.isFinite(value.value)
      && Number.isFinite(value.remaining)
      && Number.isFinite(value.duration)
      && (value.icon === undefined || (typeof value.icon === 'string' && value.icon.length <= 64));
  }

  function isValidPetPayload(value) {
    return isPlainObject(value)
      && isShortString(value.id) && isShortString(value.type)
      && (value.active === undefined || typeof value.active === 'boolean')
      && (value.position === undefined || isValidPositionPayload(value.position))
      && (value.targetPosition === undefined || value.targetPosition === null || isValidPositionPayload(value.targetPosition))
      && (value.timer === undefined || Number.isFinite(value.timer));
  }

  function isValidInventoryObjectPayload(value) {
    return isPlainObject(value) && isShortString(value.id) && isShortString(value.type);
  }

  function isValidMarketOfferPayload(value) {
    return isPlainObject(value) && isShortString(value.id) && isShortString(value.type)
      && Number.isFinite(value.price) && value.price >= 0;
  }

  function isValidHomeGoalPayload(value) {
    return isPlainObject(value) && isShortString(value.id) && isShortString(value.key);
  }

  function isValidFamilyMemberPayload(value) {
    return isPlainObject(value) && isShortString(value.id) && isShortString(value.name) && isShortString(value.role)
      && (value.needs === undefined || isPlainObject(value.needs));
  }

  function normalizeSaveMetadata(value) {
    if (!isPlainObject(value) || typeof value.id !== 'string' || !value.id) return null;
    return {
      ...value,
      name: typeof value.name === 'string' && value.name ? value.name : 'Recovered World',
      characterName: typeof value.characterName === 'string' && value.characterName ? value.characterName : 'Unknown',
      money: Number.isFinite(Number(value.money)) ? Number(value.money) : 0,
      day: Number.isFinite(Number(value.day)) ? Number(value.day) : 1,
      lastPlayed: Number.isFinite(Number(value.lastPlayed)) ? Number(value.lastPlayed) : 0,
    };
  }

  function isValidStatePayload(value) {
    return isPlainObject(value)
      && isPlainObject(value.character)
      && isPlainObject(value.economy)
      && isPlainObject(value.time)
      && isPlainObject(value.maps)
      && Object.keys(value.maps).length <= SAVE_LIMITS.maps
      && Object.values(value.maps).every(isValidMapPayload);
  }

  function isValidMapPayload(value) {
    if (!isPlainObject(value)) return false;
    const arrayFields = ['rooms', 'furniture', 'floors', 'brokenFurniture'];
    if (!arrayFields.every(field => value[field] === undefined || Array.isArray(value[field]))) return false;
    if ((value.rooms?.length || 0) > SAVE_LIMITS.roomsPerMap
      || (value.furniture?.length || 0) > SAVE_LIMITS.furniturePerMap
      || (value.floors?.length || 0) > SAVE_LIMITS.floorsPerMap
      || (value.brokenFurniture?.length || 0) > SAVE_LIMITS.brokenPerMap) return false;
    return (value.rooms === undefined || value.rooms.every(isValidRoomPayload))
      && (value.furniture === undefined || value.furniture.every(isValidFurniturePayload))
      && (value.floors === undefined || value.floors.every(isValidFloorPayload))
      && (value.brokenFurniture === undefined || value.brokenFurniture.every(id => typeof id === 'string' && id.length <= 128))
      && (value.lotWidth === undefined || (Number.isFinite(value.lotWidth) && value.lotWidth > 0 && value.lotWidth <= 512))
      && (value.lotHeight === undefined || (Number.isFinite(value.lotHeight) && value.lotHeight > 0 && value.lotHeight <= 512));
  }

  function isStructurallyCompatiblePayload(value) {
    if (!isPlainObject(value)) return false;
    for (const field of ['character', 'economy', 'time', 'maps', 'homeGrowth', 'inventory', 'homeGoals', 'homeCollections', 'family', 'campaign']) {
      if (value[field] !== undefined && !isPlainObject(value[field])) return false;
    }
    const character = value.character;
    const inventory = value.inventory;
    if (inventory?.market !== undefined && !isPlainObject(inventory.market)) return false;
    return isBoundedArray(character?.actionQueue, SAVE_LIMITS.actionQueue, isValidActionQueuePayload)
      && isBoundedArray(character?.moodlets, SAVE_LIMITS.moodlets, isValidMoodletPayload)
      && isBoundedArray(character?.achievements, SAVE_LIMITS.persistentArray, isShortString)
      && isBoundedArray(character?.collection, SAVE_LIMITS.persistentArray, isShortString)
      && isBoundedArray(character?.visitedMaps, SAVE_LIMITS.maps, isShortString)
      && isBoundedArray(value.pets, SAVE_LIMITS.pets, isValidPetPayload)
      && isBoundedArray(value.homeGrowth?.milestones, SAVE_LIMITS.persistentArray, isShortString)
      && isBoundedArray(inventory?.objects, SAVE_LIMITS.persistentArray, isValidInventoryObjectPayload)
      && isBoundedArray(inventory?.market?.offers, SAVE_LIMITS.persistentArray, isValidMarketOfferPayload)
      && isBoundedArray(value.homeGoals?.active, SAVE_LIMITS.householdMembers, isValidHomeGoalPayload)
      && isBoundedArray(value.homeGoals?.completed, SAVE_LIMITS.persistentArray, isShortString)
      && isBoundedArray(value.homeCollections?.completed, SAVE_LIMITS.persistentArray, isShortString)
      && isBoundedArray(value.family?.members, SAVE_LIMITS.householdMembers, isValidFamilyMemberPayload)
      && isBoundedArray(value.campaign?.completed, SAVE_LIMITS.persistentArray, isShortString)
      && (value.maps === undefined || (
      Object.keys(value.maps).length <= SAVE_LIMITS.maps
      && Object.values(value.maps).every(isValidMapPayload)
      ));
  }

  function isValidLoadCandidate(value) {
    if (!isValidStatePayload(value)) return false;
    const character = value.character;
    const position = character.position;
    const activeMap = typeof character.mapId === 'string' ? value.maps[character.mapId] : null;
    return isPlainObject(position)
      && Number.isFinite(position.x)
      && Number.isFinite(position.y)
      && isPlainObject(activeMap)
      && Number.isFinite(value.time.day)
      && Number.isFinite(value.time.hour)
      && Number.isFinite(value.time.minute)
      && Number.isFinite(value.time.totalMinutes)
      && Number.isFinite(value.economy.money)
      && Object.values(value.maps).every(map => Number.isFinite(map.lotWidth) && Number.isFinite(map.lotHeight));
  }

  function resetTransientCharacterState(character) {
    if (!isPlainObject(character)) return;
    character.path = null;
    character.isPathfinding = false;
    character.wasMoving = false;
    character.pathRequestId = 0;
  }

  function createSaveData(sourceState) {
    const saveData = JSON.parse(JSON.stringify(sourceState));
    saveData.version = SAVE_VERSION;
    syncLegacyAppearanceFields(saveData.character);
    resetTransientCharacterState(saveData.character);
    delete saveData.ui;
    delete saveData.events;
    delete saveData.npcWalkers;
    return saveData;
  }

  function ensureDerivedState(targetState) {
    if (Game.HomeGrowth && Game.HomeGrowth.ensureState) Game.HomeGrowth.ensureState(targetState);
    if (Game.Family && Game.Family.ensureState) Game.Family.ensureState(targetState);
    if (Game.ObjectMarket && Game.ObjectMarket.ensureState) Game.ObjectMarket.ensureState(targetState);
    if (Game.HomeGoals && Game.HomeGoals.ensureState) Game.HomeGoals.ensureState(targetState);
  }

  function prepareLoadCandidate(savedPayload) {
    if (!isPayloadWithinLimits(savedPayload)) throw new TypeError('Save payload exceeds safety limits');
    const fresh = createNewState();
    const migrated = migrateStatePayload(JSON.parse(JSON.stringify(savedPayload)), fresh);
    if (!isStructurallyCompatiblePayload(migrated)) throw new TypeError('Invalid save state payload');
    syncLegacyAppearanceFields(migrated.character);

    const candidate = deepMerge(fresh, migrated);
    candidate.ui = fresh.ui;
    candidate.events = fresh.events;
    candidate.npcWalkers = fresh.npcWalkers;
    if (!Array.isArray(candidate.character.achievements)) candidate.character.achievements = [];
    if (!Array.isArray(candidate.character.collection)) candidate.character.collection = [];
    if (!candidate.maps.downtown) candidate.maps.downtown = fresh.maps.downtown;
    if (!candidate.maps.university) candidate.maps.university = fresh.maps.university;
    resetTransientCharacterState(candidate.character);
    syncLegacyAppearanceFields(candidate.character);
    ensureDerivedState(candidate);

    if (!isValidLoadCandidate(candidate)) throw new TypeError('Save state failed runtime validation');
    return candidate;
  }

  function createSlotId() {
    const base = `save_${Date.now()}`;
    let slotId = base;
    let suffix = 1;
    while (localStorage.getItem(slotId) !== null) {
      slotId = `${base}_${suffix++}`;
    }
    return slotId;
  }

  function persistNewSlot(slotId, saveData, nextIndex) {
    let slotWritten = false;
    try {
      localStorage.setItem(slotId, JSON.stringify(saveData));
      slotWritten = true;
      saveIndex(nextIndex);
    } catch (error) {
      if (slotWritten) {
        try {
          localStorage.removeItem(slotId);
        } catch (rollbackError) {
          console.error('Failed to roll back incomplete save slot:', rollbackError);
        }
      }
      throw error;
    }
  }

  function migrateStatePayload(saved, freshState = createNewState()) {
    if (!isPlainObject(saved)) throw new TypeError('Save payload must be an object');
    let version = Number.isInteger(saved.version) ? saved.version : 1;
    if (version > SAVE_VERSION) {
      throw new Error(`Save version ${version} is newer than supported version ${SAVE_VERSION}`);
    }
    while (version < SAVE_VERSION) {
      if (version !== 1) throw new Error(`No migration registered for save version ${version}`);
      if (saved.house && !saved.maps) {
        saved.maps = { house: saved.house, mail_room: freshState.maps.mail_room };
        delete saved.house;
      }
      if (!saved.character) saved.character = {};
      if (!saved.character.mapId) saved.character.mapId = 'house';
      version = 2;
      saved.version = version;
    }
    saved.version = SAVE_VERSION;
    return saved;
  }

  function getIndex() {
    try {
      const data = localStorage.getItem(SAVE_INDEX_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeSaveMetadata).filter(Boolean);
    } catch(e) {
      return [];
    }
  }

  function saveIndex(idxArr) {
    localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(idxArr));
  }

  function migrateLegacySaveIfNeeded() {
    try {
      const legacy = localStorage.getItem('simlife_save');
      const idx = getIndex();
      if (legacy && idx.length === 0) {
        const stateObj = JSON.parse(legacy);
        if (!isPlainObject(stateObj)) return;
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
        localStorage.removeItem('simlife_save');
        console.log('Migrated legacy save to slot:', slotId);
      }
    } catch (error) {
      console.warn('Legacy save could not be migrated:', error);
    }
  }

  return {
    SAVE_VERSION,
    migrateStatePayload,
    get: function() { return state; },
    getActiveMap: function() { return state.maps[state.character.mapId]; },

    reset: function() {
      state = createNewState();
      activeSlotId = null;
      return state;
    },

    save: function() {
      if (!activeSlotId) return false;
      /** @type {string | null} */
      let previousPayload = null;
      /** @type {string | null} */
      let previousIndex = null;
      try {
        previousPayload = localStorage.getItem(activeSlotId);
        previousIndex = localStorage.getItem(SAVE_INDEX_KEY);
        const saveData = createSaveData(state);
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
        Game.Signals?.emit('save:success', { slotId: activeSlotId, version: SAVE_VERSION });
        return true;
      } catch(e) {
        try {
          if (previousPayload === null) localStorage.removeItem(activeSlotId);
          else localStorage.setItem(activeSlotId, previousPayload);
          if (previousIndex === null) localStorage.removeItem(SAVE_INDEX_KEY);
          else localStorage.setItem(SAVE_INDEX_KEY, previousIndex);
        } catch (rollbackError) {
          console.error('Failed to restore the previous save transaction:', rollbackError);
        }
        console.error('Save failed:', e);
        Game.Signals?.emit('save:error', { operation: 'save', error: e });
        return false;
      }
    },

    // Used before starting game loop
    loadSlot: function(slotId) {
      try {
        const data = localStorage.getItem(slotId);
        if (!data) return false;
        const saved = JSON.parse(data);
        if (!isPlainObject(saved)) throw new TypeError('Save payload must be an object');
        const candidate = prepareLoadCandidate(saved);
        state = candidate;
        activeSlotId = slotId;
        Game.Signals?.emit('save:loaded', { slotId, version: state.version });
        return true;
      } catch(e) {
        console.error('Load slot failed:', e);
        Game.Signals?.emit('save:error', { operation: 'load', slotId, error: e });
        return false;
      }
    },

    createSave: function(worldName, characterData) {
      try {
        const fresh = createNewState();
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
        ensureDerivedState(fresh);

        const slotId = createSlotId();
        const idx = getIndex();
        idx.push({
          id: slotId,
          name: worldName || 'New World',
          characterName: fresh.character.name,
          money: fresh.economy.money,
          day: fresh.time.day,
          lastPlayed: Date.now()
        });
        persistNewSlot(slotId, createSaveData(fresh), idx);

        state = fresh;
        activeSlotId = slotId;
        Game.Signals?.emit('save:success', { slotId, version: SAVE_VERSION });
        return slotId;
      } catch (error) {
        console.error('Create save failed:', error);
        Game.Signals?.emit('save:error', { operation: 'create', error });
        return false;
      }
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

    deleteAllSaves: function() {
      try {
        const slots = getIndex();
        for (const slot of slots) {
          if (slot?.id) localStorage.removeItem(slot.id);
        }
        localStorage.removeItem(SAVE_INDEX_KEY);
        localStorage.removeItem('simlife_save');
        activeSlotId = null;
        state = createNewState();
        Game.Signals?.emit('save:reset', { count: slots.length });
        return true;
      } catch (error) {
        console.error('Failed to reset save data:', error);
        Game.Signals?.emit('save:error', { operation: 'reset', error });
        return false;
      }
    },

    hasSave: function() {
      migrateLegacySaveIfNeeded();
      return getIndex().length > 0;
    },

    getActiveSlotId: function() { return activeSlotId; },

    exportToFile: function(slotId) {
      try {
        const targetSlot = slotId || activeSlotId;
        if (!targetSlot) return false;
        if (targetSlot === activeSlotId && !this.save()) return false;

        const rawSave = localStorage.getItem(targetSlot);
        if (!rawSave) return false;
        const saveData = JSON.parse(rawSave);
        if (!isPlainObject(saveData)) return false;

        const meta = getIndex().find(s => s.id === targetSlot);
        const exportObject = { metadata: meta || { id: targetSlot, name: 'World' }, state: saveData };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObject));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute('href', dataStr);
        downloadAnchorNode.setAttribute('download', `simlife_save_${(meta?.name || 'world').replace(/\s+/g, '_')}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        return true;
      } catch (error) {
        console.error('Failed to export save:', error);
        return false;
      }
    },

    importFromFile: function(fileContent) {
      try {
        if (typeof fileContent !== 'string' || fileContent.length > SAVE_LIMITS.serializedCharacters) {
          throw new TypeError('Save file is too large');
        }
        const importObject = JSON.parse(fileContent);
        if (!isPlainObject(importObject) || !isPlainObject(importObject.metadata) || !isPlainObject(importObject.state)) {
            console.error('Invalid save file format.');
            return false;
        }

        const candidate = prepareLoadCandidate(importObject.state);
        const saveData = createSaveData(candidate);
        
        let idx = getIndex();
        // Generate a new slot ID to avoid collisions
        const newSlotId = createSlotId();
        const metadata = normalizeSaveMetadata({
          ...importObject.metadata,
          id: newSlotId,
          characterName: candidate.character.name,
          money: candidate.economy.money,
          day: candidate.time.day,
          lastPlayed: Date.now(),
        });
        
        idx.push(metadata);
        persistNewSlot(newSlotId, saveData, idx);
        Game.Signals?.emit('save:imported', { slotId: newSlotId, metadata });
        return true;
      } catch (e) {
        console.error('Failed to import save:', e);
        Game.Signals?.emit('save:error', { operation: 'import', error: e });
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
      if (UNSAFE_OBJECT_KEYS.has(key)) throw new TypeError(`Unsafe save key: ${key}`);
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
})();
