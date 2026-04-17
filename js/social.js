// ============================================================
// SimLife — Social System (NPCs, Relationships, Interactions)
// ============================================================
window.Game = window.Game || {};

Game.Social = (function() {
  const cfg = Game.Config;

  function getSocial() { return Game.State.get().social; }

  function getRelationship(npcId) {
    return getSocial().relationships[npcId] || 0;
  }

  function setRelationship(npcId, value) {
    getSocial().relationships[npcId] = Math.max(0, Math.min(100, value));
  }

  function getRelationshipLevel(npcId) {
    const rel = getRelationship(npcId);
    if (rel >= 80) return { level: 'best_friend', label: '🥰 Best Friend', romantic: false };
    if (rel >= 60) return { level: 'good_friend', label: '😄 Good Friend', romantic: false };
    if (rel >= 40) return { level: 'friend',      label: '😊 Friend',      romantic: false };
    if (rel >= 20) return { level: 'acquaintance', label: '🙂 Acquaintance', romantic: false };
    return { level: 'stranger', label: '😐 Stranger', romantic: false };
  }

  function interact(npcId, interactionKey) {
    const intCfg = cfg.INTERACTIONS[interactionKey];
    if (!intCfg) return { success: false, msg: 'Unknown interaction' };

    const rel = getRelationship(npcId);
    const char = Game.Character.getState();

    // Check requirements
    if (rel < intCfg.minRel) return { success: false, msg: 'Need a better relationship first' };
    if (intCfg.charismaReq > Game.Character.getSkillLevel('charisma')) {
      return { success: false, msg: `Need Charisma level ${intCfg.charismaReq}` };
    }
    if (intCfg.cost && !Game.Economy.canAfford(intCfg.cost)) {
      return { success: false, msg: `Need $${intCfg.cost}` };
    }
    if (intCfg.needRoom) {
      const house = Game.State.getActiveMap();
      if (!house.rooms.some(r => r.type === intCfg.needRoom)) {
        return { success: false, msg: `Need a ${cfg.ROOMS[intCfg.needRoom]?.label || intCfg.needRoom}` };
      }
    }

    // Pay cost
    if (intCfg.cost) Game.Economy.spend(intCfg.cost);

    // Calculate relationship gain
    const charisma = Game.Character.getSkillLevel('charisma');
    const prestigeBonus = (Game.State.get().prestige.upgrades.family_values || 0) * 0.20;
    const [minGain, maxGain] = intCfg.relGain;
    let gain = minGain + Math.random() * (maxGain - minGain);
    gain *= (1 + charisma * 0.1 + prestigeBonus);
    gain = Math.round(gain);

    setRelationship(npcId, rel + gain);

    // Social need
    char.needs.social = Math.min(100, char.needs.social + intCfg.socialGain);

    // Charisma XP from socializing
    Game.Character.addSkillXp('charisma', 5);

    // Check if became friend
    const newRel = getRelationship(npcId);
    if (rel < 40 && newRel >= 40) {
      Game.State.get().stats.friendsMade++;
      Game.UI && Game.UI.showNotification(`🎉 You and ${getNpcName(npcId)} are now friends!`);
    }

    // Marriage
    if (intCfg.marriage && newRel >= 80) {
      getSocial().married = true;
      getSocial().romanticTarget = npcId;
      char.spouse = npcId;
      Game.UI && Game.UI.showNotification(`💒 You married ${getNpcName(npcId)}! Congratulations!`);
      return { success: true, msg: `💍 ${getNpcName(npcId)} said YES!`, gain };
    }

    // Romantic tracking
    if (intCfg.romantic) {
      getSocial().romanticTarget = npcId;
    }

    const npcName = getNpcName(npcId);
    return { success: true, msg: `${intCfg.label} with ${npcName} (+${gain} ❤️)`, gain };
  }

  function getNpcName(npcId) {
    const npc = cfg.NPCS.find(n => n.id === npcId);
    return npc ? npc.name : 'Unknown';
  }

  function getNpc(npcId) {
    return cfg.NPCS.find(n => n.id === npcId);
  }

  function getAvailableInteractions(npcId) {
    const rel = getRelationship(npcId);
    const charisma = Game.Character.getSkillLevel('charisma');
    const married = getSocial().married;

    return Object.entries(cfg.INTERACTIONS)
      .filter(([key, int]) => {
        if (rel < int.minRel) return false;
        if (int.charismaReq > charisma) return false;
        if (int.marriage && (married || rel < int.minRel)) return false;
        if (int.romantic && married && getSocial().romanticTarget !== npcId) return false;
        return true;
      })
      .map(([key, int]) => ({ key, ...int }));
  }

  function getAllRelationships() {
    return cfg.NPCS.map(npc => ({
      ...npc,
      relationship: getRelationship(npc.id),
      levelInfo: getRelationshipLevel(npc.id),
    }));
  }

  // Relationship decay (daily)
  function decayRelationships() {
    for (const npc of cfg.NPCS) {
      const rel = getRelationship(npc.id);
      if (rel > 0) {
        setRelationship(npc.id, rel - 0.5);
      }
    }
  }

  return {
    getRelationship,
    setRelationship,
    getRelationshipLevel,
    interact,
    getNpcName,
    getNpc,
    getAvailableInteractions,
    getAllRelationships,
    decayRelationships,
  };
})();
