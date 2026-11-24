/* Park account screens share the signed-in profile and keep their own alert preference. */
(() => {
  'use strict';
  let owner = null, channel = null, photoEditor = null, inbox = null;
  const memberId = () => session?.user && !session.user.is_anonymous ? session.user.id : null;
  const allowAlerts = () => session?.user?.user_metadata?.park_friend_alerts !== false;
  const messages = () => inbox ||= window.OjjudaFriendMessages?.install({
    client, getUserId: memberId
  });

  function syncIdentity() {
    const id = memberId();
    if (owner === id) return;
    owner = id;
    photoEditor?.destroy(); photoEditor = null;
    inbox?.close(true);
    if (channel) { void Promise.resolve(client.removeChannel(channel)).catch(() => {}); channel = null; }
    if (!id || !client?.channel) return;
    const next = client.channel('park-friend-alerts:' + id);
    function notify(message) {
      if (channel !== next || memberId() !== id) return;
      notificationController?.refresh?.();
      if (allowAlerts() && !document.hidden && !window.frameElement?.hidden) flashMessage(message);
    }
    channel = next;
    next.on('postgres_changes', {event:'INSERT',schema:'public',table:'friendships',filter:'addressee=eq.' + id}, ({new: row}) => {
      if (row?.addressee === id && row.status === 'pending') notify('새 친구 신청이 도착했어요.');
    }).on('postgres_changes', {event:'UPDATE',schema:'public',table:'friendships',filter:'requester=eq.' + id}, ({new: row}) => {
      if (row?.requester === id && row.status === 'accepted') notify('친구 신청이 수락됐어요.');
    }).subscribe();
  }

  function alerts() {
    const id = memberId();
    if (!id) return;
    const run = showManagement('친구 신청 알림');
    const label = node('label', 'park-alert-setting');
    const input = node('input'); input.type = 'checkbox'; input.checked = allowAlerts();
    label.append(input, '공원에서 친구 신청·수락 알림 받기');
    managementBody.append(label);
    input.addEventListener('change', () => {
      if (memberId() !== id || managementRun !== run) return;
      const enabled = input.checked;
      void accountAction(async () => {
        const {data, error} = await client.auth.updateUser({data:{park_friend_alerts:enabled}});
        if (error) throw error;
        if (data?.user?.id !== id || data.user.user_metadata?.park_friend_alerts !== enabled) throw Error('preference_unconfirmed');
        return data.user;
      }, user => {
        session = {...session, user};
        managementMessage.textContent = enabled ? '친구 신청 알림을 켰어요.' : '친구 신청 알림을 껐어요.';
      }).finally(() => {
        if (managementRun === run && memberId() === id) input.checked = allowAlerts();
      });
    });
  }

  async function profile() {
    const id = memberId();
    if (!id) return;
    const run = showManagement('프로필 수정');
    const current = () => memberId() === id && managementRun === run;
    state(managementBody, '프로필을 불러오고 있어요.');
    try {
      const {data, error} = await client.from('profiles')
        .select('nickname,bio,profile_photo_path,profile_photo_source_path,profile_photo_crop').eq('id', id).maybeSingle();
      if (error || !data) throw error || Error('profile_unavailable');
      if (!current()) return;
      const form = node('form', 'note-account-form');
      form.noValidate = true;
      managementBody.replaceChildren(form);
      const editor = photoEditor ||= window.OjjudaProfilePhoto?.create({client, getUser:() => session?.user, notify:flashMessage});
      if (editor) {
        let image = {path:data.profile_photo_path, sourcePath:data.profile_photo_source_path, crop:data.profile_photo_crop};
        const avatar = node('img'); avatar.alt = ''; avatar.hidden = true;
        const photoButton = managementButton('사진 변경', async () => {
          if (!current()) return;
          const saved = await editor.open(image);
          if (!saved || !current()) return;
          image = saved; avatar.hidden = !saved.url;
          if (saved.url) avatar.src = saved.url;
        });
        photoButton.classList.add('park-profile-photo'); photoButton.prepend(avatar); form.append(photoButton);
        const initial = image;
        if (image.path) void editor.getUrl(image.path).then(url => {
          if (current() && image === initial && url) { avatar.src = url; avatar.hidden = false; }
        }).catch(() => {});
      }
      const nickname = accountField(form, 'park-profile-name', '닉네임');
      const bio = accountField(form, 'park-profile-bio', '한 줄 소개'); bio.required = false;
      for (const [field, value, limit] of [[nickname, data.nickname, 12], [bio, data.bio, 40]]) {
        field.value = value || '';
        const syncLimit = () => { field.maxLength = textInputMaxLength(field.value, limit); };
        field.addEventListener('input', syncLimit); syncLimit();
      }
      accountFormFooter(form, '프로필 저장');
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!current()) return;
        const name = nickname.value.trim(), intro = bio.value.trim();
        if (!name || maskedTextLength(name) > 12) { managementMessage.textContent = '닉네임은 1자부터 12자까지 적어 주세요.'; nickname.focus(); return; }
        if (maskedTextLength(intro) > 40) { managementMessage.textContent = '한 줄 소개는 40자까지 적어 주세요.'; bio.focus(); return; }
        const changes = {};
        if (name !== data.nickname) changes.nickname = name;
        if (intro !== (data.bio || '')) changes.bio = intro;
        if (!Object.keys(changes).length) { accountSuccess('프로필을 확인했어요.'); return; }
        void accountAction(async () => {
          const result = await client.from('profiles').update({...changes,updated_at:new Date().toISOString()}).eq('id',id).select('nickname,bio').single();
          if (result.error || !result.data) throw result.error || Error('profile_unavailable');
          return result.data;
        }, saved => {
          accountProfileRun++; accountNickname = saved.nickname; updateAuth(); accountSuccess('프로필을 저장했어요.');
        });
      });
    } catch {
      if (!current()) return;
      state(managementBody, '프로필을 불러오지 못했어요.');
      managementFooter.append(managementButton('다시 시도', profile));
    }
  }

  const dialogOpen = () => photoEditor?.isOpen() || inbox?.isOpen() || false;
  function closeDialog() {
    if (photoEditor?.isOpen()) return photoEditor.close();
    if (inbox?.isOpen()) return inbox.close();
    return true;
  }
  window.OjjudaParkAccount = Object.freeze({profile,alerts,messages,syncIdentity,dialogOpen,closeDialog});
  syncIdentity();
})();
