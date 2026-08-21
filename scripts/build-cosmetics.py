#!/usr/bin/env python3
"""Build the Boneheadz cosmetics manifest + resized web assets from Cam's layer library.

Re-run whenever Cam ships new art:
  python3 scripts/build-cosmetics.py "/path/to/BONEHEADZ NFT LIBRARY"

Deterministic: same input files -> same ids, names, and rarities, so player
inventories stay valid across art updates (ids are the source filenames).
"""
import hashlib
import json
import os
import re
import sys
from PIL import Image

LIB = sys.argv[1] if len(sys.argv) > 1 else '/Users/tommiller/Documents/TALLY APP /BONEHEADZ NFT LIBRARY'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_ASSETS = os.path.join(ROOT, 'assets', 'bh')
OUT_DATA = os.path.join(ROOT, 'data', 'boneheadz.js')
SIZE = 640

# slot code -> (label, z-order, default item id or None)
SLOTS = {
    'BG': ('Background', 0, None),
    'B':  ('Body', 10, 'B0-1'),
    'S':  ('Socks', 20, None),
    'FW': ('Kicks', 30, None),
    'U':  ('Undies', 40, None),
    'P':  ('Pants', 50, None),
    'T':  ('Top', 60, None),
    'SK': ('Skull', 70, 'SK0-1'),
    'E':  ('Eyes', 80, None),
    'G':  ('Grillz', 90, None),
    'M':  ('Mouth', 100, None),
    'H':  ('Hat', 110, None),
    # HANDS SIT UNDER THE HEAD (2026-08-09, Tom: "fix the underlying behaviour of
    # the off hand weapons"). They used to be the top two layers, which is fine
    # for a weapon held across the torso and wrong for anything drawn raised: a
    # spade, a toothbrush, a banner all landed across the face because the hand
    # painted last. Measured against the zone where eyes/teeth/grillz land, IL9
    # covered 81% of a player's face, the two spades 10.8%.
    #
    # Below the skull is where they belong: the arms themselves are drawn clear
    # of the head (only 1.3% of the skull has body ink under it, all of it at the
    # neck), so a thing held in the hand passing IN FRONT of the face was never
    # what the art meant. Above T (60) so a weapon still reads in front of the
    # shirt; IR above IL so the near hand still wins.
    #
    # Blast radius, measured on all 62 held items: 19 left-hand items move behind
    # the head (every one an improvement), 19 are pixel-identical, and all 24
    # right-hand items are pixel-identical, so IR moves purely to stop the same
    # bug reaching future right-hand art. tests/unit.test.js pins the invariant.
    'IL': ('Left hand', 65, None),
    'IR': ('Right hand', 66, None),
    'C':  ('Pet', 5, None),  # companion sits BEHIND the character (just above BG)
    # YD ('Yard') was retired: app.js treats noYard as a legacy no-op and the shipped
    # manifest carries no YD slot. Rebuilding with it resurrected a Yard tab and put
    # two unusable decor items into the crate pool, caught only by the additive diff.
}

# Hand-curated items that exist in the SHIPPED manifest but not in the layer
# library scan. CX (the Founder's Lizard, granted by CX survey reward) was added
# to the manifest by hand after a build, so a naive rebuild silently DELETED a
# species players own. Anything hand-added to data/boneheadz.js must be mirrored
# here or the next rebuild eats it.
SPECIALS = [
    {'id': 'CX', 'slot': 'C', 'rarity': 'legendary', 'name': 'Day One Lizard', 'exclusive': True},
    # Gwart's Menagerie, v421. Bumbleseal and the wardrobe drawn FOR HER: every
    # piece is positioned for her body inside the shared canvas, which is why the
    # accessory slots are hers alone and why they are sold rather than dropped.
    # hatchChance is what keeps her a 1% egg instead of an even quarter of the
    # non-common pool; see pickRandomPet in js/loot.js and tests/pet-pool-audit.mjs.
    # These six were hand-added to data/boneheadz.js and were NOT mirrored here,
    # which is exactly what the comment above this list warns about: the next
    # rebuild would have deleted a 50,000-coin pet and five paid accessories out
    # from under everyone who bought them.
    {'id': 'C6',  'slot': 'C',  'rarity': 'legendary', 'name': 'Bumbleseal', 'hatchChance': 0.01},
    {'id': 'CE1', 'slot': 'CE', 'rarity': 'epic',      'name': 'Bug-Eye Shades'},
    {'id': 'CB1', 'slot': 'CB', 'rarity': 'rare',      'name': 'Courier Purse'},
    {'id': 'CB2', 'slot': 'CB', 'rarity': 'epic',      'name': 'Charmed Courier'},
    {'id': 'CG1', 'slot': 'CG', 'rarity': 'legendary', 'name': 'Live Wire Stinger'},
    {'id': 'CM1', 'slot': 'CM', 'rarity': 'uncommon',  'name': 'Pimple Patches'},

    # ---- THE 63 THAT A REBUILD WAS ALREADY DELETING ----
    # Found 2026-08-21 by running this script into a throwaway tree and diffing:
    # 188 items in, 125 out. Every one of the 63 below has RENDERED ART on disk in
    # assets/bh/<slot>/<id>.png and NO source in the NFT library, so the library
    # lost their sources at some point and the generator has had no way to know
    # they exist. They are not stale entries: they are items players own.
    #
    # Their name and rarity are mirrored EXACTLY as shipped, not regenerated. That
    # matters more than it looks: pick_rarity is a hash of the id, so letting the
    # generator re-derive these would silently re-roll the rarity of items people
    # already have, and the running-number namer would renumber their neighbours
    # too. The comment above about the T slot's legendary quietly moving from
    # T9-1 to T3 is the same failure, already caught once.
    #
    # THE REAL FIX IS NOT THIS LIST, it is tests/rebuild-lossless-audit.mjs, which
    # fails if any item in data/boneheadz.js cannot be reproduced from here. A list
    # that has to be maintained by hand is exactly what failed; a list with a guard
    # behind it announces the next omission instead of eating it.
    {'id': 'ES1', 'slot': 'E', 'rarity': 'common', 'name': 'Pink Cat-Eyes'},
    {'id': 'ES2', 'slot': 'E', 'rarity': 'uncommon', 'name': 'Purple Slants'},
    {'id': 'ES3', 'slot': 'E', 'rarity': 'rare', 'name': 'Teal Rounds'},
    {'id': 'ES4', 'slot': 'E', 'rarity': 'uncommon', 'name': 'Black Rounds'},
    {'id': 'ES5', 'slot': 'E', 'rarity': 'common', 'name': 'Odd Pair'},
    {'id': 'ES6', 'slot': 'E', 'rarity': 'rare', 'name': 'Groucho Shades'},
    {'id': 'ES7', 'slot': 'E', 'rarity': 'common', 'name': 'Pin Dots'},
    {'id': 'ES8', 'slot': 'E', 'rarity': 'legendary', 'name': 'Slit Eyes'},
    {'id': 'ES9', 'slot': 'E', 'rarity': 'rare', 'name': 'Frost Puffs'},
    {'id': 'ES10', 'slot': 'E', 'rarity': 'uncommon', 'name': 'Squint Lines'},
    {'id': 'ES11', 'slot': 'E', 'rarity': 'common', 'name': 'Pinpricks'},
    {'id': 'ES12', 'slot': 'E', 'rarity': 'rare', 'name': 'Blood Moons'},
    {'id': 'ES13', 'slot': 'E', 'rarity': 'common', 'name': 'Googly Eyes'},
    {'id': 'ES14', 'slot': 'E', 'rarity': 'uncommon', 'name': 'Ugly Cry'},
    {'id': 'ES15', 'slot': 'E', 'rarity': 'rare', 'name': 'Spore Eyes'},
    {'id': 'ES16', 'slot': 'E', 'rarity': 'legendary', 'name': 'Wide Whites'},
    {'id': 'ES17', 'slot': 'E', 'rarity': 'common', 'name': 'Heavy Lids'},
    {'id': 'ES18', 'slot': 'E', 'rarity': 'rare', 'name': 'Sleepy Lids'},
    {'id': 'ES19', 'slot': 'E', 'rarity': 'common', 'name': 'Bubblegum Eyes'},
    {'id': 'ES20', 'slot': 'E', 'rarity': 'uncommon', 'name': 'Cryo Orbs'},
    {'id': 'ES21', 'slot': 'E', 'rarity': 'rare', 'name': "X'd Out"},
    {'id': 'ES22', 'slot': 'E', 'rarity': 'uncommon', 'name': 'Rainbow Band'},
    {'id': 'ES23', 'slot': 'E', 'rarity': 'common', 'name': 'Alert Eyes'},
    {'id': 'GS1', 'slot': 'G', 'rarity': 'common', 'name': 'Drip Grill'},
    {'id': 'GS2', 'slot': 'G', 'rarity': 'uncommon', 'name': 'Stud Braces'},
    {'id': 'GS3', 'slot': 'G', 'rarity': 'rare', 'name': 'Ice Tooth'},
    {'id': 'MS1', 'slot': 'M', 'rarity': 'common', 'name': 'Soap Wand'},
    {'id': 'MS2', 'slot': 'M', 'rarity': 'uncommon', 'name': 'Crystal Fangs'},
    {'id': 'MS3', 'slot': 'M', 'rarity': 'rare', 'name': 'Cloud Puff'},
    {'id': 'MS4', 'slot': 'M', 'rarity': 'uncommon', 'name': 'Fern Frond'},
    {'id': 'MS5', 'slot': 'M', 'rarity': 'common', 'name': 'Dotted Grin'},
    {'id': 'MS6', 'slot': 'M', 'rarity': 'rare', 'name': 'Amber Wand'},
    {'id': 'MS7', 'slot': 'M', 'rarity': 'common', 'name': 'Daisy Stem'},
    {'id': 'MS8', 'slot': 'M', 'rarity': 'legendary', 'name': 'Fat Cigar'},
    {'id': 'MS9', 'slot': 'M', 'rarity': 'rare', 'name': 'Firecracker'},
    {'id': 'MS10', 'slot': 'M', 'rarity': 'uncommon', 'name': 'Fresh Catch'},
    {'id': 'MS11', 'slot': 'M', 'rarity': 'common', 'name': 'Swamp Gob'},
    {'id': 'MS12', 'slot': 'M', 'rarity': 'rare', 'name': 'Rose Bite'},
    {'id': 'MS13', 'slot': 'M', 'rarity': 'common', 'name': 'Bubble Gum'},
    {'id': 'HS1', 'slot': 'H', 'rarity': 'common', 'name': 'Rope Coil'},
    {'id': 'HS2', 'slot': 'H', 'rarity': 'uncommon', 'name': 'Ronin Band'},
    {'id': 'HS3', 'slot': 'H', 'rarity': 'rare', 'name': 'Soda Jerk'},
    {'id': 'HS4', 'slot': 'H', 'rarity': 'uncommon', 'name': 'Nap Mask'},
    {'id': 'HS5', 'slot': 'H', 'rarity': 'common', 'name': 'Fish Bowl'},
    {'id': 'HS6', 'slot': 'H', 'rarity': 'rare', 'name': 'Flower Crown'},
    {'id': 'HS7', 'slot': 'H', 'rarity': 'common', 'name': 'Stitch Band'},
    {'id': 'HS8', 'slot': 'H', 'rarity': 'legendary', 'name': 'Toadstool Hat'},
    {'id': 'HS9', 'slot': 'H', 'rarity': 'rare', 'name': 'Atom Rings'},
    {'id': 'HS10', 'slot': 'H', 'rarity': 'uncommon', 'name': 'Party Cone'},
    {'id': 'HS11', 'slot': 'H', 'rarity': 'common', 'name': 'Polka Do-Rag'},
    {'id': 'HS12', 'slot': 'H', 'rarity': 'rare', 'name': 'Cold Halo'},
    {'id': 'HS13', 'slot': 'H', 'rarity': 'common', 'name': 'Gold Halo'},
    {'id': 'HS14', 'slot': 'H', 'rarity': 'uncommon', 'name': 'Ash Beanie'},
    {'id': 'HS15', 'slot': 'H', 'rarity': 'rare', 'name': 'Moss Beanie'},
    {'id': 'HS16', 'slot': 'H', 'rarity': 'legendary', 'name': 'Ember Beanie'},
    {'id': 'HS17', 'slot': 'H', 'rarity': 'common', 'name': 'Crossed Arrows'},
    {'id': 'HS18', 'slot': 'H', 'rarity': 'rare', 'name': 'Skewered'},
    {'id': 'HS19', 'slot': 'H', 'rarity': 'common', 'name': 'Grape Visor'},
    {'id': 'HS20', 'slot': 'H', 'rarity': 'uncommon', 'name': 'Clay Visor'},
    {'id': 'HS21', 'slot': 'H', 'rarity': 'rare', 'name': 'Turf Visor'},
    {'id': 'HS22', 'slot': 'H', 'rarity': 'uncommon', 'name': 'Skull Cap'},
    {'id': 'HS23', 'slot': 'H', 'rarity': 'common', 'name': 'Racer Wrap'},
    {'id': 'HS24', 'slot': 'H', 'rarity': 'legendary', 'name': 'Sleep Bonnet'},
]

# Drop items: explicit name + rarity, and EXCLUDED from the running-number naming
# below. Both matter. The hash would assign these near-random rarities, and the
# per-slot counter would renumber every hat sorted after H13 ("Street Hat #9"
# would silently become #14 in players' wardrobes) the moment H13-2..6 joined the
# sort order. Ids here must exist in the library; the build fails loudly if not.
OVERRIDES = {
    'T9-5':  ('Bloodrush Puffer', 'legendary'),
    'T9-6':  ('Slime Puffer', 'legendary'),
    'T9-7':  ('Gravemint Puffer', 'legendary'),
    'T9-8':  ('Grape Puffer', 'legendary'),
    'T9-9':  ('Bubblegum Puffer', 'legendary'),
    'H13-2': ('Bloodrush Blowfish', 'legendary'),
    'H13-3': ('Slime Blowfish', 'legendary'),
    'H13-4': ('Gravemint Blowfish', 'legendary'),
    'H13-5': ('Grape Blowfish', 'legendary'),
    'H13-6': ('Bubblegum Blowfish', 'legendary'),
}

RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary']
# deterministic weights (must sum to 100)
RARITY_WEIGHTS = [52, 26, 13, 6, 3]

ADJ = {
    'common':    ['Basic', 'Street', 'Everyday', 'Standard', 'Corner-store'],
    'uncommon':  ['Fresh', 'Slick', 'Tidy', 'Sharp', 'Custom'],
    'rare':      ['Radical', 'Voltage', 'Turbo', 'Prime', 'Deluxe'],
    'epic':      ['Haunted', 'Molten', 'Cosmic', 'Royal', 'Storm-forged'],
    'legendary': ['Mythic', 'Eternal', 'Grandmaster', 'Celestial', 'Ancient'],
}
NOUN = {
    'BG': 'Backdrop', 'B': 'Bones', 'S': 'Socks', 'FW': 'Kicks', 'U': 'Undies',
    'P': 'Pants', 'T': 'Top', 'SK': 'Skull', 'E': 'Eyes', 'G': 'Grillz',
    'M': 'Chew', 'H': 'Hat', 'IL': 'Off-hand', 'IR': 'Main-hand', 'C': 'Pet',
}


def h32(s):
    return int(hashlib.sha256(s.encode()).hexdigest()[:8], 16)


def pick_rarity(item_id):
    r = h32('rarity:' + item_id) % 100
    acc = 0
    for name, w in zip(RARITY_ORDER, RARITY_WEIGHTS):
        acc += w
        if r < acc:
            return name
    return 'common'


def _prior_items():
    """Name and rarity of every item in the CURRENTLY SHIPPED data file.

    PARSED, NOT PATTERN-MATCHED, and that is the whole point of this docstring.
    The first version of this function scraped ids with the pattern
    [A-Za-z0-9]+, which silently skips every id containing a hyphen: IL11-3,
    T9-1, crate-daily. That is not an edge case, it is 172 of the 370 items, so
    the function reported success while preserving barely half the catalogue and
    the rebuild still demoted "Nightfall Katana" from legendary to common. The
    array is real JSON, so it is read as JSON: bracket-matched from BH_ITEMS and
    handed to json.loads, which cannot have an opinion about which ids look
    normal.

    Returns {} when the file is absent or unreadable, so a first build on a clean
    checkout behaves exactly as it always did."""
    path = os.path.join(ROOT, 'data', 'boneheadz.js')
    try:
        text = open(path, encoding='utf-8').read()
    except OSError:
        return {}
    try:
        start = text.index('[', text.index('BH_ITEMS'))
        depth = 0
        for end in range(start, len(text)):
            if text[end] == '[':
                depth += 1
            elif text[end] == ']':
                depth -= 1
                if depth == 0:
                    break
        prior = json.loads(text[start:end + 1])
    except (ValueError, json.JSONDecodeError):
        return {}
    return {d['id']: {'name': d.get('name'), 'rarity': d.get('rarity')}
            for d in prior if d.get('id') and d.get('name') and d.get('rarity')}


def main():
    items = []
    for code in SLOTS:
        src = os.path.join(LIB, code)
        if not os.path.isdir(src):
            print(f'WARN: missing category {code}')
            continue
        os.makedirs(os.path.join(OUT_ASSETS, code), exist_ok=True)
        files = sorted(f for f in os.listdir(src) if f.lower().endswith('.png'))
        slot_items = []
        for f in files:
            item_id = f[:-4]
            im = Image.open(os.path.join(src, f)).convert('RGBA')
            im = im.resize((SIZE, SIZE), Image.LANCZOS)
            im.save(os.path.join(OUT_ASSETS, code, f), optimize=True)
            rarity = pick_rarity(item_id)
            slot_items.append({'id': item_id, 'slot': code, 'rarity': rarity})
        # guarantee the top of every slot has something to chase.
        # Computed over the PRE-DROP list only: the modulo index depends on the
        # list length, so counting override items shifted which item got promoted
        # (T slot: the legendary guarantee moved from T9-1 to T3, i.e. a rebuild
        # would have quietly demoted a legendary players already own).
        base_items = [i for i in slot_items if i['id'] not in OVERRIDES]
        if base_items:
            if not any(i['rarity'] == 'legendary' for i in base_items):
                base_items[h32('leg:' + code) % len(base_items)]['rarity'] = 'legendary'
            if not any(i['rarity'] == 'epic' for i in base_items):
                base_items[h32('epic:' + code) % len(base_items)]['rarity'] = 'epic'
        items.extend(slot_items)

    # names: deterministic adjective + slot noun + running number within slot.
    # Overridden (drop) items take their explicit name and do NOT consume a
    # number, so every pre-existing item keeps its exact name.
    counter = {}
    for it in items:
        if it['id'] in OVERRIDES:
            it['name'], it['rarity'] = OVERRIDES[it['id']]
            continue
        n = counter.get(it['slot'], 0) + 1
        counter[it['slot']] = n
        adj = ADJ[it['rarity']][h32('adj:' + it['id']) % len(ADJ[it['rarity']])]
        it['name'] = f"{adj} {NOUN[it['slot']]} #{n}"
    missing = [k for k in OVERRIDES if k not in {i['id'] for i in items}]
    if missing:
        raise SystemExit(f'OVERRIDES name ids with no library art: {missing}')

    # defaults are always owned and never drop from crates
    defaults = [d for (_, _, d) in SLOTS.values() if d]
    for it in items:
        if it['id'] in defaults:
            it['rarity'] = 'common'
            it['default'] = True

    items.extend(SPECIALS)

    # ---- NOTHING A PLAYER ALREADY OWNS MAY CHANGE ----
    # Measured 2026-08-21 by running this script into a throwaway tree and
    # diffing the result against the shipped file: of 188 items, 118 came back
    # RENAMED and 3 came back DEMOTED. IL14 went from legendary "Bolt Flail" to
    # common "Standard Off-hand #12"; IL13 rare -> common; IL15 uncommon ->
    # common. Those are items in people's inventories.
    #
    # WHY IT HAPPENS, and it is not one bug. Names come from a running counter
    # plus a hash of the id, and rarity from pick_rarity, another hash. Both are
    # deterministic in the INPUT SET, so anything that changes the set changes
    # the answer for items that did not change at all: adding art renumbers its
    # neighbours, and the per-slot legendary and epic guarantees pick by
    # `index % len(base_items)`, so the guarantee moves the moment the list
    # grows. The comment above base_items records that exact failure happening
    # once before, to the T slot.
    #
    # So the generator is authoritative for NEW ids only. For any id already in
    # the shipped file, that file wins: name and rarity are copied forward
    # verbatim. This is deliberately a read of the script's own previous output,
    # because the requirement is continuity with what shipped, and there is no
    # other record of it. Rarity and name only; slot, defaults and art are still
    # generated.
    prior = _prior_items()
    for it in items:
        was = prior.get(it['id'])
        if was:
            it['name'], it['rarity'] = was['name'], was['rarity']
    kept = sum(1 for it in items if it['id'] in prior)
    print(f'preserved name+rarity for {kept} existing item(s); '
          f'{len(items) - kept} newly generated')

    slots_out = [{'code': c, 'label': l, 'z': z, 'default': d} for c, (l, z, d) in SLOTS.items()]
    body = (
        '// GENERATED by scripts/build-cosmetics.py from Cam\'s Boneheadz library. Do not hand-edit.\n'
        '// Placeholder art: re-run the script when final art lands (ids stay stable).\n'
        f'export const BH_SLOTS = {json.dumps(slots_out, indent=1)};\n\n'
        f'export const BH_ITEMS = {json.dumps(items, indent=1)};\n\n'
        'export const BH_BY_ID = Object.fromEntries(BH_ITEMS.map(i => [i.id, i]));\n'
        'export function bhAsset(item) { return item.file || `assets/bh/${item.slot}/${item.id}.png`; }\n'
    )
    with open(OUT_DATA, 'w') as fh:
        fh.write(body)

    from collections import Counter
    rc = Counter(i['rarity'] for i in items)
    print(f'{len(items)} items -> {OUT_DATA}')
    print('rarity spread:', dict(rc))
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT_ASSETS) for f in fs)
    print(f'assets: {total/1e6:.1f} MB at {SIZE}px')


if __name__ == '__main__':
    main()
