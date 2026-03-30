# 🏡 SimLife — Build Your Dream Life

A deep browser-based life simulation game inspired by The Sims. Build your home, grow your career, make friends, and leave a lasting legacy — all from your browser.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)

## ✨ Features

- **🤖 Autonomous AI** — Your Sim thinks for themselves, evaluating needs and picking the best action when idle
- **🎯 Radial Pie Menus** — Click furniture for Sims-style contextual interaction menus
- **📋 Action Queue** — Shift+Click to queue up multiple actions; your Sim executes them in order
- **😊 Moodlet System** — Stackable mood buffs from activities ("Well Rested", "Home Cooked", "Pumped Up")
- **🏗️ Build Mode** — Place rooms and furniture on an isometric 2.5D lot
- **💼 5 Career Tracks** — Business, Tech, Culinary, Science, Creative — each with 5 promotion tiers
- **📚 8 Trainable Skills** — Cooking, Fitness, Charisma, Tech, Creativity, Logic, Gardening, Handiness
- **💬 Social System** — 6 NPCs with relationship levels, interactions, romance, and marriage
- **🎲 Random Events** — Pipe leaks, party invitations, freelance gigs, stray cats, and more
- **🌟 Prestige / Legacy** — Reset for Legacy Points, buy permanent upgrades, start a new generation
- **🌅 Day/Night Cycle** — Dynamic sky, sunset colors, and nighttime overlays
- **💾 Auto-Save** — Progress saved to localStorage every 30 seconds

## 🎮 Controls

| Key | Action |
|-----|--------|
| **Click furniture** | Open radial pie menu |
| **Shift+Click** | Queue an action |
| **Q** | Toggle autonomy ON/OFF |
| **1 / 2 / 3** | Set game speed (1×, 3×, 10×) |
| **Space** | Pause / Resume |
| **WASD / Arrows** | Pan camera |
| **Escape** | Cancel activity & clear queue |

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
├── index.html          # Entry point
├── css/
│   └── main.css        # All styles (dark theme, pie menus, animations)
└── js/
    ├── config.js       # Game data (needs, furniture, careers, events)
    ├── state.js        # State management & save/load
    ├── character.js    # Needs, mood, skills, activities, action queue
    ├── economy.js      # Money, careers, bills, promotions
    ├── house.js        # Room building, furniture placement
    ├── social.js       # NPC relationships & interactions
    ├── events.js       # Random event system
    ├── prestige.js     # Legacy points & generational upgrades
    ├── renderer.js     # 2.5D isometric canvas renderer
    ├── autonomy.js     # AI decision-making engine
    ├── ui.js           # Status bars, panels, notifications
    └── main.js         # Game loop, input handling, pie menus
```

## 📜 License

MIT
