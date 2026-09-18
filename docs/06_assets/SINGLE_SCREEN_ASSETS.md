# Single-screen table assets

The current table uses the existing ukiyo-e card art and a generated ink-night background at `public/assets/ui/table-arena-v2.webp`.

The 9 item and 12 emoji WebP files now contain genuine alpha transparency. They replace the opaque originals at their canonical `public/assets/items/*.webp` and `public/assets/emoji/*.webp` paths; no second runtime sprite set is kept. UI buttons provide the selection affordance; Canvas animations draw the bare transparent sprite without a frame.

`honor-token-cutout.webp` is a transparent decorative token. It never represents an opponent's private token face/value.

## Image generation

Built-in imagegen was used for the token cutout and two temporary contact-sheet edits (3×3 items, 4×3 emoji). The generated sheets were inspected, sliced into equal cells, resized to 192px, and encoded as WebP while preserving alpha. Original generation outputs remain outside the repository; only production sprites are included.

Cutout prompt: “Edit this sprite sheet ONLY to remove ALL navy backgrounds and black rectangular borders/grid lines, creating genuine transparent alpha surrounding every individual object. Preserve each object's existing shape, colors, ink outlines and details, including ninja head's opaque navy face covering. Keep a regular equal-cell grid, each icon centered in its original cell with transparent padding, separate icons never touching or crossing cell boundaries. No new objects, no text, no labels, no boxes, no badge frames, no shadows behind icons, no checkerboard painted in. Output a transparent PNG sprite sheet matching original aspect ratio.”

Items order: basket, egg, geta / rotten_pill, sakura, secret_letter / shuriken, snowball, tea.
Emoji order: bamboo, flame, kitsune_mask, kunai / moon, ninja_head, noh_mask, scroll / star, swords, tea_cup, water.

`tests/ui/transparent-assets.test.ts` verifies the asset counts, four-channel alpha, transparent corners (allowing negligible compression residue), and substantial transparent surrounding space.
