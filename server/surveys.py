#!/usr/bin/env python3
"""Read every in-app feedback survey response.

    ./surveys.py            # newest first
    ./surveys.py --emails   # just the addresses that opted in to updates

Source is the D1 `leads` table (schema.sql), written by POST /survey.
"""
import datetime
import json
import subprocess
import sys

SQL = ("SELECT id,label,name,email,email_optin,most_wanted,feedback,features,"
       "app_v,geo,ts FROM leads ORDER BY ts DESC")


def rows():
    out = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', 'bonez', '--remote', '--json', '--command', SQL],
        cwd=__file__.rsplit('/', 1)[0], capture_output=True, text=True)
    if '[' not in out.stdout:
        raise SystemExit(f'wrangler returned no JSON:\n{out.stdout}\n{out.stderr}')
    return json.loads(out.stdout[out.stdout.index('['):])[0]['results']


def main():
    rs = rows()
    if '--emails' in sys.argv:
        # Only opted-in addresses. Someone leaving an email without ticking the
        # box has not agreed to be mailed.
        for r in rs:
            if r.get('email') and r.get('email_optin'):
                print(r['email'])
        return
    print(f'{len(rs)} survey responses\n')
    for r in rs:
        when = datetime.datetime.fromtimestamp(r['ts'] / 1000).strftime('%Y-%m-%d %H:%M')
        who = r.get('label') or r.get('name') or 'anon'
        print(f"--- #{r['id']}  {when}  {who}  {r.get('app_v') or '?'}  {r.get('geo') or ''}")
        if r.get('email'):
            print(f"    email: {r['email']}  optin={r.get('email_optin')}")
        if r.get('features'):
            print(f"    uses:  {r['features']}")
        if r.get('most_wanted'):
            print(f"    WANTS: {r['most_wanted']}")
        if r.get('feedback'):
            print(f"    SAYS:  {r['feedback']}")
        print()


if __name__ == '__main__':
    main()
