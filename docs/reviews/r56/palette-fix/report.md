# r56 B1 palette separation review

Work order SHA256: `51e94d8f2c3d6be3f6902e9228f978021698819bf50c738a178ee1ea9f05b8b2` (verified). All source and output paths resolved inside this checkout.

The required minimum is strictly greater than **20.00 mean core OKLab delta x 100**. This is about twice the reported C1 base/frost gap of 10.13 and gives a practical margin above every old confused pair. It is an art acceptance threshold, not a universal perceptual guarantee. The lowest final value is 21.138601, giving 1.138601 headroom.

Only declared region targets and their explanatory comment changed in the generator. Cold C1 frost now uses saturation 0.72 and value 0.92; C3 frost shifts toward saturated cyan. Rose primary fills use vivid pink at hue 322, with a darker C3 fill at 325. C2 ember becomes brighter orange; C4/C5 ember becomes deep burnt orange. C5/C6 toxic shifts greener to separate it from the base.

All 36 variants were visually inspected at a maximum visible dimension of 64 pixels against both game surfaces in [thumbnails-64.png](thumbnails-64.png). Distinct colour families remain visible, including C6 stripes. The method measures recolour cores, so C6's limited stripe area still produces smaller whole-pet differences.

| Species | Old closest pair | Old minimum | New closest pair | New minimum |
|---|---|---:|---|---:|
| C1 | base/frost | 10.130837 | base/toxic | 21.399511 |
| C2 | ember/rose | 11.070200 | base/ember | 21.138601 |
| C3 | ember/rose | 13.507828 | ember/rose | 21.349882 |
| C4 | ember/rose | 9.620858 | base/rose | 23.599592 |
| C5 | ember/rose | 9.638374 | ember/midnight | 21.185836 |
| C6 | ember/rose | 13.161264 | ember/rose | 21.776558 |

## Proof and protection

- `node tests/unit.test.js`: exit 0, `371 passed, 0 failed`. Exact output: [unit.test.output.txt](unit.test.output.txt).
- `node tests/pet-palette-audit.mjs`: exit 0, all 90 pairs exceed 20.00. The guard is registered in PURE and in the agreed unit command. It reads actual PNGs, enforces original mask counts, dimensions and alpha, and checks protected ink, whites, teeth and blush against the source bytes.
- Before replacing shipped art, `python3 tests/pet-palette-check.py` exited 1 and rejected 17 of 90 pairs across all six species: [control-before.txt](control-before.txt).
- Persistent CONTROL substitutes the actual shipped pre-fix C1 frost PNG. It must exit 1 and name C1 base/frost at 10.130837: [guard-after.txt](guard-after.txt).
- `python3 docs/reviews/r56/measure.py`: exit 0, 90 pairs and 18 layer inventories. The review script is unchanged. Its results agree with the guard: [measure-after.txt](measure-after.txt). CSV line endings were normalized to LF after measurement; numeric values were not edited.
- `python3 scripts/build-bh-thumbs.py --check`: exit 0, all 1,300 thumbnails fresh: [thumb-check.txt](thumb-check.txt).
- All previously invariant source pixels remain byte-identical across all 30 morphs, including visible protected regions, and all alpha bytes remain identical: [protected-pixels.txt](protected-pixels.txt). Generator checks also passed for ink and protected fills: [region-targets.md](region-targets.md).
- The generator algorithm, source palette, base art, app code, `js/petanim.js`, renderer and animation layers are unchanged. Shared antialias seams continue to be blended by the original generator against the new region targets.

## Rose versus rarity colours

Minimum OKLab delta x 100 from any primary Rose fill (body, or C6 stripes) to each glow:

| Species | Rare cyan #6fd0ff | Epic violet #c084fc | Legendary gold #ffc961 |
|---|---:|---:|---:|
| C1 | 37.0106 | 19.6879 | 36.4569 |
| C2 | 37.0106 | 19.6879 | 36.4569 |
| C3 | 33.8788 | 16.7853 | 34.0765 |
| C4 | 37.0106 | 19.6879 | 36.4569 |
| C5 | 37.0106 | 19.6879 | 36.4569 |
| C6 | 37.0106 | 19.6879 | 36.4569 |

Rose stays pink; no Rose target equals a rarity glow. The 20.00 guard applies to within-species pairs, as ordered, rather than to glow comparisons.

## Files and scope

14 morph masters changed, with their 42 corresponding 192/384/trim thumbnails. The remaining 16 regenerated masters are byte-identical to their previous files. Targets, tests, control fixture, updated review CSV and evidence files are listed exactly in [files-changed.txt](files-changed.txt).

Denied or blocked actions: none. Deviations: none. No commit, push or publish was attempted. The local generator's `--ship` flag only wrote PNGs into this checkout. The PNG-reading guard requires Python, NumPy, Pillow and SciPy, the same image dependencies used by the generator.

## All 90 pairs, before beside after

Core counts remain C1 8,694; C2 7,540; C3 8,252; C4 6,947; C5 8,833; C6 126,833. Full precision values are in [before CSV](colour-pairs-before.csv) and [after CSV](../colour-pairs.csv). Both core and alpha-weighted visible deltas below use the unchanged review metric.

| Species | Pair | Core before | Core after | Visible before | Visible after |
|---|---|---:|---:|---:|---:|
| C1 | base/ember | 32.541832 | 32.541832 | 17.407383 | 17.407383 |
| C1 | base/frost | 10.130837 | 30.135068 | 5.468159 | 15.900317 |
| C1 | base/toxic | 21.399511 | 21.399511 | 11.640744 | 11.640744 |
| C1 | base/midnight | 56.387284 | 56.387284 | 29.762948 | 29.762948 |
| C1 | base/rose | 37.738279 | 42.726187 | 20.445546 | 23.169086 |
| C1 | ember/frost | 27.992137 | 30.978225 | 14.977179 | 16.572497 |
| C1 | ember/toxic | 31.541982 | 31.541982 | 16.895503 | 16.895503 |
| C1 | ember/midnight | 39.344543 | 39.344543 | 20.913521 | 20.913521 |
| C1 | ember/rose | 12.606863 | 21.719336 | 7.147114 | 12.030533 |
| C1 | frost/toxic | 23.359334 | 37.126141 | 12.752867 | 19.894672 |
| C1 | frost/midnight | 46.983198 | 28.876480 | 24.888967 | 15.276036 |
| C1 | frost/rose | 31.952391 | 33.325251 | 17.429222 | 18.138988 |
| C1 | toxic/midnight | 57.509552 | 57.509552 | 30.474684 | 30.474684 |
| C1 | toxic/rose | 41.232987 | 49.346594 | 22.105076 | 26.492129 |
| C1 | midnight/rose | 34.479874 | 35.520490 | 18.444239 | 18.993740 |
| C2 | base/ember | 14.221891 | 21.138601 | 8.048320 | 11.687124 |
| C2 | base/frost | 27.309753 | 27.309753 | 14.953966 | 14.953966 |
| C2 | base/toxic | 29.089542 | 29.089542 | 15.977411 | 15.977411 |
| C2 | base/midnight | 29.764519 | 29.764519 | 16.194136 | 16.194136 |
| C2 | base/rose | 21.456199 | 30.059721 | 11.842048 | 16.444111 |
| C2 | ember/frost | 28.651755 | 25.749004 | 15.489660 | 13.960351 |
| C2 | ember/toxic | 33.455305 | 26.752654 | 18.031430 | 14.449952 |
| C2 | ember/midnight | 26.839552 | 39.324446 | 14.582534 | 21.232970 |
| C2 | ember/rose | 11.070200 | 21.359324 | 6.103156 | 11.677786 |
| C2 | frost/toxic | 22.878812 | 22.878812 | 12.462582 | 12.462582 |
| C2 | frost/midnight | 35.714380 | 35.714380 | 19.228549 | 19.228549 |
| C2 | frost/rose | 27.117245 | 29.623586 | 14.666698 | 16.046669 |
| C2 | toxic/midnight | 49.079250 | 49.079250 | 26.543342 | 26.543342 |
| C2 | toxic/rose | 37.623199 | 43.264170 | 20.431572 | 23.488475 |
| C2 | midnight/rose | 28.671345 | 33.985550 | 15.445283 | 18.271581 |
| C3 | base/ember | 26.927451 | 26.927451 | 16.652946 | 16.652946 |
| C3 | base/frost | 17.278894 | 25.138995 | 10.792265 | 15.590112 |
| C3 | base/toxic | 34.857196 | 34.857196 | 21.677012 | 21.677012 |
| C3 | base/midnight | 29.820938 | 29.820938 | 18.572936 | 18.572936 |
| C3 | base/rose | 23.111232 | 24.743176 | 14.341590 | 15.437023 |
| C3 | ember/frost | 25.487999 | 31.757963 | 15.828059 | 19.699098 |
| C3 | ember/toxic | 25.533257 | 25.533257 | 15.776168 | 15.776168 |
| C3 | ember/midnight | 39.324901 | 39.324901 | 24.490057 | 24.490057 |
| C3 | ember/rose | 13.507828 | 21.349882 | 8.627904 | 13.543047 |
| C3 | frost/toxic | 22.254320 | 22.470039 | 13.912185 | 14.036236 |
| C3 | frost/midnight | 41.631617 | 48.424490 | 25.913057 | 30.024738 |
| C3 | frost/rose | 28.434108 | 42.357199 | 17.731375 | 26.386428 |
| C3 | toxic/midnight | 49.972389 | 49.972389 | 31.208424 | 31.208424 |
| C3 | toxic/rose | 34.404858 | 42.609679 | 21.581311 | 26.723455 |
| C3 | midnight/rose | 30.432922 | 28.703932 | 18.888295 | 17.819108 |
| C4 | base/ember | 12.762106 | 29.117815 | 5.507707 | 11.691339 |
| C4 | base/frost | 25.239816 | 25.239816 | 10.236247 | 10.236247 |
| C4 | base/toxic | 24.125147 | 24.125147 | 9.626602 | 9.626602 |
| C4 | base/midnight | 44.790840 | 44.790840 | 17.648946 | 17.648946 |
| C4 | base/rose | 18.450906 | 23.599592 | 8.443550 | 10.486918 |
| C4 | ember/frost | 31.634839 | 39.611075 | 13.150609 | 16.184718 |
| C4 | ember/toxic | 31.056495 | 36.456208 | 12.846703 | 14.908368 |
| C4 | ember/midnight | 37.391110 | 24.713277 | 14.747625 | 9.977608 |
| C4 | ember/rose | 9.620858 | 28.579242 | 4.832277 | 11.979940 |
| C4 | frost/toxic | 23.932368 | 23.932368 | 9.865217 | 9.865217 |
| C4 | frost/midnight | 40.492909 | 40.492909 | 16.202736 | 16.202736 |
| C4 | frost/rose | 30.719158 | 31.489906 | 12.995166 | 13.382327 |
| C4 | toxic/midnight | 45.520096 | 45.520096 | 18.347840 | 18.347840 |
| C4 | toxic/rose | 36.789631 | 43.147240 | 15.801363 | 18.303954 |
| C4 | midnight/rose | 33.245470 | 36.917830 | 13.558326 | 14.961192 |
| C5 | base/ember | 12.233108 | 27.454134 | 6.598017 | 14.469472 |
| C5 | base/frost | 14.754988 | 21.790508 | 7.988715 | 11.608873 |
| C5 | base/toxic | 15.170725 | 25.872913 | 8.308878 | 13.851755 |
| C5 | base/midnight | 35.230053 | 35.230053 | 18.432815 | 18.432815 |
| C5 | base/rose | 17.214425 | 24.142470 | 9.134376 | 12.817379 |
| C5 | ember/frost | 24.012554 | 36.676489 | 12.828334 | 19.377720 |
| C5 | ember/toxic | 22.929071 | 45.463309 | 12.029605 | 23.669344 |
| C5 | ember/midnight | 30.152647 | 21.185836 | 15.929910 | 11.359397 |
| C5 | ember/rose | 9.638374 | 29.181670 | 5.308497 | 15.344762 |
| C5 | frost/toxic | 17.136235 | 31.115200 | 9.385104 | 16.599555 |
| C5 | frost/midnight | 34.515544 | 30.361943 | 17.836351 | 15.690854 |
| C5 | frost/rose | 25.155917 | 31.902906 | 13.298109 | 16.855191 |
| C5 | toxic/midnight | 39.716724 | 50.116453 | 21.022245 | 26.374185 |
| C5 | toxic/rose | 29.903308 | 48.997196 | 15.899525 | 25.889308 |
| C5 | midnight/rose | 26.829170 | 36.121454 | 14.046239 | 18.825002 |
| C6 | base/ember | 28.233536 | 28.233536 | 2.769220 | 2.769220 |
| C6 | base/frost | 24.402321 | 24.402321 | 2.394441 | 2.394441 |
| C6 | base/toxic | 13.252576 | 22.276955 | 1.299268 | 2.186027 |
| C6 | base/midnight | 59.878795 | 59.878795 | 5.870973 | 5.870973 |
| C6 | base/rose | 39.632890 | 44.773319 | 3.889745 | 4.395205 |
| C6 | ember/frost | 32.987412 | 32.987412 | 3.234863 | 3.234863 |
| C6 | ember/toxic | 35.632778 | 36.155806 | 3.494108 | 3.546420 |
| C6 | ember/midnight | 41.544298 | 41.544298 | 4.071581 | 4.071581 |
| C6 | ember/rose | 13.161264 | 21.776558 | 1.293273 | 2.138738 |
| C6 | frost/toxic | 25.817898 | 28.617895 | 2.532897 | 2.808282 |
| C6 | frost/midnight | 47.903542 | 47.903542 | 4.696041 | 4.696041 |
| C6 | frost/rose | 37.691165 | 37.812450 | 3.697403 | 3.710876 |
| C6 | toxic/midnight | 59.332269 | 52.693471 | 5.817272 | 5.166609 |
| C6 | toxic/rose | 46.832135 | 52.079502 | 4.594867 | 5.111241 |
| C6 | midnight/rose | 35.618059 | 34.962299 | 3.489235 | 3.425540 |
