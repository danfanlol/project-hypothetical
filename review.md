# Review Feature

Reference for the review (drill) feature: what it does, where the code lives, how the state machine works, and the ops gotchas. Keep this file updated when the feature changes.

## Overview

The user builds a **review list** from the line editor, then drills every saved item from the navbar's **Review** tab.

1. **Add.** In the line editor (`/lines/<id>`), the user selects a move and clicks **Add to Review**. This saves a `ReviewItem`: a *snapshot* of the move path from the line's start to the selected move.
2. **Review.** `/review` lists the saved items. "Start review" shuffles them and drills them one at a time.

### Rules

- **Snapshot, not a link.** The item stores the moves themselves. Editing or deleting the source line later does not change or break it. `lineId` is kept only so the review header can link back to the line.
- **Single path.** An item is one linear sequence of moves, not a subtree. Sibling variations in the line are not included.
- **POV = side that played the selected move.** If the selected move is white's, the user plays white; if black's, black (`moverOf`). So the path always ends on a user move.
- **Opening auto-play** (`reviewAutoPlies`):
  - White POV: the first **2** plies (white's and black's first moves) are played for the user, who starts on white's 2nd move.
  - Black POV: the first **1** ply (white's first move) is played; the user answers it.
- **Nothing-to-review guard.** If the path is no longer than the auto-played plies (e.g. white POV with only `1. e4` selected), the button is disabled with a tooltip. `POST /api/review-items` also rejects it with 400.
- **Overlap check.** Before saving, the server compares the new path with the user's saved items that have the same orientation and the same start position (`positionKey`: first 4 FEN fields). Only exact move sequences count, not transpositions. If anything overlaps it returns **409** `{ conflict, extended, covering }` without saving, and the editor shows an amber bar under the header:
  - **covered** (the new path is the start of a saved item, or identical to one) takes priority: "Already covered…" → **Add anyway** / Cancel.
  - **extended** (a saved item is the start of the new path): "Your review list has a shorter version of this line. Replace it?" → **Replace** (create the new item and delete all the extended ones in one transaction; the button shows "Replaced ✓") / **Keep both** / Cancel.
  - The choice re-POSTs with `resolve: "replace" | "keep"`. Selecting another move dismisses the bar.
  - Lines drilled from different sides never count as overlapping.
- **Item label** = the line's label, falling back to the opening name detected at the selected position, else null ("Untitled").

### User flow on `/review`

- **List view:** each item shows its label, numbered moves (`1. e4 e5 2. Nf3`), "Playing as White/Black", the date, and **Analyze** / **Remove** buttons.
- **Analyze:** opens `/analyze?fen=<startFen>&moves=<space-separated SANs>&orientation=…` in the same tab, at the start position. `AnalysisPanel` (with its optional `moves` prop) shows a clickable move list, and ←/→ step through the line with live Stockfish eval. Playing your own move branches off; replaying the line's next move just steps forward. **Reset** restores the original line at the start. The header has the count, **Clear all** (asks "Remove all N lines?" with Clear / Cancel, then deletes every item), and **Start review**. An empty list shows a prompt linking to `/lines`.
- **Session = loop until everything is perfect.** Starts as a shuffled queue of every item; the head is the current line.
  - **Perfect line** (zero wrong moves; `hadMistake` from `useLineReview`): leaves the queue *and* is deleted from the review list (`DELETE /api/review-items/<id>`, fire-and-forget; on failure it just stays in the list). Done screen: "No mistakes! Removed from your review list."
  - **Any wrong move** (a hint always follows one, so it counts too): the line goes to the back of the queue. Done screen: "You made a mistake. This line will come up again."
  - The header shows "X of N cleared · Y left". The done button reads "Next line", or "Finish" only when it is the last line and it was perfect. "Exit review" returns to the list (client state, not navigation); lines cleared so far stay removed.
- **End screen** (queue empty): "All lines cleared!" with **Back to review list** (which is now empty of those lines).

### Drill behaviour (per item)

- Opponent moves and auto-played opening plies animate in automatically (500 ms apart).
- On user moves the user must play the stored move. SANs are compared case-insensitively.
- **Wrong move:** the piece shows on the wrong square for 350 ms with "Wrong!", then snaps back instantly. The user retries.
- **Correct move:** "Correct!" appears. On the last move it holds 300 ms before finishing.
- **Hint:** after the first wrong attempt, a "Show correct move" button appears. It shows the correct position for 1.5 s, then snaps back. It stays available for that position.
- **Done:** "Line complete!" plus the Next/Finish button.
- The header also has an **Analyze position** link (new tab). It passes `fen=<startFen>&moves=<moves played so far>&ply=end`, so the analysis panel shows the line's history and opens at the current position, without the rest of the line. If the board is off the line (a wrong move or hint is showing), it falls back to `fen=<board>` only. `ply` (a number, or `end`) is the panel's `startPly`; **Reset** returns to it and the label linking to the source line in a new tab. The label is plain text if `lineId` is null.

## Files

| File | Role |
|---|---|
| `prisma/schema.prisma` | `ReviewItem` model (see below); `User.reviewItems` relation |
| `src/lib/types.ts` | `ReviewMove { move, fen }`, `ReviewItemData` |
| `src/lib/review.ts` | `moverOf(fen)`, `reviewAutoPlies(orientation)`, `formatMoves(startFen, sans)` |
| `src/app/api/review-items/route.ts` | `POST { label, startFen, moves: SAN[], lineId }`: replays moves with chess.js (so stored FENs are always consistent), derives orientation, enforces the guard, runs the overlap check (409 unless `resolve` is given), returns `{ id, replaced? }`. `DELETE` clears all of the user's items, returns `{ count }` |
| `src/app/api/review-items/[id]/route.ts` | `DELETE`, owner only |
| `src/app/lines/[id]/page.tsx` | "Add to Review" button: `getPathNodes`, `addToReview`, `canAddToReview`, `addToReviewStatus` ("Adding…" / "Added ✓" / "Replaced ✓" / "Failed", resets after 1.5 s), `reviewConflict` (the overlap bar) |
| `src/app/review/page.tsx` | Server component: auth-guards and fetches the user's items (newest first) |
| `src/app/review/ReviewClient.tsx` | List view, remove, clear all, analyze link (`analyzeHref`), shuffled queue, end screen |
| `src/app/analyze/page.tsx` | Parses `fen`, `orientation`, optional `moves`; renders `AnalysisPanel` |
| `src/components/AnalysisPanel.tsx` | Engine analysis board. Optional `moves` prop → `buildHistory` replays them (stops at the first illegal SAN) and shows the move list |
| `src/app/review/ReviewItemSession.tsx` | `toChain(item)` turns the path into a one-branch `LineNode[]` tree; calls `useLineReview(line, reviewAutoPlies(orientation))`; renders `ReviewBoard` |
| `src/hooks/useLineReview.ts` | The drill state machine (pure reducer + hook) |
| `src/components/ReviewBoard.tsx` | Board UI, status bar, header links. Owns the correct→advance timer (0 ms, or 300 ms on the last move). Loaded with `next/dynamic` and `ssr: false` |

Entry points: navbar "Review" tab → `/review` (in `src/app/layout.tsx`); editor header → Add to Review.

### Data model

```prisma
model ReviewItem {
  id          String   @id @default(cuid())
  label       String?
  startFen    String
  moves       Json     // { move: string; fen: string }[], replayed from startFen
  orientation String   // "white" | "black": side that played the last move = side the user drills
  lineId      String?  // source line, informational only (no FK; the line may be deleted)
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
}
```

## State machine (`useLineReview.ts`)

`useLineReview(line: ReviewLine, autoPlies = 0)`, where `ReviewLine = Pick<LineData, "id" | "startFen" | "tree" | "boardOrientation">`. It returns `{ boardFen, status, orientation, snapBoard, wrongCount, hadMistake, isLastMove, submitMove, advance, showHint }`. `hadMistake` is set by any wrong `USER_MOVE` and reset only by `INIT`.

The reducer is a general **DFS over a branching tree**, written for the old whole-line review. Review items are always one-branch chains now, so the sibling-transition machinery below is dormant, but it still works if branching review ever comes back.

### State

```ts
interface ReviewFrame {
  nodes: LineNode[]   // sibling nodes at this DFS level
  parentFen: string   // board before any move in nodes[]
  index: number       // current position in nodes[]
}

interface ReviewState {
  stack: ReviewFrame[]       // stack.length = ply depth of current node + 1
  siblingAutoPlay: boolean
  previewMoves: LineNode[]   // nodes to replay before the next opponent sibling
  snapBoard: boolean         // true → next boardFen change uses 0 ms animation
  boardFen: string
  status: InternalStatus
  currentNode: LineNode | null
  orientation: "white" | "black"
  wrongCount: number         // wrong attempts at current position; resets on node change
  autoPlies: number          // nodes at depth < autoPlies are auto-played even on the user's turn
}
```

### Whose move is it?

`isUserPrompt(stack, orientation, autoPlies)` is true when `stack.length > autoPlies` and it's the user's side to move at the top frame's `parentFen`. The auto-play effect, `submitMove` and the exposed status all use it. This is the one place the opening auto-play is implemented.

### Status

```
InternalStatus: "idle" | "auto_playing" | "showing_correct" | "showing_wrong" | "showing_hint" | "done"

Exposed ReviewStatus:
  auto_playing + previewMoves non-empty / siblingAutoPlay / not a user prompt → "auto_playing"
  auto_playing + isUserPrompt                                               → "awaiting_user"
  everything else passes through
```

The board is interactive only in `awaiting_user`.

### Actions

| Action | Fired by |
|---|---|
| `INIT { line, autoPlies }` | Mount / `line.id` change |
| `OPPONENT_PASS` | Auto-play effect, 500 ms: plays current node (opponent or auto-played ply), pushes its children or advances |
| `PREVIEW_PASS` | Auto-play effect, 500 ms: animates one `previewMoves` entry |
| `USER_MOVE { san, fen }` | `submitMove(from, to)`; always promotes to queen |
| `RESET_WRONG` | 350 ms after `showing_wrong` |
| `ADVANCE` | `ReviewBoard` after `showing_correct` (0 ms, or 300 ms if `isLastMove`) |
| `SHOW_HINT` | "Show correct move" button (requires `wrongCount >= 1`) |
| `RESET_HINT` | 1500 ms after `showing_hint` |

### DFS navigation

`pushChildren` adds a frame for a node's children. `advanceFrame` increments the top frame's index; when a frame is exhausted, `popFrame` drops it and advances the parent, cascading. An empty stack → `nextDFSState` returns `status: "done"`.

### Sibling transitions (dormant for chains)

When `ADVANCE` moves to a sibling (`isSiblingTransition`):
- **The user's move deviated** → `siblingAutoPlay = true`: the new sibling is auto-played as a preview before the user answers the opponent's reply.
- **The opponent's move deviated** → snap to the position before the user's branching move, queue that move in `previewMoves`, then `PREVIEW_PASS` + `OPPONENT_PASS` replay both moves before prompting. With no parent user node, it snaps to `topFrame.parentFen` and plays the opponent move directly.

### `snapBoard`

When true, `ReviewBoard` uses a 0 ms animation (wrong-move reset, hint reset, sibling context snaps). `USER_MOVE`, `nextDFSState` and `PREVIEW_PASS` clear it.

### Timings

| Event | Delay |
|---|---|
| Auto-play (opponent / opening / preview) | 500 ms (`ANIMATION_MS 200 + 300`) |
| Correct → advance | 0 ms ("Correct!" persists through the next auto-play); 300 ms on the last move |
| Wrong move shown | 350 ms, then instant snap back |
| Hint shown | 1500 ms, then instant snap back |
| Piece slide | 200 ms |

## Ops and gotchas

- **Two Neon databases.** Local `.env` → dev (host `ep-holy-wind-…`). Production `DATABASE_URL` (in Vercel) → host `ep-shy-cloud-…`. The `build` script doesn't apply schema changes, so after any `schema.prisma` change, run `npx prisma db push` against **both** (see `progress.md` for the inline `DATABASE_URL=` override). `ReviewItem` was pushed to both on 2026-10-02.
- **Don't mix up Neon projects.** The user's Neon account also has a **LifeManager** project (host `ep-silent-scene-…`, with tables `CalendarEntry`, `Deadline` etc.). Before pushing to a "production" URL, verify it read-only with `DATABASE_URL=… npx prisma db pull --print`: it must contain `Line`, `Position` and `Opening`. Never use `--force-reset`.
- **Claude Code auto mode blocks production DB writes.** The user has to switch to manual mode to approve a production `db push`.
- After deleting a route, `tsc` errors on stale `.next/dev/types/validator.ts` until `next dev` restarts. This is harmless.
- `eslint` reports pre-existing `react-hooks/refs` and `set-state-in-effect` errors in `useLineReview.ts` (`stateRef.current = state`), `ReviewBoard.tsx` and `AnalysisPanel.tsx` (`lastLinesRef`). They aren't regressions.

## History

- The original review drilled a whole line's tree (`/review/<lineId>`, plus `?from=<nodeId>` to start from a move), and `/review` shuffled all lines. Replaced on 2026-10-02 by the saved review list (commit `6cfcd52`). The `/review/[id]` route and the "Review" button on `/lines` cards were removed.

## Possible future work (not requested yet)

- No spaced repetition: a perfect line is simply deleted, and a line with a mistake is drilled again in the same session. Nothing else is stored.
- Underpromotion can't be answered (`submitMove` always promotes to queen).
- Can't remove an item from inside a session, only from the list.
