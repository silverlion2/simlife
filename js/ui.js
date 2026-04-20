// ============================================================
// SimLife — UI System (Status Bars, Panels, Notifications)
// ============================================================
window.Game = window.Game || {};

Game.UI = (function() {
  let notifications = [];
  const MAX_NOTIFICATIONS = 3;

  function init() {
    buildStatusPanel();
    buildMoodletBar();
    buildQueueBar();
    setupPanelButtons();
    setupGraphicsToggle();
  }

  function setupGraphicsToggle() {
    window.GRAPHICS_QUALITY = localStorage.getItem('graphicsQuality') || 'high';
    
    const btn = document.getElementById('btn-toggle-graphics');
    const updateBtn = () => {
       if (btn) {
           btn.textContent = window.GRAPHICS_QUALITY === 'high' ? '🔆' : '🌑';
           btn.title = window.GRAPHICS_QUALITY === 'high' ? 'Graphics: High (Press L to lower)' : 'Graphics: Low (Press L to raise)';
       }
    };
    updateBtn();

    const toggle = () => {
      window.GRAPHICS_QUALITY = window.GRAPHICS_QUALITY === 'high' ? 'low' : 'high';
      localStorage.setItem('graphicsQuality', window.GRAPHICS_QUALITY);
      updateBtn();
      if (Game.Renderer && Game.Renderer.setBgDirty) {
        Game.Renderer.setBgDirty(); // Force redshift to apply pipelines
      }
      showNotification(`Graphics set to ${window.GRAPHICS_QUALITY === 'high' ? 'High (Dynamic Lights)' : 'Low (Performance)'}`);
    };

    if (btn) btn.addEventListener('click', toggle);

    document.addEventListener('keydown', (e) => {
       if (e.key.toLowerCase() === 'l' && document.activeElement.tagName !== 'INPUT') {
          toggle();
       }
    });
  }

  // ---- Main Menu Flow (New) ----
  function initMainMenu() {
    const mm = document.getElementById('main-menu-screen');
    const cc = document.getElementById('char-creation-screen');
    const ls = document.getElementById('load-game-screen');
    const ui = document.getElementById('ui-layer');

    // Populate trait grids
    populateTraitGrid('cc-trait-grid');
    populateTraitGrid('ec-trait-grid');

    // Make sure we are at Main Menu
    mm.classList.remove('hidden');
    cc.classList.add('hidden');
    ls.classList.add('hidden');
    if (ui) ui.style.display = 'none';

    // Main Menu Buttons
    document.getElementById('btn-mm-new').addEventListener('click', () => {
      mm.classList.add('hidden');
      cc.classList.remove('hidden');
    });

    document.getElementById('btn-mm-load').addEventListener('click', () => {
      buildSavesList();
      mm.classList.add('hidden');
      ls.classList.remove('hidden');
    });

    document.getElementById('btn-mm-export').addEventListener('click', () => {
      const saves = Game.State.getSaves();
      if (saves.length === 0) {
         alert('No local worlds found to export.');
         return;
      }
      Game.State.exportToFile(saves[0].id); // export the most recent
    });

    document.getElementById('btn-mm-import').addEventListener('click', () => {
      document.getElementById('file-import').click();
    });

    document.getElementById('file-import').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
         const success = Game.State.importFromFile(ev.target.result);
         if (success) {
            alert('Save imported successfully! You can now load it from the Load Game menu.');
            e.target.value = ''; // reset so we can import same file again if needed
         } else {
            alert('Failed to import save. The file may be corrupted.');
         }
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-mm-wipe').addEventListener('click', () => {
      if (confirm('WARNING: This will permanently delete ALL active saves. Are you sure you want to wipe the slate clean?')) {
        localStorage.clear();
        alert('All saves wiped! The game will now launch fresh.');
        window.location.reload();
      }
    });

    // Char Creation Buttons
    document.getElementById('btn-cc-back').addEventListener('click', () => {
      cc.classList.add('hidden');
      mm.classList.remove('hidden');
    });

    document.getElementById('btn-cc-start').addEventListener('click', () => {
      const worldName = document.getElementById('cc-world-name').value || 'My World';
      const simName = document.getElementById('cc-sim-name').value || 'Player';
      const color = document.getElementById('cc-sim-color').value || '#88CCFF';
      const form = document.getElementById('cc-sim-form').value || 'human';
      const selectedTraitCard = document.querySelector('#cc-trait-grid .trait-card.selected');
      const traitKey = selectedTraitCard ? selectedTraitCard.dataset.key : 'neat';

      Game.State.createSave(worldName, { name: simName, trait: traitKey, color: color, form: form });
      startGameLoop(cc);
    });

    // Load Screen Buttons
    document.getElementById('btn-ls-back').addEventListener('click', () => {
      ls.classList.add('hidden');
      mm.classList.remove('hidden');
    });

    // In-Game Menu Button
    document.getElementById('btn-ingame-menu').addEventListener('click', () => {
      Game.State.save();
      // To prevent Phaser canvas duplication memory leaks, simple reload is safest
      window.location.reload(); 
    });

    // Edit Character Button (In-Game Makeover)
    const btnEcClose = document.getElementById('btn-ec-close');
    if(btnEcClose) btnEcClose.addEventListener('click', closeEditModal);
    
    document.getElementById('btn-ec-save').addEventListener('click', () => {
      const simName = document.getElementById('ec-sim-name').value;
      const color = document.getElementById('ec-sim-color').value;
      const form = document.getElementById('ec-sim-form').value;
      const selectedTraitCard = document.querySelector('#ec-trait-grid .trait-card.selected');
      
      const char = Game.State.get().character;
      if(simName) char.name = simName;
      if(color) {
        char.color = parseInt(color.replace('#', '0x'), 16);
      }
      if(form) char.form = form;
      if(selectedTraitCard) {
        char.trait = selectedTraitCard.dataset.key;
      }
      closeEditModal();
      updateStatusBars();
      
      // Force renderer update to catch new color
      Game.Renderer.setBgDirty(); 
      Game.UI.showNotification('✨ Looking good!');
    });
  }

  function startGameLoop(hideScreen) {
    if (hideScreen) hideScreen.classList.add('hidden');
    const ui = document.getElementById('ui-layer');
    if (ui) ui.style.display = 'block';
    
    // Now trigger main loop init
    if (Game.Main.init) Game.Main.init();
    Game.UI.playAnnouncer('Welcome to SimLife!');
  }

  function populateTraitGrid(containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';
    const traits = Game.Config.TRAITS;
    let first = true;
    for (const [key, t] of Object.entries(traits)) {
      const card = document.createElement('div');
      card.className = 'trait-card' + (first ? ' selected' : '');
      card.dataset.key = key;
      card.innerHTML = `<div class="trait-card-title">${t.icon} ${t.label}</div><div class="trait-card-desc">${t.desc}</div>`;
      card.addEventListener('click', () => {
        grid.querySelectorAll('.trait-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      grid.appendChild(card);
      first = false;
    }
  }

  function buildSavesList() {
    const list = document.getElementById('load-saves-list');
    if (!list) return;
    list.innerHTML = '';
    const saves = Game.State.getSaves();
    if (saves.length === 0) {
      list.innerHTML = '<p style="color:var(--text-dim);">No saved worlds found.</p>';
      return;
    }

    saves.forEach(save => {
      const d = new Date(save.lastPlayed).toLocaleString();
      const slot = document.createElement('div');
      slot.className = 'save-slot';
      slot.innerHTML = `
        <div class="save-info">
          <h4>${save.name}</h4>
          <p>Sim: ${save.characterName} | Day ${save.day} | 💰$${save.money}</p>
          <p style="font-size:10px; opacity:0.6;">Last played: ${d}</p>
        </div>
        <div class="save-actions">
          <button class="btn-load">Load</button>
          <button class="btn-export">Export</button>
          <button class="btn-delete">X</button>
        </div>
      `;
      
      slot.querySelector('.btn-load').addEventListener('click', () => {
        if(Game.State.loadSlot(save.id)) {
          startGameLoop(document.getElementById('load-game-screen'));
        }
      });
      slot.querySelector('.btn-export').addEventListener('click', () => {
        Game.State.exportToFile(save.id);
      });
      slot.querySelector('.btn-delete').addEventListener('click', () => {
        if(confirm('Delete this world forever?')) {
          Game.State.deleteSave(save.id);
          buildSavesList();
        }
      });
      
      list.appendChild(slot);
    });
  }

  function openEditModal() {
    const modal = document.getElementById('edit-char-modal');
    if(!modal) return;
    const char = Game.State.get().character;
    document.getElementById('ec-sim-name').value = char.name;
    document.getElementById('ec-sim-form').value = char.form || 'human';
    
    // Hex parse
    let hex = char.color.toString(16);
    while(hex.length < 6) hex = '0' + hex;
    document.getElementById('ec-sim-color').value = '#' + hex;
    
    const grid = document.getElementById('ec-trait-grid');
    if (grid) {
      grid.querySelectorAll('.trait-card').forEach(c => {
        if (c.dataset.key === char.trait) c.classList.add('selected');
        else c.classList.remove('selected');
      });
    }
    
    modal.classList.remove('hidden');
    modal.style.display = 'block';
  }

  function closeEditModal() {
    const modal = document.getElementById('edit-char-modal');
    if(modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  // ---- Status Bars ----
  function buildStatusPanel() {
    const container = document.getElementById('needs-bars');
    if (!container) return;
    container.innerHTML = '';

    const needs = Game.Config.NEEDS;
    for (const [key, need] of Object.entries(needs)) {
      const bar = document.createElement('div');
      bar.className = 'need-bar';
      bar.innerHTML = `
        <span class="need-icon" title="${need.label}">${need.icon}</span>
        <div class="need-track-rustic">
          <div class="rustic-fill" id="need-${key}-fill"></div>
        </div>
      `;
      container.appendChild(bar);
    }
  }

  function updateStatusBars() {
    const char = Game.State.get().character;
    const time = Game.State.get().time;

    // Update need bars (Rustic smooth style)
    for (const key of Object.keys(Game.Config.NEEDS)) {
      const val = Math.max(0, Math.min(100, Math.round(char.needs[key] || 0)));
      const fillEl = document.getElementById(`need-${key}-fill`);
      if (fillEl) {
        fillEl.style.width = val + '%';
        fillEl.className = 'rustic-fill';
        if (val <= 20) fillEl.classList.add('critical');
        else if (val <= 40) fillEl.classList.add('low');
        else if (val >= 80) fillEl.classList.add('high');
      }
    }

    // Money
    const moneyEl = document.getElementById('money-display');
    if (moneyEl) moneyEl.textContent = '$' + Game.Economy.getMoney().toLocaleString();

    // Mood badge
    const moodInfo = Game.Character.getMoodInfo();
    const moodEl = document.getElementById('mood-display');
    if (moodEl) moodEl.textContent = `${moodInfo.emoji} ${moodInfo.label}`;

    // Activity
    const actEl = document.getElementById('activity-display');
    if (actEl) {
      if (char.currentActivity) {
        const actCfg = Game.Config.ACTIVITIES[char.currentActivity.type];
        let prefix = '';
        if (char.targetPosition || char.path || char.isPathfinding) {
           prefix = '🚶 Walking to ';
        }
        actEl.textContent = actCfg ? `${prefix}${actCfg.icon} ${actCfg.label} (${pct}%)` : '...';
      } else if (char.autonomy && char.autonomy.thought) {
        const actCfg = Game.Config.ACTIVITIES[char.autonomy.thought];
        actEl.textContent = actCfg ? `💭 Thinking about ${actCfg.label.toLowerCase()}...` : '💤 Idle';
      } else {
        actEl.textContent = '💤 Idle';
      }
    }

    // Autonomy indicator
    const autoEl = document.getElementById('autonomy-indicator');
    if (autoEl) {
      autoEl.textContent = char.autonomy?.enabled ? '🤖' : '🎮';
      autoEl.title = char.autonomy?.enabled ? 'Autonomy ON (Q to toggle)' : 'Manual Mode (Q to toggle)';
    }
  }

  // ---- Moodlet Display ----
  function buildMoodletBar() {
    let bar = document.getElementById('moodlet-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'moodlet-bar';
      bar.className = 'moodlet-bar';
      const statusPanel = document.getElementById('status-panel') || document.querySelector('.status-panel');
      if (statusPanel) statusPanel.appendChild(bar);
    }
  }

  function updateMoodletDisplay() {
    const bar = document.getElementById('moodlet-bar');
    if (!bar) return;
    const char = Game.State.get().character;
    const moodlets = char.moodlets || [];

    bar.innerHTML = '';
    if (moodlets.length === 0) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';

    for (const m of moodlets) {
      const chip = document.createElement('div');
      chip.className = 'moodlet-chip';
      const pct = Math.round(m.remaining / m.duration * 100);
      chip.innerHTML = `
        <span class="moodlet-icon">${m.icon}</span>
        <div class="moodlet-info">
          <span class="moodlet-name">${m.name}</span>
          <div class="moodlet-timer">
            <div class="moodlet-timer-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
      chip.title = `${m.name} (+${m.value} mood) — ${Math.ceil(m.remaining)} min left`;
      bar.appendChild(chip);
    }
  }

  // ---- Action Queue Display ----
  function buildQueueBar() {
    let bar = document.getElementById('queue-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'queue-bar';
      bar.className = 'queue-bar';
      const statusPanel = document.getElementById('status-panel') || document.querySelector('.status-panel');
      if (statusPanel) statusPanel.appendChild(bar);
    }
  }

  function updateQueueDisplay() {
    const bar = document.getElementById('queue-bar');
    if (!bar) return;
    const char = Game.State.get().character;
    const queue = char.actionQueue || [];

    bar.innerHTML = '';
    if (queue.length === 0) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';

    const label = document.createElement('span');
    label.className = 'queue-label';
    label.textContent = '📋 Queue:';
    bar.appendChild(label);

    queue.forEach((actKey, idx) => {
      const actCfg = Game.Config.ACTIVITIES[actKey];
      if (!actCfg) return;
      const item = document.createElement('div');
      item.className = 'queue-item';
      item.innerHTML = `<span>${actCfg.icon}</span>`;
      item.title = `${idx + 1}. ${actCfg.label} (click to remove)`;
      item.addEventListener('click', () => {
        char.actionQueue.splice(idx, 1);
        updateQueueDisplay();
      });
      bar.appendChild(item);
    });

    const clearBtn = document.createElement('div');
    clearBtn.className = 'queue-clear';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Clear queue';
    clearBtn.addEventListener('click', () => {
      Game.Character.clearQueue();
      updateQueueDisplay();
    });
    bar.appendChild(clearBtn);
  }

  // ---- Notifications ----
  function showNotification(msg) {
    const container = document.getElementById('notifications') || createNotifContainer();
    const el = document.createElement('div');
    el.className = 'notification';
    el.textContent = msg;
    container.appendChild(el);

    notifications.push(el);
    if (notifications.length > MAX_NOTIFICATIONS) {
      const old = notifications.shift();
      old.remove();
    }

    requestAnimationFrame(() => el.classList.add('show'));

    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => {
        el.remove();
        notifications = notifications.filter(n => n !== el);
      }, 500);
    }, 4000);
  }

  function createNotifContainer() {
    const c = document.createElement('div');
    c.id = 'notifications';
    c.className = 'notifications';
    document.body.appendChild(c);
    return c;
  }

  // ---- Events Modal ----
  function showEvent(event) {
    let modal = document.getElementById('event-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'event-modal';
      modal.className = 'event-modal';
      document.body.appendChild(modal);
    }

    let visualHtml = '';
    if (event.visual) {
      visualHtml = `<div class="event-visual">${event.visual.startsWith('http') || event.visual.startsWith('/') ? `<img src="${event.visual}" alt="Event Image">` : event.visual}</div>`;
    }

    let dialogueHtml = '';
    if (event.dialogue) {
      if (Array.isArray(event.dialogue)) {
        dialogueHtml = event.dialogue.map(d => `<div class="event-dialogue">"${d}"</div>`).join('');
      } else {
        dialogueHtml = `<div class="event-dialogue">"${event.dialogue}"</div>`;
      }
    }

    const descText = event.desc || event.description || '';
    const descHtml = descText ? `<div class="event-desc">${descText}</div>` : '';

    modal.innerHTML = `
      <div class="event-card">
        ${visualHtml}
        <h3>${event.title}</h3>
        ${dialogueHtml}
        ${descHtml}
        <div class="event-choices">
          ${event.choices.map((c, i) => `
            <button class="event-choice" data-idx="${i}">
              ${c.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    modal.querySelectorAll('.event-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        Game.Events.handleChoice(parseInt(btn.dataset.idx));
      });
    });
  }

  function hideEvent() {
    const modal = document.getElementById('event-modal');
    if (modal) modal.style.display = 'none';
  }

  // ---- Side Panels ----
  function setupPanelButtons() {
    document.querySelectorAll('[data-panel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        togglePanel(panel);
      });
    });
  }

  function togglePanel(panelName) {
    const panel = document.getElementById('side-panel');
    if (!panel) return;

    if (panel.dataset.active === panelName && !panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      panel.dataset.active = '';
      return;
    }

    panel.dataset.active = panelName;
    panel.classList.remove('hidden');

    const closeHtml = `<button class="panel-close" onclick="Game.UI.togglePanel('${panelName}')">✕</button>`;
    switch (panelName) {
      case 'build': buildBuildPanel(panel, closeHtml); break;
      case 'activities': buildActivitiesPanel(panel, closeHtml); break;
      case 'career': buildCareerPanel(panel, closeHtml); break;
      case 'social': buildSocialPanel(panel, closeHtml); break;
      case 'skills': buildSkillsPanel(panel, closeHtml); break;
      case 'legacy': buildLegacyPanel(panel, closeHtml); break;
    }
  }

  function buildBuildPanel(panel, closeHtml) {
    let html = '<div class="dialog-header"><h3>🏗️ Build Mode</h3><button class="close-btn" onclick="Game.UI.togglePanel(\'build\')">&times;</button></div>';
    html += '<div class="dialog-content">';
    // Sell mode toggle
    const sellActive = Game.State.get().ui.mode === 'sell';
    html += `<button class="sell-mode-btn ${sellActive ? 'active' : ''}" onclick="Game.UI.toggleSellMode()">🗑️ ${sellActive ? 'Exit Sell Mode' : 'Sell Mode'}</button>`;
    // Sandbox mode toggle
    const sandboxActive = Game.State.get().ui.sandboxMode;
    html += `<button class="sandbox-mode-btn ${sandboxActive ? 'active' : ''}" onclick="Game.UI.toggleSandboxMode()" style="margin-left:5px; padding:6px 12px; background: ${sandboxActive ? '#FFCC00' : 'rgba(255,255,255,0.1)'}; color: ${sandboxActive ? '#000' : '#FFF'}; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">🏖️ ${sandboxActive ? 'Sandbox ON' : 'Sandbox OFF'}</button>`;
    // Broken furniture indicator
    const activeMap = Game.State.getActiveMap();
    const broken = activeMap && activeMap.brokenFurniture ? activeMap.brokenFurniture.length : 0;
    if (broken > 0) {
      html += `<div class="broken-alert">⚠️ ${broken} broken item${broken > 1 ? 's' : ''} — click them to repair!</div>`;
    }
    html += '<h4 class="build-category">Rooms</h4><div class="build-grid">';
    for (const [key, room] of Object.entries(Game.Config.ROOMS)) {
      html += `<div class="build-item" onclick="Game.UI.startBuild('room','${key}')">
        <div class="build-item-icon">${room.icon}</div>
        <div class="build-item-name">${room.label}</div>
        <div class="build-item-cost">${sandboxActive ? 'Free' : '$' + room.baseCost}</div>
      </div>`;
    }
    html += '</div><h4 class="build-category">Furniture</h4><div class="build-grid">';
    for (const [key, furn] of Object.entries(Game.Config.FURNITURE)) {
      html += `<div class="build-item" onclick="Game.UI.startBuild('furniture','${key}')">
        <div class="build-item-icon">${furn.icon}</div>
        <div class="build-item-name">${furn.label}</div>
        <div class="build-item-cost">${sandboxActive ? 'Free' : '$' + furn.cost}</div>
      </div>`;
    }
    html += '</div></div>';
    panel.innerHTML = html;
  }

  function startBuild(type, key) {
    const ui = Game.State.get().ui;
    ui.mode = 'build';
    if (type === 'room') {
      const r = Game.Config.ROOMS[key];
      ui.buildGhost = { type: 'room', key, x: 1, y: 1, w: r.minW, h: r.minH };
    } else {
      const f = Game.Config.FURNITURE[key];
      if (!f) {
        console.warn('Game.UI.startBuild: Invalid furniture key ->', key);
        return;
      }
      ui.buildGhost = { type: 'furniture', key, x: 1, y: 1, w: f.w, h: f.h };
    }

    // Target the Phaser container, not the hidden vanilla canvas
    const container = document.querySelector('.canvas-area');
    container.addEventListener('mousemove', handleBuildMove);
    container.addEventListener('click', handleBuildClick);
  }

  function handleBuildMove(e) {
    const container = document.querySelector('.canvas-area');
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const gp = Game.Renderer.getGridPos(cx, cy);
    const ghost = Game.State.get().ui.buildGhost;
    if (ghost) {
      ghost.x = gp.x;
      ghost.y = gp.y;
    }
  }

  function handleBuildClick(e) {
    const ghost = Game.State.get().ui.buildGhost;
    const container = document.querySelector('.canvas-area');
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const gp = Game.Renderer.getGridPos(cx, cy);

    if (!ghost) {
      if (!Game.Renderer || !Game.House) return;
      // Try to pick up existing furniture
      const fHit = Game.Renderer.hitTestFurniture(Math.floor(gp.x), Math.floor(gp.y));
      if (fHit) {
        Game.House.sellFurniture(fHit.id);
        const fc = Game.Config.FURNITURE[fHit.type];
        if (fc) {
          Game.State.get().ui.buildGhost = {
            type: 'furniture',
            key: fHit.type,
            x: Math.floor(gp.x),
            y: Math.floor(gp.y),
            w: fHit.rotated ? fc.h : fc.w,
            h: fHit.rotated ? fc.w : fc.h,
            rotated: Boolean(fHit.rotated)
          };
        }
      }
      return;
    }

    if (ghost.type === 'room') {
      if (Game.House.buildRoom(ghost.key, gp.x, gp.y, ghost.w, ghost.h)) {
        showNotification(`🏠 Built ${Game.Config.ROOMS[ghost.key].label}!`);
      } else {
        showNotification(`❌ Can't build here!`);
        return; // Don't cancel — let the user try another spot
      }
    } else {
      // Find which room the click is inside of
      const room = Game.House.getRoomAt(gp.x, gp.y);
      if (!room) {
        showNotification(`❌ Place furniture inside a room!`);
        return;
      }
      if (Game.House.placeFurniture(ghost.key, room.id, gp.x, gp.y, ghost.rotated)) {
        showNotification(`🪑 Placed ${Game.Config.FURNITURE[ghost.key].label}!`);
      } else {
        showNotification(`❌ Can't place here!`);
        return;
      }
    }

    cancelBuild();
    e.stopPropagation();
  }

  function cancelBuild() {
    const ui = Game.State.get().ui;
    ui.mode = 'live';
    ui.buildGhost = null;
    const container = document.querySelector('.canvas-area');
    container.removeEventListener('mousemove', handleBuildMove);
    container.removeEventListener('click', handleBuildClick);
    Game.UI.togglePanel('build');
  }

  function toggleSellMode() {
    const ui = Game.State.get().ui;
    ui.mode = ui.mode === 'sell' ? 'live' : 'sell';
    ui.buildGhost = null;
    showNotification(ui.mode === 'sell' ? '🗑️ Sell Mode: Click furniture' : '▶️ Live Mode');
    const panel = document.getElementById('side-panel');
    if (panel) buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">✕</button>`);
  }

  // [REMOVED] First duplicate buildSkillsPanel — canonical version is below (with trait display + customize button)

  function buildActivitiesPanel(panel, closeHtml) {
    const available = Game.Character.getAvailableActivities();
    let html = (closeHtml || '') + '<h3>🎯 Activities</h3><div class="activity-list">';
    for (const act of available) {
      html += `<button class="activity-item" onclick="Game.Character.startActivity('${act.key}')">
        ${act.icon} ${act.label}
        <small>${Object.entries(act.needs).map(([k,v]) => `${Game.Config.NEEDS[k]?.icon || ''} +${v}`).join(' ')}</small>
        ${act.moodlet ? `<span class="act-moodlet">${act.moodlet.icon} ${act.moodlet.name}</span>` : ''}
      </button>`;
    }
    if (available.length === 0) html += '<p class="empty-msg">Build rooms & furniture to unlock activities!</p>';
    html += '</div>';
    panel.innerHTML = html;
  }

  function buildCareerPanel(panel, closeHtml) {
    const careerInfo = Game.Economy.getCareerInfo();
    let html = (closeHtml || '') + '<h3>💼 Career</h3>';

    if (careerInfo) {
      html += `<div class="career-info">
        <p><strong>${careerInfo.config.icon} ${careerInfo.levelConfig.title}</strong></p>
        <p>Level ${careerInfo.level + 1}/${careerInfo.config.levels.length}</p>
        <p>Salary: $${careerInfo.levelConfig.salary}/day</p>
        <p>Days Worked: ${careerInfo.daysWorked}</p>
        <p>Performance: ${Math.round(careerInfo.performance)}</p>
        ${careerInfo.nextLevel ? `<p>Next: ${careerInfo.nextLevel.title} (need ${careerInfo.config.keySkill} ${careerInfo.nextLevel.skillReq})</p>` : ''}
        <button onclick="Game.Economy.quitCareer();Game.UI.togglePanel('career')">Quit Job</button>
      </div>`;
    } else {
      html += '<p>No career yet. Choose one:</p><div class="career-list">';
      for (const [key, career] of Object.entries(Game.Config.CAREERS)) {
        html += `<button class="career-item" onclick="Game.Economy.joinCareer('${key}');Game.UI.togglePanel('career')">
          ${career.icon} ${career.label}<br><small>Key Skill: ${career.keySkill}</small>
        </button>`;
      }
      html += '</div>';
    }
    panel.innerHTML = html;
  }

  function buildSocialPanel(panel, closeHtml) {
    const rels = Game.Social.getAllRelationships();
    let html = (closeHtml || '') + '<h3>👥 Social</h3><div class="social-list">';

    for (const npc of rels) {
      const interactions = Game.Social.getAvailableInteractions(npc.id);
      html += `<div class="npc-card">
        <div class="npc-header">${npc.emoji} ${npc.name} — ${npc.levelInfo.label} (${Math.round(npc.relationship)})</div>
        <div class="npc-interactions">`;
      for (const int of interactions) {
        html += `<button class="int-btn" onclick="Game.UI.doSocialInteraction('${npc.id}','${int.key}')">${int.label}${int.cost ? ` ($${int.cost})` : ''}</button>`;
      }
      html += '</div></div>';
    }
    html += '</div>';
    panel.innerHTML = html;
  }

  function doSocialInteraction(npcId, intKey) {
    const result = Game.Social.interact(npcId, intKey);
    showNotification(result.msg);
    togglePanel('social'); // refresh
  }

  function buildSkillsPanel(panel, closeHtml) {
    const char = Game.State.get().character;
    // Trait display
    const traitCfg = Game.Config.TRAITS[char.trait];
    let html = (closeHtml || '') + '<h3>📚 Skills</h3>';
    if (traitCfg) {
      html += `<div class="trait-badge">${traitCfg.icon} <strong>${traitCfg.label}</strong> — ${traitCfg.desc}</div>`;
      html += `<button onclick="Game.UI.openEditModal()" style="margin-top:5px; background:var(--gold-dim); border:none; border-radius:4px; padding:6px; width:100%; cursor:pointer; color:#1a1412; font-weight:bold;">✨ Customise Sim</button>`;
    }
    html += '<div class="skill-list">';
    for (const [key, skill] of Object.entries(Game.Config.SKILLS)) {
      const level = char.skills[key] || 0;
      const xp = char.skillXp[key] || 0;
      const pct = Math.round(xp / skill.xpPerLevel * 100);
      html += `<div class="skill-item">
        <span>${skill.icon} ${skill.label}</span>
        <span>Lv. ${level}/${skill.maxLevel}</span>
        <div class="skill-bar"><div class="skill-fill" style="width:${pct}%"></div></div>
      </div>`;
    }
    html += '</div>';
    panel.innerHTML = html;
  }

  function buildLegacyPanel(panel, closeHtml) {
    const prestige = Game.Prestige.getPrestige();
    const points = Game.Prestige.calculateLegacyPoints();
    const upgrades = Game.Prestige.getUpgradeInfo();
    const canP = Game.Prestige.canPrestige();

    let html = (closeHtml || '') + `<h3>🌟 Legacy</h3>
      <p>Generation: ${prestige.generation}</p>
      <p>Legacy Points: ${prestige.legacyPoints} LP</p>
      <p>Points if reset now: +${points} LP</p>`;

    if (canP) {
      html += `<button class="prestige-btn" onclick="if(confirm('Start next generation?'))Game.Prestige.doPrestige()">🔄 New Generation</button>`;
    } else {
      html += `<p class="hint">Play ${30 - Game.State.get().time.day} more days to unlock.</p>`;
    }

    html += '<h4>Upgrades</h4><div class="upgrade-list">';
    for (const upg of upgrades) {
      html += `<div class="upgrade-item">
        <p><strong>${upg.label}</strong> (Lv ${upg.currentLevel}/${upg.maxLevel})</p>
        <p class="desc">${upg.description}</p>
        ${upg.maxed ? '<span class="maxed">MAXED</span>' : `<button ${upg.affordable ? '' : 'disabled'} onclick="Game.Prestige.buyUpgrade('${upg.key}');Game.UI.togglePanel('legacy')">${upg.nextCost} LP</button>`}
      </div>`;
    }
    html += '</div>';

    // ---- Achievements ----
    const char = Game.State.get().character;
    const unlockedAchs = char.achievements || [];
    html += '<h4>🏆 Achievements</h4><div class="upgrade-list" style="display:flex; flex-wrap:wrap; gap:5px;">';
    for (const [key, ach] of Object.entries(Game.Config.ACHIEVEMENTS)) {
      const isUnlocked = unlockedAchs.includes(key);
      html += `<div style="flex: 1 1 45%; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; opacity: ${isUnlocked ? 1 : 0.4};">
        <div style="font-weight:bold; margin-bottom:4px;">${ach.icon} ${ach.label}</div>
        <div style="font-size:10px;">${ach.desc}</div>
      </div>`;
    }
    html += '</div>';

    // ---- Collections ----
    const unlockedCols = char.collection || [];
    if (unlockedCols.length > 0) {
      html += '<h4>🪆 Collections Showcase</h4><div style="display:flex; flex-wrap:wrap; gap:10px; padding: 10px; background: rgba(0,0,0,0.1); border-radius:4px; margin-top:10px;">';
      for (const colId of unlockedCols) {
        const item = Game.Config.COLLECTIONS[colId];
        if (item) {
          html += `<div title="${item.label}" style="font-size:24px; background:var(--bg-panel); padding:5px; border-radius:5px; border:1px solid rgba(255,255,255,0.1); cursor:help;">${item.icon}</div>`;
        }
      }
      html += '</div>';
    }

    panel.innerHTML = html;
  }

  return {
    init,
    initMainMenu,
    openEditModal,
    updateStatusBars,
    updateMoodletDisplay,
    updateQueueDisplay,
    showNotification,
    showEvent,
    hideEvent,
    togglePanel,
    startBuild,
    cancelBuild,
    doSocialInteraction,
    toggleSellMode,
    toggleSandboxMode,
    playAnnouncer,
  };

  function playAnnouncer(text) {
    const overlay = document.getElementById('announcer-overlay');
    const txt = document.getElementById('announcer-text');
    if (!overlay || !txt) return;
    
    txt.innerText = text;
    overlay.style.display = 'block';
    overlay.classList.remove('hidden');
    
    // Force reflow to restart animation
    txt.style.animation = 'none';
    txt.offsetHeight; /* trigger reflow */
    txt.style.animation = null;
    
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.add('hidden');
    }, 2500);
  }

  function toggleSellMode() {
    const ui = Game.State.get().ui;
    const container = document.querySelector('.canvas-area');
    if (ui.mode === 'sell') {
      ui.mode = 'live';
      // Always clean up handler on exit
      container.removeEventListener('click', handleSellClick);
      Game.UI.showNotification('🚪 Exited sell mode');
    } else {
      ui.mode = 'sell';
      Game.UI.showNotification('🗑️ Sell Mode: Click furniture to sell, rooms to demolish');
      // Set up sell click handler on the Phaser container
      container.addEventListener('click', handleSellClick);
    }
    // Refresh build panel
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">✕</button>`);
    }
  }

  function toggleSandboxMode() {
    const ui = Game.State.get().ui;
    ui.sandboxMode = !ui.sandboxMode;
    Game.UI.showNotification(ui.sandboxMode ? '🏖️ Sandbox Mode: Free Building Enabled!' : '🏖️ Sandbox Mode Disabled');
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">✕</button>`);
    }
  }

  function handleSellClick(e) {
    const ui = Game.State.get().ui;
    if (ui.mode !== 'sell') {
      const container = document.querySelector('.canvas-area');
      container.removeEventListener('click', handleSellClick);
      return;
    }

    const container = document.querySelector('.canvas-area');
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const gp = Game.Renderer.getGridPos(cx, cy);

    // Try to sell furniture first
    const furn = Game.House.getFurnitureAt(gp.x, gp.y);
    if (furn) {
      // Clean from broken list too
      if (Game.Character.repairFurniture) Game.Character.repairFurniture(furn.id);
      Game.House.sellFurniture(furn.id);
      e.stopPropagation();
      return;
    }

    // Try to demolish room
    const room = Game.House.getRoomAt(gp.x, gp.y);
    if (room) {
      Game.House.removeRoom(room.id);
      e.stopPropagation();
      return;
    }
  }

})();
