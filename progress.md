# Review Feature — Progress

## What it does

A review mode for chess opening lines. The user is drilled on every user-turn move in the line tree via a DFS walk:

- **Opponent moves** are auto-played with animation.
- **User moves** are tested — the user must play the correct move to advance.
- **Wrong move** — the wrong piece shows on the board briefly (350 ms), then snaps back instantly. "Wrong!" is shown. The user retries immediately.
- **Correct move** — "Correct!" flashes. If the node is a leaf (no children), holds for 300 ms before the DFS recurses back, so the user can register the move.
- **Hint** — after the first wrong attempt a "Show correct move" button appears. Clicking it animates the correct position for 1.5 s then snaps back.
- **Done** when the DFS stack empties — shows "Line complete!" with a "Back to line" button (or "Next line" in the review-all flow).

## Entry points

| URL | Behaviour |
|---|---|
| `/review` | Fetches all lines, shuffles them, reviews one by one. "Next line" advances the queue. |
| `/review/<lineId>` | Reviews a single line. |
| Lines page | "Review" button on each line card links to `/review/<lineId>`. |
| Nav bar | "Review" tab (between Practice and Search) links to `/review`. |
| Review board header | Opening name is a link that opens the line editor in a new tab. |

## Files

| File | Role |
|---|---|
| `src/hooks/useLineReview.ts` | Core state machine (pure reducer + hook) |
| `src/components/ReviewBoard.tsx` | Chess board UI for the review session |
| `src/app/review/page.tsx` | Server component — fetches all lines, passes to AllLinesReviewClient |
| `src/app/review/AllLinesReviewClient.tsx` | Client component — shuffles lines, manages queue index |
| `src/app/review/[id]/page.tsx` | Server component — fetches single line from Prisma, auth-guards |
| `src/app/review/[id]/LineReviewClient.tsx` | Client component — wires hook to board |
| `src/components/LineList.tsx` | "Review" button next to "Open" on each line card |

## State machine (`useLineReview.ts`)

### Key types

```ts
interface ReviewFrame {
  nodes: LineNode[]   // sibling nodes at this DFS level
  parentFen: string   // board state before any move in nodes[]
  index: number       // current position in nodes[]
}

interface ReviewState {
  stack: ReviewFrame[]
  siblingAutoPlay: boolean
  previewMoves: LineNode[]   // nodes to replay before the next opponent sibling
  snapBoard: boolean         // true → next boardFen change uses 0 ms animation
  boardFen: string
  status: InternalStatus     // see below
  currentNode: LineNode | null
  orientation: "white" | "black"
  wrongCount: number         // wrong attempts at the current position; resets on node change
}
```

### Internal vs exposed status

```
InternalStatus:  "idle" | "auto_playing" | "showing_correct" | "showing_wrong" | "showing_hint" | "done"

Exposed (ReviewStatus):
  auto_playing + previewMoves non-empty  → "auto_playing"
  auto_playing + siblingAutoPlay         → "auto_playing"
  auto_playing + opponent's turn         → "auto_playing"
  auto_playing + user's turn             → "awaiting_user"
  showing_correct / showing_wrong / showing_hint / done → passed through
```

### Actions

| Action | When |
|---|---|
| `INIT` | On mount / line change |
| `PREVIEW_PASS` | Timer fires to animate one previewMoves entry |
| `OPPONENT_PASS` | Timer fires to auto-play the current opponent node |
| `USER_MOVE(san, fen)` | User drags/clicks a piece; `fen` is the board state after the move |
| `RESET_WRONG` | Timer fires 350 ms after a wrong move to snap board back |
| `ADVANCE` | Auto-fires after `showing_correct` (0 ms for non-leaf, 300 ms for leaf nodes) |
| `SHOW_HINT` | User clicks "Show correct move" (available after first wrong attempt) |
| `RESET_HINT` | Timer fires 1500 ms after hint is shown to snap board back |

### DFS navigation

`advanceFrame` increments the current frame's index. When exhausted, `popFrame` removes it and calls `advanceFrame` on the parent — this cascades until a non-exhausted frame is found or the stack empties (→ `status = "done"`).

### Sibling transitions

When `ADVANCE` detects `isSiblingTransition`:

**Deviated move is the user's** (`siblingAutoPlay = true`): The new sibling node is auto-played via `OPPONENT_PASS` even though it's the user's turn, giving them a preview of the new variation before asking them to respond to the opponent's reply.

**Deviated move is the opponent's** (`previewMoves` path): The board must always show two moves — the user's branching move, then the opponent's new response. Implemented in `ADVANCE`:
1. Detect that the new sibling frame has an opponent move.
2. Look up the parent frame's current user node (the branching move).
3. Snap `boardFen` instantly to `parentFrame.parentFen` (position before the branching move).
4. Queue the branching user node in `previewMoves`.
5. Auto-play effect fires `PREVIEW_PASS` (animates the user's move), then `OPPONENT_PASS` (animates the opponent's new response), then the user is prompted.

If no parent user node exists (opponent siblings at the top level), just snap to `topFrame.parentFen` and play the opponent move directly.

### Wrong move flow

1. User drops piece on wrong square.
2. `submitMove` computes the resulting FEN and dispatches `USER_MOVE(san, fen)`.
3. Reducer sets `boardFen = fen` (shows piece at wrong square) + `status = "showing_wrong"` + increments `wrongCount`.
4. `ReviewBoard` shows **"Wrong!"**.
5. After 350 ms, `RESET_WRONG` fires: `boardFen = parentFen` + `snapBoard = true` + `status = "auto_playing"`.
6. If `wrongCount >= 1`, a "Show correct move" button appears when `status = "awaiting_user"`.

### Hint flow

1. User clicks "Show correct move".
2. `SHOW_HINT` sets `boardFen = currentNode.fen` + `status = "showing_hint"`.
3. Board animates to the correct position. Status bar shows "Correct move shown…".
4. After 1500 ms, `RESET_HINT` fires: snaps board back to `parentFen` + `snapBoard = true` + `status = "auto_playing"`.
5. `wrongCount` is NOT reset — the button remains available for the same position.

### `isLastMove` / leaf-node delay

`isLastMove = currentNode.children.length === 0`. When true, `ReviewBoard` waits 300 ms before firing `ADVANCE` so the user can see "Correct!" and the resulting position before the DFS recurses back to a sibling or parent frame.

### `snapBoard`

A boolean in state. When `true`, `ReviewBoard` sets `animationDurationInMs = 0` so the position change is instant (used for wrong-move reset, hint reset, and opponent-sibling context snaps). Cleared to `false` by `USER_MOVE`, `nextDFSState`, and `PREVIEW_PASS`.

## UX timings

| Event | Delay |
|---|---|
| Opponent / preview auto-play | 500 ms (`ANIMATION_MS 200 + 300`) |
| Correct → advance (non-leaf) | 0 ms (immediate; "Correct!" persists through opponent auto-play) |
| Correct → advance (leaf node) | 300 ms |
| Wrong move shown | 350 ms, then instant snap back |
| Hint shown | 1500 ms, then instant snap back |
| Piece slide animation | 200 ms |
