import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("repair", Path(__file__).resolve().parents[1] / "ops/automatic-repair.py")
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class RepairDeploymentTests(unittest.TestCase):
    def test_function_fix_is_parsed_and_transaction_is_owned_by_deployer(self):
        statements, functions = repair.validate_sql("""begin;
          create or replace function public.fixture_value() returns integer
          language sql security invoker set search_path='' as $$select 1$$;
          revoke all on function public.fixture_value() from public;
          grant execute on function public.fixture_value() to authenticated;
          commit;""")
        self.assertEqual(len(statements), 3)
        self.assertEqual(functions, {("public", "fixture_value")})

    def test_live_data_credentials_and_transaction_escape_are_rejected(self):
        for sql in ["delete from public.members", "truncate public.members", "drop table public.members",
                    "commit; select 1", "select pg_read_file('/etc/passwd')", "alter role postgres password 'x'",
                    "alter table public.members disable row level security", "create table auth.intruder(a int)",
                    "grant all on table public.members to anon", "do $$begin execute 'delete from public.members'; end$$",
                    "create or replace function ojjuda_ops.fake() returns int language sql as $$select 1$$",
                    "alter table public.members add column x int default public.side_effect()"]:
            with self.subTest(sql=sql), self.assertRaises(repair.Hold):
                repair.validate_sql(sql)

    def test_only_same_repository_successful_exact_repair_pr_can_deploy(self):
        source, candidate = "a" * 40, "b" * 40
        run = {"id": 12, "name": "Application regression checks", "path": ".github/workflows/regression.yml",
               "event": "pull_request", "conclusion": "success", "run_attempt": 1,
               "head_sha": candidate, "head_branch": "codex/feedback-fix-10", "head_repository": {"full_name": repair.REPOSITORY}}
        pr = {"state": "open", "title": "Verified application repair", "head": {"sha": candidate,
              "ref": run["head_branch"], "repo": {"full_name": repair.REPOSITORY}}, "base": {"ref": "main", "sha": source}}
        self.assertEqual(repair.provenance({"workflow_run": run}, lambda _: [pr]), (candidate, source, "12"))
        for changes in [{"conclusion": "failure"}, {"run_attempt": 2}, {"event": "push"},
                        {"head_repository": {"full_name": "untrusted/fork"}}, {"head_branch": "feature/x"}]:
            with self.assertRaises(repair.Hold):
                repair.provenance({"workflow_run": {**run, **changes}}, lambda _: [pr])
        with self.assertRaises(repair.Hold):
            repair.provenance({"workflow_run": run}, lambda _: [{**pr, "title": "unreviewed"}])

    def test_multipart_preserves_source_bytes_and_jwt_setting(self):
        body, content_type = repair.multipart({"entrypoint_path": "index.ts", "verify_jwt": True}, [("index.ts", b"export const x=1;\n")])
        self.assertIn(b'"verify_jwt": true', body)
        self.assertIn(b'filename="index.ts"', body)
        self.assertIn(b"export const x=1;\n", body)
        self.assertTrue(content_type.startswith("multipart/form-data; boundary="))


if __name__ == "__main__":
    unittest.main()
