const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../screw3d.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(process.env.SCREW_CHROMIUM ? { executablePath: process.env.SCREW_CHROMIUM } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 740 }, isMobile: true, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="360" height="540"></canvas>' }));
    await page.goto('https://screw.test');
    await page.addScriptTag({ content: source.replace(/export \{[^}]*\};/, '') + `
      const ctx = document.querySelector('canvas').getContext('2d');
      let game, state, testScrew, obstacle, purchases = 0;
      function boot(L = 1) {
        localStorage.setItem(STAGE_KEY, String(L));
        game = screw3d({ setScore() {}, getCoins: () => 0, buyScrew() { purchases++; }, end() {} });
        state = window.__ojjScrew3d; state.touched = true;
      }
      function fixture(big = false) {
        boot(); const base = el('block', boxGeom([0.2,0.2,0.1]), [0,0,-0.1], I3, '#CDEFD9');
        obstacle = cube(0,0,0,'#F4C28F'); obstacle.dyn = { c: [0,0,0.25], R:I3, t:0, sleep:1 };
        testScrew = { p:[0,0,0], a:[0,0,1], thru:base, into:base, state:'in', color:0, t:0 };
        const els = [base,obstacle];
        if (big) for(let i=0;i<350;i++) els.push(el('plate',boxGeom([0.001,0.001,0.001]),[20+i,0,0],I3,'#D9DEEE'));
        state.lvl = mapLevel({ name:'가림 검사', els, screws:[testScrew], queue:[0] });
        state.yaw = state.pitch = 0; state.sc = state.zm = 1; state.pan = [0,0];
        state.boxes = [{c:0,n:0,res:0,close:0},null]; state.qi=1; state.big=big;
        game.draw(ctx); game.draw(ctx);
      }
      const tap = (x,y) => { game.onDown(x,y,1); game.onUp(x,y,1); };
      window.screwTest = {
        boot, fixture, tap,
        covered() { return {visible:state.drawn.filter(p=>p.owner===testScrew).length, state:testScrew.state,big:state.big,pixel:[...ctx.getImageData(180,392,1,1).data]}; },
        move(x) { obstacle.dyn.c=[x,0,0.25];game.draw(ctx); },
        partial() { obstacle.dyn.c=[0.21,0,0.25];game.draw(ctx);return state.drawn.filter(p=>p.owner===testScrew).flatMap(p=>p.pts).every(p=>p.x<=180.01); },
        xray() {
          obstacle.c=obstacle.dyn.c;obstacle.dyn=null;state.lvl=mapLevel(state.lvl);
          state.lens={x:180,y:392,hold:true,t:state.t};game.draw(ctx);state.t+=1;game.draw(ctx);game.draw(ctx);
          return {visible:state.drawn.some(p=>p.owner===testScrew),blocked:blocked(testScrew,state.lvl)===obstacle};
        },
        async tutorials() {
          boot(); const rounds=[], begin=performance.now();
          for(let attempt=0;attempt<350 && state.L<4;attempt++) {
            if(!rounds.some(r=>r.stage===state.L))rounds.push({stage:state.L,screws:state.lvl.screws.length});
            let picked=false;
            for(const pitch of [0.9,-0.9,0,1.3,-1.3]) {
              for(let k=0;k<8;k++) {
                state.yaw=k*Math.PI/4;state.pitch=pitch;game.draw(ctx);
                for(const [s,h] of state.heads) {
                  if(s.state!=='in'||blocked(s,state.lvl)||!state.boxes.some(b=>b&&!b.close&&b.c===s.color&&b.n+b.res<3))continue;
                  tap(h.x,h.y);if(s.state==='out'){picked=true;break;}
                }
                if(picked)break;
              }
              if(picked)break;
            }
            for(let i=0;i<30;i++)game.update(0.04);
          }
          game.draw(ctx);return {stage:state.L,rounds,purchases,elapsed:Math.round(performance.now()-begin),score:state.score};
        },
        perf(L) {boot(L);for(let i=0;i<6;i++)game.draw(ctx);const t=performance.now();for(let i=0;i<10;i++){state.yaw+=0.01;game.draw(ctx);}return Math.round((performance.now()-t)/10);}
      };
    ` });
    for (const big of [false, true]) {
      await page.evaluate(big => screwTest.fixture(big), big);
      let result = await page.evaluate(() => screwTest.covered());
      assert.equal(result.visible, 0, 'released foreground block fully hides the rear screw');
      assert.equal(result.big, big);
      await page.evaluate(() => screwTest.tap(180, 392));
      assert.equal((await page.evaluate(() => screwTest.covered())).state, 'in', 'hidden screw cannot be selected');
      assert.equal(await page.evaluate(() => screwTest.partial()), true, 'partial cover clips drawing and hit polygons at the same edge');
      await page.evaluate(() => screwTest.move(0.8));
      assert.ok((await page.evaluate(() => screwTest.covered())).visible > 0, 'moving block reveals the screw');
      await page.evaluate(() => screwTest.tap(180, 392));
      assert.equal((await page.evaluate(() => screwTest.covered())).state, 'out', 'cleared screw can be unscrewed immediately');
    }
    await page.evaluate(() => screwTest.fixture());
    assert.deepEqual(await page.evaluate(() => screwTest.xray()), {visible:true,blocked:true}, 'intentional x-ray reveals the screw while keeping its physical blocker');
    const play = await page.evaluate(() => screwTest.tutorials());
    assert.equal(play.stage, 4, 'touch gameplay advances through all three easy rounds');
    assert.deepEqual(play.rounds, [{stage:1,screws:12},{stage:2,screws:18},{stage:3,screws:24}]);
    assert.equal(play.purchases, 0); assert.ok(play.score > 0);
    if (process.env.SCREW_SCREENSHOT) await page.screenshot({ path: process.env.SCREW_SCREENSHOT });
    const perf = {};
    for (const L of [4, 40, 160]) perf[L] = await page.evaluate(L => screwTest.perf(L), L);
    assert.deepEqual(errors, []);
    console.log('PASS: normal/large rendering, partial occlusion, moving-block touch and three completed tutorial rounds', JSON.stringify({ play, frameMs: perf }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
