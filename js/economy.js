// ============================================================
// SimLife — Economy System (Money, Careers, Bills)
// ============================================================
window.Game = window.Game || {};

Game.Economy = (function() {
  const cfg = Game.Config;

  function getEcon() { return Game.State.get().economy; }
  function getChar() { return Game.State.get().character; }

  function getMoney() { return getEcon().money; }

  function addMoney(amount) {
    const econ = getEcon();
    econ.money += amount;
    if (amount > 0) econ.totalEarned += amount;
    else econ.totalSpent += Math.abs(amount);
  }

  function canAfford(cost) { return getEcon().money >= cost; }

  function spend(cost) {
    if (!canAfford(cost)) return false;
    addMoney(-cost);
    return true;
  }

  // Career management
  function getCareer() { return getChar().career; }

  function joinCareer(careerKey) {
    const careerCfg = cfg.CAREERS[careerKey];
    if (!careerCfg) return false;

    const startLevel = Math.min(
      (Game.State.get().prestige.upgrades.connections || 0),
      careerCfg.levels.length - 1
    );

    getChar().career = {
      type: careerKey,
      level: startLevel,
      daysWorked: 0,
      performance: 0,
    };

    Game.UI && Game.UI.showNotification(`💼 Started career as ${careerCfg.levels[startLevel].title}!`);
    return true;
  }

  function quitCareer() {
    getChar().career = null;
    Game.UI && Game.UI.showNotification('📋 You quit your job.');
  }

  function getCareerInfo() {
    const career = getCareer();
    if (!career) return null;
    const careerCfg = cfg.CAREERS[career.type];
    const levelCfg = careerCfg.levels[career.level];
    return {
      ...career,
      config: careerCfg,
      levelConfig: levelCfg,
      nextLevel: career.level < careerCfg.levels.length - 1 ? careerCfg.levels[career.level + 1] : null,
    };
  }

  function isWorkHours(hour) {
    const career = getCareer();
    if (!career) return false;
    const careerCfg = cfg.CAREERS[career.type];
    const levelCfg = careerCfg.levels[career.level];
    return hour >= levelCfg.scheduleStart && hour < levelCfg.scheduleEnd;
  }

  function processWorkDay() {
    const career = getCareer();
    if (!career) return;
    const careerCfg = cfg.CAREERS[career.type];
    const levelCfg = careerCfg.levels[career.level];
    const moodInfo = Game.Character.getMoodInfo();

    // Earn salary
    const salary = Math.round(levelCfg.salary * moodInfo.workBonus);
    addMoney(salary);
    career.daysWorked++;

    // Performance builds toward promotion
    const skillLevel = Game.Character.getSkillLevel(careerCfg.keySkill);
    career.performance += moodInfo.workBonus * (1 + skillLevel * 0.1);

    // Show salary with mood multiplier feedback
    const moodPct = Math.round(moodInfo.workBonus * 100);
    const moodTag = moodPct >= 100 ? `😄 ${moodPct}%` : `😞 ${moodPct}%`;
    Game.UI && Game.UI.showNotification(`💰 Earned $${salary} from work today (mood: ${moodTag})`);

    // Floating bubble if renderer available
    if (Game.Renderer && Game.Renderer.spawnFloatingBubble) {
      const char = getChar();
      Game.Renderer.spawnFloatingBubble(char.position.x, char.position.y - 0.5, `+$${salary}`, '#FFD700', '💼');
    }

    // Check promotion
    checkPromotion();
  }

  function checkPromotion() {
    const career = getCareer();
    if (!career) return;
    const careerCfg = cfg.CAREERS[career.type];
    if (career.level >= careerCfg.levels.length - 1) return;

    const nextLevel = careerCfg.levels[career.level + 1];
    const skillLevel = Game.Character.getSkillLevel(careerCfg.keySkill);
    const performanceReq = (career.level + 1) * 5;

    if (skillLevel >= nextLevel.skillReq && career.performance >= performanceReq) {
      career.level++;
      career.performance = 0;
      Game.State.get().stats.promotionsEarned++;
      Game.UI && Game.UI.showNotification(`🎉 Promoted to ${nextLevel.title}! Salary: $${nextLevel.salary}/day`);
    }
  }

  // Bills (weekly)
  function calculateBills() {
    const house = Game.State.getActiveMap();
    let baseBill = 20;
    baseBill += house.rooms.length * 15;
    baseBill += house.furniture.length * 3;
    return baseBill;
  }

  function processBills() {
    const bills = calculateBills();
    if (canAfford(bills)) {
      spend(bills);
      Game.UI && Game.UI.showNotification(`📬 Weekly bills paid: $${bills}`);
    } else {
      // Can't afford — comfort and fun penalty
      const char = getChar();
      char.needs.comfort = Math.max(0, char.needs.comfort - 20);
      char.needs.fun = Math.max(0, char.needs.fun - 15);
      Game.UI && Game.UI.showNotification(`⚠️ Can't afford bills ($${bills})! Comfort decreased.`);
    }
  }

  // House value (for prestige)
  function calculateHouseValue() {
    const house = Game.State.getActiveMap();
    let value = 0;
    for (const room of house.rooms) {
      const roomCfg = cfg.ROOMS[room.type];
      if (roomCfg) value += roomCfg.baseCost;
    }
    for (const furn of house.furniture) {
      const furnCfg = cfg.FURNITURE[furn.type];
      if (furnCfg) value += furnCfg.cost;
    }
    return value;
  }

  return {
    getMoney,
    addMoney,
    canAfford,
    spend,
    getCareer,
    joinCareer,
    quitCareer,
    getCareerInfo,
    isWorkHours,
    processWorkDay,
    calculateBills,
    processBills,
    calculateHouseValue,
  };
})();
