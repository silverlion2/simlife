# the-game Test Matrix

| Scenario | Input or precondition | Expected outcome | Type | Automated |
|---|---|---|---|---|
| Electron boot | New character from main menu | Gameplay state, visible canvas, loaded assets | E2E | Yes, `npm test` |
| Render health | Starter world | Nonblank canvas, varied colors, one Phaser canvas | Visual smoke | Yes, `npm test` |
| Avatar assets | Generated avatar catalog | No missing initial robot textures, saved forms render | E2E | Yes, `npm test` |
| Camera controls | Pan and center actions | Finite scroll/focus values and follow reset | E2E | Yes, `npm test` |
| Object market | Open Market and buy offer | Offer list renders, inventory increases | E2E | Yes, `npm test` |
| Collections | Open Collections and claim ready set | Ready claims work and panel refreshes | E2E | Yes, `npm test` |
| Home goals | Open Goals | Active goal cards and disabled incomplete claims render | E2E | Yes, `npm test` |
| Build renovate tab | Open Build, switch Renovate | Layout, resize, furnish, floor, and lot controls render | E2E | Yes, `npm test` |
| Family assignments | Seed household members | Routine buttons render and assignment state updates | E2E | Yes, `npm test` |
| Mobile HUD | 390×844 viewport | Seven needs fit in at most two rows, HUD is at most 270px tall, and five persistent menu buttons remain visible | E2E + visual | Yes, `npm test`, plus manual screenshot |
| Activity feedback | Start activity from mobile Activities panel | Panel closes and HUD immediately shows active movement | Visual | Manual screenshot |
