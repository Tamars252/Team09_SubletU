# Screenshots — Saved screen (TM09-101)

**None of these have been captured.** They must be taken by hand; nothing in this
folder is generated, and no placeholder images have been committed.

## Setup

```bash
npm run seed:sample     # sample hosts and listings
npm run dev             # server + web
```

Sign in, save two or three listings (right-swipe is not on `main` yet — use the
browser console: `await fetch("/api/saved", {method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+localStorage.getItem("subletu.token")}, body:JSON.stringify({listingId:"lst_…"})})`,
or `npm run seed:sample` plus a direct insert), then open `/saved`.

Capture the app frame only (the 480px-wide shell), not the whole desktop window.

## To capture

- [ ] **`01-populated.png`** — `/saved` with at least three saved listings,
      newest first, bottom nav visible with "Saved" active. Include one card
      with no photo so the `.list-thumb` gradient placeholder is visible, and
      ideally one non-`active` listing showing its "Pending" / "Unavailable"
      chip. *Proves AC1, AC2, AC8.*

- [ ] **`02-empty.png`** — `/saved` with nothing saved: the "Nothing saved yet"
      message and the "Browse listings" button. *Proves AC6.*

- [ ] **`03-after-unsave.png`** — the list immediately after tapping unsave on
      one card, with that card gone and the others still in order.
      *Proves AC3.*

- [ ] **`04-unsave-error.png`** — a failed unsave: the card back in its original
      position with the red error banner above the list. Force it by stopping
      the server (`Ctrl-C` on the `dev:server` process) and then tapping unsave,
      or by blocking `DELETE /api/saved/*` in the browser devtools network tab.
      *Proves AC3, AC7.*

- [ ] **`05-loading.png`** — the spinner on first load. Throttle the network in
      devtools ("Slow 3G") to hold it long enough to capture. *Proves AC7.*

- [ ] **`06-retry.png`** *(optional but useful)* — the load-error state with the
      Retry button, captured with the server stopped before opening `/saved`.
      *Proves AC7.*

Once captured, tick the boxes above; `docs/saved-screen.md` already references
these filenames.
