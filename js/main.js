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

  function init() {
    const canvas = document.getElementById('game-canvas');
    Game.Renderer.init(canvas);
    Game.UI.init();

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

    requestAnimationFrame(gameLoop);
    showTutorial();
  }

  function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const rawDelta = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
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

    // ---- Render ----
    Game.Renderer.render(timestamp);

    // ---- UI Updates ----
    Game.UI.updateStatusBars();
    Game.UI.updateMoodletDisplay();

    // ---- Auto-save ----
    if (Math.floor(timestamp / 30000) !== Math.floor((timestamp - rawDelta * 1000) / 30000)) {
      Game.State.save();
    }

    requestAnimationFrame(gameLoop);
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

    // Update time display
    const displayHour = time.hour % 12 || 12;
    const ampm = time.hour >= 12 ? 'PM' : 'AM';
    const displayMin = String(Math.max(0, Math.floor(time.minute))).padStart(2, '0');
    const timeEl = document.getElementById('time-display');
    if (timeEl) timeEl.textContent = `Day ${time.day} — ${displayHour}:${displayMin} ${ampm}`;
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
  }

  // ---- Canvas Events (Pie Menu + Interaction) ----
  function setupCanvasEvents(canvas) {
    // Create tooltip element
    canvasTooltip = document.createElement('div');
    canvasTooltip.className = 'canvas-tooltip';
    document.body.appendChild(canvasTooltip);

    canvas.addEventListener('click', (e) => {
      const state = Game.State.get();
      if (state.ui.mode === 'build') return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      const gp = Game.Renderer.getGridPos(cx, cy);

      // Check furniture hit
      const furn = Game.Renderer.hitTestFurniture(gp.x, gp.y);
      if (furn) {
        const screenX = e.clientX;
        const screenY = e.clientY;
        showPieMenu(furn, screenX, screenY, e.shiftKey);
        return;
      }

      // Check room hit (for room-level activities)
      const room = Game.Renderer.hitTestRoom(gp.x, gp.y);
      if (room) {
        const screenX = e.clientX;
        const screenY = e.clientY;
        showRoomPieMenu(room, screenX, screenY, e.shiftKey);
        return;
      }

      // Click on empty space — move character
      const char = state.character;
      char.targetPosition = { x: gp.x + 0.5, y: gp.y + 0.5 };
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      const gp = Game.Renderer.getGridPos(cx, cy);

      const furn = Game.Renderer.hitTestFurniture(gp.x, gp.y);
      if (furn) {
        canvas.style.cursor = 'pointer';
        canvasTooltip.textContent = `${furn.config.icon} ${furn.config.label}`;
        canvasTooltip.style.display = 'block';
        canvasTooltip.style.left = (e.clientX + 12) + 'px';
        canvasTooltip.style.top = (e.clientY - 8) + 'px';
      } else {
        canvas.style.cursor = 'default';
        canvasTooltip.style.display = 'none';
      }
    });

    canvas.addEventListener('mouseleave', () => {
      canvasTooltip.style.display = 'none';
    });

    // Close pie menu on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.pie-menu')) {
        closePieMenu();
      }
    });
  }

  // ---- PIE MENU (Radial Context Menu) ----
  function showPieMenu(furn, screenX, screenY, shiftKey) {
    closePieMenu();
    const activities = getActivitiesForFurniture(furn.type);
    if (activities.length === 0) return;

    const menu = document.createElement('div');
    menu.className = 'pie-menu';
    menu.style.left = screenX + 'px';
    menu.style.top = screenY + 'px';

    // Center cancel button
    const cancel = document.createElement('div');
    cancel.className = 'pie-center';
    cancel.innerHTML = '✕';
    cancel.title = 'Cancel';
    cancel.addEventListener('click', (e) => {
      e.stopPropagation();
      closePieMenu();
    });
    menu.appendChild(cancel);

    // Arrange items in a circle
    const radius = 65;
    const angleStep = (2 * Math.PI) / Math.max(activities.length, 1);
    const startAngle = -Math.PI / 2; // start at top

    activities.forEach((act, i) => {
      const angle = startAngle + i * angleStep;
      const ix = Math.cos(angle) * radius;
      const iy = Math.sin(angle) * radius;

      const item = document.createElement('div');
      item.className = 'pie-item';
      item.style.transform = `translate(${ix}px, ${iy}px)`;
      item.innerHTML = `<span class="pie-icon">${act.icon}</span><span class="pie-label">${act.label}</span>`;
      item.title = act.label;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (shiftKey || e.shiftKey) {
          // Queue the action
          if (Game.Character.queueActivity(act.key)) {
            Game.UI.showNotification(`📋 Queued: ${act.label}`);
            Game.UI.updateQueueDisplay();
          }
        } else {
          Game.Character.startActivity(act.key);
        }
        closePieMenu();
      });

      // Animate entry with staggered delay
      item.style.animationDelay = `${i * 0.05}s`;

      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    // Trigger animation
    requestAnimationFrame(() => menu.classList.add('visible'));
  }

  function showRoomPieMenu(room, screenX, screenY, shiftKey) {
    closePieMenu();
    const activities = getActivitiesForRoom(room.type);
    if (activities.length === 0) return;
    // Reuse the same pie menu logic
    const menu = document.createElement('div');
    menu.className = 'pie-menu';
    menu.style.left = screenX + 'px';
    menu.style.top = screenY + 'px';

    const cancel = document.createElement('div');
    cancel.className = 'pie-center';
    cancel.innerHTML = '✕';
    cancel.addEventListener('click', (e) => { e.stopPropagation(); closePieMenu(); });
    menu.appendChild(cancel);

    const radius = 65;
    const angleStep = (2 * Math.PI) / Math.max(activities.length, 1);
    const startAngle = -Math.PI / 2;

    activities.forEach((act, i) => {
      const angle = startAngle + i * angleStep;
      const ix = Math.cos(angle) * radius;
      const iy = Math.sin(angle) * radius;
      const item = document.createElement('div');
      item.className = 'pie-item';
      item.style.transform = `translate(${ix}px, ${iy}px)`;
      item.innerHTML = `<span class="pie-icon">${act.icon}</span><span class="pie-label">${act.label}</span>`;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (shiftKey || e.shiftKey) {
          if (Game.Character.queueActivity(act.key)) {
            Game.UI.showNotification(`📋 Queued: ${act.label}`);
            Game.UI.updateQueueDisplay();
          }
        } else {
          Game.Character.startActivity(act.key);
        }
        closePieMenu();
      });
      item.style.animationDelay = `${i * 0.05}s`;
      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    requestAnimationFrame(() => menu.classList.add('visible'));
  }

  function closePieMenu() {
    const existing = document.querySelector('.pie-menu');
    if (existing) {
      existing.classList.add('closing');
      setTimeout(() => existing.remove(), 200);
    }
  }

  function getActivitiesForFurniture(furnType) {
    const activities = Game.Config.ACTIVITIES;
    return Object.entries(activities)
      .filter(([key, act]) => {
        if (!act.furniture) return false;
        // Match: furniture field is a substring of the furniture type OR exact match
        return furnType.includes(act.furniture) || act.furniture === furnType;
      })
      .filter(([key]) => Game.Character.isAvailableActivity(key))
      .map(([key, act]) => ({ key, ...act }));
  }

  function getActivitiesForRoom(roomType) {
    const activities = Game.Config.ACTIVITIES;
    return Object.entries(activities)
      .filter(([key, act]) => act.room === roomType && !act.furniture)
      .filter(([key]) => Game.Character.isAvailableActivity(key))
      .map(([key, act]) => ({ key, ...act }));
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
          closePieMenu();
          Game.Character.cancelActivity();
          Game.Character.clearQueue();
          Game.UI.updateQueueDisplay();
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
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseInt(btn.dataset.speed);
        if (!isNaN(speed)) {
          gameSpeed = speed;
          updateSpeedDisplay();
        }
      });
    });
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

  return { init, getSpeed: () => gameSpeed };
})();

// Boot
window.addEventListener('DOMContentLoaded', () => {
  Game.State.load();
  Game.Main.init();
});
