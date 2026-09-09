# R4 silence verification

The source fixes were present on arrival. The named audit was missing, so it
had no arrival RED/GREEN verdict. Its reconstructed guard first ran GREEN:
`R4 SILENCE: 6 passed, 0 failed`. No pre-fix reproduction is claimed.

- R4-11: a completely fresh VM and session storage recover the failed-save
  journal through shared localStorage. Confirmed saves stay quiet.
- R4-6: the production erase transaction aborts, the peer receives truthful
  error-toast wording before another write, and 125 coins survive. Reloading
  into a fresh database module permits writing 126 coins. Successful erase
  still clears data and requests peer reloads.
- R4-12: N=4 consecutive fresh launches change the restored draft timestamp
  while preserving its identity. Exactly one error notice appears.
- R4-14: four failures for each account state emit the two different exact
  messages. The missing-account message is reused from Settings.

LocalStorage is the existing fix's allowed alternative to IndexedDB. It
departs from the spec preference for the fight/draft mechanism to journal
synchronously before an asynchronous save, independently of a failed IndexedDB
transaction. Storage refusal/eviction and physical iOS termination remain
limits. This Node proof does not certify browser timing or physical devices.

Full starting evidence, proof enumeration and deviations: [finish report](R4-FINISH-REPORT.md).
