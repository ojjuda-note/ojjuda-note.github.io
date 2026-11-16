// Generate the public hub from the same packaged data used by artist pages.
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createContext, runInContext} from 'node:vm';

export function buildHub(dir, photos) {
  const context = createContext({window:{OJJUDA_FAN_LOCAL_PHOTOS:photos}, URL});
  for (const file of ['artists.js','artists-extra.js','videos.js','profiles.js','profiles-extra.js']) {
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
  const details = new Map();
  const filenames = Object.create(null);
  for (const artist of artists) {
    const id = artist.id;
    if (!/^[a-z0-9-]+$/.test(id)) throw Error('Invalid artist id');
    const json = JSON.stringify({artist, profile:context.window.OJJUDA_FAN_PROFILES[id], videos:context.window.OJJUDA_FAN_VIDEOS[id]});
    const digest = createHash('sha256').update(json).digest('hex').slice(0,16);
    filenames[id] = './artist-data/' + id + '-' + digest + '.json';
    details.set(filenames[id],json);
  }
  const detailMarkup = buildDetailPage(readFileSync(join(dir,'artist.html'),'utf8'), filenames, hash);
  return {script, markup, hash, detailMarkup, details};
}


// Start the selected download while HTML is parsing. Keep the packaged source
// scripts as a fallback when a cached page points at a previous release.
function buildDetailPage(html, filenames, hash) {
  const dataTags = /<script src="(\.\/(?:photo-manifest|artists|artists-extra|videos|profiles|profiles-extra)\.js\?v=[^"]+)" defer><\/script>/g;
  const appTags = /<script src="(\.\/(?:catalog|fan|manager)\.js\?v=[^"]+)" defer><\/script>/g;
  const originals = Array.from(html.matchAll(dataTags), match => match[1]);
  const apps = Array.from(html.matchAll(appTags), match => match[1]);
  if (originals.length !== 6 || apps.length !== 3) throw Error('Unexpected detail scripts');
  const start = `<script>
    {
      const files = ${JSON.stringify(filenames)};
      const group = new URLSearchParams(location.search).get('group');
      window.ojjudaFanDetail = Object.hasOwn(files, group)
        ? fetch(files[group]).then(response => response.ok ? response.json() : false).catch(() => false)
        : Promise.resolve(null);
    }
  </script>`;
  const init = `<script type="module">
    function loadScripts(urls) {
      return Promise.all(urls.map(url => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.async = false;
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      })));
    }
    try {
      const detail = await window.ojjudaFanDetail;
      const artists = window.OJJUDA_FAN_ARTISTS;
      if (!artists || detail === false) {
        await loadScripts(${JSON.stringify(originals)});
      } else if (detail) {
        const id = detail.artist.id;
        const index = artists.findIndex(artist => artist.id === id);
        if (index < 0) throw Error('Artist summary mismatch');
        artists[index] = detail.artist;
        window.OJJUDA_FAN_PROFILES = { [id]: detail.profile };
        window.OJJUDA_FAN_VIDEOS = { [id]: detail.videos };
      }
      await loadScripts(${JSON.stringify(apps)});
    } catch {
      const root = document.getElementById('artist-root');
      root.setAttribute('aria-busy', 'false');
      root.textContent = '팬페이지를 불러오지 못했어요. 새로고침해 주세요.';
    }
  </script>`;
  return html.replace('<head>', '<head>\n  ' + start)
    .replace(dataTags, (tag, src) => src === originals[0] ? '<script src="./hub-artists.js?v='+hash+'" defer></script>' : '')
    .replace(appTags, (tag, src) => '<link rel="preload" as="script" href="' + src + '">' + (src === apps.at(-1) ? '\n  ' + init : ''));
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
  const {script,markup,detailMarkup,details} = buildHub(dir,photos);
  writeFileSync(join(dir,'hub-artists.js'),script);
  writeFileSync(join(dir,'index.html'),markup);
  mkdirSync(join(dir,'artist-data'),{recursive:true});
  for (const [file,json] of details) writeFileSync(join(dir,file),json);
  writeFileSync(join(dir,'artist.html'),detailMarkup);
}
