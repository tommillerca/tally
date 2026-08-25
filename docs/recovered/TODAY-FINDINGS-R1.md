1	# Today rebuild mockup: findings (written as I go)
2	
3	Output folder: `/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/today/`
4	
5	## 1. Source of truth read
6	
7	- Tokens: `origin/main:app.css` `:root`. Confirmed values match brief. Extra ones I used:
8	  `--line-strong rgba(242,233,215,.17)`, `--radius-sm 13px`, `--sh-sm 3px 4px 0 rgba(0,0,0,.55)`,
9	  `--fs-0..7`, `--ink #2a2d28`, `--gold #ffc961`, `--sat env(safe-area-inset-top,0px)`.
10	- Talk box: `origin/feat/talk-box` -> `js/talkbox.js` (112 lines), `app.css` line 1003 onwards
11	  ("THE TALK BOX"), `--dialogue: 'BoldPixels', ui-monospace, ...`, `assets/fonts/boldpixels.woff2` (4040 bytes).
12	  TALK_MS = 26. Reused verbatim; no second typewriter written.
13	- Today render: `js/app.js` on `feat/talk-box`, hero markup at line ~2870-2960,
14	  `speechLine()` at 3323, `PET_LINES` at 15708, pet handler at 3080.
15	
16	## 2. Speech-bubble inventory on Today (BEFORE)
17	
18	There are exactly TWO speaking surfaces on Today, and they are the SAME DOM node
19	(`.hero-bubble`, which is a `.talkbox` with a placement class):
20	
21	| # | Surface | Trigger | Shape | Content source |
22	|---|---|---|---|---|
23	| A | Bonehead's own line | auto on render | no name label, no chevron, auto-dismiss at 7s (`bubbleOut`) | `speechLine()` — 13 state-gated pools, ~100 lines |
24	| B | Pet's line | tap `#heroPetBtn` | NAMED speaker (pet's name), `tb-hold`, gold chevron, player dismisses | `PET_LINES` (5 lines) |
25	
26	`speechLine()` pools, in priority order (this is the routing that has to survive):
27	1. `S.pendingLevelLine` (one-shot, set on level-up)
28	2. crates unopened (10 lines)
29	3. viewing a past day (4)
30	4. crops ripe (5)
31	5. dish ready (5)
32	6. no entries logged (11)
33	7. protein target hit (8)
34	8. over kcal target (7)
35	9. within 350 kcal of target (7)
36	10. pooled chatter: >=12k steps (5), streak>=3 (6), spires held (3), fightsReady>=3 (3), 23:00-05:00 (3)
37	11. general idle chatter (24)
38	
39	Adjacent non-bubble text on Today that is NOT a speech surface (leave alone):
40	- `.hero-why` caption (only while level < 3): "N fights ready. Walking earns more."
41	- `.unlock-nudge` card (`#unlockNudge`) — a tappable card, not speech.
42	- `.cele-bubble` — level-up / breeding celebration overlays, not on Today's steady state.
43	
44	## 3. The olive ground: what I used
45	
46	It is not a new colour. The Today screen in the shipped app renders an EQUIPPED
47	BACKDROP, and the demo profile's is `assets/bh/BG/BG2-1.png`, a flat
48	**#6b7c38** measured off the file (640x640, single flat fill). Sampled off the
49	live render at 390x844 dpr2 it reads (110,125,65) = **#6e7d41**, because
50	`.hero-scene::before` lays a `rgba(255,236,180,.20)` warm centre light over it.
51	
52	So Tom's olive is the app's own Olive Field backdrop. The mockup inlines that
53	exact PNG full-bleed rather than inventing a token, and declares
54	`--olive: #6b7c38` only as the colour behind it before the image decodes (the
55	same coral-flash problem `.hero-scene` already documents).
56	
57	The darkening toward the bottom is new and is mine:
58	`linear-gradient(180deg, rgba(43,49,25,0) 38%, rgba(43,49,25,.42) 66%,
59	rgba(19,20,14,.86) 88%, rgba(13,12,18,.95) 100%)`, measured down the hero at
60	x=20: y400 (88,102,46) -> y500 (66,76,36) -> y560 (46,52,26) -> y620 (29,32,19)
61	-> y686 (18,18,20). It lands on --bg #0d0c12 at the hero's bottom edge, so the
62	art dissolves into the app background with no seam above the nav cards.
63	
64	## 4. Measured geometry at 390x844 dpr2
65	
66	| element | x | y | w | h |
67	|---|---|---|---|---|
68	| hero | 0 | 0 | 390 | 687.9 |
69	| Gwart medallion `.gw` | 4 | 4 | 180 | 180 |
70	| talk box `.gw-box` | 182 | 8 | 200 | 67.7 |
71	| talk box name label | 194.3 | 19.7 | 175.3 | 9.1 |
72	| talk box text line | 194.3 | 33.6 | 175.3 | 34.1 (2 lines @ 17.05px) |
73	| figure box `.hero-char` | -25 | -1.2 | 440 | 604.9 |
74	| pet | 268 | 496.2 | 108 | 106.5 |
75	| stat strip | 0 | 603.9 | 390 | 84 |
76	| nav cards | 16 | 699.9 | 358 | 64.4 |
77	| tabbar | 0 | 778.3 | 390 | 65.7 |
78	
79	Medallion is **180px**, not the ~200 in Tom's layout. Deliberate: the talk box
80	needs a 175px text column to hold his longest line in two lines at
81	`--tb-size: 11px` (the value shipped Today already uses). A 200px medallion
82	leaves 155px and pushes the same lines to three, which makes the box taller than
83	the medallion and breaks the read.
84	
85	## 5. THE MOTION, measured off decoded pixels
86	
87	Method: `prefers-reduced-motion` unset, dpr **4** (0.25 CSS px per pixel), 13
88	screenshots of a 70x40 CSS crop at even 533ms intervals across one full 6400ms
89	period. Each frame's medallion position is read as the sub-pixel luminance
90	crossing (threshold 60) down the column through the medallion's centre
91	(x = 94 CSS), i.e. the top edge of the black ring as PAINTED. No geometry read
92	anywhere: gBCR and getComputedStyle both read a frozen identity transform in
93	headless while the compositor keeps painting.
94	
95	| frame | t (ms) | ring top edge, px @dpr4 | CSS px | frame md5 |
96	|---|---|---|---|---|
97	| f00 | 0    | 14.58 | 3.645 | f520a41f |
98	| f01 | 533  | 20.58 | 5.144 | bc84b1ac |
99	| f02 | 1067 | 24.58 | 6.145 | e134399e |
100	| f03 | 1600 | 25.58 | 6.395 | e79e8b4e |
101	| f04 | 2133 | 24.58 | 6.145 | 47b83095 |
102	| f05 | 2667 | 21.58 | 5.395 | b1e229c3 |
103	| f06 | 3200 | 16.58 | 4.145 | 663b0a23 |
104	| f07 | 3733 | 10.58 | 2.645 | e2841157 |
105	| f08 | 4267 | 6.59  | 1.646 | 8bbc33e5 |
106	| f09 | 4800 | 5.59  | 1.397 | 00f10e55 |
107	| f10 | 5333 | 6.59  | 1.646 | a75e0db7 |
108	| f11 | 5867 | 9.58  | 2.395 | 3a8135f0 |
109	| f12 | 6400 | 14.58 | 3.645 | 3cf68fd4 |
110	
111	- **PEAK TO PEAK: 5.00 px** (1.397 to 6.395).
112	- **PERIOD: 6.4 s** — f12 returns to f00's exact position, 3.645, after 6400ms.
113	- 13 of 13 frames have distinct md5s, so nothing is frozen. The extremes (f03,
114	  f09) are 0.25px from their neighbours while the mid-travel steps are 4-6px:
115	  that spacing IS the `ease-in-out`, measured rather than read off the CSS.
116	- WAAPI cross-check on the real element: one animation, `gwFloat`, duration
117	  6400, `playState: running`. Sparkles: `gwShimmer`, duration 5100.
118	- Nothing on this screen shares a period: gwFloat 6.4s, gwShimmer 5.1s,
119	  tbNudge 1.1s, tbBlink 0.9s, bh-idle 4s, paBob 3s, paFall 1.5s.
120	
121	**Reduced motion, same 13-sample method with `prefers-reduced-motion: reduce`
122	emulated:**
123	- `el.getAnimations()` on the medallion: **[] (empty)**. On the sparkles: **[]**.
124	- computed `animation-name: none`, `animation-duration: 0s`.
125	- All 13 frames read edge **3.895 px** and share ONE md5 (db032dd3).
126	  **PEAK TO PEAK: 0.00 px.**
127	- 3.895 is the midpoint of the moving range (1.397 + 6.395)/2 = 3.896, so it
128	  rests dead centre rather than at a cycle extreme.
129	- The duration is 0s because the animation is `none`, NOT because a duration was
130	  collapsed. The `0.001s` trap (an infinite loop running the keyframes ~1000
131	  times a second) cannot occur: there is no animation object to iterate.
132	
133	**Which thing moves, and why.** The MEDALLION moves; Gwart does not move inside
134	it. The disc, its ring, Gwart and his sparkles stay one rigid piece, so it reads
135	as an object hovering. Translating Gwart inside a circular mask clips his splayed
136	hands against the ring on every cycle, which reads as him sinking into a hole.
137	He also has exactly one pose, so his ink has no independent motion available to
138	it: the sparkle layer is the only part that does, and it gets a brightness
139	breath (opacity .5 -> 1, 5.1s, no travel, no scale) on its own period. The two
140	layers are cropped to the same alpha bbox so they stay in perfect registration.
141	
142	**The sparkle breath, also measured in pixels** (11 samples over its 5100ms
143	period, medallion pinned so only the sparkles move, crop = a 144x34 band across
144	the sparkle arc, counting chartreuse pixels: G>150, B<140, G-B>60):
145	
146	| frame | t (ms) | chartreuse px | mean G |
147	|---|---|---|---|
148	| f00 | 0 | 1548 | 246.9 |
149	| f01 | 510 | 1615 | 249.4 |
150	| f02 | 1020 | 1646 | 251.0 |
151	| f03 | 1530 | 1650 | 251.1 |
152	| f04 | 2040 | 1629 | 250.0 |
153	| f05 | 2550 | 1566 | 247.7 |
154	| f06 | 3060 | 1468 | 245.1 |
155	| f07 | 3570 | 1374 | 242.9 |
156	| f08 | 4080 | 1364 | 242.9 |
157	| f09 | 4590 | 1431 | 244.5 |
158	| f10 | 5100 | 1548 | 246.9 |
159	
160	f10 returns to f00 exactly (1548 / 246.9) after 5100ms. Range 1364-1650, so 286
161	pixels of the arc cross the chartreuse threshold across the breath: visible if
162	you look at it, invisible if you are reading the talk box. Under reduced motion
163	all 11 frames read **1653 / 251.6**, spread **0**, pinned at full opacity.
164	
165	## 6. The Dynamic Island, which Tom did not raise
166	
167	Rendered at **393x852 dpr2 with `:root{--sat:59px !important}`** injected on
168	`:root` exactly where app.css declares it, copying how
169	`tests/fight-layout-audit.mjs` emulates insets. The medallion is pinned at
170	`translateY(-2.5px)`, the HIGHEST point of its float, so the assertion is made
171	against the worst frame rather than a lucky one.
172	
173	First finding, and it invalidated the first run: `#phone` was a fixed 390x844
174	box centred by `place-items: center`, so at 393x852 the whole screen was inset
175	4px from the top and every top-anchored element measured 4px kinder than the
176	truth. `#phone` is now `100vw x 100dvh`, capped, so a 393x852 render is a real
177	393x852 screen.
178	
179	Painted-ink assertions (ink by difference: hide one thing, shoot again, every
180	changed pixel is a pixel that thing was responsible for, shadows and glows
181	included; all animations frozen first, see note below):
182	
183	| what | ink bbox (CSS px) | ink px inside the top 59 |
184	|---|---|---|
185	| Gwart's medallion (disc + ring + hard shadow) | (4, 66.5) - (188, 251.5) | **0** |
186	| the talk box (fill + border + shadow) | (182, 71) - (389, 156) | **0** |
187	| the talk box's TEXT (name + line + chevron) | (194, 85) - (373, 139) | **0** |
188	
189	Clearances below the 59px line, worst frame: medallion **7.5px**, box **12px**,
190	name label **23.7px**, first text baseline **40.6px**. The ART does run to y0 and
191	under the island, which is the point of a full-bleed hero.
192	
193	At 390x844 with `--sat: 0` the medallion ink starts at y **7.5** and the box at
194	y **12**.
195	
196	*The freeze note.* The first ink run was garbage and said so loudly: it read the
197	180x180 medallion at 249,830 ink pixels, nearly twice the pixels it can even
198	cover. Cause: the pet's bob, the eye blink, the rain drops, the caret and the
199	weapon sheen all moved between the two shots of a pair, so every moving pixel
200	was counted as ink belonging to whatever was hidden. Every pair is now taken
201	with `*,*::before,*::after{animation:none;transition:none}` injected first.
202	
203	## 7. Does the talk box cover the bonehead's head?
204	
205	No, and it is measured on painted ink rather than boxes.
206	
207	| | 390x844, --sat 0 | 393x852, --sat 59 |
208	|---|---|---|
209	| figure ink bbox | (37.5, 217.5) - (321, 592) | (57, 273) - (307, 602.5) |
210	| skull + headwear ink bbox | (84, 217.5) - (246, 379.5) | (99, 273) - (242, 416.5) |
211	| talk box rect | (182, 12) 200x80.4 | (182, 71) 203x80.4 |
212	| **figure ink px inside the talk box** | **0** | **0** |
213	| **skull+headwear ink px inside the talk box** | **0** | **0** |
214	| vertical gap, box bottom to skull ink top | **125.1 px** | **121.6 px** |
215	
216	**And the medallion, which is the harder one.** Two things had to be fixed:
217	
218	1. *The float was crossing his hat.* With the figure bottom-anchored at
219	   `bottom: 83px`, his hat's ink topped out at y **193.5** while the medallion's
220	   hard shadow swept down to **197.5** at the bottom of its cycle. The bob
221	   crossed his hat for part of every cycle, which the brief rules out. Fixed by
222	   dropping the figure 11px.
223	2. *The safe area put the medallion ON his head.* The medallion is pinned to the
224	   safe area and the figure stands on the ground, so at `--sat: 59` the medallion
225	   fell 59px while the figure fell ~7. Measured with the figure bottom-anchored:
226	   the medallion's ink covered y 211-251.5 of his headwear, **~40px of
227	   occlusion**, and the render showed the disc sitting on the cat mask's left ear.
228	
229	Both fixed by one declaration:
230	`.hero-char { top: calc(var(--sat) + 190px) }` (190 = the medallion's 10px top
231	offset + its 180px diameter). Because the layers are `object-fit: contain`, the
232	box becomes HEIGHT-constrained rather than width-constrained, so the inset is
233	absorbed as a slightly smaller figure instead of as occlusion:
234	
235	| | --sat 0 | --sat 59 |
236	|---|---|---|
237	| painted art side | 426px | 375px |
238	| figure ink | 283.5 x 374.5 | 250 x 329.5 |
239	| figure ink px | 241,913 | 188,800 |
240	| medallion ink bottom, LOWEST frame | 197.5 | 256.5 |
241	| figure ink top | 217.5 | 273.0 |
242	| **clearance the 5px bob cannot eat** | **20.0 px** | **16.5 px** |
243	
244	**This is the one thing I want Tom to rule on.** The trade is: composition holds
245	at every viewport and nothing ever crosses the figure, at the cost of the
246	character being **22% less ink (12% narrower)** on a Dynamic Island phone than on
247	a 390x844 one. The alternative is a fixed figure size with the medallion
248	overlapping the top of his headwear by up to 40px on island phones. Both are
249	defensible; the second keeps him big and treats the medallion as a foreground
250	badge, which is arguably what Tom's layout already shows.
251	
252	## 8. Speech bubbles: where every line went
253	
254	Tom: *"this would mean players dont have speech bubbles here anymore."*
255	
256	There were TWO speaking surfaces on Today and they were the same DOM node.
257	Both are now Gwart's, and there is exactly one talking surface left on the
258	screen (asserted: `document.querySelectorAll('.talkbox').length === 1`,
259	`.hero-bubble` count 0).
260	
261	### A. The Bonehead's own line, `speechLine()` -> GWART
262	
263	The player's skeleton had ~100 lines across 13 state-gated pools. **Nothing is
264	dropped: every pool keeps its slot in the priority order, the voice changes
265	owner.** Gwart is the maker talking about his work, so a line that was the
266	skeleton's own thought becomes Geppetto's observation of Pinocchio. The routing
267	is unchanged, which matters: the pools are what make the line relevant.
268	
269	| # | pool (priority order, unchanged) | old voice, sample | Gwart's line |
270	|---|---|---|---|
271	| 1 | `S.pendingLevelLine` | one-shot on level-up | "Level 24. I carved the joint. You did the walking." |
272	| 2 | crates unopened (10 lines) | "Crack that crate open already!" | "A crate by his feet, still shut. I gave him hands for this." |
273	| 3 | viewing a past day (4) | "Time traveling, are we?" | "Yesterday is set. You cannot re-cut a finished thing." |
274	| 4 | crops ripe (5) | "I have no thumbs and yet I grew that." | "The garden is ready. I watered it. You pick it." |
275	| 5 | dish ready (5) | "Dinner is ready and I have no throat." | "Something is done in the pot. He cannot smell it. I can." |
276	| 6 | nothing logged (11) | "Feed me a log, chief." | "Nothing logged yet. He runs on what you eat. Feed the boy." |
277	| 7 | protein target hit (8) | "Protein secured. Bones swole." | "Protein is in. That is the part I build bone out of." |
278	| 8 | over kcal target (7) | "Honest logs make strong bones." | "A big day, logged honestly. The ledger is the whole craft." |
279	| 9 | within 350 of target (7) | "Stick the landing tonight." | "You are close. Finish it the way you started." |
280	| 10a | >=12k steps (5) | "My ankles filed a complaint." | "You covered ground today. I felt it in his ankles." |
281	| 10b | streak >= 3 (6) | "Day N. Keep the flame alive." | "Day 24. He was a box of parts once. Look at him." |
282	| 10c | spires held (3) | "One tower flies our name." | "One tower carries your name. I check on it more than I admit." |
283	| 10d | fights ready >= 3 (3) | "I am full of vigor and bad decisions." | "Six fights left in him. He will not say no, so you decide." |
284	| 10e | 23:00-05:00 (3) | "Late one. I do not sleep, but you should." | "Late. I keep these hours. He does not need to." |
285	| 11 | general idle (24) | "I am 206 bones of pure potential." | "Two hundred and six pieces. I know where every one goes." |
286	| 11 | " | "You keep showing up. I keep standing here." | "You keep coming back, so he keeps standing up." |
287	| 11 | " | "Do these ribs make me look confident?" | "Straight back. Good. I worried about that spine." |
288	
289	The mockup carries one line per pool (17 in total) so the whole routing is
290	readable by tapping through; a build would restock each pool.
291	
292	**What Tom loses, and he should know it:** the ~100 lines were written in a
293	voice that is *the player's own character*, self-deprecating and first-person
294	about his own ribs. Roughly a third of them ("Do these ribs make me look
295	confident?", "I peaked in the Cretaceous", "Nobody has ever won an arm wrestle
296	against me twice") have no Gwart translation at all, because the joke IS that
297	the skeleton is talking about himself. They are not rewritten above; they are
298	retired. That is the actual cost of the change and it is not small: it is the
299	funniest third of the writing on the screen.
300	
301	### B. The pet's line, `PET_LINES` -> GWART, as a named speaker
302	
303	This is the one thing in the inventory that had **no home**. In the shipped app
304	the pet is the only NAMED speaker in the entire game (`.tb-name` carries the
305	pet's own name) and its line HOLDS with a gold chevron because the player asked
306	for it. Under "no speech bubbles here anymore", the pet cannot speak.
307	
308	Resolved in the mockup rather than dropped: **tapping the pet still works, still
309	pops, and Gwart comments on the pet.** The tap keeps its reward, the pet keeps
310	being the thing on screen that is alive, and there is one voice.
311	
312	| old | new |
313	|---|---|
314	| "Grrf." / "Bark. Bones. Bark." | "That cloud is not my work. It turned up and stayed." |
315	| "Woof. (Feed him.)" | "It rains indoors. I have stopped asking why." |
316	| "He has opinions." / "That's his whole vocabulary." | "He talks to it. I have never heard it answer." |
317	
318	**Consequence Tom should rule on:** the pet's name no longer appears anywhere on
319	Today. `.tb-name` is now permanently `GWART`, so the one place a player saw what
320	their pet is called is gone. Cheapest fix if he cares: Gwart uses the name
321	("Bo turned up and stayed").
322	
323	### C. Adjacent text that is NOT a speech surface, left alone
324	
325	- `.hero-why` caption, only while level < 3: "N fights ready. Walking earns
326	  more." Not in the mockup (it is a level-1-2 surface and the mockup is level 24),
327	  and it does not conflict with Gwart.
328	- `.unlock-nudge` card (`#unlockNudge`). A tappable card, not speech. Not in the
329	  mockup: at level 24 the shipped screen shows it too, and it would sit below the
330	  nav cards. Flagged rather than silently dropped.
331	- `.cele-bubble` (level-up and breeding celebration overlays). Full-screen
332	  moments, not Today's steady state. Untouched.
333	
334	## 9. Deviations from the approved talk box, and why
335	
336	`js/talkbox.js` is inlined **verbatim** from `origin/feat/talk-box`, with one
337	edit: `import { reducedMotion } from './fx.js'` becomes a local
338	`matchMedia('(prefers-reduced-motion: reduce)').matches`, and the three `export`
339	keywords are dropped so it runs in a plain `<script>`. TALK_MS is still 26. No
340	second typewriter exists in the file.
341	
342	`.talkbox`'s CSS is copied verbatim too. `.gw-box` is PLACEMENT ONLY, the way
343	`.hero-bubble` is, plus two deliberate overrides:
344	
345	1. **`border-color: #e6dcc8`** (opaque cream). `.talkbox`'s default is
346	   `--line-strong`, `rgba(242,233,215,.17)`, chosen against `--surface`. Over
347	   full-bleed artwork a 17% cream border picks up the olive and dissolves. This
348	   is the same failure the shipped `.hero-bubble::before` rule already documents
349	   for its tail ("a triangle drawn with a transparent border colour picks up the
350	   artwork behind it and the outline dissolves over light gear"), and Tom's
351	   layout specifies a cream border.
352	2. **It HOLDS** (`tb-hold` always, so the gold chevron shows and the box waits).
353	   The shipped Today bubble auto-dismisses at 7s via `bubbleOut` because it was
354	   the player's passing thought. Gwart is a fixture on the screen, so his box
355	   waits and the player advances it. Asserted: still at opacity 1 after 10s.
356	
357	Everything else comes from the module and its CSS untouched: the caret and
358	chevron are still structurally exclusive (measured: mid-type caret
359	`inline-block` / chevron `none`; finished caret `none` / chevron `block`), a
360	mid-line tap still skips to the end of the same line, and the `::before` ghost
361	still sizes the box before the first character lands.
362	
363	**Line lengths, measured.** All 20 lines wrap to exactly 2 lines and the box
364	height is **80.4px for every one of them**, so it never resizes between lines,
365	which matters because it sits at the top of the screen over artwork. Longest
366	line is 61 chars ("One tower carries your name...").
367	
368	## 10. Things I decided that Tom should rule on
369	
370	1. **The wallet pill and the trends dot moved.** They were top-right; that is now
371	   Gwart's talk box, and on an island phone the old top-right corner is the
372	   island. They are now a right-aligned row inside the bottom fade, directly
373	   above the LV strip. Same chips, same order, same tap targets. His layout does
374	   not show them at all, so this is my call.
375	2. **Nothing below the nav cards.** His layout ends at the bottom nav, so the
376	   mockup does too. The shipped Today has the calorie ring, the unlock nudge and
377	   the food log below this. With a 688px hero, all of it is below the fold: the
378	   food tracker is now a scroll away on the food tracker's home screen. That is
379	   a product decision, not a layout one.
380	3. **The medallion is 180px, not ~200.** Bought 20px for the talk box's text
381	   column so no line wraps to 3.
382	4. **The figure shrinks on island phones** rather than being occluded. Section 7.
383	5. **The XP pips are gone**, replaced by `91/1,140` right-aligned in Bangers, per
384	   his layout. The shipped screen has 20 pips plus the number.
385	6. **A third of the skeleton's funniest lines are retired**, not translated.
386	   Section 8.
387	7. **The pet's name no longer appears on Today.** Section 8B.
388	8. **Nav cards are the app's real four** (Backpack / Stable / Kitchen / The Pit,
389	   with their real pixel icons and badges), per the brief, not the four in his
390	   layout with one-line descriptions.
391	
392	## 11. What was verified, and how
393	
394	Driven with real mouse clicks at real coordinates, all 14 rows green
395	(`drive.mjs`, exit 0):
396	
397	```
398	PASS  types on rather than printing  10/59 chars
399	PASS  caret shows while typing, chevron does not
400	PASS  a mid-line tap skips to the end of the SAME line
401	PASS  finished: chevron shows, caret does not
402	PASS  named speaker label is GWART
403	PASS  aria-label carries speaker + whole line
404	PASS  a tap on a finished box advances to the next line
405	PASS  the new line finishes typing
406	PASS  the box is still there after 10s (Gwart is a fixture, not a pop-up)
407	PASS  tapping the pet routes its line through GWART's box
408	PASS  there is exactly ONE talking surface in the DOM
409	PASS  no legacy .hero-bubble anywhere
410	PASS  no line wraps past 2 lines  max 2
411	PASS  the box never changes height between lines  80.4
412	PASS  no page errors
413	```
414	
415	Self-containment: `today-mockup.html`, 586 KB, every asset a `data:` URI. No
416	`http`, no `//`, no external `url()` except the app's own inline SVG grain.
417	Both fonts confirmed loaded in the render (`document.fonts.check`: BoldPixels
418	true, Bangers true), and zero images with `naturalWidth === 0`.
419	
420	## 12. Files
421	
422	| file | what |
423	|---|---|
424	| `today-mockup.html` | **the deliverable.** Self-contained, tappable, authored 390x844 |
425	| `render-390x844-sat0.png` | full render, authored size |
426	| `render-393x852-sat59.png` | full render, iPhone 15 Pro with the 59px inset emulated |
427	| `shot-midtype.png` / `crop-shot-midtype.png` | the box mid-type, caret visible |
428	| `shot-finished.png` / `crop-shot-finished.png` | the box finished, chevron visible |
429	| `live-today-seeded.png` | the SHIPPED Today at 390x844 dpr2, for comparison |
430	| `mask-390-figure.png`, `mask-390-medallion.png`, `mask-390-skull.png` | the ink-diff masks the overlap numbers come from |
431	| `m/f00..f12.png`, `mrm/f00..f12.png` | the 13 motion frames, moving and reduced-motion |
432	| `s/`, `srm/` | the 11 sparkle-breath frames, moving and reduced-motion |
433	| `motion.mjs`, `measure_motion.py`, `spark.mjs`, `spark.py` | the motion measurement |
434	| `audit.mjs`, `ink.py` | the safe-area and ink-overlap measurement |
435	| `drive.mjs` | the interaction test |
436	| `build.py`, `mock.css`, `extracted.css`, `part-*.css` | the generator and the CSS copied from the app |
437	
438	## 13. Repo note (not mine, flagging it)
439	
440	The repo at `/Users/tommiller/Documents/Hyperframes Editor/tally` was NOT
441	touched: everything here was read with `git show <ref>:<path>`, and the mockup
442	lives entirely in this scratchpad. No commit, no branch, no PR.
443	
444	Worth knowing anyway: `git status` at the start of this session showed
445	`M native/android/app/build.gradle` plus three untracked docs. By the end it also
446	showed **`A docs/SHIP-LEDGER.md` staged**, a file that did not exist at the
447	start. Nothing I ran can stage a file (only `git show`, `git diff --stat`,
448	`git log`, `git branch`, `git status`), so another session is working in this
449	checkout concurrently. Left alone. Branch is `ext/art-memory-census`.
450	