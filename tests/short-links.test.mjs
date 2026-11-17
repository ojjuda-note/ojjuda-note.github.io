import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {buildShortLinks} from '../scripts/build-short-links.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const catalog = JSON.parse(read('shared/navigation/short-links.json'));
const routes = new Map(catalog.routes.map(route => [route.slug, route]));
const html = read('sitemap.html');
const origin = 'https://ojjuda.kr';
const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(match => match[1]);
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], {cwd:root, encoding:'utf8'}).split('\0'));
const catalogContext = {window:{}};
vm.runInNewContext(read('games/drinking/table-view.js'), catalogContext);
const {games, localGames} = catalogContext.window.DrinkingTableView;

test('every sitemap destination is a one-level address with an existing target', () => {
  assert.equal(routes.size, catalog.routes.length);
  for (const href of hrefs.filter(href => !href.startsWith('#'))) {
    assert.match(href, /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/, href);
    const slug = href.slice(1, -1);
    assert.ok(routes.has(slug) || Object.hasOwn(catalog.existing, slug), href);
  }
  for (const route of catalog.routes) {
    const url = new URL(route.target, origin);
    assert.equal(url.origin, origin);
    const file = url.pathname.slice(1) + (url.pathname.endsWith('/') ? 'index.html' : '');
    assert.ok(tracked.has(file), `${route.slug} points to missing ${file}`);
  }
  assert.equal(routes.get('arcade').target, '/world.html?tab=arcade');
  for (const game of ['matgo', 'poker', 'roulette']) assert.equal(routes.get(game).target, `/world.html?game=${game}`);
  assert.equal(routes.get('photo-territory').target, '/world.html?game=photo_ttang');
  assert.equal(routes.get('beta').target, '/features/guide/creator.html#beta-title');
  assert.equal(routes.get('pajang-story').target, '/features/guide/creator.html#pajang-title');
  assert.equal(routes.get('signup').target, '/?auth=signup&next=world');
  assert.equal(routes.get('login').target, '/?auth=login&next=world');
});

test('the sitemap covers the current local and multiplayer drinking catalogs', () => {
  const section = html.slice(html.indexOf('id="drinking"'), html.indexOf('class="map-section fan-section"'));
  assert.equal((section.match(/class="drink-card"/g) || []).length, localGames.length);
  for (const game of localGames) {
    const route = catalog.routes.find(route => route.target === `/games/drinking/local/#${game.id}`);
    assert.ok(route, game.id);
    assert.ok(section.includes(`href="/${route.slug}/"`), game.title);
    assert.ok(section.includes(`<h3>${game.title}</h3>`), game.title);
    const multi = routes.get(`${route.slug}-multi`);
    if (games.some(item => item.id === game.id)) {
      assert.equal(multi?.target, `/games/drinking/?mode=multi&game=${game.id}`);
      assert.ok(section.includes(`href="/${multi.slug}/"`));
    } else {
      assert.equal(multi, undefined);
    }
  }
  assert.match(section, /모양 맞추기[\s\S]*?drink-warning">주의/);
  assert.match(section, /한 대로 전용/);
  for (const src of [...section.matchAll(/src="([^"]+)"/g)].map(match => match[1])) assert.ok(tracked.has(src.slice(1)), src);
});

test('generated entry pages preserve canonical destinations and work without scripts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ojjuda-short-'));
  try {
    for (const route of catalog.routes) {
      const url = new URL(route.target, origin);
      const file = path.join(directory, url.pathname, url.pathname.endsWith('/') ? 'index.html' : '');
      fs.mkdirSync(path.dirname(file), {recursive:true});
      fs.writeFileSync(file, '<!doctype html><title>Destination fixture</title>');
    }
    assert.equal(buildShortLinks(directory, catalog), routes.size);
    assert.equal(buildShortLinks(directory, catalog), routes.size, 'repeat builds are safe');
    for (const {slug} of catalog.routes) {
      const output = fs.readFileSync(path.join(directory, slug, 'index.html'), 'utf8');
      assert.match(output, /<noscript><meta http-equiv="refresh"/);
      assert.match(output, /<meta name="robots" content="noindex,follow">/);
      assert.match(output, /<link rel="canonical"/);
      assert.match(output, /shared\/navigation\/short-link\.js/);
    }
    const occupied = path.join(directory, 'existing');
    fs.mkdirSync(occupied);
    fs.writeFileSync(path.join(occupied, 'index.html'), 'Existing service');
    assert.throws(() => buildShortLinks(directory, {routes:[{slug:'existing',target:'/sitemap.html',label:'Existing'}]}), /replace an existing page/);
    assert.equal(fs.readFileSync(path.join(occupied, 'index.html'), 'utf8'), 'Existing service');
    for (const slug of ['../escape', 'a/b', 'UPPER']) assert.throws(() => buildShortLinks(directory, {routes:[{slug,target:'/sitemap.html'}]}), /Invalid/);
    assert.throws(() => buildShortLinks(directory, {routes:[{slug:'unsafe',target:'//example.org/'}]}), /Unsafe/);
    assert.throws(() => buildShortLinks(directory, {routes:[{slug:'missing',target:'/not-a-real-page.html'}]}), /Missing/);
  } finally { fs.rmSync(directory, {recursive:true, force:true}); }
});

function resolve(target, search='', hash='') {
  let result;
  vm.runInNewContext(read('shared/navigation/short-link.js'), {
    URL, URLSearchParams,
    document:{querySelector:()=>target == null ? null : {content:target}},
    location:{origin, pathname:'/short/', search, hash, replace:value=>{result=value;}}
  });
  return result;
}

test('short links keep game choices, login actions, invitations and anchor targets', () => {
  for (const route of catalog.routes) assert.equal(resolve(route.target), new URL(route.target, origin).href);
  assert.equal(resolve('/games/drinking/?mode=multi&game=truth', '?game=king&mode=local&room=ABC123'), `${origin}/games/drinking/?mode=multi&game=truth&room=ABC123`);
  assert.equal(resolve('/games/drinking/local/#shapematch', '', '#truth'), `${origin}/games/drinking/local/#shapematch`);
  assert.equal(resolve('/sitemap.html', '', '#drinking'), `${origin}/sitemap.html#drinking`);
  assert.equal(resolve('/?auth=login&next=world', '?auth=signup&next=other'), `${origin}/?auth=login&next=world`);
  for (const target of [null, '//example.org/', 'https://example.org/', '/\\example.org/', '/short/']) assert.equal(resolve(target), undefined);
});
