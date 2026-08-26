#!/usr/bin/env python3
"""Refuse to LOOK at the iOS simulator when it is not running what you think.

WHY THIS IS A HOOK AND NOT A NOTE. There was already a memory saying to verify on
the live build rather than a local server. It was read and not obeyed, twice. On
2026-08-26 the installed build pointed at a dev server that had been killed hours
earlier; a WKWebView serves a dead origin out of its own NetworkCache, so the app
still opened and looked normal, and an hour went into two "missing" Boneyard
icons that were simply files that cache had never fetched. Tom: "this isn't the
first time youve tested with the simulator on an old broken build (which is crazy
btw) make sure you are always testing on the most recent build otherwise wtf is
the point" and then, on being told a memory already covered it: "what is your
bulletproof fix for the future?"

A memory depends on Claude remembering. A script depends on Claude choosing to
run it. Neither is bulletproof. This runs whether Claude thinks of it or not,
which is the same reason capture-feedback.py exists.

WHAT IT BLOCKS, and the distinction is the whole design: it blocks OBSERVING the
simulator (screenshots, taps, swipes, recordings) because that is where false
conclusions are drawn. It never blocks FIXING it: install, launch, terminate,
boot and the build itself all pass through, or the hook would trap you in the bad
state it is complaining about.

Exit 0 = allowed. Exit 2 = blocked, with the reason on stderr.
"""
import json, os, subprocess, sys, time

RAW = sys.stdin.read()
try:
    ev = json.loads(RAW or "{}")
except Exception:
    sys.exit(0)                      # never break the session on a parse failure

tool = ev.get("tool_name", "")
inp = ev.get("tool_input", {}) or {}

# Actions that MOVE you toward a good state, or are inert. Always allowed.
FIXING = {"launch", "install", "terminate", "boot", "shutdown", "uninstall", "detach"}
# Actions where you form a belief about the app from what you see or touch.
OBSERVING = {"screenshot", "tap", "swipe", "touch_path", "touch2_path", "text",
             "button", "attach", "open_url"}

observes = False
if tool.endswith("__control") and "iOS_Simulator" in tool:
    action = (inp.get("action") or "").strip()
    if action in FIXING:
        sys.exit(0)
    observes = action in OBSERVING
elif tool == "Bash":
    cmd = inp.get("command", "") or ""
    if "sim-verify" in cmd:
        sys.exit(0)                  # the check itself
    if "simctl io" in cmd and ("screenshot" in cmd or "recordVideo" in cmd):
        observes = True

if not observes:
    sys.exit(0)

# A recent pass is good enough; this must not add a curl to every tap.
STAMP = "/tmp/.sim-freshness-ok"
try:
    if time.time() - os.path.getmtime(STAMP) < 180:
        sys.exit(0)
except OSError:
    pass

root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
check = os.path.join(root, "tally", "native", "sim-verify.sh")
if not os.path.exists(check):
    sys.exit(0)                      # not this project, or not installed yet

try:
    r = subprocess.run(["bash", check], capture_output=True, text=True, timeout=45)
except Exception:
    sys.exit(0)                      # a broken checker must not block all work

if r.returncode == 0:
    open(STAMP, "w").close()
    sys.exit(0)

sys.stderr.write(
    "BLOCKED: the simulator is not running what you think it is.\n\n"
    + (r.stdout or "") + (r.stderr or "")
    + "\nYou were about to read a result off this build and believe it.\n"
      "Reinstall pointed at the build you mean to test, then look. Installing,\n"
      "launching and building are NOT blocked by this hook.\n"
      "  tally/native/sim-verify.sh            # what is it running?\n"
      "  tally/native/sim-verify.sh v455       # expect a specific build\n")
sys.exit(2)
