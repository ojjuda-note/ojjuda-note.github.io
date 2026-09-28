# Living room art study

Open `/world-living-room.html` for the assembled room.

This scene uses 15 independent raster layers: one empty room, three wall objects, one rug, and ten movable objects including the avatar and pet. The twelve WebP files in this folder reuse the avatar, dachshund and sofa from `../raster-study/`. Source prompts and geometry are recorded in the JSON files.

The preview supports pointer dragging and keyboard arrows after selecting **가구 옮기기**. **처음 배치** restores the original layout. Movement keeps each object’s source-calibrated floor footprint inside the room, including at corners. Depth order and contact shadows use the footprint center instead of the transparent image boundary. Positions live only in memory; no account, database or saved room is modified.

This is one completed visual room study. The avatar and pet are fixed poses. It does not replace the production furniture catalog, wardrobe layers or animation system. Wall and floor lighting and contact shadows are separate runtime layers.

## Sofa ground-angle calibration

The sofa records three visible foot contacts in source pixels. A position-dependent SVG affine transform matches the two contact axes to the local floor projection while keeping vertical edges vertical. The image, footprint, selection outline and contact shadows share that transform. Boundary clamping iterates against the transformed footprint. This is 2D projection correction, not a reconstructed 3D model.
