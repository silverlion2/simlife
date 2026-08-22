// ============================================================
// SimLife — Small event boundary between simulation and views
// ============================================================
window.Game = window.Game || {};

Game.Signals = (function() {
  const listeners = new Map();

  function on(eventName, handler) {
    if (typeof handler !== 'function') throw new TypeError('Signal handler must be a function');
    const handlers = listeners.get(eventName) || new Set();
    handlers.add(handler);
    listeners.set(eventName, handlers);
    return () => off(eventName, handler);
  }

  function off(eventName, handler) {
    const handlers = listeners.get(eventName);
    if (!handlers) return false;
    const removed = handlers.delete(handler);
    if (handlers.size === 0) listeners.delete(eventName);
    return removed;
  }

  function emit(eventName, payload) {
    const handlers = listeners.get(eventName);
    if (!handlers) return 0;
    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`Signal handler failed for ${eventName}:`, error);
      }
    }
    return handlers.size;
  }

  return { on, off, emit };
})();
