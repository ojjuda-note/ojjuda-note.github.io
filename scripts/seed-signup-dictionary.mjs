import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const data=readFileSync(new URL('data/signup-nicknames/words.txt',root),'utf8');
const source=JSON.parse(readFileSync(new URL('data/signup-nicknames/source.json',root),'utf8'));
const words=data.trimEnd().split('\n');
if(words.length!==source.word_count||new Set(words).size!==words.length||words.some(w=>!/^[가-힣]{1,5}$/.test(w))
  ||createHash('sha256').update(data).digest('hex')!==source.sha256) throw Error('Dictionary identity check failed');
const query=`insert into ojjuda_account_internal.signup_nickname_words(word,can_finish)\nselect word,true from unnest(string_to_array($dictionary$${data.trimEnd()}$dictionary$,E'\\n')) word\non conflict(word) do update set can_finish=true;\n`;
if(!process.argv[2]) throw Error('Usage: node scripts/seed-signup-dictionary.mjs /absolute/path/to/seed.sql');
writeFileSync(process.argv[2],query);
console.log(JSON.stringify({file:process.argv[2],words:words.length,bytes:Buffer.byteLength(query),source:source.sha256}));
