const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('Matgo entrance stays at the public games URL after moving its module',()=>{
 let destination;const context={URL,Date,JSON,crypto:{randomUUID:()=> 'entry-id'},window:{frameElement:null},sessionStorage:{setItem(){}},location:{href:'https://ojjuda.kr/games/matgo-online.html',replace:url=>destination=url}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'games/matgo/matgo-start.mjs'),'utf8').replace(/^export /gm,''),context);
 assert.equal(context.openMatgoSolo({isTrusted:false}),false);assert.equal(destination,undefined);
 assert.equal(context.openMatgoSolo({isTrusted:true}),true);
 const url=new URL(destination);assert.equal(url.pathname,'/games/matgo.html');assert.equal(url.searchParams.get('entry'),'entry-id');assert.ok(fs.existsSync(path.join(root,url.pathname)));
});
