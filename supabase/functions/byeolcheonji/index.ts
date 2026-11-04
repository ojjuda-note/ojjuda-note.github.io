import postgres from 'postgres';
import webpush from 'web-push';
import { randomBytes } from 'node:crypto';
import { availability, notificationPlan, parseFilters, SCAN_SECONDS, todayInKorea } from './model.mjs';
import { fetchInventory, ProviderError } from './provider.mjs';
import { ApiError, ORIGINS, checkSignature, deviceHash, jsonBody, pushSubscription, verifyIdentity } from './security.mjs';

const db = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 });
const authUrl = Deno.env.get('SUPABASE_URL')!;
const authKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
const HOME = 'https://ojjuda.kr/byeolcheonji/';

async function member(request: Request) {
  const identity = await verifyIdentity(request, { authUrl, key: authKey });
  const [allowed] = await db`select u.id from auth.users u
    join public.profiles p on p.id=u.id
    join auth.sessions s on s.user_id=u.id and s.id=${identity.sessionId}
    left join public.user_private moderation on moderation.user_id=u.id
    where u.id=${identity.userId} and u.is_anonymous is not true and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now())
      and (moderation.banned_until is null or moderation.banned_until<=now())
      and (s.not_after is null or s.not_after>now())`;
  if (!allowed) throw new ApiError(403, 'member_unavailable', '이 회원 계정으로는 이용할 수 없어요. 다시 로그인해 주세요.');
  return identity.userId;
}

async function vapidKeys() {
  return await db.begin(async tx => {
    await tx`select pg_advisory_xact_lock(77831, 1)`;
    const [existing] = await tx`select decrypted_secret from vault.decrypted_secrets where name='byeolcheonji_vapid_v1'`;
    const keys = existing ? JSON.parse(existing.decrypted_secret) : webpush.generateVAPIDKeys();
    if (!existing) await tx`select vault.create_secret(${JSON.stringify(keys)},'byeolcheonji_vapid_v1','Web Push encryption for Ojjuda vacancy alerts')`;
    await tx`update byeolcheonji_internal.runtime set vapid_public_key=${keys.publicKey} where singleton and vapid_public_key is distinct from ${keys.publicKey}`;
    return keys;
  });
}

async function status(userId: string, request: Request) {
  const token = deviceHash(request, true), keys = await vapidKeys();
  const [state] = await db`select inventory_at,last_error from byeolcheonji_internal.runtime where singleton`;
  const rows = token ? await db`select enabled,filters from byeolcheonji_internal.subscriptions where user_id=${userId} and device_hash=${token}` : [];
  return { vapidPublicKey: keys.publicKey, lastCheckedAt: state?.inventory_at || null,
    lastError: state?.last_error || null, subscription: rows[0] || null };
}

function fresh(snapshot: any, captured: Date | string | null) {
  return snapshot?.from === todayInKorea() && captured && Date.now() - new Date(captured).getTime() < SCAN_SECONDS * 1000;
}

let pendingInventory: Promise<any> | null = null;
async function inventory(force = false) {
  if (pendingInventory) return await pendingInventory;
  const [state] = await db`select * from byeolcheonji_internal.runtime where singleton`;
  if (!state) throw new ApiError(503, 'not_ready', '빈방 알림을 준비하고 있어요. 잠시 뒤 다시 확인해 주세요.');
  if (!force && state.inventory_usable && fresh(state.inventory, state.inventory_at)) return state.inventory;
  const token = crypto.randomUUID();
  const [lease] = await db`update byeolcheonji_internal.runtime
    set scan_token=${token},scan_lease_until=now()+interval '110 seconds',next_scan_after=now()+interval '110 seconds'
    where singleton and scan_lease_until<=now() and next_scan_after<=now() returning singleton`;
  if (!lease) {
    if (state.inventory_usable && fresh(state.inventory, state.inventory_at)) return state.inventory;
    const wait = Math.max(5, Math.ceil((new Date(state.next_scan_after).getTime() - Date.now()) / 1000));
    const loading = new Date(state.scan_lease_until).getTime() > Date.now();
    throw new ApiError(503, loading ? 'inventory_loading' : 'inventory_delayed', loading
      ? '다른 빈방 확인을 마무리하고 있어요. 잠시 뒤 다시 확인해 주세요.'
      : state.last_error || '빈방 정보를 다시 확인하고 있어요. 잠시 뒤 새로고침해 주세요.', loading ? 5 : Math.min(wait, 300));
  }
  pendingInventory = (async () => {
    try {
      const snapshot = await fetchInventory();
      const [stored] = await db`update byeolcheonji_internal.runtime set inventory=${db.json(snapshot)},inventory_at=now(),inventory_usable=true,
        scan_lease_until='-infinity',scan_count=scan_count+1,
        last_error=${snapshot.failedRooms.length ? '일부 객실을 확인하지 못했어요. 확인된 객실만 표시합니다.' : null}
        where singleton and scan_token=${token} returning singleton`;
      if (!stored) throw new ApiError(503, 'inventory_loading', '새 빈방 확인이 진행 중이에요. 잠시 뒤 다시 확인해 주세요.', 5);
      return snapshot;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const limited = error instanceof ProviderError && error.limited;
      const message = limited ? '예약처 요청이 많아 5분 뒤 다시 확인합니다.' : '예약처 연결이 지연되고 있어요. 자동으로 다시 확인합니다.';
      await db`update byeolcheonji_internal.runtime set scan_lease_until='-infinity',inventory_usable=false,
        next_scan_after=now()+${limited ? 300 : 120}*interval '1 second',last_error=${message}
        where singleton and scan_token=${token}`;
      throw new ApiError(limited ? 429 : 503, limited ? 'provider_limited' : 'provider_unavailable', message, limited ? 300 : 120);
    }
  })();
  try { return await pendingInventory; }
  finally { pendingInventory = null; }
}

async function limit(tx: any, userId: string, action: string, maximum: number) {
  const bucket = `${action}/${userId}/${new Date().toISOString().slice(0, 13)}`;
  const [rate] = await tx`insert into byeolcheonji_internal.request_limits(bucket) values(${bucket})
    on conflict(bucket) do update set attempts=byeolcheonji_internal.request_limits.attempts+1 returning attempts`;
  if (rate.attempts > maximum) throw new ApiError(429, 'too_many_requests', '잠시 쉬었다가 다시 눌러 주세요.', 60);
}

function encryptedRequest(subscription: any, payload: any, keys: any) {
  return webpush.generateRequestDetails(pushSubscription(subscription), JSON.stringify(payload), {
    vapidDetails: { subject: HOME, publicKey: keys.publicKey, privateKey: keys.privateKey },
    TTL: 300, urgency: 'high', topic: payload.tag === 'byeolcheonji-test' ? 'byeolcheonji-test' : 'byeolcheonji-vacancy',
  });
}

async function deliver(subscription: any, payload: any, keys: any) {
  const encrypted = encryptedRequest(subscription, payload, keys);
  const response = await fetch(encrypted.endpoint, { method: encrypted.method, headers: encrypted.headers,
    body: encrypted.body, redirect: 'error', signal: AbortSignal.timeout(8000) });
  await response.body?.cancel();
  return { accepted: response.ok, gone: [404, 410].includes(response.status), status: response.status };
}

async function subscribe(userId: string, request: Request) {
  const token = deviceHash(request), body = await jsonBody(request);
  let filters;
  try { filters = parseFilters(body.filters); } catch (error) { throw new ApiError(400, 'invalid_filters', (error as Error).message); }
  const subscription = pushSubscription(body.subscription);
  try { encryptedRequest(subscription, { title: 'Device encryption check', tag: 'byeolcheonji-test' }, await vapidKeys()); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'invalid_device', '알림 등록을 다시 준비해 주세요.'); }
  return await db.begin(async tx => {
    await tx`select pg_advisory_xact_lock(77831, 2)`;
    const [old] = await tx`select id,filters from byeolcheonji_internal.subscriptions where user_id=${userId} and device_hash=${token}`;
    const [other] = await tx`select id from byeolcheonji_internal.subscriptions
      where endpoint=${subscription.endpoint} and not(user_id=${userId} and device_hash=${token})`;
    if (other) throw new ApiError(409, 'device_conflict', '이 기기의 이전 알림을 새 계정에 맞게 다시 등록해 주세요.');
    await limit(tx, userId, 'settings', 30);
    if (!old) {
      const [owned] = await tx`select count(*)::integer as total from byeolcheonji_internal.subscriptions where user_id=${userId}`;
      if (owned.total >= 5) throw new ApiError(429, 'device_limit', '한 회원은 최대 5개 기기에 알림을 등록할 수 있어요.');
      const [total] = await tx`select count(*)::integer as total from byeolcheonji_internal.subscriptions`;
      if (total.total >= 2000) throw new ApiError(503, 'registration_busy', '알림 등록이 많아 잠시 준비 중이에요.');
    }
    const changed = !old || old.filters.dateMode !== filters.dateMode || old.filters.guests !== filters.guests;
    const [row] = await tx`insert into byeolcheonji_internal.subscriptions(user_id,device_hash,endpoint,keys,filters)
      values(${userId},${token},${subscription.endpoint},${tx.json(subscription.keys)},${tx.json(filters)})
      on conflict(user_id,device_hash) do update set endpoint=excluded.endpoint,keys=excluded.keys,filters=excluded.filters,
        enabled=true,revision=byeolcheonji_internal.subscriptions.revision+1,
        seen=case when ${changed} then '[]'::jsonb else byeolcheonji_internal.subscriptions.seen end,
        failures=0,retry_after='-infinity',updated_at=now()
      returning enabled,filters`;
    return row;
  });
}

async function testNotification(userId: string, request: Request) {
  const token = deviceHash(request);
  const row = await db.begin(async tx => {
    await limit(tx, userId, 'test', 10);
    const [candidate] = await tx`update byeolcheonji_internal.subscriptions set last_test_at=now()
      where user_id=${userId} and device_hash=${token} and enabled
        and (last_test_at is null or last_test_at<now()-interval '30 seconds') returning *`;
    if (!candidate) throw new ApiError(429, 'test_unavailable', '알림을 먼저 켜거나, 테스트 후 30초 뒤에 다시 눌러 주세요.', 30);
    return candidate;
  });
  let result;
  try { result = await deliver(row, { title: '별천지 알림이 연결됐어요', body: '이 알림이 보이면 화면을 닫아도 빈방 소식을 받을 준비가 됐어요.',
    url: '/byeolcheonji/', tag: 'byeolcheonji-test' }, await vapidKeys()); }
  catch { throw new ApiError(502, 'push_unavailable', '휴대폰 알림 서비스 연결이 지연됐어요. 잠시 뒤 테스트를 다시 눌러 주세요.'); }
  if (result.gone) {
    await db`delete from byeolcheonji_internal.subscriptions where id=${row.id} and revision=${row.revision}`;
    throw new ApiError(410, 'device_expired', '기기의 알림 등록이 만료됐어요. 알림을 다시 켜 주세요.');
  }
  if (!result.accepted) throw new ApiError(502, 'push_unavailable', '휴대폰 알림 서비스가 전송을 받지 못했어요. 잠시 뒤 다시 눌러 주세요.');
  return { accepted: true };
}

async function tick(request: Request) {
  const [secret] = await db`select decrypted_secret from vault.decrypted_secrets where name='byeolcheonji_signing_v1'`;
  const { nonce, probe } = checkSignature(request, secret?.decrypted_secret);
  const [accepted] = await db`insert into byeolcheonji_internal.nonces(nonce) values(${nonce}) on conflict do nothing returning nonce`;
  if (!accepted) return { skipped: 'duplicate' };
  const deliveryToken = crypto.randomUUID();
  const [lease] = await db`update byeolcheonji_internal.runtime set delivery_token=${deliveryToken},delivery_lease_until=now()+interval '180 seconds',last_tick_at=now()
    where singleton and delivery_lease_until<=now() returning singleton`;
  if (!lease) return { skipped: 'busy' };
  try {
    await db`delete from byeolcheonji_internal.nonces where created_at<now()-interval '10 minutes'`;
    await db`delete from byeolcheonji_internal.request_limits where created_at<now()-interval '2 days'`;
    // Re-check actual membership for every background run; no client metadata controls access.
    const subscribers = await db`select s.*,s.retry_after<=now() as ready from byeolcheonji_internal.subscriptions s
      join auth.users u on u.id=s.user_id join public.profiles p on p.id=u.id
      left join public.user_private moderation on moderation.user_id=u.id
      where s.enabled and u.is_anonymous is not true and u.deleted_at is null
        and (u.banned_until is null or u.banned_until<=now())
        and (moderation.banned_until is null or moderation.banned_until<=now())
      order by s.updated_at asc limit 2000`;
    if (!probe && !subscribers.length) return { checked: 0, sent: 0, skipped: 'no_subscribers' };
    if (probe) {
      const receiver = webpush.generateVAPIDKeys();
      const encrypted = encryptedRequest({ endpoint: 'https://fcm.googleapis.com/fcm/send/byeolcheonji-local-probe',
        keys: { p256dh: receiver.publicKey, auth: randomBytes(16).toString('base64url') } },
        { title: 'Encryption verification only', tag: 'byeolcheonji-test' }, await vapidKeys());
      if (!encrypted.body?.byteLength) throw new Error('encryption_failed');
      const snapshot = await inventory(true);
      return { ok: true, probe: true, encryptionReady: true, sent: 0, checkedAt: snapshot.checkedAt,
        rooms: snapshot.rooms.length, partialRooms: snapshot.failedRooms.length, from: snapshot.from, to: snapshot.to };
    }
    const snapshot = await inventory(true), candidates = [], seenUpdates = [], projections = new Map();
    for (const row of subscribers) {
      const filterKey = `${row.filters.dateMode}/${row.filters.guests}`;
      if (!projections.has(filterKey)) projections.set(filterKey, availability(snapshot, row.filters));
      const plan = notificationPlan(snapshot, row.filters, row.seen, projections.get(filterKey));
      if (!plan.payload && JSON.stringify(plan.seen) !== JSON.stringify(row.seen)) {
        seenUpdates.push({ id: row.id, revision: row.revision, seen: plan.seen });
      } else if (plan.payload && row.ready && candidates.length < 20) candidates.push({ row, plan });
    }
    if (seenUpdates.length) await db`update byeolcheonji_internal.subscriptions s set seen=incoming.seen
      from jsonb_to_recordset(${db.json(seenUpdates)}::jsonb) as incoming(id uuid,revision bigint,seen jsonb)
      where s.id=incoming.id and s.revision=incoming.revision
        and exists(select 1 from byeolcheonji_internal.runtime r where r.singleton and r.delivery_token=${deliveryToken} and r.delivery_lease_until>now())`;
    const keys = candidates.length ? await vapidKeys() : null;
    let cursor = 0, sent = 0, failed = 0;
    async function sender() {
      while (cursor < candidates.length) {
        const { row, plan } = candidates[cursor++];
        // A settings change, deletion or member restriction between planning and delivery cancels it.
        const [current] = await db`update byeolcheonji_internal.subscriptions s set updated_at=now()
          where s.id=${row.id} and s.revision=${row.revision} and s.enabled
            and exists(select 1 from byeolcheonji_internal.runtime r where r.singleton and r.delivery_token=${deliveryToken} and r.delivery_lease_until>now())
            and exists(select 1 from auth.users u join public.profiles p on p.id=u.id
              left join public.user_private moderation on moderation.user_id=u.id
              where u.id=s.user_id and u.is_anonymous is not true and u.deleted_at is null
                and (u.banned_until is null or u.banned_until<=now())
                and (moderation.banned_until is null or moderation.banned_until<=now())) returning s.id`;
        if (!current) continue;
        let result = { accepted: false, gone: false, status: 0 };
        try { result = await deliver(row, plan.payload, keys); } catch { /* Later runs retry without forgetting the matches. */ }
        if (result.accepted) {
          sent++;
          await db`update byeolcheonji_internal.subscriptions set seen=${db.json(plan.seen)},failures=0,
            retry_after='-infinity',last_notified_at=now() where id=${row.id} and revision=${row.revision}`;
        } else if (result.gone) {
          await db`delete from byeolcheonji_internal.subscriptions where id=${row.id} and revision=${row.revision}`;
        } else {
          failed++;
          const wait = Math.min(3600, Math.max(result.status === 429 ? 300 : 120, 120 * 2 ** Math.min(row.failures, 5)));
          await db`update byeolcheonji_internal.subscriptions set failures=failures+1,retry_after=now()+${wait}*interval '1 second'
            where id=${row.id} and revision=${row.revision}`;
        }
      }
    }
    await Promise.all([sender(), sender(), sender(), sender()]);
    return { checked: subscribers.length, sent, failed, checkedAt: snapshot.checkedAt, partialRooms: snapshot.failedRooms.length };
  } finally {
    await db`update byeolcheonji_internal.runtime set delivery_lease_until='-infinity' where singleton and delivery_token=${deliveryToken}`;
  }
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin') || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
  if (ORIGINS.has(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-device-token', 'Access-Control-Max-Age': '600' });
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: ORIGINS.has(origin) ? 204 : 403, headers });
    const url = new URL(request.url), path = url.pathname.split('/').filter(Boolean).at(-1);
    if (path === 'tick' && request.method === 'POST') return Response.json(await tick(request), { headers });
    if (origin && !ORIGINS.has(origin)) throw new ApiError(403, 'origin_required', '오쭈다에서 이 기능을 열어 주세요.');
    const userId = await member(request);
    if (path === 'status' && request.method === 'GET') return Response.json(await status(userId, request), { headers });
    if (path === 'availability' && request.method === 'GET') {
      if (['dateMode', 'guests'].some(key => url.searchParams.getAll(key).length > 1)) throw new ApiError(400, 'invalid_filters', '조건을 다시 선택해 주세요.');
      let filters;
      try { filters = parseFilters({ dateMode: url.searchParams.get('dateMode') ?? 'all', guests: url.searchParams.get('guests') ?? 'all' }, { query: true }); }
      catch (error) { throw new ApiError(400, 'invalid_filters', (error as Error).message); }
      return Response.json(availability(await inventory(), filters), { headers });
    }
    if (!ORIGINS.has(origin)) throw new ApiError(403, 'origin_required', '오쭈다에서 알림을 설정해 주세요.');
    if (path === 'subscription' && request.method === 'POST') return Response.json(await subscribe(userId, request), { headers });
    if (path === 'subscription' && request.method === 'DELETE') {
      await db`delete from byeolcheonji_internal.subscriptions where user_id=${userId} and device_hash=${deviceHash(request)}`;
      return Response.json({ enabled: false }, { headers });
    }
    if (path === 'test' && request.method === 'POST') return Response.json(await testNotification(userId, request), { headers });
    throw new ApiError(404, 'not_found', '요청한 기능을 찾지 못했어요.');
  } catch (error) {
    const known = error instanceof ApiError;
    if (!known) console.error('Byeolcheonji request failed', error instanceof Error ? error.name : 'UnknownError');
    if (known && error.retryAfter) headers['Retry-After'] = String(error.retryAfter);
    return Response.json({ error: known ? error.message : '서버 연결이 지연됐어요. 잠시 뒤 다시 시도해 주세요.',
      code: known ? error.code : 'service_unavailable', ...(known && error.retryAfter ? { retryAfter: error.retryAfter } : {}) },
      { status: known ? error.status : 503, headers });
  }
});
