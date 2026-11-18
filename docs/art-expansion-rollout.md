# Shared group and screw artwork rollout

Implementation is prepared on this branch. Do not merge until all 100 binary assets are uploaded and verified against `assets/cozy-scenes/manifest.json`.

- Asset package: `ojjuda-cozy-scenes-100.zip` (100 optimized WebP images; 17,942,900 image bytes).
- Upload the files to `assets/cozy-scenes/` using authenticated Git or browser file upload. Do not encode image bytes into tool-call strings.
- Set `GROUP_NEW_SINCE` in `shared/art/cozy-scenes.js` to the actual rollout timestamp immediately before merging. Existing rooms retain their earlier covers; new rooms select from 106 images by immutable room ID.
- Rebase onto current main, preserve unrelated release entries, refresh the Agit version if it has advanced, then run `node scripts/sync-section-versions.mjs`.
- Validate the 100 image SHA-256 hashes and run the artwork, group and release checks before merging. Monitor the Pages deployment after merge.

Local verification: all 100 images visually reviewed; every optimized image is below 200 KB; 44 group DOM tests, 4 catalog/album tests, the picture collection regression and release-cache checks pass. Mobile group cards measure approximately 209 px high at 320/390 px widths. The 18-page picture album displays new images and retains the first six collection IDs.

The compact group height change was already deployed in commit afc49222c4dd6642ad3d4b729cc76ae268879897. This branch only adds the expanded shared image collection and its loading/album integration.
