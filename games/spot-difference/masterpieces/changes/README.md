# Edited puzzle plates

These PNG files are generated edits of the corresponding public-domain museum images in `../sources/`. The game reveals only the ten registered regions in `../../masterpiece-puzzles.js`; the remainder of the second picture uses the unchanged museum original. Each edit plan is in `../edits/`. Source credits and rights evidence are in `../README.md` and `../../masterpiece-sources.json`.

The selected asset set contains 41 PNG files for 20 paintings. The original 21 plates remain unchanged: one main edited plate per painting, plus `bonheur-horse-fair-hat.png`, which supplies only the hat correction for answer 9 in `../edits/bonheur-horse-fair.json`.

The additional 20 plates clarify 32 existing color answers across 14 paintings. Files named `<artwork>-colors1.png` supply only their selected color regions, with `renoir-charpentier-family-colors-tassel1.png` supplying Renoir answer 1 separately. Four `-colors-detail1.png` plates refine Card Players answer 5, Washington Crossing the Delaware answers 3 and 5, The Horse Fair answer 7, and Still Life with Apples and a Pot of Primroses answers 4 and 9. The Horse Fair answer 8 uses its own `-colors-detail2.png` so the reviewed trousers in answer 7 remain unchanged. The color mapping is red to yellow, yellow to green, and green to red; an answer containing two of those original colors retains both mappings in its edit plan. All other answers and the ten-answer count per painting are preserved. These plates are not extra paintings or stages.

Only four existing answers have adjusted mask and hit bounds so the same objects are not cut by a rectangular edge: three clothing items in The Horse Fair and the upper-left leaf cluster in The Oxbow. Coordinates below are `[left, top, right, bottom]` in percent of the original image. Their answer IDs, descriptions of the target objects, and game rules stay the same; every other answer keeps its previous bounds.

| Artwork and answer | Previous bounds | Complete object bounds |
| --- | --- | --- |
| The Horse Fair · 4 · jacket behind the white horse | `[50.8, 42.7, 54.0, 49.8]` | `[49.8, 41.0, 54.5, 51.5]` |
| The Horse Fair · 6 · far-right jacket | `[88.8, 47.2, 94.1, 55.4]` | `[86.2, 46.1, 94.5, 56.5]` |
| The Horse Fair · 7 · foreground trousers | `[22.2, 64.4, 25.4, 75.8]` | `[20.0, 63.4, 25.5, 82.4]` |
| The Oxbow · 1 · upper-left leaves | `[2, 10, 11.6, 23.6]` | `[0.6, 8.4, 15.0, 33.2]` |

Three visual masks keep surrounding original colors intact without changing their answer hit bounds. Washington Crossing the Delaware answer 3 and Still Life with Apples and a Pot of Primroses answer 4 use an optional `clipPolygon` in both the edit plan and runtime layer. Its finite `[x, y]` vertices use full-image percentages from 0 to 100 and narrow the existing mask to the original stripe or leaf outline. The Horse Fair answer 8 uses `maskShape: "ellipse"` in its plan and the existing elliptical region renderer; its center, radii, and hit bounds stay unchanged. Other layers retain their previous mask behavior.

The canonical publish list, byte sizes, pixel dimensions, and SHA-256 hashes for these PNG files and the 20 original JPEG files are recorded in `../../masterpiece-assets.json`, under `artworks[].assets`. Package those listed image paths explicitly. Local generation logs, prompt drafts, and intermediate coordinate-review files are not runtime assets and are not part of that image manifest.
