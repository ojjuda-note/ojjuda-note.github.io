/* Infer release-screen targets from the checked-out commit's actual data.
   Default output keeps the legacy one-artist contract. --all verifies every
   changed artist, or all artists when a shared verifier/UI changed alone. */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const names = ['artists.js', 'artists-extra.js', 'profiles.js', 'profiles-extra.js', 'videos.js'];
export function selectChangedGroups(previous, current, all = false) {
  const changed = [...current].filter(([key, value]) => previous.get(key) !== value).map(([key]) => key);
  if (all) return changed.length ? changed : [...current.keys()];
  return changed.length === 1 ? changed : [];
}
function snapshot(ref) {
  const scripts = names.map(file => execFileSync('git', ['show', `${ref}:features/fanpages/${file}`], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  })).join('\n\n');
  const context = { window: {} };
  vm.runInNewContext(scripts, context);
  const w = context.window;
  return new Map(w.OJJUDA_FAN_ARTISTS.map(artist => [artist.id, JSON.stringify({
    artist,
    profile: w.OJJUDA_FAN_PROFILES[artist.id],
    videos: w.OJJUDA_FAN_VIDEOS[artist.id] || []
  })]));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const unknown = process.argv.slice(2).filter(arg => arg !== '--all');
    if (unknown.length) throw new Error(`Unknown argument: ${unknown.join(', ')}`);
    const selected = selectChangedGroups(snapshot('HEAD^'), snapshot('HEAD'), process.argv.includes('--all'));
    process.stdout.write(selected.join('\n'));
  } catch (error) {
    process.stderr.write(`Could not infer changed fanpage artists: ${error.message}\n`);
    process.exitCode = 1;
  }
}
