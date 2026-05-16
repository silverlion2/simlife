// ============================================================
// SimLife - Family And Household Growth
// ============================================================
window.Game = window.Game || {};

Game.Family = (function() {
  const CHILD_NAMES = ['Luna', 'Kai', 'Mina', 'Noah', 'Ivy', 'Leo', 'Anya', 'Eli'];
  const CARE_ACTIONS = {
    feed: { label: 'Feed', need: 'hunger', amount: 38, playerNeed: 'social', playerAmount: 4 },
    clean: { label: 'Clean Up', need: 'hygiene', amount: 30, playerNeed: 'comfort', playerAmount: -2 },
    play: { label: 'Play', need: 'fun', amount: 30, playerNeed: 'social', playerAmount: 6 },
    comfort: { label: 'Comfort', need: 'social', amount: 28, playerNeed: 'social', playerAmount: 5 },
    rest: { label: 'Settle Down', need: 'energy', amount: 22, playerNeed: 'energy', playerAmount: -3 },
  };
  const HOUSEHOLD_ROUTINES = {
    home_care: {
      label: 'Home Care',
      desc: 'Keeps household needs steadier.',
      roles: ['spouse', 'child'],
      lifeStages: ['adult', 'teen'],
      minutesPerCompletion: 720,
      reward: 'care',
    },
    collect_objects: {
      label: 'Find Objects',
      desc: 'Looks for usable objects to bring home.',
      roles: ['spouse', 'child'],
      lifeStages: ['adult', 'teen'],
      minutesPerCompletion: 1440,
      reward: 'object',
      objectPool: ['plant', 'lamp', 'rug', 'painting', 'bookshelf', 'dining_chairs'],
    },
    homework: {
      label: 'Homework',
      desc: 'Builds education and can unlock study objects.',
      roles: ['child'],
      lifeStages: ['child', 'teen'],
      minutesPerCompletion: 720,
      reward: 'education',
    },
    side_income: {
      label: 'Side Gig',
      desc: 'Earns money for renovations.',
      roles: ['spouse', 'child'],
      lifeStages: ['adult', 'teen'],
      minutesPerCompletion: 1440,
      reward: 'money',
      money: 125,
    },
  };

  function ensureState(targetState) {
    const state = targetState || Game.State.get();
    if (!state.family) {
      state.family = { members: [], nextMemberId: 1 };
    }
    if (!Array.isArray(state.family.members)) state.family.members = [];
    if (!Number.isInteger(state.family.nextMemberId) || state.family.nextMemberId < 1) {
      state.family.nextMemberId = nextMemberId(state.family.members);
    }
    if (!state.family.members.some(member => member.role === 'self')) {
      state.family.members.unshift({
        id: 'player',
        name: state.character && state.character.name ? state.character.name : 'Player',
        role: 'self',
        lifeStage: state.character && state.character.lifeStage ? state.character.lifeStage : 'young_adult',
        dayJoined: state.time ? state.time.day : 1,
      });
    } else {
      const self = state.family.members.find(member => member.role === 'self');
      if (state.character && state.character.name) self.name = state.character.name;
    }
    syncSpouse(state);
    return state.family;
  }

  function nextMemberId(members) {
    let next = 1;
    for (const member of members || []) {
      const id = String(member.id || '');
      if (!id.startsWith('child_')) continue;
      const parsed = Number.parseInt(id.slice('child_'.length), 10);
      if (Number.isInteger(parsed)) next = Math.max(next, parsed + 1);
    }
    return next;
  }

  function canStartFamily() {
    const state = Game.State.get();
    ensureState(state);
    if (!state.social || !state.social.married || !state.character.spouse) {
      return { allowed: false, reason: 'Get married first.' };
    }
    if (!hasNurseryWithCrib()) {
      return { allowed: false, reason: 'Build a nursery and place a crib.' };
    }
    return { allowed: true, reason: '' };
  }

  function hasNurseryWithCrib() {
    const house = Game.State.get().maps.house;
    if (!house) return false;
    const nurseryIds = (house.rooms || [])
      .filter(room => room.type === 'nursery')
      .map(room => room.id);
    if (!nurseryIds.length) return false;
    return (house.furniture || []).some(furniture =>
      furniture.type === 'crib' && nurseryIds.includes(furniture.roomId)
    );
  }

  function tryForChild(name) {
    const check = canStartFamily();
    if (!check.allowed) return { success: false, reason: check.reason };

    const state = Game.State.get();
    const family = ensureState(state);
    const childName = (name && String(name).trim()) || randomChildName(family.members.length);
    const child = {
      id: `child_${family.nextMemberId++}`,
      name: childName,
      role: 'child',
      lifeStage: 'baby',
      dayJoined: state.time ? state.time.day : 1,
      needs: { hunger: 80, energy: 80, hygiene: 80, fun: 70, social: 80 },
    };
    family.members.push(child);
    if (state.stats) state.stats.childrenRaised = (state.stats.childrenRaised || 0) + 1;
    if (Game.UI && Game.UI.showNotification) Game.UI.showNotification(`${child.name} joined the family.`);
    return { success: true, child };
  }

  function syncSpouse(state) {
    if (!state.social || !state.social.married || !state.character || !state.character.spouse) return;
    const spouseId = state.character.spouse;
    let spouse = state.family.members.find(member => member.role === 'spouse');
    const spouseName = Game.Social && Game.Social.getNpcName ? Game.Social.getNpcName(spouseId) : spouseId;
    if (!spouse) {
      spouse = {
        id: `spouse_${spouseId}`,
        npcId: spouseId,
        name: spouseName,
        role: 'spouse',
        lifeStage: 'adult',
        dayJoined: state.time ? state.time.day : 1,
        needs: { hunger: 80, energy: 80, hygiene: 80, fun: 75, social: 80 },
      };
      state.family.members.push(spouse);
    } else {
      spouse.npcId = spouseId;
      spouse.name = spouseName;
    }
  }

  function update(minutes) {
    const state = Game.State.get();
    const family = ensureState(state);
    const elapsedMinutes = Math.max(0, Number(minutes) || 0);
    const elapsedDays = elapsedMinutes / 1440;
    for (const member of family.members) {
      if (member.role === 'self') continue;
      if (!member.needs) {
        member.needs = { hunger: 80, energy: 80, hygiene: 80, fun: 75, social: 80 };
      }
      decayNeeds(member, elapsedMinutes);
      if (member.role === 'child') updateChildAge(member, state, elapsedDays);
      advanceRoutine(member, state, elapsedMinutes);
    }
  }

  function decayNeeds(member, minutes) {
    const hours = minutes / 60;
    const decay = {
      hunger: 2.4,
      energy: 1.8,
      hygiene: 1.3,
      fun: 1.1,
      social: 0.9,
    };
    for (const [need, perHour] of Object.entries(decay)) {
      if (member.needs[need] === undefined) continue;
      member.needs[need] = Math.max(0, Math.min(100, member.needs[need] - perHour * hours));
    }
  }

  function updateChildAge(member, state, elapsedDays) {
    member.ageDays = (member.ageDays || 0) + elapsedDays;
    if (member.lifeStage === 'baby' && member.ageDays >= 3) {
      member.lifeStage = 'child';
      awardStageReward(member, 'child', 'toy_chest', 'family_child_age_up');
      if (Game.UI && Game.UI.showNotification) Game.UI.showNotification(`${member.name} aged up into a child.`);
    } else if (member.lifeStage === 'child' && member.ageDays >= 14) {
      member.lifeStage = 'teen';
      awardStageReward(member, 'teen', 'dresser', 'family_teen_age_up');
      if (Game.UI && Game.UI.showNotification) Game.UI.showNotification(`${member.name} is now a teen.`);
    }
    if (state.stats) state.stats.familyDays = (state.stats.familyDays || 0) + elapsedDays;
  }

  function getCareActions(memberId) {
    const member = findCareMember(memberId);
    if (!member) return [];
    return Object.entries(CARE_ACTIONS).map(([key, action]) => ({
      key,
      label: action.label,
      need: action.need,
      amount: action.amount,
      current: member.needs && Number.isFinite(member.needs[action.need]) ? Math.round(member.needs[action.need]) : null,
    }));
  }

  function performCare(memberId, actionKey) {
    const state = Game.State.get();
    ensureState(state);
    const member = findCareMember(memberId);
    const action = CARE_ACTIONS[actionKey];
    if (!member) return { success: false, reason: 'Family member not found.' };
    if (!action) return { success: false, reason: 'Care action not found.' };
    if (!member.needs) member.needs = { hunger: 80, energy: 80, hygiene: 80, fun: 75, social: 80 };

    member.needs[action.need] = clamp((member.needs[action.need] || 0) + action.amount, 0, 100);
    if (state.character && state.character.needs && action.playerNeed) {
      state.character.needs[action.playerNeed] = clamp((state.character.needs[action.playerNeed] || 0) + action.playerAmount, 0, 100);
    }
    if (state.stats) state.stats.familyCareActions = (state.stats.familyCareActions || 0) + 1;
    if (Game.UI && Game.UI.showNotification) Game.UI.showNotification(`${action.label} helped ${member.name}.`);
    return { success: true, member, action: { key: actionKey, ...action } };
  }

  function findCareMember(memberId) {
    const family = ensureState();
    return family.members.find(member => member.id === memberId && member.role !== 'self');
  }

  function getAssignments(memberId) {
    const state = Game.State.get();
    ensureState(state);
    const member = findCareMember(memberId);
    if (!member) return [];
    return Object.entries(HOUSEHOLD_ROUTINES).map(([key, routine]) => {
      const availability = getRoutineAvailability(member, routine, state);
      const active = !!(member.assignment && member.assignment.key === key);
      return {
        key,
        label: routine.label,
        desc: routine.desc,
        available: availability.available,
        reason: availability.reason,
        active,
        progress: active ? Math.round(member.assignment.progressMinutes || 0) : 0,
        required: routine.minutesPerCompletion,
        completions: active ? (member.assignment.completions || 0) : 0,
      };
    });
  }

  function assignRoutine(memberId, routineKey) {
    const state = Game.State.get();
    ensureState(state);
    const member = findCareMember(memberId);
    if (!member) return { success: false, reason: 'Family member not found.' };
    if (routineKey === 'none') {
      delete member.assignment;
      return { success: true, member, routine: null };
    }
    const routine = HOUSEHOLD_ROUTINES[routineKey];
    if (!routine) return { success: false, reason: 'Household routine not found.' };
    const availability = getRoutineAvailability(member, routine, state);
    if (!availability.available) return { success: false, reason: availability.reason };

    const previous = member.assignment && member.assignment.key === routineKey ? member.assignment : {};
    member.assignment = {
      key: routineKey,
      progressMinutes: previous.progressMinutes || 0,
      completions: previous.completions || 0,
      assignedDay: state.time ? state.time.day : 1,
    };
    if (Game.UI && Game.UI.showNotification) Game.UI.showNotification(`${member.name} started ${routine.label}.`);
    return { success: true, member, routine: { key: routineKey, ...routine } };
  }

  function getRoutineAvailability(member, routine, state) {
    if (!member || member.role === 'self') return { available: false, reason: 'Choose a household member.' };
    if (routine.roles && !routine.roles.includes(member.role)) {
      return { available: false, reason: 'Not for this family role.' };
    }
    if (routine.lifeStages && !routine.lifeStages.includes(member.lifeStage)) {
      return { available: false, reason: 'Needs a different life stage.' };
    }
    if (routine.reward === 'object' && !Game.HomeGrowth) {
      return { available: false, reason: 'Object storage is not ready.' };
    }
    if (routine.reward === 'money' && (!state.economy || !Number.isFinite(state.economy.money))) {
      return { available: false, reason: 'Household money is not ready.' };
    }
    return { available: true, reason: '' };
  }

  function advanceRoutine(member, state, elapsedMinutes) {
    if (!member.assignment || !member.assignment.key || elapsedMinutes <= 0) return;
    const routine = HOUSEHOLD_ROUTINES[member.assignment.key];
    if (!routine) {
      delete member.assignment;
      return;
    }
    const availability = getRoutineAvailability(member, routine, state);
    if (!availability.available) return;

    member.assignment.progressMinutes = (member.assignment.progressMinutes || 0) + elapsedMinutes;
    while (member.assignment.progressMinutes >= routine.minutesPerCompletion) {
      member.assignment.progressMinutes -= routine.minutesPerCompletion;
      member.assignment.completions = (member.assignment.completions || 0) + 1;
      applyRoutineReward(member, routine, state);
      if (state.stats) state.stats.familyRoutineCompletions = (state.stats.familyRoutineCompletions || 0) + 1;
    }
  }

  function applyRoutineReward(member, routine, state) {
    if (routine.reward === 'care') {
      const family = ensureState(state);
      for (const target of family.members) {
        if (!target.needs) continue;
        target.needs.hunger = clamp((target.needs.hunger || 0) + 8, 0, 100);
        target.needs.hygiene = clamp((target.needs.hygiene || 0) + 10, 0, 100);
        target.needs.social = clamp((target.needs.social || 0) + 6, 0, 100);
      }
      return;
    }
    if (routine.reward === 'object' && Game.HomeGrowth && Game.HomeGrowth.addInventoryObject) {
      const pool = routine.objectPool || ['plant'];
      const indexSeed = (state.time ? state.time.day : 1) + (member.assignment ? member.assignment.completions || 0 : 0) + String(member.id).length;
      const type = pool[indexSeed % pool.length];
      Game.HomeGrowth.addInventoryObject(type, 'family_collect_objects', {
        familyMemberId: member.id,
        routine: 'collect_objects',
      });
      return;
    }
    if (routine.reward === 'education') {
      member.education = (member.education || 0) + 1;
      if (member.education >= 3) awardRoutineRewardOnce(member, 'education_shelf', 'study_shelf', 'family_homework');
      return;
    }
    if (routine.reward === 'money' && state.economy) {
      const stageBonus = member.lifeStage === 'adult' ? 1 : 0.55;
      const earned = Math.round((routine.money || 0) * stageBonus);
      state.economy.money += earned;
      state.economy.totalEarned = (state.economy.totalEarned || 0) + earned;
      member.sideIncomeEarned = (member.sideIncomeEarned || 0) + earned;
    }
  }

  function awardRoutineRewardOnce(member, rewardKey, furnitureType, source) {
    if (!member.routineRewards) member.routineRewards = [];
    if (member.routineRewards.includes(rewardKey)) return;
    member.routineRewards.push(rewardKey);
    if (Game.HomeGrowth && Game.HomeGrowth.addInventoryObject) {
      Game.HomeGrowth.addInventoryObject(furnitureType, source, {
        familyMemberId: member.id,
      });
    }
  }

  function awardStageReward(member, stage, furnitureType, source) {
    if (!member.stageRewards) member.stageRewards = [];
    if (member.stageRewards.includes(stage)) return;
    member.stageRewards.push(stage);
    if (Game.HomeGrowth && Game.HomeGrowth.addInventoryObject) {
      Game.HomeGrowth.addInventoryObject(furnitureType, source, {
        familyMemberId: member.id,
      });
    }
  }

  function getRenderableMembers() {
    const state = Game.State.get();
    const family = ensureState(state);
    const basePosition = state.character && state.character.position ? state.character.position : { x: 3, y: 3 };
    const floor = state.character && Number.isInteger(state.character.floor) ? state.character.floor : 0;
    const renderables = family.members
      .filter(member => member.role !== 'self')
      .map((member, index) => ({
        id: member.id,
        name: member.name,
        role: member.role,
        lifeStage: member.lifeStage,
        icon: iconFor(member),
        floor,
        position: {
          x: basePosition.x + 0.65 + (index % 2) * 0.85,
          y: basePosition.y + 0.65 + Math.floor(index / 2) * 0.85,
          floor,
          z: basePosition.z || 0,
        },
      }));
    return renderables;
  }

  function iconFor(member) {
    if (member.role === 'spouse') return '♡';
    if (member.lifeStage === 'baby') return 'B';
    if (member.lifeStage === 'child') return 'C';
    if (member.lifeStage === 'teen') return 'T';
    return 'F';
  }

  function randomChildName(offset) {
    return CHILD_NAMES[offset % CHILD_NAMES.length];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getMembers() {
    return ensureState().members.slice();
  }

  return {
    ensureState,
    canStartFamily,
    tryForChild,
    update,
    getCareActions,
    performCare,
    getAssignments,
    assignRoutine,
    getMembers,
    getRenderableMembers,
    hasNurseryWithCrib,
  };
})();
