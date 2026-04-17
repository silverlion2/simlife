// ============================================================
// SimLife — Contextual Interactions & Pie Menu
// ============================================================
window.Game = window.Game || {};

Game.Interaction = (function() {
  let pieMenuJustOpened = false;

  function init() {
    // No longer using document click to close. WebGL handles it via fullscreen blocker.
  }

  function handleObjectClick(type, objectData, screenX, screenY, isShiftDown) {
    if (type === 'furniture') {
      if (Game.Character.isFurnitureBroken && Game.Character.isFurnitureBroken(objectData.id)) {
        showRepairPieMenu(objectData, screenX, screenY);
      } else {
        showPieMenu(objectData, screenX, screenY, isShiftDown);
      }
    } else if (type === 'room') {
      showRoomPieMenu(objectData, screenX, screenY, isShiftDown);
    } else if (type === 'npc') {
      showNPCPieMenu(objectData, screenX, screenY);
    }
  }

  // ---- PIE MENU (Radial Context Menu) ----
  function showPieMenu(furn, screenX, screenY, shiftKey) {
    if (Game.Renderer.closePieMenu) Game.Renderer.closePieMenu();
    pieMenuJustOpened = true;
    const activities = getActivitiesForFurniture(furn);

    const mappedItems = activities.map(act => ({
      icon: act.icon,
      label: act.label,
      locked: act.locked,
      lockReason: act.lockReason,
      callback: (e) => {
        if (shiftKey || (e && e.shiftKey)) {
          if (Game.Character.queueActivity(act.key)) {
            Game.UI.showNotification(`📋 Queued: ${act.label}`);
            Game.UI.updateQueueDisplay();
          }
        } else {
          Game.Character.startActivity(act.key, false, furn.id);
        }
      }
    }));

    // Add portal travel option if this furniture is a map portal
    if (furn.type === 'map_portal' && furn.config && furn.config.targetMap) {
      mappedItems.unshift({
        icon: '🚩',
        label: `Travel to ${furn.config.targetMap}`,
        locked: false,
        lockReason: '',
        callback: () => {
          Game.Character.startActivity('travel', false, furn.id);
        }
      });
    }

    // Add Subway Travel
    if (furn.type === 'subway_gate') {
      const activeMapId = Game.State.get().character.mapId;
      const maps = ['house', 'downtown', 'university'].filter(m => m !== activeMapId);
      maps.forEach(mName => {
        mappedItems.unshift({
          icon: '🚇',
          label: `Take Subway to ${mName}`,
          locked: false,
          lockReason: '',
          callback: () => {
             furn.config = furn.config || {};
             furn.config.targetMap = mName;
             Game.Character.startActivity('take_subway', false, furn.id);
          }
        });
      });
    }

    // Add sell option in live mode
    const fc = Game.Config.FURNITURE[furn.type];
    if (fc) {
      const refund = Math.floor(fc.cost * 0.5);
      mappedItems.push({
        icon: '💸',
        label: `Sell ($${refund})`,
        locked: false,
        lockReason: '',
        callback: () => {
          Game.House.sellFurniture(furn.id);
          if (Game.Renderer && Game.Renderer.setBgDirty) Game.Renderer.setBgDirty();
          if (Game.Character.invalidateComfortCache) Game.Character.invalidateComfortCache();
        }
      });
    }

    if (mappedItems.length === 0) return;
    if (Game.Renderer.showPieMenu) Game.Renderer.showPieMenu(screenX, screenY, '✕', mappedItems);
  }

  function showRoomPieMenu(room, screenX, screenY, shiftKey) {
    if (Game.Renderer.closePieMenu) Game.Renderer.closePieMenu();
    pieMenuJustOpened = true;
    const activities = getActivitiesForRoom(room.type);
    if (activities.length === 0) return;

    const mappedItems = activities.map(act => ({
      icon: act.icon,
      label: act.label,
      locked: act.locked,
      lockReason: act.lockReason,
      callback: (e) => {
        if (shiftKey || (e && e.shiftKey)) {
          if (Game.Character.queueActivity(act.key)) {
            Game.UI.showNotification(`📋 Queued: ${act.label}`);
            Game.UI.updateQueueDisplay();
          }
        } else {
          Game.Character.startActivity(act.key);
        }
      }
    }));
    if (Game.Renderer.showPieMenu) Game.Renderer.showPieMenu(screenX, screenY, '✕', mappedItems);
  }

  function showRepairPieMenu(furn, screenX, screenY) {
    if (Game.Renderer.closePieMenu) Game.Renderer.closePieMenu();
    pieMenuJustOpened = true;

    const mappedItems = [
      {
        icon: '🔧',
        label: 'Repair',
        locked: false,
        lockReason: '',
        callback: () => {
          const handiness = Game.Character.getSkillLevel('handiness');
          const success = Math.random() < (0.4 + handiness * 0.06);
          if (success) {
            Game.Character.repairFurniture(furn.id);
            Game.Character.addSkillXp('handiness', 25);
            if (Game.Renderer.spawnExplosion) Game.Renderer.spawnExplosion(furn.x + 0.5, furn.y + 0.5, 0.6);
            const fc = Game.Config.FURNITURE[furn.type];
            Game.UI.showNotification(`✅ ${fc ? fc.label : 'Item'} repaired!`);
            Game.Character.addMoodlet({ name: 'Handy', value: 4, duration: 120, icon: '🔧' });
          } else {
            Game.Character.addSkillXp('handiness', 15);
            Game.UI.showNotification(`❌ Repair failed! Try again.`);
          }
        }
      }
    ];

    const fc = Game.Config.FURNITURE[furn.type];
    const refund = fc ? Math.floor(fc.cost * 0.25) : 0;
    mappedItems.push({
      icon: '🗑️',
      label: `Sell $${refund}`,
      locked: false,
      lockReason: '',
      callback: () => {
        Game.Character.repairFurniture(furn.id);
        Game.House.sellFurniture(furn.id);
      }
    });

    if (Game.Renderer.showPieMenu) Game.Renderer.showPieMenu(screenX, screenY, '✕', mappedItems);
  }

  function showNPCPieMenu(npc, screenX, screenY) {
    if (Game.Renderer.closePieMenu) Game.Renderer.closePieMenu();
    pieMenuJustOpened = true;
    const npcCfg = Game.Config.NPCS.find(n => n.id === npc.configId);
    if (!npcCfg) return;

    const interactions = Game.Social.getAvailableInteractions(npc.configId);
    if (interactions.length === 0) return;

    const mappedItems = interactions.map(int => ({
      icon: '💬',
      label: int.label,
      locked: false,
      lockReason: '',
      callback: () => {
        const result = Game.Social.interact(npc.configId, int.key);
        Game.UI.showNotification(result.msg);
        const char = Game.State.get().character;
        char.targetPosition = { x: npc.position.x, y: npc.position.y - 1 };
      }
    }));
    if (Game.Renderer.showPieMenu) Game.Renderer.showPieMenu(screenX, screenY, '✕', mappedItems);
  }

  function closePieMenu() {
    if (Game.Renderer.closePieMenu) Game.Renderer.closePieMenu();
  }

  // ---- Data Helpers ----
  function getActivitiesForFurniture(furn) {
    const furnType = furn.type;
    const activities = Game.Config.ACTIVITIES;
    let list = Object.entries(activities)
      .filter(([key, act]) => {
        if (!act.furniture) return false;
        return furnType.includes(act.furniture) || act.furniture === furnType;
      })
      .filter(([key]) => Game.Character.isAvailableActivity(key))
      .map(([key, act]) => {
         let locked = false;
         let lockReason = '';
         if (act.requires) {
            const currentLevel = Game.Character.getSkillLevel(act.requires.skill);
            if (currentLevel < act.requires.level) {
               locked = true;
               const skillDef = Game.Config.SKILLS[act.requires.skill];
               const skillLabel = skillDef ? skillDef.label : act.requires.skill;
               lockReason = `Requires Lvl ${act.requires.level} ${skillLabel}`;
            }
         }
         return { key, locked, lockReason, ...act };
      });

    // Custom filtering for gardening loop
    if (furnType === 'garden_plot') {
       const state = furn.cropState || 'empty';
       if (state === 'empty') {
         list = list.filter(a => a.key === 'plant_seed');
       } else if (state === 'growing') {
         if (furn.needsWater) list = list.filter(a => a.key === 'water_crop');
         else list = []; 
       } else if (state === 'ready') {
         list = list.filter(a => a.key === 'harvest_crop');
       }
    }
    return list;
  }

  function getActivitiesForRoom(roomType) {
    const activities = Game.Config.ACTIVITIES;
    return Object.entries(activities)
      .filter(([key, act]) => act.room === roomType && !act.furniture)
      .filter(([key]) => Game.Character.isAvailableActivity(key))
      .map(([key, act]) => {
         let locked = false;
         let lockReason = '';
         if (act.requires) {
            const currentLevel = Game.Character.getSkillLevel(act.requires.skill);
            if (currentLevel < act.requires.level) {
               locked = true;
               const skillDef = Game.Config.SKILLS[act.requires.skill];
               const skillLabel = skillDef ? skillDef.label : act.requires.skill;
               lockReason = `Requires Lvl ${act.requires.level} ${skillLabel}`;
            }
         }
         return { key, locked, lockReason, ...act };
      });
  }

  return {
    init,
    handleObjectClick,
    closePieMenu
  };
})();
