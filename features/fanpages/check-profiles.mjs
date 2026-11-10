/* Run after updating profile data: node features/fanpages/check-profiles.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(read('artists.js'), context);
vm.runInNewContext(read('artists-extra.js'), context);
vm.runInNewContext(read('profiles.js'), context);
vm.runInNewContext(read('profiles-extra.js'), context);
const artists = context.window.OJJUDA_FAN_ARTISTS;
const profiles = context.window.OJJUDA_FAN_PROFILES;
const dateRegex = /^\d{4}\.\d{2}\.\d{2}$/;
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const bloodTypes = new Set(['A', 'B', 'AB', 'O']);

function validDate(value, regex, label) {
  assert.match(value, regex, `${label}: invalid date format`);
  const normalized = value.replaceAll('.', '-');
  const [year, month, day] = normalized.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  assert.equal(utc.toISOString().slice(0, 10), normalized, `${label}: impossible date`);
}

assert.equal(Object.keys(profiles).length, artists.length, 'Every artist needs a profile');
assert.equal(artists.length, 30, 'Expected 9 existing and 21 additional artists');
assert.equal(new Set(artists.map((artist) => artist.id)).size, artists.length, 'Duplicate artist id');
for (const artist of artists) {
  const profile = profiles[artist.id];
  assert.ok(profile, `${artist.id}: missing profile`);
  validDate(profile.debut, dateRegex, `${artist.id}: debut`);
  validDate(profile.checkedAt, dateRegex, `${artist.id}: last checked`);
  assert.ok(profile.agency && profile.debutWork, `${artist.id}: incomplete core facts`);
  if (profile.members.some((member) => member.height !== null)) {
    assert.ok(profile.heightSource?.startsWith('https://'), `${artist.id}: missing height reference`);
  }
  assert.ok(Array.isArray(profile.awards) && Array.isArray(profile.records), `${artist.id}: invalid awards/records`);
  if (!profile.basic) assert.ok(profile.records.length, `${artist.id}: missing activity record`);
  assert.equal(profile.members.length, artist.members.length, `${artist.id}: member count mismatch`);
  assert.deepEqual(
    [...profile.members.map((member) => member.name)].sort(),
    [...artist.members].sort(),
    `${artist.id}: member names differ`
  );
  for (const member of profile.members) {
    if (member.birthday !== null) validDate(member.birthday, dateRegex, `${artist.id}/${member.name}: birthday`);
    else assert.ok(artist.id.startsWith('a2o') || profile.basic, `${artist.id}/${member.name}: missing public birthday`);
    assert.ok(Object.hasOwn(member, 'height'), `${artist.id}/${member.name}: missing height field`);
    if (member.height !== null) {
      assert.match(member.height, /^(?:1[2-9]\d|20\d)(?:\.\d)?(?:~(?:1[2-9]\d|20\d)(?:\.\d)?)?$/, `${member.name}: invalid height`);
      const heights = member.height.split('~').map(Number);
      assert.ok(heights.length === 1 || heights[0] <= heights[1], `${member.name}: reversed height range`);
    }
    if (member.heightSource) assert.ok(member.heightSource.startsWith('https://'), `${member.name}: insecure height reference`);
    if (member.bloodType !== undefined) assert.ok(bloodTypes.has(member.bloodType), `${member.name}: invalid blood type`);
    if (member.mbti !== undefined) assert.match(member.mbti, /^[EI][SN][TF][JP](?:-[AT])?$/, `${member.name}: invalid MBTI`);
    if (!artist.id.startsWith('a2o') && !profile.basic) assert.ok(member.hometown, `${artist.id}/${member.name}: missing publicly grounded hometown or broad origin`);
    if (member.source) assert.ok(member.source.startsWith('https://'), `${member.name}: insecure source`);
  }
  for (const entry of [...profile.awards, ...profile.records, ...profile.sources]) {
    assert.ok(entry.href.startsWith('https://'), `${artist.id}: missing HTTPS attribution`);
  }
  assert.ok(Array.isArray(artist.music) && artist.music.length, `${artist.id}: missing music catalog`);
  for (const album of artist.music) {
    validDate(album.date, dateRegex, `${artist.id}/${album.title}`);
    assert.ok(album.title && album.type && Array.isArray(album.songs) && album.songs.length, `${artist.id}: missing track names`);
    assert.ok(album.href.startsWith('https://'), `${artist.id}: missing album source`);
  }
  assert.ok(Array.isArray(artist.appearances), `${artist.id}: missing upcoming-event list`);
  for (const event of artist.appearances) {
    validDate(event.date, isoDateRegex, `${artist.id}: event`);
    if (event.endDate) validDate(event.endDate, isoDateRegex, `${artist.id}: event end`);
    assert.ok(event.title && event.sub && event.href.startsWith('https://'), `${artist.id}: incomplete event`);
  }
  for (const campaign of artist.campaigns || []) {
    assert.ok(['콜라보', '광고', '홍보대사'].includes(campaign.kind), `${artist.id}: unknown campaign category`);
    assert.ok(campaign.title && campaign.href.startsWith('https://'), `${artist.id}: incomplete campaign`);
  }
  assert.ok(artist.photos?.length >= (profile.basic ? 1 : 3), `${artist.id}: insufficient real photos`);
  if (profile.basic) {
    assert.ok(['girl', 'boy'].includes(artist.category), `${artist.id}: category missing`);
    assert.ok(artist.theme?.bg && artist.accent && artist.light && artist.dark, `${artist.id}: theme missing`);
    assert.ok(artist.links.some((link) => link.label === 'YouTube'), `${artist.id}: official video link missing`);
  }
  for (const photo of artist.photos) {
    assert.ok(photo.image.startsWith('https://') && photo.href.startsWith('https://') && photo.credit, `${artist.id}: missing photo credit or link`);
  }
}

const members = artists.flatMap((artist) => profiles[artist.id].members);
const girls = artists.filter((item) => item.category === 'girl' || (!item.category && item.id !== 'a2osoul')).length;
const boys = artists.length - girls;
assert.equal(girls, 16, 'Expected 16 girl groups');
assert.equal(boys, 14, 'Expected 14 boy groups');
console.log(`PASS: ${artists.length} fan spaces (${girls} girl, ${boys} boy), ${members.length} members, ${artists.reduce((sum, artist) => sum + artist.music.length, 0)} releases, ${artists.reduce((sum, artist) => sum + artist.appearances.length, 0)} events`);
