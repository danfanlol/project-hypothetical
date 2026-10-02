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
  doneLabel: string
  onDone: () => void
  onExit: () => void
}

export function ReviewItemSession({ item, progressText, doneLabel, onDone, onExit }: Props) {
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
    isLastMove,
    submitMove,
    advance,
    showHint,
  } = useLineReview(line, reviewAutoPlies(item.orientation))

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
      onDone={onDone}
      doneLabel={doneLabel}
      onExit={onExit}
    />
  )
}
