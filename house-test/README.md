# 우리집 관리자 테스트

World → 관리자 모드 → **새 우리집 테스트**. Public houses remain under construction; the shop stays removed.

The approved compact empty room uses its original square camera, cream walls, oak floor and lavender trim. The curtain and three bookshelf directions are independent alpha layers. Default furniture: ivory curtains and one right-wall bookshelf. Other furniture remains future work. Existing prototype avatar/pet interactions appear only on the pet tab.

## Time and placement

`Asia/Seoul`, checked at entry, every 15 seconds and on visibility return:
- 06:00–08:00 and 18:00–20:00: the same approved evening background.
- 08:00–18:00: day.
- 20:00–06:00: night.

Floor: 8 × 7 cells, half-cell movement. Its projective transform is calibrated to the four wall/floor corners; the foreground apron is outside the placement grid. Current-room framing reserves space on both sides. Bookshelf: 2 × 1 cells front-facing, 1 × 2 cells at side-wall angles. Dragging and arrow controls use the same projected floor and snap/clamp function. Editing is a draft until **배치 완료**; cancellation and leaving the editor discard it. Curtains can be shown/removed independently. **빈방 보기** removes furniture only in the test save; approved room geometry never changes.

Starter room is centered (0,0); x −2…2, y −3…3, at most 35 rooms. Add only beside an existing connected room. Expansion, curtains, bookshelf and diary persist per account on this device, under `ojjuda-house-playtest-v1:<owner>`; internal schema is version 2 and upgrades older prototype saves. No production ownership, wallet, profile or diary is changed.

## Gate

The iframe remains locked until a same-origin parent passes a MessagePort. World checks its administrator identity first; the host rechecks every 400 ms and on load/messages, and closes on account/role loss. No access tokens enter the frame. This is an administrator UI preview over public static art, not server access control.

## Art

Built-in image generation, October 1 2026, converted to WebP preserving alpha. Sources: approved empty room `exec-de4ec0d4`, dusk `exec-49222601`, night `exec-2a9eae90`, ivory curtains `exec-88c7321c`. Bookshelf sheet `exec-65e7e116` is a background extraction of approved three-view `exec-1d049926`. CSS viewports select the three sprites, without altering their camera angles. No baked-in UI or whole furnished mockup is used.

Bookshelf extraction prompt: remove background and labels only; preserve all three cabinets, directions, proportions, contents and materials; transparent non-overlapping sheet, no floor or exterior shadows.

Validation: `node tests/house-playtest-ui.test.cjs` covers Korea clock boundaries and live switching, directions, half-cell placement, cancellation/persistence, curtains, expansion, mobile gestures, role/account isolation and responsive layouts. Existing World admin-refresh/navigation gates remain required.
