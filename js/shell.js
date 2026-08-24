// ============================================================
// SimLife: Hearthbyte Edition - Game shell, pause, and settings
// ============================================================
window.Game = window.Game || {};

Game.Shell = (function() {
  const SETTINGS_KEY = 'simlife_settings_v3';
  const DEFAULTS = {
    volume: 30,
    muted: false,
    scanlines: false,
    reducedMotion: false,
    highContrast: false,
  };

  let initialized = false;
  let previousSpeed = 1;
  let previousFocus = null;
  let settings = loadSettings();

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { ...DEFAULTS, ...saved };
    } catch (error) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch (error) {
      console.warn('Unable to persist SimLife settings:', error);
      return false;
    }
  }

  function applySettings() {
    document.body.classList.toggle('crt-off', !settings.scanlines);
    document.body.classList.toggle('reduced-motion', Boolean(settings.reducedMotion));
    document.body.classList.toggle('high-contrast-hud', Boolean(settings.highContrast));
    document.body.classList.toggle('audio-muted', Boolean(settings.muted));
    if (Game.Audio?.setMasterVolume) {
      Game.Audio.setMasterVolume(settings.volume / 100, settings.muted);
    }
  }

  function syncControls() {
    const volume = document.getElementById('setting-volume');
    const output = document.getElementById('setting-volume-value');
    const muted = document.getElementById('setting-muted');
    const scanlines = document.getElementById('setting-scanlines');
    const reducedMotion = document.getElementById('setting-reduced-motion');
    const highContrast = document.getElementById('setting-high-contrast');
    if (volume) volume.value = String(settings.volume);
    if (output) output.textContent = `${settings.volume}%`;
    if (muted) muted.checked = settings.muted;
    if (scanlines) scanlines.checked = settings.scanlines;
    if (reducedMotion) reducedMotion.checked = settings.reducedMotion;
    if (highContrast) highContrast.checked = settings.highContrast;
  }

  function setDrawer(name) {
    const controls = document.getElementById('pause-controls-panel');
    const settingsPanel = document.getElementById('pause-settings-panel');
    const controlsButton = document.getElementById('btn-pause-controls');
    const settingsButton = document.getElementById('btn-pause-settings');
    const showControls = name === 'controls' && controls?.classList.contains('hidden');
    const showSettings = name === 'settings' && settingsPanel?.classList.contains('hidden');

    controls?.classList.toggle('hidden', !showControls);
    settingsPanel?.classList.toggle('hidden', !showSettings);
    controlsButton?.setAttribute('aria-expanded', String(Boolean(showControls)));
    settingsButton?.setAttribute('aria-expanded', String(Boolean(showSettings)));
  }

  function isOpen() {
    const overlay = document.getElementById('pause-overlay');
    return Boolean(overlay && !overlay.classList.contains('hidden'));
  }

  function open() {
    const overlay = document.getElementById('pause-overlay');
    if (!overlay || isOpen() || Game.Renderer?.isInputBlocked?.()
      || document.body.classList.contains('event-open') || document.body.classList.contains('edit-modal-open')) return;
    const currentSpeed = Game.Main?.getSpeed?.();
    previousSpeed = Number.isFinite(currentSpeed) ? currentSpeed : 1;
    previousFocus = document.activeElement || null;
    if (Game.Main?.setSpeed) Game.Main.setSpeed(0, { silent: true });
    overlay.classList.remove('hidden');
    document.body.classList.add('game-paused');
    const ui = document.getElementById('ui-layer');
    ui?.setAttribute('inert', '');
    ui?.setAttribute('aria-hidden', 'true');
    setDrawer(null);
    document.getElementById('btn-pause-resume')?.focus();
  }

  function close() {
    const overlay = document.getElementById('pause-overlay');
    if (!overlay || !isOpen()) return;
    overlay.classList.add('hidden');
    document.body.classList.remove('game-paused');
    const ui = document.getElementById('ui-layer');
    if (!document.body.classList.contains('runtime-input-blocked') && !document.body.classList.contains('event-open')) {
      ui?.removeAttribute('inert');
      ui?.removeAttribute('aria-hidden');
    }
    if (Game.Main?.setSpeed) Game.Main.setSpeed(previousSpeed, { silent: true });
    const focusTarget = previousFocus;
    previousFocus = null;
    window.setTimeout(() => focusTarget?.focus?.(), 0);
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  function bindSetting(id, key, valueFromElement) {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener('input', () => {
      settings[key] = valueFromElement(element);
      saveSettings();
      applySettings();
      syncControls();
    });
  }

  function init() {
    document.title = 'SimLife: Hearthbyte Edition';
    applySettings();
    syncControls();
    const menuButton = document.getElementById('btn-ingame-menu');
    if (menuButton) menuButton.textContent = 'Ⅱ Pause';
    if (initialized) return;
    initialized = true;

    document.getElementById('btn-pause-resume')?.addEventListener('click', close);
    document.getElementById('btn-pause-save')?.addEventListener('click', () => {
      const saved = Game.State.save();
      if (Game.UI?.showNotification) {
        Game.UI.showNotification(saved ? 'World saved to cartridge.' : 'Save unavailable until a world is active.');
      }
    });
    document.getElementById('btn-pause-controls')?.addEventListener('click', () => setDrawer('controls'));
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => setDrawer('settings'));
    document.getElementById('btn-pause-menu')?.addEventListener('click', () => {
      if (!Game.State.save()) {
        Game.UI?.showNotification?.('Save failed. Staying in the current world so no progress is lost.');
        return;
      }
      window.location.reload();
    });
    menuButton?.addEventListener('click', event => {
      event.stopImmediatePropagation();
      open();
    }, true);

    bindSetting('setting-volume', 'volume', element => Number(element.value));
    bindSetting('setting-muted', 'muted', element => element.checked);
    bindSetting('setting-scanlines', 'scanlines', element => element.checked);
    bindSetting('setting-reduced-motion', 'reducedMotion', element => element.checked);
    bindSetting('setting-high-contrast', 'highContrast', element => element.checked);
  }

  function getSettings() {
    return { ...settings };
  }

  return {
    applySettings,
    close,
    getSettings,
    init,
    isOpen,
    open,
    toggle,
  };
})();
