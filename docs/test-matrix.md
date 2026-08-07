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
| Keyboard shortcuts | Use Space, 1-3, C/Home, B, J, and Escape | Pause, speed, camera, build, journal, and pause shell perform the documented action | E2E | Yes, `npm test` |
