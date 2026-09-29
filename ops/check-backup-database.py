"""Check the saved password once, without backups, mutations or secret output."""
import os
import sys

import psycopg


def main():
    password = os.environ.get("SUPABASE_DB_PASSWORD", "")
    if not password:
        print("Database password check: saved password is missing")
        return 1
    try:
        # Explicit fields avoid confusing password errors with URL encoding.
        with psycopg.connect(
            host="aws-0-ap-northeast-2.pooler.supabase.com", port=5432,
            user="postgres.ziezbdjofcugznowiuda", dbname="postgres",
            password=password, sslmode="require", connect_timeout=15,
            application_name="ojjuda-backup-password-check",
            autocommit=True,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                if cursor.fetchone() != (1,):
                    print("Database password check: unexpected query result")
                    return 1
    except psycopg.Error as exc:
        # Only fixed labels can reach public logs; never print the exception.
        message = str(exc).lower()
        if exc.sqlstate == "28P01" or any(value in message for value in (
            "password authentication failed", "sasl authentication failed",
            "wrong password", "too many authentication errors",
        )):
            print("Database password check: AUTHENTICATION_REJECTED")
        elif "tenant or user not found" in message:
            print("Database password check: POOLER_USER_NOT_FOUND")
        elif any(value in message for value in ("timeout", "timed out")):
            print("Database password check: CONNECTION_TIMEOUT")
        elif any(value in message for value in ("name or service", "translate host", "name resolution")):
            print("Database password check: HOSTNAME_ERROR")
        else:
            # A fixed vocabulary helps identify an unfamiliar protocol failure
            # without echoing arbitrary server messages, credentials or URLs.
            vocabulary = ("authentication", "password", "sasl", "scram", "ssl",
                          "certificate", "network", "refused", "closed", "permission",
                          "pg_hba", "invalid", "fatal", "pool", "circuit", "breaker")
            clues = [word for word in vocabulary if word in message]
            print("Database password check: CONNECTION_ERROR; categories=" + ",".join(clues))
        return 1
    print("Database password check: VERIFIED (encrypted connection and SELECT 1 succeeded)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
