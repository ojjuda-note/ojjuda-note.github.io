# World artwork — 2026-09-28.1

The four small, dependency-free scripts enhance World's existing SVG and Canvas
renderers. `install.inc.js` installs them inside the application module, after the
catalog extensions and before the first UI render. Run
`node scripts/sync-world-art.mjs` after editing the installer.

## Coverage

- All 479 catalog item IDs (315 drawing families) use the new render pipeline.
- Avatar: rebuilt face, 16 hairstyles, clothing layers and shoes; native Canvas
  running avatar matches the same direction and retains the original motion.
- Pets: 59 types. Dogs, cats, rabbit and 10 zodiac animals have newly drawn
  anatomy; birds and terrarium animals retain their species silhouettes with
  updated materials, eyes and details. Original animation groups remain intact.
- Furniture: 27 floor and 3 wall families have newly drawn geometry. The other
  non-pet families use rounded outlines and material shading on their existing
  shapes; they are not represented as individually repainted assets.
- Rooms: all 95 surface presets retain their patterns, with shared wall depth,
  floor material, skirting, contact shadows and day/night lighting.
- Thumbnails, rooms, public spaces, care previews and the guide use these same
  renderers. `world-art-preview.html` contains exported example scenes.

Catalog IDs, prices, saved coordinates, footprint, color selection, rotation,
photo frame/TV media and game physics are unchanged. The installer restores the
original functions if initialization fails. It requires no new network service.

This is responsive vector artwork inspired by the approved soft 2.5D direction,
not a claim that the illustrative concept image is the running application.

## Validation

The pure renderer harness checked 2,874 catalog/color/rotation combinations,
85 avatar configurations, 95 surfaces, six rooms, four public spaces and three
photo-frame/TV cases. Additional renderer checks covered 432 native Canvas
running frames and all 59 pet species. The preview is exported from the same
modules; it does not use account data.
