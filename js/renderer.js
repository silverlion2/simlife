// ============================================================
// SimLife — Canvas Renderer (Top-Down Orthogonal RPG Style)
// ============================================================
window.Game = window.Game || {};

Game.Renderer = (function() {
  let canvas, ctx;
  let bgCanvas, bgCtx;
  let bgDirty = true;
  let cellSize = 64;
  let particles = [];
  let animFrame = 0;
  let clouds = [];
  
  // Camera Panning
  let cameraX = 0;
  let cameraY = 0;

  // Render context toggles for offscreen cache
  let activeCtx = null;
  let activeToScreen = null;

  // Delta time tracking
  let lastTimestamp = 0;

  // Character interpolation
  let charRenderX = 0;
  let charRenderY = 0;
  let isWalking = false;

  // Expose marking background dirty globally 
  function setBgDirty() { bgDirty = true; }

  function toScreen(gx, gy) {
    if (!canvas) return { x: 0, y: 0 };
    const w = canvas.width;
    const h = canvas.height;
    const state = Game.State.get();
    const houseW = state.house ? state.house.lotWidth : 10;
    const houseH = state.house ? state.house.lotHeight : 10;
    
    const sx = (w / 2) + (gx - houseW/2) * cellSize + cameraX;
    const sy = (h / 2) + (gy - houseH/2) * cellSize + cameraY;
    return { x: sx, y: sy };
  }

  function toGrid(sx, sy) {
    if (!canvas) return { x: 0, y: 0 };
    const w = canvas.width;
    const h = canvas.height;
    const state = Game.State.get();
    const houseW = state.house ? state.house.lotWidth : 10;
    const houseH = state.house ? state.house.lotHeight : 10;
    
    const gx = (sx - (w / 2) - cameraX) / cellSize + (houseW/2);
    const gy = (sy - (h / 2) - cameraY) / cellSize + (houseH/2);
    return { x: gx, y: gy };
  }

  function toBgScreen(gx, gy) {
    return {
      x: gx * cellSize + cellSize * 2,
      y: gy * cellSize + cellSize * 2
    };
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    
    bgCanvas = document.createElement('canvas');
    bgCtx = bgCanvas.getContext('2d');
    
    activeCtx = ctx;
    activeToScreen = toScreen;

    ctx.imageSmoothingEnabled = false;
    bgCtx.imageSmoothingEnabled = false;

    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const container = canvas.parentElement;
    const size = Math.min(container.clientWidth, container.clientHeight, 800);
    canvas.width = size;
    canvas.height = size;
    const house = Game.State.get().house;
    cellSize = Math.floor(size / Math.max(house.lotWidth || 10, house.lotHeight || 10) * 0.75);
    ctx.imageSmoothingEnabled = false;
    bgDirty = true;
  }

  function setCameraOffset(dx, dy) {
    cameraX += dx;
    cameraY += dy;
    const maxPan = cellSize * 5;
    cameraX = Math.max(-maxPan, Math.min(maxPan, cameraX));
    cameraY = Math.max(-maxPan, Math.min(maxPan, cameraY));
  }

  function updateBgCache(house) {
    const houseW = house ? house.lotWidth : 10;
    const houseH = house ? house.lotHeight : 10;
    const pad = cellSize * 2;
    bgCanvas.width = houseW * cellSize + pad * 2;
    bgCanvas.height = houseH * cellSize + pad * 2;
    bgCtx.imageSmoothingEnabled = false;

    activeCtx = bgCtx;
    activeToScreen = toBgScreen;

    // Grass Base
    bgCtx.fillStyle = '#4CAF50';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgCtx.fillStyle = '#388E3C';
    for(let i=0; i<30; i++) {
        const gx = Math.sin(i * 123) * bgCanvas.width;
        const gy = Math.cos(i * 321) * bgCanvas.height;
        bgCtx.fillRect(Math.abs(gx) % bgCanvas.width, Math.abs(gy) % bgCanvas.height, 4, 8);
    }

    drawRoomFloors(house);
    drawWalls(house);
    drawGrid(house);

    activeCtx = ctx;
    activeToScreen = toScreen;
    bgDirty = false;
  }

  // --- Main Render Loop ---
  function render(timestamp) {
    if (!ctx) return;
    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaMs = timestamp - lastTimestamp;
    const dt = Math.min(deltaMs / 1000, 0.1); 
    lastTimestamp = timestamp;

    animFrame++;
    const state = Game.State.get();
    const house = state.house;
    const time = state.time;

    activeCtx = ctx;
    activeToScreen = toScreen;

    // Character Interpolation via delta-time
    if (charRenderX === 0 && charRenderY === 0) {
      charRenderX = state.character.position.x;
      charRenderY = state.character.position.y;
    } else {
      const dx = state.character.position.x - charRenderX;
      const dy = state.character.position.y - charRenderY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      isWalking = dist > 0.05;
      
      const speed = 10.0;
      charRenderX += dx * speed * dt;
      charRenderY += dy * speed * dt;
    }

    cameraX = Math.round(cameraX);
    cameraY = Math.round(cameraY);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (bgDirty) {
      updateBgCache(house);
    }

    const origin = toScreen(0, 0);
    ctx.drawImage(bgCanvas, origin.x - cellSize * 2, origin.y - cellSize * 2);

    drawBuildGhost(state.ui);

    // Viewport Frustum Calculation
    const vpLeft = -cameraX - canvas.width/2 - cellSize*2;
    const vpRight = -cameraX + canvas.width/2 + cellSize*2;
    const vpTop = -cameraY - canvas.height/2 - cellSize*2;
    const vpBottom = -cameraY + canvas.height/2 + cellSize*2;
    
    function isVisible(gx, gy, w, h) {
       // Convert gx,gy to origin-centered offsets 
       const houseW = state.house ? state.house.lotWidth : 10;
       const houseH = state.house ? state.house.lotHeight : 10;
       const px = (gx - houseW/2) * cellSize;
       const py = (gy - houseH/2) * cellSize;
       return px + (w*cellSize) > vpLeft && px < vpRight && 
              py + (h*cellSize) > vpTop && py < vpBottom;
    }

    const renderQueue = [];
    
    for (const furn of house.furniture) {
      const fc = Game.Config.FURNITURE[furn.type];
      if (!fc) continue;
      
      if (isVisible(furn.x, furn.y, fc.w, fc.h)) {
        renderQueue.push({
          ySort: furn.y + fc.h,
          type: 'furn',
          furn: furn,
          fc: fc
        });
      }
    }

    renderQueue.push({
      ySort: charRenderY + 0.8, 
      type: 'char',
      char: state.character,
      timestamp: timestamp
    });

    renderQueue.sort((a,b) => a.ySort - b.ySort);

    for (const item of renderQueue) {
      if (item.type === 'furn') {
        drawFurniture(item.furn, item.fc);
      } else if (item.type === 'char') {
        drawCharacter(item.char, timestamp);
      }
    }

    drawLightingPass(house, state.character, timestamp, time);
    drawParticles();
    drawPieMenu(state.ui.pieOpen, timestamp);
  }

  // ---- Environments ----
  function drawRoomFloors(house) {
    if (!house) return;
    for (const r of house.rooms) {
      if (!r) continue;
      const tl = activeToScreen(r.x, r.y);
      const w = r.w * cellSize;
      const h = r.h * cellSize;

      activeCtx.save();
      activeCtx.beginPath();
      activeCtx.rect(tl.x, tl.y, w, h);
      activeCtx.clip(); 

      activeCtx.fillStyle = '#D6A66C';
      activeCtx.fillRect(tl.x, tl.y, w, h);

      activeCtx.fillStyle = '#C29156';
      for (let ix = 0; ix < r.w * 3; ix++) {
         const px = tl.x + (ix/3)*cellSize;
         activeCtx.fillRect(px, tl.y, 2, h);
      }
      activeCtx.fillStyle = '#E8B67B';
      for (let ix = 0; ix < r.w * 3; ix++) {
         const px = tl.x + (ix/3)*cellSize + 2;
         activeCtx.fillRect(px, tl.y, 1, h);
      }
      
      activeCtx.fillStyle = '#A87A4D';
      for (let i = 0; i < (r.w * r.h * 2); i++) {
         const rx = tl.x + (Math.sin(i*999) + 1)/2 * w;
         const ry = tl.y + (Math.cos(i*777) + 1)/2 * h;
         activeCtx.fillRect(rx, ry, Math.max(1, cellSize/3), 2);
      }
      activeCtx.restore();
    }
  }

  function drawGrid(house) {
    if (!house) return;
    activeCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    activeCtx.lineWidth = 1;
    for (const r of house.rooms) {
      if (!r) continue;
      const tl = activeToScreen(r.x, r.y);
      for (let ix = 0; ix <= r.w; ix++) {
        activeCtx.beginPath();
        activeCtx.moveTo(tl.x + ix*cellSize, tl.y);
        activeCtx.lineTo(tl.x + ix*cellSize, tl.y + r.h*cellSize);
        activeCtx.stroke();
      }
      for (let iy = 0; iy <= r.h; iy++) {
        activeCtx.beginPath();
        activeCtx.moveTo(tl.x, tl.y + iy*cellSize);
        activeCtx.lineTo(tl.x + r.w*cellSize, tl.y + iy*cellSize);
        activeCtx.stroke();
      }
    }
  }

  function drawWalls(house) {
    if (!house) return;
    const wallHeight = cellSize * 1.5;

    for (const r of house.rooms) {
      if (!r) continue;
      const tc = activeToScreen(r.x, r.y);
      const w = r.w * cellSize;
      const h = r.h * cellSize;

      activeCtx.fillStyle = '#EDE0D4'; 
      activeCtx.fillRect(tc.x, tc.y - wallHeight, w, wallHeight);
      
      activeCtx.fillStyle = '#5D4037';
      activeCtx.fillRect(tc.x, tc.y - Math.max(8, cellSize*0.1), w, Math.max(8, cellSize*0.1));
      
      activeCtx.fillStyle = '#4E342E';
      activeCtx.fillRect(tc.x, tc.y - wallHeight, w, Math.max(12, cellSize*0.15));

      activeCtx.fillStyle = '#3E2723';
      activeCtx.fillRect(tc.x - 8, tc.y - wallHeight, 8, wallHeight + h); 
      activeCtx.fillRect(tc.x + w, tc.y - wallHeight, 8, wallHeight + h); 

      const grad = activeCtx.createLinearGradient(0, tc.y, 0, tc.y + cellSize*1.2);
      grad.addColorStop(0, 'rgba(0,0,0,0.4)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      activeCtx.fillStyle = grad;
      activeCtx.fillRect(tc.x, tc.y, w, cellSize*1.2);
    }
  }

  function drawBuildGhost(ui) {
    if (ui.mode !== 'build' || !ui.buildGhost.active) return;
    const ghost = ui.buildGhost;
    const canPlace = Game.House.isAreaFree(ghost.x, ghost.y, ghost.w, ghost.h);
    const tc = toScreen(ghost.x, ghost.y);
    const w = ghost.w * cellSize;
    const h = ghost.h * cellSize;
    
    ctx.fillStyle = canPlace ? 'rgba(76, 175, 80, 0.4)' : 'rgba(244, 67, 54, 0.4)';
    ctx.strokeStyle = canPlace ? '#4CAF50' : '#F44336';
    ctx.lineWidth = 3;
    ctx.fillRect(tc.x, tc.y, w, h);
    ctx.strokeRect(tc.x, tc.y, w, h);
  }

  // ---- Furniture Flat Pixel HD-2D ----
  function drawOrthoCube(x, y, w, d, h, z, cTop, cFront) {
     const drawY = y - z;
     if (h > 0) {
       activeCtx.fillStyle = cFront;
       activeCtx.fillRect(x, Math.floor(drawY - h + d), w, h);
     }
     activeCtx.fillStyle = cTop;
     activeCtx.fillRect(x, Math.floor(drawY - h), w, d);
  }

  function drawFurniture(furn, fc) {
    const tc = activeToScreen(furn.x, furn.y);
    const w = fc.w * cellSize;
    const d = fc.h * cellSize; 
    const pad = Math.floor(cellSize * 0.05);

    const x = tc.x + pad;
    const y = tc.y + pad;
    const fw = w - pad*2;
    const fd = d - pad*2; 

    // Determine scale threshold for drawing detailed sub-cubes
    // Fast path: if off screen during panning or very small, skip inner details
    
    activeCtx.fillStyle = 'rgba(0,0,0,0.3)';
    activeCtx.fillRect(x + 4, y + 6, fw, fd);

    if (furn.type.includes('bed')) {
      drawOrthoCube(x, y, fw, fd, 16, 0, '#5D4037', '#4E342E'); // Frame
      drawOrthoCube(x, y, fw, Math.max(8, fd*0.15), 32, 0, '#4E342E', '#3E2723'); // Headboard
      drawOrthoCube(x+6, y+8, fw-12, fd-16, 8, 16, '#F5F5F5', '#E0E0E0'); // Mattress
      drawOrthoCube(x+4, y + fd*0.4, fw-8, fd*0.6 - 6, 9, 16, '#7986CB', '#5C6BC0'); // Blanket
      drawOrthoCube(x + fw*0.15, y + fd*0.2, fw*0.7, fd*0.2, 4, 24, '#FFFFFF', '#EEEEEE'); // Pillow

    } else if (furn.type.includes('fridge')) {
      const h = cellSize * 2.2;
      drawOrthoCube(x, y, fw, fd, h, 0, '#CFD8DC', '#B0BEC5'); // Main Body
      drawOrthoCube(x+4, y+4, fw-8, fd-4, h-8, 0, '#ECEFF1', '#CFD8DC'); // Doors
      
      // Handles
      ctx.fillStyle = '#90A4AE';
      ctx.fillRect(x + fw*0.8, y + fd - 4 - h + h*0.2, 4, h*0.2); // fridge
      ctx.fillRect(x + fw*0.8, y + fd - 4 - h + h*0.5, 4, h*0.15); // freezer

    } else if (furn.type.includes('sofa') || furn.type.includes('recliner')) {
      drawOrthoCube(x, y, fw, fd, 12, 0, '#283593', '#1A237E'); // Base
      drawOrthoCube(x, y, fw, fd*0.3, 36, 12, '#3F51B5', '#303F9F'); // Backrest
      drawOrthoCube(x + fw*0.1, y + fd*0.25, fw*0.8, fd*0.75, 8, 12, '#5C6BC0', '#3949AB'); // Seat cushion
      drawOrthoCube(x, y + fd*0.15, fw*0.15, fd*0.85, 20, 12, '#3949AB', '#283593'); // L arm
      drawOrthoCube(x + fw*0.85, y + fd*0.15, fw*0.15, fd*0.85, 20, 12, '#3949AB', '#283593'); // R arm

    } else if (furn.type.includes('desk') || furn.type.includes('table') || furn.type.includes('workbench')) {
      const h = cellSize * 0.8;
      // Legs (top faces hidden)
      ctx.fillStyle = '#4E342E';
      ctx.fillRect(x+6, y - h + fd - 4, 4, h); // front left
      ctx.fillRect(x + fw - 10, y - h + fd - 4, 4, h); // front right
      ctx.fillRect(x+6, y - h + 8, 4, h); // back left
      ctx.fillRect(x + fw - 10, y - h + 8, 4, h); // back right
      
      // Tabletop
      drawOrthoCube(x, y, fw, fd, 8, h, '#8D6E63', '#6D4C41');
      
      if (furn.type.includes('desk')) {
         drawOrthoCube(x + fw*0.3, y + fd*0.3, fw*0.4, fd*0.4, 2, h+8, '#ECEFF1', '#CFD8DC'); // Laptop Base
         drawOrthoCube(x + fw*0.3, y + fd*0.3, fw*0.4, 4, 16, h+10, '#CFD8DC', '#111'); // Screen
      }

    } else if (furn.type.includes('tv') || furn.type.includes('stereo') || furn.type.includes('printer')) {
      const h = furn.type.includes('tv') ? cellSize * 1.5 : cellSize * 0.8;
      drawOrthoCube(x, y, fw, fd, h * 0.4, 0, '#424242', '#212121'); // Stand
      drawOrthoCube(x+4, y+4, fw-8, fd-8, h * 0.6, h * 0.4, '#616161', '#424242'); // Device
      
      if (furn.type.includes('tv')) {
        const screenColor = (animFrame % 60 < 50) ? '#64B5F6' : '#111';
        ctx.fillStyle = screenColor;
        ctx.fillRect(x+8, y + fd - 4 - h + 8, fw-16, h * 0.6 - 16); // TV Screen pixels directly injected to front face
      }

    } else if (furn.type.includes('stove') || furn.type.includes('microwave') || furn.type.includes('bookshelf')) {
      const h = cellSize * 2.0;
      const topColor = furn.type.includes('bookshelf') ? '#5D4037' : '#90A4AE';
      const frontColor = furn.type.includes('bookshelf') ? '#4E342E' : '#78909C';
      drawOrthoCube(x, y, fw, fd, h, 0, topColor, frontColor);
      
      if (furn.type.includes('stove')) {
        ctx.fillStyle = '#212121';
        ctx.fillRect(x+2, y - h + 2, fw-4, fd-4); // Stove top
        ctx.fillStyle = '#FF5252';
        ctx.fillRect(x + fw*0.2, y - h + fd*0.2, 8, 8); // Burner
        ctx.fillRect(x + fw*0.6, y - h + fd*0.6, 8, 8); // Burner
        
        ctx.fillStyle = '#212121'; // Oven Window
        ctx.fillRect(x + fw*0.1, y + fd - h + h*0.3, fw*0.8, h*0.4);
      } else if (furn.type.includes('bookshelf')) {
        ctx.fillStyle = '#3E2723';
        ctx.fillRect(x+4, y + fd - h + 4, fw-8, h-8); // Dark interior
        const sH = (h-8)/4;
        for(let i=1; i<4; i++) {
           ctx.fillStyle = '#5D4037';
           ctx.fillRect(x+4, y + fd - h + 4 + i*sH, fw-8, 4); // Shelf line
           ctx.fillStyle = '#EF5350';
           ctx.fillRect(x+8, y + fd - h + 4 + i*sH - 12, 6, 12); // Book
        }
      }

    } else if (furn.type.includes('shower') || furn.type.includes('tub')) {
      const h = cellSize * 2.2;
      if (furn.type.includes('shower')) {
        drawOrthoCube(x, y, fw, fd, 12, 0, '#E3F2FD', '#BBDEFB'); // Base
        
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; // Glass
        ctx.fillRect(x, y - h, fw, fd); // Top lip
        ctx.fillRect(x, y - h + fd, 4, h-12); // Front left frame
        ctx.fillRect(x+fw-4, y - h + fd, 4, h-12); // Front right frame
        ctx.fillRect(x, y - h, fw, h-12+fd); // Back glass enclosing
        
        ctx.fillStyle = '#90A4AE';
        ctx.fillRect(x + fw*0.4, y + fd*0.2 - h + 12, 8, 12); // Showerhead
      } else {
        drawOrthoCube(x, y, fw, fd, cellSize*0.6, 0, '#FAFAFA', '#EEEEEE');
        drawOrthoCube(x+6, y+6, fw-12, fd-12, cellSize*0.4, cellSize*0.2, '#E1F5FE', '#B3E5FC'); // Inner pool
      }

    } else if (furn.type.includes('plant') || furn.type.includes('tree')) {
      drawOrthoCube(x + fw*0.2, y + fd*0.2, fw*0.6, fd*0.6, cellSize*0.4, 0, '#795548', '#5D4037'); // Pot
      
      const pY = y + fd/2 - cellSize*0.4; // Plant Z offset
      ctx.fillStyle = '#2E7D32';
      ctx.beginPath(); ctx.arc(x + fw/2, pY - cellSize*0.2, fw*0.6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#4CAF50';
      ctx.beginPath(); ctx.arc(x + fw/2, pY - cellSize*0.5, fw*0.4, 0, Math.PI*2); ctx.fill();
    } else {
      drawOrthoCube(x, y, fw, fd, cellSize*0.8, 0, '#9E9E9E', '#757575'); // Generic bounding box
    }

    // Emoji label
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const lSize = Math.max(14, cellSize * 0.3);
    const lx = x + fw - lSize - 2;
    const ly = y + fd - lSize - 2;
    ctx.fillRect(lx, ly, lSize, lSize);
    ctx.fillStyle = '#FFF';
    ctx.font = `bold ${Math.round(lSize*0.7)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fc.icon, lx + lSize/2, ly + lSize/2);
  }

  // ---- Character Redesign (Orthogonal Front/Side) ----
  function drawCharacter(char, timestamp) {
    const base = toScreen(charRenderX + 0.5, charRenderY + 0.5);
    const s = Math.floor(cellSize * 0.45); // Scale
    const bounce = isWalking ? Math.abs(Math.sin(timestamp * 0.012) * s * 0.2) : 0;
    
    // Position (base.x is center, base.y is bottom footprint)
    const x = base.x;
    const y = base.y; 

    // Size configs
    const w = s * 0.8;
    const d = s * 0.5; // block depth
    const legH = s * 0.5;
    const torsoH = s * 0.8;
    const headH = s * 0.7;

    // Cast round ambient shadow right beneath feet
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, s*0.8, s*0.3, 0, 0, Math.PI*2);
    ctx.fill();

    const lz = bounce; // vertical pop from walking
    
    // Legs (drawOrthoCube uses top-left footprint)
    const leftFootX = x - w*0.8;
    const rightFootX = x + w*0.2;
    const footY = y - d/2;
    
    drawOrthoCube(leftFootX, footY, w*0.6, d, legH, lz, '#1A237E', '#0D47A1');
    drawOrthoCube(rightFootX, footY, w*0.6, d, legH, isWalking ? lz*0.5 : 0, '#1A237E', '#0D47A1');

    // Torso
    const shirtColor = char.name.includes('Morgan') ? '#546E7A' : (char.name.includes('Taylor') ? '#FF5722' : '#F44336');
    const shirtTop = char.name.includes('Morgan') ? '#78909C' : (char.name.includes('Taylor') ? '#FF8A65' : '#EF5350');
    drawOrthoCube(x - w, footY - d*0.1, w*2, d*1.2, torsoH, legH + lz, shirtTop, shirtColor);

    // Head
    const skinColor = char.name.includes('Sam') ? '#CF946A' : '#FFE0B2';
    const skinTop = char.name.includes('Sam') ? '#BCAAA4' : '#FFCC80';
    drawOrthoCube(x - w*0.8, footY - d*0.2, w*1.6, d*1.4, headH, legH + torsoH + lz, skinTop, skinColor);
    
    // Hair
    const hairColor = char.name.includes('Morgan') ? '#757575' : (char.name.includes('Riley') ? '#7E57C2' : '#3E2723');
    drawOrthoCube(x - w*0.9, footY - d*0.3, w*1.8, d*1.6, s*0.2, legH + torsoH + headH + lz, hairColor, hairColor);

    // Eyes on Front Face
    const faceZ = legH + torsoH + lz;
    const faceFrontY = footY - d*0.2 + (d*1.4) - faceZ - headH;
    ctx.fillStyle = '#111';
    ctx.fillRect(x - w*0.4, Math.floor(faceFrontY + headH*0.3), w*0.25, w*0.3);
    ctx.fillRect(x + w*0.15, Math.floor(faceFrontY + headH*0.3), w*0.25, w*0.3);

    // Plumbob
    const totalH = legH + torsoH + headH + s*0.2;
    drawPlumbob(x, y - totalH - s*0.5 - lz, Game.Character.getMoodInfo().value, timestamp, s/35);

    // Labels and Thoughts
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - w, y + 8, w*2, 16);
    ctx.fillStyle = '#FFF';
    ctx.font = `bold ${Math.floor(s*0.3)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(char.name, x, y + 9);

    // Thoughts / Activities
    const bubbleY = y - totalH - s*0.3 - lz;
    if (char.currentActivity) {
      const actCfg = Game.Config.ACTIVITIES[char.currentActivity.type];
      if (actCfg) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        const bx = x + w*0.8;
        
        ctx.fillRect(bx, bubbleY, 32, 28);
        ctx.fillRect(bx - 4, bubbleY + 18, 4, 4); 
        ctx.fillRect(bx - 8, bubbleY + 22, 4, 4);
        
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(actCfg.icon, bx + 16, bubbleY + 12);

        // Progress line
        ctx.fillStyle = '#1B5E20';
        ctx.fillRect(bx + 2, bubbleY + 22, 28, 4);
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(bx + 2, bubbleY + 22, 28 * char.activityProgress, 4);
      }
    } else if (Game.Autonomy && Game.Autonomy.getThought()) {
      const thought = Game.Autonomy.getThought();
      const pulse = 0.85 + Math.sin(timestamp * 0.004) * 0.15;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(255,255,240,0.95)';
      const bx = x + w*0.8;
      const by = bubbleY - s * 0.4;
      
      ctx.fillRect(bx, by, 44, 26);
      ctx.fillRect(bx - 4, by + 16, 4, 4);
      ctx.fillRect(bx - 8, by + 20, 4, 4);
      
      ctx.fillStyle = '#333';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(thought.needIcon + '→' + thought.activityIcon, bx + 22, by + 12);
      ctx.globalAlpha = 1;
    }
  }

  function drawPlumbob(x, y, moodValue, timestamp, scale) {
    const size = 16 * scale;
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
    
    // Draw 2D Plumbob (Diamond)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, py - size);
    ctx.lineTo(x + size*0.5, py);
    ctx.lineTo(x, py + size);
    ctx.lineTo(x - size*0.5, py);
    ctx.fill();

    // Highlight edge
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(x, py - size);
    ctx.lineTo(x + size*0.5, py);
    ctx.lineTo(x, py);
    ctx.fill();

    ctx.shadowBlur = 0;
  }

  // --- Dynamic Lighting / Post Processing ---
  function drawLightingPass(house, character, timestamp, time) {
    // Determine exact darkness based on time (12am = 0, noon = 1200, 11:59p = 2359)
    // Darkest at 0-400, brightens 400-800, day at 800-1800, darkens 1800-2200.
    const h24 = Math.floor(time / 100);
    let alpha = 0; // 0 = transparent, logic maps to darkness level

    if (h24 < 5 || h24 >= 20) {
       alpha = 0.55; // Night dark blue layer
    } else if (h24 >= 5 && h24 < 7) {
       alpha = 0.35; // Dawn
    } else if (h24 >= 18 && h24 < 20) {
       alpha = 0.35; // Dusk
    }

    if (alpha === 0) return; // full day, no lights needed

    ctx.save();
    // Dark ambient layer
    ctx.fillStyle = `rgba(12, 12, 28, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'lighter'; // Lights mix to brighten

    // Draw Character carrying a small warm aura
    const cp = toScreen(charRenderX + 0.5, charRenderY + 0.5);
    drawRadialLight(cp.x, cp.y - 24, cellSize * 2, 'rgba(255, 200, 150, 0.4)');

    // Furniture Lights
    for (const furn of house.furniture) {
      const fc = Game.Config.FURNITURE[furn.type];
      if (!fc) continue;
      const tc = toScreen(furn.x + fc.w/2, furn.y + fc.h/2);

      if (furn.type.includes('tv') ) {
        if (animFrame % 60 < 50) {
          drawRadialLight(tc.x, tc.y - cellSize*0.5, cellSize * 2.5, 'rgba(64, 196, 255, 0.5)'); // cool TV glare
        }
      } else if (furn.type.includes('stereo')) {
        drawRadialLight(tc.x, tc.y - cellSize*0.3, cellSize * 1.5, 'rgba(156, 39, 176, 0.4)'); // funky stereo glow
      } else if (furn.type.includes('fridge')) {
        // Minor cold reflection
        drawRadialLight(tc.x, tc.y - cellSize*0.5, cellSize * 1.5, 'rgba(200, 230, 255, 0.1)');
      } else if (furn.type.includes('bookshelf')) {
         // Maybe a little study lamp on a desk? Right now bookshelf is next to a desk usually.
      }
    }

    ctx.restore();
  }

  function drawRadialLight(x, y, radius, colorInner) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, colorInner);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // --- UI Elements ---
  function drawPieMenu(pieState, timestamp) {
    if (!pieState || !pieState.active) return;
    const pt = toScreen(pieState.targetX + 0.5, pieState.targetY + 0.5);
    
    // Dim background slightly when pie is open
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const radius = 80;
    const pieces = pieState.options.length;
    const angleStep = (Math.PI * 2) / pieces;

    ctx.save();
    ctx.translate(pt.x, pt.y);

    for (let i = 0; i < pieces; i++) {
        const startAngle = i * angleStep - Math.PI / 2;
        const endAngle = (i + 1) * angleStep - Math.PI / 2;
        const isHover = (i === pieState.hoverIndex);
        const opt = pieState.options[i];
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, isHover ? radius * 1.05 : radius, startAngle, endAngle);
        ctx.closePath();
        
        ctx.fillStyle = isHover ? 'rgba(33, 150, 243, 0.95)' : 'rgba(30, 30, 30, 0.9)';
        ctx.fill();
        ctx.strokeStyle = '#FAFAFA';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const midAngle = (startAngle + endAngle) / 2;
        const textX = Math.cos(midAngle) * radius * 0.6;
        const textY = Math.sin(midAngle) * radius * 0.6;

        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const lines = opt.label.split(' / ');
        if(lines.length > 1) {
            ctx.fillText(lines[0], textX, textY - 8);
            ctx.fillText(lines[1], textX, textY + 8);
        } else {
            ctx.fillText(opt.label, textX, textY);
        }
    }
    ctx.restore();
  }

  function spawnParticles(gx, gy, count, color) {
    const pt = toScreen(gx, gy);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: pt.x,
        y: pt.y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5 - 2,
        life: 1.0,
        color: color
      });
    }
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2; // gravity 
      p.life -= 0.03;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fillRect(p.x, p.y, Math.max(2, cellSize * 0.05), Math.max(2, cellSize * 0.05));
      ctx.globalAlpha = 1;
    }
  }

  function getPixelSize() {
      return cellSize;
  }
  
  function lerpColor(c1, c2, t) {
      if(t<0) t=0; if(t>1) t=1;
      const parse = (c) => {
          if(c.startsWith('#')) {
              let hex = c.substring(1);
              if(hex.length===3) hex = hex.split('').map(x=>x+x).join('');
              return [parseInt(hex.substring(0,2),16), parseInt(hex.substring(2,4),16), parseInt(hex.substring(4,6),16)];
          }
          return [0,0,0];
      }
      const p1 = parse(c1), p2 = parse(c2);
      const r = Math.round(p1[0] + (p2[0]-p1[0])*t);
      const g = Math.round(p1[1] + (p2[1]-p1[1])*t);
      const b = Math.round(p1[2] + (p2[2]-p1[2])*t);
      return `rgb(${r},${g},${b})`;
  }

  // ---- Hit Tests ----
  function getGridPos(canvasX, canvasY) {
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
    init,
    render,
    toScreen,
    toGrid,
    setCameraOffset,
    spawnParticles,
    getGridPos,
    hitTestFurniture,
    hitTestRoom,
    getRandomRoomPosition,
    setBgDirty
  };
})();
