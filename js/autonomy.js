// ============================================================
// SimLife — Autonomy AI System
// When idle, the Sim evaluates their needs and autonomously
// picks the best action — just like The Sims.
// ============================================================
window.Game = window.Game || {};

Game.Autonomy = (function() {
  const cfg = Game.Config;
  let decisionCooldown = 0;
  const DECISION_INTERVAL = 8; // seconds between autonomous decisions

  function update(deltaSeconds) {
    const char = Game.Character.getState();

    // Don't run if autonomy disabled, sim is busy, or has queued actions
    if (!char.autonomy.enabled) return;
    if (char.currentActivity) {
      char.autonomy.thought = null;
      return;
    }
    if (char.actionQueue.length > 0) return;

    decisionCooldown -= deltaSeconds;
    if (decisionCooldown > 0) return;
    decisionCooldown = DECISION_INTERVAL;

    // Evaluate needs and pick best action
    const decision = evaluateNeeds();
    if (decision) {
      char.autonomy.thought = decision.activity;
      char.autonomy.lastAutoTime = Game.State.get().time.totalMinutes;

      // Short delay before acting (shows thought bubble first)
      setTimeout(() => {
        const c = Game.Character.getState();
        if (!c.currentActivity && !c.actionQueue.length) {
          if (Game.Character.startActivity(decision.activity)) {
            const actCfg = cfg.ACTIVITIES[decision.activity];
            Game.UI && Game.UI.showNotification(`🤖 ${c.name} decided to ${actCfg.label.toLowerCase()}`);
          }
        }
      }, 1500);
    } else {
      char.autonomy.thought = null;
    }
  }

  function evaluateNeeds() {
    const char = Game.Character.getState();
    const needs = char.needs;
    const candidates = [];

    for (const mapping of cfg.AUTONOMY_MAP) {
      const needValue = needs[mapping.need];
      if (needValue === undefined) continue;

      // Only consider if need is below threshold
      if (needValue >= mapping.threshold) continue;

      // Skip social (no activity mapped)
      if (!mapping.activity) continue;

      // Check if activity is available
      if (!Game.Character.isAvailableActivity(mapping.activity)) continue;

      // Priority increases as need gets more critical
      const urgency = (mapping.threshold - needValue) / mapping.threshold;
      const score = mapping.priority * (1 + urgency * 2);

      candidates.push({
        activity: mapping.activity,
        need: mapping.need,
        score,
        urgency,
      });
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
