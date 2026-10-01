# 우리집 관리자 테스트

World → 관리자 모드 → **새 우리집 테스트**. Public houses remain under construction; the shop stays removed.

The approved empty-room shell is 1507×1044, with both side walls extended all the way to the front floor corners, a rectangular ceiling light, cream walls, oak floor and lavender trim. The curtain and the newly extracted reference bookshelf are independent alpha layers. Furniture rules are documented in [FURNITURE_RULES.md](FURNITURE_RULES.md) and enforced through the shared catalog, model and renderer. Default furniture: ivory curtains and one right-wall bookshelf. Other furniture remains future work. Existing prototype avatar/pet interactions appear only on the pet tab.

## Time and placement

`Asia/Seoul`, checked at entry, every 15 seconds and on visibility return:
- 06:00–08:00 and 18:00–20:00: the same approved evening background.
- 08:00–18:00: day.
- 20:00–06:00: night.

Floor: 10 × 7 cells, half-cell movement. Its floor and ceiling planes are calibrated to their eight painted corners; wall guides and furniture tops use the same vertical interpolation. The floor transform is calibrated to the four wall/floor corners and covers the full floor depth, with no front apron. Current-room framing reserves space on both sides. Bookshelf reservation: 2 × 1 cells front-facing, 1 × 2 cells at side-wall angles. Its rear corners coincide with reservation grid corners. Width and height stay fixed; forward depth fills 2/3 of the reservation, leaving 1/3 clear in front. Dashed outlines show the reservation; solid outlines show contact. Furniture ground-contact corners and each visible face use that same projective camera; the atlas is no longer positioned by its bottom-center bounding box. Each face is mapped separately so both ground edges coincide with the grid and verticals remain upright. Dragging and arrow controls use the same projected floor and snap/clamp function. Editing is a draft until **배치 완료**; cancellation and leaving the editor discard it. Curtains can be shown/removed independently. **빈방 보기** removes furniture only in the test save; approved room geometry never changes.

Starter room is centered (0,0); x −2…2, y −3…3, at most 35 rooms. Add only beside an existing connected room. Expansion, curtains, bookshelf and diary persist per account on this device, under `ojjuda-house-playtest-v1:<owner>`; internal schema is version 3 and migrates old 8-cell placements once, preserving wall attachments and centering free-standing items. No production ownership, wallet, profile or diary is changed.

## Gate

The iframe remains locked until a same-origin parent passes a MessagePort. World checks its administrator identity first; the host rechecks every 400 ms and on load/messages, and closes on account/role loss. No access tokens enter the frame. This is an administrator UI preview over public static art, not server access control.

## Art

Built-in image generation, October 1 2026, converted to WebP preserving alpha. Approved wide-room reference: `exec-1d912dd5`. Its curtain-free day base is `exec-9e879d05`, matching dusk/dawn `exec-f664ac35`, and night `exec-d3bf58bc`. The original room edges and framing are retained; an exterior floor apron is clipped at the side-wall front corners. Existing ivory curtain layer `exec-88c7321c` is aligned to the new window. The right bookcase is `exec-f288743c`; separately generated left `exec-8641bb4b` and frontal `exec-6c986979` views match it. The right source was extracted from the user's `1000035698.png` reference.

Final art prompts: remove only the curtain panels and rail from the approved wider room while preserving all geometry, pixels, colors, camera and exterior alpha; for dusk/night, change only time of day and lighting on that same curtain-free base. Bookcase extraction: isolate the right-hand oak bookcase, retain its original visible front/side, warm material, books, plants, lower cabinet and top box; remove adjoining furniture and room; complete only the occluded lower cabinet; transparent background.

Wall/center placement dynamically changes the visible front/side/top planes and their perspective without changing the selected facing direction. Color is compared against the exact user-approved image saved in `references/home-style.png`, in the same daylight. All three view files are registered and used by direction. Source artwork is preserved. Calibrated planes and the top box are projected through the common room camera. Runtime geometry, rather than a painted furnished mockup, places the bookcase and its ground-contact edges.

Validation: `node tests/house-playtest-ui.test.cjs` checks visible CSS-transformed contact pixels against the grid in all three directions, all 639 legal half-cell placements, exact 2/3 contact area, unchanged height and one-time save migration, Korea clock boundaries and live switching, directions, half-cell placement, cancellation/persistence, curtains, expansion, mobile gestures, role/account isolation and responsive layouts. Existing World admin-refresh/navigation gates remain required.
