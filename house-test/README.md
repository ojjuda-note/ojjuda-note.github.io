# 우리집 관리자 테스트

Furniture workflow: read all nine rules in [FURNITURE_RULES.md](FURNITURE_RULES.md) before generating each item. After authoring, place it in the actual room and check the relevant representative placements against those rules, including overlap, interpenetration and reserved-space collisions with other items, show the result and deploy after user approval. Keep verification minimal: add focused checks only for observed problems or changed behavior, and do not repeat the exhaustive placement matrix for every furniture asset. Existing required deployment checks still apply.

World → 관리자 모드 → **새 우리집 테스트**. Public houses remain under construction; the shop stays removed.

The approved empty-room shell is 1507×1044, with both side walls extended all the way to the front floor corners, a rectangular ceiling light, cream walls, oak floor and lavender trim. The curtain and the newly extracted reference bookshelf are independent alpha layers. Furniture rules are documented in [FURNITURE_RULES.md](FURNITURE_RULES.md) and enforced through the shared catalog, model and renderer. Default furniture: ivory curtains, one right-wall bookshelf and the approved three-view drawer desk. Other furniture remains future work. Retired avatar and pet prototypes have been removed. The preview contains the approved room, independently placed furniture, and diary.

## Time and placement

`Asia/Seoul`, checked at entry, every 15 seconds and on visibility return:
- 06:00–08:00 and 18:00–20:00: the same approved evening background.
- 08:00–18:00: day.
- 20:00–06:00: night.

Floor: 10 × 7 cells, half-cell movement. Its floor and ceiling planes are calibrated to their eight painted corners; wall guides and furniture tops use the same vertical interpolation. The floor transform is calibrated to the four wall/floor corners and covers the full floor depth, with no front apron. Current-room framing fills the viewport without stretching the picture; dragging reveals cropped areas and the overview button still fits all rooms. Furniture editing keeps the selected picture in view while sliders move it. Bookshelf reservation: 2 × 1 cells front-facing, 1 × 2 cells at side-wall angles. Its rear corners coincide with reservation grid corners. Width and height stay fixed; forward depth fills 2/3 of the reservation, leaving 1/3 clear in front. Dashed outlines show the reservation; solid outlines show contact. Furniture ground-contact corners and each visible face use that same projective camera; the atlas is no longer positioned by its bottom-center bounding box. The whole approved picture is shown at its registered position; moving it warps linked image anchors in a 2D canvas so ground edges coincide with the grid and verticals remain upright. No models, assembled component geometry, CSS 3D transforms or generated material planes are used. Dragging and the sliders use the same projected floor and snap/clamp function. Frontal placement has a lateral-position slider (0–8 cells) and a depth slider; side-facing placement has wall-gap and depth sliders. Movement arrow buttons have been removed. Editing is a draft until **배치 완료**; cancellation and leaving the editor discard it. Curtains can be shown/removed independently. **빈방 보기** removes furniture only in the test save; approved room geometry never changes.

Starter room is centered (0,0); x −2…2, y −3…3, at most 35 rooms. Add only beside an existing connected room. Expansion, curtains, bookshelf, desk and diary persist per account on this device, under `ojjuda-house-playtest-v1:<owner>`; internal schema is version 11. It migrates old 8-cell placements once, preserving wall attachments and centering free-standing items. Pre-v8 retired desk placements are ignored; the approved desk is introduced once when upgrading an older save, preferably at right-wall (9, 3.5), or another free placement if occupied. Existing rooms, bookshelf, curtains and diary remain. Removed desks in a version-9 save stay removed; retired chair/side-table/plant placements remain excluded. No production ownership, wallet, profile or diary is changed.

## Gate

The iframe remains locked until a same-origin parent passes a MessagePort. World checks its administrator identity first; the host rechecks every 400 ms and on load/messages, and closes on account/role loss. No access tokens enter the frame. This is an administrator UI preview over public static art, not server access control.

## Art

Built-in image generation, October 1 2026, converted to WebP preserving alpha. Approved wide-room reference: `exec-1d912dd5`. Its curtain-free day base is `exec-9e879d05`, matching dusk/dawn `exec-f664ac35`, and night `exec-d3bf58bc`. The original room edges and framing are retained; an exterior floor apron is clipped at the side-wall front corners. Existing ivory curtain layer `exec-88c7321c` is aligned to the new window. The approved bookcase pictures are the independently authored `bookshelf-left-v2.webp`, `bookshelf-center-v2.webp` and `bookshelf-right-v2.webp`. Superseded bookcase pictures and the assembled desk/chair/side-table/plant assets and authoring records have been removed.

Final art prompts: remove only the curtain panels and rail from the approved wider room while preserving all geometry, pixels, colors, camera and exterior alpha; for dusk/night, change only time of day and lighting on that same curtain-free base. Bookcase extraction: isolate the right-hand oak bookcase, retain its original visible front/side, warm material, books, plants, lower cabinet and top box; remove adjoining furniture and room; complete only the occluded lower cabinet; transparent background.

Wall/center placement dynamically changes the visible front/side image regions and their perspective without changing the selected facing direction. Color is compared against the exact user-approved image saved in `references/home-style.png`, in the same daylight. All three view files are registered and used by direction. Source artwork is preserved. Linked source-image corners, including the box already painted in the picture, follow the shared room grid. The room itself is a raster picture. Procedural sky/city backgrounds have been removed; the surrounding app surface is a flat neutral color.

Validation: `node tests/house-playtest-ui.test.cjs` checks visible 2D canvas contact pixels against the grid in all three directions, all 639 legal half-cell placements, exact 2/3 contact area, unchanged height and one-time save migration, Korea clock boundaries and live switching, directions, half-cell placement, cancellation/persistence, curtains, expansion, mobile gestures, role/account isolation and responsive layouts. Existing World admin-refresh/navigation gates remain required.

## Approved drawer desk — 2026-10-02

The user approved applying the desk made in the furniture authoring program. Only that desk joins the existing bookshelf and room in this release. `desk-{left,center,right}-v7.webp` contains the three approved transparent picture views; lossless PNG counterparts retain the exported originals. The registered artwork uses the existing `roomPoint` for its face corners and painted ground contacts. The authored default poses show the registered whole picture; moved poses use the same registered artwork through Canvas 2D. Room projection, bookshelf art and backgrounds are unchanged.

Desk dimensions: width 3, depth 1, height 1.4; default placement right, x=9, y=3.5. The catalog reserves the full footprint and rejects overlap with the bookshelf. Left/front/right view selection and half-cell sliders share the same draft/save/cancel behavior. Frontal controls are lateral position and depth; side-facing controls are wall gap and depth. In right-facing edit mode, camera controls move left so they do not cover the desk.

The desk has a shallow upper drawer, a lower drawer pedestal and a solid end panel. The three handles and the lower two-drawer arrangement are the approved reconstructed design; obscured details were not directly observable in the original room reference. This release does not claim pixel-identical extraction of the whole original desk. No chair, chair interaction or furniture-authoring application is included.


## 소파와 소품

방 꾸미기에서 **소파 놓기**를 선택하면 좌측·정면·우측 그림을 바꾸고 0.5칸 단위로 이동할 수 있다. 소파 편집에서 쿠션 네 종류와 소파용 니트 담요를 각각 켜거나 치운다. 소품은 소파 부위 순서에 따라 겹친다. 쿠션은 소파 좌판의 지지 위치에 한 장의 그림 면으로 놓아 형태가 꺾이지 않도록 하고, 소파와 같은 부모 위치·방향을 따라 방 격자에 투영한다. **배치 완료**는 소파와 소품을 함께 저장하고 **취소**는 이전 상태를 유지한다.

**바닥 담요 놓기**는 독립된 바닥 개체이며 가구 아래에 놓을 수 있다. 침대용 담요는 침대 본체를 추가한 뒤 연결할 대상이며 현재 소파·바닥용으로 대체하지 않는다. 새 항목은 목록에서 직접 놓도록 하여 기존 빈방과 가구 배치를 보존한다. 우리집은 기존의 World 관리자 진입 경로를 유지한다.
