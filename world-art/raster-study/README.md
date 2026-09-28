# Three-sprite quality study

The user correctly rejected the initial SVG refresh as visually different from
the approved concept. These three isolated raster sprites test the actual soft
3D character, fur and woven-fabric direction of that concept.

Scope: one character outfit/pose, one dachshund pose and one sofa orientation.
This is a comparison prototype, **not** a replacement of the full production
catalog, wardrobe, rotations or animation system. World and the guide remain
unchanged by this study. `/world-art-quality.html` clearly labels this scope.

`room-before.svg` is a snapshot of the actual production renderers with synthetic
fixture data. The builder substitutes exactly three marked regions and preserves
all other room geometry. Shadows are independent SVG elements; the final sofa
image has no fixed window-shaped sunshine painted on it.

Assets were created with the built-in image-generation tool using the approved
concept as a reference. Exact prompts are in `prompts.json`. WebP conversion is
for delivery compression; the generated source PNGs are retained separately.

Rebuild: `node world-art/raster-study/render-preview.cjs`

Before production rollout, the remaining required asset variants, clothing
layers, game animation states, orientations, color behavior and room lighting
must meet the same visual standard. A fixed full-character image is not a
substitute for those systems.
