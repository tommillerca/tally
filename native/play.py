#!/usr/bin/env python3
"""Google Play publishing for Boneheadz Gym. The Android twin of asc.py.

Exists because Android repeated the exact iOS failure: versionCode 5 was built on
Jul 24, never uploaded, and nobody noticed for four days while testers sat on 4.
Building is not shipping. `check` asserts the track actually serves the build and
exits non-zero, so a release cannot silently orphan itself again.

Usage:
  ./play.py login <client_secret_*.json>   # one time, browser sign-in
  ./play.py check                          # what the internal track actually serves
  ./play.py upload <path-to-aab>           # upload + roll to internal testing + verify

Auth. Two ways in, tried in this order:

  1. OAuth as you (preferred, and the only option under an org that enforces
     iam.managed.disableServiceAccountKeyCreation, which nomad91.com does).
     GCP console, project boneheadz-503722:
       a. Enable the "Google Play Android Developer API".
       b. OAuth consent screen: Internal (or External + add yourself as a test
          user if your Play Console login is a different Google account).
       c. Credentials -> Create credentials -> OAuth client ID -> Desktop app.
          Download the JSON.
       d. ./play.py login ~/Downloads/client_secret_*.json
     Nothing to grant in Play Console: you are already the account owner.
     Stores a refresh token at ~/.config/boneheadz/play-oauth.json

  2. Service account key at ~/.config/boneheadz/play-service-account.json,
     invited in Play Console with "Release to testing tracks". Blocked by org
     policy today; kept because the policy may not apply on another machine.
"""
import http.server
import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PKG = 'com.boneheadz.gym'
TRACK = 'internal'
CFG = os.path.expanduser('~/.config/boneheadz')
KEY_PATH = os.path.join(CFG, 'play-service-account.json')
OAUTH_PATH = os.path.join(CFG, 'play-oauth.json')
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3'
SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
TOKEN_URL = 'https://oauth2.googleapis.com/token'


def _post_form(url, fields):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(),
                                 headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        raise SystemExit(f'OAuth {e.code} on {url}\n{e.read().decode()[:500]}')


def cmd_login(client_json):
    """Loopback OAuth flow. Opens a browser, catches the code, saves the refresh token."""
    if not os.path.exists(client_json):
        raise SystemExit(f'no such client secret JSON: {client_json}')
    blob = json.load(open(client_json))
    cli = blob.get('installed') or blob.get('web')
    if not cli:
        raise SystemExit('that JSON has no "installed" client. Create an OAuth '
                         'client ID of type "Desktop app" and download that one.')
    cid, csec = cli['client_id'], cli['client_secret']

    got = {}
    state = secrets.token_urlsafe(16)

    class Catch(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            got.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            ok = 'code' in got and got.get('state') == state
            self.wfile.write(
                b'<body style="font:16px system-ui;padding:3rem;background:#2A2D28;color:#EDE7DC">'
                + (b'<h2>Signed in.</h2><p>Close this tab and go back to the terminal.</p>'
                   if ok else b'<h2>Sign-in failed.</h2><p>Check the terminal.</p>')
                + b'</body>')

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(('127.0.0.1', 0), Catch)
    redirect = f'http://127.0.0.1:{srv.server_port}'
    url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode({
        'client_id': cid, 'redirect_uri': redirect, 'response_type': 'code',
        'scope': SCOPE, 'access_type': 'offline', 'prompt': 'consent', 'state': state,
    })
    print('Opening your browser to sign in. Approve the Play publishing scope.')
    print(f'If it does not open, paste this:\n  {url}\n')
    subprocess.Popen(['open', url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    srv.handle_request()
    srv.server_close()

    if got.get('error'):
        raise SystemExit(f'sign-in refused: {got["error"]}')
    if 'code' not in got:
        raise SystemExit('no authorization code came back')
    if got.get('state') != state:
        raise SystemExit('state mismatch, aborting')

    tok = _post_form(TOKEN_URL, {
        'code': got['code'], 'client_id': cid, 'client_secret': csec,
        'redirect_uri': redirect, 'grant_type': 'authorization_code',
    })
    if 'refresh_token' not in tok:
        raise SystemExit('Google returned no refresh token. Revoke this app at '
                         'https://myaccount.google.com/permissions and run login again.')
    os.makedirs(CFG, exist_ok=True)
    with open(OAUTH_PATH, 'w') as f:
        json.dump({'client_id': cid, 'client_secret': csec,
                   'refresh_token': tok['refresh_token']}, f, indent=2)
    os.chmod(OAUTH_PATH, 0o600)
    print(f'saved {OAUTH_PATH}')
    print('verifying against the live Play track ...')
    cmd_check()


def token():
    if os.path.exists(OAUTH_PATH):
        c = json.load(open(OAUTH_PATH))
        return _post_form(TOKEN_URL, {
            'client_id': c['client_id'], 'client_secret': c['client_secret'],
            'refresh_token': c['refresh_token'], 'grant_type': 'refresh_token',
        })['access_token']
    if os.path.exists(KEY_PATH):
        import jwt
        sa = json.load(open(KEY_PATH))
        now = int(time.time())
        assertion = jwt.encode({
            'iss': sa['client_email'], 'scope': SCOPE, 'aud': TOKEN_URL,
            'iat': now, 'exp': now + 3600,
        }, sa['private_key'], algorithm='RS256')
        return _post_form(TOKEN_URL, {
            'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion': assertion,
        })['access_token']
    raise SystemExit(
        f'Not signed in. No {OAUTH_PATH} and no {KEY_PATH}.\n'
        'Run:  ./play.py login <client_secret_*.json>\n'
        'See the setup steps in the docstring at the top of this file.')


def call(path, method='GET', body=None, tok=None, raw=None, ctype='application/json'):
    url = path if path.startswith('http') else API + path
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, method=method, data=data, headers={
        'Authorization': 'Bearer ' + tok,
        **({'Content-Type': ctype} if data is not None else {}),
    })
    try:
        with urllib.request.urlopen(req) as r:
            out = r.read()
            return json.loads(out) if out else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f'Play API {e.code} on {method} {url}\n{e.read().decode()[:500]}')


def track_state(tok):
    """What the internal track serves right now, via a throwaway edit."""
    edit = call(f'/applications/{PKG}/edits', 'POST', {}, tok)
    try:
        return call(f'/applications/{PKG}/edits/{edit["id"]}/tracks/{TRACK}', tok=tok)
    finally:
        try:
            call(f'/applications/{PKG}/edits/{edit["id"]}', 'DELETE', tok=tok)
        except SystemExit:
            pass


def cmd_check(expect=None):
    tok = token()
    t = track_state(tok)
    codes = []
    for rel in t.get('releases', []):
        codes += [int(c) for c in rel.get('versionCodes', [])]
        print(f'  release "{rel.get("name", "?")}"  status={rel.get("status")}  '
              f'versionCodes={rel.get("versionCodes")}')
    if not codes:
        raise SystemExit('CHECK FAILED: the internal track serves NO build')
    newest = max(codes)
    print(f'internal track serves versionCode {newest}')
    if expect is not None and newest != int(expect):
        raise SystemExit(f'CHECK FAILED: expected versionCode {expect}, track serves {newest}')
    return newest


def cmd_upload(aab):
    if not os.path.exists(aab):
        raise SystemExit(f'no such AAB: {aab}')
    tok = token()
    before = None
    try:
        before = max(int(c) for r in track_state(tok).get('releases', []) for c in r.get('versionCodes', []))
    except Exception:
        pass
    print(f'internal track currently serves: {before}')

    edit = call(f'/applications/{PKG}/edits', 'POST', {}, tok)
    eid = edit['id']
    print(f'edit {eid}: uploading {os.path.getsize(aab) / 1048576:.1f} MB ...')
    up = call(f'{UPLOAD}/applications/{PKG}/edits/{eid}/bundles?uploadType=media',
              'POST', tok=tok, raw=open(aab, 'rb').read(), ctype='application/octet-stream')
    vc = int(up['versionCode'])
    print(f'uploaded versionCode {vc}')

    call(f'/applications/{PKG}/edits/{eid}/tracks/{TRACK}', 'PUT', {
        'track': TRACK,
        'releases': [{'versionCodes': [str(vc)], 'status': 'completed'}],
    }, tok)
    call(f'/applications/{PKG}/edits/{eid}:commit', 'POST', {}, tok)
    print(f'committed to the {TRACK} track')

    # Postflight: assert the track really serves it. Uploading is not shipping.
    time.sleep(4)
    cmd_check(expect=vc)
    print(f'OK: testers on {TRACK} now get versionCode {vc}')


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in ('check', 'upload', 'login'):
        raise SystemExit(__doc__)
    if sys.argv[1] == 'check':
        cmd_check()
    elif sys.argv[1] == 'login':
        if len(sys.argv) < 3:
            raise SystemExit('usage: play.py login <client_secret_*.json>')
        cmd_login(sys.argv[2])
    else:
        if len(sys.argv) < 3:
            raise SystemExit('usage: play.py upload <path-to-aab>')
        cmd_upload(sys.argv[2])
