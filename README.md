# 🏡 SimLife: Hearthbyte Edition

A cozy offline-first life simulation for browsers and Electron. Build an isometric home, guide an autonomous character, grow through eight careers, form relationships, follow the eight-chapter New Roots campaign, and preserve each world in migration-safe local saves.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)

## ✨ Features

- **🤖 Autonomous AI** — Your Sim thinks for themselves, evaluating needs and picking the best action when idle
- **🎯 Radial Pie Menus** — Click furniture for Sims-style contextual interaction menus
- **📋 Action Queue** — Shift+Click to queue up multiple actions; your Sim executes them in order
- **😊 Moodlet System** — Stackable mood buffs from activities ("Well Rested", "Home Cooked", "Pumped Up")
- **🏗️ Build Mode** — Place rooms and furniture on an isometric 2.5D lot
- **💼 8 Career Tracks** — Dedicated workplaces, activities, requirements, and five promotion tiers per path
- **📚 9 Trainable Skills** — Cooking, Fitness, Charisma, Tech, Creativity, Logic, Gardening, Handiness, and Language
- **💬 Social System** — 6 NPCs with relationship levels, interactions, romance, and marriage
- **🎲 Random Events** — Pipe leaks, party invitations, freelance gigs, stray cats, and more
- **🌟 Prestige / Legacy** — Reset for Legacy Points, buy permanent upgrades, start a new generation
- **🌅 Day/Night Cycle** — Dynamic sky, sunset colors, and nighttime overlays
- **Character Customization** - Edit avatar form, body parts, clothing, accessories, and color sets during creation or any time in-game.
- **💾 Auto-Save** — Progress saved to localStorage every 30 seconds and when the active page is hidden or left
- **📖 New Roots Campaign** — Eight guided chapters with persistent progress and one-time rewards
- **🛡️ Foundation v2** — Deterministic tests, versioned save migrations, resilient local asset loading, and WebGL/Canvas fallback

## 🎮 Controls

| Key | Action |
|-----|--------|
| **Click furniture** | Open radial pie menu |
| **Shift+Click** | Queue an action |
| **Q** | Toggle autonomy ON/OFF |
| **1 / 2 / 3** | Set game speed (1×, 3×, 10×) |
| **Space** | Pause / Resume |
| **WASD / Arrows** | Pan camera |
| **Escape** | Close the current surface or open the pause menu |

## 🚀 Play

No build step required — just open `index.html` in any modern browser.

```bash
# Clone and play
git clone https://github.com/silverlion2/simlife.git
cd simlife
# Open index.html in your browser
start index.html   # Windows
open index.html    # macOS
```

Or host it on any static file server (GitHub Pages, Netlify, Vercel, etc.)

## 📁 Project Structure

```
simlife/
├── index.html          # Browser/runtime composition root
├── main.js             # Electron main process
├── preload.js          # Electron preload boundary
├── js/                 # Game modules exposed through window.Game
├── css/                # Shared shell, HUD, panel, and responsive styles
├── assets/             # Runtime sprites and reproducible source art
├── vendor/             # Pinned offline browser dependencies
├── scripts/            # Verification and asset-generation automation
├── tests/              # Pure, real-browser, and Electron verification entry points
├── tools/web-sop/      # Pinned local workspace-governance CLI
├── artifacts/          # Ignored local screenshots and generated evidence
├── docs/               # Product, architecture, design, test, and release decisions
└── .github/workflows/  # Continuous integration
```

The browser and Electron entry points intentionally remain at the repository root. See [`docs/workspace-layout.md`](docs/workspace-layout.md) for ownership rules and [`docs/improvement-proposals.md`](docs/improvement-proposals.md) for the reviewed migration map.

Windows release candidates are checked in three distinct layers: static/ASAR contents, the unpacked packaged runtime, and the real installed NSIS lifecycle. `npm run verify:installer-lifecycle -- <candidate-dir> --dry-run` prints the install/launch/uninstall plan without changing the host. The mutating lifecycle is restricted to the repository's GitHub Actions Windows runner and writes uploadable JSON plus an installed-runtime screenshot under the candidate directory.

## 📜 License

MIT

<!-- discoverability:start -->
## Discoverability

- **Project:** SimLife
- **Summary:** A cozy offline-first browser and Electron life simulation with isometric home building, autonomous characters, careers, relationships, a story campaign, and migration-safe local saves.
- **Primary keywords:** browser-game, electron-game, life-simulation, simulation-game, autonomous-characters, moodlets, build-mode, phaser, javascript, offline-first
- **Use cases:** Offline life-simulation play, autonomous character experiments, isometric home building, career and relationship progression
<!-- discoverability:end -->

## Hearthbyte Edition v2.0

The v2.0 release turns SimLife into a complete retro-cozy campaign while preserving the original sandbox depth.

- Eight-chapter **New Roots** story campaign with persistent XP, levels, one-time rewards, and clear next actions.
- Proper pause menu with save, resume, controls, audio, CRT, reduced-motion, and high-contrast settings.
- Responsive, world-first HUD and camera framing for desktop and mobile-sized windows.
- Fully local Phaser and pathfinding runtime for offline Electron play.
- Existing save slots migrate forward automatically.

Additional controls:

| Key | Action |
|-----|--------|
| **B** | Open Build |
| **J** | Open campaign journal |
| **F3** | Toggle developer bounds |
| **Escape** | Close the current surface or open pause |
