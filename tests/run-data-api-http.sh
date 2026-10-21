#!/usr/bin/env bash
# No hosted project, login, database password, repository secret, or paid service.
# All raw native logs/status (which may contain local keys) stay on this runner.
set -euo pipefail
umask 077
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BASE=${RUNNER_TEMP:?Set RUNNER_TEMP to an authorized temporary directory}
ROOT="$BASE/ojjuda-data-api-http"
export SUPABASE_HOME="$ROOT/home" SUPABASE_EXPERIMENTAL_STACK=1
export SUPABASE_TELEMETRY_DISABLED=1 SUPABASE_NO_UPDATE_NOTIFIER=1
CLI="$ROOT/bin/supabase"

verify_stopped() {
  python3 - "$ROOT" <<'PY'
import json, pathlib, socket, sys
root=pathlib.Path(sys.argv[1]).resolve()
alive=[]
for p in pathlib.Path('/proc').iterdir():
    if not p.name.isdigit(): continue
    try:
        exe=(p/'exe').resolve()
        cmd=(p/'cmdline').read_bytes()
        is_ours=exe.is_relative_to(root) or (str(root/'home').encode() in cmd)
        if is_ours and b'--cleanup' not in cmd and int(p.name)!=__import__('os').getpid():
            # A reaped service is gone; a zombie cannot serve requests.
            status=(p/'status').read_text()
            if '\nState:\tZ' not in status: alive.append(p.name)
    except (OSError, ValueError): pass
ports=root/'ports.json'
open_ports=[]
if ports.exists():
    for host,port in json.loads(ports.read_text()):
        try:
            with socket.create_connection((host,port),timeout=1): open_ports.append(port)
        except OSError: pass
if alive or open_ports:
    print('FAIL: isolated services still running; process count',len(alive),'open port count',len(open_ports))
    sys.exit(1)
print('PASS: isolated native processes stopped and recorded service ports closed')
PY
}

cleanup() {
  if [[ -x "$CLI" && -d "$ROOT/project" ]]; then
    (cd "$ROOT/project" && timeout 90 "$CLI" stack stop > "$ROOT/stop.log" 2>&1) || true
  fi
  verify_stopped
}

if [[ ${1:-} == --cleanup ]]; then cleanup; exit; fi
[[ ${OJJUDA_LOCAL_API_TEST:-} == 1 ]] || { echo 'Explicit local test opt-in is required'; exit 1; }
[[ ! -e "$ROOT" ]] || { echo 'Refusing to reuse an existing test directory'; exit 1; }
command -v psql >/dev/null || { echo 'PostgreSQL client is required on the runner'; exit 1; }
mkdir -p "$ROOT/bin" "$ROOT/project"
trap 'code=$?; trap - EXIT; cleanup || code=1; exit "$code"' EXIT
trap 'exit 130' INT TERM

# Fixed official release and independently checked release/checksums.txt digest.
VERSION=2.121.0
ARCHIVE=supabase_${VERSION}_linux_amd64.tar.gz
curl --fail --silent --show-error --location --retry 2 --max-time 120 \
  "https://github.com/supabase/cli/releases/download/v${VERSION}/${ARCHIVE}" -o "$ROOT/$ARCHIVE"
printf '%s  %s\n' '4b481189efbdc57cf2d37bdee5f1a0d29574314398564b32a6dfb76c0fcf275f' "$ROOT/$ARCHIVE" | sha256sum --check --status
tar -xzf "$ROOT/$ARCHIVE" -C "$ROOT/bin" supabase
[[ $("$CLI" --version) == "$VERSION" ]]
echo 'PASS: official Supabase CLI v2.121.0 archive SHA-256 verified'

cd "$ROOT/project"
"$CLI" init > "$ROOT/init.log" 2>&1
python3 - <<'PY'
from pathlib import Path
p=Path('supabase/config.toml')
s=p.read_text()
needle='# auto_expose_new_tables = true'
assert needle in s, 'Pinned CLI default config changed unexpectedly'
s=s.replace(needle,'auto_expose_new_tables = false')
p.write_text(s)
PY
# Native runtime binds localhost. Unneeded services and all external email are excluded.
if ! timeout 600 "$CLI" stack start --runtime native --exclude realtime,functions,studio,mail,analytics,pooler --eager > "$ROOT/start.log" 2>&1; then
  python3 - "$ROOT/start.log" <<'PY'
import json,pathlib,re,sys
# Only structured error messages, not raw logs/status/env/header output.
for line in pathlib.Path(sys.argv[1]).read_text(errors='replace').splitlines():
    try: obj=json.loads(line)
    except ValueError: continue
    err=obj.get('error',{})
    if isinstance(err,dict) and isinstance(err.get('message'),str):
        msg=err['message']
        msg=re.sub(r'(?i)(?:postgres(?:ql)?|https?)://[^\s)]+','[URL redacted]',msg)
        msg=re.sub(r'\b(?:eyJ|sb_secret_|sb_publishable_)[A-Za-z0-9_.-]+','[credential redacted]',msg)
        if not re.search(r'(?i)(authorization|password|jwt_secret|service_role_key)',msg): print('Native startup:',msg[:1200])
print('FAIL: native startup did not complete; raw logs are intentionally not published')
PY
  exit 1
fi
"$CLI" stack status --output-format json > "$ROOT/status.json"
node - "$ROOT" "$REPO" <<'JS'
const fs=require('node:fs'), path=require('node:path'), {spawnSync}=require('node:child_process');
const [root,repo]=process.argv.slice(2);
const raw=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'));
const report=raw.data || raw;
const env=report.env;
if(!env || report.runtime!=='native' || report.readiness!=='ready') throw new Error('Local native stack is not ready');
const {localUrl}=require(path.join(repo,'tests/data-api-http-access.test.cjs'));
const api=localUrl(env.API_URL,'API'), db=localUrl(env.DB_URL,'DB');
const ports=new Map();
for(const service of report.services || []) for(const ep of Object.values(service.endpoints || {})) {
  if(!['127.0.0.1','::1'].includes(ep.address)) throw new Error('Non-loopback service endpoint');
  ports.set(`${ep.address}:${ep.port}`,[ep.address,ep.port]);
}
ports.set(`api:${api.port}`,[api.hostname,Number(api.port)]);
ports.set(`db:${db.port}`,[db.hostname,Number(db.port)]);
fs.writeFileSync(path.join(root,'ports.json'),JSON.stringify([...ports.values()]));
// Never put local keys into GitHub's persistent env/output, argv, artifacts, or console.
const result=spawnSync(process.execPath,[path.join(repo,'tests/data-api-http-access.test.cjs')],{
  stdio:'inherit', timeout:300000,
  env:{PATH:process.env.PATH, OJJUDA_LOCAL_API_TEST:'1', SUPABASE_URL:env.API_URL,
    SUPABASE_DB_URL:env.DB_URL, SUPABASE_ANON_KEY:env.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:env.SERVICE_ROLE_KEY}
});
if(result.error) throw new Error('Local HTTP test process failed or timed out');
process.exitCode=result.status ?? 1;
JS
