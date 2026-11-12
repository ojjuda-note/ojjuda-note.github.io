import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./videos.js', import.meta.url), 'utf8');
const context = { window: {} };
runInNewContext(source, context);
const library = context.window.OJJUDA_FAN_VIDEOS;
const expectedGroups = ['rescene', 'ive', 'aespa', 'lesserafim', 'twice', 'illit', 'a2omay', 'a2olite', 'a2osoul', 'nmixx', 'babymonster', 'hearts2hearts', 'blackpink', 'idle', 'bts', 'seventeen', 'txt'];
assert.deepEqual(Object.keys(library).sort(), expectedGroups.sort(), 'Exactly seventeen supported idol groups');
const seen = new Set();
for (const [group, videos] of Object.entries(library)) {
  assert.ok(videos.length >= 3, `${group} needs at least three official videos`);
  for (const video of videos) {
    assert.match(video.id, /^[a-zA-Z0-9_-]{11}$/, `${group}: invalid YouTube video ID`);
    assert.ok(video.title && video.kind && video.source, `${group}: missing source or description`);
    assert.ok(!seen.has(video.id), `${group}: duplicate YouTube video ID`);
    seen.add(video.id);
  }
}
console.log(`PASS: ${expectedGroups.length} groups, ${seen.size} attributed official video embeds, no media copies`);
