const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const users = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users (id uuid primary key, is_anonymous boolean default false);
    create table public.profiles (id uuid primary key, nickname text);
    create table public.test_bans (id uuid primary key);
    create table public.test_blocks (a uuid, b uuid);
    create function public.is_banned(uuid) returns boolean language sql as $$select exists(select 1 from public.test_bans where id=$1)$$;
    create function public.blocked_between(uuid,uuid) returns boolean language sql as $$select exists(select 1 from public.test_blocks where a=$1 and b=$2 or a=$2 and b=$1)$$;
    create function public.mask_banned(text) returns text language sql as $$select replace($1, 'badword', '❤️❤️')$$;
    grant usage on schema public to anon,authenticated,service_role;
    create schema ojjuda_arcade_internal;
    create sequence ojjuda_arcade_internal.rooms_room_no_seq start 1001;
    grant usage on schema ojjuda_arcade_internal to authenticated;
  `);
  // The One Card migration extends the existing arcade directory. Keep the
  // unrelated providers empty unless a directory regression explicitly seeds one.
  for (const game of ['poker', 'bang', 'roulette']) await db.exec(`
    create schema ojjuda_${game}_internal;
    grant usage on schema ojjuda_${game}_internal to authenticated;
    create function ojjuda_${game}_internal.arcade_rooms() returns jsonb language sql stable
      as $$select '{"ok":true,"rooms":[]}'::jsonb$$;
    revoke all on function ojjuda_${game}_internal.arcade_rooms() from public,anon;
    grant execute on function ojjuda_${game}_internal.arcade_rooms() to authenticated;
  `);
  await db.exec(`create function public.arcade_general_extra_rooms() returns jsonb language sql stable
    as $$select '{"ok":true,"rooms":[]}'::jsonb$$`);
  for (const [i, id] of users.entries()) {
    await db.query('insert into auth.users(id,is_anonymous) values($1,$2)', [id, i === 7]);
    await db.query('insert into public.profiles values($1,$2)', [id, ['하나', '두리', '세나', '네로', '다온', '여섯', '제한회원', '익명'][i]]);
  }
  await db.query('insert into public.test_bans values($1)', [users[6]]);
  const migrations = path.join(__dirname, '../supabase/migrations');
  const onecardMigrations = fs.readdirSync(migrations).filter(n => /_onecard_.*\.sql$/.test(n)).sort();
  for (const migration of onecardMigrations) await db.exec(fs.readFileSync(path.join(migrations, migration), 'utf8'));
  const { createHandler } = await import('../supabase/functions/onecard/handler.mjs');
  let seed = 209385;
  const handler = createHandler({
    env: name => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'server-only' })[name],
    random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296),
    fetchImpl: async (url, options) => {
      if (url.endsWith('/auth/v1/user')) {
        const id = options.headers.authorization.slice(7);
        return new Response(JSON.stringify({ id, is_anonymous: id === users[7] }), { status: users.includes(id) ? 200 : 401 });
      }
      const p = JSON.parse(options.body);
      try {
        const result = await db.transaction(async tx => {
          await tx.exec('set local role service_role');
          return tx.query('select public.onecard_online_service($1,$2,$3,$4,$5,$6,$7,$8) value',
            [p.p_actor, p.p_action, p.p_room ?? null, p.p_code ?? null, p.p_request ?? null, p.p_expected ?? null, p.p_options ?? {}, p.p_next ?? null]);
        });
        return new Response(JSON.stringify(result.rows[0].value));
      } catch (error) { return new Response(JSON.stringify({ message: error.message }), { status: 400 }); }
    },
  });
  async function call(id, body, options = {}) {
    const response = await handler(new Request('https://edge.invalid', {
      method: 'POST', headers: { authorization: `Bearer ${id}`, origin: 'https://ojjuda.kr', ...options.headers },
      body: JSON.stringify(body),
    }));
    return { httpStatus: response.status, ...await response.json() };
  }
  return { db, call, users, handler, close: () => db.close() };
}

module.exports = { fixture, users };
