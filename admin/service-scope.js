/* Service navigation is presentation only; every management RPC verifies the administrator. */
(() => {
  'use strict';
  const services = Object.freeze({
    agit: Object.freeze({label:'아지트', home:'overview'}),
    park: Object.freeze({label:'공원', home:'cards'}),
    pajang: Object.freeze({label:'파장', home:'pajang-answers'})
  });
  const dedicated = Object.freeze({
    agit: Object.freeze(['messages','groups','photo-stages','drinking-prompts','fortune-purchases','trash-messages']),
    park: Object.freeze(['cards','risk','map','note-users','spam','trash-cards']),
    pajang: Object.freeze(['pajang-answers','pajang-chats'])
  });
  const common = Object.freeze(['overview','visitors','users','suspended','referrals','settings','reports','feedback',
    'errors','connections','activity','notice','words','assets','rewards','trash-all','trash-accounts','trash-other']);
  const valid = value => typeof value === 'string' && Object.hasOwn(services,value);
  const normalize = value => valid(value) ? value : 'agit';
  const owner = tab => Object.keys(dedicated).find(service => dedicated[service].includes(tab)) || null;
  const allows = (service,tab) => common.includes(tab) || dedicated[normalize(service)].includes(tab);
  const resolve = (value,tab) => valid(value) ? value : owner(tab) || 'agit';
  window.OjjudaAdminScope = Object.freeze({services,dedicated,common,valid,normalize,owner,allows,resolve});
})();
