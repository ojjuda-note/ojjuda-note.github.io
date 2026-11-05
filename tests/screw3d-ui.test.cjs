const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const {bundleScrew3d}=require('./screw3d-vm-bundle.cjs');
const userFlowFixture=require('./screw3d-user-flow-fixture.cjs');
const source = bundleScrew3d(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(process.env.SCREW_CHROMIUM ? { executablePath: process.env.SCREW_CHROMIUM } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 740 }, isMobile: true, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<canvas width="360" height="540"></canvas>' }));
    await page.goto('https://screw.test');
    await page.addScriptTag({ content: source + `
      const ctx = document.querySelector('canvas').getContext('2d');
      let game, state, testScrew, obstacle, purchases = 0;
      function boot(L = 1) {
        localStorage.setItem(STAGE_KEY, String(L));
        game = screw3d({ setScore() {}, getCoins: () => 0, buyScrew() { purchases++; }, end() {} }, L);
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
      const nearest=(x,y)=>{
        let answer=null,depth=-Infinity;
        const inside=(pts)=>{let hit=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){
          const a=pts[i],b=pts[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)hit=!hit;
        }return hit;};
        for(const it of state.order)for(const pg of it.polys)
          if(pg.depth&&(pg.visible||[pg.pts]).some(inside)){
            const d=depthAt(pg.depth,{x,y});if(d>depth){depth=d;answer=it.owner;}}
        return answer;
      };
      window.screwTest = {
        boot, fixture, tap,
        boxHUD() {
          boot(20);game.draw(ctx);game.draw(ctx);
          const before=ctx.getImageData(0,0,360,50).data;
          state.boxes[0].close=.65;game.draw(ctx);
          const after=ctx.getImageData(0,0,360,50).data;
          return before.every((v,i)=>v===after[i]);
        },
        depthPixels(software=false) {
          const surface=document.createElement('canvas');surface.width=360;surface.height=540;
          const c=surface.getContext('2d'),original=HTMLCanvasElement.prototype.getContext;
          if(software)HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args);};
          const renderer=createScrewDepthRenderer(),rect=[{x:20,y:250},{x:100,y:250},{x:100,y:330},{x:20,y:330}];
          const red={owner:{},alpha:1,polys:[{pts:rect,fill:'#FF0000',depth:[0,0,2]}]};
          const blue={owner:{},alpha:1,polys:[{pts:rect,fill:'#0000FF',depth:[0,0,1]}]};
          const pixel=(x,y)=>[...c.getImageData(x,y,1,1).data];
          try{
            renderer.draw(c,[red,blue],null,1,232,510);const first=pixel(60,280);
            c.clearRect(0,0,360,540);renderer.draw(c,[blue,red],null,1,232,510);const reversed=pixel(60,280);
            red.polys[0].depth=[.02,0,0];c.clearRect(0,0,360,540);renderer.draw(c,[red,blue],null,1,232,510);
            return {first,reversed,left:pixel(30,280),right:pixel(80,280),hud:pixel(60,200)};
          }finally{HTMLCanvasElement.prototype.getContext=original;renderer.destroy();}
        },
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
                  if(s.state!=='in'||blocked(s,state.lvl)||nearest(h.x,h.y)!==s||!state.boxes.some(b=>b&&!b.close&&b.c===s.color&&b.n+b.res<3))continue;
                  tap(h.x,h.y);if(s.state==='out'){picked=true;break;}
                }
                if(picked)break;
              }
              if(picked)break;
            }
            for(let i=0;i<30;i++)game.update(0.04);
            if(game.stageCleared){const previous=state.L;for(let i=0;i<80;i++)game.update(0.04);if(state.L!==previous)throw Error('Stage advanced without a choice');if(!game.continueStage(previous+1))throw Error('Explicit next-stage choice failed');}
          }
          game.draw(ctx);return {stage:state.L,rounds,purchases,elapsed:Math.round(performance.now()-begin),score:state.score};
        },
        perf(L) {boot(L);for(let i=0;i<6;i++)game.draw(ctx);const t=performance.now();for(let i=0;i<10;i++){state.yaw+=0.01;game.draw(ctx);}return Math.round((performance.now()-t)/10);},
        mountedTap() {
          boot(5);let visible=0;
          const mounted=state.lvl.screws.filter(s=>s.skinMount&&!s.guard).length;
          for(const pitch of [0,0.45,-0.45])for(let k=0;k<8;k++){
            state.yaw=k*Math.PI/4;state.pitch=pitch;game.draw(ctx);
            visible=Math.max(visible,[...state.heads.keys()].filter(s=>s.skinMount).length);
            for(const [s,h] of state.heads){
              if(!s.skinMount||blocked(s,state.lvl)||nearest(h.x,h.y)!==s||!state.boxes.some(b=>b&&!b.close&&b.c===s.color&&b.n+b.res<3))continue;
              tap(h.x,h.y);
              if(s.state==='out')return {mounted,visible,tapped:true};
            }
          }
          return {mounted,visible,tapped:false};
        },
        completeAnimal(stage,seed) {
          const originalRandom=Math.random;let value=seed>>>0;
          Math.random=()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/4294967296);
          try{
            boot(stage);const total=state.lvl.screws.length;
            let clicks=0,sorts=0,settled=false;
            const angles=[];
            for(const pitch of [.45,-.45,.9,-.9,0,1.35,-1.35])
              for(let k=0;k<12;k++)angles.push([k*Math.PI/6,pitch]);
            const inside=(x,y,pts)=>{
              let hit=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){
                const a=pts[i],b=pts[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)hit=!hit;
              }return hit;
            };
            const top=nearest;
            const advance=seconds=>{for(let i=0;i<seconds/.04;i++)game.update(.04);};
            while(clicks<total){
              let picked=false;
              for(const [yaw,pitch] of [[state.yaw,state.pitch],...angles]){
                state.yaw=yaw;state.pitch=pitch;game.draw(ctx);
                const fits=s=>state.boxes.some(b=>b&&!b.close&&b.c===s.color&&b.n+b.res<3);
                const moves=[...state.heads].filter(([s,h])=>s.state==='in'&&!blocked(s,state.lvl)
                  &&h.x>5&&h.x<315&&h.y>230&&h.y<520&&top(h.x,h.y)===s);
                moves.sort((a,b)=>Number(fits(b[0]))-Number(fits(a[0])));
                for(const [s,h] of moves){
                  if(!fits(s)&&!state.buf.includes(null))continue;
                  tap(h.x,h.y);
                  if(s.state==='out'){clicks++;picked=true;settled=false;break;}
                }
                if(picked)break;
              }
              if(picked){advance(1.6);continue;}
              if(state.buf.some(Boolean)&&sorts<30){tap(80,212);advance(10);sorts++;continue;}
              // Let real released debris fall away; do not delete occluders
              // or bypass the physics in this end-to-end browser regression.
              if(!settled){advance(16);settled=true;continue;}
              return {stage,seed,total,clicks,sorts,cleared:false,remaining:state.lvl.screws.filter(s=>s.state==='in').length};
            }
            for(let retry=0;retry<30&&!game.stageCleared;retry++){
              if(state.buf.some(Boolean)){tap(80,212);sorts++;}
              advance(16);
            }
            return {stage,seed,total,clicks,sorts,cleared:game.stageCleared,purchases};
          }finally{Math.random=originalRandom;}
        },
        rabbitOcclusion() {
          boot(20);
          const shots=[];
          for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
            state.yaw=yaw;state.pitch=0.18;game.draw(ctx);
            const features=state.order.filter(it=>it.owner.faceFeature);
            const polygons=features.flatMap(it=>it.polys);
            shots.push({
              plates:state.order.filter(it=>it.owner.skinPlate).length,
              front:polygons.filter(pg=>pg.visible?.length>0).length,
              hidden:polygons.filter(pg=>pg.visible?.length===0).length,
              unclipped:polygons.filter(pg=>!pg.visible).length
            });
          }
          return shots;
        }
      };
    `+'\nconst canvas=ctx,capture=()=>{};globalThis.confirm=()=>true;\n'+userFlowFixture });
    for(const software of [false,true])assert.deepEqual(await page.evaluate(mode=>screwTest.depthPixels(mode),software),
      {first:[255,0,0,255],reversed:[255,0,0,255],left:[0,0,255,255],right:[255,0,0,255],hud:[0,0,0,0]},
      'GPU and software use per-pixel depth, independent of painter order, without painting over the HUD');
    assert.equal(await page.evaluate(()=>screwTest.boxHUD()),true,'closing boxes cannot move across the title or progress HUD');
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
    assert.deepEqual(play.rounds, [{stage:1,screws:15},{stage:2,screws:21},{stage:3,screws:27}]);
    assert.equal(play.purchases, 0); assert.ok(play.score > 0);
    const contact=await page.evaluate(() => screwTest.mountedTap());
    assert.ok(contact.mounted>=10&&contact.visible>=1&&contact.tapped,
      `a surface-mounted screw must remain visible and clickable: ${JSON.stringify(contact)}`);
    const complete=[];
    for(const [stage,seed] of [[20,2],[20,9],[18,37],[19,37]]){
      const result=await page.evaluate(([stage,seed])=>screwTest.completeAnimal(stage,seed),[stage,seed]);
      assert.ok(result.cleared&&result.clicks===result.total&&result.purchases===0,
        `every animal fastener must be reachable with real taps and no purchases: ${JSON.stringify(result)}`);
      complete.push(result);
    }
    const rabbit=await page.evaluate(() => screwTest.rabbitOcclusion());
    assert.ok(rabbit.every(s=>s.plates===0&&s.unclipped===0&&s.front>0&&s.hidden>0),
      `curved rabbit must hide rear details and detached square plates: ${JSON.stringify(rabbit)}`);
    const userFlow=await page.evaluate(async()=>{localStorage.clear();const r=await play(20,4,31676,true);last.game.destroy();return r;});
    assert.ok(userFlow.cleared&&userFlow.clicks===123&&userFlow.boxes.length===3&&userFlow.buffer===6,
      'seed4 previously stopped at119/123 with overlapping heads; every actual GPU touch now completes');
    if (process.env.SCREW_SCREENSHOT) await page.screenshot({ path: process.env.SCREW_SCREENSHOT });
    if (process.env.SCREW_MODEL_QA) for (const L of [1, 5, 80]) {
      await page.evaluate(stage => { screwTest.boot(stage); }, L);
      await page.locator('canvas').screenshot({ path: path.join(process.env.SCREW_MODEL_QA, `screw-box-stage-${L}.png`) });
    }
    const perf = {};
    for (const L of [4, 20, 40, 160]) perf[L] = await page.evaluate(L => screwTest.perf(L), L);
    assert.deepEqual(errors, []);
    console.log('PASS: normal/large rendering, partial occlusion, moving-block touch and completed tutorial/animal rounds', JSON.stringify({ play, complete, userFlow, frameMs: perf }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
