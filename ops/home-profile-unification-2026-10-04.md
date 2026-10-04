# Home, profile photos and unified menus — 2026-10-04

Target release: 0.45.40-beta.

## Findings and changes

- Visitor routes rendered the owner's loading placeholder while excluding visitors from the actual room opener. Restored a visitor view, modern `house_posts` visible through existing RLS, closed-door handling and cancellation of stale visit requests. Teleporting excludes the current member's room.
- New room layouts existed only in local storage. Added account-owned geometry snapshots with revision checks, local backups and pending-change recovery. Visitors get a read-only room, without decorating/profile-edit actions. Local diary text and custom artwork are never sent with room geometry.
- Home's fixed-height split header cropped the room and hid its saved size. Replaced it with one full-width scene containing the profile, and fit the complete saved room arrangement. Removed nested sticky scrolling that overlapped tabs/folders when a mobile keyboard opened.
- Removed the legacy local diary-copy/media sections from signed-in home records. Existing local records remain intact.
- Added profile image selection, drag/keyboard positioning, slider/touch pinch zoom, cancellation, saving and later recropping. Store a 512px JPEG derivative and a private source limited to 2048px. Other members can read only the selected derivative. A restrictive source policy prevents legacy album-path references from granting access to uncropped originals.
- World and Park independently read two notice settings. Park now uses the common World notice; existing editor RPCs write the common setting, preserve the old text, and update the displayed notice immediately after saving.
- Administrator menus now use Account, Content, Reports/Support, Ju and Operations. Old service-specific routes still resolve. Preserved role checks, drafts, pending-save guards and the existing functions, and fixed an overlay that blocked card actions.
- Grouped the shared menu by purpose and removed redundant descriptions. Moved the local-storage note into life tools and fixed narrow-screen overflow.

## Server migrations

Applied to the existing primary World project:

- `20261004090241_unify_service_notice.sql`
- `20261004090503_house_room_sync.sql`
- `20261004090523_profile_photo_storage.sql`
- `20261004091534_profile_photo_source_guard.sql`

Read-only production checks confirmed one canonical notice, room RLS, no direct authenticated room updates, no anonymous room RPC execution, and the restrictive source-image policy. Security advisor categories remain the existing five categories; this change does not represent resolution of older advisor findings.

## Verification

Meaningful regression coverage includes:

- Actual World → room host → iframe → room-service integration, direct/teleport/demo visits, closed doors, public/folder-visible records, stale requests and account changes.
- Mobile 320/390px, desktop 1280px, multiple-room fitting and a 390×330 keyboard viewport.
- Photo cropping/pinch/reopen, upload/save failure and uncertain responses, private-source policy bypass attempts, signing retries/renewal and account isolation.
- Room owner-only writes, bidirectional blocking, withdrawn sessions, geometry-only payloads, revision conflicts, lost responses, pending local changes and retry.
- Unified administrator routes and actual embedded card/notice tools, draft/pending guards, role checks and immediate notice updates.

All 49 unit-gate commands and 63 UI-gate commands passed locally. Tests were resumed at each corrected legacy fixture instead of rerunning unrelated checks. The repository's normal CI also runs the complete test command, including screw-game checks.

## Compatibility

Existing device-only room layouts sync when that member opens their home on the device holding the layout. Built-in furniture is shared with visitors. Custom artwork remains device-only; its placement is retained, and editing is blocked on a device missing that artwork instead of silently removing it. Removed legacy controls do not delete stored diary/media data.
