/* Device-local controls; multiplayer simulation speed is never changed here. */
(() => {
  'use strict';
  const definitions = {
    breakout: { speed: ['공 속도', [['slow','느림'],['normal','보통'],['fast','빠름']]] },
    photo_ttang: {
      size: ['조이스틱 크기', [['small','작게'],['normal','기본'],['large','크게']]],
      sensitivity: ['입력 감도', [['low','둔하게'],['normal','기본'],['high','민감하게']]],
      turn: ['방향 전환', [['slow','천천히'],['normal','기본'],['fast','빠르게']]]
    },
    ttang: {
      size: ['조이스틱 크기', [['small','작게'],['normal','기본'],['large','크게']]],
      sensitivity: ['입력 감도', [['low','둔하게'],['normal','기본'],['high','민감하게']]]
    }
  };
  const memory = new Map(), key = game => 'ojjuda.controls.v1.' + game;
  function get(game) {
    let saved = memory.get(game) || {};
    if (!memory.has(game)) try { saved = JSON.parse(localStorage.getItem(key(game)) || 'null') || saved; } catch {}
    return Object.fromEntries(Object.entries(definitions[game] || {}).map(([name, [, choices]]) =>
      [name, choices.some(([value]) => value === saved[name]) ? saved[name] : 'normal']));
  }
  function save(game, value) {
    memory.set(game, value);
    try { localStorage.setItem(key(game), JSON.stringify(value)); return true; } catch { return false; }
  }
  function markup(game) {
    if (!definitions[game]) return '';
    const value = get(game);
    return `<details class="game-controls" data-controls-game="${game}"><summary>조작 설정</summary>
      ${Object.entries(definitions[game]).map(([name, [label, choices]]) => `<label>${label}<select data-game-setting="${name}">${choices.map(([id, text]) => `<option value="${id}"${id === value[name] ? ' selected' : ''}>${text}</option>`).join('')}</select></label>`).join('')}
      <p>${game === 'breakout' ? '원하는 속도를 고르세요. 점수는 그대로 기록돼요.' : '설정은 이 기기에 저장돼요.'}</p>
      <button type="button" data-controls-reset>기본값으로 복구</button><span data-controls-status role="status"></span></details>`;
  }
  function joystick(game) {
    const value = get(game), photo = game === 'photo_ttang';
    const size = (photo ? {small:72,normal:88,large:112} : {small:88,normal:124,large:148})[value.size] || (photo ? 88 : 124);
    return {size, range:(photo ? 28 : 56)*size/(photo ? 88 : 124),
      dead:(photo ? {low:5,normal:2,high:1} : {low:7,normal:4,high:2})[value.sensitivity] || (photo ? 2 : 4)};
  }
  function styleJoystick(element, game) {
    const settings = joystick(game), knob = Math.round(settings.size * .41);
    Object.assign(element.style, {width:settings.size+'px',height:settings.size+'px',margin:`-${settings.size/2}px 0 0 -${settings.size/2}px`});
    if (element.firstElementChild) Object.assign(element.firstElementChild.style, {width:knob+'px',height:knob+'px',margin:`-${knob/2}px 0 0 -${knob/2}px`});
    return settings;
  }
  document.addEventListener('change', event => {
    const input = event.target.closest?.('[data-game-setting]'), panel = input?.closest('[data-controls-game]');
    if (!panel) return;
    const game = panel.dataset.controlsGame, field = input.dataset.gameSetting;
    if (!definitions[game]?.[field]?.[1].some(([value]) => value === input.value)) return;
    const stored = save(game, {...get(game), [field]:input.value});
    panel.querySelector('[data-controls-status]').textContent = stored ? '저장했어요.' : '이번 창에 적용했어요. 기기에는 저장하지 못했어요.';
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-controls-reset]'), panel = button?.closest('[data-controls-game]');
    if (!panel) return;
    const game = panel.dataset.controlsGame, defaults = Object.fromEntries(Object.keys(definitions[game]).map(name=>[name,'normal']));
    const stored = save(game, defaults);
    panel.querySelectorAll('[data-game-setting]').forEach(input => input.value = 'normal');
    panel.querySelector('[data-controls-status]').textContent = stored ? '기본값으로 돌렸어요.' : '이번 창에서 기본값으로 돌렸어요.';
  });
  function mount() { document.querySelectorAll('[data-game-settings]').forEach(host => host.innerHTML = markup(host.dataset.gameSettings)); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true}); else mount();
  window.OjjudaGameControls = {get, markup, joystick, styleJoystick};
})();
