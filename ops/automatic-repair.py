"""Trusted deployer. Never import/execute candidate Python, JS, shell or tests.

Only the isolated private publisher can mint the normal automatic-repair PR.
This second boundary accepts same-repository, single-parent repair commits after
the exact PR regression run succeeds. Production credentials stay in this job.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
import uuid

from pglast import parse_sql
from pglast.stream import RawStream

REPOSITORY = "ojjuda-note/ojjuda-note.github.io"
PROJECT = "ziezbdjofcugznowiuda"
SHA = re.compile(r"[a-f0-9]{40}\Z")
MIGRATION = re.compile(r"supabase/migrations/(\d{14})_feedback_fix_([1-9]\d*)(?:_[a-z0-9_]+)?\.sql\Z")
EDGE = re.compile(r"supabase/functions/([a-z][a-z0-9_-]*)/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(?:ts|js|mjs)\Z")
PLAN = Path("backend-repair-plan.json")
RECEIPT = Path("backend-repair-receipt.json")


class Hold(Exception):
    pass


def require(condition, reason):
    if not condition:
        raise Hold(reason)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise Hold("upstream_redirect_rejected")


def request(url, token, method="GET", data=None, content_type="application/json"):
    require(url.startswith(("https://api.github.com/repos/" + REPOSITORY + "/",
                            "https://api.supabase.com/v1/projects/" + PROJECT + "/")), "invalid_destination")
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json",
               "User-Agent": "ojjuda-verified-repair"}
    if data is not None:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, headers=headers, method=method, data=data)
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=60) as response:
            body = response.read(8 * 1024 * 1024 + 1)
            require(len(body) <= 8 * 1024 * 1024, "upstream_response_too_large")
            return json.loads(body) if body else None
    except Hold:
        raise
    except Exception:
        # Never log upstream error bodies, headers, SQL or credentials.
        raise Hold("deployment_api_unavailable") from None


def git(*args, directory="candidate"):
    try:
        return subprocess.check_output(["git", "-C", directory, *args],
            timeout=20, stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        raise Hold("candidate_source_unavailable") from None


def read_candidate(name):
    require(re.fullmatch(r"[A-Za-z0-9_./-]+", name) is not None
            and not any(x in ("", ".", "..") or x.startswith(".") for x in name.split("/")), "unsafe_source_path")
    file = Path("candidate") / name
    require(not any(p.is_symlink() for p in [file, *file.parents]) and file.is_file()
            and file.stat().st_nlink == 1 and file.stat().st_size <= 2 * 1024 * 1024, "unsafe_source_file")
    return file.read_bytes()


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, (tuple, list)):
        for child in value:
            yield from walk(child)


def app_schema(schema):
    return schema == "public" or bool(re.fullmatch(r"ojjuda_(?!ops$)[a-z0-9_]+", schema or ""))


def validate_sql(sql):
    """Parse statements; allow additive DDL and function fixes, never live DML.

    Function bodies are not executed by deployment. Their actual behavior must
    pass private independent review and before/after/security regressions.
    """
    require(len(sql.encode()) <= 200_000, "migration_too_large")
    require(not re.search(r"\b(?:dblink|pg_read_file|pg_read_binary_file|pg_write_file|lo_import|lo_export|http_get|http_post|net\s*\.|vault\s*\.|ojjuda_ops\s*\.|pg_authid|pg_shadow)\b", sql, re.I), "protected_database_capability")
    try:
        statements = [raw.stmt for raw in parse_sql(sql)]
    except Exception:
        raise Hold("invalid_migration_sql") from None
    require(bool(statements), "empty_migration")
    # The trusted connection owns the transaction, including rollback.
    if type(statements[0]).__name__ == "TransactionStmt":
        require(len(statements) > 2 and statements[0].kind.name in ("TRANS_STMT_BEGIN", "TRANS_STMT_START")
                and type(statements[-1]).__name__ == "TransactionStmt"
                and statements[-1].kind.name == "TRANS_STMT_COMMIT", "migration_transaction_control")
        statements = statements[1:-1]
    allowed = {"CreateFunctionStmt", "AlterFunctionStmt", "IndexStmt", "CreateStmt", "AlterTableStmt", "GrantStmt", "CommentStmt"}
    functions = set()
    for stmt in statements:
        kind = type(stmt).__name__
        require(kind in allowed, "migration_requires_data_or_policy_review")
        tree = stmt(skip_none=True)
        for node in walk(tree):
            if node.get("@") == "RangeVar":
                require(app_schema(node.get("schemaname")), "migration_requires_qualified_app_schema")
            if node.get("@") == "FuncCall" and kind != "CreateFunctionStmt":
                names = [x.get("sval") for x in node.get("funcname", [])]
                require(names in (["now"], ["pg_catalog", "now"], ["pg_catalog", "gen_random_uuid"]), "ddl_expression_requires_review")
        if kind == "CreateFunctionStmt":
            names = [x.sval for x in stmt.funcname]
            require(len(names) == 2 and app_schema(names[0]) and not stmt.is_procedure, "protected_database_function")
            options = {x.defname: x.arg for x in stmt.options}
            require(getattr(options.get("language"), "sval", None) in ("sql", "plpgsql"), "unsupported_function_language")
            functions.add(tuple(names))
        if kind == "AlterFunctionStmt":
            names = [x.sval for x in stmt.func.objname]
            require(len(names) == 2 and app_schema(names[0]), "protected_database_function")
            functions.add(tuple(names))
        if kind == "AlterTableStmt":
            require(all(x.subtype.name in {"AT_AddColumn", "AT_AddConstraint", "AT_ValidateConstraint", "AT_EnableRowSecurity", "AT_ForceRowSecurity"} for x in stmt.cmds), "destructive_table_change")
        if kind == "IndexStmt":
            require(not stmt.concurrent and not stmt.indexParams is None, "unsupported_index_operation")
        if kind == "GrantStmt":
            require(stmt.objtype.name == "OBJECT_FUNCTION" and not stmt.grant_option, "table_or_role_privilege_change")
            for obj in stmt.objects:
                names = [x.sval for x in obj.objname]
                require(len(names) == 2 and app_schema(names[0]), "protected_database_function")
                functions.add(tuple(names))
            require(all(x.rolename in ("anon", "authenticated", "service_role") or x.roletype.name == "ROLESPEC_PUBLIC" for x in stmt.grantees), "unexpected_grantee")
        if kind == "CommentStmt":
            require(stmt.objtype.name in ("OBJECT_FUNCTION", "OBJECT_TABLE", "OBJECT_COLUMN", "OBJECT_INDEX"), "protected_comment_target")
    return [RawStream()(stmt) for stmt in statements], functions


def provenance(event, get):
    run = event.get("workflow_run", {})
    sha, branch = run.get("head_sha", ""), run.get("head_branch", "")
    require(run.get("name") == "Application regression checks"
            and run.get("path") == ".github/workflows/regression.yml"
            and run.get("event") == "pull_request" and run.get("conclusion") == "success"
            and run.get("run_attempt") == 1 and SHA.fullmatch(sha)
            and re.fullmatch(r"codex/feedback-fix-[1-9]\d{0,19}", branch)
            and run.get("head_repository", {}).get("full_name") == REPOSITORY, "unverified_repair_origin")
    prs = get(f"commits/{sha}/pulls")
    matches = [p for p in prs if p.get("state") == "open" and p.get("head", {}).get("sha") == sha
               and p.get("head", {}).get("ref") == branch
               and p.get("head", {}).get("repo", {}).get("full_name") == REPOSITORY
               and p.get("base", {}).get("ref") == "main"
               and p.get("title") == "Verified application repair"]
    require(len(matches) == 1, "unverified_repair_pull_request")
    base = matches[0]["base"]["sha"]
    require(SHA.fullmatch(base), "invalid_source_base")
    return sha, base, str(run["id"])


def prepare():
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY and os.environ.get("GITHUB_EVENT_NAME") == "workflow_run"
            and os.environ.get("GITHUB_RUN_ATTEMPT") == "1", "invalid_runtime_identity")
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    token = os.environ.get("GH_READ_TOKEN", "")
    sha, base, ci = provenance(event, lambda path: request(f"https://api.github.com/repos/{REPOSITORY}/{path}", token))
    require(git("rev-parse", "HEAD") == sha and git("rev-list", "--parents", "-n", "1", "HEAD") == f"{sha} {base}"
            and git("rev-parse", "HEAD", directory="trusted") == base, "source_changed")
    names = git("diff", "--name-only", base, sha).splitlines()
    require(1 <= len(names) <= 24 and all(not x.startswith((".github/", "ops/", "supabase/functions/feedback-codex/")) for x in names), "protected_deployment_change")
    modes = git("diff", "--raw", "--no-abbrev", base, sha)
    require(all(re.match(r":(?:000000|100644) 100644 [a-f0-9]{40} [a-f0-9]{40} [AM]\t", line) for line in modes.splitlines()), "unsafe_source_modes")
    migrations, slugs, hashes = [], set(), {}
    for name in names:
        if not name.startswith("supabase/"):
            continue
        sql, edge = MIGRATION.fullmatch(name), EDGE.fullmatch(name)
        require(sql or (edge and edge.group(1) != "feedback-codex"), "protected_backend_path")
        data = read_candidate(name)
        hashes[name] = hashlib.sha256(data).hexdigest()
        if sql:
            require(git("ls-tree", base, "--", name) == "", "existing_migration_changed")
            validate_sql(data.decode("utf-8"))
            migrations.append(name)
        else:
            slugs.add(edge.group(1))
    # Check every credential before making any change.
    require(not migrations or os.environ.get("SUPABASE_DB_PASSWORD"), "database_deployment_credential_missing")
    require(not slugs or os.environ.get("SUPABASE_ACCESS_TOKEN"), "server_deployment_credential_missing")
    plan = {"version": 1, "candidate_commit": sha, "source_commit": base, "ci_run_id": ci,
            "migrations": sorted(migrations), "functions": sorted(slugs), "hashes": hashes}
    PLAN.write_text(json.dumps(plan))
    PLAN.chmod(0o600)
    print(f"Verified backend repair: {len(migrations)} migrations; {len(slugs)} server functions.")


def multipart(metadata, files):
    boundary = "ojjuda" + uuid.uuid4().hex
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n'.encode() + json.dumps(metadata).encode() + b"\r\n"]
    for name, content in files:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + content + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), "multipart/form-data; boundary=" + boundary


def bundle_functions(plan, call):
    if not plan["functions"]:
        return []
    deployed = {x["slug"]: x for x in call("functions")}
    files = []
    for filename in git("ls-files", "supabase/functions").splitlines():
        # Existing shared imports are bundled as source, never executed here.
        files.append((filename, read_candidate(filename)))
    require(sum(len(data) for _, data in files) <= 8 * 1024 * 1024, "server_bundle_too_large")
    bundles = []
    for slug in plan["functions"]:
        old = deployed.get(slug, {"name":slug,"status":"ACTIVE","version":0,"verify_jwt":True,"import_map":False})
        require(old and old.get("status") == "ACTIVE" and isinstance(old.get("verify_jwt"), bool), "server_baseline_unavailable")
        entry = f"supabase/functions/{slug}/index.ts"
        if not (Path("candidate") / entry).exists():
            entry = f"supabase/functions/{slug}/index.js"
        require((Path("candidate") / entry).is_file(), "server_entrypoint_missing")
        metadata = {"name": old["name"], "entrypoint_path": entry, "verify_jwt": old["verify_jwt"]}
        if old.get("import_map"):
            map_name=Path(old.get("import_map_path", "")).name
            require(map_name in ("deno.json", "import_map.json", "imports.json"), "server_import_map_requires_configuration")
            map_path=f"supabase/functions/{slug}/{map_name}"
            require((Path("candidate") / map_path).is_file(), "server_import_map_requires_configuration")
            metadata["import_map_path"]=map_path
        body, content_type = multipart(metadata, files)
        bundle = call(f"functions/deploy?slug={slug}&bundleOnly=1", "POST", body, content_type)
        require(bundle.get("slug") == slug and re.fullmatch(r"[a-f0-9]{64}", bundle.get("ezbr_sha256", "")), "server_bundle_unverified")
        bundle["version"] = old["version"] + 1
        bundle["verify_jwt"] = old["verify_jwt"]
        bundles.append(bundle)
    return bundles


def security_snapshot(connection):
    return {row[0]: tuple(row[1:]) for row in connection.execute("""
      select n.nspname||'.'||c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relowner, c.relacl::text
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind in ('r','p') and (n.nspname='public' or n.nspname like 'ojjuda_%')
    """).fetchall()}


def apply_migrations(connection, plan):
    before = security_snapshot(connection)
    function_security = """select p.oid::regprocedure::text,p.prosecdef,p.proconfig,p.proowner,
        exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
               where a.grantee=0 and a.privilege_type='EXECUTE')
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=%s and p.proname=%s"""
    for name in plan["migrations"]:
        raw = read_candidate(name).decode("utf-8")
        statements, functions = validate_sql(raw)
        version = MIGRATION.fullmatch(name).group(1)
        prior = connection.execute("select statements from supabase_migrations.schema_migrations where version=%s", (version,)).fetchone()
        if prior:
            require(prior[0] == [raw], "migration_history_conflict")
            continue
        original = {key: {row[0]: row[1:] for row in connection.execute(function_security, key).fetchall()} for key in functions}
        for statement in statements:
            connection.execute(statement)
        for schema, function in functions:
            for signature, definer, config, owner, public_execute in connection.execute(function_security, (schema, function)).fetchall():
                old = original[(schema, function)].get(signature)
                require(not definer or any(x.startswith("search_path=") and "$user" not in x for x in (config or [])), "definer_search_path_missing")
                require(not public_execute or (old and old[3]), "public_function_access_broadened")
                require(not old or (definer == old[0] and owner == old[2]), "function_privilege_regression")
        connection.execute("insert into supabase_migrations.schema_migrations(version,name,statements) values(%s,%s,%s)",
                           (version, Path(name).stem[15:], [raw]))
    after = security_snapshot(connection)
    for table, old in before.items():
        new = after.get(table)
        require(new is not None and (not old[0] or new[0]) and (not old[1] or new[1])
                and new[2:] == old[2:], "database_security_regression")
    require(all(value[0] for key, value in after.items() if key not in before), "new_table_requires_rls")
    connection.execute("notify pgrst, 'reload schema'")


def deploy():
    plan = json.loads(PLAN.read_text())
    require(git("rev-parse", "HEAD") == plan["candidate_commit"], "source_changed")
    for name, digest in plan["hashes"].items():
        require(hashlib.sha256(read_candidate(name)).hexdigest() == digest, "candidate_content_changed")
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    call = lambda endpoint, method="GET", data=None, content_type="application/json": request(
        f"https://api.supabase.com/v1/projects/{PROJECT}/{endpoint}", token, method, data, content_type)
    bundles = bundle_functions(plan, call)  # Compile all before any production write.
    if plan["migrations"]:
        import psycopg
        # A single transaction rolls back all SQL if any application/check fails.
        with psycopg.connect(host="aws-0-ap-northeast-2.pooler.supabase.com", port=5432,
                user=f"postgres.{PROJECT}", dbname="postgres", password=os.environ["SUPABASE_DB_PASSWORD"],
                sslmode="require", connect_timeout=15) as connection:
            connection.execute("set local lock_timeout='5s'")
            connection.execute("set local search_path=pg_catalog")
            connection.execute("set local statement_timeout='60s'")
            connection.execute("select pg_advisory_xact_lock(70477001)")
            apply_migrations(connection, plan)
    if bundles:
        call("functions", "PUT", json.dumps(bundles).encode())
        live = {x["slug"]: x for x in call("functions")}
        for bundle in bundles:
            actual = live.get(bundle["slug"], {})
            require(actual.get("status") == "ACTIVE" and actual.get("version") == bundle["version"]
                    and actual.get("ezbr_sha256") == bundle["ezbr_sha256"]
                    and actual.get("verify_jwt") == bundle["verify_jwt"], "server_deployment_unverified")
    RECEIPT.write_text(json.dumps({"version": 1, "deployed": True,
        "candidate_commit": plan["candidate_commit"], "source_commit": plan["source_commit"],
        "ci_run_id": plan["ci_run_id"], "verified_files": plan["hashes"]}, indent=2))
    print("Backend repair deployment verified.")


if __name__ == "__main__":
    try:
        {"prepare": prepare, "deploy": deploy}[sys.argv[1]]()
    except Hold as error:
        print("Backend repair held: " + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Backend repair held: deployment_failed; no completion claimed.", file=sys.stderr)
        sys.exit(1)
