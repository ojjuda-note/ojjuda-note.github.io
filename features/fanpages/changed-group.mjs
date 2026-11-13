/* Identify the one artist changed by the latest published commit.
   Used only for read-only post-deployment fanpage verification. */
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const names = ['artists.js', 'artists-extra.js', 'profiles.js', 'profiles-extra.js', 'videos.js'];
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
try {
  const previous = snapshot('HEAD^');
  const current = snapshot('HEAD');
  const changed = [...current].filter(([key, value]) => previous.get(key) !== value).map(([key]) => key);
  // More than one changed group: do not assume which group should be tested.
  if (changed.length === 1) process.stdout.write(changed[0]);
} catch (error) {
  process.stderr.write(`Could not infer changed fanpage artist: ${error.message}\n`);
  process.exitCode = 1;
}
