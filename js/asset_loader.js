// ============================================================
// SimLife — Stable asset groups and resilient image preloading
// ============================================================
window.Game = window.Game || {};

Game.AssetManifest = (function() {
  const GROUPS = Object.freeze({
    shell: Object.freeze([]),
    starterWorld: Object.freeze(['world']),
    avatars: Object.freeze(['avatars']),
    buildCatalog: Object.freeze(['world']),
    careers: Object.freeze(['world']),
    optionalMaps: Object.freeze(['world']),
  });

  function getGroup(name) {
    return GROUPS[name] ? [...GROUPS[name]] : null;
  }

  return { GROUPS, getGroup };
})();

Game.AssetLoader = (function() {
  const DEFAULT_TIMEOUT_MS = 30000;
  const DEFAULT_CONCURRENCY = 24;
  const loadedGroups = new Set(['shell']);
  const inflight = new Map();

  function entriesForGroup(groupName) {
    const domains = Game.AssetManifest.getGroup(groupName);
    if (!domains) throw new Error(`Unknown asset group: ${groupName}`);
    const entries = [];
    if (domains.includes('world')) {
      entries.push(...Object.entries(window.SIM_ASSETS || {}).map(([key, src]) => ({
        key, src, target: window.SIM_PRELOADED_IMAGES, domain: 'world', required: true,
      })));
    }
    if (domains.includes('avatars')) {
      entries.push(...Object.entries(window.SIM_AVATAR_ASSETS || {}).map(([key, src]) => ({
        key, src, target: window.SIM_PRELOADED_AVATAR_IMAGES, domain: 'avatars', required: false,
      })));
    }
    return entries;
  }

  function loadImage(entry, timeoutMs) {
    if (entry.target[entry.key]) return Promise.resolve({ key: entry.key, status: 'cached' });
    return new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = status => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (status === 'loaded') entry.target[entry.key] = image;
        resolve({ key: entry.key, domain: entry.domain, required: entry.required, status });
      };
      const timer = setTimeout(() => finish('timeout'), timeoutMs);
      image.onload = () => finish('loaded');
      image.onerror = () => finish('failed');
      image.src = entry.src;
    });
  }

  async function loadEntries(entries, timeoutMs, concurrency) {
    const results = new Array(entries.length);
    let nextIndex = 0;
    const workerCount = Math.min(entries.length, concurrency);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < entries.length) {
        const index = nextIndex++;
        results[index] = await loadImage(entries[index], timeoutMs);
      }
    });
    await Promise.all(workers);
    return results;
  }

  async function loadGroup(groupName, options = {}) {
    if (loadedGroups.has(groupName) && !options.retry) {
      return { group: groupName, status: 'loaded', total: 0, loaded: 0, failed: 0, failures: [] };
    }
    if (inflight.has(groupName)) return inflight.get(groupName);

    const promise = (async () => {
      const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
      const concurrency = Math.max(1, Math.min(128, Number(options.concurrency) || DEFAULT_CONCURRENCY));
      const entries = entriesForGroup(groupName);
      const results = await loadEntries(entries, timeoutMs, concurrency);
      const failures = results.filter(result => result.status === 'failed' || result.status === 'timeout');
      const requiredFailures = failures.filter(result => result.required);
      const report = {
        group: groupName,
        status: requiredFailures.length ? 'error' : (failures.length ? 'partial' : 'loaded'),
        total: results.length,
        loaded: results.length - failures.length,
        failed: failures.length,
        failures,
      };
      if (!requiredFailures.length) loadedGroups.add(groupName);
      Game.Signals?.emit('assets:status', report);
      return report;
    })().finally(() => inflight.delete(groupName));

    inflight.set(groupName, promise);
    return promise;
  }

  function isLoaded(groupName) {
    return loadedGroups.has(groupName);
  }

  return { loadGroup, isLoaded };
})();
