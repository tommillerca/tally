> Historical standalone lane report from `a2a15fbb`. Its v527 source observations and pre-recovery sync expectations describe that lane snapshot. The integrated v528 code repairs missing registration and records failures. See [the integration report](../sync-integrate.md) for current changes and proof.

# Native sync investigation

**The tracked native configuration loads the live HTTPS site. It does not pin players to bundled v413 JavaScript. The mode and executing code of the shipped binary remain unverified.**

Frozen work order: `sync-native`, SHA256
`52c6f524a2827ed7da76b44c6c77363b6ac88fc910fce457f6cfa84846d5b1aa`.
Verified against the supplied plan file on 2026-09-09. All source references below
are relative to this checkout. This is an advisory source investigation, not a
device diagnosis or an outage fix. The established outage facts were accepted
without querying production.

## 1. Which code does native load?

| Evidence | Meaning |
| --- | --- |
| `native/capacitor.config.json:6` | `server.url` selects `https://tommillerca.github.io/tally/`. `webDir: "www"` alone does not select bundled execution. |
| `native/ios/App/App.xcodeproj/project.pbxproj:154` | Both `public` and `capacitor.config.json` are packaged as resources. The copied config, not the resource list or a build comment, determines the initial URL. |
| `native/ios/App/App/Base.lproj/Main.storyboard:14` and `BoneheadzViewController.swift` | The app uses the Capacitor bridge subclass. It registers Health and BhVault; it does not override the initial URL or website data store. |
| `native/build-ios.sh` | `SUBMISSION=0` copies the web assets and syncs the tracked remote config. `SUBMISSION=1` temporarily substitutes a generated bundled config before syncing and archiving, then restores the tracked config. |
| `native/build-store.sh` | Removes the entire `server` key and marks the copied app `STORE_BUILD=true`. This channel really runs packaged assets and needs a native release for web code changes. |
| `native/build-www.sh` | Copies the current source into `www`; no v413 source selection exists here. It does not copy `sw.js`. |
| iOS build 19 and Android build 10 comments | `WRAPPED_WEB_BUILD=v413` is descriptive metadata, not executable routing or proof of the installed payload. |

Capacitor 8.4.1 is pinned in `native/ios/App/CapApp-SPM/Package.swift`.
Its controller loads `bridge.config.appStartServerURL`; the descriptor reads
`server.url` from the packaged configuration. These support the remote path
above. [Capacitor controller source](https://raw.githubusercontent.com/ionic-team/capacitor/8.4.1/ios/Capacitor/Capacitor/CAPBridgeViewController.swift),
[configuration descriptor](https://raw.githubusercontent.com/ionic-team/capacitor/8.4.1/ios/Capacitor/Capacitor/CAPInstanceDescriptor.swift).

This checkout has no copied iOS `App/capacitor.config.json`, `public` payload,
or supplied shipping archive to identify what build 19 actually contains.
The source supports two delivery modes. Therefore neither "all fixes reached
players" nor "nobody received anything after v413" follows from this checkout.
Even the remote channel may execute an older cache.

The checkout itself says **v527** in `js/app.js`, `sw.js`, and `version.json`.
The plan's live v528 is a different observation, not evidence that this checkout
or a player's executing module is v528. No version bump was made.

## 2. Could the wrapper block the API?

- **ATS:** `Info.plist` has no `NSAppTransportSecurity` override. The tracked
  shell and API use HTTPS. No source evidence calls for a cleartext exception.
  TLS, DNS, redirects, captive networks, and device policy still require a
  device trace. An old persisted `kv.apiBase` can also override the production
  URL, including with an HTTP development address; inspect its value locally.
- **Navigation and origins:** no `allowNavigation`, `WKAppBoundDomains`, or
  `limitsNavigationsToAppBoundDomains` restriction appears in the tracked
  wrapper configuration. Capacitor's navigation policy handles navigations;
  it is not an allowlist for JavaScript API fetches. Adding the API hostname to
  navigation configuration is not justified by the evidence.
  [Capacitor navigation handler](https://raw.githubusercontent.com/ionic-team/capacitor/8.4.1/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift).
- **CSP:** `index.html` has no CSP meta directive, and no native CSP injection
  was found. Headers actually delivered to the phone are outside this source
  proof and must be inspected there.
- **Cookies:** `js/social.js:signedFetch` authenticates with ECDSA headers,
  not API cookies. Cookie partitioning alone does not explain missing auth.
  `server/src/index.js:6` permits any origin and lists PUT, OPTIONS, and the
  signature headers. That is a source observation, not a fresh production
  CORS measurement. Browser preflight behavior cannot be proved in Node.
- **Storage:** `isOnline` requires `kv.social`. Missing registration stops
  `autoSync` before it builds a snapshot. A malformed stored signing key can
  pass `isOnline` and then fail before fetch. Both paths were reproduced with
  the real modules and memory IndexedDB. These are possible local-state
  explanations, not evidence that an affected phone has either state.

## 3. Can the WebView run stale social code?

Yes, conditionally on an active service worker. `js/app.js:1514` registers on
HTTPS with no native exclusion. The tracked remote mode meets that protocol
condition. The comments in `native/README.md` and `native/build-www.sh` about
native having no service worker apply to the local bundle path, not the remote
HTTPS shell. Registration support and success on the installed iOS release
remain device questions.

`sw.js:322` precaches `js/social.js`. The current worker serves a ready
generation's module from cache without fetching that module. Node execution
of the real fetch handler confirms this and confirms that a missing READY
marker takes the network path. Thus loading a live URL does not imply loading
today's JavaScript.

The current install writes `__shell-ready__` only after all precache requests
succeed, then calls `skipWaiting`. Activation retains the current generation
and at most two older generations used by open clients. `fromCaches` prefers
the current version. These reduce partial-install exposure but are not an
atomic deployment guarantee: unversioned URLs fetched across a deploy can
still contain different releases, and runtime writes can replace entries.

There is also a deliberate mixed-generation window: an old page can keep
running while a newly activated worker answers requests with newer modules.
The app reloads on controller change, deferred while a sheet is open. A
failed install leaves the older active worker in charge. A stamp check can
request an update, but runs only on eligible same-origin requests, not on an
independent timer. Older executing app/worker code may lack current recovery
behavior. Source comments record prior waiting-worker incidents; this review
did not remeasure them.

Crucially, the current worker returns before `respondWith` for cross-origin
requests and non-GET requests (`sw.js:632`). The Node probe confirms that API
GET and PUT bypass its cache handler. A stale module could suppress or break
sync before transport; this worker does not itself cache away the profile PUT.
No stale or half-updated device cache was obtained, so that outage mechanism
is unproven. A missing static module usually breaks boot more broadly; the
app remaining usable does not by itself identify a cache defect.

## 4. Does native preserve IndexedDB across updates?

The source is designed to preserve it, but cannot establish preservation on
a particular installation. The custom Swift app contains no nonpersistent
website data store selection or launch/update data deletion. Capacitor's
controller constructs a normal `WKWebViewConfiguration` and does not clear
website data on a binary version change. Its binary-version handling changes
asset-path bookkeeping, not IndexedDB.
[Capacitor controller source](https://raw.githubusercontent.com/ionic-team/capacitor/8.4.1/ios/Capacitor/Capacitor/CAPBridgeViewController.swift).

`js/db.js` opens `tally`, schema version 3, and creates missing stores during
upgrade. This is not proof against OS eviction, replacement containers, or
origin changes. Switching remote HTTPS to the bundled origin presents a
different storage namespace even if old bytes remain on disk. Safari, a
home-screen PWA, and the native app should be inspected separately.

`BhVault.swift` stores identity material under `com.boneheadz.gym.vault`, and
the custom controller registers that plugin. This backs up keys, not the
whole IndexedDB database. `bootSync` attempts keychain recovery and server
registration when local registration is absent, then encrypted restore.
Therefore the diagnostic fixture "identity without social" proves the
`autoSync` gate only, not that a full boot cannot recover it. Recovery depends
on readable keys, registration, a usable backup, and the user's cloud setting.

The tracked signing team is `H8TRZ23C77` and bundle ID is `com.boneheadz.gym`.
A differently signed/replaced installation must not be assumed to retain
either the same WebView container or access to the same keychain item.
The frozen plan's signing hazard is accepted as context. The referenced
memory note is not present in this checkout's `CLAUDE.md`; that file contains
the stale-simulator-origin note instead. No original checkout was consulted.

## Required device evidence and procedure

1. On an affected phone, record the installed native build and distribution
   channel, iOS version, Settings web build, and existing diagnostics before
   updating or clearing anything. From the matching archive, inspect
   `App.app/capacitor.config.json`, `Info.plist`, and the bundled
   `public/js/app.js`. Use `plutil -p <App.app>/Info.plist` and
   `cat <App.app>/capacitor.config.json`; search the bundled module for
   `APP_BUILD` and `STORE_BUILD`. Check signing with
   `codesign -dv --verbose=4 <App.app>`. The archive must match the installed
   build; the repository config is insufficient.
2. If the affected WebView is inspectable, attach Safari's Develop inspector.
   In its console run the read-only inventory below. Record the executing
   app build from Settings and the loaded Sources entry for `js/app.js`.
   Record the loaded `social.js` contents or its hash locally. A new `fetch`
   of a module is not proof of what the page already executed.

   ```js
   ({ href: location.href, origin: location.origin,
      secure: isSecureContext,
      platform: window.Capacitor?.getPlatform?.(),
      controller: navigator.serviceWorker?.controller?.scriptURL });
   await window.Capacitor?.Plugins?.App?.getInfo?.();
   await navigator.serviceWorker?.getRegistrations().then(rs => rs.map(r => ({
     scope: r.scope,
     active: r.active?.scriptURL,
     waiting: r.waiting?.scriptURL,
     installing: r.installing?.scriptURL
   })));
   typeof caches === 'undefined' ? [] : await caches.keys();
   ```

   In the Storage inspector, examine `tally` / `kv`: presence of `social`,
   `identity`, `apiBase`, and the values of `socialSyncAt`, `cloudOff`, and
   `vaultUnreadable`. Record presence and timestamps, not private JWKs,
   backup keys, or signature headers. Inspect cached `social.js` and READY
   entries per generation. Worker URLs alone do not identify worker bytes.
3. Preserve the Network log and foreground the app after more than five
   minutes since its last attempt. Observe lifecycle callbacks, whether
   `autoSync` is entered, and where it returns. Capture the profile OPTIONS
   and PUT status/error, effective URL and Origin, response CORS headers,
   CSP/TLS console errors, and whether a request was issued at all. Run
   `await fetch('https://bonez-api.boneheadz.workers.dev/health',
   { cache: 'no-store' }).then(r => ({ status: r.status, ok: r.ok }))`
   in that WebView for a read-only transport comparison. A health GET alone
   does not prove signed PUT preflight or authentication. Use ordinary app
   foregrounding for sync observation; do not paste a synthetic production
   write or registration command.
4. After preserving the initial evidence, compare worker active/waiting
   states and loaded build across normal resume, closing sheets, and relaunch.
   Only then, for the remote mode, an operator can run
   `await navigator.serviceWorker.getRegistration().then(r => r?.update())`
   and observe whether the build changes. This is an update action, not a
   read-only probe. Do not erase site data or unregister workers to diagnose
   a production save.
5. Test preservation on a backed-up test account/device: record origin,
   native build, registration presence, identity public-key fingerprint, and
   representative stored rows. Install an ordinary update with the same
   team/bundle ID without uninstalling, and compare. Separately test the
   remote-to-bundled transition and recovery. Any differently signed install
   belongs on a disposable test device. Node's memory database cannot model
   WebKit storage isolation, keychain entitlements, or app replacement.

Release inspection may be unavailable: the tracked config does not explicitly
enable `ios.webContentsDebuggingEnabled`, and Capacitor enables debugging by
default for debug configurations. If Safari cannot attach, collect available
Settings diagnostics and the matching archive first. An inspectable test
build can test mechanisms but cannot retrospectively prove the affected
binary's state. `native/sim-verify.sh` is not a substitute for these checks:
it compares installed config and the server stamp, not executing cached
JavaScript, and its no-server branch accepts a bundle without checking its
web build.

## Proof, changes, and limits

Files added:

- `docs/reviews/sync-native.md`: this analysis and device procedure.
- `tests/sync-native-audit.mjs`: repeatable, socket-free diagnostics using
  `tests/mem-idb.mjs`, real social/database/native modules, real WebCrypto,
  intercepted transport, and the real worker fetch handler in a VM.

Agreed proof command: `node tests/unit.test.js`, exit 0:

```text
377 passed, 0 failed
```

Additional command: `node tests/sync-native-audit.mjs`, exit 0:

```text
PASS tracked native config selects the remote HTTPS shell
PASS identity without social registration returns before snapshot or fetch
PASS intact identity and registration produce a verifiable signed profile PUT
PASS malformed stored signing key silently stops sync before transport
PASS rejected transport returns null without advancing sync stamp
PASS native and visibility resume events share the 500ms deduplication window
PASS ready cache serves social.js without module fetch
PASS missing READY falls through to network for social.js
PASS cross-origin API GET and PUT bypass the service worker
9 diagnostic checks passed; device behavior remains unverified
```

The diagnostic assertions fail on unexpected request counts, signing failure,
incorrect stamp movement, wrong resume counts, wrong cache selection, or API
interception. Two initial harness runs failed because Node needs absolute
Request URLs and the mock used the wrong READY key. Both fixture mistakes
were corrected; production source was unchanged. The VM does not simulate
worker installation or activation and makes no claim to reproduce a real
half-updated cache. The memory database does not simulate a native update.

Denied actions: none. Unavailable evidence: shipped artifact and affected
device state. Apple's documentation Markdown links could not be fetched by
the web tool; no claim here depends on that unread content. No sockets,
device/simulator build, Worker deployment, remote Wrangler, production D1
write, secret setting, commit, push, PR, or publication was attempted.
`native/ASC-SUBMISSION.md` was not read or modified.

Deviations: none. The work order requests source/configuration analysis, so
the deliverable is evidence and diagnostics, with no speculative runtime
fix. A definitive answer about the shipped payload cannot be obtained from
this checkout alone. Proposed follow-up is the matching-artifact/device
procedure above; this is explicitly outstanding, not replaced by a claim of
device behavior.
