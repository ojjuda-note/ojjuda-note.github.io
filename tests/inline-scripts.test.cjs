const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ojjuda-syntax-'));
try{
 const world=fs.readFileSync(path.join(__dirname,'..','world.html'),'utf8');
 const current=world.match(/\bGo="([^"]+)"/)?.[1],published=JSON.parse(fs.readFileSync(path.join(__dirname,'..','version.json'),'utf8')).version;
 if(!current||current!==published)throw new Error(`World version ${current} must match version.json ${published}; otherwise the update notice repeats after reloading`);
 let count=0;
 for(const file of ['index.html','world.html','park/index.html','note/index.html','games/matgo.html','games/ttang.html','games/photo-ttang.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   if(/\bsrc\s*=/.test(match[1])||!match[2].trim()||/application\/(?:ld\+)?json/.test(match[1]))continue;
   const target=path.join(temp,`${count++}.mjs`);fs.writeFileSync(target,match[2]);
   const result=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});
   if(result.status!==0)throw new Error(`Invalid inline JavaScript in ${file}: ${result.stderr.split('\n').filter(line=>/SyntaxError/.test(line)).join(' ')}`);
  }
 }
 console.log(`PASS: ${count} complete inline application scripts parse`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
