# Wardrobe advisory review

The work order is partially implemented. Browser acceptance and red-mutation
proof remain blocked by the sandbox. This is not a release certification.

## Source verification

The supplied plan file matched its SHA256. All source changes are relative to
this checkout. The starting code already grouped cosmetic families and gear
families and grouped the transmog look picker. It also scrolled to a return
button after selecting a slot. It did not implement same-slot second-tap return,
and only rendered the currently selected slot's item section.

## Changes

- `js/app.js`: target the selected section heading using measured scroll-container
  and pinned-header geometry; second-tap and explicit return target the doll;
  select instant scrolling under the current reduced-motion preference; expose
  other owned slots as grouped sections that open the existing slot picker;
  count cosmetics alongside statted variants in mixed stacks.
- `app.css`: append spacing and reduced-motion rules. The inherited prefix is
  unchanged, as verified by the prefix hash assertion.
- `tests/wardrobe-slot-scroll-audit.mjs`: browser control, heading geometry,
  second-tap return and reduced-motion checks.
- `tests/wardrobe-stack-audit.mjs`: primitive-seeded cosmetic fixture, tile counts,
  expanded variants and second-variant equip in both pickers.
- `tests/release-gate.mjs`: declare both new browser audits as full.
- `tests/unit.test.js`: replace the old return-button scroll-target assertion
  with a section-heading assertion and require second-tap return.
- `tests/wardrobe-unlock-audit.mjs`: supply cosmetics to the extracted renderer
  and check the new instant/second-tap contract.
- `tests/wardrobe-ui-1f-audit.mjs`: update only the markup/handler hashes affected
  by the requested changes. Preserve the slot-definition and CSS-prefix locks.
- `docs/v577/guard-red.txt`: explicit blocked-proof record.
- `docs/v577/wardrobe-unit-proof.txt`: full agreed proof command output.
- This review file records limitations for the independent reviewer.

## Validation

The initial unit run returned `390 passed, 1 failed`, because it required the
superseded return-button scroll target. The final run returned `391 passed, 0 failed` with exit code 0 and is recorded
verbatim in `wardrobe-unit-proof.txt`.

The existing family audit passed 13 checks. The unlock audit passed its 388
variant / 105 family source checks. The updated UI audit passed, including the
unchanged inherited CSS hash. Syntax and whitespace checks passed.

Both new browser audits exited 1 before running any acceptance row because
binding `127.0.0.1` was denied with `listen EPERM`. No red mutation is claimed.

## Deviations and outstanding work

1. Preserve the existing family grouping instead of rebuilding behavior already
   present in the checkout. No new visual names were invented.
2. Universal visual equivalence remains unverified. The catalogue itself notes
   possible under-collapse across unrelated IDs, including older grillz,
   beanies, visors and round eyewear. The grouping rule and those catalogue
   entries were not changed without the required on-body visual evidence.
   Proposed follow-up: inspect those looks on a 300px+ rendered Bonehead and
   assign explicit visual-family metadata where warranted.
3. Browser guards are written but unexecuted beyond harness startup. The new
   stack fixture covers cosmetic colour variants, not a browser-driven stat-roll
   fixture. Existing stat reachability checks are source-level only. Add and run
   that fixture during independent browser review.
4. Every-row throwaway-copy red proof is outstanding, not silently waived.
   Proposed follow-up is documented in `guard-red.txt`.
5. The UI audit also froze markup and handlers, which the work order necessarily
   changes. Those two hashes were renewed; the mandated CSS prefix was retained.

No commits, pushes, publishing, version bumps, art edits or changes to
`native/ASC-SUBMISSION.md` were made. No permission escalation was requested.
