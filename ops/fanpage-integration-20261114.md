# Fanpage pending updates integration — 2026-11-14

User explicitly authorized applying all pending fanpage updates. The regular hourly rotation and all automation schedules are unchanged.

## Reconciled pull requests
913, 915, 919, 929, 939, 940, 947, 948, 951, 999, 1017, 1019, 1033, 1034, 1035, 1037, 1040, 1043, 1045, 1046, 1051, 1053.

The first nine PRs overlap subsequent main updates. Preserve newer official announcement dates, verified birthdays, complete album track lists, venue corrections, event end dates and closed preorder notices. Do not restore expired Vancouver performances, inferred personal values, or unverified RIIZE DICON notice 14906. Unverified entries are not reported as applied.

The later 13 PR deltas are integrated at their reviewed, pinned heads. Independent SEVENTEEN/RIIZE profile additions are both preserved. The video validator now requires all 30 existing artists, including Stray Kids; ID/duplicate/privacy/source assertions are unchanged.

Missing verified earlier facts retained: KiiiKiii × New Era; BOYNEXTDOOR LG U+ announcement/ambassadorship and Golden Disc awards; STAYC I WANT IT official-video sponsorship by Tourism Authority of Thailand and Kimpton Maa-Lai Bangkok (2025-07-21).

## Previously blocking tests
Existing drinking-prompt admin menus were absent from two exact expected-menu lists. Add their existing labels/IDs without dropping any assertion. Poker's World fixture handled the retired arcade_extra_rooms call; update it to the actual arcade_general_extra_rooms RPC and load that exact shipped SQL wrapper. Empty neighbouring-game feeds isolate the poker test; real poker SQL, adult gating, room counts, create/join/cancel and ranking assertions remain intact. No production game/admin logic or version is changed.

## Source evidence
- https://www.youtube.com/watch?v=W8ml4ryPwic — official STAYC video sponsorship description and upload date.
- https://m.lguplus.com/about/ko/corporation/promotion/press-kit/detail?atclNo=2000001561&pageNo=1&srchCond=titCon — official BOYNEXTDOOR LG U+ announcement.
- https://enews.imbc.com/News/RetrieveNewsInfo/490432 — BOYNEXTDOOR Golden Disc awards.
- https://www.bntnews.co.kr/article/view/bnt202602130181 — New Era collaboration.

## Release gate
Profile/video/syntax/source-layout checks and 160 fanpage tests passed on the integrated data before the final fixture adjustment. All required PR checks, real mobile/photo checks, Pages publishing and deployed-file comparison must pass before reporting deployment complete. The release PR and Actions runs hold final execution evidence.
