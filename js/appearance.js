// ============================================================
// SimLife - Avatar Appearance Helpers
// ============================================================
window.Game = window.Game || {};

Game.Appearance = (function() {
  const catalog = Game.AvatarCatalog;
  if (!catalog) throw new Error('Game.Appearance requires Game.AvatarCatalog to be loaded first');

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function colorNumberToHex(value) {
    if (typeof value !== 'number') return '#3f7fb8';
    return '#' + value.toString(16).padStart(6, '0').slice(-6);
  }

  function legacyFormToCatalog(form) {
    if (form === 'online_witch') return 'witch';
    if (form === 'robot' || form === 'cat' || form === 'banana' || form === 'human' || form === 'witch') return form;
    return 'human';
  }

  function defaultFormState(form) {
    const defaults = catalog.DEFAULTS[form] || catalog.DEFAULTS.human;
    return clone(defaults);
  }

  function fromLegacy(character) {
    const form = legacyFormToCatalog(character && character.form);
    const state = {
      form,
      forms: {},
      outfitId: 'everyday',
    };
    state.forms[form] = defaultFormState(form);
    if (character && character.color !== undefined) {
      const legacyHex = typeof character.color === 'string' ? character.color : colorNumberToHex(character.color);
      state.forms[form].colors.primary = legacyHex;
      if (form === 'robot') state.forms[form].colors.accent = legacyHex;
      if (form === 'cat') state.forms[form].colors.accent = legacyHex;
      if (form === 'banana') state.forms[form].colors.peel = legacyHex;
    }
    return normalizeAppearance(state);
  }

  function normalizeAppearance(input) {
    const appearance = input && typeof input === 'object' ? clone(input) : {};
    const activeForm = legacyFormToCatalog(appearance.form);
    const result = {
      form: activeForm,
      forms: appearance.forms && typeof appearance.forms === 'object' ? appearance.forms : {},
      outfitId: appearance.outfitId || 'everyday',
    };

    for (const form of Object.keys(catalog.FORMS)) {
      if (!result.forms[form]) result.forms[form] = defaultFormState(form);
      result.forms[form] = normalizeFormState(form, result.forms[form]);
    }
    return result;
  }

  function normalizeFormState(form, formState) {
    const defaults = defaultFormState(form);
    const slots = { ...defaults.slots, ...(formState && formState.slots ? formState.slots : {}) };
    const colors = { ...defaults.colors, ...(formState && formState.colors ? formState.colors : {}) };
    for (const slot of catalog.FORMS[form].slots) {
      const itemId = slots[slot];
      const item = catalog.ITEMS[itemId];
      if (!item || item.form !== form || item.slot !== slot) slots[slot] = defaults.slots[slot];
    }
    return { slots, colors };
  }

  function getActiveFormState(appearance) {
    const normalized = normalizeAppearance(appearance);
    return normalized.forms[normalized.form];
  }

  function setForm(appearance, form) {
    const normalized = normalizeAppearance(appearance);
    normalized.form = catalog.FORMS[form] ? form : 'human';
    if (!normalized.forms[normalized.form]) normalized.forms[normalized.form] = defaultFormState(normalized.form);
    return normalizeAppearance(normalized);
  }

  function setSlot(appearance, slot, itemId) {
    const normalized = normalizeAppearance(appearance);
    const form = normalized.form;
    const item = catalog.ITEMS[itemId];
    if (item && item.form === form && item.slot === slot) normalized.forms[form].slots[slot] = itemId;
    return normalizeAppearance(normalized);
  }

  function setColor(appearance, channel, value) {
    const normalized = normalizeAppearance(appearance);
    normalized.forms[normalized.form].colors[channel] = value;
    return normalizeAppearance(normalized);
  }

  function getItemsForSlot(form, slot) {
    return Object.values(catalog.ITEMS).filter(item => item.form === form && item.slot === slot);
  }

  function getRenderLayers(appearance, direction) {
    const normalized = normalizeAppearance(appearance);
    const formState = normalized.forms[normalized.form];
    const dir = catalog.DIRECTIONS.includes(direction) ? direction : catalog.FORMS[normalized.form].defaultDirection;
    return Object.entries(formState.slots)
      .map(([slot, itemId]) => catalog.ITEMS[itemId])
      .filter(Boolean)
      .filter(item => item.value !== 'none')
      .map(item => ({
        id: item.id,
        slot: item.slot,
        order: item.order,
        textureKey: item.textures[dir] || item.textures.S,
        colorChannels: item.colorChannels,
        colors: formState.colors,
      }))
      .sort((a, b) => a.order - b.order);
  }

  return {
    normalizeAppearance,
    normalizeFormState,
    fromLegacy,
    setForm,
    setSlot,
    setColor,
    getActiveFormState,
    getItemsForSlot,
    getRenderLayers,
    legacyFormToCatalog,
  };
})();
