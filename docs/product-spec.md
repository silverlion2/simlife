# SimLife Product Specification

## Outcome

Make a single-player life-sim that is readable at a glance, pleasant to play in Electron, and easy to continue in short sessions. The immediate quality bar is: boot reliably, show an inviting home scene, make the next useful action obvious, and keep the HUD from blocking play on desktop or mobile-sized windows.

## Users and jobs

- Solo player: starts a local world, cares for a Sim, improves the home, and follows goals without reading external instructions.
- Returning player: loads a local save and quickly understands needs, current activity, money, goals, and available interactions.
- Builder player: expands rooms, places furniture, stores objects, renovates rooms, and sees the effect of those changes immediately.

## Scope

### Included

- Browser/Electron runtime using the existing static files.
- Character creation, local saves, needs, activities, careers, social, home goals, collections, build, storage, renovation, and first-day guidance.
- Desktop and mobile-width HUD layouts.
- Automated pure/Electron coverage through `npm test` plus a maintained real-Chrome desktop/mobile smoke through `npm run test:browser`.

### Excluded

- Online multiplayer, cloud saves, analytics, and production web hosting.
- Large new asset pipeline changes unless a gameplay screen needs them.
- Broad framework migration; the current static module layout remains the contract.

## Journeys

- First-time journey: create a Sim, enter the home, follow Daily Focus, start one activity, then choose career/goals.
- Returning journey: load a save, scan needs/activity/focus, resume the next useful loop.
- Build journey: open Build, pick Rooms/Furniture/Storage/Renovate tab, take one action, return to the playfield.
- Recovery journey: blocked build/activity actions show a notification instead of silently failing.

## Success metrics

| Metric | Baseline | Target | Measurement |
|---|---:|---:|---|
| Electron boot smoke | Clean-host gate | Passing on every PR/release host, including the installed NSIS executable on Windows CI | `npm test` and Windows installer lifecycle evidence |
| Rendered canvas | Passing in real Chrome | One nonblank canvas, no page/console errors, WebGL with Canvas fallback | `npm run test:browser` and Electron smoke |
| Mobile menu weight | 10 persistent buttons | 5 persistent buttons, rest in More drawer | Visual check |
| Mobile HUD | Campaign context could disappear | Chapter context, seven needs, five primary actions, and no horizontal overflow at 390×844 | Real-browser assertions and screenshot |
| First activity feedback | Delayed/implicit | HUD updates immediately after click | Visual and DOM check |

## Decisions

- 2026-07-26: Keep gameplay as the first screen after character creation; do not add a separate landing page.
- 2026-07-26: Use Daily Focus for first-day onboarding instead of modal tutorials so the playfield stays visible.
- 2026-07-26: Mobile HUD keeps Build, Goals, Do, Menu, and More visible; secondary panels live in the More drawer.
- 2026-07-26: Build panel uses tabs to reduce scrolling and accidental taps while preserving existing functionality.
- 2026-08-07: Ship the polished game as **SimLife: Hearthbyte Edition**, a complete retro-cozy campaign layered over the existing simulation.
- 2026-08-07: Preserve the static `window.Game` module architecture and current saves; add migration-safe campaign and settings state instead of a framework rewrite.
- 2026-08-07: Make the first playable frame world-forward: a closer default camera, compact objective tracker, and no blocking tutorial.
- 2026-08-07: Replace the reload-only in-game Menu action with a true pause surface containing resume, save, settings, controls, and main-menu actions.
- 2026-08-07: Bundle Phaser locally so the Electron game remains playable without a network connection.
- 2026-08-08: Replace the dark cartridge shell with a bright storybook presentation across menu, creator, gameplay HUD, dialogs, and pause; keep CRT scanlines available but off by default.
- 2026-08-08: Add repeatable Electron visual capture through `npm run test:visual` for desktop and mobile review.
- 2026-08-08: Complete the engine-wide visual pass across every system panel and transient overlay; fix zoom-aware camera centering, landscape the starter lot, and limit room labels to build mode.
- 2026-08-09: Expand the offline world catalog from 48 to 130 embedded textures, including 32 custom household sprites, and require distinct silhouettes instead of generic furniture fallbacks.
- 2026-08-09: Restore all eight career tracks with dedicated workplace maps and validate career, map, activity, room, furniture, and footprint contracts in the automated suite.
- 2026-08-09: Harden save import/export and legacy migration against malformed storage, and invalidate stale asynchronous paths across cancellations and map transitions.
- 2026-08-22: Preserve the static module facade while adding deterministic services, save schema v2, registered UI panels, grouped asset readiness, Canvas fallback, and independently runnable pure/Electron verification gates.
- 2026-08-22: Keep campaign objectives in the top campaign chip; reserve Daily Focus for urgent needs, current activity, queue state, rewards, and contextual next actions.
- 2026-08-23: Keep the browser and Electron composition roots at repository root, declare `js/` and `css/` as source roots, and isolate generated evidence under `artifacts/`. Any relocation of legacy files requires the move map in `docs/improvement-proposals.md` to be reviewed first.
- 2026-08-24: Use one target-aware activity availability contract for manual play, interaction menus, queues, and autonomy; failed paths and invalid targets never award effects.
- 2026-08-24: Make save creation, import, and existing-slot updates rollback-safe; validate nested map data, persistent collections, and file resource limits before changing the live world.
- 2026-08-24: Treat events, Sim Makeover, pause, and renderer recovery as input-isolating surfaces that preserve the previous simulation speed and keyboard focus.
- 2026-08-24: Keep Appearance ahead of Traits on mobile creation and retain a compact persistent campaign chip above the mobile playfield.
- 2026-09-09: Treat unpacked package smoke and installed lifecycle verification as separate release gates. Windows CI must install the NSIS candidate for the current user, launch that installed executable through the full offline save/load journey, silently uninstall it, and retain machine-readable cleanup evidence without claiming signing or production approval.

## Hearthbyte Edition release loop

The player creates a Sim, enters a furnished starter home, and advances through an eight-chapter "New Roots" campaign while freely using every sandbox system. Each chapter has one legible objective, an immediate reward, and an explicit next step. The campaign starts with basic self-care and careers, then introduces goals, furnishing, skills, relationships, home growth, and collections.

The release is considered fully playable when:

- A new player can start, understand the next action, complete activities, pause, save, and return to the main menu without external instructions.
- The campaign persists across local saves and migrates old saves without data loss.
- Keyboard, pointer, and mobile-width layouts preserve access to primary actions.
- Closing, backgrounding, or retrying renderer recovery makes a best-effort save without leaving a partial slot/index transaction.
- The Electron runtime boots and renders with network access disabled.
- Desktop and mobile screenshots show a readable world, objective, needs, and controls without blocking the central playfield.
