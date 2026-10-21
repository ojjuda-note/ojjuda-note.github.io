'use strict';
// Deliberately bounded SQL guard, not a PostgreSQL parser or a live ACL audit.
// Only top-level, schema-qualified CREATE TABLE / GRANT / REVOKE / ALTER TABLE
// statements are interpreted. Strings, comments and function/DO bodies are opaque.
const fs = require('node:fs');
const path = require('node:path');
const roles = ['anon', 'authenticated', 'service_role'];
const dml = ['select', 'insert', 'update', 'delete'];
const ident = '(?:"(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)';
const qualified = `(${ident})\\s*\\.\\s*(${ident})`;
function name(value) { return value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value.toLowerCase(); }
function statements(sql) {
  let out = '', i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) { const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end; out += ' '; }
    else if (sql.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; } else i++;
      }
      if (depth) throw new Error('Unterminated SQL comment');
      out += ' ';
    } else if (sql[i] === "'") {
      i++; let closed = false;
      while (i < sql.length) {
        if (sql[i] === '\\') { i += 2; continue; }
        if (sql[i++] === "'") { if (sql[i] === "'") { i++; continue; } closed = true; break; }
      }
      if (!closed) throw new Error('Unterminated SQL string'); out += "'opaque'";
    } else if (sql[i] === '$' && /^\$(?:[a-z_][a-z0-9_]*)?\$/i.test(sql.slice(i))) {
      const tag = sql.slice(i).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)[0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end < 0) throw new Error('Unterminated dollar-quoted SQL body');
      i = end + tag.length; out += "'opaque'";
    } else if (sql[i] === '"') {
      let value = '"', closed = false; i++;
      while (i < sql.length) {
        const char = sql[i++]; value += char;
        if (char === '"') { if (sql[i] === '"') { value += sql[i++]; continue; } closed = true; break; }
      }
      if (!closed) throw new Error('Unterminated quoted identifier'); out += value;
    } else out += sql[i++];
  }
  const result = []; let start = 0, quote = false;
  for (let j = 0; j < out.length; j++) {
    if (out[j] === '"') { if (quote && out[j + 1] === '"') { j++; continue; } quote = !quote; }
    if (out[j] === ';' && !quote) { result.push(out.slice(start, j).trim()); start = j + 1; }
  }
  result.push(out.slice(start).trim());
  return result.filter(Boolean);
}
function commaList(text) {
  const parts = []; let depth = 0, start = 0, quote = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') { if (quote && text[i + 1] === '"') { i++; continue; } quote = !quote; }
    if (quote) continue;
    if (text[i] === '(') depth++;
    if (text[i] === ')') depth--;
    if (text[i] === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim()); return parts;
}
function privileges(text) {
  return commaList(text).flatMap(item => {
    const match = item.match(/^(all(?:\s+privileges)?|select|insert|update|delete|truncate|references|trigger|maintain)(?:\s*\(([^()]*)\))?$/i);
    if (!match) throw new Error(`Unsupported privilege syntax: ${item}`);
    const kind = match[1].toLowerCase();
    if (kind.startsWith('all')) {
      if (match[2]) throw new Error('Unsupported ALL(column) privilege syntax; list column privileges explicitly');
      return dml;
    }
    if (!dml.includes(kind)) return [];
    return match[2] ? commaList(match[2]).map(column => `${kind}(${name(column)})`) : [kind];
  });
}
function inspect(migration, sql) {
  const list = statements(sql), tables = new Map();
  for (const statement of list) {
    if (!/^create\s+(?:unlogged\s+)?table\b/i.test(statement)) continue;
    const match = statement.match(new RegExp(`^create\\s+(?:unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${qualified}(?=\\s|\\()`, 'i'));
    if (!match) throw new Error(`${migration}: schema-qualify CREATE TABLE; unsupported syntax needs explicit review`);
    if (name(match[1]) !== 'public') continue;
    const key = `public.${name(match[2])}`;
    if (tables.has(key)) throw new Error(`${migration}: duplicate CREATE TABLE ${key}`);
    tables.set(key, { migration, rls: false, acl: Object.fromEntries(['public', ...roles].map(role => [role, new Set()])), decisions: new Set() });
  }
  for (const statement of list) {
    const rls = statement.match(new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${qualified}\\s+(enable|disable)\\s+row\\s+level\\s+security$`, 'i'));
    if (rls) { const table = tables.get(`${name(rls[1])}.${name(rls[2])}`); if (table) table.rls = rls[3].toLowerCase() === 'enable'; }
    else if (/^alter\s+table\b[\s\S]*\b(?:enable|disable)\s+row\s+level\s+security/i.test(statement)) throw new Error(`${migration}: schema-qualify RLS changes; unsupported syntax needs explicit review`);
    const access = statement.match(/^(grant|revoke)\s+(.+?)\s+on\s+(?:table\s+)?(.+?)\s+(to|from)\s+(.+)$/is);
    if (/^alter\s+default\s+privileges\b[\s\S]*\bgrant\b/i.test(statement) && tables.size) throw new Error(`${migration}: default grants require manual review; use explicit per-table grants`);
    if (!access) continue;
    const broad = access[3].match(/^all\s+tables\s+in\s+schema\s+(.+)$/i);
    if (broad) {
      if (commaList(broad[1]).map(name).includes('public')) throw new Error(`${migration}: broad public-table ACL statements require explicit per-object review`);
      continue;
    }
    if (/^(function|procedure|routine|schema|sequence|database|language|type|domain|tablespace|all\s)/i.test(access[3])) continue;
    const targets = commaList(access[3]).map(value => { const match = value.match(new RegExp(`^${qualified}$`, 'i')); return match ? `${name(match[1])}.${name(match[2])}` : null; });
    if (targets.some(target => target === null)) throw new Error(`${migration}: schema-qualify table ACLs; unsupported syntax needs explicit review`);
    if (!targets.some(target => tables.has(target))) continue;
    if ((access[1].toLowerCase() === 'grant') !== (access[4].toLowerCase() === 'to')) throw new Error(`${migration}: invalid access statement`);
    const targetRoles = commaList(access[5]).map(name);
    if (targetRoles.some(role => !/^[a-z_][a-z0-9_$]*$/.test(role))) throw new Error(`${migration}: unsupported grant options or role syntax`);
    const grants = privileges(access[2]);
    for (const target of targets) {
      const table = tables.get(target); if (!table) continue;
      for (const role of targetRoles) {
        if (!table.acl[role]) continue;
        table.decisions.add(role);
        for (const privilege of grants) {
          if (access[1].toLowerCase() === 'grant') table.acl[role].add(privilege);
          else {
            // PostgreSQL table REVOKE also removes corresponding column ACLs.
            for (const held of table.acl[role]) {
              if (held === privilege || (!privilege.includes('(') && held.startsWith(privilege + '('))) table.acl[role].delete(held);
            }
          }
        }
      }
    }
  }
  return tables;
}
function audit(files, contracts) {
  const errors = [], found = new Map();
  for (const [migration, sql] of Object.entries(files)) {
    let tables; try { tables = inspect(migration, sql); } catch (error) { errors.push(error.message); continue; }
    for (const [table, state] of tables) {
      if (found.has(table)) { errors.push(`${table}: multiple creation migrations need an explicit replay test`); continue; }
      found.set(table, state);
      const contract = contracts[table];
      if (!contract) { errors.push(`${migration}: ${table} needs a reviewed access contract and role test before exposure`); continue; }
      if (contract.migration !== migration) errors.push(`${table}: creation migration differs from contract`);
      if (!state.rls) errors.push(`${migration}: ${table} must enable RLS in its creation migration`);
      if (!contract.reason || Object.keys(contract.grants || {}).sort().join(',') !== [...roles].sort().join(',')) errors.push(`${table}: document purpose and all three API role decisions`);
      for (const role of roles) {
        const actual = [...new Set([...state.acl.public, ...state.acl[role]])].sort();
        const expected = [...(contract.grants?.[role] || [])].sort();
        if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${migration}: ${table} ${role} explicit privileges [${actual}] != contract [${expected}]`);
      }
      if (!roles.some(role => (contract.grants?.[role] || []).length) && !['public', ...roles].every(role => state.decisions.has(role))) errors.push(`${table}: RPC-only table must explicitly revoke all API roles and PUBLIC`);
    }
  }
  for (const table of Object.keys(contracts)) if (!found.has(table)) errors.push(`${table}: stale contract, creation not found`);
  return { errors, count: found.size };
}
function repositoryAudit(root = path.join(__dirname, '..')) {
  const directory = path.join(root, 'supabase/migrations');
  const files = Object.fromEntries(fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort().map(file => [file, fs.readFileSync(path.join(directory, file), 'utf8')]));
  const contracts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/data-api-table-contracts.json'), 'utf8'));
  return audit(files, contracts);
}
module.exports = { statements, inspect, audit, repositoryAudit };
if (require.main === module) {
  const { errors, count } = repositoryAudit();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`PASS: ${count} public-table creation contracts, explicit DML grants and RLS; no live database inspected.`);
}
