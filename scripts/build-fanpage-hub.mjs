// Generate the public hub from the same packaged data used by artist pages.
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createContext, runInContext} from 'node:vm';

const dir = process.argv[2];
if (!dir) throw Error('Expected the staged fanpages directory');
const context = createContext({window:{}, URL});
for (const file of ['photo-manifest.js', 'artists.js', 'artists-extra.js']) {
  runInContext(readFileSync(join(dir,file),'utf8'), context, {filename:file});
}
const fields = ['id','name','korean','fan','agency','status','shape','category','accent','light','dark','bg','night','theme','image','imageCredit','imageLink','official'];
const artists = context.window.OJJUDA_FAN_ARTISTS;
if (!artists.length || new Set(artists.map(a => a.id)).size !== artists.length) throw Error('Invalid artist identities');
const summaries = artists.map(a => Object.fromEntries(fields.filter(key => Object.hasOwn(a,key)).map(key => [key,a[key]])));
const script = 'window.OJJUDA_FAN_ARTISTS = ' + JSON.stringify(summaries) + ';\n';
const hash = createHash('sha256').update(script).digest('hex').slice(0,16);
const hubPath = join(dir,'index.html');
const html = readFileSync(hubPath,'utf8');
const tags = /<script src="\.\/(?:photo-manifest|artists|artists-extra)\.js\?v=[^"]+" defer><\/script>/g;
if (html.match(tags)?.length !== 3) throw Error('Expected the three hub data scripts');
writeFileSync(join(dir,'hub-artists.js'), script);
writeFileSync(hubPath, html.replace(tags, tag => tag.includes('photo-manifest.js') ? '<script src="./hub-artists.js?v='+hash+'" defer></script>' : ''));
