// ============================================================
// SimLife - Renderer Math Helpers
// ============================================================
window.Game = window.Game || {};

Game.RendererMath = (function() {
  const TILE_W = 64;
  const TILE_H = 32;
  let offsetX = window.innerWidth / 2;
  let offsetY = 200;

  function setOffset(x, y) {
    offsetX = x;
    offsetY = y;
  }

  function getOffset() {
    return { x: offsetX, y: offsetY };
  }

  function isoProject(gx, gy, gz = 0) {
    return {
      x: (gx - gy) * (TILE_W / 2) + offsetX,
      y: (gx + gy) * (TILE_H / 2) + offsetY - (gz * TILE_H),
    };
  }

  function isoUnproject(sx, sy, gz = 0) {
    const dx = sx - offsetX;
    const dy = sy - offsetY + (gz * TILE_H);
    return {
      x: (dy / (TILE_H / 2) + dx / (TILE_W / 2)) / 2,
      y: (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2,
    };
  }

  return {
    TILE_W,
    TILE_H,
    getOffset,
    setOffset,
    isoProject,
    isoUnproject,
  };
})();
