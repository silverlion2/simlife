// ============================================================
// SimLife - Workshop Object Crafting
// ============================================================
window.Game = window.Game || {};

Game.ObjectCrafting = (function() {
  const RECIPES = [
    { id: 'plant_box', label: 'Plant Box', output: 'plant', cost: 25, skill: 'handiness', level: 0, workstation: 'workbench' },
    { id: 'woven_rug', label: 'Woven Rug', output: 'rug', cost: 55, skill: 'creativity', level: 1, workstation: 'workbench' },
    { id: 'standing_mirror', label: 'Standing Mirror', output: 'mirror', cost: 90, skill: 'handiness', level: 2, workstation: 'workbench' },
    { id: 'garden_bench', label: 'Garden Bench', output: 'garden_bench', cost: 120, skill: 'handiness', level: 3, workstation: 'workbench' },
    { id: 'arcade_shell', label: 'Arcade Shell', output: 'arcade_machine', cost: 650, skill: 'tech', level: 4, workstation: 'printer_3d' },
  ];

  function getAvailableRecipes() {
    return RECIPES.map(recipe => {
      const check = canCraft(recipe.id);
      const furniture = Game.Config.FURNITURE[recipe.output];
      return {
        ...recipe,
        outputLabel: furniture ? furniture.label : recipe.output,
        outputIcon: furniture ? furniture.icon : '',
        available: check.allowed,
        reason: check.reason,
      };
    });
  }

  function craftObject(recipeId) {
    const recipe = getRecipe(recipeId);
    if (!recipe) return { success: false, reason: 'Recipe not found.' };
    const check = canCraft(recipeId);
    if (!check.allowed) return { success: false, reason: check.reason };

    Game.Economy.spend(recipe.cost);
    const object = Game.HomeGrowth.addInventoryObject(recipe.output, 'crafted', {
      recipeId: recipe.id,
      materialCost: recipe.cost,
    });
    if (!object) return { success: false, reason: 'Crafted object could not be stored.' };

    const state = Game.State.get();
    if (state.stats) state.stats.objectsCrafted = (state.stats.objectsCrafted || 0) + 1;
    if (Game.Character && Game.Character.addSkillXp) Game.Character.addSkillXp(recipe.skill, 12 + recipe.level * 4);
    if (Game.UI && Game.UI.showNotification) Game.UI.showNotification(`${recipe.label} crafted and moved to storage.`);
    return { success: true, recipe: { ...recipe }, object };
  }

  function canCraft(recipeId) {
    const recipe = getRecipe(recipeId);
    if (!recipe) return { allowed: false, reason: 'Recipe not found.' };
    if (!hasWorkstation(recipe.workstation)) {
      return { allowed: false, reason: `Place a ${workstationLabel(recipe.workstation)} first.` };
    }
    if (getSkillLevel(recipe.skill) < recipe.level) {
      return { allowed: false, reason: `Need ${recipe.skill} level ${recipe.level}.` };
    }
    if (!Game.Economy || !Game.Economy.canAfford(recipe.cost)) {
      return { allowed: false, reason: `Need $${recipe.cost.toLocaleString()} for materials.` };
    }
    if (Game.HomeGrowth && !Game.HomeGrowth.isFurnitureUnlocked(recipe.output)) {
      return { allowed: false, reason: Game.HomeGrowth.getFurnitureLockReason(recipe.output) };
    }
    return { allowed: true, reason: '' };
  }

  function hasWorkstation(type) {
    const house = Game.State.get().maps.house;
    return !!(house && Array.isArray(house.furniture) && house.furniture.some(item => item.type === type));
  }

  function getSkillLevel(skill) {
    const character = Game.State.get().character;
    return character && character.skills ? (character.skills[skill] || 0) : 0;
  }

  function workstationLabel(type) {
    const furniture = Game.Config.FURNITURE[type];
    return furniture ? furniture.label : type;
  }

  function getRecipe(recipeId) {
    return RECIPES.find(recipe => recipe.id === recipeId);
  }

  return {
    RECIPES,
    getAvailableRecipes,
    craftObject,
    canCraft,
  };
})();
