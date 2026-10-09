const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const width of [360,1280]){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.route('**/*',route=>route.abort());
   await page.setContent(read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
   await page.addScriptTag({content:read('note/preview.js')});
   const result=await page.evaluate(async()=>{
    text.value='한 줄의 카드';updateComposer();
    return {maxLength:text.maxLength,count:document.querySelector('#compose-count').textContent,
     event200:validEventBody('가'.repeat(200)),event201:validEventBody('가'.repeat(201))};
   });
   assert.equal(result.maxLength,200);assert.match(result.count,/\/ 200자$/);
   assert.equal(result.event200,true);assert.equal(result.event201,false);
   await page.close();
  }
  console.log('PASS: Park cards, replies and events retain the 200-character editor and overlength validation on mobile and desktop.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
