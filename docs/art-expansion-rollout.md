# Shared group and screw artwork

The shared catalog contains 106 illustrations: the original six and 100 new optimized WebP files in `assets/cozy-scenes/`. The manifest records each new image’s SHA-256 and size; all files are below 200 KB.

- Group rooms created before 2026-11-18T07:47:56.514Z retain their earlier covers. New rooms receive a stable image and coordinated theme selected from all 106 images by immutable room ID. Renaming a room does not change its picture.
- Screw puzzle stages use the same catalog. The original six picture IDs and saved collection data remain compatible.
- The album shows six pictures per page across 18 pages, loading only visible earned pictures. The image cache is limited to 12 entries.

Validation: 100 uploaded file sizes and Git blob hashes matched the optimized originals; all illustrations were visually reviewed. Catalog, album, collection, group DOM, release-cache and atomic-purchase regression checks passed. Mobile group cards remain approximately 209 px high.
