/* Shared World/Note withdrawal: remove actual files before deleting the account. */
(function (root) {
  'use strict';
  const buckets = new Set(['media', 'note-card-photos', 'note-event-photos']);
  async function run({ client, userId, isCurrent = () => true }) {
    const current = () => {
      if (!userId || !isCurrent()) throw new Error('account_changed');
    };
    const rpc = async (name, args = {}) => {
      current();
      const { data, error } = await client.rpc(name, { ...args, p_expected_user_id: userId });
      current();
      if (error) throw error;
      return data;
    };
    await rpc('prepare_my_account_deletion');
    let previous = '';
    for (;;) {
      const files = await rpc('my_account_deletion_files', { p_limit: 100 });
      if (!Array.isArray(files) || files.length > 100) throw new Error('invalid_deletion_inventory');
      if (!files.length) break;
      for (const file of files) {
        if (!buckets.has(file.bucket_id) || typeof file.photo_path !== 'string'
            || !file.photo_path.startsWith(userId + '/')
            || file.photo_path.split('/').some(part => !part || part === '.' || part === '..')
            || /[\\\x00]/.test(file.photo_path)) throw new Error('account_storage_manual_review');
      }
      const inventory = JSON.stringify(files);
      if (inventory === previous) throw new Error('account_storage_remaining');
      previous = inventory;
      for (const bucket of buckets) {
        const paths = files.filter(file => file.bucket_id === bucket).map(file => file.photo_path);
        if (!paths.length) continue;
        current();
        const { error } = await client.storage.from(bucket).remove(paths);
        current();
        if (error) throw error;
      }
    }
    await rpc('delete_my_account');
  }
  function message(error) {
    const code = error?.message || '';
    if (code.includes('account_changed')) return '계정이 바뀌었어요. 현재 계정을 확인한 뒤 다시 시도해 주세요.';
    if (code.includes('account_storage_manual_review')) return '사진 소유 정보를 확인해야 해요. 계정은 유지되니 관리자에게 문의해 주세요.';
    if (code.includes('managed_account_requires_admin')) return '운영용 계정은 관리자 확인 후 탈퇴할 수 있어요.';
    if (code.includes('account_not_found')) return '계정 상태가 바뀌었어요. 새로고침 후 확인해 주세요.';
    return '탈퇴를 마치지 못했어요. 다시 탈퇴를 누르면 남은 사진 정리부터 이어서 처리해요.';
  }
  const api = Object.freeze({ run, message });
  root.OjjudaAccountDeletion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
