# SimLife Design System

## Foundations

- Visual tone: warm isometric life-sim with readable, game-like controls.
- Typography: existing serif display for HUD/buttons, sans-serif for dense panel content.
- Font delivery: use the existing local/system font stacks; do not import remote web fonts so browser and Electron presentation remains offline-safe.
- Color tokens: warm ivory surfaces, forest ink, teal/green active states, gold primary actions, and coral destructive or urgent states.
- Spacing: compact HUD spacing; panels use 8px gaps and touch-safe controls.
- Radius and elevation: cards and controls use 8px radius or less; panel shadows should clarify layering without hiding the playfield.
- Motion: subtle hover/press movement only; avoid layout shifts during dynamic HUD updates.

## Components

- HUD: time/speed/zoom top, needs/actions/menu bottom. Mobile condenses the menu into one row plus More drawer.
- Daily Focus: single primary guidance card. Tones: normal, warn, urgent, ready.
- Activity display: idle, thinking, queued, active. Text must fit within the bottom action panel.
- Build panel: sticky mode actions, sticky category tabs, scrollable content. Tabs: Rooms, Furniture, Storage, Renovate.
- Object cards: icon, label, cost/status. Use real icons or escaped emoji, not letter placeholders.

## Responsive behavior

- Desktop: persistent 3-column menu; full needs labels; side/dialog panel can occupy the center.
- Tablet: bottom HUD becomes two columns with action panel spanning the row.
- Mobile: needs use a compact four-column/two-row grid; menu shows Build, Goals, Do, Menu, More in one row; secondary menu buttons appear only when More is open.
- Mobile panels: full-height dialog with sticky controls and two-column Build tabs.
- Mobile creator: keep Start pinned below the scrollable fields and show a short scroll cue until the appearance/trait list reaches its end; recalculate the cue after viewport resize or rotation.

## Interaction states

- Loading: startup waits for assets and a visible canvas before test passes.
- Empty: storage and activity panels show empty messages when no options exist.
- Error: failed build/activity actions use notifications with a concrete reason when available.
- Success: build, market, collection, activity, and social actions notify and refresh their panels.
- Partial: locked Build items show lock reasons and disabled controls.
- Runtime loading: centered ivory status card explains that local assets are being prepared without replacing the main-menu shell.
- Runtime partial: gold-edged status card identifies optional asset loss while allowing the playable world to continue.
- Renderer error: coral-edged status card names the graphics failure and exposes a retry action.

## Accessibility

- Maintain visible focus styles for buttons and panel controls.
- Keep mobile touch targets at least about 30px high for dense controls and larger where space allows.
- Use `aria-selected` on Build tabs and `aria-expanded` on the mobile More toggle.
- Avoid text overlap by using ellipsis inside fixed-format HUD/buttons.

## Hearthbyte Edition art direction

- Fantasy: a bright 16-bit storybook life-sim with a welcoming garden palette and tactile cartridge-era controls.
- Materials: warm ivory paper, fresh teal, leaf green, sunny gold, coral accents, and dark forest ink. Midnight navy is reserved for small recesses, not full screens.
- Typography: chunky display face for titles and controls; highly legible rounded sans for descriptions and dense panels. Letter spacing remains neutral.
- Shape language: strong pixel edges, restrained 4-8px rounding, two-pixel borders, and short offset shadows that make controls feel pressable.
- Texture: subtle grid and foliage patterns, light color grading, and a shallow edge vignette. CRT scanlines are opt-in and never reduce text contrast.
- Motion: short stepped transitions for rewards and menus; reduced-motion disables nonessential float, shimmer, and scanline movement.

### Presentation surfaces

- Main menu: split teal brand field and ivory action field over a bright sky-and-grass scene.
- Character creation: ivory workspace with a larger layered avatar preview and mint garden editing surface.
- Gameplay: the world remains visually dominant; HUD controls are separate translucent ivory islands rather than full-width dark ribbons.
- World: the starter home is centered above the bottom HUD, lawn tiles blend into the procedural grass field, landscaping frames the active lot, and persistent room labels appear only during build mode.
- Pause and dialogs: ivory modal surfaces with teal primary actions, coral danger states, and background blur that preserves world context.

### System panels

- Market, collections, goals, social, skills, legacy, campaign, career, activities, and build mode share the same ivory card, mint summary, and teal action hierarchy.
- Locked content uses quiet gray-green surfaces; destructive actions use coral; sandbox and milestone states use gold.
- Desktop panels use multi-column grids where scanning benefits. Mobile panels collapse to touch-safe single or two-column layouts without clipping.
- Transient events, notifications, announcers, radial interactions, and placement controls use the same semantic palette and elevation rules.

### HUD hierarchy

1. Current objective and danger state.
2. Time, speed, money, mood, and needs.
3. Contextual activity/queue feedback.
4. Deep systems behind the command dock or side panel.

The center of the playfield stays clear. The campaign chip replaces the decorative title as the primary top-center control and opens the campaign journal.

### World asset rules

- Core household objects use unmistakable silhouettes: beds, sofas, appliances, bathroom fixtures, computers, exercise equipment, nursery pieces, workshop pieces, and garden centerpieces must not share generic crate or chair art.
- Furniture stays on the same warm walnut, ivory, teal, leaf, coral, and brass palette as the shell while retaining dark pixel outlines for legibility over room floors.
- Generated household sprites use transparent 256x256 bottom-aligned canvases. Curated Kenney assets retain directional east/north variants and the renderer chooses them from furniture rotation state.
- Decorative repetition is broken with library, dungeon, and farm subfamilies. The first playable home must show indoor greenery, distinct fixtures, varied storage, cultivated plots, and a recognizable courtyard focal point.
- Build cards preview normalized household sprites directly; legacy assets retain their readable semantic icon until their transparent source canvases are normalized for catalog use.
