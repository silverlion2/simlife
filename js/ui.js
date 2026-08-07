// ============================================================
// SimLife — UI System (Status Bars, Panels, Notifications)
// ============================================================
window.Game = window.Game || {};

Game.UI = (function() {
  let notifications = [];
  const MAX_NOTIFICATIONS = 3;
  let createAvatarEditor = null;
  let editAvatarEditor = null;
  let editDraftAppearance = null;
  let buildPanelTab = 'rooms';

  function init() {
    buildStatusPanel();
    buildMoodletBar();
    buildQueueBar();
    updateInteractionHint();
    setupPlacementActions();
    setupPanelButtons();
    setupDailyFocus();
    setupGraphicsToggle();
  }

  function getAppearancePrimaryColor(appearance) {
    const state = Game.Appearance.getActiveFormState(appearance);
    const value = state.colors.primary || Object.values(state.colors)[0] || '#88CCFF';
    const resolved = Game.AvatarCatalog.COLOR_VALUES[value] || value;
    return parseInt(String(resolved).replace('#', '0x'), 16);
  }

  function getLegacyFormFromAppearance(appearance) {
    return appearance && appearance.form === 'witch' ? 'online_witch' : appearance.form;
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
    const localSaves = Game.State.getSaves();

    document.title = 'SimLife: Hearthbyte Edition';
    const menuTitle = mm.querySelector('.bounce-title');
    if (menuTitle) menuTitle.textContent = 'SimLife';
    const newButton = document.getElementById('btn-mm-new');
    const loadButton = document.getElementById('btn-mm-load');
    const exportButton = document.getElementById('btn-mm-export');
    const importButton = document.getElementById('btn-mm-import');
    const wipeButton = document.getElementById('btn-mm-wipe');
    if (newButton) newButton.innerHTML = 'NEW STORY <small>Create a fresh Sim</small>';
    if (loadButton) {
      loadButton.innerHTML = localSaves.length
        ? `CONTINUE <small>${localSaves.length} saved ${localSaves.length === 1 ? 'world' : 'worlds'}</small>`
        : 'LOAD WORLD <small>No saved worlds yet</small>';
    }
    if (exportButton) exportButton.textContent = 'EXPORT';
    if (importButton) importButton.textContent = 'IMPORT';
    if (wipeButton) wipeButton.textContent = 'RESET SAVE DATA';

    // Populate trait grids
    populateTraitGrid('cc-trait-grid');
    populateTraitGrid('ec-trait-grid');
    createAvatarEditor = Game.AvatarEditor.mount('cc-avatar-editor', Game.Appearance.fromLegacy({ form: 'online_witch', color: 0x88CCFF }));

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
      const appearance = createAvatarEditor ? createAvatarEditor.getAppearance() : Game.Appearance.fromLegacy({ form: 'online_witch', color: 0x88CCFF });
      const form = getLegacyFormFromAppearance(appearance);
      const color = getAppearancePrimaryColor(appearance);
      const selectedTraitCard = document.querySelector('#cc-trait-grid .trait-card.selected');
      const traitKey = selectedTraitCard ? selectedTraitCard.dataset.key : 'neat';

      Game.State.createSave(worldName, { name: simName, trait: traitKey, color: color, form: form, appearance: appearance });
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
    const btnEcCancel = document.getElementById('btn-ec-cancel');
    if(btnEcCancel) btnEcCancel.addEventListener('click', closeEditModal);
    
    document.getElementById('btn-ec-save').addEventListener('click', () => {
      const simName = document.getElementById('ec-sim-name').value;
      const appearance = editDraftAppearance || (editAvatarEditor ? editAvatarEditor.getAppearance() : null);
      const selectedTraitCard = document.querySelector('#ec-trait-grid .trait-card.selected');
      
      const char = Game.State.get().character;
      if(simName) char.name = simName;
      if(appearance) {
        char.appearance = appearance;
        char.form = getLegacyFormFromAppearance(appearance);
        char.color = getAppearancePrimaryColor(appearance);
      }
      if(selectedTraitCard) {
        char.trait = selectedTraitCard.dataset.key;
      }
      closeEditModal();
      updateStatusBars();
      
      // Force renderer update to catch new color
      Game.Renderer.setBgDirty(); 
      Game.UI.showNotification('✨ Looking good!');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const editModal = document.getElementById('edit-char-modal');
      if (editModal && !editModal.classList.contains('hidden')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeEditModal();
      }
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
    const startingAppearance = char.appearance || Game.Appearance.fromLegacy(char);
    editDraftAppearance = Game.Appearance.normalizeAppearance(startingAppearance);
    editAvatarEditor = Game.AvatarEditor.mount('ec-avatar-editor', startingAppearance, {
      onChange: (appearance) => {
        editDraftAppearance = appearance;
      }
    });
    
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
    editDraftAppearance = null;
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
      bar.dataset.need = key;
      bar.innerHTML = `
        <span class="need-icon" title="${need.label}">${need.icon}</span>
        <span class="need-name">${need.label}</span>
        <div class="need-track-rustic" role="meter" aria-label="${need.label}" aria-valuemin="0" aria-valuemax="100">
          <div class="rustic-fill" id="need-${key}-fill"></div>
        </div>
        <span class="need-value" id="need-${key}-value">100</span>
      `;
      container.appendChild(bar);
    }
  }

  function setupPlacementActions() {
    const rotateBtn = document.getElementById('btn-placement-rotate');
    const cancelBtn = document.getElementById('btn-placement-cancel');
    if (rotateBtn) rotateBtn.addEventListener('click', rotateBuildGhost);
    if (cancelBtn) cancelBtn.addEventListener('click', exitCurrentMode);
  }

  function setupDailyFocus() {
    const focus = document.getElementById('daily-focus');
    if (!focus) return;
    focus.addEventListener('click', () => {
      const panel = focus.dataset.focusPanel || 'goals';
      togglePanel(panel);
    });

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
        const trackEl = fillEl.parentElement;
        if (trackEl) {
          const label = Game.Config.NEEDS[key]?.label || key;
          trackEl.setAttribute('aria-valuenow', String(val));
          trackEl.title = `${label}: ${val}%`;
        }
      }
      const valueEl = document.getElementById(`need-${key}-value`);
      if (valueEl) {
        valueEl.textContent = String(val);
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
        const pct = Math.max(0, Math.min(100, Math.round((char.activityProgress || 0) * 100)));
        let prefix = '';
        if (char.targetPosition || char.path || char.isPathfinding) {
           prefix = 'Walking to ';
        }
        actEl.textContent = actCfg ? `${prefix}${actCfg.icon} ${actCfg.label} (${pct}%)` : '...';
        actEl.dataset.state = 'active';
      } else if (char.autonomy && char.autonomy.thought) {
        const actCfg = Game.Config.ACTIVITIES[char.autonomy.thought];
        actEl.textContent = actCfg ? `Thinking about ${actCfg.label.toLowerCase()}...` : 'Idle';
        actEl.dataset.state = 'thinking';
      } else {
        actEl.textContent = 'Idle';
        actEl.dataset.state = 'idle';
      }
    }

    // Autonomy indicator
    const autoEl = document.getElementById('autonomy-indicator');
    if (autoEl) {
      autoEl.textContent = char.autonomy?.enabled ? '🤖' : '🎮';
      autoEl.title = char.autonomy?.enabled ? 'Autonomy ON (Q to toggle)' : 'Manual Mode (Q to toggle)';
    }

    updateInteractionHint();
    updateDailyFocus();
  }

  function updateDailyFocus() {
    const focus = document.getElementById('daily-focus');
    if (!focus || !Game.State || !Game.State.get) return;

    const state = Game.State.get();
    const char = state.character || {};
    const needs = char.needs || {};
    const makeFocus = (kicker, text, panel, tone) => ({ kicker, text, panel, tone: tone || 'normal' });
    const lowNeeds = Object.keys(Game.Config.NEEDS || {})
      .map(key => ({ key, value: Math.round(needs[key] ?? 100), label: Game.Config.NEEDS[key]?.label || key }))
      .sort((a, b) => a.value - b.value);
    const criticalNeed = lowNeeds.find(item => item.value <= 35);
    const softNeed = lowNeeds.find(item => item.value <= 55);
    const readyGoal = Game.HomeGoals && Game.HomeGoals.getActiveGoals
      ? Game.HomeGoals.getActiveGoals().find(goal => goal.complete)
      : null;
    const openGoal = Game.HomeGoals && Game.HomeGoals.getActiveGoals
      ? Game.HomeGoals.getActiveGoals().find(goal => !goal.complete)
      : null;
    const readyCollection = Game.HomeCollections && Game.HomeCollections.getCollections
      ? Game.HomeCollections.getCollections().find(collection => collection.claimable)
      : null;
    const campaignChapter = Game.Campaign?.getCurrentChapter?.() || null;
    const firstDayFocus = (() => {
      if ((state.time?.day || 1) !== 1) return null;
      const queueLength = Array.isArray(char.actionQueue) ? char.actionQueue.length : 0;
      if (!char.currentActivity && queueLength === 0 && (state.time?.totalMinutes || 0) < 180) {
        return makeFocus('First Move', 'Open Do and start one quick activity.', 'activities', 'ready');
      }
      if (char.currentActivity || queueLength > 0) {
        return makeFocus('Good Start', 'Activity is running. Pick a career next.', 'career', 'ready');
      }
      if (Game.Economy && Game.Economy.getCareerInfo && !Game.Economy.getCareerInfo()) {
        return makeFocus('First Income', 'Choose a career path for daily cash.', 'career', 'ready');
      }
      if (openGoal) {
        return makeFocus('First Reward', openGoal.desc || openGoal.title, 'goals');
      }
      return makeFocus('Explore', 'Open Market or Social for the next loop.', 'market');
    })();

    let next = makeFocus('Today', 'Choose a goal to start building momentum.', 'goals');
    if (criticalNeed) {
      next = makeFocus('Need Care', `${criticalNeed.label} is low. Open Do and fix it now.`, 'activities', 'urgent');
    } else if (campaignChapter) {
      next = makeFocus(`Chapter ${campaignChapter.number}`, campaignChapter.objective, campaignChapter.target, 'ready');
    } else if (firstDayFocus) {
      next = firstDayFocus;
    } else if (readyGoal) {
      next = makeFocus('Reward Ready', `Claim ${readyGoal.title}.`, 'goals', 'ready');
    } else if (readyCollection) {
      next = makeFocus('Set Complete', `Claim ${readyCollection.title}.`, 'collections', 'ready');
    } else if (softNeed) {
      next = makeFocus('Keep Flow', `${softNeed.label} is dipping. Pick a quick activity.`, 'activities', 'warn');
    } else if (Game.Economy && Game.Economy.getCareerInfo && !Game.Economy.getCareerInfo()) {
      next = makeFocus('Next Step', 'Pick a career path for daily income.', 'career');
    } else if (openGoal) {
      next = makeFocus('Home Goal', openGoal.desc || openGoal.title, 'goals');
    }

    focus.dataset.focusPanel = next.panel;
    focus.dataset.tone = next.tone;
    const kicker = focus.querySelector('.daily-focus-kicker');
    const text = focus.querySelector('.daily-focus-text');
    if (kicker) kicker.textContent = next.kicker;
    if (text) text.textContent = next.text;
  }

  function updateInteractionHint() {
    const hint = document.getElementById('interaction-hint');
    const actions = document.getElementById('placement-actions');
    const rotateBtn = document.getElementById('btn-placement-rotate');
    const cancelBtn = document.getElementById('btn-placement-cancel');
    if (!hint || !Game.State || !Game.State.get) return;

    const ui = Game.State.get().ui || {};
    const hasBuildGhost = ui.mode === 'build' && ui.buildGhost;
    const hasModalMode = hasBuildGhost || ui.mode === 'sell' || ui.mode === 'store';
    const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    let text = '';
    if (hasBuildGhost) {
      const ghost = ui.buildGhost;
      const item = ghost.type === 'room'
        ? Game.Config.ROOMS[ghost.key]
        : Game.Config.FURNITURE[ghost.key];
      const label = item ? item.label : 'Selection';
      text = isTouch
        ? `${label}: tap to place - Rotate if needed - Cancel exits`
        : `${label}: click to place - R rotate - Esc cancel`;
    } else if (ui.mode === 'sell') {
      text = isTouch ? 'Sell mode: tap furniture to sell - Cancel exits' : 'Sell mode: click furniture to sell - Esc exits';
    } else if (ui.mode === 'store') {
      text = isTouch ? 'Storage mode: tap furniture to store - Cancel exits' : 'Storage mode: click furniture to store - Esc exits';
    }

    if (actions) {
      actions.classList.toggle('hidden', !hasModalMode);
      actions.classList.toggle('placement-actions-compact', !hasBuildGhost);
    }
    if (rotateBtn) rotateBtn.hidden = !hasBuildGhost;
    if (cancelBtn) cancelBtn.textContent = hasBuildGhost ? 'Cancel' : 'Exit Mode';

    if (!text) {
      hint.classList.add('hidden');
      hint.textContent = '';
      return;
    }

    hint.textContent = text;
    hint.classList.remove('hidden');
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
    const tone = getNotificationTone(msg);
    el.className = `notification notification-${tone}`;
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
    c.setAttribute('aria-live', 'polite');
    c.setAttribute('aria-atomic', 'false');
    document.body.appendChild(c);
    return c;
  }

  function getNotificationTone(msg) {
    const text = String(msg || '').toLowerCase();
    if (text.includes("can't") || text.includes('cannot') || text.includes('warning') || text.includes('failed')) return 'danger';
    if (text.includes('queued') || text.includes('built') || text.includes('placed') || text.includes('reward') || text.includes('arrived')) return 'success';
    return 'info';
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
        setMobilePanelMenu(false);
      });
    });

    const mobileMenuToggle = document.getElementById('btn-mobile-panels');
    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener('click', () => {
        setMobilePanelMenu(!document.body.classList.contains('mobile-panel-menu-open'));
      });
      setMobilePanelMenu(false);
      window.addEventListener('resize', () => {
        if (window.innerWidth > 620) setMobilePanelMenu(false);
      });
    }
  }

  function setSidePanelOpen(isOpen) {
    document.body.classList.toggle('side-panel-open', Boolean(isOpen));
  }

  function setMobilePanelMenu(isOpen) {
    const open = Boolean(isOpen);
    document.body.classList.toggle('mobile-panel-menu-open', open);
    const toggle = document.getElementById('btn-mobile-panels');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '- Less' : '+ More';
    }
  }

  function togglePanel(panelName) {
    const panel = document.getElementById('side-panel');
    if (!panel) return;

    if (panel.dataset.active === panelName && !panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      panel.dataset.active = '';
      setSidePanelOpen(false);
      return;
    }

    panel.dataset.active = panelName;
    panel.classList.remove('hidden');
    setSidePanelOpen(true);

    const closeHtml = `<button class="panel-close" onclick="Game.UI.togglePanel('${panelName}')">✕</button>`;
    switch (panelName) {
      case 'build': buildBuildPanel(panel, closeHtml); break;
      case 'market': buildMarketPanel(panel, closeHtml); break;
      case 'collections': buildCollectionsPanel(panel, closeHtml); break;
      case 'goals': buildGoalsPanel(panel, closeHtml); break;
      case 'activities': buildActivitiesPanel(panel, closeHtml); break;
      case 'career': buildCareerPanel(panel, closeHtml); break;
      case 'social': buildSocialPanel(panel, closeHtml); break;
      case 'skills': buildSkillsPanel(panel, closeHtml); break;
      case 'legacy': buildLegacyPanel(panel, closeHtml); break;
      case 'campaign':
        if (Game.Campaign?.renderPanel) Game.Campaign.renderPanel(panel);
        break;
    }
  }

  function buildBuildPanel(panel, closeHtml) {
    let html = '<div class="dialog-header"><h3>🏗️ Build Mode</h3><button class="close-btn" onclick="Game.UI.togglePanel(\'build\')">&times;</button></div>';
    html += '<div class="dialog-content">';
    // Sell mode toggle
    const sellActive = Game.State.get().ui.mode === 'sell';
    html += '<div class="build-mode-actions">';
    html += `<button class="sell-mode-btn ${sellActive ? 'active' : ''}" onclick="Game.UI.toggleSellMode()">🗑️ ${sellActive ? 'Exit Sell Mode' : 'Sell Mode'}</button>`;
    const storeActive = Game.State.get().ui.mode === 'store';
    html += `<button class="store-mode-btn ${storeActive ? 'active' : ''}" data-action="store-mode" onclick="Game.UI.toggleStoreMode()">Storage ${storeActive ? 'ON' : 'Mode'}</button>`;
    // Sandbox mode toggle
    const sandboxActive = Game.State.get().ui.sandboxMode;
    let growthHtml = '';
    if (Game.HomeGrowth) {
      const growth = Game.HomeGrowth.ensureState();
      const levelInfo = Game.HomeGrowth.getCurrentLevelInfo();
      const floorInfo = Game.HomeGrowth.getFloorInfo();
      const nextText = growth.nextLevelValue
        ? `$${Math.max(0, growth.nextLevelValue - growth.homeValue).toLocaleString()} to next level`
        : 'Max home level';
      const meterMax = growth.nextLevelValue || growth.homeValue || 1;
      growthHtml += `<div class="home-growth-card">
        <div><strong>${levelInfo.label}</strong> <span>Level ${growth.level}</span></div>
        <div class="home-growth-meter"><span style="width:${Math.min(100, Math.round((growth.homeValue / meterMax) * 100))}%"></span></div>
        <small>Home value $${growth.homeValue.toLocaleString()} - ${nextText}</small>
      </div>`;
      growthHtml += '<div class="floor-controls">';
      for (const floor of floorInfo.floors) {
        const householdFloor = Game.State.get().character.floor || 0;
        growthHtml += `<button class="${floor.active ? 'active' : ''}" onclick="Game.UI.setBuildFloor(${floor.level})">${floor.label}</button>`;
        growthHtml += `<button class="travel-floor-btn ${householdFloor === floor.level ? 'active' : ''}" data-travel-floor="${floor.level}" onclick="Game.UI.travelToFloor(${floor.level})">${householdFloor === floor.level ? 'Here' : 'Go'}</button>`;
      }
      growthHtml += `<button ${floorInfo.canAddFloor ? '' : 'disabled'} title="${floorInfo.addFloorReason || 'Add another story'}" onclick="Game.UI.buyFloor()">+ Floor ${floorInfo.canAddFloor ? '$' + floorInfo.addFloorCost.toLocaleString() : ''}</button>`;
      growthHtml += '</div>';
      if (Game.HomeGrowth.getLotInfo) {
        const lotInfo = Game.HomeGrowth.getLotInfo();
        growthHtml += `<div class="lot-expansion-card">
          <div>
            <strong>Land</strong>
            <small>${lotInfo.width}x${lotInfo.height} lot</small>
          </div>
          <button data-action="expand-lot" ${lotInfo.canExpand ? '' : 'disabled'} title="${lotInfo.expandReason || 'Expand buildable land'}" onclick="Game.UI.expandLot()">${lotInfo.canExpand ? `Expand $${lotInfo.expandCost.toLocaleString()}` : lotInfo.expandReason}</button>
        </div>`;
      }
    }
    html += `<button class="sandbox-mode-btn ${sandboxActive ? 'active' : ''}" onclick="Game.UI.toggleSandboxMode()">🏖️ ${sandboxActive ? 'Sandbox ON' : 'Sandbox OFF'}</button>`;
    html += '</div>';
    // Broken furniture indicator
    const activeMap = Game.State.getActiveMap();
    const broken = activeMap && activeMap.brokenFurniture ? activeMap.brokenFurniture.length : 0;
    if (broken > 0) {
      html += `<div class="broken-alert">Maintenance: ${broken} broken item${broken > 1 ? 's' : ''} - click them to repair.</div>`;
    }
    const activeFloor = Game.HomeGrowth && Game.HomeGrowth.getActiveFloor ? Game.HomeGrowth.getActiveFloor(activeMap) : (activeMap.activeFloor || 0);
    const renovationRooms = (activeMap.rooms || []).filter(room => (room.floor || 0) === activeFloor);
    let renovationHtml = '';
    if (renovationRooms.length) {
      renovationHtml += '<h4 class="build-category">Renovation</h4><div class="renovation-list">';
      for (const room of renovationRooms) {
        const roomCfg = Game.Config.ROOMS[room.type] || { label: room.type };
        const furnishingOptions = Game.House.getFurnishingOptions ? Game.House.getFurnishingOptions(room.id) : [];
        renovationHtml += `<div class="renovation-room">
          <div>
            <strong>${roomCfg.label}</strong>
            <small>${room.w}x${room.h}</small>
          </div>
          <div class="renovation-actions">
            <button data-renovate-action="w-minus" onclick="Game.UI.resizeRoom('${room.id}', -1, 0)">-W</button>
            <button data-renovate-action="w-plus" onclick="Game.UI.resizeRoom('${room.id}', 1, 0)">+W</button>
            <button data-renovate-action="h-minus" onclick="Game.UI.resizeRoom('${room.id}', 0, -1)">-H</button>
            <button data-renovate-action="h-plus" onclick="Game.UI.resizeRoom('${room.id}', 0, 1)">+H</button>
            ${furnishingOptions.map(option => `<button data-furnish-preset="${option.key}" ${option.available ? '' : 'disabled'} title="${option.reason || option.label}" onclick="Game.UI.furnishRoom('${room.id}','${option.key}')">${option.available ? `Furnish $${option.cost.toLocaleString()}` : option.label}</button>`).join('')}
          </div>
        </div>`;
      }
      renovationHtml += '</div>';
    }
    const storedObjects = Game.HomeGrowth && Game.HomeGrowth.getInventoryObjects ? Game.HomeGrowth.getInventoryObjects() : [];
    const buildTabs = [
      { key: 'rooms', label: 'Rooms', count: Object.keys(Game.Config.ROOMS).length },
      { key: 'furniture', label: 'Furniture', count: Object.keys(Game.Config.FURNITURE).length },
      { key: 'storage', label: 'Storage', count: storedObjects.length, disabled: storedObjects.length === 0 },
      { key: 'renovate', label: 'Renovate', count: renovationRooms.length, disabled: !growthHtml && renovationRooms.length === 0 },
    ];
    if (!buildTabs.some(tab => tab.key === buildPanelTab && !tab.disabled)) buildPanelTab = 'rooms';
    html += '<div class="build-tabs" role="tablist" aria-label="Build categories">';
    for (const tab of buildTabs) {
      html += `<button class="build-tab ${buildPanelTab === tab.key ? 'active' : ''}" role="tab" data-build-tab="${tab.key}" aria-selected="${buildPanelTab === tab.key}" ${tab.disabled ? 'disabled' : ''} onclick="Game.UI.setBuildPanelTab('${tab.key}')">${tab.label}<span>${tab.count}</span></button>`;
    }
    html += '</div>';

    if (buildPanelTab === 'rooms') {
      html += '<h4 class="build-category">Rooms</h4><div class="build-grid">';
      for (const [key, room] of Object.entries(Game.Config.ROOMS)) {
        const locked = !!(Game.HomeGrowth && !Game.HomeGrowth.isRoomUnlocked(key));
        const lockReason = locked && Game.HomeGrowth.getRoomLockReason ? Game.HomeGrowth.getRoomLockReason(key) : '';
        html += `<div class="build-item ${locked ? 'locked' : ''}" ${locked ? `title="${lockReason}"` : `onclick="Game.UI.startBuild('room','${key}')"`}>
          <div class="build-item-icon">${room.icon}</div>
          <div class="build-item-name">${room.label}</div>
          <div class="build-item-cost">${locked ? lockReason : (sandboxActive ? 'Free' : '$' + room.baseCost)}</div>
        </div>`;
      }
      html += '</div>';
    } else if (buildPanelTab === 'furniture') {
      html += '<h4 class="build-category">Furniture</h4><div class="build-grid">';
      for (const [key, furn] of Object.entries(Game.Config.FURNITURE)) {
        const locked = !!(Game.HomeGrowth && !Game.HomeGrowth.isFurnitureUnlocked(key));
        const lockReason = locked && Game.HomeGrowth.getFurnitureLockReason ? Game.HomeGrowth.getFurnitureLockReason(key) : '';
        html += `<div class="build-item ${locked ? 'locked' : ''}" ${locked ? `title="${lockReason}"` : `onclick="Game.UI.startBuild('furniture','${key}')"`}>
          <div class="build-item-icon">${furn.icon}</div>
          <div class="build-item-name">${furn.label}</div>
          <div class="build-item-cost">${locked ? lockReason : (sandboxActive ? 'Free' : '$' + furn.cost)}</div>
        </div>`;
      }
      html += '</div>';
    } else if (buildPanelTab === 'storage') {
      html += '<h4 class="build-category">Stored Objects</h4><div class="build-grid">';
      for (const object of storedObjects) {
        const furn = Game.Config.FURNITURE[object.type];
        if (!furn) continue;
        html += `<div class="build-item stored" onclick="Game.UI.startBuild('stored','${object.id}')">
          <div class="build-item-icon">${furn.icon}</div>
          <div class="build-item-name">${furn.label}</div>
          <div class="build-item-cost">Owned</div>
        </div>`;
      }
      html += storedObjects.length ? '</div>' : '</div><p class="empty-msg">Store or earn objects to place them later.</p>';
    } else if (buildPanelTab === 'renovate') {
      if (growthHtml) {
        html += '<h4 class="build-category">Home Layout</h4><div class="build-home-tools">';
        html += growthHtml;
        html += '</div>';
      }
      html += renovationHtml || '<h4 class="build-category">Renovation</h4><p class="empty-msg">Build a room on this floor to unlock resize and furnish controls.</p>';
    }
    html += '</div>';
    panel.innerHTML = html;
  }

  function setBuildPanelTab(tab) {
    buildPanelTab = tab;
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">✕</button>`);
    }
  }

  function buildMarketPanel(panel, closeHtml) {
    const offers = Game.ObjectMarket ? Game.ObjectMarket.getDailyOffers() : [];
    const storedCount = Game.HomeGrowth && Game.HomeGrowth.getInventoryObjects ? Game.HomeGrowth.getInventoryObjects().length : 0;
    let html = (closeHtml || '') + '<h3>Object Market</h3>';
    html += `<div class="market-summary">
      <strong>Daily Finds</strong>
      <span>${storedCount} stored object${storedCount === 1 ? '' : 's'}</span>
    </div>`;
    html += '<div class="market-grid">';
    for (const offer of offers) {
      const furn = Game.Config.FURNITURE[offer.type];
      if (!furn) continue;
      const affordable = Game.Economy && Game.Economy.canAfford(offer.price);
      html += `<div class="market-item">
        <div class="market-item-icon">${furn.icon}</div>
        <div class="market-item-name">${furn.label}</div>
        <div class="market-item-room">${Game.Config.ROOMS[furn.room]?.label || furn.room}</div>
        <button ${affordable ? '' : 'disabled'} onclick="Game.UI.buyMarketOffer('${offer.id}')">
          ${affordable ? 'Buy' : 'Need'} $${offer.price.toLocaleString()}
        </button>
      </div>`;
    }
    if (!offers.length) {
      html += '<p class="empty-msg">New object offers arrive tomorrow.</p>';
    }
    html += '</div>';
    if (Game.ObjectCrafting && Game.ObjectCrafting.getAvailableRecipes) {
      const recipes = Game.ObjectCrafting.getAvailableRecipes();
      html += '<h4 class="build-category">Workshop Crafting</h4><div class="crafting-grid">';
      for (const recipe of recipes) {
        html += `<div class="crafting-item ${recipe.available ? '' : 'locked'}">
          <div class="crafting-item-icon">${recipe.outputIcon}</div>
          <div>
            <strong>${recipe.label}</strong>
            <small>${recipe.outputLabel} - $${recipe.cost.toLocaleString()} materials</small>
          </div>
          <button ${recipe.available ? '' : 'disabled'} onclick="Game.UI.craftObject('${recipe.id}')">${recipe.available ? 'Craft' : recipe.reason}</button>
        </div>`;
      }
      html += '</div>';
    }
    panel.innerHTML = html;
  }

  function buyMarketOffer(offerId) {
    if (!Game.ObjectMarket) return;
    const result = Game.ObjectMarket.buyOffer(offerId);
    showNotification(result.success ? 'Object added to storage.' : result.reason);
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'market') {
      buildMarketPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('market')">✕</button>`);
    }
  }

  function craftObject(recipeId) {
    if (!Game.ObjectCrafting || !Game.ObjectCrafting.craftObject) return;
    const result = Game.ObjectCrafting.craftObject(recipeId);
    showNotification(result.success ? 'Crafted object moved to storage.' : result.reason);
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'market') {
      buildMarketPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('market')">✕</button>`);
    }
  }

  function buildGoalsPanel(panel, closeHtml) {
    const goals = Game.HomeGoals ? Game.HomeGoals.getActiveGoals() : [];
    let html = (closeHtml || '') + '<h3>Household Goals</h3>';
    const readyCount = goals.filter(goal => goal.complete).length;
    const totalReward = goals.reduce((sum, goal) => sum + (goal.rewardMoney || 0), 0);
    html += `<div class="goal-summary">
      <div class="goal-summary-stat"><strong>${readyCount}/${goals.length || 0}</strong><span>Ready</span></div>
      <div class="goal-summary-stat"><strong>$${totalReward.toLocaleString()}</strong><span>Rewards</span></div>
      <div class="goal-summary-note">Build, decorate, and expand the home to unlock the next reward loop.</div>
    </div>`;
    html += '<div class="goal-list">';
    for (const goal of goals) {
      const rewardNames = (goal.rewardObjects || [])
        .map(type => Game.Config.FURNITURE[type]?.label || type)
        .join(', ');
      html += `<div class="goal-card ${goal.complete ? 'complete' : ''}">
        <div class="goal-card-header">
          <strong>${goal.title}</strong>
          <span>${goal.complete ? 'Ready' : 'Open'}</span>
        </div>
        <p>${goal.desc}</p>
        <small>$${goal.rewardMoney.toLocaleString()}${rewardNames ? ` + ${rewardNames}` : ''}</small>
        <button ${goal.complete ? '' : 'disabled'} onclick="Game.UI.claimHomeGoal('${goal.id}')">${goal.complete ? 'Claim' : 'In Progress'}</button>
      </div>`;
    }
    if (!goals.length) html += '<p class="empty-msg">No open goals right now.</p>';
    html += '</div>';
    panel.innerHTML = html;
  }

  function claimHomeGoal(goalId) {
    if (!Game.HomeGoals) return;
    const result = Game.HomeGoals.claimGoal(goalId);
    showNotification(result.success ? 'Goal rewards delivered.' : result.reason);
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'goals') {
      buildGoalsPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('goals')">✕</button>`);
    }
  }

  function buildCollectionsPanel(panel, closeHtml) {
    const collections = Game.HomeCollections && Game.HomeCollections.getCollections ? Game.HomeCollections.getCollections() : [];
    const completedCount = collections.filter(item => item.claimed).length;
    let html = (closeHtml || '') + '<h3>Home Collections</h3>';
    html += `<div class="collection-summary">
      <strong>${completedCount}/${collections.length} complete</strong>
      <span>Finish furniture sets to earn new objects.</span>
    </div>`;
    html += '<div class="collection-grid">';
    for (const collection of collections) {
      const rewardNames = (collection.rewardObjects || [])
        .map(type => Game.Config.FURNITURE[type]?.label || type)
        .join(', ');
      html += `<div class="collection-card ${collection.complete ? 'complete' : ''} ${collection.claimed ? 'claimed' : ''}">
        <div class="collection-card-header">
          <div>
            <strong>${collection.title}</strong>
            <small>${collection.owned}/${collection.total} found</small>
          </div>
          <span>${collection.claimed ? 'Claimed' : (collection.complete ? 'Ready' : 'Open')}</span>
        </div>
        <p>${collection.desc}</p>
        <div class="collection-items">
          ${collection.items.map(item => `<div class="collection-item-chip ${item.owned ? 'owned' : ''}" title="${item.label}">
            <span>${item.icon}</span>
            <small>${item.label}${item.needed > 1 ? ` ${item.count}/${item.needed}` : ''}</small>
          </div>`).join('')}
        </div>
        <small>$${collection.rewardMoney.toLocaleString()}${rewardNames ? ` + ${rewardNames}` : ''}</small>
        <button ${collection.claimable ? '' : 'disabled'} onclick="Game.UI.claimCollection('${collection.key}')">${collection.claimed ? 'Claimed' : (collection.complete ? 'Claim' : 'In Progress')}</button>
      </div>`;
    }
    if (!collections.length) html += '<p class="empty-msg">No collections are available yet.</p>';
    html += '</div>';
    panel.innerHTML = html;
  }

  function claimCollection(collectionKey) {
    if (!Game.HomeCollections || !Game.HomeCollections.claimCollection) return;
    const result = Game.HomeCollections.claimCollection(collectionKey);
    showNotification(result.success ? 'Collection rewards delivered.' : result.reason);
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'collections') {
      buildCollectionsPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('collections')">&times;</button>`);
    }
  }

  function startBuild(type, key) {
    const ui = Game.State.get().ui;
    ui.mode = 'build';
    if (type === 'room') {
      const r = Game.Config.ROOMS[key];
      if (Game.HomeGrowth && !Game.HomeGrowth.isRoomUnlocked(key)) {
        showNotification(Game.HomeGrowth.getRoomLockReason(key));
        return;
      }
      ui.buildGhost = { type: 'room', key, x: 1, y: 1, w: r.minW, h: r.minH };
    } else {
      const storedObject = type === 'stored' && Game.HomeGrowth && Game.HomeGrowth.getInventoryObjects
        ? Game.HomeGrowth.getInventoryObjects().find(item => item.id === key)
        : null;
      const furnKey = storedObject ? storedObject.type : key;
      const f = Game.Config.FURNITURE[furnKey];
      if (!f) {
        console.warn('Game.UI.startBuild: Invalid furniture key ->', key);
        return;
      }
      if (type !== 'stored' && Game.HomeGrowth && !Game.HomeGrowth.isFurnitureUnlocked(furnKey)) {
        showNotification(Game.HomeGrowth.getFurnitureLockReason(furnKey));
        return;
      }
      ui.buildGhost = { type: type === 'stored' ? 'stored' : 'furniture', key: furnKey, sourceObjectId: storedObject ? storedObject.id : null, x: 1, y: 1, w: f.w, h: f.h };
    }

    // Target the Phaser container, not the hidden vanilla canvas
    const container = document.querySelector('.canvas-area');
    container.addEventListener('mousemove', handleBuildMove);
    container.addEventListener('click', handleBuildClick);
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      panel.classList.add('hidden');
      panel.dataset.active = '';
      setSidePanelOpen(false);
    }
    updateInteractionHint();
  }

  function rotateBuildGhost() {
    const ui = Game.State.get().ui;
    const ghost = ui && ui.buildGhost;
    if (!ghost || ui.mode !== 'build') return false;
    ghost.rotated = !ghost.rotated;
    const originalWidth = ghost.w;
    ghost.w = ghost.h;
    ghost.h = originalWidth;
    updateInteractionHint();
    return true;
  }

  function exitCurrentMode() {
    const ui = Game.State.get().ui;
    if (!ui) return;
    if (ui.mode === 'build') {
      cancelBuild();
    } else if (ui.mode === 'sell') {
      toggleSellMode();
    } else if (ui.mode === 'store') {
      toggleStoreMode();
    }
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
      const placed = ghost.type === 'stored'
        ? Game.House.placeStoredFurniture(ghost.sourceObjectId, room.id, gp.x, gp.y, ghost.rotated)
        : Game.House.placeFurniture(ghost.key, room.id, gp.x, gp.y, ghost.rotated);
      if (placed) {
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
    updateInteractionHint();
    const container = document.querySelector('.canvas-area');
    container.removeEventListener('mousemove', handleBuildMove);
    container.removeEventListener('click', handleBuildClick);
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build' && !panel.classList.contains('hidden')) {
      Game.UI.togglePanel('build');
    }
  }

  function setBuildFloor(floor) {
    if (!Game.HomeGrowth || !Game.HomeGrowth.setActiveFloor(floor)) return;
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">&times;</button>`);
    }
  }

  function buyFloor() {
    if (!Game.HomeGrowth) return;
    const result = Game.HomeGrowth.addFloor();
    if (!result.success) showNotification(result.reason || 'Cannot add another floor yet.');
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">&times;</button>`);
    }
  }

  function expandLot() {
    if (!Game.HomeGrowth || !Game.HomeGrowth.expandLot) return;
    const result = Game.HomeGrowth.expandLot();
    showNotification(result.success ? `Lot expanded to ${result.width}x${result.height}.` : result.reason);
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">&times;</button>`);
    }
  }

  function travelToFloor(floor) {
    if (!Game.HomeGrowth || !Game.HomeGrowth.travelToFloor) return;
    const result = Game.HomeGrowth.travelToFloor(floor);
    showNotification(result.success ? 'Household moved floors.' : result.reason);
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">✕</button>`);
    }
  }

  function resizeRoom(roomId, dW, dH) {
    if (!Game.House || !Game.House.resizeRoom) return;
    const house = Game.House.getHouse();
    const room = house.rooms.find(item => item.id === roomId);
    if (!room) return;
    const resized = Game.House.resizeRoom(roomId, room.w + dW, room.h + dH);
    showNotification(resized ? 'Room renovated.' : 'Cannot resize room here.');
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">✕</button>`);
    }
  }

  function furnishRoom(roomId, presetKey) {
    if (!Game.House || !Game.House.applyFurnishingPreset) return;
    const result = Game.House.applyFurnishingPreset(roomId, presetKey);
    showNotification(result.success ? 'Room furnished.' : result.reason);
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">&times;</button>`);
    }
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

  function formatNeedDelta(needKey, value) {
    const icon = Game.Config.NEEDS[needKey]?.icon || '';
    const number = Number(value) || 0;
    const sign = number > 0 ? '+' : '';
    return `${icon} ${sign}${number}`;
  }

  function setActivityDisplayPreview(text, state) {
    const actEl = document.getElementById('activity-display');
    if (!actEl) return;
    actEl.textContent = text;
    actEl.dataset.state = state || 'active';
  }

  function startActivityFromPanel(activityKey) {
    const actCfg = Game.Config.ACTIVITIES[activityKey];
    const label = actCfg ? `${actCfg.icon} ${actCfg.label}` : activityKey;
    const char = Game.State.get().character;
    const isBusy = !!(char.currentActivity);
    const success = isBusy
      ? Game.Character.queueActivity(activityKey)
      : Game.Character.startActivity(activityKey);

    if (!success) {
      showNotification(`Can't start ${actCfg ? actCfg.label : activityKey} yet.`);
      return false;
    }

    if (isBusy) {
      setActivityDisplayPreview(`Queued ${label}`, 'queued');
      showNotification(`${actCfg ? actCfg.label : activityKey} added to queue.`);
    } else {
      updateStatusBars();
      const moving = !!(char.targetPosition || char.path || char.isPathfinding);
      setActivityDisplayPreview(`${moving ? 'Walking to' : 'Started'} ${label}`, 'active');
      showNotification(`Started ${actCfg ? actCfg.label : activityKey}.`);
    }
    updateQueueDisplay();

    if (window.matchMedia && window.matchMedia('(max-width: 620px)').matches) {
      const panel = document.getElementById('side-panel');
      if (panel && panel.dataset.active === 'activities') {
        panel.classList.add('hidden');
        panel.dataset.active = '';
        setSidePanelOpen(false);
      }
    }
    return true;
  }

  function buildActivitiesPanel(panel, closeHtml) {
    const available = Game.Character.getAvailableActivities();
    let html = (closeHtml || '') + '<h3>🎯 Activities</h3><div class="activity-list">';
    for (const act of available) {
      html += `<button class="activity-item" onclick="Game.UI.startActivityFromPanel('${act.key}')">
        <span class="activity-title">${act.icon} ${act.label}</span>
        <small>${Object.entries(act.needs).map(([k,v]) => formatNeedDelta(k, v)).join(' ')}</small>
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
      const skillCfg = Game.Config.SKILLS[careerInfo.config.keySkill] || { label: careerInfo.config.keySkill, icon: '' };
      html += `<div class="career-info">
        <p><strong>${careerInfo.config.icon || skillCfg.icon || '💼'} ${careerInfo.levelConfig.title}</strong></p>
        <p>Level ${careerInfo.level + 1}/${careerInfo.config.levels.length}</p>
        <p>Salary: $${careerInfo.levelConfig.salary}/day</p>
        <p>Days Worked: ${careerInfo.daysWorked}</p>
        <p>Performance: ${Math.round(careerInfo.performance)}</p>
        ${careerInfo.nextLevel ? `<p>Next: ${careerInfo.nextLevel.title} (need ${skillCfg.label} ${careerInfo.nextLevel.skillReq})</p>` : ''}
        <button onclick="Game.Economy.quitCareer();Game.UI.togglePanel('career')">Quit Job</button>
      </div>`;
    } else {
      html += '<div class="panel-intro">No career yet. Choose a path:</div><div class="career-list">';
      for (const [key, career] of Object.entries(Game.Config.CAREERS)) {
        const skillCfg = Game.Config.SKILLS[career.keySkill] || { label: career.keySkill, icon: '' };
        const firstLevel = career.levels && career.levels[0] ? career.levels[0] : null;
        const careerIcon = career.icon || skillCfg.icon || '💼';
        html += `<button class="career-item" onclick="Game.Economy.joinCareer('${key}');Game.UI.togglePanel('career')">
          <strong>${careerIcon} ${career.label}</strong>
          <small>${skillCfg.icon || ''} ${skillCfg.label}${firstLevel ? ` path - starts ${firstLevel.title} at $${firstLevel.salary}/day` : ''}</small>
        </button>`;
      }
      html += '</div>';
    }
    panel.innerHTML = html;
  }

  function buildSocialPanel(panel, closeHtml) {
    const rels = Game.Social.getAllRelationships();
    const averageRelationship = rels.length
      ? Math.round(rels.reduce((sum, npc) => sum + npc.relationship, 0) / rels.length)
      : 0;
    const friendCount = rels.filter(npc => npc.relationship >= 40).length;
    const charismaLevel = Game.Character && Game.Character.getSkillLevel ? Game.Character.getSkillLevel('charisma') : 0;
    const clampPercent = value => Math.max(0, Math.min(100, Math.round(value || 0)));
    const buildNeedStrip = member => {
      const labels = { hunger: 'Hun', energy: 'Eng', hygiene: 'Hyg', fun: 'Fun', social: 'Soc' };
      const entries = Object.entries(labels)
        .filter(([need]) => member.needs && Number.isFinite(member.needs[need]));
      if (!entries.length) return '';
      return `<div class="family-need-strip">
        ${entries.map(([need, label]) => {
          const value = clampPercent(member.needs[need]);
          return `<div class="family-need-pill">
            <span>${label}</span>
            <div class="family-need-bar"><span style="width:${value}%"></span></div>
          </div>`;
        }).join('')}
      </div>`;
    };
    let html = (closeHtml || '') + '<h3>👥 Social</h3>';
    html += `<div class="social-summary">
      <div class="social-summary-stat"><strong>${averageRelationship}</strong><span>Avg Bond</span></div>
      <div class="social-summary-stat"><strong>${friendCount}/${rels.length}</strong><span>Friends</span></div>
      <div class="social-summary-stat"><strong>${charismaLevel}</strong><span>Charisma</span></div>
    </div><div class="social-list">`;

    for (const npc of rels) {
      const interactions = Game.Social.getAvailableInteractions(npc.id);
      const relationship = clampPercent(npc.relationship);
      const nextMilestone = relationship >= 80
        ? 'Best friend bond'
        : relationship >= 40
          ? `${80 - relationship} pts to Best Friend`
          : `${40 - relationship} pts to Friend`;
      html += `<div class="npc-card">
        <div class="npc-header">
          <div class="npc-identity">
            <span class="npc-avatar">${npc.emoji || npc.avatar || '👤'}</span>
            <div>
              <strong>${npc.name}</strong>
              <small>${npc.levelInfo.label}</small>
            </div>
          </div>
          <span class="npc-score">${relationship}</span>
        </div>
        <div class="relationship-meter" aria-label="Relationship ${relationship} out of 100">
          <span class="relationship-fill" style="width:${relationship}%"></span>
        </div>
        <div class="relationship-meta">
          <span>${nextMilestone}</span>
          <span>${interactions.length} actions</span>
        </div>
        <div class="npc-interactions">`;
      for (const int of interactions) {
        html += `<button class="int-btn" onclick="Game.UI.doSocialInteraction('${npc.id}','${int.key}')">${int.label}${int.cost ? ` ($${int.cost})` : ''}</button>`;
      }
      html += '</div></div>';
    }
    if (Game.Family) {
      const members = Game.Family.getMembers();
      const familyCheck = Game.Family.canStartFamily();
      const memberCountLabel = members.length === 1 ? '1 member' : `${members.length} members`;
      html += `<div class="npc-card family-card">
        <div class="npc-header">
          <div class="npc-identity">
            <span class="npc-avatar">🏠</span>
            <div>
              <strong>Family Household</strong>
              <small>${memberCountLabel}</small>
            </div>
          </div>
          <span class="npc-score">${members.length}</span>
        </div>
        <div class="relationship-meta family-readiness">
          <span>${familyCheck.allowed ? 'Ready to grow the household.' : familyCheck.reason}</span>
          <span>${members.filter(member => member.role !== 'self').length} care targets</span>
        </div>
        <div class="npc-interactions">
          <button class="int-btn" ${familyCheck.allowed ? 'onclick="Game.UI.startFamily()"' : `disabled title="${familyCheck.reason}"`}>Start Family</button>
      </div>`;
      for (const member of members.filter(item => item.role !== 'self')) {
        const actions = Game.Family.getCareActions ? Game.Family.getCareActions(member.id) : [];
        const assignments = Game.Family.getAssignments ? Game.Family.getAssignments(member.id) : [];
        const activeAssignment = assignments.find(item => item.active);
        html += `<div class="family-member-row">
          <div class="family-member-main">
            <strong>${member.name}</strong>
            <small>${member.role} - ${member.lifeStage}</small>
          </div>
          ${buildNeedStrip(member)}
          <div class="npc-interactions">
            ${actions.map(action => `<button class="int-btn" onclick="Game.UI.doFamilyCare('${member.id}','${action.key}')">${action.label}</button>`).join('')}
          </div>
          <div class="family-assignment-list" data-family-member="${member.id}">
            <small>Routine${activeAssignment ? ` - ${activeAssignment.label}` : ''}</small>
            <div class="npc-interactions">
              ${assignments.map(item => `<button class="int-btn family-assignment-btn ${item.active ? 'active' : ''}" data-routine-key="${item.key}" ${item.available ? `onclick="Game.UI.assignFamilyRoutine('${member.id}','${item.key}')"` : 'disabled'} title="${item.reason || item.desc}">${item.label}</button>`).join('')}
            </div>
          </div>
        </div>`;
      }
      html += '</div>';
    }
    html += '</div>';
    panel.innerHTML = html;
  }

  function refreshSocialPanel() {
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'social' && !panel.classList.contains('hidden')) {
      buildSocialPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('social')">&times;</button>`);
      setSidePanelOpen(true);
      return;
    }
    togglePanel('social');
  }

  function doSocialInteraction(npcId, intKey) {
    const result = Game.Social.interact(npcId, intKey);
    showNotification(result.msg);
    refreshSocialPanel();
  }

  function startFamily() {
    if (!Game.Family) return;
    const result = Game.Family.tryForChild();
    showNotification(result.success ? `${result.child.name} joined the family.` : result.reason);
    refreshSocialPanel();
  }

  function doFamilyCare(memberId, actionKey) {
    if (!Game.Family || !Game.Family.performCare) return;
    const result = Game.Family.performCare(memberId, actionKey);
    showNotification(result.success ? `${result.action.label} helped ${result.member.name}.` : result.reason);
    refreshSocialPanel();
  }

  function assignFamilyRoutine(memberId, routineKey) {
    if (!Game.Family || !Game.Family.assignRoutine) return;
    const result = Game.Family.assignRoutine(memberId, routineKey);
    showNotification(result.success ? `${result.member.name} routine updated.` : result.reason);
    refreshSocialPanel();
  }

  function buildSkillsPanel(panel, closeHtml) {
    const char = Game.State.get().character;
    // Trait display
    const traitCfg = Game.Config.TRAITS[char.trait];
    let html = (closeHtml || '') + '<h3>📚 Skills</h3>';
    if (traitCfg) {
      html += `<div class="trait-badge">${traitCfg.icon} <strong>${traitCfg.label}</strong> — ${traitCfg.desc}</div>`;
      html += `<button class="customize-sim-btn" onclick="Game.UI.openEditModal()">✨ Customise Sim</button>`;
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
      <div class="legacy-summary">
        <div><span>Generation</span><strong>${prestige.generation}</strong></div>
        <div><span>Legacy Points</span><strong>${prestige.legacyPoints} LP</strong></div>
        <div><span>Reset Value</span><strong>+${points} LP</strong></div>
      </div>`;

    if (canP) {
      html += `<button class="prestige-btn" onclick="if(confirm('Start next generation?'))Game.Prestige.doPrestige()">🔄 New Generation</button>`;
    } else {
      html += `<p class="hint">Play ${30 - Game.State.get().time.day} more days to unlock.</p>`;
    }

    html += '<h4 class="build-category">Upgrades</h4><div class="upgrade-list legacy-upgrade-list">';
    for (const upg of upgrades) {
      html += `<div class="upgrade-item">
        <p><strong>${upg.icon || ''} ${upg.label}</strong> (Lv ${upg.currentLevel}/${upg.maxLevel})</p>
        <p class="desc">${upg.desc || upg.description || ''}</p>
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
    updateInteractionHint,
    showNotification,
    showEvent,
    hideEvent,
    togglePanel,
    setBuildPanelTab,
    startBuild,
    startActivityFromPanel,
    cancelBuild,
    buyMarketOffer,
    craftObject,
    claimHomeGoal,
    claimCollection,
    doSocialInteraction,
    doFamilyCare,
    assignFamilyRoutine,
    startFamily,
    setBuildFloor,
    buyFloor,
    expandLot,
    travelToFloor,
    resizeRoom,
    furnishRoom,
    toggleSellMode,
    toggleStoreMode,
    toggleSandboxMode,
    rotateBuildGhost,
    exitCurrentMode,
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
      container.removeEventListener('click', handleStoreClick);
      ui.mode = 'sell';
      Game.UI.showNotification('🗑️ Sell Mode: Click furniture to sell, rooms to demolish');
      // Set up sell click handler on the Phaser container
      container.addEventListener('click', handleSellClick);
    }
    updateInteractionHint();
    // Refresh build panel
    const panel = document.getElementById('side-panel');
    if (panel && panel.dataset.active === 'build') {
      buildBuildPanel(panel, `<button class="panel-close" onclick="Game.UI.togglePanel('build')">✕</button>`);
    }
  }

  function toggleStoreMode() {
    const ui = Game.State.get().ui;
    const container = document.querySelector('.canvas-area');
    if (ui.mode === 'store') {
      ui.mode = 'live';
      container.removeEventListener('click', handleStoreClick);
      Game.UI.showNotification('Storage mode off');
    } else {
      container.removeEventListener('click', handleSellClick);
      ui.mode = 'store';
      Game.UI.showNotification('Storage Mode: click furniture to move it into storage');
      container.addEventListener('click', handleStoreClick);
    }
    updateInteractionHint();
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

  function handleStoreClick(e) {
    const ui = Game.State.get().ui;
    if (ui.mode !== 'store') {
      const container = document.querySelector('.canvas-area');
      container.removeEventListener('click', handleStoreClick);
      return;
    }

    const container = document.querySelector('.canvas-area');
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const gp = Game.Renderer.getGridPos(cx, cy);
    const furn = Game.House.getFurnitureAt(gp.x, gp.y);
    if (!furn) return;

    const result = Game.House.storeFurniture(furn.id);
    Game.UI.showNotification(result && result.success ? 'Object moved to storage.' : 'Cannot store that object.');
    e.stopPropagation();
  }

})();
