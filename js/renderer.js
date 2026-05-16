
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
  let npcSpriteMap = new Map();
  let familySpriteMap = new Map();
  let debugGraphics = null;
  const CAMERA_FOLLOW_LERP = 0.12;
  const CAMERA_FOCUS_FALLBACK_OFFSET = 48;
  window.DEBUG_BOUNDS = false;

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
      this.cameras.main.setBackgroundColor('#25451f');

      const backdropGraphics = this.make.graphics({ x: 0, y: 0, add: false });
      backdropGraphics.fillStyle(0x2f5525, 1);
      backdropGraphics.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 130; i++) {
        const x = (i * 37) % 128;
        const y = (i * 61) % 128;
        const tint = i % 3 === 0 ? 0x3f6c31 : (i % 3 === 1 ? 0x25481f : 0x5d7e3e);
        backdropGraphics.fillStyle(tint, 0.26);
        backdropGraphics.fillRect(x, y, 2 + (i % 3), 1);
      }
      backdropGraphics.generateTexture('grass_backdrop', 128, 128);
      this.terrainBackdrop = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'grass_backdrop');
      this.terrainBackdrop.setOrigin(0, 0);
      this.terrainBackdrop.setScrollFactor(0);
      this.terrainBackdrop.setDepth(-1000000);
      
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
      });
      
      this.input.keyboard.on('keydown-SPACE', () => {
          const char = Game.State.get().character;
          if (char && char.position && (!char.position.z || char.position.z <= 0)) {
              char.vz = 4.0; // Trigger jump velocity (units per minute)
          }
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

      this.input.keyboard.on('keydown-B', () => {
          window.DEBUG_BOUNDS = !window.DEBUG_BOUNDS;
          document.dispatchEvent(new CustomEvent('notification', { detail: { message: window.DEBUG_BOUNDS ? '🔍 Debug Overlays: ON' : '🔍 Debug Overlays: OFF' }}));
      });

      debugGraphics = this.add.graphics();
      debugGraphics.setDepth(999999);

      // Draw static grid representing the house rooms/lot
      this.drawHouseGrid();
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
      const zoom = cam.zoom || 1;
      return {
        x: focus.x - (cam.width / (2 * zoom)),
        y: focus.y - (cam.height / (2 * zoom))
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
          let isTopEdge = false;
          let isLeftEdge = false;
          let isRightEdge = false;
          let isBottomEdge = false;

          const roomsList = visibleRooms;
          for (const r of roomsList) {
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
              inRoom = true;
              if (y === r.y) isTopEdge = true;
              if (x === r.x) isLeftEdge = true;
              if (x === r.x + r.w - 1) isRightEdge = true;
              if (y === r.y + r.h - 1) isBottomEdge = true;
              break;
            }
          }

          if (inRoom) {
            tile.setTexture('planks');
            // Remove tint entirely for interior floors to let original texture shine
            tile.clearTint();
            
            // Draw isometric walls explicitly on the tile edges
            // Lift walls up by 24 pixels so they sit on the top surface of the floor tile rather than sinking into it
            if (isTopEdge) {
               const ptEdge = isoProject(x + 0.5, y);
               const wall = this.add.image(ptEdge.x, ptEdge.y - 24, 'wall_e');
               this.gridSprites.push(wall);
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.75); 
               wall.depth = (x + y) * 10 - 1; 
            }
            if (isLeftEdge) {
               const ptEdge = isoProject(x, y + 0.5);
               const wall = this.add.image(ptEdge.x, ptEdge.y - 24, 'wall_n');
               this.gridSprites.push(wall);
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.75); 
               wall.depth = (x + y) * 10 - 1; 
            }
            
            // Front walls (Occluding the room)
            if (isBottomEdge) {
               const ptF = isoProject(x + 0.5, y + 1); // Push to edge midpoint
               const wall = this.add.image(ptF.x, ptF.y - 24, 'wall_e');
               this.gridSprites.push(wall);
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.75); 
               wall.depth = (x + y + 1) * 10 - 1; 
               this.frontWalls.push({ sprite: wall, room: roomsList.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) });
            }
            if (isRightEdge) {
               const ptF = isoProject(x + 1, y + 0.5); // Push to edge midpoint
               const wall = this.add.image(ptF.x, ptF.y - 24, 'wall_n');
               this.gridSprites.push(wall);
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.75); 
               wall.depth = (x + 1 + y) * 10 - 1; 
               this.frontWalls.push({ sprite: wall, room: roomsList.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) });
            }
          } else {
            tile.setTexture('floor');
            tile.setTint(pickGroundTint(x, y, false));
          }
      }

      this.drawAmbientScenery(activeMap, w, h);
    }

    getRenderedGroundTileKeys(activeMap, w, h) {
      const keys = new Set();
      const fullMapBudget = 1600;
      const contentMargin = activeMap === Game.State.get().maps.house ? 5 : 3;

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
        { key: 'hayStack', x: -2, y: 6, scale: 0.18 },
        { key: 'hay', x: 1, y: h - 3, scale: 0.18 },
        { key: 'crate', x: 7, y: h + 1, scale: 0.18 },
        { key: 'fence', x: w - 2, y: 5, scale: 0.20 },
        { key: 'wooden_fence_e', x: 10, y: -1, scale: 0.18 },
        { key: 'wooden_fence_n', x: w + 1, y: 12, scale: 0.18 },
        { key: 'hay', x: w - 5, y: h - 1, scale: 0.18 },
        { key: 'crate', x: -3, y: h - 7, scale: 0.17 },
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
      
      if (furn) {
        this.setHoverEffect('furniture', furn, pointer.event.clientX, pointer.event.clientY);
      } else if (npcHit) {
        this.setHoverEffect('npc', npcHit, pointer.event.clientX, pointer.event.clientY);
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
           const sprite = spriteMap.get(obj.id);
           if (sprite) {
               if (!sprite.glowFx && sprite.preFX && sprite.preFX.addGlow) {
                   sprite.glowFx = sprite.preFX.addGlow(0xffffff, 2, 0, false, 0.1, 10);
               }
           }
           
           if (this.hoverTooltipEl) {
               let text = '';
               if (obj.type === 'garden_plot') {
                   text = `🌱 Growth: ${Math.floor(obj.growth || 0)}%`;
                   if (obj.needsWater) text += ` (Needs Water)`;
               } else if (obj.type === 'pet_bowl') {
                   text = `🥣 Food: ${Math.floor(obj.foodLevel || 0)}%`;
               } else {
                   const fc = Game.Config.FURNITURE[obj.type];
                   text = fc ? fc.label : 'Object';
               }
               
               this.hoverTooltipEl.textContent = text;
               this.hoverTooltipEl.classList.remove('hidden');
               this.hoverTooltipEl.style.left = clientX + 'px';
               this.hoverTooltipEl.style.top = clientY + 'px';
           }
       } else if (type === 'npc') {
           if (this.hoverTooltipEl) {
               this.hoverTooltipEl.textContent = `👤 ${obj.name || 'Stranger'}`;
               this.hoverTooltipEl.classList.remove('hidden');
               this.hoverTooltipEl.style.left = clientX + 'px';
               this.hoverTooltipEl.style.top = clientY + 'px';
           }
       }
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
      this.syncFurniture(Game.State.getActiveMap());
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
      let tintColor = 0x040822; // Deep blue night (default)
      if (hour < 5 || hour > 20) {
          darkness = 0.55; tintColor = 0x040822; // Night: deep navy
      } else if (hour >= 5 && hour < 7) {
          // Dawn: warm golden rise
          darkness = 0.55 - ((hour - 5)/2)*0.45;
          tintColor = 0x8B4513; // Warm sienna dawn
      } else if (hour >= 7 && hour < 9) {
          // Morning: fading golden warmth
          darkness = 0.10 - ((hour - 7)/2)*0.10;
          tintColor = 0xD2691E; // Chocolate morning glow
      } else if (hour >= 9 && hour < 17) {
          darkness = 0; // Full daylight, no overlay
      } else if (hour >= 17 && hour < 19) {
          // Sunset: warm amber -> deep orange
          darkness = ((hour - 17)/2)*0.30;
          tintColor = 0xFF6347; // Tomato sunset
      } else if (hour >= 19 && hour <= 20) {
          // Dusk: transition to blue
          darkness = 0.30 + ((hour - 19))*0.25;
          tintColor = 0x191970; // Midnight blue dusk
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
       if (!this.uiContainer) {
          this.uiContainer = this.add.container(0, 0);
          this.uiContainer.setScrollFactor(0);
          this.uiContainer.setDepth(900000); // Sit above shadow map
       }
       
       this.pieMenu = this.add.container(x, y);
       this.uiContainer.add(this.pieMenu);
       
       const blocker = this.add.rectangle(0, 0, 8000, 8000, 0x000000, 0).setInteractive();
       blocker.on('pointerdown', () => this.closePieMenu());
       
       const bg = this.add.circle(0, 0, 20, 0x000000, 0.7).setInteractive();
       const cancel = this.add.text(0, 0, '✕', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
       this.pieMenu.add([blocker, bg, cancel]);
       
       bg.on('pointerdown', () => this.closePieMenu());
       
       const radius = 65;
       const angleStep = (2 * Math.PI) / Math.max(items.length, 1);
       const startAngle = -Math.PI / 2;
       
       items.forEach((item, i) => {
          const angle = startAngle + i * angleStep;
          const ix = Math.cos(angle) * radius;
          const iy = Math.sin(angle) * radius;
          
          const btnBg = this.add.circle(ix, iy, 25, item.locked ? 0x888888 : 0x222222, 0.9).setInteractive();
          const btnIcon = this.add.text(ix, iy - 6, item.locked ? '🔒' : item.icon, { fontSize: '18px' }).setOrigin(0.5);
          const btnText = this.add.text(ix, iy + 10, item.label, { fontSize: '10px', color: '#ffffff', backgroundColor: '#00000088', padding: {x:2, y:1} }).setOrigin(0.5);
          
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
        return;
      }
      
      if (!buildGhostSprite) {
        buildGhostSprite = this.add.image(0, 0, 'crate');
        buildGhostSprite.setScale(0.25);
        buildGhostSprite.setOrigin(0.5, 0.75);
      }
      
      buildGhostSprite.setVisible(true);

      if (ghost.type === 'furniture' || ghost.type === 'stored') {
         buildGhostSprite.setTexture(this.getTextureForFurn(ghost.key));
      } else {
         buildGhostSprite.setTexture('planks'); // Minimal indicator for rooms
      }
      
      const pt = isoProject(ghost.x + (ghost.w > 1 ? ghost.w/2 - 0.5 : 0), ghost.y + (ghost.h > 1 ? ghost.h/2 - 0.5 : 0));
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
      
      buildGhostSprite.setAlpha(0.6);
      buildGhostSprite.setTint(isValid ? 0x88FF88 : 0xFF4444);
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
          this.charLabel = this.add.text(0, 0, charObj.name || '馃 You', {
            fontSize: '12px',
            fontFamily: 'Nunito, sans-serif',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
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
          fontSize: '12px',
          fontFamily: 'Nunito, sans-serif',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
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
        this.charLabel.setPosition(pt.x, pt.y - 45); // Move name up slightly to make room
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

    getTextureForFurn(type, furnState) {
      if(type === 'display_case') return 'displayCase';
      if(type === 'candle_stand') return 'candleStand';
      if(type === 'decorated_table') return 'decoratedTable';
      if(type === 'wide_bookcase') return 'wideBookcase';
      if(type === 'cushion') return 'floorCarpet';

      if(type === 'subway_gate') return 'subway_turnstile';
      if(type === 'map_portal') return 'map_portal';

      if(type === 'pet_bowl') return furnState && furnState.isFull ? 'chestClosed' : 'crate';
      if(type === 'potted_flower') return 'hayStack'; 
      if(type === 'garden_plot') {
          if (furnState && furnState.cropState === 'ready') return 'hayStack';
          if (furnState && furnState.cropState === 'growing') return 'hay';
          return 'crate';
      }

      if(type.includes('bed')) return 'hayStack';
      if(type.includes('dresser') || type.includes('wardrobe') || type.includes('fridge')) return 'chestClosed';
      if(type.includes('coffee_table')) return 'tableShort';
      if(type.includes('table') || type.includes('desk') || type.includes('bench') || type.includes('counter')) return 'longTable';
      if(type.includes('sofa') || type.includes('chair') || type.includes('recliner') || type.includes('toilet') || type.includes('vanity')) return 'libraryChair';
      if(type.includes('tv') || type.includes('computer') || type.includes('console') || type.includes('aquarium') || type.includes('mirror')) return 'displayCase';
      if(type.includes('stove') || type.includes('sink') || type.includes('tub') || type.includes('microwave') || type.includes('espresso') || type.includes('dishwasher') || type.includes('fire') || type.includes('bbq')) return 'barrel';
      if(type.includes('shelf') || type.includes('bookcase')) return 'bookcaseWideBooks';
      if(type.includes('rug') || type.includes('mat')) return 'floorCarpet';
      if(type.includes('plant') || type.includes('tree') || type.includes('plot')) return 'hay';
      return 'crate'; // Generic fallback
    }

    syncFurniture(houseObj) {
      if(!houseObj || !houseObj.furniture) return;
      const charPos = Game.State.get().character && Game.State.get().character.position ? Game.State.get().character.position : {x: 0, y: 0};
      const activeFloor = Game.HomeGrowth && Game.HomeGrowth.getActiveFloor ? Game.HomeGrowth.getActiveFloor(houseObj) : (houseObj.activeFloor || 0);
      const visibleFurniture = houseObj.furniture.filter(furn => (furn.floor || 0) === activeFloor);
      
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
        // Data-Level Culling: Off-world chunks (>40 tiles away from active bounds) are entirely skipped
        if (Math.abs(furn.x - charPos.x) > 40 || Math.abs(furn.y - charPos.y) > 40) return;

        let sprite = spriteMap.get(furn.id);
        const fc = Game.Config.FURNITURE[furn.type];
        const textureKey = this.getTextureForFurn(furn.type, furn);
        
        if(!sprite) {
           sprite = this.add.image(0, 0, textureKey);
           sprite.setScale(0.25);
           sprite.setOrigin(0.5, 0.75); 
           spriteMap.set(furn.id, sprite);

           let shadow = this.add.image(0, 0, textureKey);
           shadow.setScale(0.25);
           shadow.setOrigin(0.5, 0.75);
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

           shadow.setScale(0.25 * 1.0, 0.25 * -sp.stretch);

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
      ? [0x42682f, 0x4d7438, 0x557d40, 0x3f6230]
      : [0x77aa64, 0x82b96e, 0x6fa15f, 0x8fbd73];
    const idx = Math.abs((x * 31 + y * 17 + x * y * 7) % palette.length);
    return palette[idx];
  }

  function init(canvasEl) {
    window.SIM_PRELOADED_IMAGES = window.SIM_PRELOADED_IMAGES || {};
    window.SIM_PRELOADED_AVATAR_IMAGES = window.SIM_PRELOADED_AVATAR_IMAGES || {};

    const entries = [
      ...Object.entries(window.SIM_ASSETS || {}).map(([key, src]) => ({ key, src, target: window.SIM_PRELOADED_IMAGES, isAvatar: false })),
      ...Object.entries(window.SIM_AVATAR_ASSETS || {}).map(([key, src]) => ({ key, src, target: window.SIM_PRELOADED_AVATAR_IMAGES, isAvatar: true })),
    ];

    if (entries.length === 0) {
        startPhaser(canvasEl);
        return;
    }
    let loadedCount = 0;
    for (const entry of entries) {
        let img = new Image();
        img.onload = () => {
            entry.target[entry.key] = img;
            loadedCount++;
            if (loadedCount === entries.length) {
                startPhaser(canvasEl);
            }
        };
        img.onerror = () => {
            console.error('Failed to load image for key:', entry.key);
            if (!entry.isAvatar) {
              entry.target[entry.key] = new Image();
            } else {
              delete entry.target[entry.key];
            }
            loadedCount++;
            if (loadedCount === entries.length) {
                startPhaser(canvasEl);
            }
        };
        img.src = entry.src;
    }
}

function startPhaser(canvasEl) {
    canvasEl = canvasEl || document.getElementById('game-canvas');
    if (typeof EasyStar !== 'undefined') {
      easyStar = new EasyStar.js();
      updatePathGrid();
    }

    if (canvasEl) canvasEl.style.display = 'block';
    const parentEl = (canvasEl && canvasEl.parentElement) || document.querySelector('.canvas-area') || document.body;

    // Phaser 4 removed Pipelines. TiltShift is now handled via CSS overlays.
    // Initialize Phaser
    const config = {
      type: Phaser.WEBGL,
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
    phaserGame = new Phaser.Game(config);
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
    const room = activeMap.rooms[Math.floor(Math.random() * activeMap.rooms.length)];
    return {
      x: room.x + Math.floor(Math.random() * room.w),
      y: room.y + Math.floor(Math.random() * room.h)
    };
  }

  function setBgDirty() {
    // Redraw room grid when rooms change
    if (mainScene && mainScene.drawHouseGrid) {
      mainScene.drawHouseGrid();
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
    }
  };
})();
