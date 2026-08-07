# SimLife Design System

## Foundations

- Visual tone: warm isometric life-sim with readable, game-like controls.
- Typography: existing serif display for HUD/buttons, sans-serif for dense panel content.
- Color tokens: dark translucent panels, gold trim for RPG chrome, teal/green for active/positive state, red for destructive or urgent state.
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

## Interaction states

- Loading: startup waits for assets and a visible canvas before test passes.
- Empty: storage and activity panels show empty messages when no options exist.
- Error: failed build/activity actions use notifications with a concrete reason when available.
- Success: build, market, collection, activity, and social actions notify and refresh their panels.
- Partial: locked Build items show lock reasons and disabled controls.

## Accessibility

- Maintain visible focus styles for buttons and panel controls.
- Keep mobile touch targets at least about 30px high for dense controls and larger where space allows.
- Use `aria-selected` on Build tabs and `aria-expanded` on the mobile More toggle.
- Avoid text overlap by using ellipsis inside fixed-format HUD/buttons.

## Hearthbyte Edition art direction

- Fantasy: a complete 16-bit "cozy cartridge" life-sim presented through warm CRT-era console chrome.
- Materials: midnight navy shell, ink-black recesses, brass pixels, mint/teal success, coral danger, and parchment text.
- Typography: chunky display face for titles and controls; highly legible rounded sans for descriptions and dense panels.
- Shape language: clipped pixel corners and double-line highlights on hero controls; modest 4-8px rounding inside dense panels.
- Texture: restrained scanlines, dithered gradients, star specks, and edge vignette. Effects never reduce text contrast.
- Motion: short stepped transitions for rewards and menus; reduced-motion disables nonessential float, shimmer, and scanline movement.

### HUD hierarchy

1. Current objective and danger state.
2. Time, speed, money, mood, and needs.
3. Contextual activity/queue feedback.
4. Deep systems behind the command dock or side panel.

The center of the playfield stays clear. The campaign chip replaces the decorative title as the primary top-center control and opens the campaign journal.
