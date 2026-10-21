'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { audit, inspect, statements, repositoryAudit } = require('./data-api-migration-grants.cjs');
const file = '20261021000000_example.sql';
const contract = { 'public.example': { migration: file, reason: 'Member-owned example.', grants: { anon: [], authenticated: ['select', 'update(body)'], service_role: [] } } };
const valid = `create table public.example (id uuid, body text);
alter table public.example enable row level security;
revoke all on public.example from public, anon, authenticated;
grant select, update(body) on public.example to authenticated;`;
const check = (sql, expected = contract) => audit({ [file]: sql }, expected).errors;
const fails = (sql, pattern, expected = contract) => assert.match(check(sql, expected).join('\n'), pattern);
assert.deepEqual(check(valid), []);
fails(valid.replace('grant select, update(body)', 'grant select'), /explicit privileges/);
fails(valid.replace('grant select, update(body)', 'grant all'), /explicit privileges/);
fails(valid.replace('grant select, update(body)', 'grant all(body)'), /Unsupported ALL\(column\)/);
fails(valid.replace(' to authenticated', ' to anon'), /explicit privileges/);
fails(valid.replace('enable row level security', 'disable row level security'), /must enable RLS/);
fails(valid + '\nalter table if exists public.example disable row level security;', /must enable RLS/);
fails(valid + '\nalter table example disable row level security;', /schema-qualify RLS/);
fails(valid + '\nalter table public.example enable row level security, disable row level security;', /schema-qualify RLS/);
assert.deepEqual(check(valid.replace('alter table public.example', 'alter table if exists only public.example')), []);
fails(valid.replace(/grant select, update\(body\).+;/, ''), /explicit privileges/);
fails(valid.replace('public.example (', 'example ('), /schema-qualify/);
fails(valid + '\ncreate table public.unreviewed(id uuid);', /needs a reviewed access contract/);
fails(valid, /stale contract/, { ...contract, 'public.stale': contract['public.example'] });
for (const decoy of [
  '-- grant select, update(body) on public.example to authenticated;',
  '/* outer /* nested */ grant select, update(body) on public.example to authenticated; */',
  "select 'grant select, update(body) on public.example to authenticated;';",
  "do $body$ begin execute 'grant select, update(body) on public.example to authenticated;'; end $body$;",
  'grant execute on function public.example() to authenticated;'
]) fails(valid.replace(/grant select, update\(body\).+;/, decoy), /explicit privileges/);
assert.deepEqual(check(valid.replaceAll('public.example', '"public"."example"')), []);
assert.deepEqual(check(valid.replace('grant select, update(body)', 'GRANT UPDATE (body), SELECT')), []);
fails(valid + '\ngrant select on public.example to public;', /anon explicit privileges/);
fails(valid + '\nrevoke select on public.example from authenticated;', /explicit privileges/);
fails(valid + '\ngrant all on all tables in schema public to authenticated;', /broad public-table ACL/);
fails(valid + '\ngrant select on example to anon;', /schema-qualify table ACLs/);
fails(valid + '\ngrant select on public.example, unqualified to anon;', /schema-qualify table ACLs/);
fails(valid + '\nalter default privileges in schema public grant all on tables to authenticated;', /default grants require manual review/);
// PostgreSQL table-level REVOKE also clears corresponding column grants.
fails(valid + '\nrevoke update on public.example from authenticated;', /explicit privileges/);
fails(valid + '\nrevoke update(body) on public.example from authenticated;', /explicit privileges/);
const privateContract = { 'public.example': { migration: file, reason: 'RPC-only.', grants: { anon: [], authenticated: [], service_role: [] } } };
const privateSql = 'create table public.example(id uuid); alter table public.example enable row level security; revoke all on table public.example from public, anon, authenticated, service_role;';
assert.deepEqual(check(privateSql, privateContract), []);
fails(privateSql.replace(', service_role', ''), /RPC-only table must explicitly revoke/, privateContract);
assert.equal(inspect(file, 'create table private.example(id uuid);').size, 0);
assert.equal(statements("select 'a; b'; /* ; */ do $$begin; end$$;").length, 2);
assert.equal(statements('select "identifier;with;semicolons";').length, 1);
assert.throws(() => statements('/* unfinished'), /Unterminated/);
assert.throws(() => statements('do $$unfinished'), /Unterminated/);
assert.throws(() => statements("select 'unfinished"), /Unterminated/);
assert.throws(() => statements('select "unfinished'), /Unterminated/);
const actual = repositoryAudit();
assert.deepEqual(actual.errors, []);
assert.ok(actual.count >= 16, 'Do not silently drop the historical public-table inventory.');
// Mutation checks against real migrations prevent accidentally blessing fixtures only.
const folder = path.join(__dirname, '../supabase/migrations');
const contracts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/data-api-table-contracts.json'), 'utf8'));
const originals = Object.fromEntries(fs.readdirSync(folder).filter(f => f.endsWith('.sql')).map(f => [f, fs.readFileSync(path.join(folder, f), 'utf8')]));
for (const [migration, removal] of [
  ['20261005123653_photo_ttang_stages.sql', /grant select on public\.photo_stages, public\.photo_admins to anon, authenticated;/i],
  ['20261004131220_life_donflow.sql', /grant update \(revision, payload, updated_at\) on public\.life_donflow_snapshots to authenticated;/i],
  ['20261009033125_world_board_comments.sql', /GRANT SELECT,INSERT,DELETE ON public\.world_board_comments TO authenticated;/i]
]) {
  assert.match(originals[migration], removal);
  const mutated = { ...originals, [migration]: originals[migration].replace(removal, '-- intentionally removed for negative test') };
  assert.ok(audit(mutated, contracts).errors.some(error => error.includes('explicit privileges')), migration);
}
console.log(`PASS: grant-guard positive/negative mutations and ${actual.count} real public-table creation contracts.`);
