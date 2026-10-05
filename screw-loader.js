/* Load only the selected screw game. Progress remains owned by each engine. */
(function () {
  'use strict';
  function menuHTML() {
    const screw=(x,y,color)=>`<circle cx="${x}" cy="${y}" r="6" fill="${color}" stroke="#647386" stroke-width="1.2"/><path d="M${x-2.5} ${y}h5M${x} ${y-2.5}v5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>`;
    const box=`<svg viewBox="0 0 110 110" aria-hidden="true"><ellipse cx="57" cy="91" rx="39" ry="8" fill="#83634719"/><path d="M18 41L56 20L94 40L55 62Z" fill="#EDC29B"/><path d="M18 41V78L55 100V62Z" fill="#D7A781"/><path d="M55 62L94 40V79L55 100Z" fill="#BA8E78"/><path d="M29 42L58 26L68 32L39 49Z" fill="#CCD7DE"/><path d="M65 61L85 50V64L65 76Z" fill="#C1CDD8"/>${screw(42,37,'#ED7198')}${screw(58,32,'#38AF99')}${screw(72,64,'#668DE1')}${screw(83,58,'#E8AD43')}</svg>`;
    const picture=`<svg viewBox="0 0 110 110" aria-hidden="true"><rect x="6" y="7" width="98" height="96" rx="15" fill="#F4E7D6"/><path d="M47 15L62 15L73 28L75 47H35L37 28Z" fill="#CFDAE4" stroke="#8A9EAF"/><path d="M35 49H75L87 72H24Z" fill="#BABFD4" stroke="#8A9EAF"/><path d="M24 74H87L91 97H20Z" fill="#B6CABF" stroke="#8A9EAF"/>${screw(46,31,'#A3B6C7')}${screw(64,40,'#A3B6C7')}${screw(42,60,'#A3B6C7')}${screw(70,64,'#A3B6C7')}${screw(33,85,'#A3B6C7')}${screw(79,85,'#A3B6C7')}</svg>`;
    return `<div class="gcard screw-choice-card"><span class="screw-choice-kicker">작은 나사, 두 가지 재미</span><h3>어떤 나사를 풀까요?</h3><p class="screw-choice-intro">마음에 드는 게임을 눌러 시작해요.</p><div class="screw-choices"><button type="button" class="screw-choice" data-g="screw-start" data-mode="box"><span class="screw-choice-art">${box}</span><span class="screw-choice-copy"><strong>박스형 나사게임</strong><span>물건을 돌려 보며<br>나사를 풀고 분해해요.</span><b>박스형 시작 →</b></span></button><button type="button" class="screw-choice screw-choice-flat" data-g="screw-start" data-mode="flat"><span class="screw-choice-art">${picture}</span><span class="screw-choice-copy"><strong>평면형 나사게임</strong><span>빈 구멍에 나사를 옮겨<br>철판 아래 그림을 찾아요.</span><b>평면형 시작 →</b></span></button></div><p class="screw-choice-foot">진행 단계는 각각 따로 이어져요.</p></div>`;
  }
  const scripts = new Map(), modes = new Map();
  function script(src, ready) {
    if (ready()) return Promise.resolve();
    if (scripts.has(src)) return scripts.get(src);
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement('script');
      node.src = src;
      node.onload = () => ready() ? resolve() : fail();
      const fail = () => { node.remove(); scripts.delete(src); reject(new Error('Game script unavailable')); };
      node.onerror = fail;
      document.head.appendChild(node);
    });
    scripts.set(src, promise);
    return promise;
  }
  let boxAttempts = 0;
  function load(mode) {
    if (!['box', 'flat'].includes(mode)) return Promise.reject(new Error('Unknown game mode'));
    if (modes.has(mode)) return modes.get(mode);
    const promise = (async () => {
      if (mode === 'box') {
        const retry = boxAttempts++;
        return (await import('./screw3d.js?v=20261004-cleanup1' + (retry ? '&retry=' + retry : ''))).screw3d;
      }
      await script('/vendor/matter-0.20.0.min.js', () => !!window.Matter);
      await script('/screw-flat-physics.js?v=20261004-shapes13', () => !!window.OjjudaFlatPhysics);
      await script('/screw-flat-pictures.js?v=20261004-surprise1', () => !!window.OjjudaFlatPictures);
      await script('/screw-flat.js?v=20261004-cleanup1', () => !!window.OjjudaScrewGames?.flat);
      return window.OjjudaScrewGames.flat;
    })().catch(error => { modes.delete(mode); throw error; });
    modes.set(mode, promise);
    return promise;
  }
  const api = {menuHTML, load};
  if (typeof window !== 'undefined') window.OjjudaScrewLoader = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
