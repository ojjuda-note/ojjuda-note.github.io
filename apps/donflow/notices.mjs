import fs from 'node:fs';
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
let notices=fs.readFileSync('LICENSE','utf8')+'\n\nDonFlow upstream: https://github.com/maxmini0214/donflow\nCommit: 05a7462241be58f3dd36c92168a9ce1d5d61d7d4\nModified for Ojjuda: account integration, Korean defaults, legacy import, transaction editing, atomic backups.\n';
for(const [dir,pkg] of Object.entries(lock.packages||{})){
 if(!dir||pkg.dev||!fs.existsSync(dir))continue;
 const name=dir.split('node_modules/').at(-1);
 const files=fs.readdirSync(dir).filter(n=>/^(licen[sc]e|notice)(\.|$)/i.test(n));
 notices+='\n\n--- '+name+' '+pkg.version+' ('+(pkg.license||'see license')+') ---\n';
 for(const f of files)if(fs.statSync(dir+'/'+f).isFile())notices+=fs.readFileSync(dir+'/'+f,'utf8')+'\n';
}
fs.writeFileSync('../../ledger/THIRD_PARTY_NOTICES.txt',notices);
fs.copyFileSync('LICENSE','../../ledger/LICENSE.txt');
