const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const api=require('../shared/content/word-mask.js');

test('local masking preserves normal words and current catalog changes',()=>{
  const options={words:['씨발','시발','마약','fuck'],allow:['마약김밥','시발점']};
  for(const [raw,expected] of [
    ['오늘 마약김밥 먹고 산책해요','오늘 마약김밥 먹고 산책해요'],
    ['반가워 씨.1발 친구야','반가워 ❤️❤️ 친구야'],
    ['씨fuck발','❤️❤️'],['씨시발점발','❤️❤️시발점❤️❤️'],
    ['😀F.u.C.k! 반가워🥰','😀❤️❤️! 반가워🥰'],
  ]){
    assert.equal(api.maskText(raw,options),expected);
    assert.equal(api.maskText(expected,options),expected);
  }
  assert.equal(api.maskText('씨발',{words:[],allow:[]}),'씨발','disabled terms are not replaced');
  assert.equal(api.maskText('새 금칙어',{words:['새금칙어'],allow:[]}),'❤️❤️','custom terms use the same spans');
  assert.equal(api.maskText('마약김밥',{words:['마약'],allow:[]}),'❤️❤️김밥','an emptied allowlist is respected');
});

test('browser and module length helpers agree on complete mask tokens and Unicode',async()=>{
  const module=await import('../shared/content/text-length.mjs');
  for(const text of ['', '정상 문장','❤️❤️','a❤️❤️b','😀❤️❤️🥰','❤️❤️❤️❤️','❤️']){
    assert.equal(api.maskedTextLength(text),module.maskedTextLength(text));
    assert.equal(api.textInputMaxLength(text,40),module.textInputMaxLength(text,40));
  }
});

test('native editors keep masked saved text editable without widening ordinary text limits',async t=>{
  const dom=new JSDOM('<input id="bio" maxlength="4" value="가나❤️❤️">',{runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  dom.window.eval(fs.readFileSync(path.join(__dirname,'../shared/content/word-mask.js'),'utf8'));
  const stop=dom.window.OjjudaWordMask.watchInputs(dom.window.document,'#bio,#next');t.after(stop);
  const input=dom.window.document.querySelector('#bio');
  assert.equal(input.value,'가나❤️❤️');assert.equal(input.maxLength,7);
  input.value='가나다';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  assert.equal(input.maxLength,4,'removing the marker restores the ordinary limit');
  dom.window.document.body.insertAdjacentHTML('beforeend','<textarea id="next" maxlength="4">가나❤️❤️</textarea>');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(dom.window.document.querySelector('#next').maxLength,7,'reopened editors receive the token allowance');
  assert.equal(dom.window.document.querySelector('#next').value,'가나❤️❤️');
});

test('group activity editors retain masked options without relaxing ordinary label rules',t=>{
  const dom=new JSDOM('<form><fieldset data-editor="poll"><input name="activity_option"><input name="activity_option"></fieldset></form>',{runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  dom.window.eval(fs.readFileSync(path.join(__dirname,'../groups/activities.js'),'utf8'));
  const form=dom.window.document.querySelector('form');
  const inputs=form.querySelectorAll('input');
  const read=()=>dom.window.OjjudaGroupActivities.readEditor(form,'poll');
  inputs[0].value=inputs[1].value='❤️❤️';
  assert.deepEqual(Array.from(read().options),['❤️❤️','❤️❤️'],'separate masked choices retain their positions');
  inputs[0].value=inputs[1].value='산책';
  assert.throws(read,/구분/,'ordinary duplicate choices still require distinct labels');
  inputs[0].value='가'.repeat(39)+'❤️❤️';inputs[1].value='카페';
  assert.equal(read().options[0],inputs[0].value,'a saved marker counts as one logical character');
  inputs[0].value='가'.repeat(41);
  assert.throws(read,/40자/,'ordinary text keeps the existing maximum');
});
