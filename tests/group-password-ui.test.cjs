const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const files = path.resolve(__dirname,'..');
const roomId = '10000000-0000-4000-8000-000000000001';
const inviteId = '20000000-0000-4000-8000-000000000002';

async function fixture(browser,options={}) {
  const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  await page.route('https://group.test/**',route=>route.fulfill({contentType:'text/html',
    body:'<body class="world-redesign"><section id="board"></section></body>'}));
  await page.goto('https://group.test/world.html?tab=group'+(options.hash||''));
  await page.evaluate(({roomId,inviteId,options})=>{
    const userId='30000000-0000-4000-8000-000000000003';
    const room={id:roomId,name:'우리 모임',owner_id:options.owner?userId:'other',member_count:2,
      join_mode:options.open?'open':'password',password_required:!options.open,auto_join:true,
      password_confirmation_required:false,is_member:!!options.member,age_eligible:true};
    const state={room,stored:'처음',owner:!!options.owner,revision:1,verified:options.member?1:0,created:[],actions:[]};
    function readRoom(){return {...room,password_revision:state.revision,password_confirmation_required:room.is_member&&room.password_required&&state.verified!==state.revision&&!state.owner};}
    window.fixture=state;
    const auth={getUser:async()=>({data:{user:{id:userId}}}),onAuthStateChange(){}};
    const rpc=async(name,args)=>{
      const action=name==='group_home_sorted'?'home':args.p_action;
      const p=args.p_payload||{};
      state.actions.push(action);
      const invitations=room.is_member?[]:[{id:inviteId,room_id:roomId,group_name:room.name,password_required:room.password_required,age_eligible:true}];
      if(action==='home')return {data:{rooms:room.is_member?[readRoom()]:[],directory:[readRoom()],invitations}};
      if(action==='rooms'){
        if(state.delay){state.delay=false;await new Promise(resolve=>state.resume=resolve);}
        return {data:room.is_member?[readRoom()]:[]};
      }
      if(action==='preview_link')return {data:{room_id:roomId,group_name:room.name,member:room.is_member,...readRoom()}};
      if(action==='create_room'){state.created.push({name:p.name,password:p.password});return {data:{id:roomId}};}
      if(action==='set_password'){
        if(p.expected_revision!==state.revision)throw Error('Stale version');
        state.stored=p.password;state.revision++;room.password_required=!!p.password;room.join_mode=p.password?'password':'open';return {data:{ok:true}};
      }
      if(['accept_link','accept','request','unlock'].includes(action)){
        if(room.password_required&&state.stored!==p.password)return {data:{ok:false,reason:p.password?'password_incorrect':'password_required',message:'그룹 비밀번호를 확인해 주세요.'}};
        state.verified=state.revision;room.is_member=true;return {data:{room_id:roomId,member:true}};
      }
      if(action==='feed')return {data:[{id:inviteId,author_id:userId,nickname:'회원',body:'회원 전용 기록',kind:'post',created_at:'2026-11-25T10:00:00Z',media:[],comment_count:0}]};
      return {data:[]};
    };
    window.OjjudaGetClient=async()=>({auth,rpc});
    const shadow=document.querySelector('#board').attachShadow({mode:'open'});
    shadow.innerHTML='<main id="app"></main><div id="toast"></div>';
  },{roomId,inviteId,options});
  for(const file of ['groups/style.css','groups/navigation.css']){
    await page.evaluate(css=>{const style=document.createElement('style');style.textContent=css;document.querySelector('#board').shadowRoot.append(style);},fs.readFileSync(path.join(files,file),'utf8'));
  }
  await page.addScriptTag({path:path.join(files,'groups/app.js')});
  await page.evaluate(()=>{window.board=OjjudaGroups.mount(document.querySelector('#board').shadowRoot);});
  return page;
}

test('password membership in the group tab, incoming invitations and owner controls',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
  try{
    for(const mode of ['directory','received','link']){
      const page=await fixture(browser,mode==='link'?{hash:'#invite='+inviteId}:{});
      if(mode!=='link'){
        await page.getByRole('img',{name:'비밀번호 그룹'}).waitFor();
        await page.locator(mode==='directory'?'[data-request]':'[data-accept-invite]').click();
      }
      const form=page.locator('dialog[open] form');
      const password=form.locator('input[type=password]');await password.fill('틀림');
      await form.locator('[type=submit]').click();await form.getByText('그룹 비밀번호를 확인해 주세요.').waitFor();
      assert.equal(await page.locator('#feed').count(),0);
      await password.fill('처음');await password.press('Enter');
      await page.getByText('회원 전용 기록').waitFor();
      assert.equal(await page.evaluate(()=>Object.keys(localStorage).length+Object.keys(sessionStorage).length),0);
      assert.ok(!decodeURIComponent(page.url()).includes('처음'));
      await page.locator('[data-action=home]').click();await page.locator('[data-room]').click();
      await page.getByText('회원 전용 기록').waitFor();
      assert.equal(await page.locator('input[type=password]').count(),0);
      // Simulate another device changing the password while this tab is away.
      await page.evaluate(()=>{board.suspend();fixture.revision++;fixture.stored='변경됨';fixture.delay=true;board.resume();});
      assert.ok(!await page.getByText('회원 전용 기록').isVisible());
      await page.waitForFunction(()=>typeof fixture.resume==='function');await page.evaluate(()=>fixture.resume());
      const unlock=page.locator('[data-unlock-room]');await unlock.waitFor();
      assert.equal(await page.locator('#feed').count(),0);
      await unlock.locator('input').fill('변경됨');await unlock.locator('button').click();await page.getByText('회원 전용 기록').waitFor();
      await page.close();
    }
    const open=await fixture(browser,{open:true});
    await open.locator('[data-request]').click();await open.getByText('회원 전용 기록').waitFor();
    assert.equal(await open.locator('.group-lock,input[type=password]').count(),0);
    await open.close();
    const owner=await fixture(browser,{owner:true,member:true});
    for(const value of ['','새 암호']){
      await owner.locator('[data-action=create]').click();const create=owner.locator('#room-form');
      await create.locator('[name=name]').fill('새 방');await create.locator('[name=password]').fill(value);
      await create.locator('button').click();await create.waitFor({state:'detached'});
    }
    assert.deepEqual(await owner.evaluate(()=>fixture.created.map(x=>x.password)),['','새 암호']);
    await owner.locator('[data-room]').click();await owner.locator('[data-action=manage]').click();
    const settings=owner.locator('[data-password-settings]');await settings.locator('input').fill('교체');await settings.locator('[type=submit]').click();
    await settings.waitFor({state:'detached'});await owner.locator('[data-action=manage]').click();
    await owner.locator('[data-remove-password]').click();await owner.locator('[data-yes]').click();
    await owner.waitForFunction(()=>fixture.room.join_mode==='open');
    await owner.close();
  } finally{await browser.close();}
});

