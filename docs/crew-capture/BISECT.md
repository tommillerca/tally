# Source-based bisect order

History inspected in this checkout: `a918cc15` (v529 baseline) through `97197278` (HEAD). The plan's hash matches `463db1aa2741691ac3adbacafef536af87ed2bbe566357bb60f94aae9ada97e4`.

The order says “nine builds ... v530 to v539.” That inclusive range contains ten versions. Available history has nine release commits, v530 through v538. `version.json` says `tally-v538`; `git log --all --grep=v539` returns no commit. HEAD is a tooling-policy commit after v538, not a v539 build. Proposed deviation: test the nine available builds, retain v539 as unavailable, and obtain its exact commit before including it. No revision or deployment is invented.

Locations below refer to the named build's file and line, unless explicitly marked current. Inspect with `git show <commit>:<file>` or `git diff <commit>^ <commit> -- <file>`. No original checkout paths are used. All rankings are causal candidates from source, not confirmed player-visible culprits.

## Ordered candidates by symptom

| Order | Large member bars | Pets appearing lower | Missing step icons |
| --- | --- | --- | --- |
| 1 | v530: extra snapshot line on every plate | v530: extra opaque plate height can cover a pet whose bottom anchor stays fixed | v530: one stale/unknown racer suppresses every track and its icon |
| 2 | v533: root Dynamic Type and Crew text tokens reflow a fixed-height card | v533: scalable plate over fixed `bottom:56px` pet anchor | v538: viewport policy, zoom/viewport changes can expose reflow or clipping |
| 3 | v538: viewport policy and cumulative font-scale behavior | v538: viewport change can alter apparent layout and occlusion | v533: root font and row freshness text changes can reflow/clip the row |
| 4 | No other direct bar-layout change found | v536 only for a changed hand asset overlapping the pet, not a moved pet anchor | v535: cloud opt-out stops profile updates, feeding v530's stale-data condition |

Test v529 versus v530 first using identical fixtures. This is the earliest direct change capable of the bar report and the first source-proven all-icons suppression. Use both `fresh` and `one-stale`. Then compare v532 versus v533 at default and enlarged system text. Also compare v537 versus v538 on the operator's actual iOS viewport/zoom state. A desktop run at unchanged CSS width is insufficient to dismiss v538.

## All nine available builds

| Build and commit | Relevant changed location | Capability and test priority |
| --- | --- | --- |
| v530 `07384c7a` | `js/app.js:12442`, `:246`, `:13543`, `:13596`; `app.css:3431`, `:3466` | **First for bars and stale icons.** `crewCardHtml` adds `.cfan-snapshot` to every plate. `onlineLabel` defines freshness. `comparisonsFresh` uses `every`, and the template condition encloses the whole `.track`, including `.run`. Freshness text also becomes a full-width row and names wrap. Node fixture proof confirms five markers with all-fresh data and zero with just one stale/unknown racer. The pet's `bottom:56px` remains fixed, so plate encroachment is plausible, not proof of a lower anchor. |
| v531 `9117fa00` | `js/app.js:24473`; `server/src/index.js:2093` and new `server/src/schema-health.js` | Low for all three. Client change is a build marker; server changes concern schema health and migration/deploy checks. No Crew card, pet or step-icon template/CSS change found. Backend availability could affect whether a board loads, but does not explain five populated rows losing only icons in the fixture run. |
| v532 `0f860173` | `js/app.js:21191`, `:24473` | Low for all three. Captures the breed button before an `await`, plus a build marker. No Crew geometry/art change. Useful as the immediately pre-font-scale control for v533. |
| v533 `36d90490` | `app.css:71`, `:84`, `:3438`, `:3797`, `:3800`, `:3806`; unchanged anchors at `:3752` and `:3779` | **Second for bars/pets; third for icons.** Adds the shared rem tokens and `font:-apple-system-body` on `html`; switches plate name and small text from fixed px to tokens. Card remains 194 by 270px and pet remains bottom-anchored by 56px. A larger root font can increase the plate/card fraction and cover more pet. Race freshness text changes from 10.5px to `--fs-0`. `js/pets.js:353` is a comment update, not a pet transform. The other app changes are text tokens, Laboratory/recovery behavior and unrelated UI; no new Crew icon mount/composition change found. |
| v534 `7a2d9882` | `data/boneheadz.js:2279`; `js/app.js:1814`; `js/pets.js:49`, `:193` | Low for all three. Bumbleseal price/refund and copy changes; no pet artwork, crop, Crew plate or race marker geometry changes. Refund toast can temporarily obstruct a screenshot if applicable, so use a clean demo context and wait for overlays. Not evidence of a permanent lower pet position. |
| v535 `60e772fb` | `js/social.js:995`, `:1020`; `js/app.js:15260` | **Fourth for missing icons, indirectly.** Profile uploads now return early under `cloudOff`, including shared attempts. That can let snapshots age and trigger v530's fleet-wide suppression. It cannot move a pet or enlarge a plate directly. Fixtures isolate rendering from this transport behavior. Test the stale rendering locally; do not toggle production cloud state. Other changes affect accounting, recovery notices, future dates and GPS. |
| v536 `b152fd86` | `assets/bh/IL/IL10-1.png`, `IL10-2.png`, `IL17-1.png`, `IL17-2.png`, plus generated thumbnail tiers (binary files have no text line); `js/app.js:24521` | Very low for bars/all missing icons. Changes selected left-hand artwork registration, not pet layout or card dimensions. Potential visual overlap for members wearing those assets only; compare matching outfits if the first three candidates fail. Cannot explain every racer's absent `.run` node. No binary asset is edited by this lane. |
| v537 `9ab04074` | `js/db.js:1280`, `:1299`; `js/app.js:24521` | Low for all three. Changes file restore-point retention/recovery and adds a density measurement helper. The density work does not modify shipped Crew CSS. No Crew/pet/marker renderer changes found. Use as v538's immediate parent. |
| v538 `770e027b` | `index.html:5`; `js/app.js:11735`, `:11756`, `:24529`; `tests/fontscale-audit.mjs` | **Explicit live candidate for all three.** Removes `user-scalable=no` from the viewport meta tag. The root/type changes were introduced in v533 and remain in v538; this commit also adjusts font-scale testing. A viewport/zoom change can change available CSS geometry or appearance across the app. Actual behavior depends on the engine, system text size and gesture policy, including `app.css:121` touch-action. Do not dismiss it as unrelated to Crew. The app.js numeric-range changes are in metric details, not Crew. |

The post-v538 HEAD commit `97197278` changes shipping policy/tooling and an `assets/.DS_Store` file, not Crew rendering. It does not supply the missing v539 diff.

## Keep the bisect short and interpretable

1. Capture v529 and v530 with default text, identical fresh crew data, then repeat the step board with exactly one stale racer. Compare central member plate/card fractions, pet/plate overlap, and each step icon's actual box/opacity/ink/occlusion result.
2. Compare v532 and v533 at the same default text setting, then at the same enlarged system text setting. Record the computed root font and viewport in both. Use separate approved baselines for different text/device configurations.
3. Compare v537 and v538 on the reported phone/browser at the same initial scale, then reproduce the operator's zoom/system text state. Record `visualViewport.scale`, CSS viewport width, DPR and screenshot. Desktop emulation cannot establish native Dynamic Type or pinch behavior.
4. Only if those comparisons do not explain the report, test v535's stale-data precondition and v536's affected equipped assets. Retain v531/v532/v534/v537 in the full release list as controls with no identified direct geometry mechanism.

Do not combine source edits to “make the old build work” without reporting them. The operator can import this checkout's harness into their Node driver while serving a separate disposable revision for browser capture. Keep every runtime fixture path and output under operator control. No source fix, browser capture, commit, push or publication was performed here.
