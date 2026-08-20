# Mimic + Gauntlet — findings (live document)

## 1. The pixel GIF, measured

`mimic-pixel-loop.gif` — 48x48, palette mode, **9 frames but only 5 unique**.

| GIF frame | delay (ms) | unique id | diff px vs frame 0 |
|---|---|---|---|
| 0 | 150 | A | 0 |
| 1 | 150 | B | 541 |
| 2 | 150 | C | 628 |
| 3 | 150 | D | 881 |
| 4 | 450 | E | 977 |
| 5 | 150 | D | 881 |
| 6 | 150 | C | 628 |
| 7 | 150 | B | 541 |
| 8 | 300 | A | 0 |

Total cycle 1800 ms. It is a **palindrome ping-pong**: closed -> opening -> wide (held 450 ms) -> closing -> closed (held 300 ms).
Frames 0==8, 1==7, 2==6, 3==5. Only 5 distinct plates exist.

**Decision: ship the GIF itself, unmodified, 10,358 bytes.** No sprite sheet, no CSS `steps()`
reimplementation. The browser already decodes and loops a GIF at the authored per-frame delays,
including the 450 ms hold that a uniform `steps(9)` would flatten. Rebuilding 5 plates into a
sprite sheet would be a bigger asset, a bigger diff, and a worse-timed animation than the file
Cam already authored. This is the same judgement as the Wanderer flame call (do not ship plates
to animate a handful of pixels), applied in the opposite direction: here the authored file is
already the smallest correct thing.

