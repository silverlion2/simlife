// ============================================================
// SimLife — Phaser 3 Isometric Renderer
// ============================================================
// Phase 1 Migration: Basic Grid & Isometric Projections

window.Game = window.Game || {};

Game.Renderer = (function() {
  let phaserGame = null;
  let mainScene = null;
  let easyStar = null;
  
  // Grid metrics
  const TILE_W = 64;
  const TILE_H = 32;

  let spriteMap = new Map();
  let characterSprite = null;
  let buildGhostSprite = null;
  let npcSpriteMap = new Map();
  let debugGraphics = null;
  window.DEBUG_BOUNDS = false;

  class MainScene extends Phaser.Scene {
    constructor() {
      super({ key: 'MainScene' });
    }

    preload() {
      // -------------------------------------------------------------
      // PHASE 3 INTEGRATION: Real Asset Loading (Kenney.nl)
      // -------------------------------------------------------------
      // We load the 256x512 Kenney Isometric Farm assets
      this.load.image('floor', 'assets/kenney_minifarm/Isometric/dirt_E.png');
      this.load.image('planks', 'assets/kenney_minifarm/Isometric/planks_E.png');
      this.load.image('wall_e', 'assets/kenney_minifarm/Isometric/woodWall_E.png');
      this.load.image('wall_n', 'assets/kenney_minifarm/Isometric/woodWall_N.png');
      this.load.image('character', 'assets/kenney_minifarm/Isometric/corn_E.png'); // legacy fallback
      this.load.image('new_iso_human', 'assets/characters/new_iso_human.png'); // new genuine 3D char
      this.load.image('hay', 'assets/kenney_minifarm/Isometric/hayBales_E.png');
      this.load.image('hayStack', 'assets/kenney_minifarm/Isometric/hayBalesStacked_E.png');
      this.load.image('crate', 'assets/kenney_minifarm/Isometric/sacksCrate_E.png');
      this.load.image('chimney', 'assets/kenney_minifarm/Isometric/chimneyTop_E.png');
      this.load.image('fence', 'assets/kenney_minifarm/Isometric/fenceLow_E.png');

      // NEW Kenney Asset Packs
      // Library Pack
      this.load.image('longTable', 'assets/kenney_library/Isometric/longTable_E.png');
      this.load.image('libraryChair', 'assets/kenney_library/Isometric/libraryChair_E.png');
      this.load.image('bookcaseWideBooks', 'assets/kenney_library/Isometric/bookcaseWideBooks_E.png');
      this.load.image('floorCarpet', 'assets/kenney_library/Isometric/floorCarpet_E.png');
      this.load.image('displayCase', 'assets/kenney_library/Isometric/displayCase_E.png');

      // Dungeon Pack
      this.load.image('chestClosed', 'assets/kenney_dungeon/Isometric/chestClosed_E.png');
      this.load.image('tableShort', 'assets/kenney_dungeon/Isometric/tableShort_E.png');
      this.load.image('barrel', 'assets/kenney_dungeon/Isometric/barrel_E.png');
      // Library Specifics (displayCase already loaded above)
      this.load.image('candleStand', 'assets/kenney_library/Isometric/candleStand_E.png');
      this.load.image('decoratedTable', 'assets/kenney_library/Isometric/longTableDecorated_E.png');
      this.load.image('wideBookcase', 'assets/kenney_library/Isometric/bookcaseWideBooks_E.png');

      // Load new custom SVG forms
      this.load.image('human_iso', 'assets/characters/human.svg');
      this.load.image('robot_iso', 'assets/characters/robot.svg');
      this.load.image('cat_iso', 'assets/characters/cat.svg');
      this.load.image('banana_iso', 'assets/characters/banana.svg');
      this.load.image('online_witch_iso', 'assets/characters/online_witch.png');
      this.load.image('online_witch_N_iso', 'assets/characters/online_witch_N.png');
      this.load.image('online_witch_S_iso', 'assets/characters/online_witch_S.png');
      this.load.image('online_witch_E_iso', 'assets/characters/online_witch_E.png');
      this.load.image('online_witch_NE_iso', 'assets/characters/online_witch_NE.png');
      this.load.image('online_witch_SE_iso', 'assets/characters/online_witch_SE.png');
    }

    create() {
      mainScene = this;
      this.cameras.main.setBackgroundColor('#2E7D32');
      
      // Stop context menu from appearing on right click
      this.input.mouse.disableContextMenu();

      // Setup interaction camera controls
      this.input.on('pointermove', (pointer) => {
        if (!pointer.isDown) {
            this.handleHover(pointer);
            return;
        }
        if (pointer.button === 1 || pointer.button === 2) {
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
      this.shadowOverlay = this.add.rectangle(window.innerWidth/2, window.innerHeight/2, window.innerWidth, window.innerHeight, 0x040822);
      this.shadowOverlay.setScrollFactor(0);
      this.shadowOverlay.setDepth(800000);
      this.shadowOverlay.setAlpha(0);

      this.input.keyboard.on('keydown-B', () => {
          window.DEBUG_BOUNDS = !window.DEBUG_BOUNDS;
          document.dispatchEvent(new CustomEvent('notification', { detail: { message: window.DEBUG_BOUNDS ? '🔍 Debug Overlays: ON' : '🔍 Debug Overlays: OFF' }}));
      });

      debugGraphics = this.add.graphics();
      debugGraphics.setDepth(999999);

      // Draw static grid representing the house rooms/lot
      this.drawHouseGrid();
    }

    drawHouseGrid() {
      const activeMap = Game.State.getActiveMap();
      if(!activeMap) return;
      const w = activeMap.lotWidth || 10;
      const h = activeMap.lotHeight || 10;
      
      this.frontWalls = []; // Track obscuring walls
      
      // Draw a grid of floor tiles
      for(let y=0; y<h; y++){
        for(let x=0; x<w; x++){
          const pt = isoProject(x, y);
          const tile = this.add.image(pt.x, pt.y, 'floor');
          tile.setScale(0.25);
          tile.setOrigin(0.5, 0.5); 
          tile.depth = (x + y) * 10 - 5; // Floor is always at bottom

          // Check if this tile is inside a room
          let inRoom = false;
          let isTopEdge = false;
          let isLeftEdge = false;
          let isRightEdge = false;
          let isBottomEdge = false;

          const roomsList = activeMap.rooms || [];
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
            
            // Draw isometric walls explicitly on the tile
            if (isTopEdge) {
               const wall = this.add.image(pt.x, pt.y, 'wall_n');
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.5); 
               wall.depth = (x + y) * 10 - 1; 
            }
            if (isLeftEdge) {
               const wall = this.add.image(pt.x, pt.y, 'wall_e');
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.5); 
               wall.depth = (x + y) * 10 - 1; 
            }
            
            // Front walls (Occluding the room)
            if (isBottomEdge) {
               const ptF = isoProject(x, y+1); // Push to edge
               const wall = this.add.image(ptF.x, ptF.y, 'wall_n');
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.5); 
               wall.depth = (x + y + 1) * 10 - 1; 
               this.frontWalls.push({ sprite: wall, room: roomsList.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) });
            }
            if (isRightEdge) {
               const ptF = isoProject(x+1, y); // Push to edge
               const wall = this.add.image(ptF.x, ptF.y, 'wall_e');
               wall.setScale(0.25);
               wall.setOrigin(0.5, 0.5); 
               wall.depth = (x + 1 + y) * 10 - 1; 
               this.frontWalls.push({ sprite: wall, room: roomsList.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) });
            }
          } else {
            tile.setTexture('floor');
            tile.setTint(0x88cc88); // Green grass color for outside
          }
        }
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
               if (!sprite.glowFx) {
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

      this.syncCharacter(state.character);
      this.syncFurniture(Game.State.getActiveMap());
      this.syncBuildGhost(state.ui.buildGhost);
      this.syncPets(state.pets);
      this.updateCutawayWalls(state.character);
      if (this.syncNPCs) this.syncNPCs(state.npcWalkers);
      
      // Only re-sort depth when positions have changed (dirty flag set by movement/sync)
      if (this._depthDirty) {
        this.updateDepthSorting();
        this._depthDirty = false;
      }
      
      // Time of day shadow map (use actual time state, not raw gameTime)
      const hour = state.time.hour || 0;
      let darkness = 0;
      if (hour < 6 || hour > 19) darkness = 0.55;
      else if (hour >= 6 && hour < 8) darkness = 0.55 - ((hour - 6)/2)*0.55;
      else if (hour >= 17 && hour <= 19) darkness = ((hour - 17)/2)*0.55;
      if (this.shadowOverlay) this.shadowOverlay.setAlpha(darkness);

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
                  sprite: sprite, rx: p.position.x, ry: p.position.y, rw: 1, rh: 1, type: 'pet', z: p.position.z || 0
               });
            }
        }
        
        // NPCs
        const activeWalkers = Game.State.get().npcWalkers || [];
        for (const n of activeWalkers) {
             const spriteGroup = npcSpriteMap ? npcSpriteMap.get(n.id) : null;
             if (spriteGroup && n.active) {
                 renderables.push({
                    sprite: spriteGroup, rx: n.position.x, ry: n.position.y, rw: 1, rh: 1, type: 'npc', z: 0
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
                   sprite: sprite,
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
           return (a.z !== b.z) ? a.z - b.z : 0;
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
        buildGhostSprite.setOrigin(0.5, 0.5);
      }
      
      buildGhostSprite.setVisible(true);

      if (ghost.type === 'furniture') {
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

    syncCharacter(charObj) {
      if(!charObj || !charObj.position) return;
      
      // Mark depth dirty whenever character truly moves
      if (!this._lastCharPos || this._lastCharPos.x !== charObj.position.x || this._lastCharPos.y !== charObj.position.y || this._lastCharPos.z !== charObj.position.z) {
          this._depthDirty = true;
          this._lastCharPos = { ...charObj.position };
      }
      
      let formKey = (charObj.form || 'online_witch') + '_iso';
      if (formKey === 'human_iso' || formKey === 'nano_hero_iso') formKey = 'online_witch_iso'; // Map legacy forms to the Witch
      
      if(!characterSprite) {
        // Draw a bright circle as the character base marker
        this.charMarker = this.add.circle(0, 0, 12, 0x4488FF, 0.8);
        this.charMarker.setStrokeStyle(2, 0xFFFFFF, 1);
        
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
        
        // Elastic cinematic camera tracking
        this.cameras.main.startFollow(characterSprite, true, 0.05, 0.05);
        
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
      if (!this.charShadow) {
           this.charShadow = this.add.ellipse(0, 0, 24, 12, 0x000000, 0.4);
      }
      
      const ptGround = isoProject(charObj.position.x, charObj.position.y, 0);
      const ptActual = isoProject(charObj.position.x, charObj.position.y, charObj.position.z || 0);
      const pt = ptActual; // Legacy support bridging

      this.charShadow.setPosition(ptGround.x, ptGround.y);
      this.charShadow.depth = ((charObj.position.x + charObj.position.y) * 10) - 1;

      // When the character jumps, shrink the shadow slightly
      const shadowScale = Math.max(0.2, 1 - (charObj.position.z || 0) * 0.15);
      this.charShadow.setScale(shadowScale);

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
      
      // Optional: don't tint the SVG entirely unless wanted, or maybe just tint
      // But Since SVGs are colored we might want to just set a light tint or no tint at all.
      // Let's remove the global tint for the new SVG characters so they retain their colors!
      characterSprite.clearTint();
      
      const depth = (charObj.position.x + charObj.position.y) * 10 + 5;
      characterSprite.depth = depth;
      
      if (this.charMarker) {
        this.charMarker.setPosition(pt.x, pt.y + 4);
        this.charMarker.depth = depth - 1;
      }
      if (this.charLabel) {
        this.charLabel.setText(charObj.name || '🧑 You');
        this.charLabel.setPosition(pt.x, pt.y - 45); // Move name up slightly to make room
        this.charLabel.depth = depth + 1;
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
         this.thoughtBubbleContainer.depth = depth + 10;
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
            this.thoughtBubbleContainer.depth = depth + 10;
            this.thoughtBubbleContainer.setVisible(true);
         } else {
            this.thoughtBubbleContainer.setVisible(false);
         }
      }
    }

    getTextureForFurn(type, furnState) {
      if(type === 'display_case') return 'displayCase';
      if(type === 'candle_stand') return 'candleStand';
      if(type === 'decorated_table') return 'decoratedTable';
      if(type === 'wide_bookcase') return 'wideBookcase';
      if(type === 'cushion') return 'floorCarpet';

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
      
      houseObj.furniture.forEach(furn => {
        // Data-Level Culling: Off-world chunks (>40 tiles away from active bounds) are entirely skipped
        if (Math.abs(furn.x - charPos.x) > 40 || Math.abs(furn.y - charPos.y) > 40) return;

        let sprite = spriteMap.get(furn.id);
        const fc = Game.Config.FURNITURE[furn.type];
        const textureKey = this.getTextureForFurn(furn.type, furn);
        
        if(!sprite) {
           sprite = this.add.image(0, 0, textureKey);
           sprite.setScale(0.25);
           sprite.setOrigin(0.5, 0.5); 
           spriteMap.set(furn.id, sprite);
        } else {
           if (sprite.texture.key !== textureKey) {
               sprite.setTexture(textureKey);
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
        
        // Occlusion Fading (X-Ray Vision) if it blocks the character
        const char = Game.State.get().character;
        if (char && char.position) {
           const cx = char.position.x;
           const cy = char.position.y;
           // If furniture depth > character depth, it's drawn IN FRONT of character
           if (sprite.depth > (cx + cy) * 10) {
               // Approximate distance check 
               const dist = Math.sqrt(Math.pow(furn.x + curW/2 - 0.5 - cx, 2) + Math.pow(furn.y + curH/2 - 0.5 - cy, 2));
               if (dist < Math.max(curW, curH) + 0.5 && (cx <= furn.x + curW && cy <= furn.y + curH)) {
                  sprite.setAlpha(0.4);
               } else {
                  sprite.setAlpha(1.0);
               }
           } else {
               sprite.setAlpha(1.0);
           }
        } else {
           sprite.setAlpha(1.0);
        }
      });
    }

    syncPets(pets) {
      if (!pets) return;
      if (!this.petSpriteMap) this.petSpriteMap = new Map();
      pets.forEach(pet => {
         let sprite = this.petSpriteMap.get(pet.id);
         if (!sprite) {
             sprite = this.add.text(0, 0, '🐈', { fontSize: '24px' }).setOrigin(0.5, 0.5);
             this.petSpriteMap.set(pet.id, sprite);
         }
         
         const ptGround = isoProject(pet.position.x, pet.position.y, 0);
         const ptActual = isoProject(pet.position.x, pet.position.y, pet.position.z || 0);
         
         if (!sprite.shadow) {
            sprite.shadow = this.add.ellipse(0, 0, 16, 8, 0x000000, 0.4);
         }
         
         sprite.shadow.setPosition(ptGround.x, ptGround.y);
         sprite.shadow.depth = ((pet.position.x + pet.position.y) * 10) - 1;
         
         const shadowScale = Math.max(0.2, 1 - (pet.position.z || 0) * 0.15);
         sprite.shadow.setScale(shadowScale);

         if (sprite.x !== ptActual.x || sprite.y !== ptActual.y) {
             this._depthDirty = true;
             sprite.setPosition(ptActual.x, ptActual.y);
             sprite.depth = (pet.position.x + pet.position.y) * 10;
         }
         
         // Flip horizontally based on movement direction
         if (pet.targetPosition) {
             sprite.setFlipX(pet.targetPosition.x < pet.position.x);
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
               ease: 'Sine.easeInOut'
            });
         }
      });
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
  let _isoOffsetX = window.innerWidth / 2;
  const _isoOffsetY = 200;
  window.addEventListener('resize', () => { _isoOffsetX = window.innerWidth / 2; });

  // Pure Isometric Math: Cartesian (gridX, gridY, gridZ) to Screen (scX, scY)
  function isoProject(gx, gy, gz = 0) {
    return {
      x: _isoOffsetX + (gx - gy) * (TILE_W / 2),
      y: _isoOffsetY + (gx + gy) * (TILE_H / 2) - (gz * TILE_H)
    };
  }
  
  // Inverse: Screen (scX, scY) to Cartesian (gridX, gridY)
  function isoUnproject(sx, sy, gz = 0) {
    const dx = sx - _isoOffsetX;
    const dy = sy - _isoOffsetY + (gz * TILE_H);
    return {
      x: (dy / (TILE_H / 2) + dx / (TILE_W / 2)) / 2,
      y: (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2
    };
  }

  function init(canvasEl) {
    canvasEl = canvasEl || document.getElementById('game-canvas');
    if (typeof EasyStar !== 'undefined') {
      easyStar = new EasyStar.js();
      updatePathGrid();
    }

    // Hide the old vanilla canvas, because Phaser will create its own inside the container.
    if (canvasEl) canvasEl.style.display = 'none';

    // Initialize Phaser
    const config = {
      type: Phaser.WEBGL,
      width: window.innerWidth,
      height: window.innerHeight,
      parent: canvasEl.parentElement, // .canvas-area
      scene: MainScene,
      transparent: true,
      antialias: false,
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
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
      mainScene.cameras.main.scrollX += dx;
      mainScene.cameras.main.scrollY += dy;
    }
  }
  
  function adjustZoom(step) {
    if(mainScene) {
      mainScene.cameras.main.zoom = Math.max(0.25, Math.min(4, mainScene.cameras.main.zoom + step));
    }
  }
  
  function showPieMenu(x, y, title, items) {
    if (mainScene) mainScene.showPieMenu(x, y, title, items);
  }
  function closePieMenu() {
    if (mainScene) mainScene.closePieMenu();
  }

  function hitTestFurniture(gx, gy) {
    const activeMap = Game.State.getActiveMap();
    if (!activeMap) return null;
    for (const furn of activeMap.furniture) {
      const fc = Game.Config.FURNITURE[furn.type];
      if (!fc) continue;
      const w = furn.rotated ? fc.h : fc.w;
      const h = furn.rotated ? fc.w : fc.h;
      if (gx >= furn.x && gx < furn.x + w && gy >= furn.y && gy < furn.y + h) {
        return { ...furn, config: fc };
      }
    }
    return null;
  }

  function hitTestRoom(gx, gy) {
    const activeMap = Game.State.getActiveMap();
    if (!activeMap) return null;
    for (const room of activeMap.rooms) {
      if (gx >= room.x && gx < room.x + room.w && gy >= room.y && gy < room.y + room.h) {
        return room;
      }
    }
    return null;
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
      // Clear old grid graphics and redraw
      mainScene.children.list
        .filter(c => c.texture && (c.texture.key === 'floor' || c.texture.key === 'planks' || c.texture.key === 'wall' || c.texture.key === 'fence'))
        .forEach(g => g.destroy());
      mainScene.drawHouseGrid();
    }
    updatePathGrid();
  }

  function updatePathGrid() {
    if (!easyStar) return;
    const activeMap = Game.State.getActiveMap();
    if (!activeMap) return;
    
    const w = activeMap.lotWidth || 10;
    const h = activeMap.lotHeight || 10;
    const grid = [];
    
    for (let y = 0; y < h; y++) {
      grid[y] = [];
      for (let x = 0; x < w; x++) grid[y][x] = 0;
    }
    
    if (activeMap.furniture) {
      for (const furn of activeMap.furniture) {
         const fc = Game.Config.FURNITURE[furn.type];
         if (!fc) continue;
         for (let fy = 0; fy < fc.h; fy++) {
           for (let fx = 0; fx < fc.w; fx++) {
             const px = Math.floor(furn.x) + fx;
             const py = Math.floor(furn.y) + fy;
             if (px >= 0 && py >= 0 && px < w && py < h) {
               if (!furn.type.includes('rug') && !furn.type.includes('portal') && !furn.type.includes('door') && !furn.type.includes('mat')) {
                 grid[py][px] = 1;
               }
             }
           }
         }
      }
    }
    easyStar.setGrid(grid);
    easyStar.setAcceptableTiles([0]);
    easyStar.enableDiagonals();
    easyStar.disableCornerCutting();
  }

  function findPath(sx, sy, ex, ey, callback) {
    if (!easyStar) {
       callback([{x: ex, y: ey}]); // Fallback
       return;
    }
    easyStar.findPath(sx, sy, ex, ey, callback);
  }

  function transitionMap() {

    spriteMap.forEach(sprite => sprite.destroy());
    spriteMap.clear();
    setBgDirty();
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
    showPieMenu,
    closePieMenu,
    spawnFloatingBubble,
    findPath
  };
})();
