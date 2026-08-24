// ============================================================
// SimLife — Events System
// ============================================================
window.Game = window.Game || {};

Game.Events = (function() {
  const cfg = Game.Config;

  function getEvents() { return Game.State.get().events; }

  function update(deltaMinutes) {
    const events = getEvents();
    if (events.activeEvent) return; // Don't trigger during active event

    events.cooldown -= deltaMinutes;
    if (events.cooldown <= 0) {
      triggerRandomEvent();
      events.cooldown = 720 + Game.Random.float() * 720; // 12-24 game hours between events
    }
  }

  function triggerRandomEvent() {
    const events = getEvents();
    const pool = cfg.EVENTS.filter(e => !events.history.slice(-6).includes(e.id));
    if (pool.length === 0) return;

    const event = pool[Game.Random.int(0, pool.length - 1)];
    events.activeEvent = { ...event };
    if (Game.Signals) Game.Signals.emit('event:show', event);
    else Game.UI?.showEvent?.(event);
  }

  function getChoiceAvailability(choiceOrIndex, eventOverride = null) {
    const event = eventOverride || getEvents().activeEvent;
    const choice = typeof choiceOrIndex === 'number' ? event?.choices?.[choiceOrIndex] : choiceOrIndex;
    if (!choice) return { allowed: false, reason: 'Choice unavailable.', cost: 0 };

    let cost = Math.max(0, -(Number(choice.effects?.money) || 0));
    if (choice.skillCheck) {
      let skill = choice.skillCheck.skill;
      let level = choice.skillCheck.level;
      if (!skill) {
        const entry = Object.entries(choice.skillCheck).find(([key]) => key !== 'failCost');
        if (entry) [skill, level] = entry;
      }
      const willFail = skill && Game.Character.getSkillLevel(skill) < Number(level || 0);
      if (willFail) cost += Math.max(0, -(Number(choice.skillCheck.failCost) || 0));
    }
    if (cost > 0 && !Game.Economy.canAfford(cost)) {
      return { allowed: false, reason: `Need $${cost} for this choice.`, cost };
    }
    return { allowed: true, reason: '', cost };
  }

  function handleChoice(choiceIndex) {
    const events = getEvents();
    if (!events.activeEvent) return false;

    const event = events.activeEvent;
    const choice = event.choices[choiceIndex];
    if (!choice) return false;
    const availability = getChoiceAvailability(choice, event);
    if (!availability.allowed) {
      Game.Signals?.emit('notification', { message: availability.reason });
      return false;
    }

    const char = Game.Character.getState();

    // Apply effects
    if (choice.effects) {
      for (const [key, value] of Object.entries(choice.effects)) {
        if (key === 'money') {
          if (value < 0) Game.Economy.spend(Math.abs(value));
          else Game.Economy.addMoney(value);
        } else if (char.needs[key] !== undefined) {
          char.needs[key] = Math.max(0, Math.min(100, char.needs[key] + value));
        }
      }
    }

    // Skill check (support both explicit fields and legacy object-key format)
    if (choice.skillCheck) {
      let skill, reqLevel;
      if (choice.skillCheck.skill && choice.skillCheck.level) {
        skill = choice.skillCheck.skill;
        reqLevel = choice.skillCheck.level;
      } else {
        // Legacy format: { cooking: 3, failCost: -100 }
        const entry = Object.entries(choice.skillCheck).find(([k]) => k !== 'failCost');
        if (entry) { skill = entry[0]; reqLevel = entry[1]; }
      }
      if (skill) {
        const playerLevel = Game.Character.getSkillLevel(skill);
        if (playerLevel < reqLevel) {
          if (choice.skillCheck.failCost) {
            const failCost = Number(choice.skillCheck.failCost) || 0;
            if (failCost < 0) Game.Economy.spend(Math.abs(failCost));
            else Game.Economy.addMoney(failCost);
            Game.Signals?.emit('notification', { message: `❌ Skill check failed! Lost $${Math.abs(choice.skillCheck.failCost)}` });
          }
        } else {
          Game.Signals?.emit('notification', { message: '✅ Skill check passed!' });
        }
      }
    }

    // Skill gain
    if (choice.skillGain) {
      for (const [skill, xp] of Object.entries(choice.skillGain)) {
        Game.Character.addSkillXp(skill, xp);
      }
    }

    // Career boost
    if (choice.careerBoost && Game.Economy.getCareer()) {
      Game.Economy.getCareer().performance += choice.careerBoost;
    }

    // Relationship boost
    if (choice.relBoost && choice.relBoost.random) {
      const npcs = Game.Config.NPCS;
      const randomNpc = npcs[Game.Random.int(0, npcs.length - 1)];
      const current = Game.Social.getRelationship(randomNpc.id);
      Game.Social.setRelationship(randomNpc.id, current + choice.relBoost.random);
    }

    // Track
    events.history.push(event.id);
    if (events.history.length > 20) events.history.shift();
    Game.State.get().stats.eventsHandled++;

    events.activeEvent = null;
    if (Game.Signals) Game.Signals.emit('event:hide');
    else Game.UI?.hideEvent?.();
    return true;
  }

  return {
    update,
    triggerRandomEvent,
    handleChoice,
    getChoiceAvailability,
    getEvents,
  };
})();
