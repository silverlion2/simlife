# 🧠 Memory & State

## 📌 Milestones
- [x] Project initialized as a direct-launch static browser game
- [x] Isometric rendering engine migration (Phaser 4 with automatic WebGL/Canvas selection)
- [x] Collision & Pathfinding (easystarjs & navmesh integrations)
- [x] State management and autonomy refactor (static `Game.State` plus Rex state machine)
- [x] Z-Index Architecture (dynamic room bounds, elliptical shadows)
- [x] Map Topologies & Scene Transitions (subways, portals, downtown, home)
- [x] Tablet UI & Economy components (mini-games, jobs, narrative tracking)
- [x] Dynamic Farming Economy Loop (Crop scaling, Pie Menu mapping, Financial hooks)
- [x] Core source code written
- [x] Sandbox Building Mode (Economy bypass toggle)
- [x] Add regression tests inside subagent loops
- [x] Standalone Electron packaging and optional Steamworks integration
- [x] Documentation started (Architectural walkthroughs, KI summaries)
- [x] Autonomous visual asset generation pipeline (Worn-out isometric voxel style)
- [x] Rendering Pipeline Repair (asset preloading bootstrap, main_atlas elimination, Kenney wall alignment)
- [x] Engine modularization and advanced FX (asset extraction, weather particles, and pet shadow physics)
- [x] Visual Graphics Upgrade & Resource Verification (procedural terrain backdrop, ambient scenery, responsive HUD, runtime smoke test)
- [x] Engine integrity pass (save corruption recovery, travel, path lifecycle, map footprints, economy/achievement state)
- [x] Eight-career workplace restoration and 130-texture/32-custom-sprite asset expansion
- [x] Technical Foundation v2 (deterministic randomness, signal bus, save schema v2 migrations, grouped asset readiness, Phaser renderer fallback, and split pure/Electron verification)
- [x] Trait behavior parity (need decay, moodlet duration, naps, activity energy, skill XP, relationships, and breakage)
- [x] UI foundation cleanup (registered panels, delegated actions, contextual Daily Focus, and explicit loading/partial/error recovery surfaces)

## 🧱 Pending Blockers
- Re-run the Electron aggregate gate five times and recapture the expanded visual set on a clean Windows host; the current Codex host rejects Chromium renderer children with `launch-failed 49` before app code.
- Restore the project-local `web-sop` CLI before the next production release gate.

## 📊 Pipeline Stats

- **Baseline commits:** 44 before the Foundation v2 handoff
- **Tracked files:** 3,107, dominated by the local offline art library
- **Verified catalogs:** 82 furniture types, 130 world assets, 1,000 avatar layers, and 3,040 PNG resources
- **Runtime:** Static `window.Game` modules, Phaser 4, Electron, EasyStar, localStorage save slots, and fully local assets
