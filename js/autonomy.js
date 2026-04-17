// ============================================================
// SimLife — Autonomy AI System
// When idle, the Sim evaluates their needs and autonomously
// picks the best action — just like The Sims.
// ============================================================
window.Game = window.Game || {};

Game.Autonomy = (function() {
  const cfg = Game.Config;
  let decisionCooldown = 0;
  const DECISION_INTERVAL = 8; // game-seconds between autonomous decisions
  let thoughtDelay = 0; // game-time delay before acting on thought

  function update(deltaSeconds) {
    const char = Game.Character.getState();

    // Don't run if autonomy disabled, sim is busy, or has queued actions
    if (!char.autonomy.enabled) return;
    if (char.currentActivity) {
      char.autonomy.thought = null;
      thoughtDelay = 0;
      return;
    }
    if (char.actionQueue.length > 0) return;

    // If we have a pending thought, count down in game-time (not wall-clock)
    if (char.autonomy.thought && thoughtDelay > 0) {
      thoughtDelay -= deltaSeconds;
      if (thoughtDelay <= 0) {
        // Execute the thought
        if (!char.currentActivity && !char.actionQueue.length) {
          if (Game.Character.startActivity(char.autonomy.thought)) {
            const actCfg = cfg.ACTIVITIES[char.autonomy.thought];
            Game.UI && Game.UI.showNotification(`🤖 ${char.name} decided to ${actCfg.label.toLowerCase()}`);
          }
        }
        char.autonomy.thought = null;
      }
      return;
    }

    decisionCooldown -= deltaSeconds;
    if (decisionCooldown > 0) return;
    decisionCooldown = DECISION_INTERVAL;

    // Evaluate needs and pick best action
    const decision = evaluateNeeds();
    if (decision) {
      char.autonomy.thought = decision.activity;
      char.autonomy.lastAutoTime = Game.State.get().time.totalMinutes;
      thoughtDelay = 2.0; // 2 game-seconds delay (shows thought bubble first)
    } else {
      char.autonomy.thought = null;
    }
  }

  function evaluateNeeds() {
    const char = Game.Character.getState();
    const needs = char.needs;
    const candidates = [];
    const traitCfg = cfg.TRAITS[char.trait];

    for (const mapping of cfg.AUTONOMY_MAP) {
      const needValue = needs[mapping.need];
      if (needValue === undefined) continue;

      // Only consider if need is below threshold
      if (needValue >= mapping.threshold) continue;

      // Skip if no activity mapped
      if (!mapping.activity) continue;

      // Check if activity is available (includes broken furniture check)
      if (!Game.Character.isAvailableActivity(mapping.activity)) continue;

      // Priority increases as need gets more critical
      const urgency = (mapping.threshold - needValue) / mapping.threshold;
      let score = mapping.priority * (1 + urgency * 2);

      // Forcefully prioritize urgent needs if below critical threshold
      const needCfg = Game.Config.NEEDS[mapping.need];
      if (needCfg && needValue <= (needCfg.criticalThreshold || 15)) {
        score *= 10; // Massive boost for critical needs
      }

      // Trait influence: boost activities that align with traits
      if (traitCfg && traitCfg.effects) {
        if (mapping.need === 'hunger' && traitCfg.effects.cookingXP) score *= 1.2;
        if (mapping.need === 'energy' && traitCfg.effects.napBonus) score *= 1.3;
        if (mapping.need === 'hygiene' && traitCfg.effects.hygieneDecay) score *= 1.15;
      }

      candidates.push({
        activity: mapping.activity,
        need: mapping.need,
        score,
        urgency,
      });
    }

    // If no urgent needs, try idle enrichment (fun/skill activities)
    if (candidates.length === 0) {
      const enrichmentActivities = [
        'read', 'use_computer', 'listen_music', 'play_games', 'paint',
        'exercise', 'stargaze', 'tinker', 'sit_garden', 'light_candle'
      ];
      const available = enrichmentActivities.filter(a => Game.Character.isAvailableActivity(a));
      if (available.length > 0) {
        const pick = available[Math.floor(Math.random() * available.length)];
        return { activity: pick, need: 'fun', score: 1, urgency: 0 };
      }
    }

    // Sort by score (highest first) and pick top
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  // Get current thought for rendering
  function getThought() {
    const char = Game.Character.getState();
    if (!char.autonomy.thought) return null;
    const actCfg = cfg.ACTIVITIES[char.autonomy.thought];
    if (!actCfg) return null;

    // Find the need that triggered this thought
    const mapping = cfg.AUTONOMY_MAP.find(m => m.activity === char.autonomy.thought);
    const needCfg = mapping ? cfg.NEEDS[mapping.need] : null;

    return {
      activity: char.autonomy.thought,
      activityIcon: actCfg.icon,
      activityLabel: actCfg.label,
      needIcon: needCfg ? needCfg.icon : '💭',
      needLabel: needCfg ? needCfg.label : '',
    };
  }

  return { update, evaluateNeeds, getThought };
})();
