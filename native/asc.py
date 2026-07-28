#!/usr/bin/env python3
"""App Store Connect helper for the Boneheadz TestFlight pipeline.

Why this exists: build-ios.sh used to archive, export and upload, then stop. A
build that uploads successfully but is never added to a distribution group is
invisible in TestFlight, which is exactly how build 11 (the first with the sleep
plugin) sat unused for three days while the phone kept showing build 10.

Usage:
  ./asc.py next                    # the next safe build number, derived from ASC
  ./asc.py list                    # every build + which groups can see it
  ./asc.py distribute <version>    # wait for processing, add to the internal group
  ./asc.py check                   # assert the invariants; non-zero exit if broken

Two failures this file exists to make impossible:

  1. Build 11 uploaded fine and was never added to a group, so it was invisible
     in TestFlight for three days while the phone showed build 10. The upload
     succeeding was mistaken for the build being available.
  2. The build number came from a hardcoded `sed 10 -> 11` in build-ios.sh, so a
     second run would have silently produced a duplicate.

So: `next` derives the number from App Store Connect rather than the local
project (the local file can lag behind what is already uploaded), and `check`
asserts the outcome that actually matters, which is that a tester can install
the thing. Both are wired into build-ios.sh, and check exits non-zero so a
broken release cannot report success.
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
    print(f'build {version} added to the internal group.')

    # ALSO distribute to every public-link group and submit for beta review.
    # This was a manual step for builds 16, 17 and 18: each time the postflight
    # correctly failed, and each time it was fixed by hand instead of here. The
    # public link is Tom's actual install path, so "internal only" means he
    # cannot install the build he just waited for.
    for g in call(f'/apps/{APP_ID}/betaGroups')['data']:
        a = g['attributes']
        if not a.get('publicLinkEnabled') or g['id'] == INTERNAL_GROUP:
            continue
        try:
            call(f"/betaGroups/{g['id']}/relationships/builds", 'POST',
                 {'data': [{'type': 'builds', 'id': b['id']}]})
            print(f"build {version} added to \"{a['name']}\" (the public-link group).")
        except SystemExit as e:
            print(f"  could not add to \"{a['name']}\": {e}")
        # An external group also gates downloads on review, so being in the group
        # is not enough on its own.
        sub = call(f"/builds/{b['id']}/betaAppReviewSubmission").get('data')
        state = (sub or {}).get('attributes', {}).get('betaReviewState')
        if state:
            print(f'  beta review already {state}')
        else:
            r = call('/betaAppReviewSubmissions', 'POST', {'data': {
                'type': 'betaAppReviewSubmissions',
                'relationships': {'build': {'data': {'type': 'builds', 'id': b['id']}}}}})
            print(f"  submitted for beta review: {r['data']['attributes'].get('betaReviewState')}")
    print('It appears in TestFlight within a few minutes.')


def cmd_next():
    """Next build number, from App Store Connect rather than the local project.

    The local pbxproj can lag behind what is already uploaded (a failed run, a
    build made on another machine), and Apple rejects a duplicate build number
    only after a full archive + upload. Asking ASC makes a collision impossible.
    """
    nums = [int(b['attributes']['version']) for b in builds(50)['data']
            if str(b['attributes'].get('version', '')).isdigit()]
    print(max(nums) + 1 if nums else 1)


def cmd_check():
    """Assert what actually matters: a tester can install the newest build.

    Exits non-zero on any broken invariant, so build-ios.sh cannot report success
    over a release nobody can see. This is the check that would have caught
    build 11 sitting in no group.
    """
    problems, notes = [], []
    d = builds(20)
    rows = [b for b in d['data'] if not b['attributes'].get('expired')]
    if not rows:
        raise SystemExit('CHECK FAILED: no live builds at all')

    group_names = {g['id']: g['attributes']['name'] for g in call(f'/apps/{APP_ID}/betaGroups')['data']}
    seen_by = {}
    for gid, name in group_names.items():
        for b in call(f'/betaGroups/{gid}/builds?limit=50')['data']:
            seen_by.setdefault(b['id'], []).append(name)

    newest = rows[0]
    v = newest['attributes']['version']
    if newest['attributes'].get('processingState') != 'VALID':
        notes.append(f'build {v} is still {newest["attributes"].get("processingState")}')
    if not seen_by.get(newest['id']):
        problems.append(f'build {v} is the newest live build and is in NO group: invisible in TestFlight')

    # any other processed build stranded with no group is a silent shipping failure
    for b in rows[1:]:
        if b['attributes'].get('processingState') == 'VALID' and not seen_by.get(b['id']):
            notes.append(f'build {b["attributes"]["version"]} is processed but in no group')

    # THE PUBLIC LINK IS THE REAL INSTALL PATH. Tom's own device enrolled through
    # it after his Inner Circle tester record was revoked, so "visible to Inner
    # Circle" can pass while he cannot install a thing. Build 16 hit exactly that:
    # in the internal group, absent from the public-link group, check green.
    # An EXTERNAL group also gates downloads on beta review, so being listed in
    # the group is not enough on its own.
    for g in call(f'/apps/{APP_ID}/betaGroups')['data']:
        a = g['attributes']
        if not a.get('publicLinkEnabled'):
            continue
        name = a['name']
        if name not in seen_by.get(newest['id'], []):
            problems.append(f'build {v} is NOT in "{name}", the group the public link '
                            f'({a.get("publicLink")}) serves: nobody using that link can install it')
            continue
        sub = call(f"/builds/{newest['id']}/betaAppReviewSubmission").get('data')
        state = (sub or {}).get('attributes', {}).get('betaReviewState')
        if state != 'APPROVED':
            notes.append(f'build {v} is in "{name}" but beta review is '
                         f'{state or "not submitted"}, so external testers stay on the last approved build')

    # A build in a group is still invisible to anyone who never accepted the
    # invite. This is not a footnote: it is the difference between "shipped" and
    # "Tom cannot install it", which is exactly what happened with build 12.
    # Every member of the INTERNAL group is a developer on this app, so any of
    # them stuck on INVITED is a real failure, not a note.
    internal_ok = False
    for gid, name in group_names.items():
        testers = call(f'/betaGroups/{gid}/betaTesters?limit=50')['data']
        states = [t['attributes'].get('state') for t in testers]
        is_internal = gid == INTERNAL_GROUP
        if testers and not any(s in ('INSTALLED', 'ACCEPTED') for s in states):
            problems.append(f'group "{name}" has {len(testers)} tester(s) but none accepted: {states}')
        for t in testers:
            if t['attributes'].get('state') == 'INVITED':
                who = t['attributes'].get('email')
                msg = f'{who} is still INVITED in "{name}" and cannot install anything'
                (problems if is_internal else notes).append(msg)
        if is_internal and any(s in ('INSTALLED', 'ACCEPTED') for s in states):
            internal_ok = True
    if not internal_ok:
        problems.append('nobody in the internal group can install: the build is effectively unshipped')

    for n in notes:
        print('  note: ' + n)
    if problems:
        for p in problems:
            print('  PROBLEM: ' + p)
        raise SystemExit('CHECK FAILED')
    print(f'check passed: build {v} is live and visible to {", ".join(seen_by[newest["id"]])}')


if __name__ == '__main__':
    cmds = ('list', 'distribute', 'next', 'check')
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        raise SystemExit(__doc__)
    if sys.argv[1] == 'list':
        cmd_list()
    elif sys.argv[1] == 'next':
        cmd_next()
    elif sys.argv[1] == 'check':
        cmd_check()
    else:
        if len(sys.argv) < 3:
            raise SystemExit('usage: asc.py distribute <version>')
        cmd_distribute(sys.argv[2])
