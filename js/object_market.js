// ============================================================
// SimLife - Daily Object Market
// ============================================================
window.Game = window.Game || {};

Game.ObjectMarket = (function() {
  const OFFER_COUNT = 6;
  const EXCLUDED_TYPES = new Set([
    'map_portal',
    'subway_gate',
    'garden_plot',
    'display_shelf',
    'language_book',
  ]);

  function getState(targetState) {
    return targetState || Game.State.get();
  }

  function ensureState(targetState) {
    const state = getState(targetState);
    if (Game.HomeGrowth && Game.HomeGrowth.ensureState) Game.HomeGrowth.ensureState(state);
    if (!state.inventory) state.inventory = { objects: [], nextObjectId: 1 };
    if (!Array.isArray(state.inventory.objects)) state.inventory.objects = [];
    if (!state.inventory.market) {
      state.inventory.market = { generatedDay: null, offers: [] };
    }
    if (!Array.isArray(state.inventory.market.offers)) state.inventory.market.offers = [];
    if (!Number.isInteger(state.inventory.market.generatedDay)) state.inventory.market.generatedDay = null;
    return state.inventory.market;
  }

  function getDailyOffers() {
    const state = Game.State.get();
    const market = ensureState(state);
    const day = state.time && Number.isInteger(state.time.day) ? state.time.day : 1;
    if (market.generatedDay !== day) {
      return refreshDailyOffers(state);
    }
    return market.offers.map(cloneOffer);
  }

  function refreshDailyOffers(targetState) {
    const state = getState(targetState);
    const market = ensureState(state);
    const day = state.time && Number.isInteger(state.time.day) ? state.time.day : 1;
    const level = state.homeGrowth && Number.isInteger(state.homeGrowth.level) ? state.homeGrowth.level : 1;
    const eligible = getEligibleFurnitureTypes();
    const offers = [];
    const seen = new Set();

    if (eligible.length) {
      let cursor = Math.abs((day * 5) + (level * 7)) % eligible.length;
      let attempts = 0;
      while (offers.length < Math.min(OFFER_COUNT, eligible.length) && attempts < eligible.length * 3) {
        const type = eligible[cursor % eligible.length];
        cursor += 3;
        attempts += 1;
        if (seen.has(type)) continue;
        seen.add(type);
        offers.push(createOffer(type, day, offers.length));
      }
    }

    market.generatedDay = day;
    market.offers = offers;
    return offers.map(cloneOffer);
  }

  function getEligibleFurnitureTypes() {
    return Object.entries(Game.Config.FURNITURE || {})
      .filter(([key, furniture]) => {
        if (EXCLUDED_TYPES.has(key)) return false;
        if (!furniture || furniture.cost <= 0) return false;
        if (!furniture.room || furniture.room === '*' || furniture.room === 'subway') return false;
        return !Game.HomeGrowth || !Game.HomeGrowth.isFurnitureUnlocked || Game.HomeGrowth.isFurnitureUnlocked(key);
      })
      .sort((a, b) => {
        const costDiff = (a[1].cost || 0) - (b[1].cost || 0);
        return costDiff || a[0].localeCompare(b[0]);
      })
      .map(([key]) => key);
  }

  function createOffer(type, day, index) {
    const furniture = Game.Config.FURNITURE[type];
    const price = Math.max(1, Math.round((furniture.cost || 1) * getDailyPriceMultiplier(day, index)));
    return {
      id: `offer_${day}_${index}_${type}`,
      type,
      label: furniture.label,
      room: furniture.room,
      price,
      quality: furniture.quality || 1,
      day,
    };
  }

  function getDailyPriceMultiplier(day, index) {
    const step = Math.abs((day + index) % 5);
    return 0.75 + (step * 0.05);
  }

  function buyOffer(offerId) {
    const state = Game.State.get();
    const market = ensureState(state);
    const offerIndex = market.offers.findIndex(offer => offer.id === offerId);
    if (offerIndex === -1) return { success: false, reason: 'Offer is no longer available.' };

    const offer = market.offers[offerIndex];
    if (!Game.Economy || !Game.Economy.canAfford(offer.price)) {
      return { success: false, reason: `Need $${offer.price.toLocaleString()} for ${offer.label}.` };
    }

    Game.Economy.spend(offer.price);
    const object = Game.HomeGrowth.addInventoryObject(offer.type, 'daily_market', {
      pricePaid: offer.price,
      offerId: offer.id,
    });
    if (!object) return { success: false, reason: 'Object could not be delivered.' };

    market.offers.splice(offerIndex, 1);
    if (state.stats) state.stats.objectsCollected = (state.stats.objectsCollected || 0) + 1;
    if (Game.UI && Game.UI.showNotification) {
      Game.UI.showNotification(`${offer.label} delivered to storage.`);
    }
    return { success: true, object, offer: cloneOffer(offer) };
  }

  function cloneOffer(offer) {
    return { ...offer };
  }

  return {
    ensureState,
    getDailyOffers,
    refreshDailyOffers,
    buyOffer,
  };
})();
