// ============================================================
// SimLife — Deterministic-capable random source
// ============================================================
window.Game = window.Game || {};

Game.Random = (function() {
  let seeded = false;
  let state = 0;

  function hashSeed(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0 || 0x6d2b79f5;
  }

  function seed(value) {
    state = hashSeed(value);
    seeded = true;
    return state;
  }

  function reset() {
    seeded = false;
    state = 0;
  }

  function float() {
    if (!seeded) return Math.random();
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function int(min, max) {
    const lower = Math.ceil(Number(min));
    const upper = Math.floor(Number(max));
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper < lower) {
      throw new RangeError('Game.Random.int requires a finite min <= max');
    }
    return lower + Math.floor(float() * (upper - lower + 1));
  }

  return { seed, reset, float, int };
})();
