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
