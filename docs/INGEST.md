# How Tom's feedback gets captured

Written 2026-08-23, after he sent a list that took him hours and asked "you
forgot 80% of it wtf". Nothing had actually been forgotten. It was captured
verbatim in `FEEDBACK-2026-08-22-v424.md` and planned in `PLAN-2026-08-22-v425.md`
by another session, on a branch that was **never merged to main**. A later session
looked at `main` and `ROADMAP.md`, found nothing, concluded the list was untracked
and wrote a worse duplicate plan from the chat message.

**The work was not lost. It was invisible.** Those are different failures and only
one of them is about diligence.

## The rules

1. **Capture lands on `main`, not a branch.** A feedback file on an unmerged
   branch is findable only by someone who already knows it exists. If the capture
   is not on `main` within the hour, it does not exist. Open the PR immediately
   and merge it; it is a document, it cannot break anything.

2. **Capture is verbatim, before any analysis.** His words, his typos, numbered.
   Paraphrase drops detail, and the detail is usually the bug: "the lightning
   bolt isn't centred in the circle" is not "icon alignment issue".

3. **Append, never rewrite.** Items 19 and 20 arrived after the file was written
   and went missing for a day. New items get appended with the date they arrived.

4. **One canonical file per batch**, named `FEEDBACK-<date>-<version>.md`, and
   ONE plan per batch beside it. Not one per session, and never a second plan for
   a batch that already has one.

5. **Status lives next to the item.** An item is `OPEN`, `SHIPPED <PR>`, or
   `DROPPED <reason>`. A list without status forces the next reader to re-derive
   what is done, which is how six shipped items got re-planned as open.

## Before writing any plan, search for the existing one

The specific mistake was searching `main` only. This searches every ref:

```
git log --all --oneline -S "<a distinctive phrase from his message>"
for r in $(git for-each-ref --format='%(refname)'); do
  git cat-file -e "$r:docs/FEEDBACK-<date>.md" 2>/dev/null && echo "on $r"
done
```

If the phrase appears nowhere in history, check the session transcripts before
concluding it was never written:

```
grep -ril "<distinctive phrase>" ~/.claude/projects/*/  --include=*.jsonl
```

That is how this one was recovered: the plan was quoted in a transcript, which
led to the branch name, which led to three complete documents.

## Why this keeps happening

The same shape has now cost this project four times in two days: a 722-line audit
rewrite stranded in a stale clone, a 321-line work register living untracked, a
2,991-line rescue that existed only on one disk, and now a feedback plan on an
unmerged branch. Every one was real work that was done and then could not be
found.

**A branch is not a filing cabinet.** Anything somebody will need to find later
belongs on `main`.
