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

    // Check money cost
    if (actCfg.cost && !Game.Economy.canAfford(actCfg.cost)) {
        if (Game.UI) Game.UI.showNotification(`Not enough money for ${actCfg.label}!`);
        return false;
    }

    // Handle instant Travel
    if (activityKey === 'travel' && targetFurnId) {
      const portal = activeMap.furniture.find(f => f.id === targetFurnId);
      if (portal && portal.config && portal.config.targetMap) {
        char.mapId = portal.config.targetMap;
        char.position.x = portal.config.targetX || 2;
        char.position.y = portal.config.targetY || 2;
        char.targetPosition = null;
        char.currentActivity = null;
        char.activityProgress = 0;
        char.actionQueue = [];
        if (Game.Renderer && Game.Renderer.transitionMap) {
           Game.Renderer.transitionMap();
        }
        Game.UI && Game.UI.showNotification(`🚪 Traveled!`);
        return true;
      }
      return false;
    }
    if (actCfg.room && actCfg.room !== '*') {
      const hasRoom = activeMap.rooms.some(r => r.type === actCfg.room);
      if (!hasRoom) return false;

      // Check furniture if needed
      if (actCfg.furniture) {
        const hasFurn = activeMap.furniture.some(f => f.type.includes(actCfg.furniture));
        if (!hasFurn) return false;
      }
    } else if (actCfg.room === '*') {
      if (actCfg.furniture) {
        const hasFurn = activeMap.furniture.some(f => f.type.includes(actCfg.furniture));
        if (!hasFurn) return false;
      }
    }

    // Check energy cost
    if (actCfg.energyCost && char.needs.energy < actCfg.energyCost) return false;

    // Check money cost
    if (actCfg.cost && !Game.Economy.canAfford(actCfg.cost)) {
        if (Game.UI) Game.UI.showNotification(`Not enough money for ${actCfg.label}!`);
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
          char.needs[need] = Math.min(100, Math.max(0, char.needs[need] + value));
        }
      }
    }

    // Apply energy cost
    if (actCfg.energyCost) {
      char.needs.energy = Math.max(0, char.needs.energy - actCfg.energyCost);
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
      if (Game.Renderer && Game.Renderer.spawnFloatingBubble) {
         Game.Renderer.spawnFloatingBubble(char.position.x, char.position.y, '+ Moodlet', '#9C27B0', '🎭');
      }
    }

    // Floating text for big Need boosts
    if (actCfg.needs) {
       let bestNeed = '';
       let maxVal = 0;
       for (const [n, v] of Object.entries(actCfg.needs)) {
          if (v > maxVal) { maxVal = v; bestNeed = n; }
       }
       if (maxVal > 0 && Game.Renderer && Game.Renderer.spawnFloatingBubble) {
          let mainColor = '#4CAF50';
          if (bestNeed === 'fun') mainColor = '#FF9800';
          else if (bestNeed === 'energy' || bestNeed === 'bladder') mainColor = '#FFEB3B';
          else if (bestNeed === 'social') mainColor = '#E91E63';
          else if (bestNeed === 'hygiene') mainColor = '#03A9F4';
          
          Game.Renderer.spawnFloatingBubble(char.position.x, char.position.y - 0.5, `+${maxVal} ${bestNeed}`, mainColor, actCfg.icon || '✨');
       }
    }

    // Award money (e.g. harvesting)
    if (actCfg.earnings) {
      const state = Game.State.get();
      state.money = (state.money || 0) + actCfg.earnings;
      if (Game.Renderer && Game.Renderer.spawnFloatingBubble) {
         Game.Renderer.spawnFloatingBubble(char.position.x, char.position.y - 1.0, `+$${actCfg.earnings}`, '#FFD700', '💰');
      }
    }

    // Custom Furniture Logic (e.g. Garden Plots)
    if (targetFurnId) {
      const activeMap = Game.State.getActiveMap();
      const furn = activeMap.furniture.find(f => f.id === targetFurnId);
      if (furn) {
        if (type === 'plant_seed') {
          furn.cropState = 'growing';
          furn.growth = 0;
          furn.needsWater = true;
        } else if (type === 'water_crop') {
          furn.needsWater = false;
        } else if (type === 'harvest_crop') {
          // Grant Potted Flower Cultivation Reward!
          if (furn.growth >= 100) {
            activeMap.furniture.push({
               id: 'flower_' + Date.now(),
               type: 'potted_flower',
               x: Math.floor(char.position.x),
               y: Math.floor(char.position.y) + 1,
               roomId: null,
               rotated: false
            });
            if (Game.UI) Game.UI.showNotification('🌸 Harvested a beautiful Potted Flower! Enter Build Mode to decorate with it.');
            if (Game.Renderer && Game.Renderer.requestFullSync) Game.Renderer.requestFullSync();
          }

          furn.cropState = 'empty';
          furn.growth = 0;
          furn.needsWater = false;
        } else if (type === 'fill_bowl') {
          furn.isFull = true;
          if (Game.UI) Game.UI.showNotification('🐟 Filled the pet bowl! Let\'s wait and see who comes by.');
          if (Game.Renderer && Game.Renderer.requestFullSync) Game.Renderer.requestFullSync();
        } else if (type === 'take_subway') {
           if (furn.config && furn.config.targetMap) {
              char.mapId = furn.config.targetMap;
              char.position.x = furn.config.targetX || 4;
              char.position.y = furn.config.targetY || 8;
              char.targetPosition = null;
              char.actionQueue = [];
              if (Game.Renderer && Game.Renderer.transitionMap) Game.Renderer.transitionMap();
              Game.UI && Game.UI.showNotification(`🚇 Arrived at ${furn.config.targetMap}!`);
           }
        }
      }
    }

    if (type === 'buy_souvenir') {
       const collections = Object.values(Game.Config.COLLECTIONS);
       if (collections.length > 0) {
         const item = collections[Math.floor(Math.random() * collections.length)];
         if (!char.collection.includes(item.id)) {
           char.collection.push(item.id);
           Game.UI && Game.UI.showNotification(`🎁 Got a new souvenir: ${item.icon} ${item.label}!`);
         } else {
           Game.UI && Game.UI.showNotification(`🎁 Got a duplicate: ${item.icon} ${item.label}.`);
         }
       }
    }

    if (type === 'invite_over') {
       if (Game.Main && Game.Main.spawnNPCWalker) {
          Game.Main.spawnNPCWalker();
          if (Game.UI) Game.UI.showNotification('👋 A friend has arrived to visit!');
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
          if (Math.random() < chance) {
            breakFurniture(usedFurn.id);
            Game.UI && Game.UI.showNotification(`⚠️ ${fc.label} broke down! Use Repair to fix it.`);
          }
        }
      }
    }

    // Visual feedback: only spawn explosion for physical activities
    const physicalActivities = ['cook', 'exercise', 'repair', 'grill', 'tinker', 'harvest_crop', 'plant_seed', 'invite_over'];
    if (physicalActivities.includes(type) && Game.Renderer && Game.Renderer.spawnExplosion) {
      const pos = char.targetPosition || char.position;
      Game.Renderer.spawnExplosion(pos.x + 0.5, pos.y + 0.5, 0.5);
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
    const activeMap = Game.State.getActiveMap();
    if (!activeMap) return false;

    if (actCfg.room && actCfg.room !== '*') {
      if (!activeMap.rooms.some(r => r.type === actCfg.room)) return false;
      if (actCfg.furniture) {
        // Check for non-broken furniture
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
            if (Game.Renderer && Game.Renderer.spawnExplosion) {
                Game.Renderer.spawnExplosion(char.position.x, char.position.y, 0.3);
            }
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
      
      if (Game.Renderer && Game.Renderer.findPath) {
        char.isPathfinding = true;
        Game.Renderer.findPath(rx, ry, tx, ty, (path) => {
          char.isPathfinding = false;
          char.path = path;
          // EasyStar might return null if unreachable
          if (!path || path.length === 0) {
             char.targetPosition = null; 
             char.path = null;
             Game.UI && Game.UI.showNotification("🚫 I can't reach that!");
          }
        });
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

    const speed = Math.max(3, 5) * delta; // Set robust walking speed
    
    if (dist < speed) {
      // Reached this node
      char.position.x = targetX;
      char.position.y = targetY;
      char.path.shift();
      
      if (char.path.length === 0) {
        char.targetPosition = null;
        char.path = null;
        char.wasMoving = false;
        if (Game.Renderer && Game.Renderer.spawnExplosion) {
           Game.Renderer.spawnExplosion(char.position.x, char.position.y, 0.4);
        }
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
      if (ach && Game.UI) {
        Game.UI.showNotification(`🏆 Achievement Unlocked: ${ach.icon} ${ach.label}!`);
      }
    }
  }

  function checkAchievements() {
    const state = Game.State.get();
    const char = state.character;
    
    if (state.money >= 1000000) unlockAchievement('millionaire');
    if (char.skills.language >= 6) unlockAchievement('hsk_master');
    if (char.collection && char.collection.length >= Object.keys(Game.Config.COLLECTIONS).length) {
      // you could add a collector achievement
    }
    // more checks can be added here
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
    invalidateComfortCache,
    getState,
    isFurnitureBroken,
    breakFurniture,
    repairFurniture,
  };
})();
