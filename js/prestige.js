// ============================================================
// SimLife — Prestige / Legacy System
// ============================================================
window.Game = window.Game || {};

Game.Prestige = (function() {
  const cfg = Game.Config;

  function getPrestige() { return Game.State.get().prestige; }

  function calculateLegacyPoints() {
    const state = Game.State.get();
    let points = 0;

    // House value
    const houseVal = Game.Economy.calculateHouseValue();
    if (houseVal >= 50000) points += 15;
    else if (houseVal >= 10000) points += 5;

    // Career
    const career = state.character.career;
    if (career && career.level >= 4) points += 10;
    else if (career && career.level >= 2) points += 5;

    // Skills
    const highSkills = Object.values(state.character.skills).filter(s => s >= 7).length;
    if (highSkills >= 3) points += 8;
    else if (highSkills >= 1) points += 3;

    // Social
    if (state.social.married) points += 5;
    if (state.stats.friendsMade >= 3) points += 5;

    // Savings
    if (state.economy.money >= 20000) points += 8;
    else if (state.economy.money >= 5000) points += 3;

    // Rooms built
    if (state.maps.house.rooms.length >= 6) points += 12;
    else if (state.maps.house.rooms.length >= 3) points += 5;

    // Stats bonuses
    points += Math.floor(state.stats.eventsHandled * 0.5);
    points += state.stats.promotionsEarned * 2;

    return points;
  }

  function canPrestige() {
    const state = Game.State.get();
    return state.time.day >= 30; // Minimum 30 days played
  }

  function doPrestige() {
    if (!canPrestige()) return false;

    const pointsEarned = calculateLegacyPoints();
    const currentPrestige = getPrestige();
    const currentMoney = Game.State.get().economy.money;
    const topSkill = getTopSkill();

    // Save prestige data
    const newPrestige = {
      legacyPoints: currentPrestige.legacyPoints + pointsEarned,
      totalLegacyPoints: currentPrestige.totalLegacyPoints + pointsEarned,
      generation: currentPrestige.generation + 1,
      upgrades: { ...currentPrestige.upgrades },
    };

    // Reset
    Game.State.reset();
    const state = Game.State.get();
    state.prestige = newPrestige;

    // Apply existing upgrades
    applyUpgrades(state, currentMoney, topSkill);

    Game.State.save();
    Game.UI && Game.UI.showNotification(`🌟 New generation! Earned ${pointsEarned} Legacy Points!`);
    return true;
  }

  function applyUpgrades(state, prevMoney, topSkill) {
    const ups = state.prestige.upgrades;

    if (ups.inheritance) {
      state.economy.money += Math.floor(prevMoney * 0.3 * ups.inheritance);
    }
    if (ups.bigger_lot) {
      state.maps.house.lotWidth += 2 * ups.bigger_lot;
      state.maps.house.lotHeight += 2 * ups.bigger_lot;
    }
    if (ups.prodigy && topSkill) {
      state.character.skills[topSkill.key] = Math.min(3, ups.prodigy);
    }
  }

  function getTopSkill() {
    const skills = Game.State.get().character.skills;
    let top = null;
    for (const [key, level] of Object.entries(skills)) {
      if (!top || level > top.level) top = { key, level };
    }
    return top;
  }

  function buyUpgrade(upgradeKey) {
    const prestige = getPrestige();
    const upgCfg = cfg.PRESTIGE[upgradeKey];
    if (!upgCfg) return false;

    const currentLevel = prestige.upgrades[upgradeKey] || 0;
    if (currentLevel >= upgCfg.maxLevel) return false;

    const cost = upgCfg.cost * (currentLevel + 1); // Scaling cost
    if (prestige.legacyPoints < cost) return false;

    prestige.legacyPoints -= cost;
    prestige.upgrades[upgradeKey] = currentLevel + 1;
    Game.UI && Game.UI.showNotification(`✨ Upgraded ${upgCfg.label} to level ${currentLevel + 1}!`);
    return true;
  }

  function getUpgradeInfo() {
    const prestige = getPrestige();
    return Object.entries(cfg.PRESTIGE).map(([key, upgCfg]) => {
      const level = prestige.upgrades[key] || 0;
      const cost = upgCfg.cost * (level + 1);
      return {
        key,
        ...upgCfg,
        currentLevel: level,
        nextCost: level < upgCfg.maxLevel ? cost : null,
        maxed: level >= upgCfg.maxLevel,
        affordable: prestige.legacyPoints >= cost,
      };
    });
  }

  return {
    calculateLegacyPoints,
    canPrestige,
    doPrestige,
    buyUpgrade,
    getUpgradeInfo,
    getPrestige,
  };
})();
