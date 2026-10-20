from pathlib import Path
import json,re,subprocess,sys
root=Path(sys.argv[1]); read=lambda f:(root/f).read_text()
def write(f,s): (root/f).write_text(s)
files=subprocess.check_output(['git','ls-files'],cwd=root,text=True).splitlines()
prefixes=['house-test/','apps/','ledger/','comics/','assets/world-places/','guide-assets/']
single='world-board.js world-board.css world-board-comments.js world-house-visit.js world-house-visit.css world-life.js world-life.css world-life-layout.js world-life-layout.css world-life-resize.js world-donflow.js world-schedule.js world-ledger.js world-places.js world-hero.svg world-hero-mobile.svg house-note-content.js guide.js guide.css guide-tour.css sitemap-search.js admin/house-content.js admin/house-content.css admin/review-inbox.js admin/review-inbox.css docs/AUTO-HOUSE-MEDIA.md docs/AUTO-HOUSE-NOTES.md docs/home-redesign-plan.md ops/home-profile-unification-2026-10-04.md ops/restore-short-card-queue-20261009.sql scripts/cut-sofa-original-layers.py scripts/prepare-house-media.py scripts/recalibrate-sofa-left.py scripts/sofa-left-calibration-weights.json'.split()
retired_test=re.compile(r'^(house-|sofa-|desk-|furniture-|studio-|wall-shelf-|shelf-|table-|chair-|carpet-|floor-|blanket-|botanical-frame-|coffee-table-|clover-mug-|pencil-cup-|open-book-|picture-assembly|contact-clearance|assembly-editor|item-manifest|item-catalog|window-plant-|accessory-floor-|creative-comics-|admin-house-content-|admin-review-inbox-|world-house-|world-life-|world-daily-tools-|world-ledger-|world-schedule-|world-places-|world-board-(?:ui|comments|detail-comments)|world-media-|donflow-|life-layout-)')
deleted=[f for f in files if any(f.startswith(p) for p in prefixes) or f in single or (f.startswith('tests/') and retired_test.match(Path(f).name))]
deleted += [f for f in ['tests/world-main-navigation-ui.test.cjs','tests/world-startup-response-ui.test.cjs'] if f in files]
subprocess.run(['git','rm','-r','--sparse','-f','--',*deleted],cwd=root,check=True,stdout=subprocess.DEVNULL)
package=json.loads(read('tests/package.json'))
for name,cmd in list(package['scripts'].items()):
 if name.startswith('test:furniture'):del package['scripts'][name];continue
 package['scripts'][name]=' && '.join(c for c in cmd.split(' && ') if not any(Path(f).name in c for f in deleted))
package['scripts']['test:unit']='node world-three-menus.test.cjs && '+package['scripts']['test:unit']
write('tests/package.json',json.dumps(package,ensure_ascii=False,indent=2)+'\n')
write('note/operations.js',re.sub(r'WORLD_KINDS = \{[^\n]+\}',"WORLD_KINDS = { chat: '대화', user: '사람' }",read('note/operations.js')))
write('AGENTS.md','\n'.join(l for l in read('AGENTS.md').splitlines() if not l.startswith('가구 제작·등록·배치'))+'\n')
write('_config.yml','# Runtime assets stay public; development files do not.\nexclude:\n  - tests\n  - ops\n  - supabase\n  - docs\n  - scripts\n')
write('ops/daily-note-content.md',"""# 공원 카드 자동 예약

2026-10-21부터 오쭈다월드는 오락실·공원·설정만 운영한다.
우리집·앨범·비디오·게시판·생활 기능과 예약은 종료했다.

공원 카드는 한국 시간 01:01·07:01·13:01·19:01에 하루 4장 게시한다.
`ojjuda_note_internal.auto_card_copy`, `auto_card_schedule`의 슬롯 1·4·7·10을 사용한다.
`planned_at`은 해당 날짜 01·07·13·19시 KST 정각이며 본문은 1–200자다.
`content_source='curated_automation'`, `gender='private'`, 기존 전국 후보 `site_id`를 사용한다.
`ojjuda_note_daily_auto_cards`의 cron은 UTC `1 4,10,16,22 * * *`이다.

내일·모레의 빈 슬롯만 채우고 누락된 과거 시각을 몰아서 발행하지 않는다.
날짜별 트랜잭션에서 `pg_advisory_xact_lock(284726,(local_day-date '2000-01-01')::integer)`을 잡고 기존 슬롯을 재확인한다.
본문과 예약은 같은 트랜잭션에 저장하며 금지어·중복·길이를 확인한다.
구형 `stage_auto_cards`와 `plan_auto_cards`는 호출하지 않는다.
실제 발행은 기존 `run_auto_cards()`와 서버 cron에 맡긴다.
중지된 설정이나 예약 작업을 임의로 재개하지 않는다.
""")
# Remove only the now-retired furniture job; retain current game, account and park gates.
p=root/'.github/workflows/regression.yml';s=p.read_text();s=re.sub(r'\n  furniture:\n[\s\S]*?(?=\n  regression:)', '',s);s=s.replace("      - 'house-test/assets/*.runtime.json'\n",'');p.write_text(s)
p=root/'.github/workflows/tank.yml';p.write_text(p.read_text().replace('world-board.js','world-game-rankings.js'))
print('Removed',len(deleted),'retired source, artwork and test files.')
