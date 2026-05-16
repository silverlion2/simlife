// ============================================================
// SimLife - Household Goals
// ============================================================
window.Game = window.Game || {};

Game.HomeGoals = (function() {
  const ACTIVE_GOAL_COUNT = 3;

  const GOAL_TEMPLATES = [
    {
      key: 'build_dining_room',
      title: 'Host Family Dinners',
      desc: 'Build a Dining Room.',
      rewardMoney: 250,
      rewardObjects: ['dining_table'],
      isComplete: state => hasRoom(state, 'dining'),
      isEligible: state => isRoomUnlocked('dining') && !hasRoom(state, 'dining'),
    },
    {
      key: 'decorate_with_storage',
      title: 'Decorate From Storage',
      desc: 'Collect at least 2 stored objects.',
      rewardMoney: 120,
      rewardObjects: ['plant'],
      isComplete: state => getStoredCount(state) >= 2,
      isEligible: state => getStoredCount(state) < 2,
    },
    {
      key: 'build_second_story',
      title: 'Reach Higher',
      desc: 'Add a second floor.',
      rewardMoney: 400,
      rewardObjects: ['rug'],
      isComplete: state => getHouse(state).unlockedFloors >= 2,
      isEligible: state => getHouse(state).unlockedFloors < 2 && getHomeLevel(state) >= 2,
    },
    {
      key: 'prepare_nursery',
      title: 'Prepare The Nursery',
      desc: 'Build a nursery and place a crib.',
      rewardMoney: 300,
      rewardObjects: ['changing_table'],
      isComplete: () => Game.Family && Game.Family.hasNurseryWithCrib && Game.Family.hasNurseryWithCrib(),
      isEligible: state => getHomeLevel(state) >= 2 && !(Game.Family && Game.Family.hasNurseryWithCrib && Game.Family.hasNurseryWithCrib()),
    },
    {
      key: 'grow_household',
      title: 'Grow The Household',
      desc: 'Welcome a child into the family.',
      rewardMoney: 500,
      rewardObjects: ['toy_chest'],
      isComplete: state => hasFamilyChild(state),
      isEligible: state => !hasFamilyChild(state),
    },
    {
      key: 'collect_five_objects',
      title: 'Curate A Collection',
      desc: 'Own 5 stored or placed collected objects.',
      rewardMoney: 350,
      rewardObjects: ['aquarium'],
      isComplete: state => getCollectedObjectCount(state) >= 5,
      isEligible: state => getCollectedObjectCount(state) < 5,
    },
    {
      key: 'build_workshop',
      title: 'Make Space To Craft',
      desc: 'Build a Workshop.',
      rewardMoney: 300,
      rewardObjects: ['workbench'],
      isComplete: state => hasRoom(state, 'workshop'),
      isEligible: state => isRoomUnlocked('workshop') && !hasRoom(state, 'workshop'),
    },
    {
      key: 'build_library',
      title: 'Open A Reading Room',
      desc: 'Build a Library.',
      rewardMoney: 300,
      rewardObjects: ['globe'],
      isComplete: state => hasRoom(state, 'library'),
      isEligible: state => isRoomUnlocked('library') && !hasRoom(state, 'library'),
    },
  ];

  function getState(targetState) {
    return targetState || Game.State.get();
  }

  function ensureState(targetState) {
    const state = getState(targetState);
    if (Game.HomeGrowth && Game.HomeGrowth.ensureState) Game.HomeGrowth.ensureState(state);
    if (!state.homeGoals) {
      state.homeGoals = { active: [], completed: [], nextGoalId: 1, generatedDay: null };
    }
    if (!Array.isArray(state.homeGoals.active)) state.homeGoals.active = [];
    if (!Array.isArray(state.homeGoals.completed)) state.homeGoals.completed = [];
    if (!Number.isInteger(state.homeGoals.nextGoalId) || state.homeGoals.nextGoalId < 1) {
      state.homeGoals.nextGoalId = nextGoalId(state.homeGoals.active);
    }
    refillGoals(state);
    return state.homeGoals;
  }

  function getActiveGoals() {
    const state = Game.State.get();
    ensureState(state);
    return state.homeGoals.active.map(goal => withProgress(state, goal));
  }

  function refresh() {
    const state = Game.State.get();
    ensureState(state);
    return getActiveGoals();
  }

  function claimGoal(goalId) {
    const state = Game.State.get();
    const goals = ensureState(state);
    const index = goals.active.findIndex(goal => goal.id === goalId);
    if (index === -1) return { success: false, reason: 'Goal is no longer active.' };

    const goal = goals.active[index];
    const template = getTemplate(goal.key);
    if (!template) return { success: false, reason: 'Goal template is missing.' };
    if (!template.isComplete(state)) return { success: false, reason: 'Goal is not complete yet.' };

    if (Game.Economy && template.rewardMoney) Game.Economy.addMoney(template.rewardMoney);
    const rewardObjects = [];
    for (const type of template.rewardObjects || []) {
      if (Game.HomeGrowth && Game.HomeGrowth.addInventoryObject) {
        const object = Game.HomeGrowth.addInventoryObject(type, `goal_${template.key}`);
        if (object) rewardObjects.push(object);
      }
    }

    goals.active.splice(index, 1);
    if (!goals.completed.includes(template.key)) goals.completed.push(template.key);
    refillGoals(state);

    if (state.stats) state.stats.homeGoalsCompleted = (state.stats.homeGoalsCompleted || 0) + 1;
    if (Game.UI && Game.UI.showNotification) {
      Game.UI.showNotification(`${template.title} complete. Rewards delivered.`);
    }
    return {
      success: true,
      goal: withProgress(state, goal),
      rewardMoney: template.rewardMoney || 0,
      rewardObjects,
    };
  }

  function refillGoals(state) {
    const goals = state.homeGoals;
    const activeKeys = new Set(goals.active.map(goal => goal.key));
    for (const template of GOAL_TEMPLATES) {
      if (goals.active.length >= ACTIVE_GOAL_COUNT) break;
      if (activeKeys.has(template.key)) continue;
      if (goals.completed.includes(template.key)) continue;
      if (template.isEligible && !template.isEligible(state)) continue;
      goals.active.push({
        id: `goal_${goals.nextGoalId++}`,
        key: template.key,
        createdDay: state.time ? state.time.day : 1,
      });
      activeKeys.add(template.key);
    }
  }

  function withProgress(state, goal) {
    const template = getTemplate(goal.key);
    if (!template) return { ...goal, title: goal.key, desc: '', complete: false, rewardMoney: 0, rewardObjects: [] };
    return {
      ...goal,
      title: template.title,
      desc: template.desc,
      complete: template.isComplete(state),
      rewardMoney: template.rewardMoney || 0,
      rewardObjects: (template.rewardObjects || []).slice(),
    };
  }

  function getTemplate(key) {
    return GOAL_TEMPLATES.find(template => template.key === key);
  }

  function nextGoalId(activeGoals) {
    let next = 1;
    for (const goal of activeGoals || []) {
      const parsed = Number.parseInt(String(goal.id || '').replace('goal_', ''), 10);
      if (Number.isInteger(parsed)) next = Math.max(next, parsed + 1);
    }
    return next;
  }

  function getHouse(state) {
    return state.maps && state.maps.house ? state.maps.house : Game.State.getActiveMap();
  }

  function getHomeLevel(state) {
    if (Game.HomeGrowth && Game.HomeGrowth.ensureState) return Game.HomeGrowth.ensureState(state).level;
    return state.homeGrowth && state.homeGrowth.level ? state.homeGrowth.level : 1;
  }

  function isRoomUnlocked(roomType) {
    return !Game.HomeGrowth || !Game.HomeGrowth.isRoomUnlocked || Game.HomeGrowth.isRoomUnlocked(roomType);
  }

  function hasRoom(state, roomType) {
    return (getHouse(state).rooms || []).some(room => room.type === roomType);
  }

  function getStoredCount(state) {
    return state.inventory && Array.isArray(state.inventory.objects) ? state.inventory.objects.length : 0;
  }

  function getCollectedObjectCount(state) {
    const house = getHouse(state);
    const placed = (house.furniture || []).filter(item => item.sourceObjectId).length;
    return getStoredCount(state) + placed;
  }

  function hasFamilyChild(state) {
    return !!(state.family && Array.isArray(state.family.members) && state.family.members.some(member => member.role === 'child'));
  }

  return {
    GOAL_TEMPLATES,
    ensureState,
    refresh,
    getActiveGoals,
    claimGoal,
  };
})();
