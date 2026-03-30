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
  }

  // --- Main Render Loop ---
  function render(timestamp) {
    if (!ctx) return;
    animFrame++;
    const state = Game.State.get();
    const house = state.house;
    const time = state.time;

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
      depth: state.character.position.x + state.character.position.y
    });

    renderQueue.sort((a,b) => a.depth - b.depth);

    for (const item of renderQueue) {
      if (item.type === 'wall_back') drawRoomWalls(item.room);
      else if (item.type === 'furniture') drawFurnitureBillboard(item.obj, item.config);
      else if (item.type === 'character') drawCharacter(item.obj, timestamp);
    }

    drawParticles(timestamp);
    drawWorkOverlay(state.character, state.time, timestamp);

    // Night Time overlay
    if (time.hour >= 20 || time.hour < 6) {
      ctx.fillStyle = 'rgba(10, 10, 40, 0.35)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (time.hour >= 18) {
      const alpha = (time.hour - 18) / 4 * 0.25;
      ctx.fillStyle = `rgba(30, 20, 50, ${alpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
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
    const gradient = ctx.createLinearGradient(0, canvas.height * 0.15, 0, canvas.height);
    gradient.addColorStop(0, '#66BB6A');
    gradient.addColorStop(0.3, '#4CAF50');
    gradient.addColorStop(1, '#388E3C');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, canvas.height * 0.15, canvas.width, canvas.height * 0.85);

    ctx.fillStyle = '#A1887F';
    const pathY = canvas.height * 0.95 - Math.max(cameraY, 0)*0.2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.ellipse(40 + i * 75 - cameraX*0.1, pathY, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawClouds(timestamp) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (const c of clouds) {
      const x = c.xPct * canvas.width - cameraX * 0.05;
      const w = c.wPct * canvas.width;
      c.xPct += c.speed / canvas.width;
      if (c.xPct > 1.1) c.xPct = -0.1;
      const y = c.yPct * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, w * 0.35, 0, Math.PI * 2);
      ctx.arc(x + w * 0.25, y - 5, w * 0.3, 0, Math.PI * 2);
      ctx.arc(x + w * 0.5, y, w * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTrees() { /* Simplified background trees */ }
  function drawFlowers() { /* Simplified background flowers */ }
  function drawFence() { /* Simplified background fence */ }

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
      ctx.font = `bold Math.max(10, getIsoW() * 0.15)px Inter, sans-serif`;
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
    
    ctx.fillStyle = adjustColor(baseColor, -20);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p2.x, p2.y - wallHeight);
    ctx.lineTo(p1.x, p1.y - wallHeight);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = adjustColor(baseColor, -40);
    ctx.strokeRect(0, 0, 0, 0); // flush properties
    ctx.stroke();

    // RIGHT wall (aligned with X-axis at y=0 bounds)
    const p3 = toScreen(room.x + room.w, room.y);
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p3.x, p3.y - wallHeight);
    ctx.lineTo(p1.x, p1.y - wallHeight);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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
  function drawFurnitureBillboard(furn, fc) {
    // Anchor object to bottom center of its bounding box on the isometric grid
    const cGx = furn.x + fc.w / 2;
    const cGy = furn.y + fc.h / 2;
    const base = toScreen(cGx, cGy);
    
    // Convert 2D dimensions into 2.5D billboard scale
    const bw = Math.max(fc.w, fc.h) * getIsoW() * 0.7;
    const bh = Math.max(fc.w, fc.h) * getIsoW() * 0.7; // general object height proxy
    const drawX = base.x - bw / 2;
    const drawY = base.y - bh; 

    // Specific generic drawing for different types
    if (furn.type.includes('bed')) {
      const bhBed = bh * 0.5;
      const dy = base.y - bhBed;
      ctx.fillStyle = '#8D6E63';
      roundRect(drawX, dy, bw, bhBed, 4);
      ctx.fillStyle = '#E8E0D8';
      roundRect(drawX + 4, dy + 4, bw - 8, bhBed - 8, 3);
      ctx.fillStyle = '#7986CB';
      roundRect(drawX + 4, dy + bhBed * 0.4, bw - 8, bhBed * 0.6 - 4, 3);
      ctx.fillStyle = '#F5F5F5';
      roundRect(drawX + 8, dy + 8, bw * 0.3, bhBed * 0.25, 3);
    } else if (furn.type.includes('fridge')) {
      ctx.fillStyle = '#CFD8DC';
      roundRect(drawX, drawY, bw, bh * 1.5, 4);
      ctx.strokeStyle = '#90A4AE';
      ctx.lineWidth = 2;
      ctx.strokeRect(drawX, drawY, bw, bh * 1.5);
      ctx.beginPath();
      ctx.moveTo(drawX, drawY + bh * 0.5);
      ctx.lineTo(drawX + bw, drawY + bh * 0.5);
      ctx.stroke();
      ctx.fillStyle = '#B0BEC5';
      roundRect(drawX + bw - 10, drawY + bh * 0.2, 4, bh * 0.2, 2);
      roundRect(drawX + bw - 10, drawY + bh * 0.8, 4, bh * 0.3, 2);
    } else if (furn.type.includes('tv_stand')) {
      ctx.fillStyle = '#212121';
      roundRect(drawX, drawY, bw, bh, 4);
      ctx.fillStyle = '#424242';
      roundRect(drawX + 4, drawY + 4, bw - 8, bh - 8, 2);
      // animated screen
      if (animFrame % 120 < 100) {
        ctx.fillStyle = 'rgba(100,181,246,0.3)';
        roundRect(drawX + 4, drawY + 4, bw - 8, bh - 8, 2);
      }
      ctx.fillStyle = '#555';
      roundRect(base.x - bw*0.3, base.y - 6, bw*0.6, 6, 2);
      ctx.fillRect(base.x - 4, drawY + bh, 8, base.y - (drawY + bh) - 6);
    } else if (furn.type.includes('sofa')) {
      const bhSofa = bh * 0.7;
      const dy = base.y - bhSofa;
      ctx.fillStyle = '#5C6BC0';
      roundRect(drawX, dy, bw, bhSofa, 6);
      ctx.fillStyle = '#7986CB';
      roundRect(drawX + 4, dy + bhSofa * 0.4, bw - 8, bhSofa * 0.6 - 4, 4);
    } else if (furn.type.includes('toilet')) {
      const bhT = bh * 0.8;
      const dy = base.y - bhT;
      ctx.fillStyle = '#EEEEEE';
      roundRect(drawX + bw*0.2, dy, bw*0.6, bhT*0.5, 4); 
      ctx.fillStyle = '#F5F5F5';
      ctx.beginPath();
      ctx.ellipse(base.x, base.y - bhT*0.2, bw*0.4, bhT*0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (furn.type.includes('shower')) {
      ctx.fillStyle = '#B3E5FC';
      roundRect(drawX, drawY, bw, bh * 1.4, 3);
      ctx.strokeStyle = '#81D4FA';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(drawX + bw * 0.2 + i * bw * 0.2, drawY + bh * 0.3);
        ctx.lineTo(drawX + bw * 0.2 + i * bw * 0.2, drawY + bh * 1.2);
        ctx.stroke();
      }
    } else if (furn.type.includes('stove')) {
      const bhS = bh * 0.85;
      const dy = base.y - bhS;
      ctx.fillStyle = '#78909C';
      roundRect(drawX, dy, bw, bhS, 3);
      ctx.fillStyle = '#37474F';
      roundRect(drawX + 4, dy + 4, bw - 8, bhS * 0.4, 2);
      ctx.fillStyle = '#CFD8DC';
      roundRect(drawX + bw*0.1, dy + bhS*0.5, bw*0.8, bhS*0.4, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      roundRect(drawX + bw*0.2, dy + bhS*0.6, bw*0.6, bhS*0.2, 2);
    } else if (furn.type.includes('desk') || furn.type.includes('table')) {
      const bT = bh * 0.6;
      const dy = base.y - bT;
      ctx.fillStyle = '#A1887F';
      roundRect(drawX, dy, bw, bT * 0.2, 3);
      ctx.fillStyle = '#8D6E63';
      ctx.fillRect(drawX + 4, dy + bT*0.2, 4, bT*0.8);
      ctx.fillRect(drawX + bw - 8, dy + bT*0.2, 4, bT*0.8);
    } else if (furn.type.includes('computer')) {
      const bC = bh * 0.6;
      const dy = base.y - bC;
      ctx.fillStyle = '#37474F';
      roundRect(drawX + bw*0.1, dy, bw*0.8, bC, 3);
      ctx.fillStyle = '#4FC3F7';
      roundRect(drawX + bw*0.15, dy + 3, bw*0.7, bC*0.8, 2);
    } else if (furn.type.includes('plant')) {
      const bp = bh * 0.8;
      const dy = base.y - bp;
      ctx.fillStyle = '#795548'; // Pot
      roundRect(drawX + bw*0.3, dy + bp*0.6, bw*0.4, bp*0.4, 3);
      ctx.fillStyle = '#4CAF50';
      ctx.beginPath();
      ctx.arc(base.x, dy + bp*0.4, bw*0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Very Generic Object Block
      ctx.fillStyle = '#9E9E9E';
      roundRect(drawX, drawY, bw, bh, 4);
      ctx.fillStyle = '#E0E0E0';
      roundRect(drawX + 2, drawY + 2, bw - 4, bh - 4, 3);
    }
    
    // Always render label over generic box for logic clarity
    ctx.fillStyle = '#444';
    ctx.font = `bold ${Math.max(10, bw * 0.2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fc.icon, base.x, drawY + bh / 2 - 10);
  }

  // ---- Character + Plumbob ----
  function drawCharacter(char, timestamp) {
    // anchor to bottom center on grid mapped to screen
    const base = toScreen(char.position.x + 0.5, char.position.y + 0.5);
    const scale = getIsoW() / 84; 
    const r = 24 * scale;
    const bounce = Math.sin(timestamp * 0.003) * (5 * scale);
    const moodInfo = Game.Character.getMoodInfo();

    const x = base.x;
    const y = base.y - r; 

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(x, base.y, r * 1.5, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body (Sims-style segmented)
    // Legs
    ctx.fillStyle = '#5C6BC0';
    roundRect(x - r * 0.5, y + r * 0.6 + bounce, r * 0.35, r * 1.2, 2);
    roundRect(x + r * 0.15, y + r * 0.6 + bounce, r * 0.35, r * 1.2, 2);

    // Torso
    ctx.fillStyle = '#42A5F5';
    roundRect(x - r * 0.6, y - r * 0.1 + bounce, r * 1.2, r * 0.9, 4);

    // Head
    ctx.fillStyle = '#FFB74D';
    ctx.beginPath();
    ctx.arc(x, y - r * 0.4 + bounce, r * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = '#5D4037';
    ctx.beginPath();
    ctx.arc(x, y - r * 0.55 + bounce, r * 0.55, Math.PI, 2 * Math.PI);
    ctx.fill();
    roundRect(x - r * 0.55, y - r * 0.7 + bounce, r * 1.1, r * 0.25, 3);

    // Eyes
    const eyeSpread = r * 0.25;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(x - eyeSpread, y - r * 0.35 + bounce, r * 0.07, 0, Math.PI * 2);
    ctx.arc(x + eyeSpread, y - r * 0.35 + bounce, r * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (moodInfo.value >= 70) {
      ctx.arc(x, y - r * 0.2 + bounce, r * 0.15, 0.1 * Math.PI, 0.9 * Math.PI);
    } else if (moodInfo.value >= 40) {
      ctx.moveTo(x - r * 0.12, y - r * 0.15 + bounce);
      ctx.lineTo(x + r * 0.12, y - r * 0.15 + bounce);
    } else {
      ctx.arc(x, y - r * 0.05 + bounce, r * 0.12, 1.1 * Math.PI, 1.9 * Math.PI);
    }
    ctx.stroke();

    // Plumbob
    drawPlumbob(x, y - r * 2.2 + bounce, moodInfo.value, timestamp, scale);

    // Name label
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = `bold ${Math.max(10, r * 0.5)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(char.name, x, base.y + 10);

    // Thoughts / Activities
    if (char.currentActivity) {
      const actCfg = Game.Config.ACTIVITIES[char.currentActivity.type];
      if (actCfg) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        const bx = x + r + 15;
        const by = y - r - 25 + bounce;
        roundRect(bx, by, 34, 28, 10, true);
        ctx.beginPath();
        ctx.arc(bx - 2, by + 22, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx - 6, by + 28, 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#333';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(actCfg.icon, bx + 17, by + 14);

        // Progress arc
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(bx + 17, by + 14, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * char.activityProgress);
        ctx.stroke();
      }
    }

    if (!char.currentActivity && Game.Autonomy && Game.Autonomy.getThought()) {
      const thought = Game.Autonomy.getThought();
      const pulse = 0.85 + Math.sin(timestamp * 0.004) * 0.15;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(255,255,240,0.92)';
      const bx = x + r + 10;
      const by = y - r - 35 + bounce;
      roundRect(bx, by, 45, 28, 10, true);
      
      ctx.beginPath();
      ctx.arc(bx - 2, by + 24, 3, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(thought.needIcon + '→' + thought.activityIcon, bx + 22, by + 14);
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
