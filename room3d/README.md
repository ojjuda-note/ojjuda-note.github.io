# World room renderer

The supplied `ojjuda-3d-package-v17.zip` provides the furniture, pet and avatar models and embedded artwork. `engine.js` adapts those models to the existing World room data. The garden illustration was generated for this room view from the user's visual reference.

`world-room.js` mounts this same-origin frame. World remains responsible for account identity, purchases, multiple rooms, pet metadata and `profiles.room` serialization. The frame receives a display projection and reports selection, movement, furniture taps and walking. It never writes to local storage or Supabase. Only the existing **확인** action commits a furniture draft; **취소**, account changes and stale-room guards preserve committed data.

Legacy `wall: R`/pixel heights and avatar palette indices are converted for display without rewriting saved data. All 479 existing furniture/pet variants map to 3D models. Purchased wallpaper/floor artwork is projected from the existing catalog. Album, diary, guestbook and pet taps use the existing World actions and permissions.

The standalone demo's local save/import/reset, duplicate menus, synthetic friend, public-place simulation and retired claw machine are excluded. Three.js 0.160.0 and its RoundedBoxGeometry helper are vendored with their license, so this renderer has no runtime CDN dependency. Render failure or WebGL context loss reveals the existing SVG editor. Geometry and materials are released on replacement/unmount; offscreen rendering pauses.

Validation: `npm --prefix tests test`. `world-room-3d-ui.test.cjs` runs without live account access and checks touch placement, confirm/cancel, autosave isolation, legacy data, room/account changes, furniture links, six screen sizes, every catalog model and the WebGL fallback.

`characters.js` shares the room's avatar/pet factories with the dressing room and pet care/chat views. `world-characters.js` mounts those views and caches visible profile portraits. It never changes ownership, purchases, pet stats or chat storage. Avatar selections and pet care updates retain their WebGL frame. The 85 existing avatar choices remain distinct, including legacy hairstyles, clothing, shoes and accessories. Sleeve offsets use their actual length rather than RoundedBoxGeometry's unit-box parameters.

Settled rooms and character previews stop drawing; explicit pet reactions and walking still animate. Room shadows update when scene geometry moves, and animated furniture parts are found once at model construction. Profile portraits render during idle time, are cached, and share an available renderer. The house has separate interior/exterior materials, pitched lavender eaves, a framed entrance and supported stone steps; the garden artwork is unchanged. `world-characters-ui.test.cjs` checks model parity, arm placement, paid previews, all avatar choices, pet actions/chat, renderer reuse, idle drawing, responsive layouts and fallback.
