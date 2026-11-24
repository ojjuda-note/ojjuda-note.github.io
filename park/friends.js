(() => {
  'use strict';

  const profileFields = 'id,nickname,bio';

  function rows(result) {
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function open() {
    const owner = session?.user?.id;
    const run = showManagement('친구 관리');
    if (!owner || session.user.is_anonymous || parkJunior() || !client) {
      managementBody.append(node('p', 'reply-empty', '로그인하면 친구를 찾고 관리할 수 있어요.'));
      return;
    }

    const current = () => managementRun === run && session?.user?.id === owner;
    let relations = new Map(), blocked = new Set(), results = null;
    let searchRun = 0;
    const form = node('form', 'note-account-form');
    const input = accountField(form, 'park-friend-search', '친구 닉네임 검색', 'search');
    input.maxLength = 12;
    const submit = node('button', 'button', '검색');
    submit.type = 'submit';
    form.append(submit);
    const resultList = node('div');
    resultList.setAttribute('aria-live', 'polite');

    function button(label, action, primary = false) {
      return managementButton(label, event => {
        if (current() && !managementBusy && event.currentTarget.isConnected) action();
      }, primary);
    }

    async function modify(operation) {
      let completed = false;
      await accountAction(async () => {
        const {error} = await operation();
        if (error && error.code !== '23505') {
          throw Object.assign(new Error(error.message), {userMessage: '처리하지 못했어요. 친구 상태를 확인하고 다시 시도해 주세요.'});
        }
      }, () => { completed = true; });
      if (completed) await refresh();
    }

    function remove(relation) {
      return modify(() => client.from('friendships').delete()
        .eq('id', relation.id).eq('requester', relation.requester)
        .eq('addressee', relation.addressee).eq('status', relation.status));
    }

    function openMessages(id) {
      const messages = window.OjjudaParkAccount?.messages() ||
        window.OjjudaFriendMessages?.install({client, getUserId: () => session?.user?.id || null});
      if (messages) void messages.open(id);
      else managementMessage.textContent = '쪽지를 열지 못했어요. 새로고침한 뒤 다시 시도해 주세요.';
    }

    function person(profile, searching = false) {
      const row = node('div', 'management-row');
      const label = node('span');
      label.append(node('strong', '', profile.nickname));
      if (profile.bio) label.append(node('small', '', profile.bio));
      row.append(label);
      const relation = relations.get(profile.id);
      if (!relation) {
        row.append(button('친구 신청', () => modify(() => client.from('friendships')
          .insert({requester: owner, addressee: profile.id})), true));
      } else if (relation.status === 'accepted') {
        if (searching) row.append(node('small', '', '친구예요'));
        else row.append(button('쪽지', () => openMessages(profile.id)), button('친구 삭제', () => {
          if (window.confirm(`${profile.nickname}님을 친구 목록에서 삭제할까요?`)) void remove(relation);
        }));
      } else if (relation.addressee === owner) {
        row.append(button('수락', () => modify(() => client.rpc('accept_friend', {req_id: relation.id})), true));
        if (!searching) row.append(button('거절', () => remove(relation)));
      } else {
        row.append(button('신청 취소', () => remove(relation)));
      }
      return row;
    }

    function visible(profile) {
      return profile.id !== owner && !blocked.has(profile.id);
    }

    function renderResults() {
      resultList.replaceChildren();
      if (!results) return;
      const matches = results.filter(visible);
      if (matches.length) resultList.append(...matches.map(profile => person(profile, true)));
      else resultList.append(node('p', 'reply-empty', '검색 결과가 없어요.'));
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!current() || managementBusy || !form.isConnected) return;
      const query = input.value.trim(), request = ++searchRun;
      results = null;
      if (!query) { resultList.replaceChildren(); input.focus(); return; }
      resultList.replaceChildren(node('p', 'reply-empty', '검색 중이에요.'));
      const pattern = '%' + query.replace(/[\\%_]/g, char => '\\' + char) + '%';
      try {
        const found = rows(await client.from('profiles').select(profileFields)
          .ilike('nickname', pattern).neq('id', owner).limit(20));
        if (!current() || request !== searchRun) return;
        results = found;
        renderResults();
      } catch {
        if (current() && request === searchRun) resultList.textContent = '검색하지 못했어요. 다시 검색해 주세요.';
      }
    });

    function section(title, people, empty) {
      const group = node('section');
      group.append(node('h3', '', title));
      if (people.length) group.append(...people.map(profile => person(profile)));
      else group.append(node('p', 'reply-empty', empty));
      return group;
    }

    async function refresh() {
      if (!current()) return;
      ++searchRun;
      managementMessage.textContent = '';
      managementBody.replaceChildren(node('p', 'reply-empty', '친구 목록을 불러오는 중이에요.'));
      try {
        const [friendRows, blockRows] = (await Promise.all([
          client.from('friendships').select('id,requester,addressee,status')
            .or(`requester.eq.${owner},addressee.eq.${owner}`),
          client.from('blocks').select('blocked').eq('blocker', owner)
        ])).map(rows);
        if (!current()) return;
        blocked = new Set(blockRows.map(row => row.blocked));
        relations = new Map();
        for (const row of friendRows) {
          if (row.requester !== owner && row.addressee !== owner) continue;
          const peer = row.requester === owner ? row.addressee : row.requester;
          if (peer !== owner && !blocked.has(peer) && ['accepted', 'pending'].includes(row.status)) relations.set(peer, row);
        }
        const peers = [...relations.keys()];
        const profiles = peers.length ? rows(await client.from('profiles').select(profileFields).in('id', peers)) : [];
        if (!current()) return;
        const accepted = [], incoming = [], outgoing = [];
        for (const profile of profiles) {
          const relation = relations.get(profile.id);
          if (!relation) continue;
          if (relation.status === 'accepted') accepted.push(profile);
          else if (relation.addressee === owner) incoming.push(profile);
          else outgoing.push(profile);
        }
        renderResults();
        managementBody.replaceChildren(form, resultList,
          section('받은 친구 신청', incoming, '받은 친구 신청이 없어요.'),
          section(`친구 ${accepted.length}명`, accepted, '아직 친구가 없어요. 닉네임으로 친구를 찾아보세요.'),
          section('보낸 친구 신청', outgoing, '보낸 친구 신청이 없어요.'));
      } catch {
        if (!current()) return;
        managementBody.replaceChildren(node('p', 'reply-empty', '친구 목록을 불러오지 못했어요.'),
          button('다시 불러오기', refresh));
      }
    }
    await refresh();
  }

  window.OjjudaParkFriends = Object.freeze({open});
})();
