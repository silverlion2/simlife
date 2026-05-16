// ============================================================
// SimLife - Home Furniture Collections
// ============================================================
window.Game = window.Game || {};

Game.HomeCollections = (function() {
  const COLLECTIONS = [
    {
      key: 'starter_comfort',
      title: 'Starter Comfort',
      desc: 'A real first bedroom with the basics covered.',
      items: ['basic_bed', 'lamp', 'wardrobe'],
      rewardMoney: 150,
      rewardObjects: ['plant'],
    },
    {
      key: 'living_room_core',
      title: 'Living Room Core',
      desc: 'A sofa, screen, and books make the main room feel lived in.',
      items: ['basic_sofa', 'basic_tv', 'wide_bookcase'],
      rewardMoney: 220,
      rewardObjects: ['rug'],
    },
    {
      key: 'kitchen_basics',
      title: 'Kitchen Basics',
      desc: 'The everyday cooking setup for a growing household.',
      items: ['fridge', 'basic_stove', 'counter', 'sink_k'],
      rewardMoney: 180,
      rewardObjects: ['microwave'],
    },
    {
      key: 'garden_patch',
      title: 'Garden Patch',
      desc: 'A yard that can actually produce and relax.',
      items: [{ type: 'garden_plot', count: 3 }, 'bonsai_shrine'],
      rewardMoney: 260,
      rewardObjects: ['garden_bench'],
    },
    {
      key: 'family_nursery',
      title: 'Family Nursery',
      desc: 'A stocked space for raising children.',
      items: ['crib', 'changing_table', 'toy_chest'],
      rewardMoney: 420,
      rewardObjects: ['painting'],
    },
    {
      key: 'maker_workshop',
      title: 'Maker Workshop',
      desc: 'Tools and crafted decor for a self-sufficient home.',
      items: ['workbench', 'printer_3d', 'plant'],
      rewardMoney: 520,
      rewardObjects: ['mirror'],
    },
  ];

  function getState(targetState) {
    return targetState || Game.State.get();
  }

  function ensureState(targetState) {
    const state = getState(targetState);
    if (Game.HomeGrowth && Game.HomeGrowth.ensureState) Game.HomeGrowth.ensureState(state);
    if (!state.homeCollections) {
      state.homeCollections = { completed: [] };
    }
    if (!Array.isArray(state.homeCollections.completed)) state.homeCollections.completed = [];
    if (state.character && !Array.isArray(state.character.collection)) state.character.collection = [];
    return state.homeCollections;
  }

  function getCollections(targetState) {
    const state = getState(targetState);
    const collectionState = ensureState(state);
    const ownedCounts = getOwnedCounts(state);
    return COLLECTIONS.map(collection => {
      const items = collection.items.map(item => withItemProgress(item, ownedCounts));
      const complete = items.every(item => item.owned);
      const claimed = collectionState.completed.includes(collection.key);
      return {
        ...collection,
        items,
        owned: items.filter(item => item.owned).length,
        total: items.length,
        complete,
        claimed,
        claimable: complete && !claimed,
      };
    });
  }

  function claimCollection(collectionKey) {
    const state = Game.State.get();
    const collectionState = ensureState(state);
    const collection = getCollections(state).find(item => item.key === collectionKey);
    if (!collection) return { success: false, reason: 'Collection not found.' };
    if (collection.claimed) return { success: false, reason: 'Collection already claimed.' };
    if (!collection.complete) return { success: false, reason: 'Collection is not complete yet.' };

    if (Game.Economy && collection.rewardMoney) Game.Economy.addMoney(collection.rewardMoney);
    const rewardObjects = [];
    for (const type of collection.rewardObjects || []) {
      if (Game.HomeGrowth && Game.HomeGrowth.addInventoryObject) {
        const object = Game.HomeGrowth.addInventoryObject(type, `collection_${collection.key}`);
        if (object) rewardObjects.push(object);
      }
    }

    collectionState.completed.push(collection.key);
    if (state.character) {
      if (!Array.isArray(state.character.collection)) state.character.collection = [];
      if (!state.character.collection.includes(collection.key)) state.character.collection.push(collection.key);
    }
    if (state.stats) state.stats.homeCollectionsCompleted = (state.stats.homeCollectionsCompleted || 0) + 1;
    if (Game.UI && Game.UI.showNotification) Game.UI.showNotification(`${collection.title} collection complete.`);
    return {
      success: true,
      collection,
      rewardMoney: collection.rewardMoney || 0,
      rewardObjects,
    };
  }

  function refresh() {
    ensureState();
    return getCollections();
  }

  function withItemProgress(item, ownedCounts) {
    const required = typeof item === 'string' ? { type: item, count: 1 } : item;
    const furniture = Game.Config.FURNITURE[required.type] || { label: required.type, icon: '?' };
    const count = ownedCounts[required.type] || 0;
    const needed = Math.max(1, required.count || 1);
    return {
      type: required.type,
      label: furniture.label,
      icon: furniture.icon,
      count,
      needed,
      owned: count >= needed,
    };
  }

  function getOwnedCounts(state) {
    const counts = {};
    const house = state.maps && state.maps.house ? state.maps.house : Game.State.getActiveMap();
    for (const furniture of (house && house.furniture) || []) {
      if (!furniture.type) continue;
      counts[furniture.type] = (counts[furniture.type] || 0) + 1;
    }
    const storedObjects = state.inventory && Array.isArray(state.inventory.objects) ? state.inventory.objects : [];
    for (const object of storedObjects) {
      if (!object.type) continue;
      counts[object.type] = (counts[object.type] || 0) + 1;
    }
    return counts;
  }

  return {
    COLLECTIONS,
    ensureState,
    refresh,
    getCollections,
    claimCollection,
  };
})();
