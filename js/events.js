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
      events.cooldown = 720 + Math.random() * 720; // 12-24 game hours between events
    }
  }

  function triggerRandomEvent() {
    const events = getEvents();
    const pool = cfg.EVENTS.filter(e => !events.history.slice(-6).includes(e.id));
    if (pool.length === 0) return;

    const event = pool[Math.floor(Math.random() * pool.length)];
    events.activeEvent = { ...event };
    Game.UI && Game.UI.showEvent(event);
  }

  function handleChoice(choiceIndex) {
    const events = getEvents();
    if (!events.activeEvent) return;

    const event = events.activeEvent;
    const choice = event.choices[choiceIndex];
    if (!choice) return;

    const char = Game.Character.getState();

    // Apply effects
    if (choice.effects) {
      for (const [key, value] of Object.entries(choice.effects)) {
        if (key === 'money') {
          Game.Economy.addMoney(value);
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
            Game.Economy.addMoney(choice.skillCheck.failCost);
            Game.UI && Game.UI.showNotification(`❌ Skill check failed! Lost $${Math.abs(choice.skillCheck.failCost)}`);
          }
        } else {
          Game.UI && Game.UI.showNotification(`✅ Skill check passed!`);
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
      const randomNpc = npcs[Math.floor(Math.random() * npcs.length)];
      const current = Game.Social.getRelationship(randomNpc.id);
      Game.Social.setRelationship(randomNpc.id, current + choice.relBoost.random);
    }

    // Track
    events.history.push(event.id);
    if (events.history.length > 20) events.history.shift();
    Game.State.get().stats.eventsHandled++;

    events.activeEvent = null;
    Game.UI && Game.UI.hideEvent();
  }

  return {
    update,
    triggerRandomEvent,
    handleChoice,
    getEvents,
  };
})();
