/* Run after updating profile data: node features/fanpages/check-profiles.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(read('artists.js'), context);
vm.runInNewContext(read('profiles.js'), context);
const artists = context.window.OJJUDA_FAN_ARTISTS;
const profiles = context.window.OJJUDA_FAN_PROFILES;
const dateRegex = /^\d{4}\.\d{2}\.\d{2}$/;

assert.equal(Object.keys(profiles).length, artists.length, 'Every artist needs a profile');
for (const artist of artists) {
  const profile = profiles[artist.id];
  assert.ok(profile, `${artist.id}: missing profile`);
  assert.match(profile.debut, dateRegex, `${artist.id}: invalid debut date`);
  assert.match(profile.checkedAt, dateRegex, `${artist.id}: missing last-checked date`);
  assert.ok(profile.agency && profile.debutWork, `${artist.id}: incomplete core facts`);
  assert.ok(profile.awards.length && profile.records.length, `${artist.id}: award or record missing`);
  assert.equal(profile.members.length, artist.members.length, `${artist.id}: member count mismatch`);
  assert.deepEqual(
    [...profile.members.map((member) => member.name)].sort(),
    [...artist.members].sort(),
    `${artist.id}: member names differ`
  );
  for (const member of profile.members) {
    assert.match(member.birthday, dateRegex, `${artist.id}/${member.name}: invalid birthday`);
    const [year, month, day] = member.birthday.split('.').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    assert.equal(utc.toISOString().slice(0, 10), member.birthday.replaceAll('.', '-'), `${member.name}: impossible birth date`);
    assert.ok(member.hometown, `${artist.id}/${member.name}: missing publicly grounded hometown or broad origin`);
    if (member.source) assert.ok(member.source.startsWith('https://'), `${member.name}: insecure source`);
  }
  for (const entry of [...profile.awards, ...profile.records, ...profile.sources]) {
    assert.ok(entry.href.startsWith('https://'), `${artist.id}: missing HTTPS attribution`);
  }
}

console.log(`PASS: ${artists.length} artist dossiers, ${artists.reduce((sum, artist) => sum + profiles[artist.id].members.length, 0)} member profiles`);
