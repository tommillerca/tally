# Permission strings: current vs proposed

Draft for Tom's sign-off. Source of truth is the code, not the existing copy.
Nothing here has been applied; `native/ios/App/App/Info.plist` is untouched.

| Key | Current string | Proposed string | Code path |
|---|---|---|---|
| `NSCameraUsageDescription` | "Boneheadz Gym uses the camera to scan barcodes and read nutrition labels so you can log food fast. Images stay on this phone." | No change. Matches the code. | `js/scanner.js` (live `getUserMedia` barcode scan); `js/app.js:9126` `<input type="file" capture="environment">` (label photo capture) |
| `NSHealthShareUsageDescription` | "Boneheadz Gym reads your steps, active energy, exercise minutes, resting heart rate, heart rate variability, and sleep so your skeleton earns XP, eggs, and Boneyard progress from real activity." | "Boneheadz Gym reads your activity, heart, and body metrics (steps, energy burned, exercise time, distance, heart rate, sleep, workouts, and body measurements) so your skeleton earns XP and progress from real activity." | `native/ios/App/App/HealthPlugin.swift:175-184`: the read set is a superset requested once, wider than the current string names it does not mention distance (walk/run/cycle/swim), flights climbed, heart rate, walking HR average, VO2 max, respiratory rate, oxygen saturation, body mass, height, body fat %, lean body mass, or workouts, all of which are in `read`. |
| `NSHealthUpdateUsageDescription` | "Boneheadz Gym does not write to Health during normal use. Developer testing tools can add sample step data only when explicitly activated." | No change. Matches the code. | `HealthPlugin.swift:186-188`: `write` is empty except `#if DEBUG` (steps, active energy only); no Release build ever writes. |
| `NSLocationWhenInUseUsageDescription` | "Boneheadz uses your location to draw the Boneyard map and place nearby spawns and dens. Location is used on this phone only, never stored, never uploaded." | "Boneheadz uses your location to draw the Boneyard map and place nearby spawns, dens, and Spires. Spawns and dens stay on this phone. Claiming a Spire sends its map cell (about 2.2 km across, not your exact position) to the server." | `js/spires.js:21,61` (`SPIRE_CELL_DEG`, `cellOf`): Spires are placed on a ~2.2 km grid. `js/social.js:705-708` `claimSpireRemote` PUTs `{name, lat, lng}` (the spire's cell-quantized coordinate) to the server on claim. The current string's "never uploaded" is not accurate for this one action; every other map feature (spawns, dens, the compass) stays local, per `docs/ASC-SUBMISSION.md` section 1.3. |
| `NSMotionUsageDescription` | "Boneheadz uses the compass to show which way you are facing on the Boneyard map." | No change. Matches the code. | `js/app.js:20385-20424` (`deviceorientation`/`webkitCompassHeading`, requested inside the map's own tap per iOS 13+ rules) |
| `NSPhotoLibraryUsageDescription` | "Boneheadz Gym can read a nutrition label from a photo you choose. Photos stay on this phone." | No change. Matches the code. | `js/app.js:9127` `<input type="file" accept="image/*">` (label photo picker, no capture) |
| Notifications (no Info.plist key) | N/A - iOS shows its own system alert with no app-provided string | N/A | `js/notify.js` wraps `@capacitor/local-notifications`' `requestPermissions()`; requested from Settings' notification toggles, never at boot. Powers the 19:00 reminder, streak save, siege warning, and friend nudges - all opt-in, all local-only (no push service). |

## Notes

- Two strings (Health share, location) undersell or overclaim what the code
  actually does; the rest already match. This table is the fix list, not a
  finding that everything is wrong.
- The Health share rewording trades an itemized list (which will drift again
  the next time a read type is added) for a category description, matching
  how `HealthPlugin.swift`'s comment frames it: "Full superset requested ONCE
  so future features never need a new prompt."
- The location rewording is the one with a real accuracy gap: "never
  uploaded" is false the moment a player claims a Spire. Tom should decide
  the exact wording; the table gives the fact (2.2 km cell, not exact
  position, only on an explicit claim tap) to work from.
