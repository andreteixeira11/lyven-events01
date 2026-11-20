#!/usr/bin/env python3
"""Corre SQL no projeto Supabase via Management API.

Uso: python3 scripts/sql.py "select 1"   |   python3 scripts/sql.py -f ficheiro.sql
Requer SUPABASE_ACCESS_TOKEN no ambiente.
"""
import json
import os
import sys
import urllib.error
import urllib.request

REF = "fmjgrewkknqvxqwkouqj"

def main() -> None:
    if len(sys.argv) >= 3 and sys.argv[1] == "-f":
        sql = open(sys.argv[2], encoding="utf-8").read()
    else:
        sql = " ".join(sys.argv[1:])
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"],
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        print(json.dumps(json.load(urllib.request.urlopen(req)), ensure_ascii=False, indent=1))
    except urllib.error.HTTPError as e:
        print("ERRO", e.code, e.read().decode())
        sys.exit(1)

if __name__ == "__main__":
    main()
