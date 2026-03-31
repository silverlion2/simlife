// ============================================================
// SimLife — Character System (Needs, Mood, Skills, Activities)
// ============================================================
window.Game = window.Game || {};

Game.Character = (function() {
  const cfg = Game.Config;

  function getState() { return Game.State.get().character; }

  // ---- Need Decay ----
  function updateNeeds(deltaMinutes) {
    const char = getState();
    const deltaHours = deltaMinutes / 60;
    const prestigeDecay = getPrestigeNeedDecay();

    for (const [key, needCfg] of Object.entries(cfg.NEEDS)) {
      if (char.currentActivity && char.currentActivity.type === 'sleep' && key === 'energy') continue;
      const decay = needCfg.decayPerHour * deltaHours * (1 + prestigeDecay);
      char.needs[key] = Math.max(0, char.needs[key] - decay);
    }

    // Comfort is influenced by room furniture quality
    const comfortBonus = calculateComfortBonus();
    char.needs.comfort = Math.min(100, char.needs.comfort + comfortBonus * deltaHours * 0.1);

    // Update moodlet timers
    updateMoodlets(deltaMinutes);
  }

  function getPrestigeNeedDecay() {
    const ups = Game.State.get().prestige.upgrades;
    return (ups.good_genes || 0) * -0.10;
  }

  function calculateComfortBonus() {
    const house = Game.State.get().house;
    let totalComfort = 0;
    for (const furn of house.furniture) {
      if (isFurnitureBroken(furn.id)) continue; // Broken furniture gives no comfort
      const furnCfg = cfg.FURNITURE[furn.type];
      if (furnCfg) totalComfort += furnCfg.comfort;
    }
    return Math.min(totalComfort, 30);
  }

  // ---- Moodlet System ----
  function addMoodlet(moodletDef) {
    const char = getState();
    // Remove existing moodlet with same name (refresh it)
    char.moodlets = char.moodlets.filter(m => m.name !== moodletDef.name);
    char.moodlets.push({
      name: moodletDef.name,
      value: moodletDef.value,
      icon: moodletDef.icon,
      remaining: moodletDef.duration, // in game minutes
      duration: moodletDef.duration,
    });
    // Cap at 8 active moodlets
    if (char.moodlets.length > 8) char.moodlets.shift();
  }

  function updateMoodlets(deltaMinutes) {
    const char = getState();
    char.moodlets = char.moodlets.filter(m => {
      m.remaining -= deltaMinutes;
      return m.remaining > 0;
    });
  }

  function getMoodletsBonus() {
    const char = getState();
    let sum = 0;
    for (const m of char.moodlets) {
      sum += m.value;
    }
    return sum;
  }

  // ---- Mood Calculation ----
  function getMood() {
    const char = getState();
    const needs = char.needs;
    const weights = { hunger: 0.18, energy: 0.22, hygiene: 0.13, fun: 0.15, social: 0.12, comfort: 0.12 };
    let weightedSum = 0;
    for (const [key, weight] of Object.entries(weights)) {
      weightedSum += (needs[key] || 0) * weight;
    }
    // Add moodlet bonus (each point ~= 1% mood, capped)
    const moodletBonus = getMoodletsBonus();
    weightedSum += moodletBonus;
    // Remaining 8% weight reserved for moodlets headroom
    return Math.round(Math.max(0, Math.min(100, weightedSum)));
  }

  function getMoodInfo() {
    const mood = getMood();
    for (const m of cfg.MOODS) {
      if (mood >= m.min) return { ...m, value: mood };
    }
    return { ...cfg.MOODS[cfg.MOODS.length - 1], value: mood };
  }

  // ---- Skill Training ----
  function addSkillXp(skillKey, amount) {
    const char = getState();
    const skillCfg = cfg.SKILLS[skillKey];
    if (!skillCfg || char.skills[skillKey] >= skillCfg.maxLevel) return;

    const moodInfo = getMoodInfo();
    const prestigeBonus = (Game.State.get().prestige.upgrades.family_wisdom || 0) * 0.15;
    let totalMultiplier = moodInfo.skillBonus * (1 + prestigeBonus);

    // Trait-based XP bonuses
    const traitCfg = cfg.TRAITS[char.trait];
    if (traitCfg && traitCfg.effects) {
      const e = traitCfg.effects;
      if (skillKey === 'cooking' && e.cookingXP) totalMultiplier *= e.cookingXP;
      if (skillKey === 'fitness' && e.fitnessXP) totalMultiplier *= e.fitnessXP;
      if (skillKey === 'creativity' && e.creativityXP) totalMultiplier *= e.creativityXP;
      if (skillKey === 'logic' && e.logicXP) totalMultiplier *= e.logicXP;
      if (skillKey === 'tech' && e.techXP) totalMultiplier *= e.techXP;
    }

    char.skillXp[skillKey] += amount * totalMultiplier;

    while (char.skillXp[skillKey] >= skillCfg.xpPerLevel && char.skills[skillKey] < skillCfg.maxLevel) {
      char.skillXp[skillKey] -= skillCfg.xpPerLevel;
      char.skills[skillKey]++;
      Game.UI && Game.UI.showNotification(`⭐ ${skillCfg.label} leveled up to ${char.skills[skillKey]}!`);
    }
  }

  function getSkillLevel(skillKey) {
    return getState().skills[skillKey] || 0;
  }

  // ---- Action Queue ----
  function queueActivity(activityKey) {
    const char = getState();
    if (char.actionQueue.length >= 6) return false;
    if (!isAvailableActivity(activityKey)) return false;
    char.actionQueue.push(activityKey);
    return true;
  }

  function processQueue() {
    const char = getState();
    if (char.currentActivity) return; // Still doing something
    if (char.actionQueue.length === 0) return false;
    const next = char.actionQueue.shift();
    return startActivity(next, true); // true = from queue
  }

  function clearQueue() {
    getState().actionQueue = [];
  }

  // ---- Activity System ----
  function startActivity(activityKey, fromQueue) {
    const char = getState();
    const actCfg = cfg.ACTIVITIES[activityKey];
    if (!actCfg) return false;

    // Check if we have the room
    if (actCfg.room) {
      const house = Game.State.get().house;
      const hasRoom = house.rooms.some(r => r.type === actCfg.room);
      if (!hasRoom) return false;

      // Check furniture if needed
      if (actCfg.furniture) {
        const hasFurn = house.furniture.some(f => f.type.includes(actCfg.furniture));
        if (!hasFurn) return false;
      }
    }

    // Check energy cost
    if (actCfg.energyCost && char.needs.energy < actCfg.energyCost) return false;

    char.currentActivity = {
      type: activityKey,
      startTime: Game.State.get().time.totalMinutes,
      duration: actCfg.duration,
      elapsed: 0,
      isAutonomous: !fromQueue && char.autonomy?.thought === activityKey,
    };
    char.activityProgress = 0;

    // Move to room
    if (actCfg.room) {
      const room = Game.State.get().house.rooms.find(r => r.type === actCfg.room);
      if (room) {
        // Find the specific furniture if activity requires it
        if (actCfg.furniture) {
          const furn = Game.State.get().house.furniture.find(f => f.type.includes(actCfg.furniture));
          if (furn) {
            char.targetPosition = { x: furn.x + 0.5, y: furn.y + 0.5 };
          } else {
            char.targetPosition = { x: room.x + 1, y: room.y + 1 };
          }
        } else {
          char.targetPosition = { x: room.x + 1, y: room.y + 1 };
        }
      }
    }
    return true;
  }

  function updateActivity(deltaMinutes) {
    const char = getState();
    if (!char.currentActivity) {
      // Try to process queue
      processQueue();
      return;
    }

    const act = char.currentActivity;
    const actCfg = cfg.ACTIVITIES[act.type];
    if (!actCfg) { char.currentActivity = null; return; }

    act.elapsed += deltaMinutes;
    char.activityProgress = Math.min(1, act.elapsed / act.duration);

    // Activity complete
    if (act.elapsed >= act.duration) {
      completeActivity(act.type, actCfg);
      char.currentActivity = null;
      char.activityProgress = 0;
    }
  }

  function completeActivity(type, actCfg) {
    const char = getState();

    // Apply need bonuses
    if (actCfg.needs) {
      for (const [need, value] of Object.entries(actCfg.needs)) {
        if (char.needs[need] !== undefined) {
          char.needs[need] = Math.min(100, Math.max(0, char.needs[need] + value));
        }
      }
    }

    // Apply energy cost
    if (actCfg.energyCost) {
      char.needs.energy = Math.max(0, char.needs.energy - actCfg.energyCost);
    }

    // Apply skill XP
    if (actCfg.skill && actCfg.xp) {
      addSkillXp(actCfg.skill, actCfg.xp);
    }

    // Apply moodlet
    if (actCfg.moodlet) {
      addMoodlet(actCfg.moodlet);
    }

    // Stats tracking
    if (type === 'cook') {
      Game.State.get().stats.mealsCooked++;
    }

    // Furniture breakage roll
    if (actCfg.furniture) {
      const house = Game.State.get().house;
      const usedFurn = house.furniture.find(f => f.type.includes(actCfg.furniture) && !isFurnitureBroken(f.id));
      if (usedFurn) {
        const fc = cfg.FURNITURE[usedFurn.type];
        if (fc && fc.breakChance) {
          let chance = fc.breakChance;
          // Trait modifier
          const traitCfg = cfg.TRAITS[char.trait];
          if (traitCfg && traitCfg.effects && traitCfg.effects.breakMult) {
            chance *= traitCfg.effects.breakMult;
          }
          // Higher handiness reduces break chance
          chance *= Math.max(0.2, 1 - char.skills.handiness * 0.08);
          if (Math.random() < chance) {
            breakFurniture(usedFurn.id);
            Game.UI && Game.UI.showNotification(`⚠️ ${fc.label} broke down! Use Repair to fix it.`);
          }
        }
      }
    }

    Game.UI && Game.UI.showNotification(`✅ ${actCfg.label} complete!`);
  }

  function cancelActivity() {
    const char = getState();
    char.currentActivity = null;
    char.activityProgress = 0;
  }

  function isAvailableActivity(activityKey) {
    const actCfg = cfg.ACTIVITIES[activityKey];
    if (!actCfg) return false;
    const house = Game.State.get().house;

    if (actCfg.room) {
      if (!house.rooms.some(r => r.type === actCfg.room)) return false;
      if (actCfg.furniture) {
        // Check for non-broken furniture
        if (!house.furniture.some(f => f.type.includes(actCfg.furniture) && !isFurnitureBroken(f.id))) return false;
      }
    }
    if (actCfg.energyCost) {
      if (getState().needs.energy < actCfg.energyCost) return false;
    }
    return true;
  }

  function getAvailableActivities() {
    return Object.entries(cfg.ACTIVITIES)
      .filter(([key]) => isAvailableActivity(key))
      .map(([key, act]) => ({ key, ...act }));
  }

  // ---- Life Stage ----
  function getLifeStage(day) {
    if (day <= cfg.TIME.YOUNG_ADULT_DAYS) return 'young_adult';
    if (day <= cfg.TIME.ADULT_DAYS) return 'adult';
    if (day <= cfg.TIME.ELDER_DAYS) return 'elder';
    return 'legacy';
  }

  function getLifeStageLabel(stage) {
    const labels = { young_adult: 'Young Adult', adult: 'Adult', elder: 'Elder', legacy: 'Legacy' };
    return labels[stage] || stage;
  }

  // ---- Position ----
  function updatePosition(delta) {
    const char = getState();
    if (!char.targetPosition) return;

    const dx = char.targetPosition.x - char.position.x;
    const dy = char.targetPosition.y - char.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      char.position.x = char.targetPosition.x;
      char.position.y = char.targetPosition.y;
      char.targetPosition = null;
      return;
    }

    const speed = 3 * delta;
    char.position.x += (dx / dist) * Math.min(speed, dist);
    char.position.y += (dy / dist) * Math.min(speed, dist);
  }

  // ---- Furniture Breakage ----
  function isFurnitureBroken(furnId) {
    const house = Game.State.get().house;
    return (house.brokenFurniture || []).includes(furnId);
  }

  function breakFurniture(furnId) {
    const house = Game.State.get().house;
    if (!house.brokenFurniture) house.brokenFurniture = [];
    if (!house.brokenFurniture.includes(furnId)) {
      house.brokenFurniture.push(furnId);
    }
  }

  function repairFurniture(furnId) {
    const house = Game.State.get().house;
    if (!house.brokenFurniture) return false;
    const idx = house.brokenFurniture.indexOf(furnId);
    if (idx === -1) return false;
    house.brokenFurniture.splice(idx, 1);
    return true;
  }

  return {
    updateNeeds,
    getMood,
    getMoodInfo,
    addMoodlet,
    getMoodletsBonus,
    addSkillXp,
    getSkillLevel,
    startActivity,
    updateActivity,
    cancelActivity,
    queueActivity,
    processQueue,
    clearQueue,
    getAvailableActivities,
    isAvailableActivity,
    getLifeStage,
    getLifeStageLabel,
    updatePosition,
    calculateComfortBonus,
    getState,
    isFurnitureBroken,
    breakFurniture,
    repairFurniture,
  };
})();
