# Pastel apartment playtest

Administrator entry: World → administrator mode → **새 우리집 테스트**. Public houses remain under construction and the World store remains removed.

This is a 2.5D interaction prototype built from separate generated room/actor/pet art. It is not the final 3D character, rig, furniture editor or clothing system. The default lavender/cream/sage palette follows the approved reference. Native CSS/DOM scene layers animate the avatar and dog independently; the room stays 3:1. Touch drag, two-finger pinch, wheel, camera buttons and keyboard arrows support movement/zoom.

The centered starter cell is (0,0); columns −2…2 and floors −3…3 give 35 maximum cells. Only cells adjacent to an already owned room can open. Saved state is bounded, normalized, deduplicated and restricted to the connected component containing the start. Room theme, expansion and a private test diary persist per account **on this device only**, under `ojjuda-house-playtest-v1:<owner>`. No profile, wallet, ownership, game or production diary data is written.

A new iframe stays locked until its same-origin parent transfers an initialization MessagePort. World checks its existing administrator identity before opening; the host rechecks identity during loading, on messages and every 400ms, closes on account/role loss and never passes access tokens. This is a UI preview gate over public static art, not a replacement for server-side authorization.

The current pet implements throw/fetch, pet reaction and following. Motion uses one cancellable RAF, stops on hidden/unload, and respects reduced motion. Outfit display is explicitly a preview; wardrobe editing and individual furniture placement remain future work. Room themes can be applied/cleared in the playtest only.

## Art provenance

Built-in image generation, 2026-10-01. Reference: approved pastel mockup `exec-3c18395b-bc7a-46f4-a3e4-183a9e32496d.png`. Generated source images are preserved outside the deployment. Converted to WebP with alpha preserved for actors; total delivery under 600 KB.

- Room: panoramic 3:1 cutaway, lavender sofa, cream walls, honey oak, sage plants, blue daylight city, no actors or UI.
- Avatar: transparent cream-cardigan/sage-trousers character with brown bun, standing three-quarter right.
- Dog: transparent orange/cream corgi, full body, three-quarter right.

Validation: `node tests/house-playtest-ui.test.cjs` and normal inline/admin layout/navigation gates. The browser test covers administrator entry, direct-entry lock, mobile pointer movement/zoom, fetch/follow, connected bounded expansion, persistence, diary and role/account revocation.
