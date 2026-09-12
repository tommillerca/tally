# Name fitting work order: advisory implementation report

Frozen plan SHA256: `dde4ec749fb21dfa1a34e231ef97bd71f1a3dd24ae3e6df187d62e09282d17d8` (verified).

Acceptance is **not proven**. Both browser runs were denied a local listener by the execution sandbox (`listen EPERM: operation not permitted 127.0.0.1`). No rendered width, rectangle, or screenshot was obtained here. Independent browser execution and visual review are required before acceptance. No commit, push, publication, build bump, validation change, or stored-name transformation was performed.

## Display policy

Names wrap without a line cap. Existing fonts and sizes remain in use. Ordinary long names can use a second line; pathological names can use more. Headings, rows, fan cards and Today captions can grow vertically. The tradeoffs are taller cards and rows, more scrolling, and potentially less content in the first viewport. `overflow-wrap:anywhere` also accommodates an unbroken 128-character suffix. No name ellipsis exception or new length limit was introduced.

All CSS changes are appended after the exact inherited `app.css` prefix. The existing prefix was compared byte-for-byte with HEAD. Three source-level uppercase conversions (settled winner, map owner, Pit introduction) now use CSS text transformation instead, preserving the original full string in the DOM. New greeting/recipient classes scope the wrapping rules. A demo-only, webdriver-only seam opens existing rare production renderers; it does not replace their HTML with test fixtures.

## Source census

Searches covered `social.displayName`, `socialMe`, `me.name`, `onbName`, `buildDisplayName`, `nameWithAlias`, `esc(...name)`, owner/keeper names, leaderboard and race rows, fighter names, gift senders, share and Studio modules. The browser log also prints matching source lines. The source search is an inventory aid, not a claim of automatic semantic coverage.

| Source in this checkout | Name surface | Geometry guard |
| --- | --- | --- |
| `js/app.js:renderToday` | Signed-in identity | `.hero-name` |
| `renderBonehead` | Identity shared by hub tabs | `.hub-name` |
| `renderSettings` | Crew handle | `#crewName` |
| `renderFriends` | Signed-in greeting | `.crew-greeting b` |
| `nameWithAlias`, `crewCardHtml` | Other players' view of an identity on fan cards | `.cfan-card.feat .cfan-plate b` |
| `paintFan` | Selected member | `#cfanView .pname-iso` |
| `requestRowsHtml` | Incoming and outgoing requests | Both `.fl-sect` name spans |
| `hydratePodium` | Level podium and position sentence | `.pod-name`, `#lbYouAre span` |
| `openLeaderboard` | Full level leaderboard | `.lb-who b` |
| `hydrateRace`, `social.raceStanding` | Current lanes, standing, gap, previous champion | Race name, summary, gap and champion selectors |
| `raceLanesHtml`, `hydrateRaceResult` | Settled winner and results lanes inside News | `#raceResultCard` heading and lanes |
| `hydrateNewcomers` | Suggested players | `#newcomersList .t3-tx b` |
| `openFriendProfile` (including asynchronous refresh) | Profile identity | `#fpTitle .pname-iso` |
| `openSpireInfoSheet` | Keeper plate and siege attribution | `.spp-plate b`, `.sp-siege` |
| `renderBoneyard` | Owner marker and race standing | `.spire-flag`, `#mapCount` |
| `hlwLine`, `openHollow` | Occasional named greeting | `#hlwSay`; deterministic named first-visit line |
| `openRenameNotice` | Existing name in explanation | `.sheet-rename .note b` |
| `openGiftSheet`, `openCheerSheet` | Recipient names | `.gift-recipient` |
| `paintDeliveries`, `giftSender` | Sealed gift sender | `.gift-sealed .tx b` |
| `paintCheers`, `crewCheers` | Cheer sender | `.cheer-tx b` |
| `revealGift`, `openPackReveal` | Gift sender credit | `#packFoot > .pack-coins:first-child` |
| `toast`, name-builder and social feedback callers | Name-containing feedback | `#toast`, via existing toast renderer |
| `openFight` | Opponent introduction, heading, HUD and venue | `.vs-name.foe`, `.vs-venue`, `.fight-title h2`, `.fname`, `.fight-venue` |
| `openNameBuilder` | Generated draft | `#nbPreview`, longest valid generated pick |
| `openFight`, result settlement | Battle log and repeat-result prose | `#flog`, `.fight-over .note` |
| `openSpireInfoSheet` | Rival tower action | `#spireAct` |
| `paintDeliveries` | Archived name-bearing ledger label | `#deliveriesList .t3-tx b` |
| `renderOnboarding(1)` | Generated draft | `#onbName`, longest valid generated pick |

The player's own Pit HUD says `You`; it does not read the account name. The same applies to the introduction's `YOU` label. NPC names, pet nicknames, item names, saved outfit names, food names, earned level titles and routine names are distinct fields and are not account identity render sites.

Studio receives an appearance and friend code for the signed-in player, not their account name. `studioCrewAppearance` carries other players' names/aliases as accessible labels for picture-sticker buttons. `studio-screen.js` places these in `aria-label`, not visible caption text. Favourite-avatar buttons likewise use names in `title` and `aria-label`. These are enumerated but have no rendered text rectangle to grade. No account-name text is drawn into the Studio export.

## Guard and limitations

`node tests/name-fit-audit.mjs [baseUrl]` accepts `process.argv[2] || process.env.URL`. With neither supplied, it explicitly calls `serveTree` with the checkout derived from `import.meta.url`, then passes that URL into `boot`. It never relies on a default production URL. The release gate declares it as `full`.

The matrix is three names (`Bo`, `Bartholomew Bonecrusher`, and that name plus 128 unbroken `W` characters), two viewports (375x812 and 430x932), and three root text settings (default, 200%, 53px). For each inventoried surface it prints CONTROL, element/rect, both widths, FITS, LEGIBLE and INTACT. Missing or hidden sites and environment failures exit 97. Geometry or string failures exit 1 when coverage is complete. The guard additionally checks vertical overflow and clipping by ancestors so `overflow:visible` alone cannot manufacture a fit. LEGIBLE uses the existing minimum ramp token, `.5625rem` (`--fs-micro`, 9px at a 16px root).

Browser setup has not been exercised past server startup. In particular, map rendering requires WebGL and remote map assets; the map's race summary uses an intercepted read response through the real response validator, rather than relying on the Crew-only fixture hook. That site must report UNPROVEN when unavailable, never pass from a generic map label. Transient Pit intros may disappear before capture and must also report UNPROVEN. These remain review risks, not established passing paths.

Additional conditional fixtures drive a real jab for battle-log prose, seed a prior friend battle and finish through the existing fight seam for repeat-result copy, open the production rival-tower sheet with an inert action callback, and seed an archived delivery ledger row. These setups were added after the initial census review. They have not run in a browser; failure to reach their named elements must remain UNPROVEN. Transient log timing and result settlement therefore need independent validation.

## Deviations and unresolved requirements

1. There is no declared largest supported text size in the checkout. `html` follows the platform through `font: -apple-system-body`; existing accessibility work uses 200%. This guard adds a 53px stress case. Neither is asserted to be an application maximum. Proposed resolution: declare the supported platform text-size envelope and add device-specific proof. This requirement remains unresolved.
2. Arbitrary imported names cannot be generated by the onboarding/name-builder word-list UI. Those two drafts use the longest legal word-list selection plus `#999`, without changing validation. All stored-name sites use the three requested stress lengths.
3. Wrapping has no two-line cap. An unbounded name cannot fit exactly two lines at a fixed minimum font size on a finite-width phone. Extra lines preserve identity and legibility at the cost of vertical space.
4. Required red browser measurements could not be obtained. `guard-red.txt` preserves the existing v578 proof and appends this task's denied throwaway-tree attempt. Supplied plan measurements are explicitly labelled as supplied observations, not reproduced results. No red proof is claimed.

## Files and proof

- `app.css`: appended name wrapping and layout rules.
- `js/app.js`: preserve DOM name casing, scoped classes, and rare-surface test seam.
- `tests/name-fit-audit.mjs`: browser matrix and source census.
- `tests/release-gate.mjs`: full-tier registration.
- `docs/v578/name-fit.md`: this advisory report.
- `docs/v578/name-fit-unit.txt`: agreed unit command output.
- `docs/v578/name-fit-audit.txt`: fixed-tree browser attempt.
- `docs/v578/guard-red.txt`: appended throwaway red attempt, preserving prior evidence.

`node tests/unit.test.js`: **391 passed, 0 failed** (exit 0). The output file records the final run. Syntax checks passed for the changed JavaScript files. Browser audit: **exit 97, no rendered rows**. Red audit: **exit 97, no rendered rows**. Local listener creation was denied; approval escalation is unavailable in this environment. No other denied action was attempted.
