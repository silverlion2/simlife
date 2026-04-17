// ============================================================
// SimLife — Cozy Audio System (Web Audio API)
// ============================================================
window.Game = window.Game || {};

Game.Audio = (function() {
  let ctx = null;
  let masterGain = null;
  let ambientGain = null;
  let initialized = false;

  function init() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.3;
      masterGain.connect(ctx.destination);
      ambientGain = ctx.createGain();
      ambientGain.gain.value = 0.15;
      ambientGain.connect(ctx.destination);
      initialized = true;
    } catch(e) { console.warn('Audio unavailable'); }
  }

  function ensureCtx() {
    if (!initialized) init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  // Simple tone beep (for UI clicks, harvest, etc.)
  function playTone(freq, duration, type, vol) {
    ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  // Warm chime (harvest, level up)
  function playChime() {
    playTone(523, 0.15, 'sine', 0.15);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.12), 100);
    setTimeout(() => playTone(784, 0.25, 'sine', 0.1), 200);
  }

  // Soft click (UI interaction)
  function playClick() {
    playTone(800, 0.05, 'square', 0.08);
  }

  // Footstep (soft thud)
  function playStep() {
    ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 80 + Math.random() * 40;
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  // Rain ambient loop
  let rainNode = null;
  function startRain() {
    ensureCtx();
    if (!ctx || rainNode) return;
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    rainNode = ctx.createBufferSource();
    rainNode.buffer = buffer;
    rainNode.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    rainNode.connect(filter);
    filter.connect(ambientGain);
    rainNode.start();
  }

  function stopRain() {
    if (rainNode) {
      try { rainNode.stop(); } catch(e) {}
      rainNode = null;
    }
  }

  // Notification ding
  function playNotification() {
    playTone(880, 0.1, 'sine', 0.1);
    setTimeout(() => playTone(1100, 0.15, 'sine', 0.08), 80);
  }

  return {
    init,
    playChime,
    playClick,
    playStep,
    playNotification,
    startRain,
    stopRain,
  };
})();
