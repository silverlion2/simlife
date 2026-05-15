# Character Customization Design

## Goal

Add a full character customization system for SimLife that supports every current avatar form, including human, witch, robot, cat, and banana. The first version is cosmetic-only and must be editable both during new game creation and any time in-game through the makeover flow.

The system should preserve the game's current isometric, high-contrast, slightly pixel-art visual style. The editor may use UI previews, but in-game graphics must remain foot-anchored Phaser sprites that fit the existing movement, shadow, depth, label, and thought bubble behavior.

## Current Context

The current game stores character appearance as a small set of fields on `state.character`:

- `form`, currently selected from simple avatar options in `index.html` and `js/ui.js`.
- `color`, a single color value collected by the character creator and makeover modal.

The renderer currently turns `form` into one sprite texture key in `js/renderer.js`, with special handling for `online_witch` directional variants. This is simple, but it cannot support independent body parts, clothes, accessories, or multiple color channels without multiplying whole-sprite assets.

## Recommended Approach

Use a layered, form-aware appearance model.

Each avatar form declares the slots it supports. Human and witch can share many humanoid slots, while robot, cat, and banana expose form-specific slots that make sense for their silhouettes. The renderer composes transparent PNG layers using a shared isometric canvas size and anchor rather than swapping one complete sprite for every possible look.

This approach is slower to build than whole-sprite variants, but it avoids an asset explosion and supports a large selection catalog from a manageable number of source layers.

## Data Model

Add `Game.Appearance` and an avatar catalog loaded before UI and renderer consumers. The catalog defines:

- `forms`: available avatar bases, labels, defaults, preview metadata, and supported slots.
- `slots`: stable slot definitions such as `body`, `hair`, `top`, `bottom`, `shoes`, `hat`, `accessory`, `chassis`, `coat`, `peel`, and `face`.
- `items`: selectable assets with `id`, `label`, `form`, `slot`, `textureKey`, layer order, palette compatibility, and optional directional texture keys.
- `palettes`: named color sets and direct color values for skin, hair, clothing primary/secondary/accent, fur, metal, peel, and accessory accents.

New character state should use:

```js
appearance: {
  form: 'human',
  forms: {
    human: {
      slots: {
        body: 'human_body_average',
        hair: 'short_side_part',
        top: 'hoodie',
        bottom: 'jeans',
        shoes: 'sneakers',
        accessory: 'none'
      },
      colors: {
        skin: 'warm_medium',
        hair: 'dark_brown',
        primary: '#3f7fb8',
        secondary: '#202935',
        accent: '#f3c24f'
      }
    }
  },
  outfitId: 'everyday'
}
```

Non-human examples:

- Robot: `chassis`, `headModule`, `torsoTrim`, `legTrim`, `face`, `accessory`.
- Cat: `coat`, `face`, `ears`, `collar`, `hat`, `accessory`.
- Banana: `peel`, `face`, `hat`, `accessory`.

Changing form should not destroy saved choices for other forms. Store per-form slot selections inside `appearance.forms[formKey]`; `appearance.form` is the active form key, and `Game.Appearance` reads the active form's slots and colors through that key.

## Asset Catalog

Create a starter pack with enough pre-generated choices for selection without overbuilding:

- Human/Witch: 4 body presets, 8 hair/head options, 10 tops, 8 bottoms, 6 shoes, 8 hats/accessories, 12 color palettes.
- Robot: 5 chassis, 6 head modules, 6 arm/torso trims, 6 leg/feet trims, 8 accent palettes.
- Cat: 6 coat/body patterns, 5 face/ear variants, 6 collars/hats, 8 fur/accent palettes.
- Banana: 5 peel/body variants, 6 face variants, 8 hats/accessories, 8 peel/accent palettes.

Asset rules:

- Each selectable item is a transparent PNG layer aligned to the same isometric canvas and foot anchor for that form family.
- Layers must match the current game style: isometric perspective, strong readable silhouette, dark outline, compact sprite scale, and no flat dress-up-doll look.
- Color variety should primarily come from palette swaps or tint masks, not separate full sprites for every color combination.
- Directional variants are required only where the current in-game view makes them visibly necessary. Humanoid walking can start with the existing witch direction model, then expand.

## Rendering

Replace the single-character image path with an avatar container managed by the renderer. The renderer should:

1. Resolve `character.appearance` through `Game.Appearance`.
2. Request an ordered list of render layers for the active form and direction.
3. Create or update Phaser image children in one container.
4. Apply tint or palette rules per layer.
5. Keep the existing character position, depth, label, shadow, thought bubble, activity glow, and movement direction behavior.

The renderer should preserve legacy behavior for missing catalog data by falling back to `online_witch_iso` or another safe default. Missing optional slots should render as `none`, not throw.

## Editor Flow

Use the same appearance editor in both places:

- New game creation.
- In-game makeover / wardrobe modal.

The editor should include tabs or sections for:

- Form
- Body
- Clothes
- Accessories
- Colors

The UI should show only slots valid for the selected form. For example, cat should not show human pants; banana should show peel, face, hats, and accessories; robot should show chassis and trims.

Editor behavior:

- Preview changes immediately.
- Apply changes to `state.character.appearance` when saved.
- Keep cosmetic changes free for now.
- Save through the existing localStorage save flow.
- Trigger a renderer refresh after apply.

## Migration

Old saves must continue to load.

Migration rules:

- If `character.appearance` is missing, create one from `character.form` and `character.color`.
- Map legacy `human` and missing forms to a valid default humanoid appearance.
- Map `online_witch` to the witch form.
- Preserve `character.color` as the primary clothing color or form accent when possible.
- Keep legacy `form` and `color` readable during the transition, but the editor should write the new `appearance` object.

## Error Handling

Catalog validation should catch developer mistakes early:

- Unknown form.
- Unknown item id.
- Item assigned to a slot not supported by its form.
- Missing texture key.
- Palette channel referenced by an item but absent from the selected palette.

At runtime, invalid or missing player appearance data should be repaired to defaults and should not block loading a save. The user should not see technical errors for cosmetic fallback.

## Testing

Add focused verification for:

- Catalog integrity.
- Legacy save migration from `form` and `color`.
- Applying editor changes to state.
- Renderer fallback when a slot or texture is missing.
- Browser smoke flow: create a new game, open makeover, switch between all forms, change colors, save, and confirm a visible character remains on canvas.

Use the existing `npm test` path as the main verification entry point and update `scripts/verify-game.js` if new source files or catalog files need syntax/resource checks.

## Scope

In scope:

- New appearance data model and catalog.
- Starter pre-generated layer catalog.
- Character creator and in-game makeover support.
- Renderer composition for layered cosmetic sprites.
- Legacy save migration.
- Tests and smoke verification.

Out of scope for the first version:

- Gameplay effects from clothing or body choices.
- Paid clothing, unlock progression, shops, or crafting.
- Multiplayer/social reactions to outfits.
- Full skeletal animation or procedural rigging.
- Infinite color/material editor beyond the defined palette channels.
