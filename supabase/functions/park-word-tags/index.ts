// Only model files go to the package CDN. The card text is analyzed inside this function.
import init, { GaruWasm } from 'https://cdn.jsdelivr.net/npm/garu-ko@0.14.0/pkg/garu_wasm.js';
import { parkWordTags } from '../../../note/park-word-tags.mjs';

const cdn = 'https://cdn.jsdelivr.net/npm/garu-ko@0.14.0/';
async function asset(path: string, expected: string) {
  const response = await fetch(cdn + path);
  if (!response.ok) throw Error('Model asset unavailable');
  const bytes = await response.arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  if (Array.from(hash, b => b.toString(16).padStart(2, '0')).join('') !== expected) throw Error('Model asset mismatch');
  return new Uint8Array(bytes);
}
async function load() {
  const [wasm, model] = await Promise.all([
    asset('pkg/garu_wasm_bg.wasm', 'e5e674b4e744087b931c843b91e594d0e4beadf1f8c7239b599642091a644993'),
    asset('models/base.gmdl', 'f9fbfa457ac0e7dca68fca4ea8813ddcffebb4b3a461e0f8ffd363b115a7361a'),
  ]);
  await init({ module_or_path: wasm });
  return new GaruWasm(model, false);
}
let loading: ReturnType<typeof load> | undefined;
Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(null, {status: 405});
  const input = await request.json().catch(() => null);
  if (typeof input?.body !== 'string' || [...input.body.replaceAll('❤️❤️','♥')].length > 200)
    return new Response(null, {status: 400});
  try {
    loading ??= load().catch(error => { loading = undefined; throw error; });
    return Response.json({tags: parkWordTags(input.body, await loading)});
  } catch {
    return new Response(null, {status: 503});
  }
});
