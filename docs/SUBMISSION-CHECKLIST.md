# App Store submission checklist

Prep only. No upload, no signing change, no Worker deploy happened from this
pass. Status as of `prep/submission` (branched off `integ/day3`).

## Ruled, do not reopen

- [x] Age rating 12+ with the Alcohol/Tobacco/Drug Use "infrequent/mild"
      descriptor. Rollie, Last Cigarette, Fat Cigar stay named as shipped
      (Tom, 2026-09-05, `TESTFLIGHT.md`). No renaming, no rating downgrade.

## Store-build lint and bundle

- [x] `node tests/store-copy-lint.mjs` passes: `SHOW_BETA_THANKS`/`STORE_BUILD`
      gating is intact in `js/app.js`, and `native/build-www.sh`'s sed line
      still flips the flag. Re-verified against the actual bundled output
      (`native/www/js/app.js` has `STORE_BUILD = true`, zero reachable
      TestFlight/beta strings).
- [x] `native/build-store.sh` builds `native/www` (STORE_BUILD=true) and
      `native/capacitor.config.store.json` (server.url removed). Confirmed
      boots and renders (Today screen, 4-tab bar) served from a bare static
      server with no network dependency and no service worker. See
      `native/README.md` for the exact commands.
- [ ] Not yet done: an actual `npx cap sync ios` + Xcode archive against the
      bundle. Nothing here required Xcode; that's the next lane, after Tom
      says go.

## Worker / server

- [ ] `2026-09-05-week-freeze.sql` migration is still pending (per
      `docs/HANDOFF-CODEX-2026-09-05.md` #4); `2026-09-04-prev-names.sql` is
      applied. Tom runs both the migration and any Worker deploy; nothing here
      touched the Worker.
- [ ] Confirm the live Worker matches whatever client version ships in the
      submitted build before archiving (a stale Worker behind a new client is
      the class of bug `docs/ROADMAP.md`'s cloud-versioning item exists for).

## URLs

| Item | URL | Status |
|---|---|---|
| Privacy Policy | `https://tommillerca.github.io/tally/privacy.html` | LIVE |
| Support | `https://tommillerca.github.io/tally/support.html` | LIVE, but points to "the support email shown on the App Store listing" - **that email does not exist yet** |
| Support email | - | **TODO (Tom):** a personal support address, not the veritree one (`TESTFLIGHT.md` "STILL NEEDED FROM TOM"). Needed for both the ASC listing field and to make support.html's own promise true. |

## Device family and screenshots

- Current Xcode setting: `TARGETED_DEVICE_FAMILY = "1,2"` (iPhone + iPad),
  unchanged. `docs/ASC-SUBMISSION.md` #2 lists this as an open decision Tom
  has not made.
- **TODO (Tom):** iPhone-only, or iPhone+iPad? Determines the screenshot set:
  - iPhone-only: 6.1" (1170x2532 or current equivalent) and 6.7" screenshots,
    2-3 each minimum.
  - Add iPad if keeping "1,2": 10.9"/12.9" screenshots, and the UI has not
    been tested on an iPad form factor (`docs/ASC-SUBMISSION.md` appendix
    flags this explicitly).
  - Capture from a real device or simulator once the family decision is
    made; do not use mockups.

## App Store Connect metadata

- [x] Subtitle, promotional text, description, keywords, support/marketing/
      privacy URLs: all paste-ready in `TESTFLIGHT.md`.
- [ ] App Store Connect API key (the actual upload blocker): Tom generates
      it in ASC (Users and Access > Integrations, role App Manager) and
      hands over the `.p8` + Key ID + Issuer ID when ready to upload. Not
      needed for this prep pass; only for the eventual `altool`/Transporter
      step, which nobody runs from here.

## Not done in this pass, on purpose

- No `npx cap sync`, no Xcode archive, no signing changes.
- No App Store Connect upload, no altool/notarytool/Transporter call.
- No Worker deploy, no `wrangler ... --remote`, no production D1 write.
- `native/capacitor.config.json` in the repo is unchanged; the remote shell
  still serves internal builds.
