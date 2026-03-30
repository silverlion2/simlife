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
    setupWelcomeScreen();
  }

  // ---- Welcome Screen ----
  function setupWelcomeScreen() {
    const welcome = document.getElementById('welcome-screen');
    if (!welcome) return;
    if (Game.State.get().time.day > 1) {
      welcome.style.display = 'none';
      return;
    }
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        welcome.style.display = 'none';
      });
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
        <div class="need-track">
          <div class="need-fill" id="need-${key}"></div>
        </div>
        <span class="need-value" id="need-val-${key}"></span>
      `;
      container.appendChild(bar);
    }
  }

  function updateStatusBars() {
    const char = Game.State.get().character;
    const time = Game.State.get().time;

    // Update need bars
    for (const key of Object.keys(Game.Config.NEEDS)) {
      const val = Math.round(char.needs[key] || 0);
      const fill = document.getElementById(`need-${key}`);
      const valEl = document.getElementById(`need-val-${key}`);
      if (fill) {
        fill.style.width = val + '%';
        fill.className = 'need-fill';
        if (val <= 20) fill.classList.add('critical');
        else if (val <= 40) fill.classList.add('low');
        else if (val >= 80) fill.classList.add('high');
      }
      if (valEl) valEl.textContent = val;
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
        const pct = Math.round(char.activityProgress * 100);
        actEl.textContent = actCfg ? `${actCfg.icon} ${actCfg.label} (${pct}%)` : '...';
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

    modal.innerHTML = `
      <div class="event-card">
        <h3>${event.icon || '📢'} ${event.title}</h3>
        <p>${event.description}</p>
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

    if (panel.dataset.active === panelName) {
      panel.style.display = 'none';
      panel.dataset.active = '';
      return;
    }

    panel.dataset.active = panelName;
    panel.style.display = 'block';

    switch (panelName) {
      case 'build': buildBuildPanel(panel); break;
      case 'activities': buildActivitiesPanel(panel); break;
      case 'career': buildCareerPanel(panel); break;
      case 'social': buildSocialPanel(panel); break;
      case 'skills': buildSkillsPanel(panel); break;
      case 'legacy': buildLegacyPanel(panel); break;
    }
  }

  function buildBuildPanel(panel) {
    let html = '<h3>🏗️ Build Mode</h3>';
    html += '<h4>Rooms</h4><div class="build-grid">';
    for (const [key, room] of Object.entries(Game.Config.ROOMS)) {
      html += `<button class="build-item" onclick="Game.UI.startBuild('room','${key}')">${room.icon} ${room.label}<br><small>$${room.baseCost}</small></button>`;
    }
    html += '</div><h4>Furniture</h4><div class="build-grid">';
    for (const [key, furn] of Object.entries(Game.Config.FURNITURE)) {
      html += `<button class="build-item" onclick="Game.UI.startBuild('furniture','${key}')">${furn.icon} ${furn.label}<br><small>$${furn.cost}</small></button>`;
    }
    html += '</div>';
    panel.innerHTML = html;
  }

  function startBuild(type, key) {
    const ui = Game.State.get().ui;
    ui.mode = 'build';
    if (type === 'room') {
      const r = Game.Config.ROOMS[key];
      ui.buildGhost = { type: 'room', key, x: 1, y: 1, w: r.w, h: r.h };
    } else {
      const f = Game.Config.FURNITURE[key];
      ui.buildGhost = { type: 'furniture', key, x: 1, y: 1, w: f.w, h: f.h };
    }

    const canvas = document.getElementById('game-canvas');
    canvas.addEventListener('mousemove', handleBuildMove);
    canvas.addEventListener('click', handleBuildClick);
  }

  function handleBuildMove(e) {
    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const gp = Game.Renderer.getGridPos(cx, cy);
    const ghost = Game.State.get().ui.buildGhost;
    if (ghost) {
      ghost.x = gp.x;
      ghost.y = gp.y;
    }
  }

  function handleBuildClick(e) {
    const ghost = Game.State.get().ui.buildGhost;
    if (!ghost) return;

    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const gp = Game.Renderer.getGridPos(cx, cy);

    if (ghost.type === 'room') {
      if (Game.House.buildRoom(ghost.key, gp.x, gp.y)) {
        showNotification(`🏠 Built ${Game.Config.ROOMS[ghost.key].label}!`);
      }
    } else {
      if (Game.House.placeFurniture(ghost.key, gp.x, gp.y)) {
        showNotification(`🪑 Placed ${Game.Config.FURNITURE[ghost.key].label}!`);
      }
    }

    cancelBuild();
    e.stopPropagation();
  }

  function cancelBuild() {
    const ui = Game.State.get().ui;
    ui.mode = 'live';
    ui.buildGhost = null;
    const canvas = document.getElementById('game-canvas');
    canvas.removeEventListener('mousemove', handleBuildMove);
    canvas.removeEventListener('click', handleBuildClick);
  }

  function buildActivitiesPanel(panel) {
    const available = Game.Character.getAvailableActivities();
    let html = '<h3>🎯 Activities</h3><div class="activity-list">';
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

  function buildCareerPanel(panel) {
    const careerInfo = Game.Economy.getCareerInfo();
    let html = '<h3>💼 Career</h3>';

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

  function buildSocialPanel(panel) {
    const rels = Game.Social.getAllRelationships();
    let html = '<h3>👥 Social</h3><div class="social-list">';

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

  function buildSkillsPanel(panel) {
    const char = Game.State.get().character;
    let html = '<h3>📚 Skills</h3><div class="skill-list">';
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

  function buildLegacyPanel(panel) {
    const prestige = Game.Prestige.getPrestige();
    const points = Game.Prestige.calculateLegacyPoints();
    const upgrades = Game.Prestige.getUpgradeInfo();
    const canP = Game.Prestige.canPrestige();

    let html = `<h3>🌟 Legacy</h3>
      <p>Generation: ${prestige.generation + 1}</p>
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
    panel.innerHTML = html;
  }

  return {
    init,
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
  };
})();
