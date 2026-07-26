#!/usr/bin/env python3
"""App Store Connect helper for the Boneheadz TestFlight pipeline.

Why this exists: build-ios.sh used to archive, export and upload, then stop. A
build that uploads successfully but is never added to a distribution group is
invisible in TestFlight, which is exactly how build 11 (the first with the sleep
plugin) sat unused for three days while the phone kept showing build 10.

Usage:
  ./asc.py list                    # every build + which groups can see it
  ./asc.py distribute <version>    # wait for processing, add to the internal group
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

import jwt

KEY_ID = 'R6B586JNRN'
ISSUER = '4e28ee87-e98d-4a22-baef-dcf3a1941e59'
APP_ID = '6787813598'
INTERNAL_GROUP = '74bc19e1-5b07-40fe-bf09-091162d89478'   # "Inner Circle" (Tom + Cam)
API = 'https://api.appstoreconnect.apple.com/v1'


def token():
    key = open(os.path.expanduser(f'~/.appstoreconnect/private_keys/AuthKey_{KEY_ID}.p8')).read()
    now = int(time.time())
    return jwt.encode({'iss': ISSUER, 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'},
                      key, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})


def call(path, method='GET', body=None):
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors='replace')[:400]
        raise SystemExit(f'App Store Connect {e.code} on {method} {path}\n{detail}')


def builds(limit=10):
    return call(f'/builds?filter[app]={APP_ID}&limit={limit}&sort=-version&include=buildBetaDetail')


def find(version):
    for b in builds(20)['data']:
        if str(b['attributes'].get('version')) == str(version):
            return b
    return None


def cmd_list():
    d = builds(10)
    det = {x['id']: x['attributes'] for x in d.get('included', [])}
    group_names = {g['id']: g['attributes']['name']
                   for g in call(f'/apps/{APP_ID}/betaGroups')['data']}
    visible = {}
    for gid, name in group_names.items():
        for b in call(f'/betaGroups/{gid}/builds?limit=50')['data']:
            visible.setdefault(b['id'], []).append(name)
    print(f'{"BUILD":<7} {"PROCESSING":<12} {"INTERNAL":<24} {"GROUPS THAT CAN SEE IT"}')
    for b in d['data']:
        a = b['attributes']
        rel = (b.get('relationships', {}).get('buildBetaDetail') or {}).get('data')
        bd = det.get(rel['id'], {}) if rel else {}
        groups = visible.get(b['id']) or ['NONE — invisible in TestFlight']
        print(f'{a.get("version"):<7} {a.get("processingState"):<12} '
              f'{str(bd.get("internalBuildState")):<24} {", ".join(groups)}')


def cmd_distribute(version, timeout=1800):
    deadline = time.time() + timeout
    while True:
        b = find(version)
        # A build takes a minute or two to even appear after altool reports success,
        # so waiting for it to show up is part of the job, not an error.
        if not b:
            if time.time() > deadline:
                raise SystemExit(f'build {version} never appeared on App Store Connect')
            print(f'  build {version} has not appeared yet, waiting...', flush=True)
            time.sleep(30)
            continue
        state = b['attributes'].get('processingState')
        if state == 'VALID':
            break
        if state in ('INVALID', 'FAILED'):
            raise SystemExit(f'build {version} processing {state}; nothing to distribute')
        if time.time() > deadline:
            raise SystemExit(f'build {version} still {state} after {timeout}s; re-run distribute later')
        print(f'  build {version} is {state}, waiting...', flush=True)
        time.sleep(30)
    call(f'/betaGroups/{INTERNAL_GROUP}/relationships/builds', 'POST',
         {'data': [{'type': 'builds', 'id': b['id']}]})
    print(f'build {version} added to the internal group. It appears in TestFlight within a few minutes.')
    print('External testers still need a separate beta-review submission.')


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in ('list', 'distribute'):
        raise SystemExit(__doc__)
    if sys.argv[1] == 'list':
        cmd_list()
    else:
        if len(sys.argv) < 3:
            raise SystemExit('usage: asc.py distribute <version>')
        cmd_distribute(sys.argv[2])
