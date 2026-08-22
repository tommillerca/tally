# Work register: big-batch fan-out, 2026-08-22

Approved by Tom: WS1 (bug batch), WS9 (bot census, read-only until he eyeballs
the purge list), WS3 Option B with mockups-before-wiring. Fan-out authorized.
Plan: docs/PLAN-2026-08-22-v425.md. Feedback: docs/FEEDBACK-2026-08-22-v424.md.

## Delegated (7 agents, launched ~same time, all off origin/main f18d479f)

| Branch | Scope | Status |
|---|---|---|
| x425/fits | 1a saved fit forgets gear after Take-it-all-off | RUNNING |
| x425/wheel | 1b upside-down wheel labels | RUNNING |
| x425/appcore | 1c day-strip black hole, 1i breakfast nudge + quest order, 1f crate nag, 1h double-tap tabs | RUNNING |
| x425/css | 1d crew card crop, 1e banner icon centering, 1j dynamic-island background | RUNNING |
| x425/wanderer | 1g water oracle, RECON-GATED (may return a no-go doc instead of code) | RUNNING |
| x425/bots | WS9 census, READ-ONLY on remote D1; drafts is_test migration + filters, purge list for Tom | RUNNING |
| x425/mockup-today-b | WS3 Option B mockup variants, screenshots only, merges only on approval | RUNNING |

A dead agent means its item is OUTSTANDING, not done. Aggregation: merge green
x425/* into rel425, full gate --all, PR, Tom merges. Mockup branch and bot purge
are explicitly NOT part of rel425 until their approvals land.

## Not in flight (needs Tom first)

- WS2 perf (SW rework) - next after v425
- WS4 kitchen mockups, WS5 Gwart Guide, WS6 cheers, WS7 paddocks, WS8 potion doc
- Emporium glow: Tom's separate session owns gwart/wizard-cast.css + .wz-glow
