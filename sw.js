'use strict';

// Only the public, self-contained connection notice is stored offline.
// Bump this version whenever offline.html changes.
const CACHE_PREFIX = 'ojjuda-pwa-offline-';
const CACHE_NAME = CACHE_PREFIX + '20261104-1';
const OFFLINE_URL = new URL('/offline.html', self.location.origin).href;
const ENTRY_PATHS = new Set(['/', '/index.html', '/world.html']);
const AUTH_QUERY_KEYS = new Set([
  'code', 'token', 'token_hash', 'access_token', 'refresh_token',
  'error', 'error_code', 'error_description', 'type', 'state', 'auth', 'reset'
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(new Request(OFFLINE_URL, {
      cache: 'reload',
      credentials: 'omit'
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    // No page refresh: existing games and the /star/ worker keep their state.
    await self.clients.claim();
  })());
});

async function connectionNotice() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(OFFLINE_URL);
    if (response) return response;
  } catch (_) {
    // Storage may have been cleared or become unavailable after installation.
  }
  return new Response(
    '<!doctype html><html lang="ko"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>연결 확인 | 오쭈다 아지트</title>' +
    '<body><main><h1>인터넷 연결을 확인해 주세요</h1>' +
    '<p>게임과 공원을 이용하려면 인터넷 연결이 필요해요.</p>' +
    '<button type="button" onclick="location.reload()">다시 시도</button>' +
    '</main></body></html>',
    { headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    } }
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !ENTRY_PATHS.has(url.pathname)) return;
  for (const key of url.searchParams.keys()) {
    if (AUTH_QUERY_KEYS.has(key.toLowerCase())) return;
  }

  // Always use the ordinary network response. Never store HTML, account data,
  // API replies, game assets, or results. Auth callbacks remain browser-owned.
  event.respondWith(fetch(request).catch(connectionNotice));
});
