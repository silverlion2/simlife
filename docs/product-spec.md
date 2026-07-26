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
- Automated smoke coverage through `npm test`.

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
| Electron boot smoke | Passing | Passing on every PR | `npm test` |
| Rendered canvas | Nonblank | Colored pixels, 4+ buckets, no missing avatar textures | `scripts/verify-game.js` |
| Mobile menu weight | 10 persistent buttons | 5 persistent buttons, rest in More drawer | Visual check |
| First activity feedback | Delayed/implicit | HUD updates immediately after click | Visual and DOM check |

## Decisions

- 2026-07-26: Keep gameplay as the first screen after character creation; do not add a separate landing page.
- 2026-07-26: Use Daily Focus for first-day onboarding instead of modal tutorials so the playfield stays visible.
- 2026-07-26: Mobile HUD keeps Build, Goals, Do, Menu, and More visible; secondary panels live in the More drawer.
- 2026-07-26: Build panel uses tabs to reduce scrolling and accidental taps while preserving existing functionality.
