// ============================================================
// SimLife — Autonomy AI System (RexState FSM)
// ============================================================
window.Game = window.Game || {};

Game.Autonomy = (function() {
  const cfg = Game.Config;
  let decisionCooldown = 0;
  const DECISION_INTERVAL = 8; // game-seconds between autonomous decisions
  let fsm = null;

  function init() {
    if (fsm) return;
    if (typeof rexstatemanagerplugin === 'undefined') {
       console.warn("RexStateManagerPlugin not loaded yet.");
       return;
    }

    fsm = new rexstatemanagerplugin.FSM({
      start: 'idle',
      states: {
        idle: {
          enter: function() {
            decisionCooldown = DECISION_INTERVAL;
            const char = Game.Character.getState();
            if (char.autonomy) char.autonomy.thought = null;
          },
          update: function(fsm, deltaSeconds) {
            const char = Game.Character.getState();

            // If player queued an action or manually started an activity
            if (char.currentActivity) {
               fsm.goto(char.targetPosition ? 'navigating' : 'interacting');
               return;
            }
            if (char.actionQueue.length > 0) {
               Game.Character.processQueue();
               fsm.goto(char.targetPosition ? 'navigating' : 'interacting');
               return;
            }

            if (!char.autonomy.enabled) return;

            decisionCooldown -= deltaSeconds;
            if (decisionCooldown <= 0) {
              decisionCooldown = DECISION_INTERVAL;
              const decision = evaluateNeeds();
              if (decision) {
                char.autonomy.thought = decision.activity;
                char.autonomy.lastAutoTime = Game.State.get().time.totalMinutes;
                fsm.next(); // Go to thinking
              }
            }
          },
          next: function() { return 'thinking'; }
        },
        thinking: {
          enter: function() {
            this.thinkTimer = 2.0; // 2 wall-clock seconds for thought bubble
          },
          update: function(fsm, deltaSeconds) {
            const char = Game.Character.getState();
            // Interrupt thought if player overrides
            if (char.actionQueue.length > 0 || char.currentActivity) {
               fsm.goto('idle');
               return;
            }

            this.thinkTimer -= deltaSeconds;
            if (this.thinkTimer <= 0) {
              fsm.next();
            }
          },
          next: function() {
            const char = Game.Character.getState();
            if (char.autonomy && char.autonomy.thought) {
              if (Game.Character.startActivity(char.autonomy.thought)) {
                const actCfg = cfg.ACTIVITIES[char.autonomy.thought];
                Game.UI && Game.UI.showNotification(`🤖 ${char.name} decided to ${actCfg.label.toLowerCase()}`);
                char.autonomy.thought = null;
                return char.targetPosition ? 'navigating' : 'interacting';
              }
            }
            return 'idle'; // Failed to start activity for some reason
          }
        },
        navigating: {
          enter: function() {
            // Started walking
          },
          update: function(fsm, deltaSeconds) {
            const char = Game.Character.getState();
            if (!char.currentActivity) {
               fsm.goto('idle'); // Action cancelled
               return;
            }
            if (!char.targetPosition && !char.wasMoving) {
               fsm.next(); // Reached target, stat interacting
            }
          },
          next: function() { return 'interacting'; }
        },
        interacting: {
          update: function(fsm, deltaSeconds) {
            const char = Game.Character.getState();
            if (!char.currentActivity) {
               fsm.next(); // Activity completed or cancelled
            }
          },
          next: function() { return 'idle'; }
        }
      }
    });
  }

  function update(deltaSeconds) {
    if (!fsm) init();
    if (fsm) {
       fsm.update(deltaSeconds);
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
      if (needValue >= mapping.threshold) continue;
      if (!mapping.activity) continue;
      if (!Game.Character.isAvailableActivity(mapping.activity)) continue;

      const urgency = (mapping.threshold - needValue) / mapping.threshold;
      let score = mapping.priority * (1 + urgency * 2);

      const needCfg = Game.Config.NEEDS[mapping.need];
      if (needCfg && needValue <= (needCfg.criticalThreshold || 15)) {
        score *= 10; 
      }

      if (traitCfg && traitCfg.effects) {
        if (mapping.need === 'hunger' && traitCfg.effects.cookingXP) score *= 1.2;
        if (mapping.need === 'energy' && traitCfg.effects.napBonus) score *= 1.3;
        if (mapping.need === 'hygiene' && traitCfg.effects.hygieneDecay) score *= 1.15;
      }

      candidates.push({ activity: mapping.activity, need: mapping.need, score, urgency });
    }

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

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function getThought() {
    const char = Game.Character.getState();
    if (!char.autonomy.thought) return null;
    const actCfg = cfg.ACTIVITIES[char.autonomy.thought];
    if (!actCfg) return null;

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
  
  function getFSM() {
      return fsm;
  }

  return { update, evaluateNeeds, getThought, getFSM };
})();
