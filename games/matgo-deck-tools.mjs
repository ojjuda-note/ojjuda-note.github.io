const svg = body => `<svg viewBox="0 0 100 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#30243e" stroke-width="4" stroke-linejoin="round">${body}</g></svg>`;
const art = {
  gun: svg('<path fill="#eb7963" d="M31 44h26l-9 44H25z"/><path fill="#78cfe0" d="M19 27h67v29H30V44H19z"/><path fill="#fff0ac" d="M26 21h24v13H26z"/><path fill="#ed775d" d="M84 29h10v25H84z"/><path fill="none" d="M56 57h11v12H52"/><path stroke="#fff" d="M37 38h35"/>'),
  hammer: svg('<path fill="#c69257" d="M43 38h14v56H43z"/><rect x="12" y="16" width="76" height="34" rx="9" fill="#bfc7e0"/><path stroke="#fff" d="M25 24h47"/><path stroke="#805b37" d="M47 61h6m-6 11h6m-6 11h6"/>'),
  glove: svg('<path fill="#e95e77" d="M23 65C7 59 7 43 13 30s17-17 30-14c29-8 46 9 44 29-1 13-12 25-26 26l-3 19H25z"/><path fill="#fff0cc" d="M24 70h39v20H24z"/><path fill="none" d="M20 47c12-8 23-2 23 14"/><path stroke="#ffb7c5" d="M33 27c10-6 26-5 34 2"/>'),
  bomb: svg('<path fill="none" stroke="#d5a269" d="M58 21c-1-19 25-17 22-3"/><path fill="#ece49a" d="M77 9l4-8 4 9 10 1-8 6 2 10-9-6-9 5 3-10-8-6z"/><path fill="#a1a8bf" d="M48 20h20v18H48z"/><circle cx="47" cy="62" r="31" fill="#3d3a54"/><path fill="none" stroke="#aaa7c5" d="M27 47c5-8 11-11 19-12"/>'),
  lightning: svg('<path fill="#ffe16b" d="M50 4L18 56h28L33 97l50-58H56L75 4z"/><path fill="none" stroke="#fff4ba" d="M48 21L33 46h25"/>')
};
export const VENT_EFFECTS = [
  { id: 'gun', name: '총 쏘기', word: '탕! 탕!' },
  { id: 'hammer', name: '망치', word: '꽝!' },
  { id: 'glove', name: '권투장갑', word: '퍽!' },
  { id: 'bomb', name: '폭탄', word: '펑!' },
  { id: 'lightning', name: '번개', word: '찌릿!' }
];
const face = svg('<circle cx="50" cy="50" r="36" fill="#ffe297"/><path fill="none" d="M28 34l15 15m0-15L28 49m29-15l15 15m0-15L57 49M36 66q14-11 28 0"/>');

export function createVentControls({ canPlay = () => true, purchase, onError = () => {}, onHit = () => {} } = {}) {
  let index = 0, active = null, cooldown = 0, resetTimer = null, hitTimer = null, cleanupTimer = null;
  let observed = null, observer = null, destroyed = false, purchasing = false;
  const button = () => document.getElementById('matgo-vent');
  function sync() {
    const b = button();
    if (b) { b.disabled = purchasing || Date.now() < cooldown || !canPlay(); b.classList.toggle('cooldown', Date.now() < cooldown); b.setAttribute('aria-busy',String(purchasing)); }
  }
  function resize() {
    const deck = document.querySelector('.deck.deck-tools');
    if (!deck) return;
    const h = deck.parentElement.getBoundingClientRect().height;
    const cardHeight = Math.max(27, Math.min(69, h - (deck.querySelector('.tazza-button') ? 116 : 76)));
    deck.style.setProperty('--deck-card-height', cardHeight + 'px');
    deck.style.setProperty('--deck-card-width', (cardHeight / 1.5) + 'px');
  }
  function mount() {
    if (destroyed) return;
    const deck = document.querySelector('.deck');
    if (!deck) return;
    deck.classList.add('deck-tools');
    deck.parentElement.classList.add('matgo-tools-floor');
    if (!deck.querySelector('#matgo-vent')) {
      const b = document.createElement('button');
      b.id = 'matgo-vent'; b.type = 'button'; b.className = 'vent-button';
      b.innerHTML = `<span class="vent-icon" aria-hidden="true">${art.gun}</span><span>화풀이<small>1쭈</small></span>`;
      b.setAttribute('aria-label', '화풀이 1쭈: 총, 망치, 권투장갑, 폭탄, 번개 모션을 차례로 재생');
      b.title = '1회 1쭈 · 내 화면의 연출이에요. 패와 점수는 그대로예요.';
      deck.appendChild(b);
    }
    if (observed !== deck.parentElement) {
      observer?.disconnect(); observed = deck.parentElement;
      if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(resize); observer.observe(observed); }
    }
    resize(); sync();
  }
  function clear() {
    clearTimeout(hitTimer); clearTimeout(cleanupTimer);
    active?.remove(); active = null;
    document.querySelectorAll('.vent-hit').forEach(el => el.classList.remove('vent-hit'));
  }
  async function fire() {
    const b = button(), target = document.querySelector('.zone.op .who b');
    if (destroyed || purchasing || !b || !target || Date.now() < cooldown || !canPlay() || !purchase) return false;
    purchasing=true;sync();
    let effect=VENT_EFFECTS[index % VENT_EFFECTS.length];
    try{
      const receipt=await purchase(effect.id);
      effect=VENT_EFFECTS.find(item=>item.id===receipt?.purchase?.effect);
      if(!effect)throw Error('결제 정보를 확인하지 못했어요. 다시 눌러 주세요.');
    }catch(error){onError(error);return false;}
    finally{purchasing=false;sync();}
    if(destroyed)return false;
    clear();
    index=(VENT_EFFECTS.indexOf(effect)+1)%VENT_EFFECTS.length;
    const start = b.getBoundingClientRect(), end = target.getBoundingClientRect();
    const sx = start.left + start.width / 2, sy = start.top + start.height / 2;
    const tx = Math.min(innerWidth - 58, Math.max(58, end.left + 16));
    const ty = Math.max(55, end.top + end.height / 2);
    const angle = Math.atan2(ty - sy, tx - sx) * 180 / Math.PI;
    const layer = document.createElement('div');
    layer.className = 'vent-layer vent-' + effect.id; layer.dataset.effect = effect.id;
    layer.setAttribute('aria-hidden', 'true');
    for (const [key, value] of Object.entries({ sx: sx + 'px', sy: sy + 'px', tx: tx + 'px', ty: ty + 'px', dx: (tx - sx) + 'px', dy: (ty - sy) + 'px', aim: angle + 'deg' })) layer.style.setProperty('--' + key, value);
    layer.innerHTML = `<div class="vent-weapon">${art[effect.id]}</div><div class="vent-projectile"></div><div class="vent-impact"><div class="vent-burst"></div><div class="vent-face">${face}</div><strong class="vent-word">${effect.word}</strong><span class="vent-stars">✦ ★ ✦</span></div>`;
    document.body.appendChild(layer); active = layer;
    cooldown = Date.now() + 1800; sync();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    hitTimer = setTimeout(() => { if (!layer.isConnected) return; target.classList.add('vent-hit'); onHit(effect.id); }, reduced ? 0 : 360);
    cleanupTimer = setTimeout(clear, reduced ? 700 : 1350);
    clearTimeout(resetTimer); resetTimer = setTimeout(sync, 1820);
    return effect.id;
  }
  function click(event) {
    if (!event.target.closest?.('#matgo-vent')) return;
    event.preventDefault(); event.stopPropagation(); fire();
  }
  function hide() { if (document.hidden) clear(); }
  function destroy() {
    destroyed = true; clear(); clearTimeout(resetTimer); observer?.disconnect();
    document.removeEventListener('click', click); document.removeEventListener('visibilitychange', hide);
    window.removeEventListener('resize', resize); window.removeEventListener('pagehide', destroy);
  }
  document.addEventListener('click', click);
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('resize', resize);
  window.addEventListener('pagehide', destroy, { once: true });
  return { mount, sync, clear, destroy };
}
