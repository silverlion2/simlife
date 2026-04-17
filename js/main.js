// ============================================================
// SimLife — Main Game Loop & Input Controller
// ============================================================
window.Game = window.Game || {};

Game.Main = (function() {
  let lastTimestamp = 0;
  let gameSpeed = 1;
  let tickAccumulator = 0;
  let idleTimer = 0;
  const IDLE_WANDER_INTERVAL = 12; // seconds
  let tutorialShown = false;
  let canvasTooltip = null;
  let pieMenuJustOpened = false;
  let npcSpawnTimer = 30; // First NPC after 30 seconds
  let uiThrottleAccum = 0; // Throttle DOM updates
  let autoSaveAccum = 0;  // Auto-save counter

  function init() {
    const canvas = document.getElementById('game-canvas');
    Game.Renderer.init(canvas);
    Game.UI.init();

    // Announcer overlay starts hidden via HTML class + CSS;
    // playAnnouncer() in ui.js handles showing/hiding it properly.

    // Time fix: ensure minute is exactly 0 at start
    const time = Game.State.get().time;
    if (time.minute < 0) time.minute = 0;
    time.totalMinutes = time.day * 1440 + time.hour * 60 + time.minute;

    // Ensure character has new fields
    const char = Game.State.get().character;
    if (!char.actionQueue) char.actionQueue = [];
    if (!char.moodlets) char.moodlets = [];
    if (!char.autonomy) char.autonomy = { thought: null, lastAutoTime: 0, enabled: true };

    setupCanvasEvents(canvas);
    setupKeyboardShortcuts();
    setupSpeedControls();

    showTutorial();
  }

  function tick(time, deltaMs) {
    const rawDelta = deltaMs / 1000;
    const delta = Math.min(rawDelta, 0.1);
    const state = Game.State.get();

    // ---- Time progression ----
    const minutesPerSecond = Game.Config.TIME.MINUTES_PER_SECOND * gameSpeed;
    const deltaMinutes = delta * minutesPerSecond;
    tickAccumulator += deltaMinutes;

    if (tickAccumulator >= 1) {
      const wholeMins = Math.floor(tickAccumulator);
      tickAccumulator -= wholeMins;
      updateTime(wholeMins);
      Game.Character.updateNeeds(wholeMins);
      Game.Character.updateActivity(wholeMins);
      Game.Events.update(wholeMins);
      updateGarden(wholeMins);
      updatePets(wholeMins);
    }

    // ---- Character Movement ----
    Game.Character.updatePosition(delta * gameSpeed);

    // ---- Autonomy AI ----
    if (Game.Autonomy) {
      Game.Autonomy.update(delta * gameSpeed);
    }

    // ---- Idle Wandering (when no autonomy decision) ----
    const char = state.character;
    if (!char.currentActivity && !char.targetPosition && !char.autonomy.thought && char.actionQueue.length === 0) {
      idleTimer += delta;
      if (idleTimer >= IDLE_WANDER_INTERVAL) {
        idleTimer = 0;
        const pos = Game.Renderer.getRandomRoomPosition();
        if (pos) char.targetPosition = { x: pos.x, y: pos.y };
      }
    } else {
      idleTimer = 0;
    }

    // ---- NPC Walkers ----
    updateNPCWalkers(delta * gameSpeed);

    // ---- UI Updates (throttled to ~4fps for DOM performance) ----
    uiThrottleAccum += delta;
    if (uiThrottleAccum >= 0.25) {
      uiThrottleAccum = 0;
      Game.UI.updateStatusBars();
      Game.UI.updateMoodletDisplay();
    }

    // ---- Auto-save (every 30 seconds of wall time) ----
    autoSaveAccum += delta;
    if (autoSaveAccum >= 30) {
      autoSaveAccum = 0;
      Game.State.save();
    }
  }

  function updateTime(minutes) {
    const time = Game.State.get().time;
    time.minute += minutes;
    time.totalMinutes = (time.totalMinutes || 0) + minutes;

    while (time.minute >= 60) {
      time.minute -= 60;
      time.hour++;
    }

    while (time.hour >= 24) {
      time.hour -= 24;
      time.day++;
      onNewDay();
    }

    // Life stage
    const char = Game.State.get().character;
    const newStage = Game.Character.getLifeStage(time.day);
    if (newStage !== char.lifeStage) {
      char.lifeStage = newStage;
      Game.UI.showNotification(`🎂 ${char.name} is now a ${Game.Character.getLifeStageLabel(newStage)}!`);
    }

    // Season tracking
    if (!time.season) time.season = 'spring';
    const seasonIdx = Math.floor(((time.day - 1) % (Game.Config.DAYS_PER_SEASON * 4)) / Game.Config.DAYS_PER_SEASON);
    const newSeason = Game.Config.SEASON_ORDER[seasonIdx];
    if (newSeason !== time.season) {
      time.season = newSeason;
      const sc = Game.Config.SEASONS[newSeason];
      Game.UI.playAnnouncer && Game.UI.playAnnouncer(`${sc.icon} ${sc.label} Has Arrived!`);
      if (Game.Renderer) Game.Renderer.setBgDirty();
    }

    // Update time display with season
    const displayHour = time.hour % 12 || 12;
    const ampm = time.hour >= 12 ? 'PM' : 'AM';
    const displayMin = String(Math.max(0, Math.floor(time.minute))).padStart(2, '0');
    const sc = Game.Config.SEASONS[time.season] || { icon: '🌸', label: 'Spring' };
    const dayInSeason = ((time.day - 1) % Game.Config.DAYS_PER_SEASON) + 1;
    const timeEl = document.getElementById('time-display');
    if (timeEl) timeEl.textContent = `${sc.icon} ${sc.label} ${dayInSeason} — ${displayHour}:${displayMin} ${ampm}`;
  }

  function onNewDay() {
    const time = Game.State.get().time;
    Game.Social.decayRelationships();
    if (Game.Economy.isWorkHours(9)) {
      Game.Economy.processWorkDay();
    }
    if (time.day % 7 === 0) {
      Game.Economy.processBills();
    }
    // Roll weather for the new day
    const season = time.season || 'spring';
    const sc = Game.Config.SEASONS[season];
    if (sc) {
      const roll = Math.random();
      let cumul = 0;
      time.weather = 'clear';
      for (const [w, chance] of Object.entries(sc.weatherChance)) {
        cumul += chance;
        if (roll < cumul) { time.weather = w; break; }
      }
    }
  }

  // ---- Gardening Loop ----
  function updateGarden(minutes) {
    const state = Game.State.get();
    const activeMap = Game.State.getActiveMap();
    if (!activeMap || !activeMap.furniture) return;
    
    activeMap.furniture.forEach(furn => {
      if (furn.type === 'garden_plot' && furn.cropState === 'growing') {
        // Grow slowly if thirsty, faster if watered
        const growthRate = furn.needsWater ? 0.2 : 1.0; 
        // 100 minutes to grow if fully watered (about 1.5 in-game hours)
        furn.growth = (furn.growth || 0) + (minutes * growthRate);
        if (furn.growth >= 100) {
           furn.cropState = 'ready';
           furn.growth = 100;
           Game.UI.showNotification(`🌾 A crop is ready to harvest!`);
        }
      }
    });
  }

  // ---- Pet Ecosystem ----
  function updatePets(minutes) {
    const state = Game.State.get();
    const activeMap = Game.State.getActiveMap();
    if (!activeMap || !activeMap.furniture) return;
    
    // Check pet bowls
    let bowlFull = false;
    activeMap.furniture.forEach(furn => {
      if (furn.type === 'pet_bowl' && furn.isFull) {
         furn.foodLevel = (furn.foodLevel || 100) - (minutes * 0.5); // Depletes over ~200 minutes (few game hours)
         if (furn.foodLevel <= 0) {
            furn.isFull = false;
            furn.foodLevel = 0;
            if (Game.UI) Game.UI.showNotification(`🥣 A pet bowl is empty.`);
         } else {
            bowlFull = true;
         }
      }
    });

    if (bowlFull) {
       // Chance to increase trust over time
       state.catTrust = (state.catTrust || 0) + (minutes * 0.1); 
       // Once reaching 100 (which takes about 16 in-game hours of full bowls), the cat moves in!
       if (state.catTrust >= 100 && !state.hasStrayCat) {
          state.hasStrayCat = true;
          if (Game.UI) {
             Game.UI.showNotification(`🐈 A stray cat has learned to trust you and permanently moved in!`);
             Game.UI.playAnnouncer && Game.UI.playAnnouncer('🐈 New Pet!');
          }
          
          if (!state.pets) state.pets = [];
          state.pets.push({ id: 'cat_' + Date.now(), type: 'cat', active: true });
       }
    }

    // Process Pet Wandering
    if (state.pets) {
        state.pets.forEach(pet => {
            if (!pet.position) {
                pet.position = { x: activeMap.lotWidth / 2, y: activeMap.lotHeight / 2 };
                pet.targetPosition = null;
                pet.timer = 0;
            }

            if (pet.targetPosition) {
                const dx = pet.targetPosition.x - pet.position.x;
                const dy = pet.targetPosition.y - pet.position.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 0.2) {
                    pet.targetPosition = null;
                    pet.timer = Math.random() * 10 + 5; // Idle for 5-15 in-game minutes
                } else {
                    const speed = 0.05 * minutes; // Very slow wandering
                    pet.position.x += (dx/dist) * speed;
                    pet.position.y += (dy/dist) * speed;
                }
            } else {
                pet.timer -= minutes;
                if (pet.timer <= 0) {
                    // Pick a new random spot in the lot bounds
                    pet.targetPosition = {
                        x: 1 + Math.random() * (activeMap.lotWidth - 2),
                        y: 1 + Math.random() * (activeMap.lotHeight - 2)
                    };
                }
            }
        });
    }
  }

  // ---- Interaction Initialization ----
  function setupCanvasEvents(canvas) {
    if (Game.Interaction && Game.Interaction.init) {
      Game.Interaction.init();
    }
    
    // Zoom buttons
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    if (btnZoomOut && Game.Renderer.adjustZoom) btnZoomOut.addEventListener('click', () => Game.Renderer.adjustZoom(-0.25));
    if (btnZoomIn && Game.Renderer.adjustZoom) btnZoomIn.addEventListener('click', () => Game.Renderer.adjustZoom(0.25));
  }

  // ---- NPC Walker System ----
  function updateNPCWalkers(delta) {
    const state = Game.State.get();
    if (!state.npcWalkers) state.npcWalkers = [];
    const activeMap = Game.State.getActiveMap();
    if (!activeMap) return;

    // Spawn timer
    npcSpawnTimer -= delta;
    if (npcSpawnTimer <= 0) {
      npcSpawnTimer = 40 + Math.random() * 50;
      spawnNPCWalker();
    }

    // Update positions
    for (const npc of state.npcWalkers) {
      if (!npc.active) continue;
      const speed = 1.5 * delta;
      npc.position.x += npc.direction * speed;

      if (npc.position.x < -3 || npc.position.x > activeMap.lotWidth + 3) {
        npc.active = false;
      }

      npc.lifeTimer -= delta;
      if (npc.lifeTimer <= 0) npc.active = false;
    }

    // In-place cleanup: reverse-iterate to avoid array copy from filter()
    for (let i = state.npcWalkers.length - 1; i >= 0; i--) {
      if (!state.npcWalkers[i].active) state.npcWalkers.splice(i, 1);
    }
  }

  function spawnNPCWalker() {
    const state = Game.State.get();
    const activeMap = Game.State.getActiveMap();
    const npcs = Game.Config.NPCS || [];
    const activeIds = state.npcWalkers.map(n => n.configId);
    const available = npcs.filter(n => !activeIds.includes(n.id));
    if (available.length === 0 || state.npcWalkers.length >= 3) return;

    const chosen = available[Math.floor(Math.random() * available.length)];
    const fromLeft = Math.random() > 0.5;
    const pathY = activeMap.lotHeight + 0.5;

    state.npcWalkers.push({
      id: 'walker_' + Date.now(),
      configId: chosen.id,
      position: { x: fromLeft ? -2 : activeMap.lotWidth + 2, y: pathY },
      direction: fromLeft ? 1 : -1,
      active: true,
      phase: Math.random() * Math.PI * 2,
      lifeTimer: 60,
    });
  }

  function hitTestNPCWalker(gx, gy) {
    const state = Game.State.get();
    for (const npc of (state.npcWalkers || [])) {
      if (!npc.active) continue;
      if (Math.abs(gx - npc.position.x) < 1.5 && Math.abs(gy - npc.position.y) < 1.5) {
        return npc;
      }
    }
    return null;
  }

  // ---- Keyboard Shortcuts ----
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          gameSpeed = gameSpeed === 0 ? 1 : 0;
          updateSpeedDisplay();
          break;
        case '1': gameSpeed = 1; updateSpeedDisplay(); break;
        case '2': gameSpeed = 3; updateSpeedDisplay(); break;
        case '3': gameSpeed = 10; updateSpeedDisplay(); break;
        case 'Escape':
          if (Game.State.get().ui.mode === 'build') {
            if (Game.State.get().ui.buildGhost) {
              Game.State.get().ui.buildGhost = null; // Drop item
            } else {
              Game.State.get().ui.mode = 'live'; // Exit build mode
            }
            break;
          }
          if (Game.Interaction) Game.Interaction.closePieMenu();
          Game.Character.cancelActivity();
          Game.Character.clearQueue();
          Game.UI.updateQueueDisplay();
          break;
        case 'r':
        case 'R':
          if (Game.State.get().ui.mode === 'build' && Game.State.get().ui.buildGhost && Game.State.get().ui.buildGhost.type === 'furniture') {
            const ghost = Game.State.get().ui.buildGhost;
            ghost.rotated = !ghost.rotated;
            const temp = ghost.w;
            ghost.w = ghost.h;
            ghost.h = temp;
          }
          break;
        case 'q':
          // Toggle autonomy
          const char = Game.State.get().character;
          char.autonomy.enabled = !char.autonomy.enabled;
          Game.UI.showNotification(char.autonomy.enabled ? '🤖 Autonomy ON' : '🎮 Autonomy OFF (manual control)');
          break;
        case 'ArrowUp':
        case 'w':
          if (Game.Renderer.setCameraOffset) Game.Renderer.setCameraOffset(0, 40);
          break;
        case 'ArrowDown':
        case 's':
          if (Game.Renderer.setCameraOffset) Game.Renderer.setCameraOffset(0, -40);
          break;
        case 'ArrowLeft':
        case 'a':
          if (Game.Renderer.setCameraOffset) Game.Renderer.setCameraOffset(40, 0);
          break;
        case 'ArrowRight':
        case 'd':
          if (Game.Renderer.setCameraOffset) Game.Renderer.setCameraOffset(-40, 0);
          break;
      }
    });
  }

  function setupSpeedControls() {
    document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseInt(btn.dataset.speed);
        if (!isNaN(speed)) {
          gameSpeed = speed;
          updateSpeedDisplay();
        }
      });
    });

    // Zoom buttons already registered in setupCanvasEvents() — don't duplicate
  }

  function updateSpeedDisplay() {
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.speed) === gameSpeed);
    });
    const pauseLabel = document.getElementById('pause-label');
    if (pauseLabel) {
      pauseLabel.textContent = gameSpeed === 0 ? '⏸ PAUSED' : '';
    }
  }

  // ---- Tutorial ----
  function showTutorial() {
    if (tutorialShown || Game.State.get().time.day > 1) return;
    tutorialShown = true;
    setTimeout(() => {
      Game.UI.showNotification('🏠 Welcome! Click furniture to interact via pie menu.');
    }, 1000);
    setTimeout(() => {
      Game.UI.showNotification('⌨️ Press 1/2/3 for speed, Space to pause, Q for autonomy toggle.');
    }, 3000);
    setTimeout(() => {
      Game.UI.showNotification('💡 Shift+Click to queue actions. Your Sim will auto-act when idle!');
    }, 5000);
  }

  return { init, getSpeed: () => gameSpeed, hitTestNPCWalker, spawnNPCWalker, tick };
})();

// Boot
window.addEventListener('DOMContentLoaded', () => {
  Game.UI.initMainMenu();
});
