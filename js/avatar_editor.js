// ============================================================
// SimLife - Shared Avatar Editor UI
// ============================================================
window.Game = window.Game || {};

Game.AvatarEditor = (function() {
  const FORM_ORDER = ['human', 'witch', 'robot', 'cat', 'banana'];
  const TAB_ORDER = ['body', 'clothes', 'accessories', 'colors'];
  const TAB_LABELS = {
    body: 'Body',
    clothes: 'Clothes',
    accessories: 'Extras',
    colors: 'Colors',
  };
  const SLOT_TABS = {
    body: ['body', 'chassis', 'coat', 'peel', 'hair', 'headModule', 'ears', 'face'],
    clothes: ['top', 'bottom', 'shoes', 'torsoTrim', 'legTrim', 'collar'],
    accessories: ['hat', 'accessory'],
  };

  function mount(containerId, initialAppearance, options) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Avatar editor container not found: ${containerId}`);
    if (!Game.Appearance) throw new Error('Game.AvatarEditor requires Game.Appearance');
    if (!Game.AvatarCatalog) throw new Error('Game.AvatarEditor requires Game.AvatarCatalog');

    let appearance = Game.Appearance.normalizeAppearance(initialAppearance);
    let activeTab = 'body';
    const settings = options || {};

    function setAppearance(nextAppearance, shouldNotify) {
      appearance = Game.Appearance.normalizeAppearance(nextAppearance);
      render();
      if (shouldNotify && typeof settings.onChange === 'function') {
        settings.onChange(getAppearance());
      }
    }

    function getAppearance() {
      return Game.Appearance.normalizeAppearance(appearance);
    }

    function activeSlots() {
      const form = appearance.form;
      const formSlots = Game.AvatarCatalog.FORMS[form].slots;
      return (SLOT_TABS[activeTab] || []).filter(slot => formSlots.includes(slot));
    }

    function colorValue(channel) {
      const state = Game.Appearance.getActiveFormState(appearance);
      return state.colors[channel];
    }

    function resolveColor(value) {
      return Game.AvatarCatalog.COLOR_VALUES[value] || value || '#3f7fb8';
    }

    function itemLabel(slot) {
      return slot.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());
    }

    function nextColor(channel) {
      const palettes = Game.AvatarCatalog.PALETTES;
      const form = appearance.form;
      const palette = palettes[channel] || palettes[form] || palettes.clothing || [];
      const current = colorValue(channel);
      if (!palette.length) return current;
      const index = palette.indexOf(current);
      return palette[(index + 1) % palette.length];
    }

    function renderPreview() {
      const state = Game.Appearance.getActiveFormState(appearance);
      const colors = Object.values(state.colors).map(resolveColor);
      const primary = colors[0] || '#3f7fb8';
      const secondary = colors[1] || '#202935';
      const layers = Game.Appearance.getRenderLayers(appearance, 'S');
      const layerMarkup = layers.map(layer => {
        const src = window.SIM_AVATAR_ASSETS && window.SIM_AVATAR_ASSETS[layer.textureKey];
        if (!src) return '';
        return `<img class="avatar-preview-layer" src="${src}" alt="" draggable="false">`;
      }).join('');
      return `
        <div class="avatar-preview" aria-hidden="true">
          <div class="avatar-preview-stage avatar-preview-${appearance.form}" style="--avatar-primary:${primary}; --avatar-secondary:${secondary};">
            ${layerMarkup || '<div class="avatar-preview-fallback"></div>'}
          </div>
          <div class="avatar-preview-name">${Game.AvatarCatalog.FORMS[appearance.form].label}</div>
        </div>
      `;
    }

    function renderForms() {
      return `
        <div class="avatar-form-row">
          ${FORM_ORDER.map(form => `
            <button type="button" class="${form === appearance.form ? 'selected' : ''}" data-avatar-form="${form}">
              ${Game.AvatarCatalog.FORMS[form].label}
            </button>
          `).join('')}
        </div>
      `;
    }

    function renderTabs() {
      return `
        <div class="avatar-tabs">
          ${TAB_ORDER.map(tab => `
            <button type="button" class="${tab === activeTab ? 'selected' : ''}" data-avatar-tab="${tab}">
              ${TAB_LABELS[tab]}
            </button>
          `).join('')}
        </div>
      `;
    }

    function renderSlotOptions() {
      const state = Game.Appearance.getActiveFormState(appearance);
      const slots = activeSlots();
      if (!slots.length) return '<div class="avatar-empty">No options for this form.</div>';

      return slots.map(slot => {
        const items = Game.Appearance.getItemsForSlot(appearance.form, slot);
        return `
          <div class="avatar-slot-group">
            <div class="avatar-slot-title">${itemLabel(slot)}</div>
            <div class="avatar-option-grid">
              ${items.map(item => `
                <button
                  type="button"
                  class="${state.slots[slot] === item.id ? 'selected' : ''}"
                  data-avatar-slot="${slot}"
                  data-avatar-item="${item.id}">
                  ${item.label}
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }).join('');
    }

    function renderColors() {
      const state = Game.Appearance.getActiveFormState(appearance);
      return `
        <div class="avatar-swatch-grid">
          ${Object.entries(state.colors).map(([channel, value]) => `
            <button
              type="button"
              class="avatar-swatch"
              data-color-channel="${channel}"
              title="${itemLabel(channel)}"
              style="--swatch-color:${resolveColor(value)}">
              <span class="avatar-swatch-chip"></span>
              <span>${itemLabel(channel)}</span>
            </button>
          `).join('')}
        </div>
      `;
    }

    function renderPanel() {
      return activeTab === 'colors' ? renderColors() : renderSlotOptions();
    }

    function bindEvents() {
      container.querySelectorAll('[data-avatar-form]').forEach(button => {
        button.addEventListener('click', () => {
          setAppearance(Game.Appearance.setForm(appearance, button.dataset.avatarForm), true);
        });
      });

      container.querySelectorAll('[data-avatar-tab]').forEach(button => {
        button.addEventListener('click', () => {
          activeTab = button.dataset.avatarTab;
          render();
        });
      });

      container.querySelectorAll('[data-avatar-slot][data-avatar-item]').forEach(button => {
        button.addEventListener('click', () => {
          setAppearance(Game.Appearance.setSlot(appearance, button.dataset.avatarSlot, button.dataset.avatarItem), true);
        });
      });

      container.querySelectorAll('[data-color-channel]').forEach(button => {
        button.addEventListener('click', () => {
          const channel = button.dataset.colorChannel;
          setAppearance(Game.Appearance.setColor(appearance, channel, nextColor(channel)), true);
        });
      });
    }

    function render() {
      container.innerHTML = `
        <div class="avatar-editor">
          ${renderPreview()}
          ${renderForms()}
          ${renderTabs()}
          ${renderPanel()}
        </div>
      `;
      bindEvents();
    }

    render();
    return { getAppearance, setAppearance };
  }

  return { mount };
})();
