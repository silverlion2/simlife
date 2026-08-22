# the-game Test Matrix

| Scenario | Input or precondition | Expected outcome | Type | Automated |
|---|---|---|---|---|
| Electron boot | New character from main menu | Gameplay state, visible canvas, loaded assets | E2E | Yes, `npm test` |
| Render health | Starter world | Nonblank canvas, varied colors, one Phaser canvas | Visual smoke | Yes, `npm test` |
| Avatar assets | Generated avatar catalog | No missing initial robot textures, saved forms render | E2E | Yes, `npm test` |
| Avatar creation preview | Open character creation and switch forms | Selected avatar renders from loaded layered sprite art instead of a placeholder silhouette | E2E + visual | Yes, `npm test`, plus manual screenshot |
| Camera controls | Pan and center actions | Finite scroll/focus values and follow reset | E2E | Yes, `npm test` |
| Initial camera framing | Start gameplay at desktop width | Starter home is the dominant playfield subject while mobile retains full-room context | Visual | Manual desktop and mobile screenshots |
| Object market | Open Market and buy offer | Offer list renders, inventory increases | E2E | Yes, `npm test` |
| Collections | Open Collections and claim ready set | Ready claims work and panel refreshes | E2E | Yes, `npm test` |
| Home goals | Open Goals | Active goal cards and disabled incomplete claims render | E2E | Yes, `npm test` |
| Build renovate tab | Open Build, switch Renovate | Layout, resize, furnish, floor, and lot controls render | E2E | Yes, `npm test` |
| Family assignments | Seed household members | Routine buttons render and assignment state updates | E2E | Yes, `npm test` |
| Mobile HUD | 390×844 viewport | Seven needs fit in at most two rows, HUD is at most 270px tall, and five persistent menu buttons remain visible | E2E + visual | Yes, `npm test`, plus manual screenshot |
| Activity feedback | Start activity from mobile Activities panel | Panel closes and HUD immediately shows active movement | Visual | Manual screenshot |
| Offline engine boot | Block all external network requests and launch Electron | Main menu and gameplay render from local dependencies | E2E | Yes, `npm test` |
| Campaign migration | Load a legacy state without `campaign` | Campaign defaults are added without changing existing progression | Unit | Yes, `npm test` |
| Campaign progression | Complete the active chapter condition | Chapter completes once, reward is granted once, next objective appears | Unit + E2E | Yes, `npm test` |
| Pause shell | Press Escape during live play | Simulation pauses; resume restores the previous speed | E2E | Yes, `npm test` |
| Settings persistence | Toggle audio, scanlines, or reduced motion | Preference applies immediately and persists after reload | E2E | Yes, `npm test` |
| Retro HUD | Desktop and 390x844 viewport | Campaign objective, needs, and primary commands remain readable without central obstruction | Visual | Manual screenshots |
| Storybook presentation | Menu, creator, gameplay, all system panels, event, notifications, announcer, interaction wheel, placement, pause, and runtime recovery at desktop/mobile widths | Teal/ivory/gold/coral semantics remain consistent, the world stays centered and saturated, controls do not clip, and transient layers do not collide | Visual smoke | Yes, 30 screenshots via `npm run test:visual`, plus screenshot review |
| World asset variety | Load a fresh starter home and enumerate furniture mappings | 125+ embedded world textures, 30+ distinct furniture mappings, 28+ generated household categories, 32 distinct 256x256 custom sprites, and no missing textures | Resource + E2E + visual | Yes, `npm test`, plus desktop/mobile gameplay screenshots |
| Built-in map integrity | Validate every default map | Known room/furniture types, valid room references, in-bounds footprints, and no furniture overlaps | Unit | Yes, `npm test` |
| Career contract | Enumerate every career | Eight careers, five progression levels, valid workplace/action references, and an available activity target | Unit | Yes, `npm test` |
| Save corruption recovery | Load malformed index, legacy, slot, and import payloads | Menu remains usable, invalid data is rejected, and recoverable legacy data is preserved | Unit | Yes, `npm test` |
| Travel and path lifecycle | Complete portal/subway travel and cancel an in-flight path request | Map transition completes, travel achievement records, and stale callbacks cannot resume movement | Unit | Yes, `npm test` |
| Keyboard shortcuts | Use Space, 1-3, C/Home, B, J, and Escape | Pause, speed, camera, build, journal, and pause shell perform the documented action | E2E | Yes, `npm test` |
| Foundation services | Seed randomness, subscribe/unsubscribe signals, enumerate asset groups | Random sequences repeat, signals detach, and all stable asset groups exist | Unit | Yes, `npm run test:pure` |
| Save schema v2 | Load a versionless/v1 save with unknown fields | Ordered migration reaches v2, preserves unknown fields, and remains idempotent | Unit | Yes, `npm run test:pure` |
| Trait contract | Exercise Neat, Lazy, Creative, Athletic, Charming, and Glutton effects | Configured decay, duration, cost, nap, and relationship multipliers affect simulation | Unit | Yes, `npm run test:pure` |
| Verification isolation | Run pure and Electron scopes independently | Each scope reports its own result; delayed Windows temp deletion cannot mask passing gameplay assertions | Integration | Yes, `npm run test:pure`, `npm run test:electron` |
| Runtime recovery states | Simulate loading, partial assets, and renderer failure | Accessible overlay explains state and offers retry on failure | Visual | Yes, `npm run test:visual` |
