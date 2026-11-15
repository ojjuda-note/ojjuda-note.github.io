// Generate the public hub from the same packaged data used by artist pages.
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createContext, runInContext} from 'node:vm';

export function buildHub(dir, photos) {
  const context = createContext({window:{OJJUDA_FAN_LOCAL_PHOTOS:photos}, URL});
  for (const file of ['artists.js','artists-extra.js']) {
    runInContext(readFileSync(join(dir,file),'utf8'),context,{filename:file});
  }
  const html = readFileSync(join(dir,'index.html'),'utf8');
  const fields = ['id','name','korean','fan','agency','status','shape','category','accent','light','dark','bg','night','theme','image','imageCredit','imageLink','official'];
  const artists = context.window.OJJUDA_FAN_ARTISTS;
  if (!artists.length || new Set(artists.map(a => a.id)).size !== artists.length) throw Error('Invalid artist identities');
  const summaries = artists.map(a => Object.fromEntries(fields.filter(key => Object.hasOwn(a,key)).map(key => [key,a[key]])));
  const script = 'window.OJJUDA_FAN_ARTISTS = ' + JSON.stringify(summaries) + ';\n';
  const hash = createHash('sha256').update(script).digest('hex').slice(0,16);
  const tags = /<script src="\.\/(?:photo-manifest|artists|artists-extra)\.js\?v=[^"]+" defer><\/script>/g;
  if (html.match(tags)?.length !== 3) throw Error('Expected the three hub data scripts');
  const markup = html.replace(tags, tag => tag.includes('photo-manifest.js') ? '<script src="./hub-artists.js?v='+hash+'" defer></script>' : '');
  return {script, markup, hash};
}

export function readPhotoManifest(text) {
  const assignment = text.match(/window\.OJJUDA_FAN_LOCAL_PHOTOS\s*=\s*(\{[\s\S]*\});\s*$/);
  if (!assignment) throw Error('Invalid photo manifest');
  return JSON.parse(assignment[1]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) throw Error('Expected the staged fanpages directory');
  const photos = readPhotoManifest(readFileSync(join(dir,'photo-manifest.js'),'utf8'));
  const {script,markup} = buildHub(dir,photos);
  writeFileSync(join(dir,'hub-artists.js'),script);
  writeFileSync(join(dir,'index.html'),markup);
}
