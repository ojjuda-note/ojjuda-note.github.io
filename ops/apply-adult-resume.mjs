import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = value => createHash('sha256').update(value).digest('hex');
const changes = [
  {
    "path": "world.html",
    "before": "431e92b956e933f8961a67a9c2bff853e0d77030135f40c28ddb35dec249b94b",
    "after": "c6186cfca7ced0c3944a47a1dff35d4735eefa1379da2ca1c087b74168c3ce0e",
    "replacements": [
      [
        "matgo-access.js?v=20261005-member-refresh1",
        "matgo-access.js?v=20261013-resume1"
      ],
      [
        "var Go=\"0.45.113-beta\"",
        "var Go=\"0.45.114-beta\""
      ],
      [
        "async function refreshWorldMatgoAccess(){\n const access=window.OjjudaMatgoAccess,owner=D.online?D.user?.id:null;\n if(!owner||!access)return;\n try{await access.refresh()}catch{}\n if(!D.online||D.user?.id!==owner||g.tab!==\"place\"||g.place?.id!==\"arcade\")return;\n const buttons=document.querySelector('#ppanel .bd-btns');\n if(!buttons)return;\n // Update only the game button, preserving chat drafts, focus and other games.\n buttons.querySelector('[data-act=\"matgo-open\"]')?.remove();\n buttons.insertAdjacentHTML('beforeend',worldMatgoButton());\n}\n",
        "var worldMatgoRefreshRequest=0,worldMatgoRetryTimer=null,worldMatgoResumeTimer=null;\nasync function refreshWorldMatgoAccess(retry=0){\n const access=window.OjjudaMatgoAccess,owner=D.online?D.user?.id:null;\n const request=++worldMatgoRefreshRequest;\n clearTimeout(worldMatgoRetryTimer);\n if(!owner||!access)return;\n let failure=null;\n try{await access.refresh()}catch(error){failure=error}\n if(request!==worldMatgoRefreshRequest||!D.online||D.user?.id!==owner)return;\n // A returning phone can still be reconnecting. Recover without a page reload.\n if(failure?.code==='unavailable'&&retry<2&&!document.hidden){\n  worldMatgoRetryTimer=setTimeout(()=>{\n   if(request===worldMatgoRefreshRequest&&D.online&&D.user?.id===owner&&!document.hidden)void refreshWorldMatgoAccess(retry+1);\n  },1500*(retry+1));\n }\n if(g.tab!==\"place\"||g.place?.id!==\"arcade\")return;\n const buttons=document.querySelector('#ppanel .bd-btns');\n if(!buttons)return;\n // Update only the game button, preserving chat drafts, focus and other games.\n buttons.querySelector('[data-act=\"matgo-open\"]')?.remove();\n buttons.insertAdjacentHTML('beforeend',worldMatgoButton());\n}\nfunction resumeWorldMatgoAccess(){\n clearTimeout(worldMatgoResumeTimer);\n const owner=D.online?D.user?.id:null;\n if(!owner||document.hidden)return;\n // Coalesce visibility, focus and pageshow after the auth client's resume handler.\n worldMatgoResumeTimer=setTimeout(()=>{\n  if(D.online&&D.user?.id===owner&&!document.hidden)void refreshWorldMatgoAccess();\n },150);\n}\ndocument.addEventListener('visibilitychange',resumeWorldMatgoAccess);\nwindow.addEventListener('focus',resumeWorldMatgoAccess);\nwindow.addEventListener('online',resumeWorldMatgoAccess);\nwindow.addEventListener('pageshow',event=>{if(event.persisted)resumeWorldMatgoAccess()});\n"
      ]
    ]
  },
  {
    "path": "games/matgo.html",
    "before": "8def182131d6e1f8d5b132dd9157a75cebd9525b19dde0ad51c4790feeafb69f",
    "after": "9b6a3c9e982f4b66adccbc188c7e07fab4eaaad9ba6f732455d1712e72f55242",
    "replacements": [
      [
        "matgo-access.js?v=20261003-adult1",
        "matgo-access.js?v=20261013-resume1"
      ]
    ]
  },
  {
    "path": "games/matgo-online.html",
    "before": "5d5b04222395e83d38df19fdcb4e19e769da81956fdfd64b5d47361d0db760d1",
    "after": "723025eb93cdfc364a1c093104b823d624b0a864ba7a4a309725a4d7139bfe47",
    "replacements": [
      [
        "matgo-access.js?v=20261005-member-refresh1",
        "matgo-access.js?v=20261013-resume1"
      ]
    ]
  },
  {
    "path": "tests/package.json",
    "before": "1e91cb61c81e87334145020e153c4c2d59c5b522253cda566e77d8dea0a1d9af",
    "after": "f087607c5b789198dc9c5ffd401b7ea301010148cb62b37c69946ba3fd1fcbed",
    "replacements": [
      [
        "node adult-menu-visibility.test.cjs",
        "node adult-menu-visibility.test.cjs && node world-adult-resume.test.cjs"
      ]
    ]
  },
  {
    "path": "version.json",
    "before": "ba2d7ec74e86f577990363195310ef7e24e71de5f7b3681d48f1c75ebdcd1f66",
    "after": "420ba00fd25043ed3dea5600b443adbbc705ce82e22292dd01abfd59f0d7563c",
    "replacements": [
      [
        "0.45.113-beta",
        "0.45.114-beta"
      ]
    ]
  }
];
const verify = {
  "matgo-access.js": "0bb0ed9786ca83c69d4295897f9eee02b19eeaf8dbf899ac00c6af8d4537968c",
  "tests/matgo-access.test.cjs": "23cde38da972c27b9e8035340642ccb7d0b2c3d81c0cd89030ac824b52bc9023",
  "tests/world-adult-resume.test.cjs": "c6e61406963a4d1d9dd5960be27e6581e2b691a6b4701933dda236ef85d3d9d5"
};
const outputs = [];
for (const file of changes) {
  let source = readFileSync(file.path, 'utf8');
  if (sha(source) !== file.before) throw new Error('Base changed: ' + file.path);
  for (const [before, after] of file.replacements) {
    if (source.split(before).length !== 2) throw new Error('Unexpected match: ' + file.path);
    source = source.replace(before, after);
  }
  if (sha(source) !== file.after) throw new Error('Output mismatch: ' + file.path);
  outputs.push([file.path, source]);
}
for (const [path, hash] of Object.entries(verify)) {
  if (sha(readFileSync(path)) !== hash) throw new Error('Verification mismatch: ' + path);
}
for (const [path, source] of outputs) { writeFileSync(path, source); console.log('Verified', path, Buffer.byteLength(source), sha(source)); }
