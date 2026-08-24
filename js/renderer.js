
// ============================================================
// SimLife — Phaser 3 Isometric Renderer
// ============================================================
window.Game = window.Game || {};

Game.Renderer = (function() {
  const RendererMath = Game.RendererMath;
  const RendererHelpers = Game.RendererHelpers;
  if (!RendererMath || !RendererHelpers) {
    throw new Error('Game.Renderer requires Game.RendererMath and Game.RendererHelpers to be loaded first');
  }

  let phaserGame = null;
  let mainScene = null;
  let easyStar = null;
  let currentGrid = null;
  let signalsBound = false;
  let initPromise = null;
  let contextListenersBound = false;
  let runtimeInputBlocked = false;
  let runtimePreviousSpeed = null;
  let runtimePreviousFocus = null;
  let pendingPartialStatus = null;
  
  // Grid metrics
  const TILE_W = RendererMath.TILE_W;
  const TILE_H = RendererMath.TILE_H;

  let spriteMap = new Map();
  let shadowMap = new Map();
  let characterSprite = null;
  let charShadowSprite = null;
  let avatarRenderer = null;
  let avatarContainer = null;
  let avatarDirection = 'S';
  let avatarFlipX = false;
  let buildGhostSprite = null;
  let buildGhostFootprint = null;
  let npcSpriteMap = new Map();
  let familySpriteMap = new Map();
  let debugGraphics = null;
  const CAMERA_FOLLOW_LERP = 0.12;
  const CAMERA_FOCUS_FALLBACK_OFFSET = 48;
  window.DEBUG_BOUNDS = false;

  function getDefaultCameraZoom(width, height) {
    const viewportWidth = Number(width) || window.innerWidth || 1280;
    const viewportHeight = Number(height) || window.innerHeight || 720;
    if (viewportWidth <= 620 || viewportHeight <= 560) return 0.96;
    if (viewportWidth >= 1500) return 1.78;
    if (viewportWidth >= 1100) return 1.65;
    return 1.42;
  }

  class MainScene extends Phaser.Scene {
    constructor() {
      super({ key: 'MainScene' });
    }

    preload() {
      for (const key in window.SIM_PRELOADED_IMAGES) {
          this.textures.addImage(key, window.SIM_PRELOADED_IMAGES[key]);
      }
      for (const key in window.SIM_PRELOADED_AVATAR_IMAGES || {}) {
          const image = window.SIM_PRELOADED_AVATAR_IMAGES[key];
          if (image && (image.naturalWidth > 0 || image.width > 0)) {
            this.textures.addImage(key, image);
          } else {
            console.error('Skipping invalid avatar image for key:', key);
            delete window.SIM_PRELOADED_AVATAR_IMAGES[key];
          }
      }

    }

    create() {
      mainScene = this;
      this.cameraFollowsCharacter = true;
      this.userAdjustedZoom = false;
      this.cameras.main.setBackgroundColor('#6f9f5f');

      const backdropGraphics = this.make.graphics({ x: 0, y: 0, add: false });
      backdropGraphics.fillStyle(0x84bc70, 1);
      backdropGraphics.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 92; i++) {
        const x = (i * 37) % 128;
        const y = (i * 61) % 128;
        const tint = i % 4 === 0 ? 0xb3d985 : (i % 4 === 1 ? 0x67a96d : (i % 4 === 2 ? 0xd2df94 : 0x63b4a2));
        backdropGraphics.fillStyle(tint, 0.22);
        backdropGraphics.fillRect(x, y, 2 + (i % 4), 1);
      }
      for (let i = 0; i < 16; i++) {
        const x = (i * 53 + 11) % 128;
        const y = (i * 29 + 17) % 128;
        backdropGraphics.fillStyle(i % 2 === 0 ? 0xffdc78 : 0xf08b7f, 0.44);
        backdropGraphics.fillCircle(x, y, 1);
      }
      backdropGraphics.generateTexture('grass_backdrop', 128, 128);
      this.terrainBackdrop = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'grass_backdrop');
      this.terrainBackdrop.setOrigin(0, 0);
      this.terrainBackdrop.setScrollFactor(0);
      this.terrainBackdrop.setDepth(-1000000);
      this.terrainBackdrop.setAlpha(1);
      
      if (this.game.renderer.type === Phaser.WEBGL) {
          // Phaser 4: Pipelines and old postFX removed.
          // Rely on CSS overlays for TiltShift and Bloom temporarily.
      }

      // Stop context menu from appearing on right click
      this.input.mouse.disableContextMenu();

      // Setup interaction camera controls
      this.input.on('pointermove', (pointer) => {
        if (!pointer.isDown) {
            this.handleHover(pointer);
            return;
        }
        if (pointer.button === 1 || pointer.button === 2) {
          this.disableCameraFollow();
          this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
          this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
        }
      });
      
      this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        adjustZoom(deltaY > 0 ? -0.1 : 0.1);
      });

      // Native Phaser pointer interaction mapping directly to world coords
      this.input.on('pointerdown', (pointer) => {
        if (pointer.button !== 0) return; // Only process left clicks
        if (Game.State.get().ui.mode === 'build') return;
        
        const gp = isoUnproject(pointer.worldX, pointer.worldY);
        const gx = Math.floor(gp.x);
        const gy = Math.floor(gp.y);

        // Check furniture hit
        const furn = hitTestFurniture(gx, gy);
        if (furn) {
          Game.Interaction.handleObjectClick('furniture', furn, pointer.event.clientX, pointer.event.clientY, pointer.event.shiftKey);
          return;
        }

        // Check NPC walker hit
        const npcHit = Game.Main.hitTestNPCWalker ? Game.Main.hitTestNPCWalker(gx, gy) : null;
        if (npcHit) {
          Game.Interaction.handleObjectClick('npc', npcHit, pointer.event.clientX, pointer.event.clientY, pointer.event.shiftKey);
          return;
        }

        // Check room hit
        const room = hitTestRoom(gx, gy);
        if (room) {
          Game.Interaction.handleObjectClick('room', room, pointer.event.clientX, pointer.event.clientY, pointer.event.shiftKey);
          return;
        }

        // Click on empty space — move character
        const char = Game.State.get().character;
        char.targetPosition = { x: gx, y: gy };
        this.showMoveMarker(gx, gy);
      });
      
      // Global Shadow Overlay
      this.shadowOverlay = this.add.rectangle(0, 0, 8000, 6000, 0x040822);
      this.shadowOverlay.setScrollFactor(0);
      this.shadowOverlay.setDepth(800000);
      this.shadowOverlay.setAlpha(0);

      // Particle Weather System
      const particleGraphics = this.make.graphics({x: 0, y: 0, add: false});
      particleGraphics.fillStyle(0xffffff, 1.0);
      particleGraphics.fillCircle(4, 4, 4);
      particleGraphics.generateTexture('particle', 8, 8);

      this.rainEmitter = this.add.particles(0, 0, 'particle', {
          x: { min: -1000, max: 2000 },
          y: -100,
          speedY: { min: 400, max: 600 },
          speedX: { min: -50, max: 50 },
          lifespan: 3000,
          quantity: 15,
          scale: { start: 0.1, end: 0.4 },
          alpha: { start: 0.4, end: 0 },
          tint: 0x88ccff,
          emitting: false
      });
      this.rainEmitter.setDepth(999990);
      
      this.snowEmitter = this.add.particles(0, 0, 'particle', {
          x: { min: -1000, max: 2000 },
          y: -100,
          speedY: { min: 50, max: 150 },
          speedX: { min: -100, max: 100 },
          lifespan: 8000,
          quantity: 5,
          scale: { start: 0.1, end: 0.5 },
          alpha: { start: 0.8, end: 0 },
          tint: 0xffffff,
          emitting: false
      });
      this.snowEmitter.setDepth(999990);

      this.input.keyboard.on('keydown-F3', () => {
          window.DEBUG_BOUNDS = !window.DEBUG_BOUNDS;
          document.dispatchEvent(new CustomEvent('notification', { detail: { message: window.DEBUG_BOUNDS ? '🔍 Debug Overlays: ON' : '🔍 Debug Overlays: OFF' }}));
      });

      debugGraphics = this.add.graphics();
      debugGraphics.setDepth(999999);

      // Draw static grid representing the house rooms/lot
      this.drawHouseGrid();
      this.cameras.main.setZoom(getDefaultCameraZoom(this.scale.width, this.scale.height));
      this._furnitureDirty = true;
      this._furnitureSyncElapsed = 0;
      this.centerCameraOnCharacter();
    }

    getCharacterCameraFocus() {
      const char = Game.State.get().character;
      if (!char || !char.position) return null;

      if (characterSprite) {
        const spriteX = Number.isFinite(characterSprite.x) ? characterSprite.x : null;
        const spriteY = Number.isFinite(characterSprite.y) ? characterSprite.y : null;
        if (spriteX === null || spriteY === null) return null;

        const originY = Number.isFinite(characterSprite.originY) ? characterSprite.originY : 0.9;
        const displayHeight = Number.isFinite(characterSprite.displayHeight) ? Math.abs(characterSprite.displayHeight) : null;
        const spriteOffset = displayHeight ? displayHeight * Math.max(0, originY - 0.5) : CAMERA_FOCUS_FALLBACK_OFFSET;
        const focusOffset = Number.isFinite(spriteOffset) && spriteOffset > 0 ? spriteOffset : CAMERA_FOCUS_FALLBACK_OFFSET;
        return {
          x: spriteX,
          y: spriteY - focusOffset
        };
      }

      const pt = isoProject(char.position.x, char.position.y, char.position.z || 0);
      return { x: pt.x, y: pt.y - 48 };
    }

    getCenteredCameraScroll(focus) {
      if (!focus || !Number.isFinite(focus.x) || !Number.isFinite(focus.y)) return null;
      const cam = this.cameras.main;
      const verticalBias = cam.height <= 620 ? 28 : 62;
      return {
        x: focus.x - (cam.width / 2),
        y: focus.y - (cam.height / 2) + verticalBias
      };
    }

    centerCameraOnCharacter(snap = true) {
      const focus = this.getCharacterCameraFocus();
      if (!focus) return;

      this.cameraFollowsCharacter = true;
      this.stopNativeCameraFollow();
      const cam = this.cameras.main;
      const target = this.getCenteredCameraScroll(focus);
      if (!target) return;

      if (snap) {
        cam.scrollX = target.x;
        cam.scrollY = target.y;
        return;
      }

      cam.scrollX = Phaser.Math.Linear(cam.scrollX, target.x, CAMERA_FOLLOW_LERP);
      cam.scrollY = Phaser.Math.Linear(cam.scrollY, target.y, CAMERA_FOLLOW_LERP);
    }

    updateCharacterCamera() {
      if (!this.cameraFollowsCharacter) return;
      this.centerCameraOnCharacter(false);
    }

    stopNativeCameraFollow() {
      const cam = this.cameras && this.cameras.main;
      if (cam && cam.stopFollow) cam.stopFollow();
      this._followingCharacter = false;
    }

    disableCameraFollow() {
      this.cameraFollowsCharacter = false;
      this.stopNativeCameraFollow();
    }

    getRoomColor(room, field, fallback) {
      const roomCfg = room && Game.Config.ROOMS[room.type];
      const raw = roomCfg && roomCfg[field];
      if (typeof raw === 'string' && raw.startsWith('#')) {
        return parseInt(raw.slice(1), 16);
      }
      return fallback;
    }

    drawHouseGrid() {
      const activeMap = Game.State.getActiveMap();
      if(!activeMap) return;
      const w = activeMap.lotWidth || 10;
      const h = activeMap.lotHeight || 10;
      
      if (this.gridSprites) {
        this.gridSprites.forEach(obj => obj.destroy());
      }
      this.gridSprites = [];
      this.frontWalls = []; // Track obscuring walls
      const activeFloor = Game.HomeGrowth && Game.HomeGrowth.getActiveFloor ? Game.HomeGrowth.getActiveFloor(activeMap) : (activeMap.activeFloor || 0);
      const visibleRooms = (activeMap.rooms || []).filter(room => (room.floor || 0) === activeFloor);

      const tileKeys = this.getRenderedGroundTileKeys(activeMap, w, h);
      const tileCoords = Array.from(tileKeys)
        .map(key => key.split(',').map(Number))
        .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));

      // Draw a grid of floor tiles
      for (const [x, y] of tileCoords) {
          const pt = isoProject(x, y);
          const tile = this.add.image(pt.x, pt.y, 'floor');
          this.gridSprites.push(tile);
          tile.setScale(0.25);
          tile.setOrigin(0.5, 0.75); 
          tile.depth = (x + y) * 10 - 5; // Floor is always at bottom

          // Check if this tile is inside a room
          let inRoom = false;
          let currentRoom = null;
          let isTopEdge = false;
          let isLeftEdge = false;
          let isRightEdge = false;
          let isBottomEdge = false;

          const roomsList = visibleRooms;
          for (const r of roomsList) {
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
              inRoom = true;
              currentRoom = r;
              if (y === r.y) isTopEdge = true;
              if (x === r.x) isLeftEdge = true;
              if (x === r.x + r.w - 1) isRightEdge = true;
              if (y === r.y + r.h - 1) isBottomEdge = true;
              break;
            }
          }

          if (inRoom) {
            tile.setTexture('planks');
            tile.setTint(this.getRoomColor(currentRoom, 'floorColor', 0xd6bc8e));
            tile.setAlpha(0.96);
            const wallTint = this.getRoomColor(currentRoom, 'wallColor', 0x8b7355);
            this.drawRoomTileWash(x, y, this.getRoomColor(currentRoom, 'floorColor', 0xd6bc8e), wallTint);
            
            // Draw isometric walls explicitly on the tile edges
            // Lift walls up by 24 pixels so they sit on the top surface of the floor tile rather than sinking into it
            if (isTopEdge) {
               const ptEdge = isoProject(x + 0.5, y);
               const wall = this.add.image(ptEdge.x, ptEdge.y - 24, 'wall_e');
               this.gridSprites.push(wall);
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.75); 
               wall.setTint(wallTint);
               wall.setAlpha(0.88);
               wall.depth = (x + y) * 10 - 1; 
            }
            if (isLeftEdge) {
               const ptEdge = isoProject(x, y + 0.5);
               const wall = this.add.image(ptEdge.x, ptEdge.y - 24, 'wall_n');
               this.gridSprites.push(wall);
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.75); 
               wall.setTint(wallTint);
               wall.setAlpha(0.88);
               wall.depth = (x + y) * 10 - 1; 
            }
            
            // Front walls (Occluding the room)
            if (isBottomEdge) {
               const ptF = isoProject(x + 0.5, y + 1); // Push to edge midpoint
               const wall = this.add.image(ptF.x, ptF.y - 24, 'wall_e');
               this.gridSprites.push(wall);
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.75); 
               wall.setTint(wallTint);
               wall.setAlpha(0.78);
               wall.depth = (x + y + 1) * 10 - 1; 
               this.frontWalls.push({ sprite: wall, room: currentRoom });
            }
            if (isRightEdge) {
               const ptF = isoProject(x + 1, y + 0.5); // Push to edge midpoint
               const wall = this.add.image(ptF.x, ptF.y - 24, 'wall_n');
               this.gridSprites.push(wall);
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.75); 
               wall.setTint(wallTint);
               wall.setAlpha(0.78);
               wall.depth = (x + 1 + y) * 10 - 1; 
               this.frontWalls.push({ sprite: wall, room: currentRoom });
            }
          } else {
            tile.setTexture('floor');
            tile.setTint(0xc9d5a4);
            tile.setAlpha(0.18);
            this.drawGroundTileWash(x, y, pickGroundTint(x, y, false));
          }
      }

      if (Game.State.get().ui.mode === 'build') this.drawRoomNameplates(visibleRooms);
      this.drawAmbientScenery(activeMap, w, h);
    }

    drawGroundTileWash(x, y, fillColor) {
      const p1 = isoProject(x, y);
      const p2 = isoProject(x + 1, y);
      const p3 = isoProject(x + 1, y + 1);
      const p4 = isoProject(x, y + 1);
      const center = isoProject(x + 0.5, y + 0.5);
      const wash = this.add.graphics();
      this.gridSprites.push(wash);
      wash.fillStyle(fillColor, 0.48);
      wash.lineStyle(1, 0x5f965c, 0.025);
      wash.beginPath();
      wash.moveTo(p1.x, p1.y);
      wash.lineTo(p2.x, p2.y);
      wash.lineTo(p3.x, p3.y);
      wash.lineTo(p4.x, p4.y);
      wash.closePath();
      wash.fillPath();
      wash.strokePath();

      const detailSeed = Math.abs((x * 19 + y * 23 + x * y * 3) % 11);
      if (detailSeed === 2 || detailSeed === 7) {
        wash.fillStyle(detailSeed === 2 ? 0xf4d46f : 0x4f8f62, 0.7);
        wash.fillRect(center.x - 7 + (x % 4), center.y - 2 + (y % 3), 2, 2);
        wash.fillRect(center.x + 4 - (y % 3), center.y + 2, 1, 2);
      }
      wash.depth = (x + y) * 10 - 4.4;
    }

    drawRoomNameplates(rooms) {
      for (const room of rooms || []) {
        const cfg = Game.Config.ROOMS[room.type] || { label: room.type, icon: '' };
        const pt = isoProject(room.x + room.w * 0.5, room.y + 0.08);
        const label = `${cfg.icon || ''} ${cfg.label}`.trim();
        const text = this.add.text(pt.x, pt.y - 12, label, {
          fontFamily: 'Nunito, sans-serif',
          fontSize: '10px',
          fontStyle: '700',
          color: '#fffaf0',
          backgroundColor: 'rgba(40, 104, 95, 0.82)',
          padding: { x: 5, y: 2 },
          stroke: '#28685f',
          strokeThickness: 1,
          shadow: { offsetX: 0, offsetY: 2, color: '#163f3a', blur: 2, fill: true }
        }).setOrigin(0.5, 0.5);
        text.setAlpha(0.86);
        text.setDepth((room.x + room.y) * 10 - 2.2);
        this.gridSprites.push(text);
      }
    }

    drawRoomTileWash(x, y, fillColor, strokeColor) {
      const p1 = isoProject(x, y);
      const p2 = isoProject(x + 1, y);
      const p3 = isoProject(x + 1, y + 1);
      const p4 = isoProject(x, y + 1);
      const wash = this.add.graphics();
      this.gridSprites.push(wash);
      wash.fillStyle(fillColor, 0.18);
      wash.lineStyle(1, strokeColor, 0.16);
      wash.beginPath();
      wash.moveTo(p1.x, p1.y);
      wash.lineTo(p2.x, p2.y);
      wash.lineTo(p3.x, p3.y);
      wash.lineTo(p4.x, p4.y);
      wash.closePath();
      wash.fillPath();
      wash.strokePath();
      wash.depth = (x + y) * 10 - 4.4;
    }

    getRenderedGroundTileKeys(activeMap, w, h) {
      const keys = new Set();
      const fullMapBudget = 1600;
      const contentMargin = activeMap === Game.State.get().maps.house ? 3 : 2;

      const addTile = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        keys.add(`${x},${y}`);
      };
      const addRect = (x, y, rectW, rectH, margin = 0) => {
        const minX = Math.max(0, Math.floor(x - margin));
        const minY = Math.max(0, Math.floor(y - margin));
        const maxX = Math.min(w, Math.ceil(x + rectW + margin));
        const maxY = Math.min(h, Math.ceil(y + rectH + margin));
        for (let ty = minY; ty < maxY; ty++) {
          for (let tx = minX; tx < maxX; tx++) {
            addTile(tx, ty);
          }
        }
      };

      if (w * h <= fullMapBudget) {
        addRect(0, 0, w, h, 0);
        return keys;
      }

      for (const room of activeMap.rooms || []) {
        if ((room.floor || 0) !== (activeMap.activeFloor || 0)) continue;
        addRect(room.x, room.y, room.w, room.h, contentMargin);
      }

      for (const furn of activeMap.furniture || []) {
        if ((furn.floor || 0) !== (activeMap.activeFloor || 0)) continue;
        const def = Game.Config.FURNITURE[furn.type] || {};
        const footprint = RendererHelpers.getFurnitureFootprint
          ? RendererHelpers.getFurnitureFootprint(furn, def)
          : { w: def.w || 1, h: def.h || 1 };
        addRect(furn.x, furn.y, footprint.w || 1, footprint.h || 1, contentMargin);
      }

      const state = Game.State.get();
      if (state.character && state.character.mapId && activeMap === Game.State.getActiveMap()) {
        const pos = state.character.position || { x: 0, y: 0 };
        addRect(pos.x, pos.y, 1, 1, contentMargin + 2);
      }

      if (keys.size === 0) addRect(0, 0, Math.min(w, 12), Math.min(h, 12), 0);
      return keys;
    }

    drawAmbientScenery(activeMap, w, h) {
      if (!activeMap || activeMap !== Game.State.get().maps.house) return;
      const props = [
        { key: 'hayStack', x: 0, y: 8, scale: 0.18 },
        { key: 'crate', x: 9, y: 8, scale: 0.17 },
        { key: 'wooden_fence_e', x: 0, y: 3, scale: 0.18 },
        { key: 'wooden_fence_n', x: 9, y: 10, scale: 0.18 },
      ];

      for (const prop of props) {
        if (!mainScene || !mainScene.textures.exists(prop.key)) continue;
        const pt = isoProject(prop.x, prop.y);
        const sprite = this.add.image(pt.x, pt.y, prop.key);
        this.gridSprites.push(sprite);
        sprite.setScale(prop.scale);
        sprite.setOrigin(0.5, 0.75);
        sprite.setAlpha(0.9);
        sprite.depth = (prop.x + prop.y) * 10 - 2;
      }
    }

    handleHover(pointer) {
      if (Game.State.get().ui.mode === 'build') {
         this.clearHover();
         return;
      }
      
      const gp = isoUnproject(pointer.worldX, pointer.worldY);
      const gx = Math.floor(gp.x);
      const gy = Math.floor(gp.y);

      const furn = hitTestFurniture(gx, gy);
      const npcHit = Game.Main.hitTestNPCWalker ? Game.Main.hitTestNPCWalker(gx, gy) : null;
      const room = hitTestRoom(gx, gy);
      
      if (furn) {
        this.setHoverEffect('furniture', furn, pointer.event.clientX, pointer.event.clientY);
      } else if (npcHit) {
        this.setHoverEffect('npc', npcHit, pointer.event.clientX, pointer.event.clientY);
      } else if (room) {
        this.setHoverEffect('room', room, pointer.event.clientX, pointer.event.clientY);
      } else {
        this.clearHover();
      }
    }

    setHoverEffect(type, obj, clientX, clientY) {
       if (this.hoveredObj === obj) {
           if (this.hoverTooltipEl && !this.hoverTooltipEl.classList.contains('hidden')) {
               this.hoverTooltipEl.style.left = clientX + 'px';
               this.hoverTooltipEl.style.top = clientY + 'px';
           }
           return;
       }
       
       this.clearHover();
       this.hoveredObj = obj;
       if (!this.hoverTooltipEl) this.hoverTooltipEl = document.getElementById('hover-tooltip');
       
       if (type === 'furniture') {
           const fc = Game.Config.FURNITURE[obj.type];
           const sprite = spriteMap.get(obj.id);
           if (sprite) {
               if (!sprite.glowFx && sprite.preFX && sprite.preFX.addGlow) {
                   sprite.glowFx = sprite.preFX.addGlow(0xffffff, 2, 0, false, 0.1, 10);
               }
               this.showHoverBadge(sprite.x, sprite.y, fc ? fc.icon : '');
           }
           
           if (this.hoverTooltipEl) {
               let text = '';
               if (obj.type === 'garden_plot') {
                   text = `🌱 Growth: ${Math.floor(obj.growth || 0)}%`;
                   if (obj.needsWater) text += ` (Needs Water)`;
               } else if (obj.type === 'pet_bowl') {
                   text = `🥣 Food: ${Math.floor(obj.foodLevel || 0)}%`;
               } else {
                   text = fc ? fc.label : 'Object';
               }
               text += ' - click actions, Shift+click queues';
               
               this.hoverTooltipEl.textContent = text;
               this.hoverTooltipEl.classList.remove('hidden');
               this.hoverTooltipEl.style.left = clientX + 'px';
               this.hoverTooltipEl.style.top = clientY + 'px';
           }
       } else if (type === 'npc') {
           if (this.hoverTooltipEl) {
               this.hoverTooltipEl.textContent = `👤 ${obj.name || 'Stranger'} - click to socialize`;
               this.hoverTooltipEl.classList.remove('hidden');
               this.hoverTooltipEl.style.left = clientX + 'px';
               this.hoverTooltipEl.style.top = clientY + 'px';
           }
       } else if (type === 'room') {
           if (this.hoverTooltipEl) {
               const rc = Game.Config.ROOMS[obj.type];
               this.hoverTooltipEl.textContent = `${rc ? `${rc.icon} ${rc.label}` : 'Room'} - click room actions`;
               this.hoverTooltipEl.classList.remove('hidden');
               this.hoverTooltipEl.style.left = clientX + 'px';
               this.hoverTooltipEl.style.top = clientY + 'px';
           }
       }
    }

    showHoverBadge(x, y, icon) {
       if (!icon) return;
       if (!this.hoverBadge) {
          this.hoverBadge = this.add.text(0, 0, icon, {
             fontSize: '24px',
             fontFamily: 'Nunito, sans-serif',
             color: '#ffffff',
             stroke: '#201915',
             strokeThickness: 4,
             shadow: { offsetX: 0, offsetY: 3, color: '#000000', blur: 5, fill: true }
          }).setOrigin(0.5, 1);
       }
       this.hoverBadge.setText(icon);
       this.hoverBadge.setPosition(x, y - 50);
       this.hoverBadge.setDepth(999998);
       this.hoverBadge.setVisible(true);
    }

    showMoveMarker(gx, gy) {
       const pt = isoProject(gx + 0.5, gy + 0.5);
       const marker = this.add.graphics({ x: pt.x, y: pt.y });
       marker.lineStyle(3, 0x45c0b3, 0.95);
       marker.fillStyle(0x45c0b3, 0.18);
       marker.beginPath();
       marker.moveTo(0, -14);
       marker.lineTo(28, 0);
       marker.lineTo(0, 14);
       marker.lineTo(-28, 0);
       marker.closePath();
       marker.fillPath();
       marker.strokePath();
       marker.setDepth(89998);
       marker.setScale(0.55);
       this.tweens.add({
          targets: marker,
          scale: 1.08,
          alpha: 0,
          duration: 650,
          ease: 'Sine.easeOut',
          onComplete: () => marker.destroy()
       });
    }

    clearHover() {
       if (this.hoveredObj) {
           const sprite = spriteMap.get(this.hoveredObj.id);
           if (sprite) {
               if (sprite.glowFx) {
                   sprite.preFX.remove(sprite.glowFx);
                   sprite.glowFx = null;
               }
           }
           this.hoveredObj = null;
       }
       if (this.hoverBadge) this.hoverBadge.setVisible(false);
       if (!this.hoverTooltipEl) this.hoverTooltipEl = document.getElementById('hover-tooltip');
       if (this.hoverTooltipEl) this.hoverTooltipEl.classList.add('hidden');
    }

    update(time, delta) {
      if (Game.Main.tick) {
         Game.Main.tick(time, delta);
      }

      // Sync State to Phaser Sprites
      const state = Game.State.get();
      if(!state) return;

      if (this.terrainBackdrop) {
        this.terrainBackdrop.setSize(this.scale.width, this.scale.height);
        this.terrainBackdrop.tilePositionX = this.cameras.main.scrollX * 0.08;
        this.terrainBackdrop.tilePositionY = this.cameras.main.scrollY * 0.08;
      }

      this.syncCharacter(state.character);
      this.updateCharacterCamera();
      this._furnitureSyncElapsed = (this._furnitureSyncElapsed || 0) + Math.max(0, Number(delta) || 0);
      if (this._furnitureDirty || this._furnitureSyncElapsed >= 100) {
        this.syncFurniture(Game.State.getActiveMap());
        this._furnitureDirty = false;
        this._furnitureSyncElapsed = 0;
      }
      this.syncBuildGhost(state.ui.buildGhost);
      this.syncPets(state.pets);
      this.syncFamilyMembers(Game.Family && Game.Family.getRenderableMembers ? Game.Family.getRenderableMembers() : []);
      this.updateCutawayWalls(state.character);
      if (this.syncNPCs) this.syncNPCs(state.npcWalkers);
      
      // Only re-sort depth when positions have changed (dirty flag set by movement/sync)
      if (this._depthDirty) {
        this.updateDepthSorting();
        this._depthDirty = false;
      }
      
      // Time of day: Color-graded lighting cycle
      const hour = state.time.hour || 0;
      let darkness = 0;
      let tintColor = 0x101b3b; // Soft indigo night (default)
      if (hour < 5 || hour > 20) {
          darkness = 0.42; tintColor = 0x101b3b; // Night: readable indigo
      } else if (hour >= 5 && hour < 7) {
          // Dawn: a light peach wash that preserves world colors.
          darkness = 0.24 - ((hour - 5)/2)*0.16;
          tintColor = 0xf2a36f;
      } else if (hour >= 7 && hour < 9) {
          darkness = 0.08 - ((hour - 7)/2)*0.08;
          tintColor = 0xffcf86;
      } else if (hour >= 9 && hour < 17) {
          darkness = 0; // Full daylight, no overlay
      } else if (hour >= 17 && hour < 19) {
          darkness = ((hour - 17)/2)*0.18;
          tintColor = 0xf08772;
      } else if (hour >= 19 && hour <= 20) {
          darkness = 0.18 + ((hour - 19))*0.22;
          tintColor = 0x33477f;
      }
      if (this.shadowOverlay) {
          this.shadowOverlay.setFillStyle(tintColor);
          this.shadowOverlay.setAlpha(Phaser.Math.Linear(this.shadowOverlay.alpha, darkness, 0.02));
      }

      // WebGL Bloom Post-Processing
      if (this.bloomFX) {
          // Phaser 4 migration: CSS filters handle this now.
      }

      // Particle Weather System
      if (this.rainEmitter && this.snowEmitter) {
          const w = state.time.weather || 'clear';
          if (w === 'rain' && !this.rainEmitter.emitting) this.rainEmitter.start();
          if (w !== 'rain' && this.rainEmitter.emitting) this.rainEmitter.stop();
          
          if (w === 'snow' && !this.snowEmitter.emitting) this.snowEmitter.start();
          if (w !== 'snow' && this.snowEmitter.emitting) this.snowEmitter.stop();
      }

      if (easyStar) easyStar.calculate();

      this.syncDebugBounds(state);
    }
    
    syncDebugBounds(state) {
        if (!debugGraphics) return;
        debugGraphics.clear();
        if (!window.DEBUG_BOUNDS) return;

        // Draw isometric polygon helper
        const drawIsoRect = (gx, gy, w, h, color) => {
            const p1 = isoProject(gx, gy);
            const p2 = isoProject(gx + w, gy);
            const p3 = isoProject(gx + w, gy + h);
            const p4 = isoProject(gx, gy + h);

            debugGraphics.lineStyle(2, color, 1.0);
            debugGraphics.beginPath();
            debugGraphics.moveTo(p1.x, p1.y);
            debugGraphics.lineTo(p2.x, p2.y);
            debugGraphics.lineTo(p3.x, p3.y);
            debugGraphics.lineTo(p4.x, p4.y);
            debugGraphics.closePath();
            debugGraphics.strokePath();
            
            // Faint fill
            debugGraphics.fillStyle(color, 0.2);
            debugGraphics.fillPath();
        };

        const activeMap = Game.State.getActiveMap();

        // Draw active room bounds
        if (activeMap && activeMap.rooms) {
            activeMap.rooms.forEach(r => {
                drawIsoRect(r.x, r.y, r.w, r.h, 0x666666);
            });
        }

        // Draw furniture bounds
        if (activeMap && activeMap.furniture) {
            activeMap.furniture.forEach(f => {
                const fc = Game.Config.FURNITURE[f.type];
                if (fc) {
                    drawIsoRect(f.x, f.y, fc.w, fc.h, 0xFF0000);
                }
            });
        }

        // Draw character bounds (1x1 box exactly centered on their map location)
        if (state.character && state.character.position) {
            drawIsoRect(state.character.position.x - 0.5, state.character.position.y - 0.5, 1, 1, 0x00FF00);
        }
    }
    
    updateCutawayWalls(character) {
        if (!this.frontWalls || !character || !character.position) return;
        
        const cx = Math.floor(character.position.x);
        const cy = Math.floor(character.position.y);
        
        for (const wallObj of this.frontWalls) {
            const r = wallObj.room;
            const inRoom = (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h);
            
            // If character is inside the room corresponding to this wall, fade it
            if (inRoom) {
               wallObj.sprite.setAlpha(0.25);
            } else {
               wallObj.sprite.setAlpha(1.0);
            }
        }
    }
    
    updateDepthSorting() {
        const renderables = [];
        
        // Character
        const charObj = Game.State.get().character;
        if (characterSprite) {
           renderables.push({
              sprite: characterSprite,
              rx: charObj.position.x, ry: charObj.position.y,
              rw: 1, rh: 1, type: 'char',
              z: charObj.position.z || 0
           });
        }
        
        // Pets
        const pets = Game.State.get().pets || [];
        for (const p of pets) {
            const sprite = this.petSpriteMap ? this.petSpriteMap.get(p.id) : null;
            if (sprite) {
               renderables.push({
                  sprite: sprite, id: p.id, rx: p.position.x, ry: p.position.y, rw: 1, rh: 1, type: 'pet', z: p.position.z || 0
               });
            }
        }
        
        // NPCs
        const activeWalkers = Game.State.get().npcWalkers || [];
        for (const n of activeWalkers) {
             const spriteGroup = npcSpriteMap ? npcSpriteMap.get(n.id) : null;
             if (spriteGroup && n.active) {
                 renderables.push({
                    sprite: spriteGroup, id: n.id, rx: n.position.x, ry: n.position.y, rw: 1, rh: 1, type: 'npc', z: 0
                 });
             }
        }
        
        // Furniture
        const activeMap = Game.State.getActiveMap();
        if (activeMap && activeMap.furniture) {
           const charPos = Game.State.get().character ? Game.State.get().character.position : {x:0, y:0};

           for (const furn of activeMap.furniture) {
              
              // Data-level Culling: Skip processing if extraordinarily far from active bounds (>30 tiles)
              if (Math.abs(furn.x - charPos.x) > 30 || Math.abs(furn.y - charPos.y) > 30) {
                  continue; // Do not instantiate or sync off-world chunks
              }

              let sprite = spriteMap.get(furn.id);
               if (!sprite) continue;
               const def = Game.Config.FURNITURE[furn.type];
               renderables.push({
                   sprite: sprite, id: furn.id,
                   rx: furn.x, ry: furn.y,
                   rw: def ? def.w : 1, rh: def ? def.h : 1, type: 'furn', z: 0
               });
           }
        }
        
        // True Spatial Bounds Sorting
        // For each item, we define its world bounds [xmin, xmax, ymin, ymax]
        for (const r of renderables) {
            // For character/pets, rx/ry are center points, but for this bounding box we consider their actual logical physical occupancy footprint.
            // If it's a character, we'll treat their bounded footprint as essentially a 0.5x0.5 box at their feet.
            if (r.type === 'char' || r.type === 'pet') {
                r.xmin = r.rx - 0.25;
                r.xmax = r.rx + 0.25;
                r.ymin = r.ry - 0.25;
                r.ymax = r.ry + 0.25;
            } else {
                r.xmin = r.rx;
                r.xmax = r.rx + r.rw;
                r.ymin = r.ry;
                r.ymax = r.ry + r.rh;
            }
        }
        
        renderables.sort((a, b) => {
           // Does A definitively occlude B? (A is BEHIND B)
           const aBehindB = (a.xmax <= b.xmin) || (a.ymax <= b.ymin);
           const bBehindA = (b.xmax <= a.xmin) || (b.ymax <= a.ymin);
           
           if (aBehindB && !bBehindA) return -1; // a comes first
           if (bBehindA && !aBehindB) return 1;  // b comes first
           
           // If they intersect logically (e.g. character standing next to or slightly over a furniture tile), fallback to strict center of mass mapping
           const aCx = (a.xmin + a.xmax) / 2;
           const aCy = (a.ymin + a.ymax) / 2;
           const bCx = (b.xmin + b.xmax) / 2;
           const bCy = (b.ymin + b.ymax) / 2;
           
           // Calculate the center-of-mass projected Z index 
           const aZ = aCx + aCy;
           const bZ = bCx + bCy;
           
           if (Math.abs(aZ - bZ) > 0.01) return aZ - bZ;
           
           // Tie breaker for perfectly overlapping centers (e.g. character perfectly inside)
           if (a.z !== b.z) return a.z - b.z;

           // Strict deterministic tie-breaker to prevent flicker!
           if (a.type !== b.type) return a.type > b.type ? 1 : -1;
           const aid = a.id || '';
           const bid = b.id || '';
           return aid.localeCompare(bid);
        });
        
        // Reapply unified depths safely
        for(let i=0; i<renderables.length; i++) {
            const r = renderables[i];
            
            // Wait, simply assigning 1000 + i entirely disconnects them from the walls!
            // We MUST anchor them in the wall's mathematical grid space to correctly occlude behind front walls and in front of back walls.
            // To do this, we compute the object's anchor Depth using its maximum grid reach, and then add a tiny fractional offset via `i` to guarantee the array's topological order is perfectly respected!
            
            // The object's baseline wall depth slot depends on its maximum projected grid edge.
            // For a 2x2 object at (1,1), its front edge is (3,3), so it must be allowed to draw in front of walls up to (3,3).
            const maxBoundInt = Math.floor(r.xmax - 0.01) + Math.floor(r.ymax - 0.01); 
            
            r.sprite.depth = (maxBoundInt * 10) + (i / renderables.length) * 8 + 1;
            
            if (r.type === 'char') {
               if (this.charLabel) this.charLabel.depth = r.sprite.depth + 0.1;
               if (this.charMarker) this.charMarker.depth = r.sprite.depth - 0.1;
               if (charShadowSprite) charShadowSprite.depth = r.sprite.depth - 0.2;
               if (this._avatarActivityGlow && this._avatarActivityGlowActive) {
                 this._avatarActivityGlow.depth = r.sprite.depth + 0.25;
               }
               if (this.thoughtBubbleContainer) this.thoughtBubbleContainer.depth = r.sprite.depth + 10;
            } else if (r.type === 'pet' && this.petShadowMap && this.petShadowMap.has(r.id)) {
               this.petShadowMap.get(r.id).depth = r.sprite.depth - 0.2;
            } else if (r.type === 'furn' && shadowMap && shadowMap.has(r.id)) {
               shadowMap.get(r.id).depth = r.sprite.depth - 0.2;
            }
        }
        
        // Authoritative Occlusion Fading (X-Ray Vision)
        // Uses the sorted renderable list so depths are guaranteed consistent
        const charR = renderables.find(r => r.type === 'char');
        if (charR) {
            for (const r of renderables) {
                if (r.type !== 'furn') continue;
                if (r.sprite.depth > charR.sprite.depth) {
                    const dist = Math.sqrt(Math.pow(r.rx + r.rw/2 - charR.rx, 2) + Math.pow(r.ry + r.rh/2 - charR.ry, 2));
                    if (dist < Math.max(r.rw, r.rh) + 0.5 && charR.rx <= r.rx + r.rw && charR.ry <= r.ry + r.rh) {
                        r.sprite.setAlpha(0.4);
                        if (shadowMap && shadowMap.has(r.id)) shadowMap.get(r.id).setAlpha(0.1);
                    } else {
                        r.sprite.setAlpha(1.0);
                        if (shadowMap && shadowMap.has(r.id)) shadowMap.get(r.id).setAlpha(0.25);
                    }
                } else {
                    r.sprite.setAlpha(1.0);
                    if (shadowMap && shadowMap.has(r.id)) shadowMap.get(r.id).setAlpha(0.25);
                }
            }
        }

        // Front Wall Occlusion Fading (Sims style)
        const charPosition = Game.State.get().character ? Game.State.get().character.position : null;
        if (this.frontWalls && charPosition) {
            for (const fw of this.frontWalls) {
                if (fw.room && 
                    charPosition.x >= fw.room.x && charPosition.x <= fw.room.x + fw.room.w && 
                    charPosition.y >= fw.room.y && charPosition.y <= fw.room.y + fw.room.h) {
                    fw.sprite.setAlpha(0.2); // Fade front walls when inside room
                } else {
                    fw.sprite.setAlpha(1.0);
                }
            }
        }
    }
    
    // ---- WebGL Pie Menu ----
    showPieMenu(x, y, centerTitle, items) {
       this.closePieMenu();
       this.clearHover();
       if (!this.uiContainer) {
          this.uiContainer = this.add.container(0, 0);
          this.uiContainer.setScrollFactor(0);
          this.uiContainer.setDepth(900000); // Sit above shadow map
       }
       
       const isCompactWheel = this.scale.width < 640 || this.scale.height < 640;
       const radius = Math.min(isCompactWheel ? 88 : 108, 78 + Math.max(0, items.length - 4) * 6);
       const buttonRadius = isCompactWheel ? 34 : 38;
       const menuReach = radius + buttonRadius;
       const clampSafe = (value, min, max, fallback) => max >= min ? Phaser.Math.Clamp(value, min, max) : fallback;

       if (isCompactWheel && typeof document !== 'undefined') {
          const topHudBottom = ['.hud-left', '.hud-center', '.hud-right']
             .map(sel => document.querySelector(sel)?.getBoundingClientRect().bottom || 0)
             .filter(Number.isFinite)
             .reduce((max, value) => Math.max(max, value), 0);
          const bottomHudTop = ['.needs-section-rpg', '.action-panel']
             .map(sel => document.querySelector(sel)?.getBoundingClientRect().top || this.scale.height)
             .filter(value => Number.isFinite(value) && value > 0)
             .reduce((min, value) => Math.min(min, value), this.scale.height);
          const minY = topHudBottom + menuReach + 8;
          const maxY = Math.max(minY, bottomHudTop - menuReach - 18);
          x = clampSafe(x, menuReach + 12, this.scale.width - menuReach - 12, this.scale.width / 2);
          y = clampSafe(y, minY, maxY, Math.min(this.scale.height * 0.38, maxY));
       } else {
          const inset = menuReach + 18;
          x = clampSafe(x, inset, this.scale.width - inset, this.scale.width / 2);
          y = clampSafe(y, inset, this.scale.height - inset, this.scale.height / 2);
       }

       this.pieMenu = this.add.container(x, y);
       this.uiContainer.add(this.pieMenu);
       
       const blocker = this.add.rectangle(0, 0, 8000, 8000, 0x000000, 0).setInteractive();
       blocker.on('pointerdown', () => this.closePieMenu());
       
       const halo = this.add.circle(0, 0, radius + buttonRadius + 16, 0x3f9185, 0.12);
       halo.setStrokeStyle(2, 0xf2bd58, 0.5);
       const ring = this.add.circle(0, 0, radius, 0x000000, 0);
       ring.setStrokeStyle(2, 0x3f9185, 0.65);
       const bg = this.add.circle(0, 0, 28, 0xfffaf0, 0.98).setInteractive();
       bg.setStrokeStyle(2, 0xf2bd58, 0.95);
       const cancel = this.add.text(0, 0, centerTitle || '✕', {
          fontSize: '20px',
          color: '#28685f',
          stroke: '#fffaf0',
          strokeThickness: 1
       }).setOrigin(0.5);
       this.pieMenu.add([blocker, halo, ring, bg, cancel]);
       
       bg.on('pointerdown', () => this.closePieMenu());
       
       const angleStep = (2 * Math.PI) / Math.max(items.length, 1);
       const startAngle = -Math.PI / 2;
       
       items.forEach((item, i) => {
          const angle = startAngle + i * angleStep;
          const ix = Math.cos(angle) * radius;
          const iy = Math.sin(angle) * radius;
          
          const btnBg = this.add.circle(ix, iy, buttonRadius, item.locked ? 0xaab4ad : 0x3f9185, 0.98).setInteractive({ useHandCursor: true });
          btnBg.setStrokeStyle(2, item.locked ? 0xd3d9d4 : 0xfffaf0, item.locked ? 0.75 : 0.95);
          const btnIcon = this.add.text(ix, iy - 10, item.locked ? '🔒' : item.icon, {
             fontSize: isCompactWheel ? '22px' : '24px',
             stroke: '#fffaf0',
             strokeThickness: 2
          }).setOrigin(0.5);
          const btnText = this.add.text(ix, iy + 20, item.label, {
             fontFamily: 'Nunito, sans-serif',
             fontSize: isCompactWheel ? '10px' : '12px',
             color: '#263b3b',
             backgroundColor: '#fffaf0f2',
             padding: { x: 5, y: 3 },
             align: 'center',
             wordWrap: { width: isCompactWheel ? 76 : 96 },
             stroke: '#fffaf0',
             strokeThickness: 1
          }).setOrigin(0.5);

          btnBg.on('pointerover', () => {
             btnBg.setFillStyle(0x28685f, 1);
             btnBg.setStrokeStyle(3, 0xf2bd58, 1);
             btnIcon.setScale(1.08);
             btnText.setScale(1.04);
          });
          btnBg.on('pointerout', () => {
             btnBg.setFillStyle(item.locked ? 0xaab4ad : 0x3f9185, 0.98);
             btnBg.setStrokeStyle(2, item.locked ? 0xd3d9d4 : 0xfffaf0, item.locked ? 0.75 : 0.95);
             btnIcon.setScale(1);
             btnText.setScale(1);
          });
          
          btnBg.on('pointerdown', (p) => {
             if (item.locked) {
                Game.UI.showNotification(`❌ ${item.lockReason}`);
             } else {
                item.callback(p.event);
             }
             this.closePieMenu(); // Auto close on interact
          });
          
          this.pieMenu.add([btnBg, btnIcon, btnText]);
          
          btnBg.setScale(0); btnIcon.setScale(0); btnText.setScale(0);
          this.tweens.add({ targets: [btnBg, btnIcon, btnText], scale: 1, duration: 250, delay: i * 40, ease: 'Back.easeOut' });
       });
    }

    closePieMenu() {
       if (this.pieMenu) {
          this.pieMenu.destroy();
          this.pieMenu = null;
       }
    }

    syncBuildGhost(ghost) {
      if (!ghost) {
        if (buildGhostSprite) buildGhostSprite.setVisible(false);
        if (buildGhostFootprint) buildGhostFootprint.clear();
        return;
      }
      
      if (!buildGhostSprite) {
        buildGhostSprite = this.add.image(0, 0, 'crate');
        buildGhostSprite.setScale(0.25);
        buildGhostSprite.setOrigin(0.5, 0.75);
      }
      if (!buildGhostFootprint) {
        buildGhostFootprint = this.add.graphics();
      }
      
      buildGhostSprite.setVisible(true);

      if (ghost.type === 'furniture' || ghost.type === 'stored') {
         const textureKey = this.getTextureForFurn(ghost.key);
         const visual = this.getFurnitureVisual(ghost.key, textureKey);
         buildGhostSprite.setTexture(textureKey);
         buildGhostSprite.setScale(visual.scale);
         buildGhostSprite.setOrigin(0.5, visual.originY);
      } else {
         buildGhostSprite.setTexture('planks'); // Minimal indicator for rooms
         buildGhostSprite.setScale(0.25);
         buildGhostSprite.setOrigin(0.5, 0.75);
      }
      
      const footprintW = ghost.rotated ? ghost.h : ghost.w;
      const footprintH = ghost.rotated ? ghost.w : ghost.h;
      const pt = isoProject(ghost.x + (footprintW > 1 ? footprintW/2 - 0.5 : 0), ghost.y + (footprintH > 1 ? footprintH/2 - 0.5 : 0));
      buildGhostSprite.setPosition(pt.x, pt.y);
      buildGhostSprite.depth = 90000; // Float high
      
      // Validity check
      let isValid = true;
      if (ghost.type === 'room') {
         isValid = Game.House.isAreaFree(ghost.x, ghost.y, ghost.w, ghost.h);
      } else {
         const room = Game.House.getRoomAt(ghost.x, ghost.y);
         if (!room) {
            isValid = false;
         } else {
            const furnCfg = Game.Config.FURNITURE[ghost.key];
            if (furnCfg.room !== '*' && furnCfg.room !== room.type) isValid = false;
            
            if (ghost.x < room.x || ghost.y < room.y || ghost.x + furnCfg.w > room.x + room.w || ghost.y + furnCfg.h > room.y + room.h) {
                isValid = false;
            } else {
                const activeMap = Game.State.getActiveMap();
                for (const furn of activeMap.furniture) {
                    if (furn.roomId !== room.id) continue;
                    if ((furn.floor || 0) !== (room.floor || 0)) continue;
                    const fc = Game.Config.FURNITURE[furn.type];
                    if (!fc) continue;
                    if (ghost.x < furn.x + fc.w && ghost.x + furnCfg.w > furn.x && ghost.y < furn.y + fc.h && ghost.y + furnCfg.h > furn.y) {
                         isValid = false; break;
                    }
                }
            }
         }
      }
      
      const ghostColor = isValid ? 0x62c98c : 0xe96f68;
      const p1 = isoProject(ghost.x, ghost.y);
      const p2 = isoProject(ghost.x + footprintW, ghost.y);
      const p3 = isoProject(ghost.x + footprintW, ghost.y + footprintH);
      const p4 = isoProject(ghost.x, ghost.y + footprintH);

      buildGhostFootprint.clear();
      buildGhostFootprint.fillStyle(ghostColor, isValid ? 0.16 : 0.2);
      buildGhostFootprint.lineStyle(3, ghostColor, 0.9);
      buildGhostFootprint.beginPath();
      buildGhostFootprint.moveTo(p1.x, p1.y);
      buildGhostFootprint.lineTo(p2.x, p2.y);
      buildGhostFootprint.lineTo(p3.x, p3.y);
      buildGhostFootprint.lineTo(p4.x, p4.y);
      buildGhostFootprint.closePath();
      buildGhostFootprint.fillPath();
      buildGhostFootprint.strokePath();
      buildGhostFootprint.depth = 89999;

      buildGhostSprite.setAlpha(isValid ? 0.72 : 0.58);
      buildGhostSprite.setTint(ghostColor);
      buildGhostSprite.setFlipX(!!ghost.rotated);
    }

    resolveAvatarFacing(charObj) {
      if (!charObj || !charObj.position || !charObj.targetPosition) {
        return { direction: avatarDirection || 'S', flipX: avatarFlipX || false };
      }

      const dx = charObj.targetPosition.x - charObj.position.x;
      const dy = charObj.targetPosition.y - charObj.position.y;

      if (dx > 0.1 && Math.abs(dy) < 0.1) return { direction: 'SE', flipX: false };
      if (dx < -0.1 && Math.abs(dy) < 0.1) return { direction: 'NE', flipX: true };
      if (Math.abs(dx) < 0.1 && dy > 0.1) return { direction: 'SE', flipX: true };
      if (Math.abs(dx) < 0.1 && dy < -0.1) return { direction: 'NE', flipX: false };
      if (dx > 0.1 && dy > 0.1) return { direction: 'S', flipX: false };
      if (dx < -0.1 && dy < -0.1) return { direction: 'N', flipX: false };
      if (dx > 0.1 && dy < -0.1) return { direction: 'E', flipX: false };
      if (dx < -0.1 && dy > 0.1) return { direction: 'E', flipX: true };
      return { direction: avatarDirection || 'S', flipX: avatarFlipX || false };
    }

    resolveAvatarDirection(charObj) {
      return this.resolveAvatarFacing(charObj).direction;
    }

    syncCharacter(charObj) {
      if(!charObj || !charObj.position) return;
      
      // Mark depth dirty whenever character truly moves
      if (!this._lastCharPos || this._lastCharPos.x !== charObj.position.x || this._lastCharPos.y !== charObj.position.y || this._lastCharPos.z !== charObj.position.z) {
          this._depthDirty = true;
          this._lastCharPos = { ...charObj.position };
      }
      
      let formKey = (charObj.form || 'online_witch') + '_iso';
      if (formKey === 'human_iso' || formKey === 'nano_hero_iso') formKey = 'online_witch_iso'; // Map legacy forms to the Witch
      const ptActual = isoProject(charObj.position.x, charObj.position.y, charObj.position.z || 0);
      const pt = ptActual; // Legacy support bridging
      const wantsAvatar = !!(Game.AvatarRenderer && Game.Appearance && charObj.appearance);
      let useAvatar = false;
      
      if (wantsAvatar) {
        const avatarFacing = this.resolveAvatarFacing(charObj);
        const previousAvatarContainer = avatarContainer;
        avatarDirection = avatarFacing.direction;
        avatarFlipX = avatarFacing.flipX;
        if (!avatarRenderer) avatarRenderer = Game.AvatarRenderer.create(this);
        avatarContainer = Game.AvatarRenderer.sync(avatarRenderer, charObj, ptActual.x, ptActual.y, avatarDirection);
        useAvatar = !!avatarContainer;

        if (useAvatar) {
          if (avatarContainer.setScale) avatarContainer.setScale(avatarFlipX ? -1 : 1, 1);

          if (characterSprite && characterSprite !== avatarContainer && characterSprite.destroy) {
            characterSprite.destroy();
          }
          characterSprite = avatarContainer;
        } else if (characterSprite && characterSprite === previousAvatarContainer) {
          characterSprite = null;
          this._followingCharacter = false;
        }
      } else if (avatarContainer && characterSprite === avatarContainer) {
        if (avatarRenderer) Game.AvatarRenderer.destroy(avatarRenderer);
        avatarContainer = null;
        characterSprite = null;
        this._followingCharacter = false;
      }

      if (useAvatar) {
        if (!this.charMarker) {
          this.charMarker = this.add.circle(0, 0, 12, 0x4488FF, 0.8);
          this.charMarker.setStrokeStyle(2, 0xFFFFFF, 1);
        }
        if (!charShadowSprite) {
          const shadowKey = avatarRenderer.layers[0] ? avatarRenderer.layers[0].textureKey : 'online_witch_iso';
          charShadowSprite = this.add.image(0, 0, shadowKey);
          charShadowSprite.setOrigin(0.5, 0.9);
          charShadowSprite.setTint(0x000000).setTintMode(Phaser.TintModes.FILL);
          charShadowSprite.setAlpha(0.25);
        }
        if (!this.charLabel) {
          this.charLabel = this.add.text(0, 0, charObj.name || '🧑 You', {
            fontSize: '11px',
            fontFamily: 'Nunito, sans-serif',
            color: '#fffdf5',
            backgroundColor: '#173f3acc',
            padding: { x: 4, y: 2 },
            strokeThickness: 0,
            align: 'center'
          }).setOrigin(0.5, 1);
        }
      } else {
      if(!characterSprite) {
        if (!this.charMarker) {
          this.charMarker = this.add.circle(0, 0, 12, 0x4488FF, 0.8);
          this.charMarker.setStrokeStyle(2, 0xFFFFFF, 1);
        }
        
        if (!charShadowSprite) charShadowSprite = this.add.image(0, 0, formKey);
        else charShadowSprite.setTexture(formKey);
        charShadowSprite.setOrigin(0.5, 0.9);
        charShadowSprite.setTint(0x000000).setTintMode(Phaser.TintModes.FILL);
        charShadowSprite.setAlpha(0.25);

        characterSprite = this.add.image(0, 0, formKey);
        characterSprite.setScale(1.0); // SVG is perfectly sized
        characterSprite.setOrigin(0.5, 0.9); // Anchor feet to grid position
        characterSprite.clearTint();
        
        // Name tag
        this.charLabel = this.add.text(0, 0, charObj.name || '🧑 You', {
          fontSize: '11px',
          fontFamily: 'Nunito, sans-serif',
          color: '#fffdf5',
          backgroundColor: '#173f3acc',
          padding: { x: 4, y: 2 },
          strokeThickness: 0,
          align: 'center'
        }).setOrigin(0.5, 1);
        
        // Breathing animation tween
        this.tweens.add({
           targets: characterSprite,
           scaleY: '+=0.03',
           yoyo: true,
           repeat: -1,
           duration: 1200,
           ease: 'Sine.easeInOut'
        });
      }
      characterSprite.setPosition(ptActual.x, ptActual.y);
      characterSprite.setTexture(formKey);
      
      // Handle scaling adjustments if they switched between SVGs and old assets.
      if (formKey === 'online_witch_iso' || formKey.startsWith('online_witch_')) {
        characterSprite.setScale(1.0); // online pixel art sprite needs to be slightly larger
        characterSprite.setOrigin(0.5, 0.85); // Adjust origin to sit nicely on the tile center
      } else if (formKey === 'character') {
        characterSprite.setScale(0.25); // match world scale
      } else if (formKey === 'new_iso_human') {
        characterSprite.setScale(0.55); // The AI image was cropped tightly, need slightly larger scale
        characterSprite.setOrigin(0.5, 0.7); // Adjust origin to sit nicely on the tile center
      } else {
        characterSprite.setScale(1.0, 0.85); // SVG squash
      }
      
      // Face movement direction
      if (charObj.targetPosition) {
         if (formKey === 'online_witch_iso' || formKey.startsWith('online_witch_')) {
             const dx = charObj.targetPosition.x - charObj.position.x;
             const dy = charObj.targetPosition.y - charObj.position.y;
             
             let newDir = 'S';
             let flip = false;
             
             if (dx > 0.1 && Math.abs(dy) < 0.1) { newDir = 'SE'; }
             else if (dx < -0.1 && Math.abs(dy) < 0.1) { newDir = 'NE'; flip = true; } // NW
             else if (Math.abs(dx) < 0.1 && dy > 0.1) { newDir = 'SE'; flip = true; } // SW
             else if (Math.abs(dx) < 0.1 && dy < -0.1) { newDir = 'NE'; }
             else if (dx > 0.1 && dy > 0.1) { newDir = 'S'; }
             else if (dx < -0.1 && dy < -0.1) { newDir = 'N'; }
             else if (dx > 0.1 && dy < -0.1) { newDir = 'E'; }
             else if (dx < -0.1 && dy > 0.1) { newDir = 'E'; flip = true; } // W
             
             characterSprite.setFlipX(flip);
             formKey = `online_witch_${newDir}_iso`;
             characterSprite.setTexture(formKey);
         } else {
             const ptTarg = isoProject(charObj.targetPosition.x, charObj.targetPosition.y);
             if (Math.abs(ptTarg.x - pt.x) > 0.5) {
                characterSprite.setFlipX(ptTarg.x < pt.x);
             }
         }
      }

      if (charShadowSprite) {
          const sp = this.getShadowParams();
          charShadowSprite.setPosition(ptActual.x + 8, ptActual.y - 2);
          charShadowSprite.setTexture(formKey);
          charShadowSprite.setFlipX(characterSprite.flipX);
          charShadowSprite.setScale(characterSprite.scaleX * 1.0, characterSprite.scaleY * -sp.stretch);
          charShadowSprite.setAngle(sp.angle);
          charShadowSprite.setAlpha(sp.alpha);
      }
      
      // Optional: don't tint the SVG entirely unless wanted, or maybe just tint
      // But Since SVGs are colored we might want to just set a light tint or no tint at all.
      // Let's remove the global tint for the new SVG characters so they retain their colors!
      characterSprite.clearTint();
      }

      if (useAvatar && charShadowSprite) {
          const sp = this.getShadowParams();
          const shadowKey = avatarRenderer && avatarRenderer.layers[0] ? avatarRenderer.layers[0].textureKey : null;
          charShadowSprite.setPosition(ptActual.x + 8, ptActual.y - 2);
          if (shadowKey) charShadowSprite.setTexture(shadowKey);
          charShadowSprite.setFlipX(avatarFlipX);
          charShadowSprite.setScale(Math.abs(characterSprite.scaleX || 1) * 1.0, Math.abs(characterSprite.scaleY || 1) * -sp.stretch);
          charShadowSprite.setAngle(sp.angle);
          charShadowSprite.setAlpha(sp.alpha);
      }
      
      // Let updateDepthSorting handle the strict depth index. Pre-initialize here to prevent null depths.
      const depthBase = (charObj.position.x + charObj.position.y) * 10 + 5;
      characterSprite.depth = depthBase;
      
      if (this.charMarker) {
        this.charMarker.setPosition(pt.x, pt.y + 4);
        this.charMarker.depth = depthBase - 0.1;
      }
      if (this.charLabel) {
        this.charLabel.setText(charObj.name || '🧑 You');
        this.charLabel.setPosition(pt.x, pt.y - 78);
        this.charLabel.depth = depthBase + 1;
      }

      // Thought Bubble Integration
      if (!this.thoughtBubbleContainer) {
         this.thoughtLabel = this.add.text(0, 0, '', {
            fontSize: '18px',
            backgroundColor: '#ffffffdd',
            padding: { x: 6, y: 4 },
            color: '#000000',
            stroke: '#dddddd',
            strokeThickness: 2
         }).setOrigin(0.5, 1);
         this.thoughtBubbleContainer = this.add.container(0, 0, [this.thoughtLabel]);
         
         this.tweens.add({
           targets: this.thoughtLabel, // Tween the child offset!
           y: -8,
           duration: 1200,
           yoyo: true,
           repeat: -1,
           ease: 'Sine.easeInOut'
         });
      }

      // Check for urgent needs
      let urgentNeed = null;
      let urgentIcon = '';
      if (charObj.needs) {
          if (charObj.needs.hunger < 20) { urgentNeed = 'hunger'; urgentIcon = '💢 🍔'; }
          else if (charObj.needs.energy < 20) { urgentNeed = 'energy'; urgentIcon = '💢 💤'; }
          else if (charObj.needs.bladder < 20) { urgentNeed = 'bladder'; urgentIcon = '💢 🚽'; }
          else if (charObj.needs.hygiene < 20) { urgentNeed = 'hygiene'; urgentIcon = '💢 🚿'; }
      }

      if (urgentNeed) {
         this.thoughtLabel.setText(urgentIcon);
         this.thoughtLabel.setColor('#ff0000');
         this.thoughtLabel.setStroke('#ffffff', 3);
         this.thoughtLabel.setFontSize('26px');
         
         this.thoughtBubbleContainer.setPosition(pt.x, pt.y - 80);
         this.thoughtBubbleContainer.depth = depthBase + 10;
         this.thoughtBubbleContainer.setVisible(true);
      } else {
         // Reset styling
         this.thoughtLabel.setColor('#333333');
         this.thoughtLabel.setStroke('#ffffff', 4);
         this.thoughtLabel.setFontSize('20px');
         
         const thought = Game.Autonomy && Game.Autonomy.getThought();
         if (thought && !charObj.currentActivity) {
            this.thoughtLabel.setText(`💭 ${thought.activityIcon}`);
            this.thoughtBubbleContainer.setPosition(pt.x, pt.y - 80);
            this.thoughtBubbleContainer.depth = depthBase + 10;
            this.thoughtBubbleContainer.setVisible(true);
          } else {
             this.thoughtBubbleContainer.setVisible(false);
          }
       }
       
       this.syncActivityGlow(charObj, depthBase);
    }

    syncActivityGlow(charObj, depthBase) {
      const active = !!(charObj && charObj.currentActivity);
      const canUsePreFx = !!(characterSprite && characterSprite.preFX && characterSprite.preFX.addGlow && this.game.renderer.type === Phaser.WEBGL);

      if (canUsePreFx) {
        if (this._avatarActivityGlow) this._avatarActivityGlow.setVisible(false);
        this._avatarActivityGlowActive = false;
        if (active) {
          if (!characterSprite._activityGlow) {
            characterSprite._activityGlow = characterSprite.preFX.addGlow(0x88CCFF, 3, 0, false, 0.15, 12);
            this.tweens.add({
              targets: characterSprite._activityGlow,
              outerStrength: 6,
              yoyo: true,
              repeat: -1,
              duration: 1500,
              ease: 'Sine.easeInOut'
            });
          }
        } else if (characterSprite._activityGlow) {
          characterSprite.preFX.remove(characterSprite._activityGlow);
          characterSprite._activityGlow = null;
        }
        this._legacyActivityGlowActive = active;
        return;
      }

      if (characterSprite && characterSprite._activityGlow && characterSprite.preFX) {
        characterSprite.preFX.remove(characterSprite._activityGlow);
        characterSprite._activityGlow = null;
      }
      this._legacyActivityGlowActive = false;

      if (!active) {
        if (this._avatarActivityGlow) this._avatarActivityGlow.setVisible(false);
        this._avatarActivityGlowActive = false;
        return;
      }

      if (!this._avatarActivityGlow) {
        this._avatarActivityGlow = this.add.circle(0, 0, 24, 0x88CCFF, 0.22);
        this._avatarActivityGlow.setStrokeStyle(2, 0xFFFFFF, 0.18);
        if (this._avatarActivityGlow.setBlendMode) this._avatarActivityGlow.setBlendMode('ADD');
        this.tweens.add({
          targets: this._avatarActivityGlow,
          scale: 1.25,
          alpha: 0.1,
          yoyo: true,
          repeat: -1,
          duration: 1500,
          ease: 'Sine.easeInOut'
        });
      }

      this._avatarActivityGlow.setVisible(true);
      this._avatarActivityGlow.setPosition(characterSprite.x, characterSprite.y - 26);
      const glowDepthBase = Number.isFinite(characterSprite.depth) ? characterSprite.depth : depthBase;
      this._avatarActivityGlow.setDepth(glowDepthBase + 0.25);
      this._avatarActivityGlowActive = true;
    }

    getShadowParams() {
        const state = Game.State.get();
        const hour = (state && state.time) ? (state.time.hour || 12) : 12;
        // Sun angle simulation: low sun = long shadows, noon = short shadows
        let angle, stretch, alpha;
        if (hour < 6 || hour > 20) {
            // Night - minimal shadows
            angle = 0; stretch = 0.15; alpha = 0.1;
        } else if (hour < 10) {
            // Morning - long shadows to the west (negative angle)
            const t = (hour - 6) / 4; // 0..1
            angle = -30 + t * 15; // -30 to -15
            stretch = 0.7 - t * 0.3; // 0.7 to 0.4
            alpha = 0.15 + t * 0.1; // 0.15 to 0.25
        } else if (hour <= 14) {
            // Midday - short shadows directly below
            angle = -15;
            stretch = 0.4;
            alpha = 0.25;
        } else if (hour <= 18) {
            // Afternoon - long shadows to the east (positive angle)
            const t = (hour - 14) / 4; // 0..1
            angle = -15 + t * 30; // -15 to 15
            stretch = 0.4 + t * 0.3; // 0.4 to 0.7
            alpha = 0.25 - t * 0.05; // 0.25 to 0.20
        } else {
            // Dusk
            angle = 15; stretch = 0.6; alpha = 0.15;
        }
        return { angle, stretch, alpha };
    }

    textureExists(key) {
      if (!key) return false;
      if (mainScene && mainScene.textures && mainScene.textures.exists && mainScene.textures.exists(key)) return true;
      return !!(window.SIM_ASSETS && window.SIM_ASSETS[key]);
    }

    firstExisting(keys, fallback) {
      return keys.find((key) => this.textureExists(key)) || fallback;
    }

    orientedTexture(furnState, eastKey, northKey, fallback) {
      const preferred = furnState && furnState.rotated ? northKey : eastKey;
      return this.firstExisting([preferred, eastKey, northKey], fallback);
    }

    getFurnitureVisual(type, textureKey) {
      let scale = 0.21;
      let originY = 0.76;

      if (textureKey && textureKey.startsWith('generated_')) {
        const compactGenerated = new Set([
          'generated_fountain',
          'generated_hot_tub',
          'generated_treadmill',
        ]);
        return {
          scale: compactGenerated.has(textureKey) ? 0.30 : 0.34,
          originY: 0.94,
        };
      }

      if (textureKey === 'grandPiano_se') return { scale: 0.115, originY: 0.76 };
      if (textureKey === 'bonsaiShrine_se') return { scale: 0.105, originY: 0.78 };
      if (textureKey === 'map_portal' || textureKey === 'subway_turnstile') return { scale: 0.25, originY: 0.82 };

      if (type.includes('bed') || type === 'hammock' || type === 'crib') scale = 0.18;
      if (type.includes('tv') || type.includes('bookcase') || type.includes('shelf') || type === 'wardrobe' || type === 'display_case' || type === 'arcade_machine') scale = 0.17;
      if (type.includes('sofa') || type.includes('chair') || type === 'recliner' || type === 'toilet' || type === 'vanity') scale = 0.18;
      if (type.includes('table') || type.includes('desk') || type.includes('counter') || type === 'garden_bench' || type === 'workbench') scale = 0.18;
      if (type.includes('stove') || type.includes('sink') || type.includes('fridge') || type.includes('microwave') || type.includes('espresso') || type.includes('dishwasher') || type === 'bbq_grill') scale = 0.18;
      if (type === 'lamp' || type === 'candle_stand' || type === 'fireplace') scale = 0.17;
      if (type === 'garden_plot' || type === 'rug' || type === 'yoga_mat' || type === 'cushion') {
        scale = 0.16;
        originY = 0.72;
      }
      if (type === 'indoor_tree' || type === 'plant' || type === 'potted_flower') scale = 0.16;
      if (type === 'fountain' || type === 'weights') scale = 0.16;
      if (textureKey === 'crate' || textureKey === 'barrel' || textureKey === 'chestClosed') scale = Math.min(scale, 0.18);
      if (textureKey === 'floorCarpet') {
        scale = 0.18;
        originY = 0.72;
      }

      return { scale, originY };
    }

    getTextureForFurn(type, furnState) {
      const config = Game.Config.FURNITURE[type] || {};
      const generatedTextures = {
        basic_bed: 'generated_bed',
        good_bed: 'generated_bed',
        luxury_bed: 'generated_bed',
        basic_sofa: 'generated_sofa',
        nice_sofa: 'generated_sofa',
        basic_stove: 'generated_stove',
        good_stove: 'generated_stove',
        smart_stove: 'generated_stove',
        fridge: 'generated_fridge',
        smart_fridge: 'generated_fridge',
        toilet: 'generated_toilet',
        basic_shower: 'generated_shower',
        bathtub: 'generated_hot_tub',
        hot_tub: 'generated_hot_tub',
        plant: 'generated_potted_flower',
        potted_flower: 'generated_potted_flower',
        indoor_tree: 'generated_indoor_tree',
        computer: 'generated_computer_desk',
        good_computer: 'generated_computer_desk',
        arcade_machine: 'generated_arcade',
        treadmill: 'generated_treadmill',
        fountain: 'generated_fountain',
        crib: 'generated_crib',
        workbench: 'generated_workbench',
        telescope: 'generated_telescope',
        sink_k: 'generated_kitchen_sink',
        microwave: 'generated_microwave',
        espresso: 'generated_espresso',
        dishwasher: 'generated_dishwasher',
        sink_b: 'generated_bathroom_vanity',
        basic_tv: 'generated_flat_tv',
        big_tv: 'generated_flat_tv',
        stereo: 'generated_stereo',
        game_console: 'generated_game_console',
        aquarium: 'generated_aquarium',
        mirror: 'generated_standing_mirror',
        bbq_grill: 'generated_bbq_grill',
        weights: 'generated_weight_bench',
        changing_table: 'generated_changing_table',
        printer_3d: 'generated_3d_printer',
        fireplace: 'generated_fireplace',
        vanity: 'generated_vanity',
      };
      if (generatedTextures[type] && this.textureExists(generatedTextures[type])) {
        return generatedTextures[type];
      }

      if (config.texture && this.textureExists(config.texture)) return config.texture;

      if(type === 'display_case' || type === 'china_cabinet') {
          return this.orientedTexture(furnState, 'library_display_books_e', 'library_display_books_n', 'displayCase');
      }
      if(type === 'candle_stand' || type === 'lamp' || type === 'fireplace') {
          return this.orientedTexture(furnState, 'library_candle_double_e', 'library_candle_double_n', 'candleStand');
      }
      if(type === 'decorated_table') {
          return this.orientedTexture(furnState, 'library_table_decorated_e', 'library_table_decorated_n', 'decoratedTable');
      }
      if(type === 'wide_bookcase') {
          return this.orientedTexture(furnState, 'library_bookcase_ladder_e', 'library_bookcase_ladder_n', 'wideBookcase');
      }
      if(type === 'cushion' || type === 'yoga_mat' || type === 'rug') {
          return this.orientedTexture(furnState, 'library_carpet_small_e', 'library_carpet_small_n', 'floorCarpet');
      }
      if(type === 'grand_piano') return this.firstExisting(['grandPiano_se'], 'longTable');
      if(type === 'bonsai_shrine') return this.firstExisting(['bonsaiShrine_se'], 'hayStack');
      if(type === 'rustic_armchair' || type === 'recliner' || type === 'dining_chairs') {
          return this.orientedTexture(furnState, 'dungeon_chair_e', 'dungeon_chair_n', 'libraryChair');
      }
      if(type === 'vintage_tv' || type === 'basic_tv' || type === 'big_tv') {
          return this.orientedTexture(furnState, 'vintage_tv_e', 'vintage_tv_n', 'displayCase');
      }
      if(type === 'vintage_stereo' || type === 'stereo') {
          return this.orientedTexture(furnState, 'vintage_stereo_e', 'vintage_stereo_n', 'displayCase');
      }
      if(type === 'bookshelf' || type === 'study_shelf' || type === 'display_shelf') {
          return this.orientedTexture(furnState, 'library_bookcase_e', 'library_bookcase_n', 'bookcaseWideBooks');
      }
      if(type === 'bookcase') {
          return this.orientedTexture(furnState, 'library_bookcase_e', 'library_bookcase_n', 'bookcaseWideBooks');
      }
      if(type === 'toy_chest' || type === 'dresser') {
          return this.orientedTexture(furnState, 'dungeon_chest_open_e', 'dungeon_chest_open_n', 'chestClosed');
      }
      if(type === 'wardrobe') {
          return this.orientedTexture(furnState, 'dungeon_crates_e', 'dungeon_crates_n', 'chestClosed');
      }
      if(type === 'globe' || type === 'language_book') {
          return this.orientedTexture(furnState, 'library_bookstand_e', 'library_bookstand_n', 'bookcaseWideBooks');
      }
      if(type === 'dartboard' || type === 'painting' || type === 'printer_3d') {
          return this.orientedTexture(furnState, 'library_display_open_e', 'library_display_open_n', 'displayCase');
      }
      if(type === 'hammock') return this.orientedTexture(furnState, 'farm_hay_stack_e', 'farm_hay_stack_n', 'hayStack');
      if(type === 'weights') return this.orientedTexture(furnState, 'dungeon_short_table_chairs_e', 'dungeon_short_table_chairs_n', 'barrel');
      if(type === 'staircase') return 'planks';

      if(type === 'subway_gate') return 'subway_turnstile';
      if(type === 'map_portal') return 'map_portal';

      if(type === 'pet_bowl') {
          return this.orientedTexture(furnState, 'farm_sack_e', 'farm_sack_n', furnState && furnState.isFull ? 'chestClosed' : 'crate');
      }
      if(type === 'garden_plot') {
          if (furnState && (furnState.cropState === 'ready' || furnState.cropState === 'growing')) {
              return this.orientedTexture(furnState, 'farm_corn_young_e', 'farm_corn_young_n', 'crop_corn');
          }
          return this.orientedTexture(furnState, 'farm_plot_e', 'farm_plot_n', 'floorCarpet');
      }

      if(type.includes('bed')) return 'generated_bed';
      if(type.includes('dresser') || type.includes('wardrobe')) return this.orientedTexture(furnState, 'dungeon_crates_e', 'dungeon_crates_n', 'chestClosed');
      if(type.includes('coffee_table')) return this.orientedTexture(furnState, 'dungeon_round_table_e', 'dungeon_round_table_n', 'tableShort');
      if(type === 'dining_table') return this.orientedTexture(furnState, 'library_table_chairs_e', 'library_table_chairs_n', 'longTable');
      if(type.includes('table') || type.includes('desk') || type.includes('bench') || type.includes('counter')) {
          return this.orientedTexture(furnState, 'library_table_large_e', 'library_table_large_n', 'longTable');
      }
      if(type.includes('sofa') || type.includes('chair') || type.includes('recliner') || type.includes('toilet') || type.includes('vanity')) return 'libraryChair';
      if(type.includes('tv') || type.includes('computer') || type.includes('console') || type.includes('aquarium') || type.includes('mirror')) return 'displayCase';
      if(type.includes('stove') || type.includes('sink') || type.includes('tub') || type.includes('microwave') || type.includes('espresso') || type.includes('dishwasher') || type.includes('fire') || type.includes('bbq')) return 'barrel';
      if(type.includes('shelf') || type.includes('bookcase')) return this.orientedTexture(furnState, 'library_bookcase_e', 'library_bookcase_n', 'bookcaseWideBooks');
      if(type.includes('rug') || type.includes('mat')) return this.orientedTexture(furnState, 'library_carpet_small_e', 'library_carpet_small_n', 'floorCarpet');
      if(type.includes('plant') || type.includes('tree')) return 'generated_potted_flower';
      return this.orientedTexture(furnState, 'dungeon_crates_e', 'dungeon_crates_n', 'crate');
    }

    syncFurniture(houseObj) {
      if(!houseObj || !houseObj.furniture) return;
      const charPos = Game.State.get().character && Game.State.get().character.position ? Game.State.get().character.position : {x: 0, y: 0};
      const activeFloor = Game.HomeGrowth && Game.HomeGrowth.getActiveFloor ? Game.HomeGrowth.getActiveFloor(houseObj) : (houseObj.activeFloor || 0);
      const visibleFurniture = houseObj.furniture.filter(furn => (
        (furn.floor || 0) === activeFloor
        && Math.abs(furn.x - charPos.x) <= 40
        && Math.abs(furn.y - charPos.y) <= 40
      ));
      
      // Sprite Leak Prevention: destroy sprites for furniture that no longer exists
      const activeFurnIds = new Set(visibleFurniture.map(f => f.id));
      for (const [id, sprite] of spriteMap.entries()) {
          if (!activeFurnIds.has(id)) {
              sprite.destroy();
              spriteMap.delete(id);
              if (shadowMap.has(id)) {
                  shadowMap.get(id).destroy();
                  shadowMap.delete(id);
              }
          }
      }

      visibleFurniture.forEach(furn => {
        let sprite = spriteMap.get(furn.id);
        const fc = Game.Config.FURNITURE[furn.type];
        const textureKey = this.getTextureForFurn(furn.type, furn);
        const visual = this.getFurnitureVisual(furn.type, textureKey);
        
        if(!sprite) {
           sprite = this.add.image(0, 0, textureKey);
           sprite.setScale(visual.scale);
           sprite.setOrigin(0.5, visual.originY);
           spriteMap.set(furn.id, sprite);

           let shadow = this.add.image(0, 0, textureKey);
           shadow.setScale(visual.scale);
           shadow.setOrigin(0.5, visual.originY);
           shadow.setTint(0x000000).setTintMode(Phaser.TintModes.FILL);
           shadow.setAlpha(0.25);
           shadowMap.set(furn.id, shadow);
        } else {
           if (sprite.texture.key !== textureKey) {
               sprite.setTexture(textureKey);
               if (shadowMap.has(furn.id)) {
                   shadowMap.get(furn.id).setTexture(textureKey);
               }
           }
           sprite.setScale(visual.scale);
           sprite.setOrigin(0.5, visual.originY);
           if (shadowMap.has(furn.id)) {
               const shadow = shadowMap.get(furn.id);
               shadow.setOrigin(0.5, visual.originY);
           }
        }
        
        const w = fc ? fc.w : 1;
        const h = fc ? fc.h : 1;
        const curW = furn.rotated ? h : w;
        const curH = furn.rotated ? w : h;

        const pt = isoProject(furn.x + curW/2 - 0.5, furn.y + curH/2 - 0.5); // Center of the tile accounting for dimensions
        sprite.setPosition(pt.x, pt.y);
        sprite.depth = (furn.x + curW - 1 + furn.y + curH - 1) * 10;
        sprite.setFlipX(!!furn.rotated);

        if (shadowMap.has(furn.id)) {
           let shadow = shadowMap.get(furn.id);
           shadow.setPosition(pt.x + 12, pt.y - 4);
           shadow.setFlipX(!!furn.rotated);
           const sp = this.getShadowParams();

           shadow.setScale(visual.scale * 1.0, visual.scale * -sp.stretch);

           shadow.setAngle(sp.angle);

           shadow.setAlpha(sp.alpha);

        }
        
         // Occlusion fading is now handled authoritatively in updateDepthSorting()
      });
    }

    syncPets(pets) {
      if (!pets) return;
      if (!this.petSpriteMap) this.petSpriteMap = new Map();
      if (!this.petShadowMap) this.petShadowMap = new Map();
      pets.forEach(pet => {
         let sprite = this.petSpriteMap.get(pet.id);
         let shadow = this.petShadowMap.get(pet.id);
         if (!sprite) {
             shadow = this.add.text(0, 0, '🐈', { fontSize: '24px', color: '#000000' }).setOrigin(0.5, 0.5);
             shadow.setAlpha(0.25);
             this.petShadowMap.set(pet.id, shadow);

             sprite = this.add.text(0, 0, '🐈', { fontSize: '24px' }).setOrigin(0.5, 0.5);
             this.petSpriteMap.set(pet.id, sprite);
         }
         
         const ptGround = isoProject(pet.position.x, pet.position.y, 0);
         const ptActual = isoProject(pet.position.x, pet.position.y, pet.position.z || 0);

         // Helper wrapper
         const updateShadow = () => {
             if (shadow) {
                 const sp = this.getShadowParams();
                 shadow.setScale(sprite.scaleX * 1.0, sprite.scaleY * -sp.stretch);
                 shadow.setAngle(sp.angle);
                 shadow.setAlpha(sp.alpha);
             }
         };
         
         if (sprite.x !== ptActual.x || sprite.y !== ptActual.y) {
             this._depthDirty = true;
             sprite.setPosition(ptActual.x, ptActual.y);
             sprite.depth = (pet.position.x + pet.position.y) * 10;
         }

         if (shadow) {
             shadow.setPosition(ptActual.x + 8, ptActual.y - 2);
             updateShadow();
         }
         
         // Flip horizontally based on movement direction
         if (pet.targetPosition) {
             sprite.setFlipX(pet.targetPosition.x < pet.position.x);
             if (shadow) shadow.setFlipX(sprite.flipX);
         }
         
         // Breathing tween
         if (!sprite.isBreathing) {
            sprite.isBreathing = true;
            this.tweens.add({
               targets: sprite,
               scaleY: '+=0.05',
               yoyo: true,
               repeat: -1,
               duration: 800,
               ease: 'Sine.easeInOut',
               onUpdate: updateShadow
            });
         }
      });
    }

    syncFamilyMembers(members) {
      const activeIds = new Set((members || []).map(member => member.id));
      for (const [id, group] of familySpriteMap.entries()) {
        if (!activeIds.has(id)) {
          group.destroy();
          familySpriteMap.delete(id);
          this._depthDirty = true;
        }
      }

      for (const member of members || []) {
        let group = familySpriteMap.get(member.id);
        if (!group) {
          const shadow = this.add.text(8, 6, member.icon || 'F', {
            fontSize: '22px',
            color: '#000000',
            fontFamily: 'Nunito, sans-serif',
          }).setOrigin(0.5, 0.5);
          shadow.setAlpha(0.22);
          const label = this.add.text(0, -20, member.icon || 'F', {
            fontSize: '22px',
            color: '#ffffff',
            fontFamily: 'Nunito, sans-serif',
            stroke: '#000000',
            strokeThickness: 3,
          }).setOrigin(0.5, 0.5);
          const name = this.add.text(0, -38, member.name || '', {
            fontSize: '10px',
            color: '#ffffff',
            fontFamily: 'Nunito, sans-serif',
            stroke: '#000000',
            strokeThickness: 2,
          }).setOrigin(0.5, 1);
          group = this.add.container(0, 0, [shadow, label, name]);
          familySpriteMap.set(member.id, group);
          this._depthDirty = true;
        }

        const pt = isoProject(member.position.x, member.position.y, member.position.z || 0);
        if (group.x !== pt.x || group.y !== pt.y) {
          group.setPosition(pt.x, pt.y);
          this._depthDirty = true;
        }
        group.depth = (member.position.x + member.position.y) * 10 + 3;
      }
    }

    syncNPCs(npcs) {
      const currentIds = new Set((npcs || []).filter(n => n.active).map(n => n.id));
      
      // Cleanup
      for (const [id, spriteGroup] of npcSpriteMap.entries()) {
          if (!currentIds.has(id)) {
              spriteGroup.destroy();
              npcSpriteMap.delete(id);
              this._depthDirty = true;
          }
      }
      
      if (!npcs) return;
      
      npcs.forEach(npc => {
         if(!npc.active) return;
         let spriteGroup = npcSpriteMap.get(npc.id);
         const npcCfg = Game.Config.NPCS.find(n => n.id === npc.configId);
         if (!npcCfg) return;
         
         const ptActual = isoProject(npc.position.x, npc.position.y, 0);

         if (!spriteGroup) {
             const marker = this.add.circle(0, 0, 10, Number(npcCfg.color.replace('#', '0x')) || 0xFFFFFF, 0.8);
             const img = this.add.image(0, -10, 'new_iso_human');
             img.setScale(0.5);
             img.setOrigin(0.5, 0.8);
             img.setTint(Number(npcCfg.color.replace('#', '0x')) || 0xFFFFFF);
             const tag = this.add.text(0, -50, npcCfg.avatar + ' ' + npcCfg.name.split(' ')[0], { fontSize: '10px', fontFamily: 'Nunito, sans-serif', color: '#FFF' });
             tag.setOrigin(0.5, 0.5);
             
             spriteGroup = this.add.container(ptActual.x, ptActual.y, [marker, img, tag]);
             npcSpriteMap.set(npc.id, spriteGroup);
             this._depthDirty = true;
         } else {
             if (spriteGroup.x !== ptActual.x || spriteGroup.y !== ptActual.y) {
                 this._depthDirty = true;
                 spriteGroup.setPosition(ptActual.x, ptActual.y);
                 
                 const img = spriteGroup.list[1];
                 if (npc.direction !== undefined) {
                     img.setFlipX(npc.direction < 0);
                 }
             }
         }
      });
    }
  }

  // Cached isometric projection offsets (recalculated on resize)
  RendererMath.setOffset(window.innerWidth / 2, 200);
  window.addEventListener('resize', () => {
    RendererMath.setOffset(window.innerWidth / 2, RendererMath.getOffset().y);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!mainScene) return;
        if (!mainScene.userAdjustedZoom) {
          mainScene.cameras.main.setZoom(getDefaultCameraZoom(mainScene.scale.width, mainScene.scale.height));
        }
        if (mainScene.drawHouseGrid) mainScene.drawHouseGrid();
        mainScene._furnitureDirty = true;
        if (mainScene.syncFurniture) {
          mainScene.syncFurniture(Game.State.getActiveMap());
          mainScene._furnitureDirty = false;
          mainScene._furnitureSyncElapsed = 0;
        }
        if (mainScene.terrainBackdrop) {
          mainScene.terrainBackdrop.setSize(mainScene.scale.width, mainScene.scale.height);
        }
        if (mainScene.cameraFollowsCharacter && mainScene.centerCameraOnCharacter) {
          mainScene.centerCameraOnCharacter(true);
        }
      });
    });
  });

  // Pure Isometric Math: Cartesian (gridX, gridY, gridZ) to Screen (scX, scY)
  function isoProject(gx, gy, gz = 0) {
    return RendererMath.isoProject(gx, gy, gz);
  }
  
  // Inverse: Screen (scX, scY) to Cartesian (gridX, gridY)
  function isoUnproject(sx, sy, gz = 0) {
    return RendererMath.isoUnproject(sx, sy, gz);
  }

  function pickGroundTint(x, y, outer) {
    const palette = outer
      ? [0x79ae68, 0x6fa55f, 0x84b873, 0x75a968]
      : [0x82b96c, 0x8fc477, 0x78ad64, 0x98ca7d];
    const idx = Math.abs((x * 31 + y * 17 + x * y * 7) % palette.length);
    return palette[idx];
  }

  function init(canvasEl) {
    if (phaserGame) return Promise.resolve(true);
    if (initPromise) return initPromise;

    bindSignals();
    window.SIM_PRELOADED_IMAGES = window.SIM_PRELOADED_IMAGES || {};
    window.SIM_PRELOADED_AVATAR_IMAGES = window.SIM_PRELOADED_AVATAR_IMAGES || {};

    if (Game.AssetLoader) {
      setRuntimeStatus('loading', 'Preparing your world…', 'Loading local world and avatar assets.');
      initPromise = Promise.all([
        Game.AssetLoader.loadGroup('starterWorld'),
        Game.AssetLoader.loadGroup('avatars'),
      ]).then(([worldReport, avatarReport]) => {
        if (worldReport.status === 'error') {
          setRuntimeStatus('error', 'World assets could not load', `${worldReport.failed} required assets failed. Retry to continue.`);
          return false;
        }
        if (avatarReport.status === 'partial') {
          pendingPartialStatus = {
            title: 'World ready with limited avatars',
            message: `${avatarReport.failed} optional avatar layers were unavailable.`,
          };
          setRuntimeStatus('partial', pendingPartialStatus.title, pendingPartialStatus.message);
        }
        return startPhaser(canvasEl);
      }).catch(error => {
        console.error('Asset startup failed:', error);
        setRuntimeStatus('error', 'The game could not start', error.message || 'Asset loading failed.');
        return false;
      });
      return initPromise;
    }

    const entries = [
      ...Object.entries(window.SIM_ASSETS || {}).map(([key, src]) => ({ key, src, target: window.SIM_PRELOADED_IMAGES, isAvatar: false })),
      ...Object.entries(window.SIM_AVATAR_ASSETS || {}).map(([key, src]) => ({ key, src, target: window.SIM_PRELOADED_AVATAR_IMAGES, isAvatar: true })),
    ];

    initPromise = new Promise(resolve => {
      if (entries.length === 0) {
        resolve(startPhaser(canvasEl));
        return;
      }

      let loadedCount = 0;
      const finishEntry = () => {
        loadedCount++;
        if (loadedCount === entries.length) resolve(startPhaser(canvasEl));
      };

      for (const entry of entries) {
        const img = new Image();
        img.onload = () => {
          entry.target[entry.key] = img;
          finishEntry();
        };
        img.onerror = () => {
          console.error('Failed to load image for key:', entry.key);
          if (!entry.isAvatar) entry.target[entry.key] = new Image();
          else delete entry.target[entry.key];
          finishEntry();
        };
        img.src = entry.src;
      }
    });
    return initPromise;
}

  function bindSignals() {
    if (signalsBound || !Game.Signals) return;
    signalsBound = true;
    Game.Signals.on('effect:bubble', payload => {
      if (payload) spawnFloatingBubble(payload.x, payload.y, payload.text, payload.color, payload.icon);
    });
    Game.Signals.on('effect:explosion', payload => {
      if (payload) spawnExplosion(payload.x, payload.y, payload.scale);
    });
    Game.Signals.on('renderer:sync', () => setBgDirty());
    Game.Signals.on('map:transition', () => transitionMap());
    Game.Signals.on('path:find', payload => {
      if (payload) findPath(payload.startX, payload.startY, payload.endX, payload.endY, payload.callback);
    });
  }

function startPhaser(canvasEl) {
    if (phaserGame) return true;
    canvasEl = canvasEl || document.getElementById('game-canvas');
    if (typeof EasyStar !== 'undefined') {
      easyStar = new EasyStar.js();
      updatePathGrid();
    }

    if (canvasEl) canvasEl.style.display = 'block';
    const parentEl = (canvasEl && canvasEl.parentElement) || document.querySelector('.canvas-area') || document.body;

    // Phaser 4 removed Pipelines. TiltShift is now handled via CSS overlays.
    // Initialize Phaser
    const requestedRenderer = typeof window.URLSearchParams === 'function'
      ? new window.URLSearchParams(window.location?.search || '').get('renderer')
      : null;
    const preferredType = requestedRenderer === 'canvas' && Phaser.CANVAS !== undefined
      ? Phaser.CANVAS
      : Phaser.WEBGL;
    const rendererTypes = [preferredType];
    if (preferredType !== Phaser.CANVAS && Phaser.CANVAS !== undefined) rendererTypes.push(Phaser.CANVAS);

    let lastError = null;
    for (const rendererType of rendererTypes) {
      const config = {
        // A supplied canvas is a Phaser custom environment. Phaser 4 rejects AUTO here.
        type: rendererType,
        canvas: canvasEl,
        width: parentEl.clientWidth || window.innerWidth,
        height: parentEl.clientHeight || window.innerHeight,
        parent: parentEl, // .canvas-area
        scene: MainScene,
        transparent: true,
        antialias: false,
        pixelArt: true,
        roundPixels: true,
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH
        },
        plugins: {
          global: [{
            key: 'rexState',
            plugin: typeof rexstatemanagerplugin !== 'undefined' ? rexstatemanagerplugin : undefined,
            start: true
          }]
        }
      };

      try {
        phaserGame = new Phaser.Game(config);
        if (!contextListenersBound && canvasEl && canvasEl.addEventListener) {
          contextListenersBound = true;
          canvasEl.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            setRuntimeStatus('error', 'Graphics context was lost', 'Retry will save the active world when possible and reload the renderer.');
          });
          canvasEl.addEventListener('webglcontextrestored', () => setRuntimeStatus('success'));
        }
        if (pendingPartialStatus) {
          setRuntimeStatus('partial', pendingPartialStatus.title, pendingPartialStatus.message);
          window.setTimeout(() => {
            pendingPartialStatus = null;
            setRuntimeStatus('success');
          }, 2200);
        } else {
          setRuntimeStatus('success');
        }
        return true;
      } catch (error) {
        lastError = error;
        phaserGame = null;
        if (rendererType !== rendererTypes[rendererTypes.length - 1]) {
          console.warn('WebGL renderer unavailable; retrying with Canvas.', error);
        }
      }
    }

    console.error('Renderer initialization failed:', lastError);
    setRuntimeStatus('error', 'Graphics could not initialize', 'Neither WebGL nor Canvas could start on this device.');
    return false;
  }

  function setRuntimeStatus(status, title = '', message = '') {
    const overlay = document.getElementById('runtime-status');
    if (!overlay) return;
    const titleEl = document.getElementById('runtime-status-title');
    const messageEl = document.getElementById('runtime-status-message');
    const retry = document.getElementById('btn-runtime-retry');
    const isError = status === 'error';
    overlay.dataset.status = status;
    overlay.classList.toggle('hidden', status === 'success');
    overlay.setAttribute('role', isError ? 'alertdialog' : 'status');
    overlay.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    if (isError) overlay.setAttribute('aria-modal', 'true');
    else overlay.removeAttribute('aria-modal');
    if (titleEl && title) titleEl.textContent = title;
    if (messageEl && message) messageEl.textContent = message;
    if (retry) {
      retry.classList.toggle('hidden', status !== 'error');
      retry.onclick = status === 'error' ? () => {
        Game.State?.save?.();
        window.location.reload();
      } : null;
    }
    setRuntimeInputBlocked(isError, retry);
    Game.Signals?.emit('runtime:status', { status, title, message });
  }

  function setRuntimeInputBlocked(blocked, retryButton) {
    const nextBlocked = Boolean(blocked);
    const ui = document.getElementById('ui-layer');
    if (nextBlocked && !runtimeInputBlocked) {
      runtimePreviousFocus = document.activeElement || null;
      Game.UI?.hideEvent?.();
      Game.Shell?.close?.();
      Game.UI?.closeEditModal?.();
      runtimePreviousSpeed = Game.Main?.getSpeed?.() ?? null;
      Game.Main?.setSpeed?.(0, { silent: true });
      Game.Interaction?.closePieMenu?.();
      const sidePanel = document.getElementById('side-panel');
      if (sidePanel) {
        sidePanel.classList.add('hidden');
        sidePanel.dataset.active = '';
      }
      document.body.classList.remove('side-panel-open', 'mobile-panel-menu-open');
    }

    runtimeInputBlocked = nextBlocked;
    document.body.classList.toggle('runtime-input-blocked', nextBlocked);
    if (ui) {
      if (nextBlocked) {
        ui.setAttribute('inert', '');
        ui.setAttribute('aria-hidden', 'true');
      } else {
        ui.removeAttribute('inert');
        ui.removeAttribute('aria-hidden');
      }
    }

    if (nextBlocked) {
      window.setTimeout(() => retryButton?.focus?.(), 0);
    } else if (runtimePreviousSpeed !== null) {
      Game.Main?.setSpeed?.(runtimePreviousSpeed, { silent: true });
      runtimePreviousSpeed = null;
      runtimePreviousFocus?.focus?.();
      runtimePreviousFocus = null;
    }
  }

  // render() removed — Phaser handles rendering automatically

  // --- Adapters to keep main.js happy for now ---
  function toScreen(gx, gy) { 
    if (!mainScene) return isoProject(gx, gy);
    const pt = isoProject(gx, gy);
    return {
      x: pt.x - mainScene.cameras.main.scrollX,
      y: pt.y - mainScene.cameras.main.scrollY
    };
  }
  
  function toGrid(sx, sy) { 
    if (!mainScene) return isoUnproject(sx, sy);
    const cam = mainScene.cameras.main;
    // Convert screen coords to world coords (accounting for zoom + scroll)
    const worldX = sx / cam.zoom + cam.scrollX;
    const worldY = sy / cam.zoom + cam.scrollY;
    return isoUnproject(worldX, worldY);
  }

  function getGridPos(sx, sy) { 
    const pt = toGrid(sx, sy);
    return { x: Math.floor(pt.x), y: Math.floor(pt.y) }; 
  }
  
  function setCameraOffset(dx, dy) {
    if(mainScene) {
      // Manual programmatic camera offset (e.g. from keyboard)
      if (mainScene.disableCameraFollow) mainScene.disableCameraFollow();
      mainScene.cameras.main.scrollX += dx;
      mainScene.cameras.main.scrollY += dy;
    }
  }

  function centerCameraOnCharacter() {
    if (mainScene && mainScene.centerCameraOnCharacter) {
      mainScene.centerCameraOnCharacter(true);
    }
  }
  
  function adjustZoom(step) {
    if(mainScene) {
      mainScene.userAdjustedZoom = true;
      mainScene.cameras.main.zoom = Math.max(0.25, Math.min(4, mainScene.cameras.main.zoom + step));
      if (mainScene.cameraFollowsCharacter && mainScene.centerCameraOnCharacter) {
        mainScene.centerCameraOnCharacter(true);
      }
    }
  }

  function getCameraDebug() {
    if (!mainScene || !mainScene.cameras || !mainScene.cameras.main) return null;

    const cam = mainScene.cameras.main;
    const focus = mainScene.getCharacterCameraFocus ? mainScene.getCharacterCameraFocus() : null;
    const targetScroll = mainScene.getCenteredCameraScroll ? mainScene.getCenteredCameraScroll(focus) : null;
    const scroll = { x: cam.scrollX, y: cam.scrollY, zoom: cam.zoom || 1 };
    const finitePoint = point => !!point && Number.isFinite(point.x) && Number.isFinite(point.y);

    return {
      followsCharacter: !!mainScene.cameraFollowsCharacter,
      nativeFollowActive: !!cam._follow,
      scroll,
      focus,
      targetScroll,
      scrollFinite: finitePoint(scroll) && Number.isFinite(scroll.zoom),
      focusFinite: finitePoint(focus),
      targetScrollFinite: finitePoint(targetScroll),
    };
  }
  
  function showPieMenu(x, y, title, items) {
    if (mainScene) mainScene.showPieMenu(x, y, title, items);
  }
  function closePieMenu() {
    if (mainScene) mainScene.closePieMenu();
  }

  function isPieMenuOpen() {
    return Boolean(mainScene && mainScene.pieMenu);
  }

  function hitTestFurniture(gx, gy) {
    return RendererHelpers.hitTestFurniture(
      Game.State.getActiveMap(),
      Game.Config.FURNITURE,
      gx,
      gy
    );
  }

  function hitTestRoom(gx, gy) {
    return RendererHelpers.hitTestRoom(Game.State.getActiveMap(), gx, gy);
  }

  function getRandomRoomPosition() {
    const activeMap = Game.State.getActiveMap();
    if (!activeMap || activeMap.rooms.length === 0) return null;
    const room = activeMap.rooms[Game.Random.int(0, activeMap.rooms.length - 1)];
    return {
      x: room.x + Game.Random.int(0, room.w - 1),
      y: room.y + Game.Random.int(0, room.h - 1)
    };
  }

  function setBgDirty() {
    // Redraw room grid when rooms change
    if (mainScene && mainScene.drawHouseGrid) {
      mainScene.drawHouseGrid();
      mainScene._furnitureDirty = true;
    }
    updatePathGrid();
  }

  function updatePathGrid() {
    if (!easyStar) return;
    const activeMap = Game.State.getActiveMap();
    if (!activeMap) return;
    
    currentGrid = RendererHelpers.buildPathGrid(activeMap, Game.Config.FURNITURE);
    easyStar.setGrid(currentGrid);
    easyStar.setAcceptableTiles([0]);
    easyStar.enableDiagonals();
    easyStar.disableCornerCutting();
  }

  function findPath(sx, sy, ex, ey, callback) {
    if (!easyStar || !currentGrid) {
       callback([{x: ex, y: ey}]); // Fallback
       return;
    }

    const isInsideGrid = (x, y) => (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      y >= 0 &&
      y < currentGrid.length &&
      x >= 0 &&
      currentGrid[y] &&
      x < currentGrid[y].length
    );

    if (!isInsideGrid(sx, sy) || !isInsideGrid(ex, ey)) {
       callback(null);
       return;
    }
    
    let targetX = ex;
    let targetY = ey;
    
    // If target is unwalkable, find the closest adjacent walkable tile
    if (currentGrid[targetY] && currentGrid[targetY][targetX] === 1) {
       const neighbors = [
          {dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0},
          {dx: -1, dy: -1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}, {dx: 1, dy: 1}
       ];
       let bestTile = null;
       let bestDist = Infinity;
       
       for (const n of neighbors) {
           const nx = ex + n.dx;
           const ny = ey + n.dy;
           if (currentGrid[ny] && currentGrid[ny][nx] === 0) {
               const dist = Math.sqrt(Math.pow(nx - sx, 2) + Math.pow(ny - sy, 2));
               if (dist < bestDist) {
                   bestDist = dist;
                   bestTile = {x: nx, y: ny};
               }
           }
       }
       
       if (bestTile) {
           targetX = bestTile.x;
           targetY = bestTile.y;
       }
    }
    
    easyStar.findPath(sx, sy, targetX, targetY, callback);
  }

  function transitionMap() {
    spriteMap.forEach(sprite => {
        sprite.destroy();
    });
    spriteMap.clear();
    if (typeof shadowMap !== 'undefined' && shadowMap) {
        shadowMap.forEach(shadow => {
            shadow.destroy();
        });
        shadowMap.clear();
    }
    setBgDirty();
    if (mainScene && mainScene.centerCameraOnCharacter) {
      mainScene.centerCameraOnCharacter();
    }
  }

  function getFurnitureTextureReport() {
    if (!mainScene || !Game.Config || !Game.Config.FURNITURE) return null;
    const mappings = Object.keys(Game.Config.FURNITURE).map(type => ({
      type,
      texture: mainScene.getTextureForFurn(type, {}),
    }));
    const uniqueTextures = Array.from(new Set(mappings.map(entry => entry.texture)));
    return {
      mappings,
      uniqueTextures,
      uniqueTextureCount: uniqueTextures.length,
      generatedTextureCount: uniqueTextures.filter(key => key.startsWith('generated_')).length,
    };
  }

  function spawnParticles(x, y, count = 20, color = '#FFFF00') {
    if (!mainScene) return;
    const pt = isoProject(x, y);
    const emitter = mainScene.add.particles(pt.x, pt.y, 'hay', {
      speed: 100,
      scale: { start: 0.1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 1000,
      duration: 100,
      maxParticles: count,
      tint: parseInt(color.replace('#', '0x'))
    });
    emitter.depth = 99999;
    destroyEmitterAfter(emitter, 1300);
  }

  function spawnExplosion(x, y, scale = 1) {
    if (!mainScene) return;
    const pt = isoProject(x, y);
    const emitter = mainScene.add.particles(pt.x, pt.y, 'crate', {
      speed: { min: 100, max: 200 },
      scale: { start: 0.05 * scale, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 800,
      quantity: 10,
      blendMode: 'ADD'
    });
    // In Phaser 3.60, particles configuration explodes immediately if duration is omitted and quantity is passed.
    // Ensure we trigger it:
    emitter.explode(10);
    emitter.depth = 99999;
    destroyEmitterAfter(emitter, 1000);
  }

  function getFurnitureDebug() {
    const activeMap = Game.State.getActiveMap();
    if (!mainScene || !activeMap) return { spriteCount: 0, missingSprites: 0, positionMismatches: 0 };
    const activeFloor = Game.HomeGrowth?.getActiveFloor?.(activeMap) ?? (activeMap.activeFloor || 0);
    const visibleFurniture = (activeMap.furniture || []).filter(furn => (furn.floor || 0) === activeFloor);
    let missingSprites = 0;
    let positionMismatches = 0;
    for (const furn of visibleFurniture) {
      const sprite = spriteMap.get(furn.id);
      if (!sprite || !sprite.active || !sprite.visible) {
        missingSprites += 1;
        continue;
      }
      const config = Game.Config.FURNITURE[furn.type] || { w: 1, h: 1 };
      const width = furn.rotated ? (config.h || 1) : (config.w || 1);
      const height = furn.rotated ? (config.w || 1) : (config.h || 1);
      const expected = isoProject(furn.x + width / 2 - 0.5, furn.y + height / 2 - 0.5);
      if (Math.abs(sprite.x - expected.x) > 1 || Math.abs(sprite.y - expected.y) > 1) positionMismatches += 1;
    }
    return { spriteCount: spriteMap.size, expectedSprites: visibleFurniture.length, missingSprites, positionMismatches };
  }

  function destroyEmitterAfter(emitter, delay) {
    const destroy = () => {
      if (emitter && typeof emitter.destroy === 'function') emitter.destroy();
    };
    if (mainScene?.time?.delayedCall) mainScene.time.delayedCall(delay, destroy);
    else window.setTimeout(destroy, delay);
  }

  function spawnFloatingBubble(x, y, text, color = '#FFFFFF', icon = '') {
    if (!mainScene) return;
    const pt = isoProject(x, y);
    const txtEl = mainScene.add.text(pt.x, pt.y - 20, `${icon} ${text}`, {
        fontFamily: 'Nunito, sans-serif',
        fontSize: '18px',
        color: color,
        stroke: '#000000',
        strokeThickness: 3,
        shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
    }).setOrigin(0.5, 0.5);
    
    txtEl.depth = 100000;
    
    mainScene.tweens.add({
        targets: txtEl,
        y: pt.y - 80,
        alpha: 0,
        duration: 2000,
        ease: 'Power2',
        onComplete: () => txtEl.destroy()
    });
  }

  return {
    init,
    toScreen,
    toGrid,
    setCameraOffset,
    spawnParticles,
    spawnExplosion,
    getGridPos,
    hitTestFurniture,
    hitTestRoom,
    getRandomRoomPosition,
    setBgDirty,
    transitionMap,
    adjustZoom,
    centerCameraOnCharacter,
    getCameraDebug,
    showPieMenu,
    closePieMenu,
    isPieMenuOpen,
    spawnFloatingBubble,
    findPath,
    getAvatarDebug: function() {
      return {
        layerCount: avatarRenderer ? avatarRenderer.layerCount : 0,
        hasContainer: !!avatarContainer,
        direction: avatarDirection,
        flipX: avatarFlipX,
        activityGlowActive: !!(mainScene && (mainScene._avatarActivityGlowActive || mainScene._legacyActivityGlowActive)),
        missingTextureKeys: avatarRenderer ? (avatarRenderer.missingTextureKeys || []) : [],
        layers: avatarRenderer ? (avatarRenderer.layers || []).map(layer => {
          const image = avatarRenderer.layerMap && avatarRenderer.layerMap.get(layer.slot);
          return {
            slot: layer.slot,
            textureKey: layer.textureKey,
            tint: image && image._avatarTint !== undefined ? image._avatarTint : null,
          };
        }) : [],
      };
    },
    getFamilyDebug: function() {
      return {
        spriteCount: familySpriteMap.size,
        ids: Array.from(familySpriteMap.keys()),
      };
    },
    getFurnitureDebug,
    getFurnitureTextureReport,
    isInputBlocked: () => runtimeInputBlocked,
    isReady: () => Boolean(phaserGame),
  };
})();
