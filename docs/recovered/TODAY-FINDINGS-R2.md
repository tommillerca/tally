1	# Today mockup, revision 2: shrink the figure, make the medallion his FACE
2	
3	Written as I go. Output folder is the same one as `FINDINGS.md`.
4	
5	Tom's note, verbatim: *"shrink the figure but also scale up the wizard (gwart)
6	inside the circle so it's his face"*.
7	
8	Part 1 (keep the figure shrink) is a no-op: `.hero-char { top: calc(var(--sat) +
9	190px) }` is already in `mock.css` and stays. Re-asserted in section 6 below.
10	Part 2 is the work.
11	
12	## 1. The ruler, reproduced
13	
14	All source coordinates are in `gwart-no-stars.png` / `gwart-with-stars.png`
15	space (2048 x 2048). `gwart-no-stars.png` alpha bbox measured (226, 442) -
16	(1820, 1689), matching the brief.
17	
18	His ears are the two pink components that flank the nose. Pink is
19	`a>16 & r>190 & r-g>50 & r-b>20 & g>90`; connected components labelled, the ear
20	pair is unambiguous (two 6.8k-px blobs, mirror-symmetric to 0.0px in y):
21	
22	| component | area px | centroid |
23	|---|---|---|
24	| left ear | 6820 | (838.9, 865.7) |
25	| right ear | 6766 | (1208.2, 865.7) |
26	
27	**Ear-to-ear centroid span = 1208.2 - 838.9 = 369.3 px.** Matches the previous
28	pass exactly, so the ruler is the same ruler.
29	
30	**Face height ruler = 328 px**, ear-component top (y = **808**) to beard bottom
31	(y = **1136**). Reconstruction of the beard-bottom row: the beard is the largest
32	cream component (`r>215 & g>205 & b>170 & |r-g|<28`), bbox (775, 877) -
33	(1272, 1183), widest row 445 px at y 1111; the taper drops below one third of
34	that width at y **1138**. That is within 2 px of the previous pass's 1136, so
35	1136 is adopted verbatim and the number stays comparable to the 33.5 / 41.8 /
36	55.3 / 77.0 px history.
37	
38	## 2. Face height BEFORE, measured off the shipped render
39	
40	Not computed from CSS. Measured on `render-390x844-sat0.png` (390x844 dpr2) with
41	the same pink-component ruler:
42	
43	| | device px @dpr2 | CSS px |
44	|---|---|---|
45	| left ear centroid | (157.2, 179.7) | (78.6, 89.9) |
46	| right ear centroid | (225.9, 179.7) | (113.0, 89.9) |
47	| ear-to-ear span | 68.7 | **34.35** |
48	
49	Scale on screen = 34.35 / 369.3 = **0.09301**.
50	**Face height BEFORE = 328 x 0.09301 = 30.5 CSS px.**
51	
52	That is the smallest of every pass on record (33.5 was already called too small
53	against a 40 px legibility bar), and it is why Tom's note is right. Cause: the
54	440 x 440 sprite holds the WHOLE figure including feet, is letterboxed inside a
55	440-square, and is then drawn at 90% of a 168 px content box, so his face gets
56	168 x 0.9 x (328/1807) of the medallion.
57	
58	---
59	
60	# R3: Tom's second round of notes
61	
62	Everything from here supersedes sections 3 to 5 of the R2 work above where they
63	conflict. R2 put his face at **75.3 px** inside a 180px circle. Tom then asked for
64	a wide short frame, which caps the face at roughly 40 px. Both numbers are real
65	and the tradeoff is section 5.
66	
67	Tom's R3 notes, verbatim:
68	1. *"gwart's icon needs to be the width of the text box next to him, essentially
69	   half his current height"*
70	2. *"lose the experience number down below and use the current bar that we have live"*
71	3. *"the currency and trend icons feel out of place"*
72	
73	Plus Cam's authored CSS animation, which arrived mid-build.
74	
75	## 3. The ruler, and a bug in the first version of it
76	
77	Section 1's ruler stands: **ear-to-ear centroid span 369.3 px** and **face height
78	328 px** (ear top y 808 to beard bottom y 1136) in the 2048-square source.
79	
80	`face-ruler.py` now self-checks against that source and prints
81	`span 369.29 / face 327.99`, so the tool is verified on the art it was defined
82	from before it is pointed at any render.
83	
84	It needed that self-check. The first version picked the ears as *the widest
85	mirror-symmetric pink pair*, which is correct in a circle crop and **wrong in the
86	wide one**: his hands and his feet are also pink and also mirror-symmetric, so in
87	the plaque it measured the HANDS and reported a face height of **152.6 px**, which
88	is larger than the whole frame. The rule is now: a candidate is a mirror pair with
89	his NOSE between them (same y, same area to 15%, a third blob at their x midpoint),
90	and the ears are the **narrowest** such pair. In the source the ears span 369.3,
91	the feet 800.8 and the hands 1087.9, so narrowest is unambiguous.
92	
93	## 4. The plaque: shape, size and what it costs
94	
95	**Shape: a rounded rectangle**, not a pill and not a wide ellipse. It borrows the
96	talk box's own frame exactly, `2px` border, `--radius-sm` 13px, `--sh`
97	`4px 5px 0 rgba(0,0,0,.55)` hard and unblurred. The two are then a matched
98	inverted pair, a cream plate with a dark edge beside a dark plate with a cream
99	edge, which is the app's sticker idiom. A pill or an ellipse fights the box's
100	corners and reads as a different family of object.
101	
102	**Size: 185 x 90 at a 390 viewport.** 185 is arithmetic, not taste:
103	`4px left margin + 185 + 8px gap + 185 + 8px right margin = 390`. Both widths are
104	written as the same expression, `calc((100% - 20px) / 2)`, so they still match on a
105	393 (186.5 each) or 430 screen instead of drifting apart.
106	
107	| | R1 | R2 | **R3, shipped** |
108	|---|---|---|---|
109	| frame | 180 circle | 180 circle | **185 x 90 plaque** |
110	| what is in it | the whole figure | hat + face + beard | **hat + face + beard + both hands** |
111	| **face height, same ruler** | **30.3 px** | 75.4 px | **40.8 px** |
112	| hat | whole, tiny | whole | **whole** |
113	| hands | in frame, tiny | gone | **in frame** |
114	| Cam's star arc | in frame | 0% of it | **48.2% of it** |
115	
116	`medallion-before-after.png` is those three at 1:1, shot off real renders with the
117	float pinned to its resting midpoint, so the face can be judged rather than
118	described.
119	
120	**Does the pointed hat survive? Yes, whole, and this was the binding constraint.**
121	Measured: the hat cone plus brim is the silhouette's middle segment from y 442
122	(the tip) to y 985, spanning x 676 to 1370 at its widest. The crop is
123	`(293, 442) - (1753, 1136)`, so the tip sits on the crop's top edge and the brim
124	has 383 px of slack on each side. Zero hat pixels are cut. He does not become a
125	bearded man in a visor.
126	
127	**What the crop costs.** The robe and the feet are gone, which is the point. The
128	outermost fingers of both hands run off the frame: his left hand starts at source
129	x 247 against a crop left edge of 293, so 46 px of it and 48 px of the right hand
130	are outside. That reads as a cropped portrait rather than as damage, and it is a
131	straight gain on R2, where both hands were cut off entirely.
132	
133	## 5. The conflict Tom has to know about: 90px caps his face at ~41px
134	
135	His head is as tall as it is wide: hat tip to beard bottom is **694 px** and the
136	brim is **694 px** across. So with the whole hat in frame the face can only ever be
137	`328 / 694 = 47.3%` of the content height, whatever the width is. The frame is 90px
138	with a 2px border, so:
139	
140	**face height = 0.473 x 86 = 40.6 px predicted, 40.8 px measured.**
141	
142	Widening the plaque does nothing for this. The only levers are frame height and
143	cutting the hat, and here is the whole ladder, each rendered and looked at:
144	
145	| option | face | what it costs |
146	|---|---|---|
147	| 90px frame, whole hat | **40.8 px** | nothing. This is what shipped. |
148	| 90px frame, cone cut mid-way | 55.3 px | the hat is flat-topped |
149	| 90px frame, brim and face only | 82.0 px | **no cone at all: the visor failure** |
150	| 116px frame, whole hat | 55 px | no longer "half his current height" |
151	| 180 circle, whole hat (R2) | 75.4 px | the shape Tom just replaced |
152	
153	40.8 px clears the 40 px legibility bar that the 33.5 px pass failed, and it is
154	**1.35x** R1's 30.3 px. Relative to its frame he is far more prominent than before:
155	his face is 47% of the plate's height, against 18% in R1's circle. But it is
156	**34.6 px smaller than R2**, and that is the price of the wide short frame. If Tom
157	wants the R2 number he has to give the frame its height back.
158	
159	## 6. Cam's `wizard-cast` animation: what was taken and what was left
160	
161	`tally-refs/wizard/animation/`. Checked first: `WIZARD_NPC.png` is **byte-identical**
162	to `gwart-no-stars.png`, and `WIZARD_NPC_w_STARS.png` to `gwart-with-stars.png`;
163	only `WIZARD_JUSTSTARS.png` differs from `gwart-sparkles-only.png`, so his star
164	layer is the one now used.
165	
166	**The question was whether his star arc survives a wide face crop. It does.**
167	Measured on his own runtime layer: **41,845 of 86,879 star pixels, 48.2% of the
168	arc**, fall inside the crop, and they cover the plate from y 0 to y 59.7 of its
169	86 px height. Not fragments in a corner. So his animation is used **wholesale**
170	rather than reduced to `zBreathe`, and the hand-rolled 5.1s sparkle breathe from
171	R2 is gone: one authored motion beats two invented ones.
172	
173	`part-wizard.css` is his file copied verbatim with four deltas, each written into
174	the file next to the rule it changes:
175	
176	1. **`.wz-scene` dropped.** `.gw` is the scene: it already supplies position and
177	   `overflow: hidden`, and it must not take his `aspect-ratio: 1`. His
178	   `.wz-scene img` rule goes with it because `.gw img` does the identical job.
179	2. **The layers are pre-cropped** to the frame's aspect, both with the same rect,
180	   so the sway rotates his stars over a still body in the registration he drew.
181	   All his positions are percentages of the container, so the three clip slices,
182	   the sway origin and the entrance still land.
183	3. **Both palm glows are NOT used, and this is a measurement not a preference.**
184	   They are lime `rgba(211,255,60,.55)` with `mix-blend-mode: screen`. Computed
185	   against the actual backdrops: over his demo's `#0d0c12` page that is a
186	   **134-channel shift** (a real glow); over this plaque's `#f2e9d7` plate it is a
187	   **12-channel shift** (invisible); over his pink palms **58** (a peach wash, not
188	   a glow). They belong where he is on the dark ground, which is onboarding and
189	   the Emporium hero.
190	4. **Reduced motion disables the twinkle too.** His README says the twinkle is
191	   low-amplitude and can stay. It is opacity-only so it would not break the 0.00px
192	   travel assertion, but it does break the assertion that proves nothing is
193	   animating at all (13 frames, one hash). Everything off is the provable answer.
194	
195	**Both motions run, and they are on different objects.** My `gwFloat` translates
196	the PLAQUE; his `zOrbitSoft` rotates the STAR LAYER inside it; his `zBreathe`
197	scales the BODY. Periods 6.4s / 9s / 5.4s plus twinkles at 3.6 / 4.4 / 3.0, none a
198	multiple of another, so nothing on the screen ever pulses in step. Amplitudes,
199	measured below: 5.00px, 1.34px and a 1.2% scaleY. The entrance plays once on load.
200	**Flagging it:** in the real app Today re-renders on every tab switch, so his 2.4s
201	cast would replay each time you return to Today. That is a product call, not a
202	layout one, and it is one line to gate.
203	
204	## 7. The currency and trend chips: three placements, one recommended
205	
206	R2's placement (a right-aligned row on its own line above the level plate) is what
207	Tom rejected: it was a third plate hovering in the middle of the artwork with
208	nothing above or below it. They cannot go back to the top right, which is now the
209	talk box and, on an island phone, the island. Three replacements were built and
210	rendered at 390x844 dpr2:
211	
212	| | where | XP bar | cost |
213	|---|---|---|---|
214	| **C, recommended, `today-mockup.html`** | tucked under Gwart's plaque, left-aligned to it | full width | still over the artwork |
215	| A, `alt-A.html` / `alt-A.png` | a strip below the hero, off the artwork entirely | full width | adds a 36px band and pushes the doors down; the pill's own `--surface` fill nearly vanishes against `--bg`, so the chips read unanchored |
216	| B, `alt-B.html` / `alt-B.png` | sharing the bottom line with the XP bar | squeezed to ~55% | the bar stops reading as a bar |
217	
218	**C** is the recommendation: the top-left becomes a status column (Gwart, then the
219	balances) instead of chips floating in open art, the XP bar keeps its full width,
220	and it costs no vertical space. **If Tom's objection was specifically that they sit
221	ON the artwork at all, A is the answer and it is already built.**
222	
223	A fourth option was rejected on sight: putting the chips on the level row itself.
224	It was built first and truncated "Bone Grandmaster" to "BONE GR...".
225	
226	## 8. The XP bar: what was reproduced
227	
228	Tom: *"lose the experience number down below and use the current bar that we have
229	live"*. `91/1,140` in Bangers is gone.
230	
231	What ships live on Today is **`.hero-xprow`**, rendered by `js/app.js` as
232	`XP_PIPS = 20` pips with `ceil(pct / 5)` lit. Captured off the live screen
233	(`live-today-seeded.png`) and reproduced from `app.css` lines 7282-7288 verbatim:
234	
235	```
236	.hero-xprow   { display:flex; align-items:center; gap:3px; }
237	.hero-xprow i { display:block; height:6px; border-radius:2px; flex:1;
238	                background: rgba(242,233,215,.16); }
239	.hero-xprow i.on { background: var(--gold); }
240	```
241	
242	91/1,140 is 7.98%, so **2 of the 20 pips are lit**, which is the app's own
243	arithmetic rather than a drawing.
244	
245	**One deviation, and it follows from Tom's instruction.** Live the row is
246	`width: 62%`, because the `805/1,300` number fills the rest of the line. The number
247	is gone, so the row takes the full width and reads as a bar.
248	
249	There is also a genuinely continuous bar live in the app, `.xp-bar` (8px tall, 5px
250	radius, `--surface-3` track, a `#9ed32e` to `--accent` gradient), but it is not the
251	Today element. If "bar" meant that one, say so: it is a four-line swap.
252	
253	## 9. Everything re-asserted, off pixels
254	
255	### The float, `gwFloat` on the plaque
256	13 screenshots at dpr4 across one 6400ms period, position read as the sub-pixel
257	luminance crossing down the column through the plaque's centre (x = 94 CSS).
258	
259	- **PEAK TO PEAK 5.00 px** (7.395 to 12.395 CSS).
260	- **PERIOD 6.4 s**: f12 returns to f00's exact 9.646 after 6400ms.
261	- **13 of 13 frames have distinct md5s**, so nothing is frozen.
262	- WAAPI on the real element: one animation, `gwFloat`, 6400ms, `running`.
263	
264	### Cam's sway, `zOrbitSoft` on the star layer
265	13 screenshots at dpr4 across one 9000ms period. The float, the three twinkles and
266	the entrance are all pinned first, so what is left is his rotation and nothing
267	else; position is the centroid of the chartreuse star mask.
268	
269	- **star centroid travel: 1.34 px in x, 0.74 px in y.**
270	- **13 of 13 distinct md5s.** WAAPI: `zOrbitSoft`, 9000ms, delay 2400ms, running.
271	
272	### Reduced motion
273	- `#gw.getAnimations()` **[]**, `animation-name: none`, `animation-duration: 0s`.
274	- 13 frames all read edge **9.895 px**, one md5. **PEAK TO PEAK 0.00 px**, and
275	  9.895 is the exact midpoint of the moving range (7.395 + 12.395) / 2 = 9.895, so
276	  it rests dead centre rather than at a cycle extreme.
277	- Run again with **nothing injected at all** (`PIN=0`), so the media query alone is
278	  doing the work: `.wz-sway` **[]**, `.wz-body` **[]**, `.wz-stars-l` **[]**, star
279	  centroid travel **0.00 px**, **1 of 13** distinct hashes.
280	- The same unpinned run **without** reduced motion: **13 of 13** distinct hashes and
281	  a 65.01 px centroid swing. So the reduced-motion check demonstrably goes red on a
282	  page that is still animating; it is not passing by accident.
283	- No duration is ever collapsed to 0.001s. Every animation goes to `none`, so there
284	  is no animation object left to iterate a thousand times a second.
285	
286	### The Dynamic Island, 393x852 with `--sat: 59px` emulated
287	Painted ink by difference, every animation frozen first and the plaque pinned at
288	`translateY(-2.5px)`, its highest point, so the assertion is made against the worst
289	frame.
290	
291	| what | ink bbox (CSS px) | ink px inside the top 59 | clearance |
292	|---|---|---|---|
293	| Gwart's plaque (plate + frame + hard shadow + stars) | (4, 66.5) - (195, 161.5) | **0** | 7.5 px |
294	| the talk box (fill + border + shadow) | (199, 69) - (389, 154) | **0** | 10.0 px |
295	| the talk box's TEXT (name + line + chevron) | (210.5, 83) - (373, 137) | **0** | 24.0 px |
296	
297	### The head overlap
298	
299	| | 390x844, --sat 0 | 393x852, --sat 59 |
300	|---|---|---|
301	| figure ink bbox | (33, 204.5) - (325.5, 592) | (33, 209.5) - (327.5, 599.5) |
302	| skull + headwear ink bbox | (80.5, 204.5) - (247.5, 372) | (81.5, 209.5) - (249.5, 377.5) |
303	| **figure ink px inside the talk box** | **0** | **0** |
304	| **skull + headwear ink px inside the talk box** | **0** | **0** |
305	| **plaque ink px inside the talk box** | **0** | **0** |
306	| plaque ink bottom, LOWEST frame | 107.5 | 166.5 |
307	| figure ink top | 204.5 | 209.5 |
308	| **clearance the 5px float cannot eat** | **97.0 px** | **43.0 px** |
309	
310	R2's plaque overlapped the talk box's left edge by a 279-pixel sliver of its own
311	shadow. At 185 wide with an 8px gap that is now **0**.
312	
313	### The talk box
314	`drive.mjs` exit 0, all 15 rows green, driven with real mouse clicks at real
315	coordinates: types on rather than printing, caret and chevron structurally
316	exclusive, a mid-line tap skips to the end of the same line, a finished tap
317	advances, the box holds past 10s, the pet routes through Gwart, exactly one
318	`.talkbox` in the DOM, zero `.hero-bubble`, **no line wraps past 2 lines**, and the
319	**box height is 80.4 for every one of the 20 lines**.
320	
321	The width change was checked before it was made, not after: `probe-box.mjs` walks
322	every line at 200 / 185 / 181 px wide and at `--tb-size` 10 / 11 / 11.5 / 12 px.
323	**11px was already the ceiling** (11.5px produces the first 3-liner) and the
324	narrower box costs nothing: 2 lines and 80.4px at every width tried.
325	
326	### The figure shrink Tom accepted
327	The rule that prevents the plaque ever touching his head is unchanged in form:
328	`.hero-char { top: calc(var(--sat) + <plaque top offset + plaque height>) }`. The
329	number went from 190 to **100** because the plaque went from 180 tall to 90.
330	
331	What that did to the cost, which Tom should know: at 190 the box was 425.9 tall at
332	`--sat 0` against a 440 width, so the figure was HEIGHT-constrained and an island
333	phone really did absorb the inset as 22% less ink. At 100 the box is 515.9 / 464.9
334	tall against 440 / 443, so the figure is WIDTH-constrained at both viewports.
335	
336	| figure ink px | --sat 0 | --sat 59 |
337	|---|---|---|
338	| R2 (190) | 241,913 | 188,800 |
339	| **R3 (100)** | **257,863** | **260,692** |
340	
341	The two viewports are now within **1.1%** of each other instead of 22% apart. The
342	guard is intact; the cost it used to impose is gone as a side effect of Tom's own
343	change. Nothing was done to the figure itself, and it is 6.6% more ink than the
344	render he called "getting there".
345	
346	## 10. Does it run in a sandboxed iframe, and what that test does and does not prove
347	
348	The failure mode: `<script type="module">` in an iframe with an opaque origin fails
349	to load, the HTML and CSS paint, no JS runs, and the screen looks alive and is dead.
350	
351	The mockup is a **plain classic `<script>`**. `talkbox.js` is inlined with its three
352	`export` keywords dropped and its one `import` replaced by a local
353	`matchMedia('(prefers-reduced-motion: reduce)').matches`, so there is no top-level
354	import or export anywhere in the file.
355	
356	`sandbox.mjs` + `sandbox.py` assert **pixels**, not `typeof runTalkBox`: the box
357	types character by character, so a page whose script never ran has an EMPTY box.
358	The same 170x45 crop of the box's text column is shot twice, 900ms apart, and the
359	test demands both ink in the second shot and MORE of it than the first, which only
360	a running typewriter produces. Three environments, all green:
361	
362	```
363	PASS  no <script type="module">
364	PASS  no top-level import/export
365	PASS  normal page (file://)                  ink 816 -> 2608
366	PASS  srcdoc + sandbox="allow-scripts"       ink 816 -> 2672
367	PASS  blob: URL + sandbox="allow-scripts"    ink 816 -> 2672
368	```
369	
370	**And the honest half.** A prove-red was run: `module-variant.html` is the same file
371	with `<script>` changed to `<script type="module">`. The string check goes **FAIL**
372	as it should. **The pixel check stayed green on it**, because this Chrome does run
373	module scripts in an `allow-scripts` srcdoc and blob iframe. So the pixel test
374	proves the mockup runs in those three environments; it does **not** reproduce Tom's
375	preview sandbox, and the string check is what actually catches the module bug.
376	`module-variant.html` is kept so the prove-red can be re-run.
377	
378	## 11. What Tom still needs to rule on
379	
380	1. **Face size versus frame height.** 40.8 px in the 90px plaque, or 75.4 px in a
381	   180px circle. Nothing in between exists without cutting his hat. Section 5 has
382	   the ladder.
383	2. **Where the currency chips go.** C shipped, A is built and rendered if the
384	   objection was "off the artwork entirely". Section 7.
385	3. **Whether Cam's 2.4s entrance should replay on every tab switch**, since Today
386	   re-renders each time. Section 6.
387	4. **Whether "the bar" meant the 20 pips or `.xp-bar`.** Section 8.
388	5. Carried over from R2 and still true: a third of the skeleton's funniest lines
389	   are retired rather than translated, the pet's name no longer appears on Today,
390	   and nothing renders below the four doors.
391	
392	## 12. Files
393	
394	| file | what |
395	|---|---|
396	| `today-mockup.html` | **the deliverable.** Placement C. Self-contained, classic script, authored 390x844 |
397	| `alt-A.html` / `alt-A.png` | chip placement A, off the artwork |
398	| `alt-B.html` / `alt-B.png` | chip placement B, sharing the bar's line |
399	| `render-390x844-sat0.png` | full render, authored size |
400	| `render-393x852-sat59.png` | full render, iPhone 15 Pro with the 59px inset emulated |
401	| `medallion-before-after.png` | R1 / R2 / R3 medallions at 1:1, off real renders |
402	| `med-before.png`, `med-after.png`, `med-plaque.png` | the three crops those came from |
403	| `shot-plaque.png` | the shipped screen with the animation unfrozen |
404	| `crop-face.py` | the crop, with the arithmetic that produced it |
405	| `part-wizard.css` | Cam's animation plus the four documented deltas |
406	| `face-ruler.py` | the face measurement, self-checking against the source |
407	| `probe-box.mjs` | the talk-box wrap and height probe across widths and sizes |
408	| `sway.mjs` / `sway.py`, `w/`, `wrm/`, `w-nopin/`, `wrm-nopin/` | Cam's sway measured in pixels, moving and reduced |
409	| `motion.mjs`, `motion-rm.mjs`, `measure_motion.py`, `m/`, `mrm/` | the float measured in pixels |
410	| `sandbox.mjs`, `sandbox.py`, `sb/`, `module-variant.html` | the classic-script check and its prove-red |
411	| `audit.mjs`, `ink.py` | the safe-area and ink-overlap measurement |
412	| `drive.mjs` | the interaction test |
413	| `build.py`, `mock.css`, `part-*.css` | the generator and the CSS copied from the app |
414	
415	The repo at `/Users/tommiller/Documents/Hyperframes Editor/tally` was **not**
416	touched: everything was read with `git show <ref>:<path>` and nothing was written,
417	committed or branched.
418	