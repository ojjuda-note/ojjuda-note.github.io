# World room renderer

The supplied `ojjuda-3d-package-v17.zip` provides the furniture, pet and avatar models and embedded artwork. `engine.js` adapts those models to the existing World room data. The garden illustration was generated for this room view from the user's visual reference.

`world-room.js` mounts this same-origin frame. World remains responsible for account identity, purchases, multiple rooms, pet metadata and `profiles.room` serialization. The frame receives a display projection and reports selection, movement, furniture taps and walking. It never writes to local storage or Supabase. Only the existing **확인** action commits a furniture draft; **취소**, account changes and stale-room guards preserve committed data.

Legacy `wall: R`/pixel heights and avatar palette indices are converted for display without rewriting saved data. All 479 existing furniture/pet variants map to 3D models. Purchased wallpaper/floor artwork is projected from the existing catalog. Album, diary, guestbook and pet taps use the existing World actions and permissions.

The standalone demo's local save/import/reset, duplicate menus, synthetic friend, public-place simulation and retired claw machine are excluded. Three.js 0.160.0 and its RoundedBoxGeometry helper are vendored with their license, so this renderer has no runtime CDN dependency. Render failure or WebGL context loss reveals the existing SVG editor. Geometry and materials are released on replacement/unmount; offscreen rendering pauses.

Validation: `npm --prefix tests test`. `world-room-3d-ui.test.cjs` runs without live account access and checks touch placement, confirm/cancel, autosave isolation, legacy data, room/account changes, furniture links, six screen sizes, every catalog model and the WebGL fallback.
