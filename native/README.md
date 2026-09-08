# Boneheadz Gym: native iOS shell

Capacitor wrapper around the PWA with a custom Swift HealthKit plugin
(`ios/App/App/HealthPlugin.swift`). Native users get the Pokemon-Go-style
flow: Connect Apple Health → iOS permission sheet → done. Syncing then
happens automatically on every launch/resume (no shortcut, no clipboard).

## Build

**First time?** See `SETUP.md` for the two Apple-ID gated steps (install Xcode,
enroll in the Developer Program) and run `bash preflight.sh` to check readiness.

```
cd native
./build-www.sh          # copy the web app into www/
npx cap sync ios
npx cap open ios        # opens Xcode
```

For an App Store archive and upload, select the self-checking submission mode:

```
cd native
SUBMISSION=1 ./build-ios.sh
```

This mode applies the store flag only to the copied `native/www/js/app.js`,
temporarily replaces the Capacitor config with a generated local-bundle config,
syncs iOS, and checks the copied iOS resources before archiving, then checks the
archive before exporting. Both checks require a submission marker matching the
app.js SHA256, STORE_BUILD=true, no server key, and clean reachable store copy.
An EXIT trap restores the tracked config even when a later step fails.
`SUBMISSION=0 ./build-ios.sh` explicitly selects the internal/TestFlight path.
An unset, empty or invalid SUBMISSION refuses before any build or network work.
Archives and exports live under `ios/App/build/submission/` or
`ios/App/build/internal/`. Old `ios/App/build/App.xcarchive` and `build/export/`
artifacts are unclassified and must not be used for submission.

The script still uploads and distributes when Tom runs it. It is not a local
preview command. See [the submission checklist](../docs/SUBMISSION-CHECKLIST.md)
for prerequisites and the unproven first-device acceptance steps.

### Submission prep: bundling www instead of the remote shell

The remote shell (`server.url` in `capacitor.config.json`) stays wired for
testing speed until submission (Tom's ruling, `docs/HANDOFF-CODEX-2026-09-05.md`
#6). `build-store.sh` prepares the bundled path without touching that file:

```
cd native
./build-store.sh
```

This runs `STORE_BUILD=1 ./build-www.sh`, writes `www/submission.json`, and writes
`native/capacitor.config.store.json`: a copy of `capacitor.config.json` with
the `server` key removed, so Capacitor falls back to serving the local `www`
bundle instead of the live site. Both `www/` and `capacitor.config.store.json`
are gitignored and regenerated on every run; `capacitor.config.json` in the
repo is never modified.

To verify the prepared bundle without archiving (no Xcode/signing needed):
- `grep 'const STORE_BUILD' www/js/app.js` should read `= true;`
- `node ../tests/store-copy-lint.mjs` (checks the shared source + this build
  script's sed line; the same gating logic ships into the bundle)
- Serve `www/` with any static file server and load it in a browser: it should
  boot with no server.url and no service worker (the native shell doesn't
  register one; Capacitor serves files locally either way).

In Xcode: select your team under Signing & Capabilities, pick your iPhone or a
simulator, press Run. HealthKit capability + entitlements are already wired.
Note: HealthKit provisioning is unreliable on a free personal team; the paid
Developer Program is the clean path (and is required for push + TestFlight).

- Simulator testing: DEBUG builds expose `Health.debugWrite({steps, activeKcal})`
  from the JS console to inject samples (simulators have no real Health data).
- Distribution to Cam and friends: Apple Developer Program ($99/yr) +
  TestFlight. The web PWA remains the free instant-access channel.

## What is native vs web

- `js/native.js` detects Capacitor; all game/nutrition code is shared.
- Web keeps the Shortcut bridge; native replaces it entirely.
- Web deploys keep working exactly as before; rebuild www + sync to pick
  up web changes in the shell.
