"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import type { LineNode, ReviewItemData } from "@/lib/types"
import { useLineReview } from "@/hooks/useLineReview"
import { reviewAutoPlies } from "@/lib/review"

const ReviewBoard = dynamic(
  () => import("@/components/ReviewBoard").then((m) => m.ReviewBoard),
  { ssr: false }
)

// A review item is a single path; turn it into a one-branch tree for the review hook.
function toChain(item: ReviewItemData): LineNode[] {
  let children: LineNode[] = []
  for (let i = item.moves.length - 1; i >= 0; i--) {
    const { move, fen } = item.moves[i]
    children = [{ id: `${item.id}-${i}`, move, fen, children }]
  }
  return children
}

interface Props {
  item: ReviewItemData
  progressText: string
  isLastInQueue: boolean
  onDone: (hadMistake: boolean) => void
  onExit: () => void
}

export function ReviewItemSession({ item, progressText, isLastInQueue, onDone, onExit }: Props) {
  const line = useMemo(
    () => ({ id: item.id, startFen: item.startFen, tree: toChain(item), boardOrientation: item.orientation }),
    [item]
  )
  const {
    boardFen,
    status,
    orientation,
    snapBoard,
    wrongCount,
    hadMistake,
    isLastMove,
    submitMove,
    advance,
    showHint,
  } = useLineReview(line, reviewAutoPlies(item.orientation))

  // A perfect line leaves the review list; one with any mistake goes back into the queue.
  const doneMessage = hadMistake
    ? "You made a mistake. This line will come up again."
    : "No mistakes! Removed from your review list."
  const doneLabel = isLastInQueue && !hadMistake ? "Finish" : "Next line"

  // Analyze link carries the moves played so far (not the rest of the line) and opens after the last one.
  // A board off the line (wrong move / hint showing) falls back to just that position.
  const ply = boardFen === item.startFen ? 0 : item.moves.findIndex((m) => m.fen === boardFen) + 1
  const analyzeParams = new URLSearchParams(
    ply > 0
      ? {
          fen: item.startFen,
          moves: item.moves.slice(0, ply).map((m) => m.move).join(" "),
          ply: "end",
          orientation,
        }
      : { fen: boardFen, orientation }
  )
  const analyzeHref = `/analyze?${analyzeParams}`

  return (
    <ReviewBoard
      boardFen={boardFen}
      orientation={orientation}
      status={status}
      progressText={progressText}
      snapBoard={snapBoard}
      wrongCount={wrongCount}
      isLastMove={isLastMove}
      lineLabel={item.label ?? "Untitled line"}
      lineId={item.lineId}
      onMove={submitMove}
      onNext={advance}
      onShowHint={showHint}
      onDone={() => onDone(hadMistake)}
      doneLabel={doneLabel}
      doneMessage={doneMessage}
      analyzeHref={analyzeHref}
      onExit={onExit}
    />
  )
}
