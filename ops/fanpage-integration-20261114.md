# Fanpage pending updates integration — 2026-11-14

User explicitly authorized applying all pending fanpage updates. The regular hourly rotation and all automation schedules are unchanged.

## Reconciled pull requests
913, 915, 919, 929, 939, 940, 947, 948, 951, 999, 1017, 1019, 1033, 1034, 1035, 1037, 1040, 1043, 1045, 1046, 1051, 1053.

The first nine PRs overlap subsequent main updates. Preserve newer official announcement dates, verified birthdays, complete album track lists, venue corrections, event end dates and closed preorder notices. Do not restore expired Vancouver performances, inferred personal values, or unverified RIIZE DICON notice 14906. Unverified entries are not reported as applied.

The later 13 PR deltas are integrated at their reviewed, pinned heads. Independent SEVENTEEN/RIIZE profile additions are both preserved. The video validator now requires all 30 existing artists, including Stray Kids; ID/duplicate/privacy/source assertions are unchanged.

Missing verified earlier facts retained: KiiiKiii × New Era; BOYNEXTDOOR LG U+ announcement/ambassadorship and Golden Disc awards; STAYC I WANT IT official-video sponsorship by Tourism Authority of Thailand and Kimpton Maa-Lai Bangkok (2025-07-21).

## Previously blocking tests
Existing drinking-prompt admin menus were absent from three exact expected-menu lists, including world-three-menus.test.cjs. Add their existing labels/IDs without dropping any assertion. Poker's World fixture handled the retired arcade_extra_rooms call; update it to the actual arcade_general_extra_rooms RPC and load that exact shipped SQL wrapper. Empty neighbouring-game feeds isolate the poker test; real poker SQL, adult gating, room counts, create/join/cancel and ranking assertions remain intact. No production game/admin logic or version is changed.

## Source evidence
- https://www.youtube.com/watch?v=W8ml4ryPwic — official STAYC video sponsorship description and upload date.
- https://m.lguplus.com/about/ko/corporation/promotion/press-kit/detail?atclNo=2000001561&pageNo=1&srchCond=titCon — official BOYNEXTDOOR LG U+ announcement.
- https://enews.imbc.com/News/RetrieveNewsInfo/490432 — BOYNEXTDOOR Golden Disc awards.
- https://www.bntnews.co.kr/article/view/bnt202602130181 — New Era collaboration.

## Latest verified additions: PRs 1059 and 1060
These additions use integration baseline 45a721965928068e7c9d07980b431b8d08e2ae1e, TWS PR 1059 head 5948e052dd060beb2c1b6b208435f1f7c2d7b99c, and NCT DREAM PR 1060 head 48feedfb2eeae2bdf74b1aca4ec64c61a9d4b4b8. Only the two artists' content deltas are applied; none of the incoming PRs' test or shared UI changes are copied. Existing strict test corrections remain intact.

- TWS: add the verified SHINYU birthday mobile fourth preorder (2026-11-09 13:00 to 2026-11-16 23:59 KST, shipment from 2027-02-10); add the 2025-09-29 TV10 group photo with CC BY 3.0 attribution; remove the finished 2026-11-13 Withmuu video-call fansign.
- NCT DREAM: replace the finished 2026-11-14 MMA item with the 2026-11-15 SBS recordings at 03:20 (11/15 broadcast) and 09:25 (11/22 broadcast); keep the closed application status visible; add the two official notices to news; correct the six members' birthdays from SMTOWN OFFICIAL JAPAN.
- Refresh only artists-extra.js and profiles-extra.js cache references to 20261114-recovery24. The two pages otherwise remain byte-for-byte equivalent to their baseline.

### Additional primary sources
- https://shop.weverse.io/ko/shop/USD/artists/165/notices/14893
- https://commons.wikimedia.org/wiki/File:TWS_250929.jpg
- https://weverse.io/tws/notice/40394
- https://weverse.io/nctdream/notice/40986
- https://weverse.io/nctdream/notice/40989
- https://smtown-official.jp/pickup/

### Held changes
PR 1060's new video sz4c8LG8LJU (https://youtu.be/sz4c8LG8LJU) is not included. The YouTube title matches the claimed NCT DREAM Music Bank performance on 2026-11-13, but the official uploader channel could not be independently confirmed from the original page. Secondary mirrors do not complete that check. This is a source-identity hold, separate from playback validation. videos.js and all 165 existing entries remain unchanged, so PR 1060 is only partially superseded.

PR 918 remains outside this integration because its older sources conflict with later verified data. It must not be reported as fully applied or automatically closed.

### Additional local validation
The exact baseline file blobs match their GitHub SHAs. Both changed JavaScript files pass syntax checks. The existing profile and video validators pass: 30 unique artists, 16 girl groups, 14 boy groups, 204 members, 131 releases, 251 events, and 165 existing video embeds. All 28 other artist objects and their profiles are deeply equal to the baseline; only the NCT DREAM profile changes. Source-level video entries remain byte-for-byte unchanged. These checks validate structure and preservation; they do not claim video playback or deployment success.

## Release gate
Profile/video/syntax/source-layout checks and 160 fanpage tests passed on the integrated data before the final fixture adjustment. All required PR checks, real mobile/photo checks, Pages publishing and deployed-file comparison must pass before reporting deployment complete. The release PR and Actions runs hold final execution evidence.
