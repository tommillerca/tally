# Pet morphs v2: per-region source -> target and checks

Ground truths: ink #20201c (protected), --surface-2 #1e1c26, Today green #6c7b3d (sampled from proof/01-today-kit-on.png).
Every visible pixel is explained as a blend of two palette entries with cores within R px; the blend is re-mixed with the targets. Protected entries map to themselves.

## C1 Drizzle

Anatomy: pale ice-blue dome (identity colour), cream cel-highlight streaks top-left, two cream eyes with black pupils and white specular dots, pink blush bars, black mouth, black underside slab, 4 cyan drops, ground shadow. Recoloured: dome, drops. Never: ink, cream (eyes + streaks share one fill), white dots, blush.

| region | source | ember | frost | toxic | midnight | rose | px (dominant) |
|---|---|---|---|---|---|---|---|
| body | #cffbff | #fa7646 | #429ceb | #b2f244 | #473980 | #ff19ab | 9122 |
| drops | #62e6f2 | #ffb726 | #8cd9ff | #4d9917 | #8da6d9 | #a6114f | 600 |
| cream | #fff9dd | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 1293 |
| white | #ffffe7 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 167 |
| blush | #ff918d | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 301 |
| ink | #20201c | = | = | = | = | = | 7592 |

| morph | ink identical | whites/creams identical | edge partials | unexplained (fallback) | islands fixed / left |
|---|---|---|---|---|---|
| ember | True (6935 px) | True (1493 px) | 1540 | 193 | 2 / 0 |
| frost | True (6935 px) | True (1493 px) | 1540 | 193 | 2 / 0 |
| toxic | True (6935 px) | True (1493 px) | 1540 | 193 | 2 / 0 |
| midnight | True (6935 px) | True (1493 px) | 1540 | 193 | 2 / 0 |
| rose | True (6935 px) | True (1493 px) | 1540 | 193 | 2 / 0 |

## C2 Mallard

Anatomy: brown body and wings (identity), green head (SECONDARY accent), orange beak (secondary), blue speculum bars on both wings (tertiary), cream wing bars / neck ring / tail, white eye dot. Recoloured: body, head, beak, speculum, each a deliberate step apart. Never: ink, cream, eye.

| region | source | ember | frost | toxic | midnight | rose | px (dominant) |
|---|---|---|---|---|---|---|---|
| body | #9f6b2e | #ff720d | #8dbcd9 | #99d92b | #3e3473 | #ff19ab | 6416 |
| head | #2eb920 | #b22b09 | #37629e | #13802e | #663f8c | #b21b5a | 1158 |
| beak | #ff7536 | #ffba19 | #f5b093 | #ffec19 | #777ec7 | #ffbad1 | 400 |
| speculum | #4646bd | #ffbe26 | #e0f2ff | #eeff33 | #8da6d9 | #fa91b4 | 321 |
| cream | #fcf0d0 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 1240 |
| white | #ffffe7 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 270 |
| ink | #20201c | = | = | = | = | = | 6965 |

| morph | ink identical | whites/creams identical | edge partials | unexplained (fallback) | islands fixed / left |
|---|---|---|---|---|---|
| ember | True (6175 px) | True (1119 px) | 1739 | 128 | 6 / 0 |
| frost | True (6175 px) | True (1119 px) | 1739 | 128 | 6 / 0 |
| toxic | True (6175 px) | True (1119 px) | 1739 | 128 | 6 / 0 |
| midnight | True (6175 px) | True (1119 px) | 1739 | 128 | 6 / 0 |
| rose | True (6175 px) | True (1119 px) | 1739 | 128 | 6 / 0 |

## C3 Catfish

Anatomy: two-shade periwinkle body (light top, dark shade below and fins, same hue), pink lip rolls (secondary accent) with cream tops, cream X-eye patch, pale-cyan highlight streaks + 3 sweat drops, ink whiskers, ground shadow. Recoloured: both body shades (structure kept), rolls, highlight/drops. Never: ink, cream, white.

| region | source | ember | frost | toxic | midnight | rose | px (dominant) |
|---|---|---|---|---|---|---|---|
| body | #a8a6ff | #fa9a7d | #59f1ff | #c3f56e | #564a94 | #ff40b9 | 3923 |
| body | #6460fc | #eb4b23 | #26e2ff | #66ad15 | #2d1e6b | #b21270 | 3923 |
| rolls | #ff9692 | #ffc766 | #c7ceff | #fff373 | #8c679e | #cc3357 | 774 |
| hilite | #affeff | #ffe9a6 | #ebf8ff | #f9ffb8 | #92ace0 | #ffe0eb | 429 |
| cream | #fff7d3 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 650 |
| white | #ffffe7 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 63 |
| ink | #20201c | = | = | = | = | = | 6771 |

| morph | ink identical | whites/creams identical | edge partials | unexplained (fallback) | islands fixed / left |
|---|---|---|---|---|---|
| ember | True (5844 px) | True (495 px) | 2242 | 251 | 2 / 0 |
| frost | True (5844 px) | True (495 px) | 2242 | 251 | 2 / 0 |
| toxic | True (5844 px) | True (495 px) | 2242 | 251 | 2 / 0 |
| midnight | True (5844 px) | True (495 px) | 2242 | 251 | 2 / 0 |
| rose | True (5844 px) | True (495 px) | 2242 | 251 | 2 / 0 |

## C4 Beardie

Anatomy: orange body (identity), yellow stripes + cheek ear-spot (same fill; markings), huge cream belly (secondary: temperature-shifted only), eye whites + teeth in the same cream but as small components (protected), pale cyan drool, orange tongue (body fill + ink). Recoloured: body, markings, belly tint. Never: ink, eye whites/teeth, drool.

| region | source | ember | frost | toxic | midnight | rose | px (dominant) |
|---|---|---|---|---|---|---|---|
| body | #ff8245 | #941f07 | #7ebee6 | #64b81c | #3a2d80 | #ff19ab | 7638 |
| marks | #fcf428 | #ffb726 | #e0f5ff | #e2ff26 | #8da6d9 | #ffb8d2 | 923 |
| belly | #fff9dd | #fff0d6 | #fcffed | #ffffdb | #f5f5e1 | #ffedf3 | 4904 |
| drool | #b6f0e8 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 132 |
| white | #ffffe7 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 704 |
| ink | #20201c | = | = | = | = | = | 9067 |

| morph | ink identical | whites/creams identical | edge partials | unexplained (fallback) | islands fixed / left |
|---|---|---|---|---|---|
| ember | True (7217 px) | True (946 px) | 3743 | 250 | 160 / 0 |
| frost | True (7217 px) | True (946 px) | 3743 | 250 | 160 / 0 |
| toxic | True (7217 px) | True (946 px) | 3743 | 250 | 160 / 0 |
| midnight | True (7217 px) | True (946 px) | 3743 | 250 | 160 / 0 |
| rose | True (7217 px) | True (946 px) | 3743 | 250 | 160 / 0 |

## C5 Bulldog

Anatomy: tan body (identity), cream shirt with coral stripes (stripes recoloured as accent, shirt kept), ink collar with cream spikes, cream teeth, white eye highlights. Recoloured: body, stripes. Never: ink (collar), cream, white.

| region | source | ember | frost | toxic | midnight | rose | px (dominant) |
|---|---|---|---|---|---|---|---|
| body | #ca906c | #941f07 | #50a0e6 | #4cd936 | #433973 | #ff19ab | 9694 |
| stripes | #ff7b5b | #ffbb33 | #65ade0 | #e2f230 | #7a8fcc | #ffa8c8 | 737 |
| cream | #fff2d4 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 1409 |
| white | #ffffe3 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 415 |
| ink | #20201c | = | = | = | = | = | 8814 |

| morph | ink identical | whites/creams identical | edge partials | unexplained (fallback) | islands fixed / left |
|---|---|---|---|---|---|
| ember | True (7395 px) | True (1317 px) | 3274 | 189 | 9 / 0 |
| frost | True (7395 px) | True (1317 px) | 3274 | 189 | 9 / 0 |
| toxic | True (7395 px) | True (1317 px) | 3274 | 189 | 9 / 0 |
| midnight | True (7395 px) | True (1317 px) | 3274 | 189 | 9 / 0 |
| rose | True (7395 px) | True (1317 px) | 3274 | 189 | 9 / 0 |

## C6 Bumbleseal

Anatomy: cream face/ears/wings/tail-rings/tuft dots (identity, ~42% of pixels), black stripes (ink, ~46%), yellow stripes (the ONLY recoloured fill, ~10%), pink blush. Never: ink, cream, blush. A Bumbleseal morph is therefore a stripe colour, which is what keeps it a Bumbleseal.

| region | source | ember | frost | toxic | midnight | rose | px (dominant) |
|---|---|---|---|---|---|---|---|
| stripes | #ffe100 | #ff6619 | #a6e1ff | #16d916 | #48379e | #ff19ab | 127822 |
| cream | #fff1c7 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 561967 |
| blush | #ffb7a1 | = (kept) | = (kept) | = (kept) | = (kept) | = (kept) | 4249 |
| ink | #20201c | = | = | = | = | = | 614372 |

| morph | ink identical | whites/creams identical | edge partials | unexplained (fallback) | islands fixed / left |
|---|---|---|---|---|---|
| ember | True (609076 px) | True (558049 px) | 12985 | 52 | 19 / 0 |
| frost | True (609076 px) | True (558049 px) | 12985 | 52 | 19 / 0 |
| toxic | True (609076 px) | True (558049 px) | 12985 | 52 | 19 / 0 |
| midnight | True (609076 px) | True (558049 px) | 12985 | 52 | 19 / 0 |
| rose | True (609076 px) | True (558049 px) | 12985 | 52 | 19 / 0 |
