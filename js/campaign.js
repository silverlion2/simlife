// ============================================================
// SimLife: Hearthbyte Edition - New Roots Campaign
// ============================================================
window.Game = window.Game || {};

Game.Campaign = (function() {
  const CAMPAIGN_ID = 'new_roots_v1';
  const XP_PER_LEVEL = 200;
  let updateAccumulator = 0;

  const CHAPTERS = [
    {
      id: 'first_move',
      number: 1,
      title: 'First Light',
      objective: 'Start any activity from the Do menu.',
      hint: 'Open Do and choose a quick activity such as a snack, shower, or game.',
      target: 'activities',
      xp: 100,
      money: 75,
      progress: state => state.campaign.flags.activityStarted ? 1 : 0,
      goal: 1,
    },
    {
      id: 'first_paycheck',
      number: 2,
      title: 'A Place in the World',
      objective: 'Choose a career path.',
      hint: 'Open Career, compare the five tracks, and pick the future that fits your Sim.',
      target: 'career',
      xp: 100,
      money: 100,
      progress: state => state.character.career ? 1 : 0,
      goal: 1,
    },
    {
      id: 'home_goal',
      number: 3,
      title: 'Make It Home',
      objective: 'Complete and claim one household goal.',
      hint: 'Open Goals to see a focused home challenge and its reward.',
      target: 'goals',
      xp: 100,
      money: 150,
      progress: state => Math.min(1, state.homeGoals?.completed?.length || 0),
      goal: 1,
    },
    {
      id: 'furnish',
      number: 4,
      title: 'Your Signature',
      objective: 'Buy or place one new piece of furniture.',
      hint: 'Visit Market for a deal or open Build to furnish a room.',
      target: 'market',
      xp: 100,
      money: 200,
      progress: state => Math.min(1, state.stats?.furnitureBought || 0),
      goal: 1,
    },
    {
      id: 'skill_up',
      number: 5,
      title: 'Practice Makes Pixel',
      objective: 'Raise any skill to level 1.',
      hint: 'Activities and interactive furniture train different skills over time.',
      target: 'skills',
      xp: 100,
      money: 250,
      progress: state => Math.max(0, ...Object.values(state.character?.skills || {}).map(Number)),
      goal: 1,
    },
    {
      id: 'friendship',
      number: 6,
      title: 'Good Company',
      objective: 'Make one friend.',
      hint: 'Open Social, choose someone, and build the relationship with friendly actions.',
      target: 'social',
      xp: 100,
      money: 300,
      progress: state => Math.min(1, state.stats?.friendsMade || 0),
      goal: 1,
    },
    {
      id: 'home_level',
      number: 7,
      title: 'Room to Grow',
      objective: 'Reach home level 2.',
      hint: 'Build rooms, furnish them, and improve the value of your lot.',
      target: 'build',
      xp: 100,
      money: 400,
      progress: state => Math.max(0, (state.homeGrowth?.level || 1) - 1),
      goal: 1,
    },
    {
      id: 'collection',
      number: 8,
      title: 'A Life Collected',
      objective: 'Complete and claim one collection.',
      hint: 'Find, buy, craft, and display themed objects to complete a collection.',
      target: 'collections',
      xp: 100,
      money: 750,
      progress: state => Math.min(1, state.homeCollections?.completed?.length || 0),
      goal: 1,
    },
  ];

  function ensureState() {
    const state = Game.State.get();
    const existing = state.campaign && state.campaign.id === CAMPAIGN_ID
      ? state.campaign
      : {};

    const normalized = {
      id: CAMPAIGN_ID,
      completed: Array.isArray(existing.completed) ? existing.completed : [],
      awarded: existing.awarded && typeof existing.awarded === 'object' ? existing.awarded : {},
      xp: Number.isFinite(existing.xp) ? existing.xp : 0,
      level: Number.isFinite(existing.level) ? existing.level : 1,
      flags: existing.flags && typeof existing.flags === 'object' ? existing.flags : {},
      startedDay: Number.isFinite(existing.startedDay) ? existing.startedDay : (state.time?.day || 1),
      finishedDay: Number.isFinite(existing.finishedDay) ? existing.finishedDay : null,
    };

    if (state.campaign && state.campaign.id === CAMPAIGN_ID) {
      Object.assign(state.campaign, normalized);
    } else {
      state.campaign = normalized;
    }
    state.campaign.level = Math.max(1, 1 + Math.floor(state.campaign.xp / XP_PER_LEVEL));
    return state.campaign;
  }

  function getCurrentIndex() {
    const campaign = ensureState();
    return CHAPTERS.findIndex(chapter => !campaign.completed.includes(chapter.id));
  }

  function getCurrentChapter() {
    const index = getCurrentIndex();
    return index >= 0 ? CHAPTERS[index] : null;
  }

  function getChapterProgress(chapter, state) {
    const value = Number(chapter.progress(state)) || 0;
    return {
      value: Math.max(0, Math.min(chapter.goal, value)),
      goal: chapter.goal,
      ratio: Math.max(0, Math.min(1, value / chapter.goal)),
    };
  }

  function completeChapter(chapter) {
    const state = Game.State.get();
    const campaign = ensureState();
    if (campaign.completed.includes(chapter.id)) return false;

    campaign.completed.push(chapter.id);
    campaign.xp += chapter.xp;
    campaign.level = Math.max(1, 1 + Math.floor(campaign.xp / XP_PER_LEVEL));

    if (!campaign.awarded[chapter.id]) {
      campaign.awarded[chapter.id] = true;
      state.economy.money += chapter.money;
    }

    const allComplete = campaign.completed.length >= CHAPTERS.length;
    if (allComplete && !campaign.finishedDay) {
      campaign.finishedDay = state.time?.day || 1;
    }

    if (Game.Audio?.playChime) Game.Audio.playChime();
    if (Game.UI?.showNotification) {
      Game.UI.showNotification(`Chapter complete: ${chapter.title} · +${chapter.xp} XP · +$${chapter.money}`);
    }
    if (Game.UI?.playAnnouncer) {
      Game.UI.playAnnouncer(allComplete ? 'NEW ROOTS COMPLETE!' : `CHAPTER ${chapter.number} COMPLETE`);
    }

    updateHud();
    Game.State.save();
    return true;
  }

  function evaluateCurrent() {
    const state = Game.State.get();
    const campaign = ensureState();
    if (state.character?.currentActivity) campaign.flags.activityStarted = true;

    const chapter = getCurrentChapter();
    if (!chapter) return false;
    const progress = getChapterProgress(chapter, state);
    return progress.ratio >= 1 ? completeChapter(chapter) : false;
  }

  function update(deltaSeconds) {
    updateAccumulator += Math.max(0, Number(deltaSeconds) || 0);
    if (updateAccumulator < 0.25) return;
    updateAccumulator = 0;
    evaluateCurrent();
    updateHud();
  }

  function updateHud() {
    const chip = document.getElementById('campaign-chip');
    if (!chip || !Game.State?.get) return;

    const state = Game.State.get();
    const campaign = ensureState();
    const chapter = getCurrentChapter();
    const kicker = chip.querySelector('.campaign-chip-kicker');
    const objective = chip.querySelector('.campaign-objective');
    const bar = chip.querySelector('.campaign-progress i');

    if (!chapter) {
      if (kicker) kicker.textContent = `NEW ROOTS // COMPLETE · LV ${campaign.level}`;
      if (objective) objective.textContent = 'Your life is yours to shape';
      if (bar) bar.style.width = '100%';
      chip.dataset.complete = 'true';
      return;
    }

    const progress = getChapterProgress(chapter, state);
    if (kicker) kicker.textContent = `NEW ROOTS // CHAPTER ${chapter.number} · LV ${campaign.level}`;
    if (objective) objective.textContent = chapter.objective;
    if (bar) bar.style.width = `${Math.round(progress.ratio * 100)}%`;
    chip.dataset.complete = 'false';
  }

  function renderPanel(panel) {
    const state = Game.State.get();
    const campaign = ensureState();
    const current = getCurrentChapter();
    const overall = Math.round((campaign.completed.length / CHAPTERS.length) * 100);

    const chapterRows = CHAPTERS.map(chapter => {
      const isComplete = campaign.completed.includes(chapter.id);
      const isCurrent = current?.id === chapter.id;
      const isLocked = !isComplete && !isCurrent;
      const progress = getChapterProgress(chapter, state);
      const status = isComplete ? 'COMPLETE' : (isCurrent ? 'ACTIVE' : 'LOCKED');
      const action = isCurrent
        ? `<button class="campaign-go" type="button" onclick="Game.Campaign.goToObjective('${chapter.target}')">GO</button>`
        : '';

      return `
        <article class="campaign-row ${isComplete ? 'complete' : ''} ${isCurrent ? 'active' : ''} ${isLocked ? 'locked' : ''}">
          <div class="campaign-number">${String(chapter.number).padStart(2, '0')}</div>
          <div class="campaign-copy">
            <div class="campaign-row-top">
              <strong>${chapter.title}</strong>
              <span>${status}</span>
            </div>
            <p>${chapter.objective}</p>
            ${isCurrent ? `<small>${chapter.hint}</small>` : ''}
            <div class="campaign-row-progress"><i style="width:${Math.round(progress.ratio * 100)}%"></i></div>
          </div>
          ${action}
        </article>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="dialog-header campaign-header">
        <div>
          <span class="dialog-kicker">STORY JOURNAL</span>
          <h3>New Roots</h3>
        </div>
        <button class="close-btn" type="button" onclick="Game.UI.togglePanel('campaign')" aria-label="Close campaign journal">&times;</button>
      </div>
      <div class="dialog-content campaign-panel-content">
        <section class="campaign-summary">
          <div><span>CAMPAIGN</span><strong>${overall}%</strong></div>
          <div><span>HEARTH LV</span><strong>${campaign.level}</strong></div>
          <div><span>STORY XP</span><strong>${campaign.xp}</strong></div>
        </section>
        <div class="campaign-overall"><i style="width:${overall}%"></i></div>
        <p class="campaign-intro">Build a home, find your people, and turn a first sunrise into a life worth remembering.</p>
        <div class="campaign-list">${chapterRows}</div>
      </div>
    `;
  }

  function goToObjective(panelName) {
    if (Game.UI?.togglePanel) Game.UI.togglePanel(panelName);
  }

  function init() {
    ensureState();
    updateHud();
  }

  function getSnapshot() {
    const campaign = ensureState();
    const current = getCurrentChapter();
    return {
      id: campaign.id,
      level: campaign.level,
      xp: campaign.xp,
      completed: [...campaign.completed],
      current: current?.id || null,
      complete: !current,
    };
  }

  return {
    CHAPTERS,
    ensureState,
    evaluateCurrent,
    getCurrentChapter,
    getSnapshot,
    goToObjective,
    init,
    renderPanel,
    update,
    updateHud,
  };
})();
