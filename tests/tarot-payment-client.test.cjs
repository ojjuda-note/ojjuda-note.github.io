const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const sourcePath = process.env.TAROT_PAYMENT_SOURCE || path.join(__dirname, '../games/moonlit-tarot/payment.js');
const source = fs.readFileSync(sourcePath, 'utf8').replace('export class TarotPayment', 'class TarotPayment');

(async () => {
  let owner = 'member-a', coins = 30, loseResponse = true, authChange, accountChanges = 0;
  const storage = new Map(), receipts = new Map(), requests = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: owner ? { user: { id: owner } } : null } }),
      onAuthStateChange: fn => { authChange = fn; }
    },
    rpc: async (name, args) => {
      if (name === 'ju_shop_state') return { data: { ok: true, coins } };
      requests.push(args);
      if (receipts.has(args.p_request_id)) return { data: { ...receipts.get(args.p_request_id), coins, replayed: true } };
      if (args.p_verify_only) return { data: { ok: false, reason: 'not_found', coins } };
      if (coins < 10) return { data: { ok: false, reason: 'coins', coins } };
      coins -= 10;
      const receipt = { ok: true, request_id: args.p_request_id, topic: args.p_topic, price: 10, coins, drawn: ['fool','sun','world','cups_ace','swords_king'] };
      receipts.set(args.p_request_id, receipt);
      if (loseResponse) { loseResponse = false; return { error: { message: 'connection lost' } }; }
      return { data: receipt };
    }
  };
  const context = { window: { OJJUDA_CONFIG: { supabaseUrl: 'test', supabaseKey: 'publishable-test' }, ojjudaSupabase: client }, crypto: { randomUUID },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) }, console };
  const Payment = vm.runInNewContext(source + '; TarotPayment', context);
  const preview = new Payment();
  assert.equal((await preview.init()).preview, true);
  assert.equal(await preview.start('overall'), null);
  assert.equal(requests.length, 0);
  const payment = new Payment({ enabled: true, onAccountChange: () => accountChanges++ });
  assert.equal((await payment.init()).signedIn, true);
  await assert.rejects(payment.start('love'), /중복 차감/);
  assert.equal(coins, 20);
  const pendingId = payment.record.requestId;
  const results = await Promise.all([payment.start('love'), payment.start('love')]);
  assert.equal(coins, 20);
  assert.equal(results[0].request_id, pendingId);
  assert.equal(results[1].request_id, pendingId);
  assert.equal(requests.length, 2, 'rapid duplicate clicks share one in-flight retry');
  assert.equal(requests[0].p_request_id, requests[1].p_request_id);
  payment.save({ discarded: new Set([0,2]), openOrder: [4,1] });
  const normalRpc = client.rpc;
  let failRestoreVerification = true;
  client.rpc = async (name, args) => {
    if (name === 'tarot_reading_buy_v1' && args.p_verify_only && failRestoreVerification) {
      failRestoreVerification = false;
      return { error: { message: 'temporary connection failure during restore' } };
    }
    return normalRpc(name, args);
  };
  const failedRestore = new Payment({ enabled: true });
  await assert.rejects(failedRestore.init(), /중복 차감/);
  const recovered = await failedRestore.start('love');
  assert.equal(coins, 20, 'retrying failed restore does not repurchase');
  assert.equal(JSON.stringify(recovered.discarded), '[0,2]', 'start retry retains discarded choices');
  assert.equal(JSON.stringify(recovered.openOrder), '[4,1]', 'start retry retains the chosen reveal order');
  client.rpc = normalRpc;
  const restored = new Payment({ enabled: true });
  const resume = (await restored.init()).resume;
  assert.equal(coins, 20);
  assert.equal(requests.at(-1).p_verify_only, true);
  assert.equal(JSON.stringify(resume.discarded), '[0,2]');
  assert.equal(JSON.stringify(resume.openOrder), '[4,1]');
  restored.newReading();
  assert.equal(restored.record, null);
  await restored.start('money');
  assert.equal(coins, 10);
  restored.newReading();
  await restored.start('work');
  assert.equal(coins, 0);
  restored.newReading();
  await assert.rejects(restored.start('overall'), /부족/);
  assert.equal(restored.record, null);
  assert.equal(coins, 0);
  owner = null;
  const guest = new Payment({ enabled: true });
  assert.equal((await guest.init()).signedIn, false);
  await assert.rejects(guest.start('overall'), /로그인/);
  owner = 'member-b';
  const noStorage = new Payment({ enabled: true });
  await noStorage.init();
  context.localStorage.setItem = () => { throw new Error('storage blocked'); };
  const before = requests.length;
  await assert.rejects(noStorage.start('overall'), /저장/);
  assert.equal(requests.length, before, 'no charge before the retry ID is stored');
  // A reloaded page may verify before an older, delayed POST reaches the database.
  // A missing receipt is not a definite failure; both pages must keep the same ID.
  let delayedCoins = 40, delayFirstPurchase = true, releaseDelayedPurchase;
  const delayedGate = new Promise(resolve => { releaseDelayedPurchase = resolve; });
  const delayedStorage = new Map(), delayedReceipts = new Map(), delayedRequests = [];
  const delayedClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'delayed-member' } } } }),
      onAuthStateChange: () => {}
    },
    rpc: async (name, args) => {
      if (name === 'ju_shop_state') return { data: { ok: true, coins: delayedCoins } };
      delayedRequests.push(args);
      if (!args.p_verify_only && delayFirstPurchase) {
        delayFirstPurchase = false;
        await delayedGate;
      }
      if (delayedReceipts.has(args.p_request_id)) return { data: { ...delayedReceipts.get(args.p_request_id), coins: delayedCoins, replayed: true } };
      if (args.p_verify_only) return { data: { ok: false, reason: 'not_found', coins: delayedCoins } };
      delayedCoins -= 10;
      const receipt = { ok: true, request_id: args.p_request_id, topic: args.p_topic, price: 10, coins: delayedCoins, drawn: ['fool','sun','world','cups_ace','swords_king'] };
      delayedReceipts.set(args.p_request_id, receipt);
      return { data: receipt };
    }
  };
  const delayedContext = {
    window: { OJJUDA_CONFIG: { supabaseUrl: 'test', supabaseKey: 'publishable-test' }, ojjudaSupabase: delayedClient },
    crypto: { randomUUID },
    localStorage: { getItem: key => delayedStorage.get(key) || null, setItem: (key,value) => delayedStorage.set(key,value), removeItem: key => delayedStorage.delete(key) },
    console
  };
  const DelayedPayment = vm.runInNewContext(source + '; TarotPayment', delayedContext);
  const oldPage = new DelayedPayment({ enabled: true });
  await oldPage.init();
  const oldPurchase = oldPage.start('love');
  const originalId = oldPage.record.requestId;
  const reloadedPage = new DelayedPayment({ enabled: true });
  const verification = await reloadedPage.init();
  assert.equal(delayedCoins, 40, 'the old purchase has not reached the database yet');
  assert.equal(verification.pending.requestId, originalId);
  assert.equal(reloadedPage.record.requestId, originalId, 'not_found must retain the request ID');
  const retry = await reloadedPage.start('love');
  releaseDelayedPurchase();
  const original = await oldPurchase;
  assert.equal(retry.request_id, originalId);
  assert.equal(original.request_id, originalId);
  assert.equal(delayedReceipts.size, 1);
  assert.equal(delayedCoins, 30, 'late original and reload retry charge exactly once');
  assert.ok(delayedRequests.every(args => args.p_request_id === originalId));
  console.log('PASS: preview never charges, lost-response retry, rapid-click deduplication, saved progress restore, explicit new reading, insufficient funds, guest and unavailable-storage handling.');
  console.log('PASS: reload verification arriving before a delayed original purchase preserves the same receipt and charges once.');
})().catch(error => { console.error(error); process.exitCode = 1; });
