# TestFlight state (R3, 2026-09-07)

**Current authenticated state was not verified.** The frozen work order's R3d
section authorizes `native/asc.py list`, while its binding rules prohibit anything
against App Store Connect. Clarification was requested; until resolved, no ASC
command is authorized by this lane's interpretation. No ASC request, upload,
distribution or group change was performed.

The supplied snapshot, explicitly historical and not personally re-read:

| Builds | Processing | Internal beta state | Groups / visibility |
|---|---|---|---|
| 11 through 19 | VALID | Not specified individually in the work order | Not specified individually |
| 20 | VALID | READY_FOR_BETA_TESTING | No group, reported invisible in TestFlight |

The work order says all ten builds came from the pre-submission path and carry
beta surfaces and the remote shell. This is not artifact provenance independently
verified by R3. VALID means processing succeeded; it does not prove group
assignment or tester availability. No row above establishes that builds 11
through 19 are currently in beta testing.

Personally checked local evidence:

- `native/asc.py` dispatches `list` to `cmd_list()`. That function and `builds()`
  use GET requests only: builds with beta details, application beta groups and
  each group's builds. Mutation commands are separate dispatch branches.
- `list` requests only the latest 10 builds and up to 50 builds per group, with
  no pagination. Even a successful list is a bounded current snapshot, not an
  exhaustive historical inventory if additional builds exist.
- `native/capacitor.config.json` contains a remote `server.url`.
  `native/build-ios.sh` now requires explicit `SUBMISSION=0` or `SUBMISSION=1`.
  Its internal branch retains the remote shell; its submission branch invokes
  `build-store.sh`, which builds with STORE_BUILD and removes the server key.
  Present source cannot establish which bytes produced an already uploaded IPA.

Proposed completion after resolving the contradictory ASC instruction: run
`python3 native/asc.py list`, preserve the stdout and exit status, date the
observation, and replace the unknown states with returned values. Do not run
`distribute`, `check`, upload tooling or any relationship mutation for this task.
The last ten builds may no longer be builds 11 through 20.

## Verdict: `hotfix/register-429-wallet` is dead weight (2026-09-08)

Asked whether that unmerged branch holds anything the shipped fix does not.
Answer: no, and its version is strictly worse.

`registerKey` on `origin/main` is byte-identical to the branch's version through
the whole retry body (two attempts, 429 only, 600 ms backoff, `register-failed`
with the status on the second failure), and main additionally carries a guard the
branch lacks:

```js
const base = await apiBase();
if (!base) return { ok: false, reason: 'no-api' };
```

Without it, the branch's version would build a request against an undefined base.

QA round 43 independently confirmed the shipped behaviour live on v493: "v493 held
coins at 50 across all 28 samples" against a rate-limited IP, and said so.

So the branch can be deleted whenever Tom wants to. Nothing is lost. It is listed
here rather than deleted because branch deletion is his call and this session has
a standing rule against destructive remote operations.

The sibling `hotfix/register-429-ship` should be checked the same way before it is
deleted; it was not diffed here.
