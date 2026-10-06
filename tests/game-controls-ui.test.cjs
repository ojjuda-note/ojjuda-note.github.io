const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..');
const engine=fs.readFileSync(path.join(root,'games/breakout-game.js'),'utf8').replace('    return game;','    game.inspect=()=>({balls,speed,bricks});return game;');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
try{const context=await browser.newContext({viewport:{width:320,height:720}});await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://controls.test')return r.abort();if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/game-controls.css"><div data-game-settings="breakout"></div><div data-game-settings="photo_ttang"></div><div data-game-settings="ttang"></div><script src="/game-controls.js" defer></script>'});return r.fulfill({path:path.join(root,u.pathname)});});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://controls.test/');
const photo=page.locator('[data-controls-game=photo_ttang]'),brick=page.locator('[data-controls-game=breakout]');
await photo.locator('summary').click();await photo.locator('[data-game-setting=size]').selectOption('small');await photo.locator('[data-game-setting=sensitivity]').selectOption('low');await photo.locator('[data-game-setting=turn]').selectOption('slow');
await brick.locator('summary').click();await brick.locator('[data-game-setting=speed]').selectOption('slow');await page.reload();
assert.equal(await photo.locator('[data-game-setting=size]').inputValue(),'small');assert.equal(await brick.locator('[data-game-setting=speed]').inputValue(),'slow');
assert.equal(await page.locator('[data-controls-game=ttang] [data-game-setting=turn],[data-controls-game=ttang] [data-game-setting=speed]').count(),0,'multiplayer physics cannot be changed by personal controls');
assert.deepEqual(await page.evaluate(()=>{const el=document.createElement('div');el.innerHTML='<i></i>';const s=OjjudaGameControls.styleJoystick(el,'photo_ttang');return [s.size,s.dead,el.style.width];}),[72,5,'72px']);
await page.addScriptTag({content:engine});
for(const [choice,expected] of [['slow',224],['normal',280],['fast',322]]){
 if(!await brick.evaluate(el=>el.open))await brick.locator('summary').click();await brick.locator('[data-game-setting=speed]').selectOption(choice);
 const result=await page.evaluate(()=>{const scores=[],ends=[],g=OjjudaBreakoutGame.create({setScore:s=>scores.push(s),end:s=>ends.push(s)});g.onDown(180);const state=g.inspect(),brick=state.bricks.find(b=>!b.solid),ball=state.balls[0];Object.assign(ball,{x:brick.x+brick.w/2,y:brick.y+brick.h+.01+ball.r,vx:0,vy:-state.speed});g.update(1/240);for(let n=0;n<3;n++){g.onDown(180);for(const b of g.inspect().balls)b.y=600;g.update(1/240);}return{speed:state.speed,scores,ends};});
 assert.ok(Math.abs(result.speed-expected)<.01);assert.deepEqual(result.scores,[10]);assert.deepEqual(result.ends,[10],'every selected speed returns the actual score');
}
await photo.locator('summary').click();await photo.locator('[data-controls-reset]').click();assert.equal(await photo.locator('[data-game-setting=size]').inputValue(),'normal');assert.equal(await photo.locator('[data-game-setting=turn]').inputValue(),'normal');
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);console.log('PASS: saved per-game controls, reset, joystick geometry, fixed multiplayer physics and unchanged scoring at all ball speeds');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
