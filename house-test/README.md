# 우리집

Furniture workflow: read all nine rules in [FURNITURE_RULES.md](FURNITURE_RULES.md) before generating each item. Before every item, crop and enlarge its actual area in the approved reference and inspect its shape, proportions, thickness, leg/handle/underside construction, color and grain. Use that enlarged reference directly; never substitute a generic furniture design. Compare the new artwork with the enlarged original before registering anchors in the studio. Keep books and cups as separate editable assets. After authoring, place it in the actual room and check the relevant representative placements against those rules, including overlap, interpenetration and reserved-space collisions with other items, show the result and deploy after user approval. Keep verification minimal: add focused checks only for observed problems or changed behavior, and do not repeat the exhaustive placement matrix for every furniture asset. Existing required deployment checks still apply.

World → **우리집** opens the signed-in member’s own rooms. Furniture creation remains under World → 관리자 모드 → **가구 제작실**; the shop stays removed.

The approved empty-room shell is 1507×1044, with both side walls extended all the way to the front floor corners, a rectangular ceiling light, cream walls, oak floor and lavender trim. The curtain and the newly extracted reference bookshelf are independent alpha layers. Furniture rules are documented in [FURNITURE_RULES.md](FURNITURE_RULES.md) and enforced through the shared catalog, model and renderer. Default furniture: ivory curtains, one right-wall bookshelf and the approved three-view drawer desk. Other furniture remains future work. Retired avatar and pet prototypes have been removed. The preview contains the approved room, independently placed furniture, and diary.

## Time and placement

`Asia/Seoul`, checked at entry, every 15 seconds and on visibility return:
- 06:00–08:00 and 18:00–20:00: the same approved evening background.
- 08:00–18:00: day.
- 20:00–06:00: night.

Floor: 10 × 7 cells, half-cell movement. Its floor and ceiling planes are calibrated to their eight painted corners; wall guides and furniture tops use the same vertical interpolation. The floor transform is calibrated to the four wall/floor corners and covers the full floor depth, with no front apron. Current-room framing fills the viewport without stretching the picture; dragging reveals cropped areas and the overview button still fits all rooms. Furniture editing keeps the selected picture in view while sliders move it. Bookshelf reservation: 2 × 1 cells front-facing, 1 × 2 cells at side-wall angles. Its rear corners coincide with reservation grid corners. Width and height stay fixed; forward depth fills 2/3 of the reservation, leaving 1/3 clear in front. Dashed outlines show the reservation; solid outlines show contact. Furniture ground-contact corners and each visible face use that same projective camera; the atlas is no longer positioned by its bottom-center bounding box. The whole approved picture is shown at its registered position; moving it warps linked image anchors in a 2D canvas so ground edges coincide with the grid and verticals remain upright. No models, assembled component geometry, CSS 3D transforms or generated material planes are used. Dragging and the sliders use the same projected floor and snap/clamp function. Frontal placement has a lateral-position slider (0–8 cells) and a depth slider; side-facing placement has wall-gap and depth sliders. Movement arrow buttons have been removed. Editing is a draft until **배치 완료**; cancellation and leaving the editor discard it. Curtains can be shown/removed independently. **빈방 보기** temporarily hides the selected room’s furniture and curtains without changing the save; **가구 복구** restores the exact visible arrangement. Leaving decorating or closing the house also ends the preview.

Starter room is centered (0,0); x −2…2, y −3…3, at most 35 rooms. Add only beside an existing connected room. Expansion, curtains, bookshelf, desk and diary persist per account on this device, under `ojjuda-house-playtest-v1:<owner>`; internal schema is version 11. It migrates old 8-cell placements once, preserving wall attachments and centering free-standing items. Pre-v8 retired desk placements are ignored; the approved desk is introduced once when upgrading an older save, preferably at right-wall (9, 3.5), or another free placement if occupied. Existing rooms, bookshelf, curtains and diary remain. Removed desks in a version-9 save stay removed; retired chair/side-table/plant placements remain excluded. No production ownership, wallet, profile or diary is changed.

## Gate

The iframe remains locked until a same-origin parent passes a MessagePort. World checks the signed-in owner first; the host rechecks every 400 ms and on load/messages, and closes on logout/account change. The ordinary house never grants furniture-studio access. Studio entry checks administrator identity separately, including preview, return navigation and role loss. No access tokens enter the frame. These are UI gates over account-scoped local data and public static art, not server access control.

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

**바닥 담요 놓기**는 독립된 바닥 개체이며 가구 아래에 놓을 수 있다. 침대용 담요는 침대 본체를 추가한 뒤 연결할 대상이며 현재 소파·바닥용으로 대체하지 않는다. 새 항목은 목록에서 직접 놓도록 하여 기존 빈방과 가구 배치를 보존한다. 우리집은 World의 일반 회원 진입 경로로 열린다.


## Installed furniture studio — 2026-10-03

User instruction: install the existing maker within Ojjuda. World → 관리자 모드 → **가구 제작실** opens the browser editor. Only houses opened from the administrator studio also show a return link in 방 꾸미기 → 방 설정. The earlier release exclusions of the maker apply only to those earlier releases.

- **만들어 둔 협탁 불러오기** opens the previously completed three-view side table, including its original source pixels and editable grid bindings. Import, cutout/parts editing, original project/PNG/ZIP exports, and account-scoped draft recovery remain available.
- **우리집에서 미리보기** renders the current complete set in the actual room, through the editor's own Canvas 2D routines and shared projection. Preview never writes room placement or registers an item.
- **새 아이템으로 적용** commits the complete set and editable project to IndexedDB, then opens placement in our home. **배치 완료** saves its placement. Identical repeated applies reuse the item ID; edited versions create a new item. Built-in catalog entries remain separate.
- Catalog loading and image decoding finish before room normalization. Missing/corrupt custom records block loading and preserve the original room save. Registered projects can be reopened from the studio. There are at most 20 registered custom versions per account on this browser; export projects for safekeeping.
- Drafts and items are keyed to the administrator account on this device. They do not sync to other devices or publish into all users' homes. Clearing browser storage removes them. The same parent MessagePort/admin gate and role-loss closure protect the UI; static assets remain public.
- No AI provider key, server, or paid generation endpoint is installed. The installed UI explains that automatic AI drawing is unconnected. Image import, editing, preview, and local application work without that service. Parent-attached cushions/blankets must be composed into a floor-standing furniture set before application.

Focused verification: `node tests/furniture-studio-ui.test.cjs` imports the shipped completed side table, checks locked direct entry, no writes during preview, persistence/reopen, owner isolation and mobile overflow. Existing regression checks still apply.

## 우리집 충돌·중복 수정 — 2026-10-03

- 제작실에서 연 우리집의 **가구 제작실** 메뉴는 원래 작업창으로 돌아간다. 새 편집창을 만들거나 저장하지 못한 작업을 버리지 않는다. 일반 우리집에서는 제작실 메뉴를 표시하지 않는다.
- 가구 배치·치우기, 커튼, 방 확장은 기기 저장에 성공해야 확정된다. 실패하면 기존 방 상태와 편집 중 배치를 유지하고 다시 시도할 수 있다.
- v8 이전 저장의 폐기된 협탁은 새 협탁으로 복원하지 않는다. 현재 협탁·책상 배치와 사용자가 비운 방은 유지한다.
- 기존 가구 규칙 검사를 현재 카탈로그와 v11 저장 형식에 맞추고 CI에 연결했다. 저장 실패와 제작실 왕복은 두 개의 집중 UI 검사로 확인한다.

## 아파트 외벽 배경 — 2026-10-03

사용자 첨부 화면의 방 주변 빈 공간에 아파트 외벽 그림을 추가했다. `assets/apartment-wall-v1.webp`는 크림색 콘크리트 패널의 2D 배경이며 기존 방·가구 원본과 좌표는 유지한다. 현재 방 보기는 화면을 크게 채우는 확대 방식을 유지하고 좁은 외벽 여백만 둔다. 확대·축소와 전체 보기에서 방 주변에도 외벽이 보인다. 이웃 위치에는 `apartment-neighbor-v1.webp`의 닫힌 창문 외관을 배치해 아파트처럼 이어지며, 내 방 개수나 저장자료에는 포함하지 않는다.

이미지 생성: built-in image_gen, 창문·문·글자·사물 없이 넓은 가로 패널과 은은한 이음새가 있는 따뜻한 아이보리 아파트 외벽, 정면 2D 재질, 균일한 광원. 생성 원본 1536×1024를 같은 해상도의 WebP로 변환(146,826바이트).

후속 사용자 지시: 옆집은 창문으로 표현. 추가 이미지 생성: built-in image_gen, 같은 아이보리 아파트 외벽의 정면 3분할 닫힌 창문·은은한 유리 반사·아이보리 커튼, 방 내부와 인물 없이 외관만. 1536×1024 WebP 54,782바이트.

## 화면 크기에 맞는 축소 한도 — 2026-10-03

PC에서도 고정 배율 0.045까지 줄어들던 문제를 수정했다. 방 하나의 최소 크기는 해당 화면에 방 전체를 맞춘 크기의 68%이며 버튼·휠·핀치·키보드가 같은 한도를 사용한다. 한도에 도달하면 축소 버튼을 비활성화한다. 여러 방 전체 보기는 소유한 방을 기준으로 맞추고, 확장 모드에서는 바로 연결할 수 있는 이웃까지만 포함한다. 장식용 옆집과 아직 연결할 수 없는 빈칸은 크기 계산에서 제외한다. 방을 추가하면 새로 연결할 수 있는 이웃이 보이도록 다시 맞춘다.

후속 이동 제한: 현재 방이 화면보다 작으면 방 전체를 화면 안에 유지하고, 확대되어 화면보다 커지면 방 가장자리에서 이동을 멈춘다. 전체 보기와 확장은 실제 표시 대상의 범위를 사용한다. 드래그·핀치·휠·키보드·화면 크기 변경에 같은 제한을 적용한다. 배포 시 `version.json`과 월드의 `Go` 버전을 함께 올려 이미 열린 월드에서도 기존 업데이트 안내가 동작하게 한다. 기존 화면을 강제로 새로고침하지 않는다.

## 협탁 크기와 거실 테이블 — 2026-10-03

기준 확대 사진과 비교해 협탁을 기존 크기의 ⅔인 **1 × ⅔ × 0.9**로 교정했다. 기존 그림과 면의 원본 기준점을 보존하고 제작실에서 세 방향을 다시 내보냈다. 협탁 상판은 소파 팔걸이(1.08)의 약 83% 높이다. 내장 협탁과 기본 제작실 작업을 함께 수정하며 사용자의 별도 편집 아이템은 건드리지 않는다.

승인된 **거실 테이블**은 제작실의 등록 runtime을 그대로 사용하는 내장 가구다. 방 꾸미기에서 직접 선택해 놓으며 크기는 **2 × 1.5 × 0.6**이다. 초기 로딩 때 그림 준비를 마친 뒤 저장된 방을 읽어, 자료를 불러오지 못했을 때 기존 테이블 배치를 삭제하지 않는다. 기존 방에 자동 추가하지 않고 사용자 제작 아이템 슬롯을 쓰지 않는다. 책과 컵은 별도로 제작한 그림이며 상판에는 합치지 않았다.

## 우리집 회원 공개 — 2026-10-03

로그인한 회원은 월드의 우리집 건물과 우리집 메뉴에서 자신의 방을 열 수 있다. 가구 제작실은 관리자 모드에서만 연다. 일반 우리집은 제작 권한을 받지 않으며, 메뉴 숨김과 함께 제작실 전환 메시지도 거부한다. 관리자 제작실의 우리집 미리보기와 작업창 복귀는 유지한다. 기존 계정별 기기 저장키와 가구·의자/책상 연결 배치는 그대로 사용한다.
