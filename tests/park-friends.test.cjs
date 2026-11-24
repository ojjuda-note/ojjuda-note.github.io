const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const shared = read('note/preview.js');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const owner = id(1);
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const dom = new JSDOM('<main><h2></h2><div id="body"></div><p id="msg"></p></main>', {
    url: 'https://ojjuda.kr/park/', runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const w = dom.window, doc = w.document;
  w.parkJunior = () => w.session?.user?.role === 'park_junior';
  const body = doc.querySelector('#body');
  const names = ['나', '별 친구', '달 친구', '해 친구', '물 친구', '차단한 친구', '새 친구', '50%_친구', '다른 사람'];
  const profiles = names.map((nickname, index) => ({id: id(index + 1), nickname, bio: '반가워요'}));
  const friendship = (n, from, to, status) => ({id: id(n), requester: id(from), addressee: id(to), status});
  const friendships = [
    friendship(21, 1, 2, 'accepted'), friendship(22, 3, 1, 'pending'), friendship(23, 4, 1, 'pending'),
    friendship(24, 1, 5, 'pending'), friendship(25, 6, 1, 'accepted'), friendship(26, 2, 9, 'pending')
  ];
  const data = {profiles, friendships, blocks: [{blocker: owner, blocked: id(6)}]};
  const calls = [];
  const pending = new Map();
  let failBlocks = false;
  const client = {
    auth: {onAuthStateChange() {}},
    from(table) {
      const where = [], args = {};
      let action = 'select';
      const q = {
        select() { return q; },
        eq(key, value) { where.push(row => row[key] === value); return q; },
        neq(key, value) { where.push(row => row[key] !== value); return q; },
        in(key, values) { where.push(row => values.includes(row[key])); return q; },
        or(filter) { args.or = filter; return q; },
        ilike(_key, pattern) { args.pattern = pattern; return q; },
        limit(value) { args.limit = value; return q; },
        insert(payload) { action = 'insert'; args.payload = payload; return q; },
        delete() { action = 'delete'; return q; },
        async then(resolve, reject) {
          try {
            calls.push({table, action, ...args});
            if (table === 'blocks' && failBlocks) return resolve({error: {code: '42501'}});
            let matches = data[table].filter(row => where.every(f => f(row)));
            if (args.pattern) {
              if (pending.has(args.pattern)) await pending.get(args.pattern);
              const literal = args.pattern.slice(1, -1).replace(/\\([\\%_])/g, '$1');
              matches = matches.filter(profile => profile.nickname.includes(literal)).slice(0, args.limit);
            }
            if (action === 'insert') {
              const {requester, addressee} = args.payload;
              const exists = friendships.some(row => [row.requester, row.addressee].includes(requester) &&
                [row.requester, row.addressee].includes(addressee));
              if (exists) return resolve({error: {code: '23505'}});
              friendships.push({id: id(30), status: 'pending', ...args.payload});
            }
            if (action === 'delete') for (const row of matches) friendships.splice(friendships.indexOf(row), 1);
            resolve({data: matches, error: null});
          } catch (error) { reject(error); }
        }
      };
      return q;
    },
    async rpc(name, args) {
      calls.push({name, ...args});
      if (name === 'friend_message_thread') return {data: {peer_id: args.p_peer,
        nickname: profiles.find(p => p.id === args.p_peer).nickname, items: [], can_send: true}};
      assert.equal(name, 'accept_friend');
      const request = friendships.find(row => row.id === args.req_id && row.addressee === w.session.user.id);
      assert.equal(request.status, 'pending');
      request.status = 'accepted';
      return {data: null};
    }
  };
  Object.assign(w, {
    client, session: {user: {id: owner}}, managementPanel: doc.querySelector('main'),
    managementBody: body, managementMessage: doc.querySelector('#msg'), managementBusy: false, managementRun: 0,
    showManagement(title) {
      doc.querySelector('h2').textContent = title; body.replaceChildren(); w.managementMessage.textContent = '';
      return ++w.managementRun;
    }
  });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  for (const name of ['node', 'managementButton', 'accountField', 'accountErrorMessage', 'accountAction']) {
    const source = shared.match(new RegExp('^(?:async )?function ' + name + '\\([\\s\\S]*?^\\}', 'm'))[0];
    w.eval(source + '\nwindow.' + name + ' = ' + name + ';');
  }
  w.eval(read('features/friends/friend-messages.js'));
  w.eval(read('park/friends.js'));
  function search(query) {
    const input = body.querySelector('input');
    assert.ok(!input.disabled);
    input.value = query;
    input.form.dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  }
  function row(name, parent = 'section') {
    return [...body.querySelectorAll(parent + ' .management-row')].find(item => item.querySelector('strong').textContent === name);
  }
  function button(container, name) {
    assert.ok(container, '행 또는 창이 보임');
    const control = [...container.querySelectorAll('button')].find(b => b.textContent === name);
    assert.ok(control, name + ' 버튼이 보임');
    return control;
  }
  function hold(pattern) {
    let release;
    pending.set(pattern, new Promise(resolve => { release = resolve; }));
    return release;
  }
  return {w, doc, body, calls, friendships, hold, search, row, button,
    failBlocks: value => { failBlocks = value; }, open: () => w.OjjudaParkFriends.open()};
}

test('공원 안에서 받은 신청, 보낸 신청, 친구 삭제와 쪽지를 처리한다', async t => {
  const {w, doc, body, calls, friendships, open, row, button} = fixture(t);
  await open();
  assert.equal(doc.querySelector('h2').textContent, '친구 관리');
  assert.deepEqual([...body.querySelectorAll('section h3')].map(n => n.textContent), ['받은 친구 신청', '친구 1명', '보낸 친구 신청']);
  assert.ok(!row('차단한 친구') && !row('다른 사람'));
  assert.ok(calls.find(c => c.or)?.or.includes('addressee.eq.' + owner));
  button(row('별 친구'), '쪽지').click();
  await tick();
  const dialog = doc.querySelector('dialog');
  assert.ok(dialog.open);
  assert.equal(dialog.querySelector('h2').textContent, '별 친구님과의 쪽지');
  assert.equal(calls.find(c => c.name === 'friend_message_thread').p_peer, id(2));
  button(dialog, '닫기').click();
  assert.ok(!dialog.open);
  button(row('달 친구'), '수락').click();
  await tick();
  assert.equal(friendships.find(r => r.id === id(22)).status, 'accepted');
  button(row('해 친구'), '거절').click();
  await tick();
  assert.ok(!row('해 친구'));
  button(row('물 친구'), '신청 취소').click();
  await tick();
  assert.ok(!friendships.some(r => r.id === id(24)));
  w.confirm = () => false;
  button(row('별 친구'), '친구 삭제').click();
  await tick();
  assert.ok(row('별 친구'));
  w.confirm = () => true;
  button(row('별 친구'), '친구 삭제').click();
  await tick();
  assert.ok(!row('별 친구'));
  assert.equal(w.location.pathname, '/park/');
});

test('검색에서 차단, 중복 신청, 서버 쪽 중복, 특수문자를 처리한다', async t => {
  const {w, open, body, calls, friendships, search, row, button} = fixture(t);
  await open();
  search('친구'); await tick();
  const result = '[aria-live]';
  assert.ok(!row('차단한 친구', result));
  assert.ok(row('별 친구', result).textContent.includes('친구예요'));
  assert.ok(button(row('달 친구', result), '수락'));
  assert.ok(button(row('물 친구', result), '신청 취소'));
  const send = button(row('새 친구', result), '친구 신청');
  send.click(); send.click(); await tick();
  assert.equal(calls.filter(c => c.action === 'insert').length, 1);
  assert.ok(button(row('새 친구', result), '신청 취소'));
  search('%_'); await tick();
  assert.equal(calls.filter(c => c.pattern).at(-1).pattern, '%\\%\\_%');
  assert.ok(row('50%_친구', result));
  friendships.push({id: id(31), requester: id(8), addressee: owner, status: 'pending'});
  button(row('50%_친구', result), '친구 신청').click(); await tick();
  assert.ok(button(row('50%_친구', result), '수락'));
  search('나'); await tick();
  assert.match(body.querySelector(result).textContent, /검색 결과가 없어요/);
  assert.ok(!w.managementBusy);
});

test('오래된 검색 응답이나 다른 계정의 요청은 현재 화면을 바꾸지 않는다', async t => {
  const {w, open, body, calls, search, row, button, hold} = fixture(t);
  await open();
  const releaseFirst = hold('%별%');
  search('별'); await tick();
  search('달'); await tick();
  releaseFirst(); await tick();
  assert.ok(row('달 친구', '[aria-live]'));
  assert.ok(!row('별 친구', '[aria-live]'));
  const releaseSecond = hold('%해%');
  const oldAccept = button(row('달 친구'), '수락');
  search('해'); await tick();
  w.session = {user: {id: id(9)}};
  oldAccept.click();
  await open();
  releaseSecond(); await tick();
  assert.ok(!body.textContent.includes('해 친구'));
  assert.ok(!calls.some(c => c.name === 'accept_friend'));
});

test('차단 목록 조회에 실패하면 친구 조회를 다시 시도할 수 있고 비회원은 조회하지 않는다', async t => {
  const {w, body, calls, open, button, failBlocks} = fixture(t);
  failBlocks(true);
  await open();
  assert.equal(body.querySelector('form'), null);
  failBlocks(false);
  button(body, '다시 불러오기').click();
  await tick();
  assert.ok(body.querySelector('form'));
  const reads = calls.length;
  w.session = null; await open();
  assert.match(body.textContent, /로그인/);
  w.session = {user: {id: owner, is_anonymous: true}}; await open();
  assert.equal(calls.length, reads);
});
