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

For an App Store archive, build the web bundle with the store flag enabled:

```
cd native
STORE_BUILD=1 ./build-www.sh
npx cap sync ios
```

The flag is applied only to the copied `native/www/js/app.js`. The shared web
source and ordinary internal native builds keep the beta feedback surfaces.

### Submission prep: bundling www instead of the remote shell

The remote shell (`server.url` in `capacitor.config.json`) stays wired for
testing speed until submission (Tom's ruling, `docs/HANDOFF-CODEX-2026-09-05.md`
#6). `build-store.sh` prepares the bundled path without touching that file:

```
cd native
./build-store.sh
```

This runs `STORE_BUILD=1 ./build-www.sh` and writes
`native/capacitor.config.store.json`: a copy of `capacitor.config.json` with
the `server` key removed, so Capacitor falls back to serving the local `www`
bundle instead of the live site. Both `www/` and `capacitor.config.store.json`
are gitignored and regenerated on every run; `capacitor.config.json` in the
repo is never modified.

At submission time, to actually archive against the bundle:

```
cd native
./build-store.sh
cp capacitor.config.json capacitor.config.json.bak   # restore after archiving
cp capacitor.config.store.json capacitor.config.json
npx cap sync ios
# ... archive in Xcode ...
mv capacitor.config.json.bak capacitor.config.json    # put the remote shell back
```

To verify the bundle before archiving (no Xcode/signing needed):
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
