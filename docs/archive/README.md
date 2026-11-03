# Archived pre-rewrite work

Three branches were cut from `7939c38` on 2026-10-27/28, **before** the
`f40680b` rewrite ([ADR-002](../adr-002-rewrite.md)) replaced the single-file
prototype with the `server/` + `web/` workspaces. They patched files the
rewrite deleted, so they could not be merged or rebased, and the branches were
removed on 2026-11-03.

The patches are kept here because two of them record decisions worth
reapplying when the swipe deck is rebuilt on the React scaffold. They will
**not** apply cleanly with `git am` — the target files no longer exist. Read
them, do not replay them.

| File | Commit | Author | Status |
|---|---|---|---|
| `TM09-131-swipe-touch.patch` | `b4bddcf` | Tamar Shuster | **Reapply when the deck is rebuilt** |
| `report-from-card.patch` | `1c915b5` | Chang Chang | **Reapply when reporting is rebuilt** |
| `adr-001-tamar-draft.patch` | `f70c2a1` | Tamar Shuster | Superseded — reference only |

## TM09-131 — a vertical touch drag must not pass the card

`SwipeCard.tsx` wired `onPointerCancel` straight to the `onPointerUp` handler.
The browser fires a pointer cancel when it takes a gesture over, which on a
touch screen means the student is scrolling vertically (`touch-action: pan-y`).
Chrome reports that cancel at `clientX: 0`, so the release handler read it as a
long left drag and passed the listing.

The fix is a separate `onPointerCancel` that sets `moved.current = true` and
snaps the card back to centre instead of treating the cancel as a release. A
cancel is never a decision about the listing.

Worth a Playwright regression test; the deleted branch had one at
`e2e/specs/swipe-touch.spec.ts` (in the patch).

## Report from the card

Choosing "report" on a card dismisses it to the left, rather than leaving it in
the deck behind the sheet. Touches `ReportSheet.tsx` and `Browse.tsx`.

## ADR-001 draft

An earlier draft of `docs/adr-001-stack.md`. The version on `main` (added by
`f40680b`) supersedes it and records the ADR-002 relationship. The only thing
the draft carries that `main`'s does not is an attribution table crediting
Tareq Haque for the first draft, with input from Chris Martinez-Rivas and
Chang Chang.
