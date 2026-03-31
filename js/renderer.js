// ============================================================
// SimLife — Canvas Renderer (2.5D Isometric, Depth Sorted)
// ============================================================
window.Game = window.Game || {};

Game.Renderer = (function() {
  let canvas, ctx;
  let cellSize = 64;
  let particles = [];
  let animFrame = 0;
  let clouds = [];
  let flowers = [];
  
  // Camera Panning
  let cameraX = 0;
  let cameraY = 0;

  // Character interpolation
  let charRenderX = 0;
  let charRenderY = 0;
  let isWalking = false;

  // Pseudo-isometric multipliers
  function getIsoW() { return cellSize * 1.5; }
  function getIsoH() { return getIsoW() * 0.5; }

  function toScreen(gx, gy) {
    const w = canvas ? canvas.width : 800;
    const h = canvas ? canvas.height : 600;
    const sx = w / 2 + (gx - gy) * (getIsoW() / 2) + cameraX;
    const sy = h * 0.25 + (gx + gy) * (getIsoH() / 2) + cameraY;
    return { x: sx, y: sy };
  }

  function toGrid(sx, sy) {
    if (!canvas) return { x: 0, y: 0 };
    const rx = sx - canvas.width / 2 - cameraX;
    const ry = sy - canvas.height * 0.25 - cameraY;
    const vx = rx / (getIsoW() / 2);
    const vy = ry / (getIsoH() / 2);
    return {
      x: (vy + vx) / 2,
      y: (vy - vx) / 2
    };
  }

  function generateDecorations() {
    clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({ xPct: Math.random(), yPct: 0.01 + Math.random() * 0.07, wPct: 0.05 + Math.random() * 0.06, speed: 0.15 + Math.random() * 0.2 });
    }
    flowers = [];
    for (let i = 0; i < 20; i++) {
      const edge = Math.floor(Math.random() * 4);
      let fxPct, fyPct;
      if (edge === 0) { fxPct = Math.random(); fyPct = 0.81 + Math.random() * 0.06; }
      else if (edge === 1) { fxPct = Math.random(); fyPct = 0.11 + Math.random() * 0.05; }
      else if (edge === 2) { fxPct = Math.random() * 0.06; fyPct = 0.16 + Math.random() * 0.63; }
      else { fxPct = 0.91 + Math.random() * 0.06; fyPct = 0.16 + Math.random() * 0.63; }
      flowers.push({ xPct: fxPct, yPct: fyPct, color: ['#FF6B6B','#FFD93D','#A78BFA','#F472B6','#4ECDC4','#FF9800'][Math.floor(Math.random()*6)], size: 2 + Math.random() * 3 });
    }
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    // Enable Pixel Art scaling
    ctx.imageSmoothingEnabled = false;
    resize();
    generateDecorations();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const container = canvas.parentElement;
    const size = Math.min(container.clientWidth, container.clientHeight, 800);
    canvas.width = size;
    canvas.height = size;
    const house = Game.State.get().house;
    cellSize = Math.floor(size / Math.max(house.lotWidth, house.lotHeight) * 0.9);
  }

  function setCameraOffset(dx, dy) {
    cameraX += dx;
    cameraY += dy;
    // Clamp camera to reasonable bounds
    const maxPan = cellSize * 4;
    cameraX = Math.max(-maxPan, Math.min(maxPan, cameraX));
    cameraY = Math.max(-maxPan, Math.min(maxPan, cameraY));
  }

  // --- Main Render Loop ---
  function render(timestamp) {
    if (!ctx) return;
    animFrame++;
    const state = Game.State.get();
    const house = state.house;
    const time = state.time;

    // Initialize/Update Character Interpolation
    if (charRenderX === 0 && charRenderY === 0) {
      charRenderX = state.character.position.x;
      charRenderY = state.character.position.y;
    } else {
      const dx = state.character.position.x - charRenderX;
      const dy = state.character.position.y - charRenderY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      isWalking = dist > 0.05;
      charRenderX += dx * 0.15;
      charRenderY += dy * 0.15;
    }

    // Pixel Art Grid Snap for camera
    cameraX = Math.round(cameraX);
    cameraY = Math.round(cameraY);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background Environment
    drawSky(time);
    drawClouds(timestamp);
    drawGrass();
    drawTrees();
    drawFlowers();
    drawFence();

    // Floor Level
    drawRoomFloors(house);
    drawGrid(house);
    drawBuildGhost(state.ui);

    // Dynamic Floor Shadows Pass (isometric diamond shadows)
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const furn of house.furniture) {
      const fc = Game.Config.FURNITURE[furn.type];
      if (!fc) continue;
      // Shadow matches the furniture's grid footprint as an iso diamond
      const tl = toScreen(furn.x, furn.y);
      const tr = toScreen(furn.x + fc.w, furn.y);
      const br = toScreen(furn.x + fc.w, furn.y + fc.h);
      const bl = toScreen(furn.x, furn.y + fc.h);
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fill();
    }
    // Character shadow
    const cBase = toScreen(charRenderX + 0.5, charRenderY + 0.5);
    const shdSize = getIsoW() * 0.25;
    ctx.beginPath();
    ctx.moveTo(cBase.x, cBase.y - shdSize * 0.5);
    ctx.lineTo(cBase.x + shdSize, cBase.y);
    ctx.lineTo(cBase.x, cBase.y + shdSize * 0.5);
    ctx.lineTo(cBase.x - shdSize, cBase.y);
    ctx.closePath();
    ctx.fill();


    // Depth Sorting for 2.5D (RenderQueue)
    let renderQueue = [];

    // Walls
    for (const room of house.rooms) {
      renderQueue.push({ type: 'wall_back', room: room, depth: room.x + room.y - 0.1 });
    }

    // Furniture
    for (const furn of house.furniture) {
      const fc = Game.Config.FURNITURE[furn.type];
      if (!fc) continue;
      // Anchor depth to the front-most part of the furniture
      const depth = furn.x + fc.w + furn.y + fc.h - 1;
      renderQueue.push({ type: 'furniture', obj: furn, config: fc, depth: depth });
    }

    // Character
    renderQueue.push({
      type: 'character',
      obj: state.character,
      depth: charRenderX + charRenderY
    });

    // NPC Walkers
    const walkers = state.npcWalkers || [];
    for (const npc of walkers) {
      if (!npc.active) continue;
      renderQueue.push({
        type: 'npc_walker',
        obj: npc,
        depth: npc.position.x + npc.position.y
      });
    }

    renderQueue.sort((a,b) => a.depth - b.depth);

    for (const item of renderQueue) {
      if (item.type === 'wall_back') drawRoomWalls(item.room);
      else if (item.type === 'furniture') {
        drawFurnitureBillboard(item.obj, item.config);
        // Broken overlay
        if (Game.Character.isFurnitureBroken && Game.Character.isFurnitureBroken(item.obj.id)) {
          drawBrokenOverlay(item.obj, item.config);
        }
        // Sell mode highlight
        if (state.ui.mode === 'sell') {
          const base = toScreen(item.obj.x + item.config.w/2, item.obj.y + item.config.h/2);
          const bw = Math.max(item.config.w, item.config.h) * getIsoW() * 0.7;
          ctx.fillStyle = 'rgba(244, 67, 54, 0.15)';
          ctx.fillRect(base.x - bw/2, base.y - bw, bw, bw);
        }
      }
      else if (item.type === 'character') drawCharacter(item.obj, timestamp);
      else if (item.type === 'npc_walker') drawNPCWalker(item.obj, timestamp);
    }

    drawParticles(timestamp);
    drawWorkOverlay(state.character, state.time, timestamp);

    // Night Time overlay (HD-2D Color Grading)
    if (time.hour >= 20 || time.hour < 6) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#4A4969'; // Softer, cinematic deep blue/purple instead of pitch black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    } else if (time.hour >= 18) {
      const alpha = Math.min(1, (time.hour - 18) / 2);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(255, 140, 80, ${alpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    } else if (time.hour >= 6 && time.hour < 8) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#ffdfba';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Dynamic Point Lights (Additive Blending)
    ctx.globalCompositeOperation = 'hard-light';
    for (const item of renderQueue) {
      if (item.type === 'furniture') {
        // Lights from lamps, electronics, fire
        if (item.obj.type.includes('lamp') || item.obj.type.includes('fire') || item.obj.type.includes('tv')) {
          const isOn = !item.obj.type.includes('tv') || (animFrame % 60 < 50);
          if (time.hour >= 18 || time.hour < 7) {
             const base = toScreen(item.obj.x + item.config.w/2, item.obj.y + item.config.h/2);
             const r = 120 + Math.sin(timestamp * 0.005) * 10;
             const grad = ctx.createRadialGradient(base.x, base.y - 40, 0, base.x, base.y - 40, r);
             grad.addColorStop(0, item.obj.type.includes('tv') ? 'rgba(100,200,255,0.7)' : 'rgba(255,200,100,0.8)');
             grad.addColorStop(1, 'rgba(0,0,0,0)');
             ctx.fillStyle = grad;
             ctx.fillRect(base.x - r, base.y - 40 - r, r*2, r*2);
          }
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- Environment ----
  function drawSky(time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.25);
    if (time.hour >= 6 && time.hour < 12) {
      gradient.addColorStop(0, '#87CEEB'); gradient.addColorStop(1, '#E0F7FA');
    } else if (time.hour >= 12 && time.hour < 17) {
      gradient.addColorStop(0, '#64B5F6'); gradient.addColorStop(1, '#BBDEFB');
    } else if (time.hour >= 17 && time.hour < 20) {
      gradient.addColorStop(0, '#FF8A65'); gradient.addColorStop(1, '#FFE0B2');
    } else {
      gradient.addColorStop(0, '#1A237E'); gradient.addColorStop(1, '#283593');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height * 0.2);
  }

  function drawGrass() {
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, canvas.height * 0.15, canvas.width, canvas.height * 0.85);

    // Dithered/Blocky Grass Texture (Subtle)
    ctx.fillStyle = '#388E3C';
    for (let i = 0; i < canvas.width; i += 16) {
      for (let j = canvas.height * 0.15; j < canvas.height; j += 16) {
        if ((i + j) % 32 === 0) {
          ctx.fillRect(i, j, 4, 4);
        }
      }
    }

    // Dirt Path
    ctx.fillStyle = '#8D6E63';
    const pathY = canvas.height * 0.95 - Math.max(cameraY, 0)*0.2;
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(20 + i * 75 - cameraX*0.1, pathY - 4, 32, 12);
    }
  }

  function drawClouds(timestamp) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const c of clouds) {
      const x = c.xPct * canvas.width - cameraX * 0.05;
      const w = c.wPct * canvas.width;
      c.xPct += c.speed / canvas.width;
      if (c.xPct > 1.1) c.xPct = -0.1;
      const y = c.yPct * canvas.height;
      // Pixel Art Cloud Shape
      ctx.fillRect(x, y, w * 0.6, 12);
      ctx.fillRect(x + w * 0.1, y - 8, w * 0.4, 8);
      ctx.fillRect(x + w * 0.2, y - 16, w * 0.2, 8);
    }
  }

  function drawTrees() {
    const treePositions = [
      { xPct: 0.03, yPct: 0.18 }, { xPct: 0.92, yPct: 0.22 },
      { xPct: 0.07, yPct: 0.6 },  { xPct: 0.95, yPct: 0.55 },
      { xPct: 0.02, yPct: 0.4 },  { xPct: 0.97, yPct: 0.75 },
    ];
    for (const t of treePositions) {
      const tx = t.xPct * canvas.width;
      const ty = t.yPct * canvas.height;
      // Trunk
      ctx.fillStyle = '#5D4037';
      ctx.fillRect(tx - 4, ty, 8, 30);
      // Foliage layers (Blocky)
      ctx.fillStyle = '#2E7D32';
      ctx.fillRect(tx - 16, ty - 8, 32, 16);
      ctx.fillStyle = '#388E3C';
      ctx.fillRect(tx - 12, ty - 20, 24, 12);
      ctx.fillStyle = '#43A047';
      ctx.fillRect(tx - 8, ty - 28, 16, 8);
    }
  }

  function drawFlowers() {
    for (const f of flowers) {
      const fx = f.xPct * canvas.width;
      const fy = f.yPct * canvas.height;
      ctx.fillStyle = f.color;
      // Blocky flower petals
      ctx.fillRect(fx - f.size, fy - f.size, f.size * 2, f.size * 2);
      // Stem
      ctx.fillStyle = '#388E3C';
      ctx.fillRect(fx - 1, fy + f.size, 2, 5);
    }
  }

  function drawFence() {
    const house = Game.State.get().house;
    const lotW = house.lotWidth;
    const lotH = house.lotHeight;
    ctx.strokeStyle = '#8D6E63';
    ctx.lineWidth = 2;

    // Top-left to top-right edge
    const corners = [
      toScreen(0, 0), toScreen(lotW, 0),
      toScreen(lotW, lotH), toScreen(0, lotH)
    ];

    // Draw fence posts along the lot boundary
    const fenceH = 8;
    for (let i = 0; i < 4; i++) {
      const p1 = corners[i];
      const p2 = corners[(i + 1) % 4];
      ctx.strokeStyle = 'rgba(141, 110, 99, 0.4)';
      ctx.lineWidth = 1.5;
      // Rail line
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y - fenceH);
      ctx.lineTo(p2.x, p2.y - fenceH);
      ctx.stroke();
      // Posts
      const posts = 5;
      for (let j = 0; j <= posts; j++) {
        const t = j / posts;
        const px = p1.x + (p2.x - p1.x) * t;
        const py = p1.y + (p2.y - p1.y) * t;
        ctx.strokeStyle = 'rgba(141, 110, 99, 0.5)';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py - fenceH - 4);
        ctx.stroke();
      }
    }
  }

  function drawWorkOverlay(char, time, timestamp) {
    if (!Game.Economy.getCareer()) return;
    const career = Game.Economy.getCareer();
    const careerCfg = Game.Config.CAREERS[career.type];
    const levelCfg = careerCfg.levels[career.level];
    if (time.hour < levelCfg.scheduleStart || time.hour >= levelCfg.scheduleEnd) return;
    if (char.currentActivity && char.currentActivity.type === 'sleep') return;
    const bx = canvas.width / 2, by = canvas.height * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(bx - 60, by - 20, 120, 40, 12);
    ctx.fillStyle = '#FFD93D';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${careerCfg.icon} At Work`, bx, by);
  }

  // --- Isometric Poly Helper ---
  function drawIsoPoly(points, fillStyle, strokeStyle) {
    ctx.beginPath();
    points.forEach((p, i) => {
      const sp = toScreen(p.x, p.y);
      if (i === 0) ctx.moveTo(sp.x, sp.y);
      else ctx.lineTo(sp.x, sp.y);
    });
    ctx.closePath();
    if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
    if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.stroke(); }
  }

  // ---- Grid & Rooms ----
  function drawGrid(house) {
    const mode = Game.State.get().ui.mode;
    if (mode !== 'build') return;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= house.lotWidth; x++) {
      drawIsoPoly([{x: x, y: 0}, {x: x, y: house.lotHeight}], null, ctx.strokeStyle);
    }
    for (let y = 0; y <= house.lotHeight; y++) {
      drawIsoPoly([{x: 0, y: y}, {x: house.lotWidth, y: y}], null, ctx.strokeStyle);
    }
  }

  function drawRoomFloors(house) {
    const cfg = Game.Config;
    for (const room of house.rooms) {
      const rc = cfg.ROOMS[room.type];
      if (!rc) continue;
      
      const points = [
        { x: room.x, y: room.y },
        { x: room.x + room.w, y: room.y },
        { x: room.x + room.w, y: room.y + room.h },
        { x: room.x, y: room.y + room.h }
      ];
      drawIsoPoly(points, rc.floorColor, adjustColor(rc.floorColor, -30));

      // Light checkerboard pattern for floors
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      for (let gx = room.x; gx <= room.x + room.w; gx++) {
        drawIsoPoly([{x: gx, y: room.y}, {x: gx, y: room.y + room.h}], null, ctx.strokeStyle);
      }
      for (let gy = room.y; gy <= room.y + room.h; gy++) {
        drawIsoPoly([{x: room.x, y: gy}, {x: room.x + room.w, y: gy}], null, ctx.strokeStyle);
      }

      // Room Type Label
      const center = toScreen(room.x + room.w/2, room.y + room.h/2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.font = `bold ${Math.max(10, Math.round(getIsoW() * 0.15))}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(rc.icon + ' ' + rc.label, center.x, center.y + 14);
    }
  }

  function drawRoomWalls(room) {
    const rc = Game.Config.ROOMS[room.type];
    if (!rc) return;
    const baseColor = rc.wallColor;
    const wallHeight = getIsoH() * 1.8;

    // LEFT wall (aligned with Y-axis at x=0 bounds)
    const p1 = toScreen(room.x, room.y);
    const p2 = toScreen(room.x, room.y + room.h);
    
    // Gradient shading for LEFT wall
    let gradLeft = ctx.createLinearGradient(0, p1.y, 0, p1.y - wallHeight);
    gradLeft.addColorStop(0, adjustColor(baseColor, -40)); // Darker at base
    gradLeft.addColorStop(1, adjustColor(baseColor, -10)); // Lighter at top

    ctx.fillStyle = gradLeft;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p2.x, p2.y - wallHeight);
    ctx.lineTo(p1.x, p1.y - wallHeight);
    ctx.closePath();
    ctx.fill();
    
    // Top Edge Bevel
    ctx.strokeStyle = adjustColor(baseColor, 40);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y - wallHeight); ctx.lineTo(p2.x, p2.y - wallHeight); ctx.stroke();

    // RIGHT wall (aligned with X-axis at y=0 bounds)
    const p3 = toScreen(room.x + room.w, room.y);
    
    let gradRight = ctx.createLinearGradient(0, p1.y, 0, p1.y - wallHeight);
    gradRight.addColorStop(0, adjustColor(baseColor, -20)); // Base shadow
    gradRight.addColorStop(1, adjustColor(baseColor, 20));  // Highlight top

    ctx.fillStyle = gradRight;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p3.x, p3.y - wallHeight);
    ctx.lineTo(p1.x, p1.y - wallHeight);
    ctx.closePath();
    ctx.fill();
    
    // Top Edge Bevel
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y - wallHeight); ctx.lineTo(p3.x, p3.y - wallHeight); ctx.stroke();
  }

  // ---- Build Ghost ----
  function drawBuildGhost(ui) {
    if (ui.mode !== 'build' || !ui.buildGhost) return;
    const ghost = ui.buildGhost;
    const canPlace = Game.House.isAreaFree(ghost.x, ghost.y, ghost.w, ghost.h);
    const points = [
      { x: ghost.x, y: ghost.y },
      { x: ghost.x + ghost.w, y: ghost.y },
      { x: ghost.x + ghost.w, y: ghost.y + ghost.h },
      { x: ghost.x, y: ghost.y + ghost.h }
    ];
    
    const color = canPlace ? 'rgba(76, 175, 80, 0.4)' : 'rgba(244, 67, 54, 0.4)';
    const stroke = canPlace ? '#4CAF50' : '#F44336';
    ctx.lineWidth = 2;
    drawIsoPoly(points, color, stroke);
  }

  // ---- Furniture Isometric Billboard ----
  // Helper for drawing boxy HD-2D prisms
  function drawIsoCube(ctx, dx, dy, w, h, d, cTop, cFront, cSide) {
    // Front face
    ctx.fillStyle = cFront;
    ctx.fillRect(dx, dy, w, h);
    // Side face (right)
    ctx.fillStyle = cSide;
    ctx.beginPath();
    ctx.moveTo(dx + w, dy);
    ctx.lineTo(dx + w + d, dy - d/2);
    ctx.lineTo(dx + w + d, dy + h - d/2);
    ctx.lineTo(dx + w, dy + h);
    ctx.fill();
    // Top face
    ctx.fillStyle = cTop;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx + d, dy - d/2);
    ctx.lineTo(dx + w + d, dy - d/2);
    ctx.lineTo(dx + w, dy);
    ctx.fill();
  }

  function drawFurnitureBillboard(furn, fc) {
    const cGx = furn.x + fc.w / 2;
    const cGy = furn.y + fc.h / 2;
    const base = toScreen(cGx, cGy);

    // Properly derive pixel dimensions from the tile's isometric footprint
    // Get the actual screen-space footprint of this item's grid cells
    const tileTL = toScreen(furn.x, furn.y);
    const tileTR = toScreen(furn.x + fc.w, furn.y);
    const tileBR = toScreen(furn.x + fc.w, furn.y + fc.h);
    const tileBL = toScreen(furn.x, furn.y + fc.h);
    // Width of the isometric diamond in screen px
    const footW = tileTR.x - tileBL.x;  // full diamond width
    const footH = tileBR.y - tileTL.y;   // full diamond height
    // Scale factor so voxel drawing roughly fills the tile's diamond
    const bw = footW * 0.45;   // front-face width
    const bh = footH * 0.55;   // unit height for 1-tile-tall object
    const dd = footW * 0.18;   // depth offset for the iso cube side/top

    // ---- Per-type voxel drawing ----
    if (furn.type.includes('bed')) {
      // Frame sits on floor
      drawIsoCube(ctx, base.x - bw*0.5, base.y - bh*0.25, bw, bh*0.25, dd, '#8D6E63', '#6D4C41', '#4E342E');
      // Mattress
      drawIsoCube(ctx, base.x - bw*0.48, base.y - bh*0.42, bw*0.96, bh*0.17, dd*0.9, '#F5F5F5', '#E8E0D8', '#BCAAA4');
      // Blanket (lower half)
      drawIsoCube(ctx, base.x - bw*0.48, base.y - bh*0.42, bw*0.96, bh*0.17, dd*0.5, '#9FA8DA', '#7986CB', '#5C6BC0');
      // Pillow
      drawIsoCube(ctx, base.x + bw*0.15, base.y - bh*0.52, bw*0.28, bh*0.1, dd*0.3, '#FAFAFA', '#F0EDE8', '#D7CFC5');
    } else if (furn.type.includes('fridge')) {
      drawIsoCube(ctx, base.x - bw*0.3, base.y - bh*1.4, bw*0.6, bh*1.4, dd*0.7, '#ECEFF1', '#CFD8DC', '#90A4AE');
      ctx.fillStyle = '#78909C'; ctx.fillRect(base.x - bw*0.22, base.y - bh*0.65, bw*0.44, 3);
      // Handle
      ctx.fillStyle = '#546E7A'; ctx.fillRect(base.x + bw*0.15, base.y - bh*1.1, 3, bh*0.3);
    } else if (furn.type.includes('tv') || furn.type.includes('stereo') || furn.type.includes('printer')) {
      drawIsoCube(ctx, base.x - bw*0.4, base.y - bh*0.55, bw*0.8, bh*0.55, dd*0.2, '#424242', '#303030', '#1A1A1A');
      if (furn.type.includes('tv') && animFrame % 60 < 50) {
        ctx.fillStyle = '#64B5F6';
        ctx.fillRect(base.x - bw*0.35, base.y - bh*0.50, bw*0.7, bh*0.4);
      }
    } else if (furn.type.includes('sofa') || furn.type.includes('recliner')) {
      // Seat cushion
      drawIsoCube(ctx, base.x - bw*0.48, base.y - bh*0.28, bw*0.96, bh*0.28, dd*0.8, '#7986CB', '#5C6BC0', '#3949AB');
      // Back rest
      drawIsoCube(ctx, base.x - bw*0.48, base.y - bh*0.6, bw*0.96, bh*0.6, dd*0.25, '#5C6BC0', '#3949AB', '#283593');
      // Armrests
      drawIsoCube(ctx, base.x - bw*0.5, base.y - bh*0.38, bw*0.12, bh*0.38, dd*0.7, '#5C6BC0', '#3949AB', '#283593');
      drawIsoCube(ctx, base.x + bw*0.38, base.y - bh*0.38, bw*0.12, bh*0.38, dd*0.7, '#5C6BC0', '#3949AB', '#283593');
    } else if (furn.type.includes('desk') || furn.type.includes('table') || furn.type.includes('workbench')) {
      // Tabletop
      drawIsoCube(ctx, base.x - bw*0.48, base.y - bh*0.42, bw*0.96, bh*0.06, dd*0.9, '#A1887F', '#8D6E63', '#5D4037');
      // Legs
      ctx.fillStyle = '#4E342E';
      ctx.fillRect(base.x - bw*0.44, base.y - bh*0.36, 3, bh*0.36);
      ctx.fillRect(base.x + bw*0.40, base.y - bh*0.36, 3, bh*0.36);
    } else if (furn.type.includes('stove') || furn.type.includes('microwave') || furn.type.includes('bookshelf')) {
      drawIsoCube(ctx, base.x - bw*0.4, base.y - bh*0.7, bw*0.8, bh*0.7, dd*0.6, '#78909C', '#607D8B', '#455A64');
      if (furn.type.includes('bookshelf')) {
        ctx.fillStyle = '#FFCC80'; ctx.fillRect(base.x - bw*0.3, base.y - bh*0.6, bw*0.18, bh*0.15);
        ctx.fillStyle = '#EF5350'; ctx.fillRect(base.x - bw*0.08, base.y - bh*0.6, bw*0.15, bh*0.15);
        ctx.fillStyle = '#81C784'; ctx.fillRect(base.x + bw*0.1, base.y - bh*0.35, bw*0.18, bh*0.15);
        ctx.fillStyle = '#64B5F6'; ctx.fillRect(base.x - bw*0.3, base.y - bh*0.35, bw*0.15, bh*0.15);
      } else {
        ctx.fillStyle = '#263238'; ctx.fillRect(base.x - bw*0.3, base.y - bh*0.35, bw*0.55, bh*0.2);
        // Burners for stove
        if (furn.type.includes('stove')) {
          ctx.fillStyle = '#B71C1C'; ctx.fillRect(base.x - bw*0.2, base.y - bh*0.68, 5, 5);
          ctx.fillStyle = '#B71C1C'; ctx.fillRect(base.x + bw*0.1, base.y - bh*0.68, 5, 5);
        }
      }
    } else if (furn.type.includes('shower') || furn.type.includes('tub')) {
      drawIsoCube(ctx, base.x - bw*0.4, base.y - bh*1.0, bw*0.8, bh*1.0, dd*0.8, '#E1F5FE', '#B3E5FC', '#81D4FA');
      // Shower head
      if (furn.type.includes('shower')) {
        ctx.fillStyle = '#90A4AE';
        ctx.fillRect(base.x + bw*0.1, base.y - bh*1.2, 3, bh*0.3);
        ctx.fillRect(base.x - bw*0.05, base.y - bh*1.2, bw*0.2, 4);
      }
    } else if (furn.type.includes('plant') || furn.type.includes('tree')) {
      // Pot
      drawIsoCube(ctx, base.x - bw*0.2, base.y - bh*0.22, bw*0.4, bh*0.22, dd*0.4, '#A1887F', '#8D6E63', '#5D4037');
      // Foliage layers (blocky)
      ctx.fillStyle = '#388E3C';
      ctx.fillRect(base.x - bw*0.25, base.y - bh*0.55, bw*0.5, bh*0.25);
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(base.x - bw*0.18, base.y - bh*0.75, bw*0.36, bh*0.2);
      ctx.fillStyle = '#66BB6A';
      ctx.fillRect(base.x - bw*0.1, base.y - bh*0.88, bw*0.2, bh*0.13);
    } else if (furn.type.includes('toilet')) {
      drawIsoCube(ctx, base.x - bw*0.25, base.y - bh*0.35, bw*0.5, bh*0.35, dd*0.5, '#FAFAFA', '#EEEEEE', '#CFD8DC');
      // Tank
      drawIsoCube(ctx, base.x - bw*0.2, base.y - bh*0.6, bw*0.4, bh*0.35, dd*0.25, '#F5F5F5', '#E0E0E0', '#BDBDBD');
    } else if (furn.type.includes('pool')) {
      // Pool table
      drawIsoCube(ctx, base.x - bw*0.48, base.y - bh*0.38, bw*0.96, bh*0.12, dd*0.9, '#2E7D32', '#1B5E20', '#0D3810');
      // Legs
      ctx.fillStyle = '#3E2723';
      ctx.fillRect(base.x - bw*0.44, base.y - bh*0.26, 3, bh*0.26);
      ctx.fillRect(base.x + bw*0.40, base.y - bh*0.26, 3, bh*0.26);
    } else if (furn.type.includes('fireplace')) {
      drawIsoCube(ctx, base.x - bw*0.45, base.y - bh*0.9, bw*0.9, bh*0.9, dd*0.3, '#795548', '#5D4037', '#3E2723');
      // Fire opening
      ctx.fillStyle = '#1A1A1A';
      ctx.fillRect(base.x - bw*0.25, base.y - bh*0.45, bw*0.5, bh*0.4);
      // Fire glow
      if (animFrame % 30 < 20) {
        ctx.fillStyle = '#FF6D00'; ctx.fillRect(base.x - bw*0.15, base.y - bh*0.35, bw*0.12, bh*0.2);
        ctx.fillStyle = '#FFD600'; ctx.fillRect(base.x + bw*0.05, base.y - bh*0.3, bw*0.1, bh*0.15);
      }
    } else if (furn.type.includes('aquarium')) {
      drawIsoCube(ctx, base.x - bw*0.45, base.y - bh*0.5, bw*0.9, bh*0.5, dd*0.5, '#E3F2FD', '#BBDEFB', '#90CAF9');
      // Fish
      ctx.fillStyle = '#FF6D00';
      const fishX = base.x - bw*0.2 + Math.sin(animFrame * 0.05) * bw*0.15;
      ctx.fillRect(fishX, base.y - bh*0.3, 5, 3);
      ctx.fillStyle = '#F44336';
      ctx.fillRect(fishX + 8 + Math.sin(animFrame * 0.07) * bw*0.1, base.y - bh*0.2, 4, 3);
    } else {
      // Generic Fallback HD-2D Voxel
      drawIsoCube(ctx, base.x - bw*0.4, base.y - bh*0.5, bw*0.8, bh*0.5, dd*0.6, '#BCAAA4', '#A1887F', '#8D6E63');
    }

    // Emoji label (small, bottom corner)
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const lSize = Math.max(10, bw * 0.18);
    ctx.fillRect(base.x - lSize*0.7, base.y - lSize*1.2, lSize*1.4, lSize*1.4);
    ctx.fillStyle = '#FFF';
    ctx.font = `bold ${Math.round(lSize)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fc.icon, base.x, base.y - lSize*0.5);
  }

  // ---- Character + Plumbob (Pixel Art Blocky Style) ----
  function drawCharacter(char, timestamp) {
    // anchor to bottom center on grid mapped to screen using interpolated coordinates
    const base = toScreen(charRenderX + 0.5, charRenderY + 0.5);
    // Derive character size from the tile height so they fit~ 1 tile
    const tileH = getIsoH(); // height of one iso tile in px
    const s = tileH * 0.38;  // base unit (~18px at default)
    const dd = s * 0.35;     // iso depth offset
    // Walk bounce
    const bounce = isWalking ? Math.abs(Math.sin(timestamp * 0.012) * s * 0.35) : 0;
    const moodInfo = Game.Character.getMoodInfo();

    const x = base.x;

    // Body segments stacked from floor up
    const legH  = s * 0.7;
    const torsoH = s * 0.65;
    const headH  = s * 0.6;
    const hairH  = s * 0.2;
    const bodyW  = s * 0.55;

    // Legs (alternating bounce for walk cycle)
    const legW = bodyW * 0.42;
    const legGap = bodyW * 0.16;
    drawIsoCube(ctx, x - legW - legGap/2, base.y - legH - bounce,     legW, legH, dd*0.6, '#5C6BC0', '#3949AB', '#283593');
    drawIsoCube(ctx, x + legGap/2,        base.y - legH + (isWalking ? -bounce*0.6 : 0), legW, legH, dd*0.6, '#5C6BC0', '#3949AB', '#283593');

    // Torso
    const shirtColor = char.name.includes('Morgan') ? '#607D8B' : (char.name.includes('Taylor') ? '#FF5722' : '#1E88E5');
    drawIsoCube(ctx, x - bodyW/2, base.y - legH - torsoH, bodyW, torsoH, dd, adjustColor(shirtColor, 20), shirtColor, adjustColor(shirtColor, -30));

    // Head
    const skinColor = char.name.includes('Sam') ? '#CF946A' : '#FFB74D';
    const headW = bodyW * 0.85;
    drawIsoCube(ctx, x - headW/2, base.y - legH - torsoH - headH, headW, headH, dd*0.8, adjustColor(skinColor, 20), skinColor, adjustColor(skinColor, -30));

    // Hair
    const hairColor = char.name.includes('Morgan') ? '#9E9E9E' : (char.name.includes('Riley') ? '#7E57C2' : '#4E342E');
    drawIsoCube(ctx, x - headW*0.6, base.y - legH - torsoH - headH - hairH, headW*1.2, hairH, dd*0.9, adjustColor(hairColor, 20), hairColor, adjustColor(hairColor, -30));
    // Side hair tufts
    ctx.fillStyle = adjustColor(hairColor, -10);
    ctx.fillRect(x - headW*0.6, base.y - legH - torsoH - headH + headH*0.15, headW*0.2, headH*0.35);
    ctx.fillRect(x + headW*0.4, base.y - legH - torsoH - headH + headH*0.15, headW*0.2, headH*0.35);

    // Eyes
    const eyeY = base.y - legH - torsoH - headH + headH*0.35;
    const eyeSpread = headW * 0.15;
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(x - eyeSpread - 3, eyeY, 4, 3);
    ctx.fillRect(x + eyeSpread - 1, eyeY, 4, 3);
    ctx.fillStyle = '#212121';
    ctx.fillRect(x - eyeSpread - 2, eyeY, 2, 3);
    ctx.fillRect(x + eyeSpread, eyeY, 2, 3);

    // Mouth (Blocky)
    ctx.fillStyle = '#5D4037';
    const mouthY = eyeY + headH * 0.3;
    if (moodInfo.value >= 70) {
      ctx.fillRect(x - 3, mouthY, 6, 2);
      ctx.fillRect(x - 4, mouthY - 1, 2, 2);
      ctx.fillRect(x + 2, mouthY - 1, 2, 2);
    } else if (moodInfo.value >= 40) {
      ctx.fillRect(x - 3, mouthY, 6, 2);
    } else {
      ctx.fillRect(x - 3, mouthY, 6, 2);
      ctx.fillRect(x - 4, mouthY + 2, 2, 2);
      ctx.fillRect(x + 2, mouthY + 2, 2, 2);
    }

    // Plumbob
    const totalH = legH + torsoH + headH + hairH;
    drawPlumbob(x, base.y - totalH - s*0.5, moodInfo.value, timestamp, s/24);

    // Name label
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = `bold ${Math.max(9, Math.round(s * 0.42))}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(char.name, x, base.y + 6);

    // Thoughts / Activities (Blocky)
    if (char.currentActivity) {
      const actCfg = Game.Config.ACTIVITIES[char.currentActivity.type];
      if (actCfg) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        const bx = x + bodyW + 8;
        const by = base.y - totalH - s * 0.6;
        // Blocky Bubble Main
        ctx.fillRect(bx, by, 28, 24);
        // Blocky Tail
        ctx.fillRect(bx - 3, by + 17, 3, 3);
        ctx.fillRect(bx - 6, by + 20, 3, 3);
        
        ctx.fillStyle = '#333';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(actCfg.icon, bx + 14, by + 10);

        // Blocky Progress Bar (underneath icon)
        ctx.fillStyle = '#1B5E20';
        ctx.fillRect(bx + 3, by + 20, 22, 3);
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(bx + 3, by + 20, 22 * char.activityProgress, 3);
      }
    }

    if (!char.currentActivity && Game.Autonomy && Game.Autonomy.getThought()) {
      const thought = Game.Autonomy.getThought();
      const pulse = 0.85 + Math.sin(timestamp * 0.004) * 0.15;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(255,255,240,0.92)';
      const bx = x + bodyW + 6;
      const by = base.y - totalH - s * 0.8;
      
      // Blocky Bubble Main
      ctx.fillRect(bx, by, 38, 22);
      // Blocky Tail
      ctx.fillRect(bx - 3, by + 16, 3, 3);
      ctx.fillRect(bx - 6, by + 19, 3, 3);
      
      ctx.fillStyle = '#333';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(thought.needIcon + '→' + thought.activityIcon, bx + 19, by + 10);
      ctx.globalAlpha = 1;
    }
  }

  function drawPlumbob(x, y, moodValue, timestamp, scale) {
    const size = 12 * scale;
    const rotation = timestamp * 0.002;
    const hover = Math.sin(timestamp * 0.004) * (4 * scale);
    const py = y + hover;

    let color;
    if (moodValue >= 70) color = '#4CAF50'; 
    else if (moodValue >= 50) color = lerpColor('#FFEB3B', '#4CAF50', (moodValue - 50) / 20);
    else if (moodValue >= 30) color = lerpColor('#FF9800', '#FFEB3B', (moodValue - 30) / 20);
    else color = lerpColor('#F44336', '#FF9800', moodValue / 30);

    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.save();
    ctx.translate(x, py);
    ctx.rotate(rotation);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.7, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.35)'; // Shine
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, 0);
    ctx.lineTo(0, -size * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  // ---- Broken Furniture Overlay ----
  function drawBrokenOverlay(furn, fc) {
    const cGx = furn.x + fc.w / 2;
    const cGy = furn.y + fc.h / 2;
    const base = toScreen(cGx, cGy);
    const bw = Math.max(fc.w, fc.h) * getIsoW() * 0.7;

    // Red tint overlay
    ctx.fillStyle = 'rgba(244, 67, 54, 0.25)';
    ctx.fillRect(base.x - bw/2, base.y - bw, bw, bw);

    // Warning icon
    ctx.fillStyle = '#FF5722';
    ctx.font = `bold ${Math.max(16, bw * 0.4)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠️', base.x, base.y - bw * 0.5);

    // Crack lines
    ctx.strokeStyle = '#4E342E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(base.x - bw*0.2, base.y - bw*0.7);
    ctx.lineTo(base.x + bw*0.1, base.y - bw*0.4);
    ctx.lineTo(base.x - bw*0.1, base.y - bw*0.2);
    ctx.stroke();
  }

  // ---- NPC Walker Drawing ----
  function drawNPCWalker(npc, timestamp) {
    const npcCfg = Game.Config.NPCS.find(n => n.id === npc.configId);
    if (!npcCfg) return;

    const base = toScreen(npc.position.x, npc.position.y);
    const scale = getIsoW() / 84;
    const r = 18 * scale;
    const bounce = Math.abs(Math.sin(timestamp * 0.008 + npc.phase) * (10 * scale));

    const x = base.x;
    const lH = r * 0.7;
    const tH = r * 0.7;
    const hH = r * 0.8;
    const shirtColor = npcCfg.color || '#78909C';

    // Legs
    drawIsoCube(ctx, x - r*0.35, base.y - lH - bounce, r*0.25, lH, r*0.15, '#5C6BC0', '#3949AB', '#283593');
    drawIsoCube(ctx, x + r*0.1, base.y - lH + (bounce > 3 ? -bounce*0.5 : 0), r*0.25, lH, r*0.15, '#5C6BC0', '#3949AB', '#283593');

    // Torso
    drawIsoCube(ctx, x - r*0.4, base.y - lH - tH, r*0.8, tH, r*0.25, adjustColor(shirtColor, 20), shirtColor, adjustColor(shirtColor, -30));

    // Head
    const skinColor = '#FFB74D';
    drawIsoCube(ctx, x - r*0.4, base.y - lH - tH - hH, r*0.8, hH, r*0.25, adjustColor(skinColor, 20), skinColor, adjustColor(skinColor, -30));

    // Eyes
    ctx.fillStyle = '#212121';
    const eyeBaseY = base.y - lH - tH - hH + r*0.3;
    ctx.fillRect(x - r*0.15 - 3, eyeBaseY, 4, 4);
    ctx.fillRect(x + r*0.15, eyeBaseY, 4, 4);

    // Name label
    ctx.fillStyle = npcCfg.color || '#FFF';
    ctx.font = `bold ${Math.max(9, r * 0.5)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(npcCfg.avatar + ' ' + npcCfg.name.split(' ')[0], x, base.y + 6);
  }

  // ---- Particles ----
  function drawParticles(timestamp) {
    let writeIdx = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life -= 0.015;
      p.y += p.vy;
      if (p.life <= 0) continue;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.font = '16px Inter, sans-serif';
      ctx.textAlign = 'center';
      // Assume p.x, p.y are screen coordinates for simple overlay
      ctx.fillText(p.text, p.x, p.y);
      particles[writeIdx++] = p;
    }
    ctx.globalAlpha = 1;
    particles.length = writeIdx;
  }

  // ---- Helpers ----
  function roundRect(x, y, w, h, r, fill = true) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) ctx.fill();
    else ctx.stroke();
  }

  function adjustColor(hex, amt) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amt));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
    return `rgb(${r},${g},${b})`;
  }

  function lerpColor(a, b, t) {
    const a_ = parseInt(a.replace('#', ''), 16);
    const b_ = parseInt(b.replace('#', ''), 16);
    const r = Math.round(((a_ >> 16) & 0xff) * (1 - t) + ((b_ >> 16) & 0xff) * t);
    const g = Math.round(((a_ >> 8) & 0xff) * (1 - t) + ((b_ >> 8) & 0xff) * t);
    const bl = Math.round((a_ & 0xff) * (1 - t) + (b_ & 0xff) * t);
    return `rgb(${r},${g},${bl})`;
  }

  // ---- Hit Tests ----
  function getGridPos(canvasX, canvasY) {
    // Map screen pixel to grid cell using inverse projection
    const gp = toGrid(canvasX, canvasY);
    return {
      x: Math.floor(gp.x),
      y: Math.floor(gp.y),
    };
  }

  function hitTestFurniture(gx, gy) {
    const house = Game.State.get().house;
    for (const furn of house.furniture) {
      const fc = Game.Config.FURNITURE[furn.type];
      if (!fc) continue;
      if (gx >= furn.x && gx < furn.x + fc.w && gy >= furn.y && gy < furn.y + fc.h) {
        return { ...furn, config: fc };
      }
    }
    return null;
  }

  function hitTestRoom(gx, gy) {
    const house = Game.State.get().house;
    for (const room of house.rooms) {
      if (gx >= room.x && gx < room.x + room.w && gy >= room.y && gy < room.y + room.h) {
        return room;
      }
    }
    return null;
  }

  function getRandomRoomPosition() {
    const house = Game.State.get().house;
    if (!house || house.rooms.length === 0) return null;
    const room = house.rooms[Math.floor(Math.random() * house.rooms.length)];
    return {
      x: room.x + Math.floor(Math.random() * room.w),
      y: room.y + Math.floor(Math.random() * room.h)
    };
  }

  return {
    init, resize, render, 
    getGridPos, hitTestFurniture, hitTestRoom, 
    getRandomRoomPosition, toScreen, setCameraOffset
  };
})();
