// ============================================================
// SimLife — Character System (Needs, Mood, Skills, Activities)
// ============================================================
window.Game = window.Game || {};

Game.Character = (function() {
  const cfg = Game.Config;

  function getState() { return Game.State.get().character; }

  function getTraitEffects() {
    return cfg.TRAITS[getState().trait]?.effects || {};
  }

  function notify(message) {
    if (Game.Signals) Game.Signals.emit('notification', { message });
    else Game.UI?.showNotification?.(message);
  }

  function emitView(eventName, payload) {
    if (Game.Signals) Game.Signals.emit(eventName, payload);
    else if (eventName === 'effect:bubble') Game.Renderer?.spawnFloatingBubble?.(payload.x, payload.y, payload.text, payload.color, payload.icon);
    else if (eventName === 'effect:explosion') Game.Renderer?.spawnExplosion?.(payload.x, payload.y, payload.scale);
  }

  // ---- Need Decay ----
  function updateNeeds(deltaMinutes) {
    const char = getState();
    const deltaHours = deltaMinutes / 60;
    const prestigeDecay = getPrestigeNeedDecay();

    for (const [key, needCfg] of Object.entries(cfg.NEEDS)) {
      if (char.currentActivity && char.currentActivity.type === 'sleep' && key === 'energy') continue;
      const effects = getTraitEffects();
      let traitMultiplier = 1;
      if (key === 'hygiene' && Number.isFinite(effects.hygieneDecay)) traitMultiplier *= 1 + effects.hygieneDecay;
      if (key === 'energy' && Number.isFinite(effects.energyDecay)) traitMultiplier *= effects.energyDecay;
      if (key === 'hunger' && Number.isFinite(effects.hungerDecay)) traitMultiplier *= effects.hungerDecay;
      const decay = needCfg.decayPerHour * deltaHours * (1 + prestigeDecay) * traitMultiplier;
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

  // ---- Comfort Cache (invalidated by furniture changes) ----
  let _comfortCache = null;
  let _comfortDirty = true;
  function invalidateComfortCache() { _comfortDirty = true; }

  function calculateComfortBonus() {
    if (!_comfortDirty && _comfortCache !== null) return _comfortCache;
    const activeMap = Game.State.getActiveMap();
    let totalComfort = 0;
    if (!activeMap) { _comfortCache = 0; _comfortDirty = false; return 0; }
    for (const furn of activeMap.furniture) {
      if (isFurnitureBroken(furn.id)) continue;
      const furnCfg = cfg.FURNITURE[furn.type];
      if (furnCfg) totalComfort += furnCfg.comfort;
    }
    _comfortCache = Math.min(totalComfort, 30);
    _comfortDirty = false;
    return _comfortCache;
  }

  // ---- Moodlet System ----
  function addMoodlet(moodletDef) {
    const char = getState();
    const durationMultiplier = Number(getTraitEffects().moodletDuration) || 1;
    const duration = moodletDef.duration * durationMultiplier;
    // Remove existing moodlet with same name (refresh it)
    char.moodlets = char.moodlets.filter(m => m.name !== moodletDef.name);
    char.moodlets.push({
      name: moodletDef.name,
      value: moodletDef.value,
      icon: moodletDef.icon,
      remaining: duration, // in game minutes
      duration,
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
      notify(`⭐ ${skillCfg.label} leveled up to ${char.skills[skillKey]}!`);
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
    Game.Signals?.emit('activity:queued', { activityKey, queueLength: char.actionQueue.length });
    return true;
  }

  function processQueue() {
    const char = getState();
    if (char.currentActivity) return; // Still doing something
    if (char.actionQueue.length === 0) return false;
    const next = char.actionQueue.shift();
    // Queue stores plain activity key strings, not objects
    if (typeof next === 'string') {
      return startActivity(next, true);
    }
    return startActivity(next.key, true, next.targetFurnId); // true = from queue
  }

  function clearQueue() {
    getState().actionQueue = [];
  }

  // ---- Activity System ----
  function startActivity(activityKey, fromQueue, targetFurnId = null) {
    const char = getState();
    const actCfg = cfg.ACTIVITIES[activityKey];
    if (!actCfg) return false;
    const activeMap = Game.State.getActiveMap();

    // Check energy cost
    const energyCost = getEffectiveEnergyCost(actCfg);
    if (energyCost && char.needs.energy < energyCost) return false;

    // Check money cost
    if (actCfg.cost && !Game.Economy.canAfford(actCfg.cost)) {
        notify(`Not enough money for ${actCfg.label}!`);
        return false;
    }

    char.currentActivity = {
      type: activityKey,
      targetFurnId: targetFurnId,
      startTime: Game.State.get().time.totalMinutes,
      duration: actCfg.duration,
      elapsed: 0,
      isAutonomous: !fromQueue && char.autonomy?.thought === activityKey,
    };
    char.activityProgress = 0;
    Game.Signals?.emit('activity:started', { activityKey, fromQueue: !!fromQueue, targetFurnId });

    // Move to room
    if (actCfg.room) {
      let room = null;
      if (actCfg.room !== '*') room = activeMap.rooms.find(r => r.type === actCfg.room);
      
      if (room || actCfg.room === '*') {
        // Find the specific furniture if activity requires it
        if (actCfg.furniture) {
          let furn = null;
          if (targetFurnId) {
             furn = activeMap.furniture.find(f => f.id === targetFurnId);
          } else {
             furn = activeMap.furniture.find(f => f.type.includes(actCfg.furniture));
          }
          if (furn) {
            char.targetPosition = { x: furn.x + 0.5, y: furn.y + 0.5 };
            char.currentActivity.targetFurnId = furn.id; // Save it if we auto-picked
          } else if (room) {
            char.targetPosition = { x: room.x + 1, y: room.y + 1 };
          }
        } else if (room) {
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

    // Wait until the Sim physically arrives at the furniture before performing the action
    if (char.targetPosition || char.path || char.isPathfinding) {
       return;
    }

    const act = char.currentActivity;
    const actCfg = cfg.ACTIVITIES[act.type];
    if (!actCfg) { char.currentActivity = null; return; }

    act.elapsed += deltaMinutes;
    char.activityProgress = Math.min(1, act.elapsed / act.duration);

    // Activity complete
    if (act.elapsed >= act.duration) {
      completeActivity(act.type, actCfg, act.targetFurnId);
      char.currentActivity = null;
      char.activityProgress = 0;
    }
  }

  function completeActivity(type, actCfg, targetFurnId) {
    const char = getState();

    // Apply need bonuses
    if (actCfg.needs) {
      for (const [need, value] of Object.entries(actCfg.needs)) {
        if (char.needs[need] !== undefined) {
          let adjustedValue = value;
          if (type === 'nap' && need === 'energy') adjustedValue *= Number(getTraitEffects().napBonus) || 1;
          char.needs[need] = Math.min(100, Math.max(0, char.needs[need] + adjustedValue));
        }
      }
    }

    // Apply energy cost
    const energyCost = getEffectiveEnergyCost(actCfg);
    if (energyCost) {
      char.needs.energy = Math.max(0, char.needs.energy - energyCost);
    }
    
    // Deduct monetary cost
    if (actCfg.cost) {
      Game.Economy.spend(actCfg.cost);
    }

    // Apply skill XP
    if (actCfg.skill && actCfg.xp) {
      addSkillXp(actCfg.skill, actCfg.xp);
    }

    // Apply moodlet
    if (actCfg.moodlet) {
      addMoodlet(actCfg.moodlet);
      emitView('effect:bubble', { x: char.position.x, y: char.position.y, text: '+ Moodlet', color: '#9C27B0', icon: '🎭' });
    }

    // Floating text for big Need boosts
    if (actCfg.needs) {
       let bestNeed = '';
       let maxVal = 0;
       for (const [n, v] of Object.entries(actCfg.needs)) {
          if (v > maxVal) { maxVal = v; bestNeed = n; }
       }
       if (maxVal > 0) {
          let mainColor = '#4CAF50';
          if (bestNeed === 'fun') mainColor = '#FF9800';
          else if (bestNeed === 'energy' || bestNeed === 'bladder') mainColor = '#FFEB3B';
          else if (bestNeed === 'social') mainColor = '#E91E63';
          else if (bestNeed === 'hygiene') mainColor = '#03A9F4';
          
          emitView('effect:bubble', { x: char.position.x, y: char.position.y - 0.5, text: `+${maxVal} ${bestNeed}`, color: mainColor, icon: actCfg.icon || '✨' });
       }
    }

    // Award money (e.g. harvesting)
    if (actCfg.earnings) {
      Game.Economy.addMoney(actCfg.earnings);
      emitView('effect:bubble', { x: char.position.x, y: char.position.y - 1.0, text: `+$${actCfg.earnings}`, color: '#FFD700', icon: '💰' });
    }

    // Custom Furniture Logic (e.g. Garden Plots)
    if (targetFurnId) {
      const activeMap = Game.State.getActiveMap();
      const furn = activeMap.furniture.find(f => f.id === targetFurnId);
      if (furn) {
        if (type.startsWith('plant_')) {
          furn.cropState = 'growing';
          furn.cropType = type.split('_')[1];
          furn.growth = 0;
          furn.needsWater = true;
        } else if (type === 'water_crop') {
          furn.needsWater = false;
        } else if (type === 'harvest_crop') {
          if (furn.growth >= 100) {
            const cropCfg = Game.Config.CROPS[furn.cropType];
            if (cropCfg) {
              Game.Economy.addMoney(cropCfg.sellPrice);
              notify(`🌾 Harvested ${cropCfg.label} and sold it for $${cropCfg.sellPrice}!`);
              emitView('effect:bubble', { x: char.position.x, y: char.position.y - 1.0, text: `+$${cropCfg.sellPrice}`, color: '#FFD700', icon: '💰' });
            } else {
              notify('🌾 Harvested unknown crop!');
            }
          }

          furn.cropState = 'empty';
          furn.cropType = null;
          furn.growth = 0;
          furn.needsWater = false;
        } else if (type === 'fill_bowl') {
          furn.isFull = true;
          notify('🐟 Filled the pet bowl! Let\'s wait and see who comes by.');
          Game.Signals?.emit('renderer:sync');
        } else if (type === 'travel' || type === 'take_subway') {
           if (furn.config && furn.config.targetMap) {
              char.mapId = furn.config.targetMap;
              recordMapVisit(char.mapId);
              char.position.x = furn.config.targetX || 4;
              char.position.y = furn.config.targetY || 8;
              char.targetPosition = null;
              char.actionQueue = [];
              Game.Signals?.emit('map:transition');
              notify(`🚇 Arrived at ${furn.config.targetMap}!`);
           }
        }
      }
    }

    if (type === 'buy_souvenir') {
       const collections = Object.values(Game.Config.COLLECTIONS);
       if (collections.length > 0) {
         const item = collections[Game.Random.int(0, collections.length - 1)];
         if (!char.collection.includes(item.id)) {
           char.collection.push(item.id);
           notify(`🎁 Got a new souvenir: ${item.icon} ${item.label}!`);
         } else {
           notify(`🎁 Got a duplicate: ${item.icon} ${item.label}.`);
         }
       }
    }

    if (type === 'browse_jobs') {
       if (Game.Signals) Game.Signals.emit('panel:open', { panel: 'career' });
       else Game.UI?.togglePanel?.('career');
    }

    if (type === 'invite_over') {
       if (Game.Main && Game.Main.spawnNPCWalker) {
          Game.Main.spawnNPCWalker();
          notify('👋 A friend has arrived to visit!');
       }
    }

    // Stats tracking
    if (type === 'cook') {
      Game.State.get().stats.mealsCooked++;
    }

    // Check Achievements periodically
    checkAchievements();

    // Furniture breakage roll
    if (actCfg.furniture) {
      const activeMap = Game.State.getActiveMap();
      const usedFurn = activeMap.furniture.find(f => f.type.includes(actCfg.furniture) && !isFurnitureBroken(f.id));
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
          if (Game.Random.float() < chance) {
            breakFurniture(usedFurn.id);
            notify(`⚠️ ${fc.label} broke down! Use Repair to fix it.`);
          }
        }
      }
    }

    // Visual feedback: only spawn explosion for physical activities
    const physicalActivities = ['cook', 'exercise', 'repair', 'grill', 'tinker', 'harvest_crop', 'plant_seed', 'invite_over'];
    if (physicalActivities.includes(type)) {
      const pos = char.targetPosition || char.position;
      emitView('effect:explosion', { x: pos.x + 0.5, y: pos.y + 0.5, scale: 0.5 });
    }
    notify(`✅ ${actCfg.label} complete!`);
    Game.Signals?.emit('activity:completed', { activityKey: type, targetFurnId });
  }

  function getEffectiveEnergyCost(activityConfig) {
    const baseCost = Number(activityConfig?.energyCost) || 0;
    const multiplier = Number(getTraitEffects().energyCostMult) || 1;
    return baseCost * multiplier;
  }

  function cancelActivity() {
    const char = getState();
    char.currentActivity = null;
    char.activityProgress = 0;
    char.targetPosition = null;
    char.path = null;
    char.isPathfinding = false;
    char.pathRequestId = (char.pathRequestId || 0) + 1;
  }

  function isAvailableActivity(activityKey) {
    const actCfg = cfg.ACTIVITIES[activityKey];
    if (!actCfg) return false;
    const activeMap = Game.State.getActiveMap();
    if (!activeMap) return false;

    if (actCfg.room && actCfg.room !== '*') {
      if (!activeMap.rooms.some(r => r.type === actCfg.room)) return false;
      if (actCfg.furniture) {
        // Check for non-broken furniture. We use includes() because activity required-type (e.g. 'bed')
        // matches specific furniture IDs (e.g. 'basic_bed', 'luxury_bed').
        if (!activeMap.furniture.some(f => f.type.includes(actCfg.furniture) && !isFurnitureBroken(f.id))) return false;
      }
    } else if (actCfg.room === '*') {
      if (actCfg.furniture) {
        if (!activeMap.furniture.some(f => f.type.includes(actCfg.furniture) && !isFurnitureBroken(f.id))) return false;
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

    // Physics update (Gravity and Z-Axis jumping)
    if (char.position.z !== undefined && (char.position.z > 0 || char.vz !== 0)) {
        char.vz -= 0.15 * delta; // Adjust gravity based on game speed tick delta
        char.position.z += char.vz * delta;
        
        // Floor collision
        if (char.position.z <= 0) {
            char.position.z = 0;
            char.vz = 0;
            
            // Spawn a dust explosion on landing
            emitView('effect:explosion', { x: char.position.x, y: char.position.y, scale: 0.3 });
        }
    }

    // Reset move status
    if (!char.targetPosition) {
      char.wasMoving = false;
      char.path = null;
      return;
    }

    // Need path calculation
    if (!char.path && !char.isPathfinding) {
      const rx = Math.floor(char.position.x);
      const ry = Math.floor(char.position.y);
      const tx = Math.floor(char.targetPosition.x);
      const ty = Math.floor(char.targetPosition.y);
      
      if (Game.Signals) {
        const requestId = (char.pathRequestId || 0) + 1;
        char.pathRequestId = requestId;
        char.isPathfinding = true;
        const receivePath = (path) => {
          if (char.pathRequestId !== requestId) return;
          char.isPathfinding = false;
          char.path = path;
          // EasyStar might return null if unreachable
          if (!path || path.length === 0) {
             char.targetPosition = null; 
             char.path = null;
             notify("🚫 I can't reach that!");
          }
        };
        const handled = Game.Signals.emit('path:find', { startX: rx, startY: ry, endX: tx, endY: ty, callback: receivePath });
        if (!handled && Game.Renderer?.findPath) {
          Game.Renderer.findPath(rx, ry, tx, ty, receivePath);
        } else if (!handled) {
          char.isPathfinding = false;
          char.path = [{ x: tx, y: ty }];
        }
      } else {
        // Fallback if no Renderer path
        char.path = [{x: tx, y: ty}];
      }
      return;
    }

    // Waiting for path callback
    if (char.isPathfinding || !char.path) return;

    // We have a path, move towards the next node
    const nextNode = char.path[0];
    const targetX = nextNode.x + 0.5; // Walk to center of isometric tile
    const targetY = nextNode.y + 0.5;

    const dx = targetX - char.position.x;
    const dy = targetY - char.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const speed = 5 * delta; // Set robust walking speed
    
    if (dist < speed) {
      // Reached this node
      char.position.x = targetX;
      char.position.y = targetY;
      char.path.shift();
      
      if (char.path.length === 0) {
        char.targetPosition = null;
        char.path = null;
        char.wasMoving = false;
        emitView('effect:explosion', { x: char.position.x, y: char.position.y, scale: 0.4 });
      }
    } else {
      char.wasMoving = true;
      char.position.x += (dx / dist) * speed;
      char.position.y += (dy / dist) * speed;
    }
  }

  // ---- Furniture Breakage ----
  function isFurnitureBroken(furnId) {
    const activeMap = Game.State.getActiveMap();
    return activeMap && (activeMap.brokenFurniture || []).includes(furnId);
  }

  function breakFurniture(furnId) {
    const activeMap = Game.State.getActiveMap();
    if (!activeMap) return;
    if (!activeMap.brokenFurniture) activeMap.brokenFurniture = [];
    if (!activeMap.brokenFurniture.includes(furnId)) {
      activeMap.brokenFurniture.push(furnId);
    }
  }

  function repairFurniture(furnId) {
    const activeMap = Game.State.getActiveMap();
    if (!activeMap || !activeMap.brokenFurniture) return false;
    const idx = activeMap.brokenFurniture.indexOf(furnId);
    if (idx === -1) return false;
    activeMap.brokenFurniture.splice(idx, 1);
    return true;
  }

  // ---- Achievements & Collections ----
  function unlockAchievement(id) {
    const char = getState();
    if (!char.achievements) char.achievements = [];
    if (!char.achievements.includes(id)) {
      char.achievements.push(id);
      const ach = Game.Config.ACHIEVEMENTS[id];
      if (ach) notify(`🏆 Achievement Unlocked: ${ach.icon} ${ach.label}!`);
    }
  }

  function checkAchievements() {
    const state = Game.State.get();
    const char = state.character;
    
    if (state.economy.money >= 1000000) unlockAchievement('millionaire');
    if (char.skills.language >= 6) unlockAchievement('hsk_master');
    if (state.stats.friendsMade >= 1) unlockAchievement('first_friend');
    if (['house', 'downtown', 'university'].every(mapId => (char.visitedMaps || []).includes(mapId))) {
      unlockAchievement('globe_trotter');
    }
    if (char.collection && char.collection.length >= Object.keys(Game.Config.COLLECTIONS).length) {
      // you could add a collector achievement
    }
  }

  function recordMapVisit(mapId) {
    const char = getState();
    if (!char.visitedMaps) char.visitedMaps = ['house'];
    if (!char.visitedMaps.includes(mapId)) char.visitedMaps.push(mapId);
    checkAchievements();
  }

  return {
    getEffectiveEnergyCost,
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
    invalidateComfortCache,
    getState,
    isFurnitureBroken,
    breakFurniture,
    repairFurniture,
    checkAchievements,
  };
})();
