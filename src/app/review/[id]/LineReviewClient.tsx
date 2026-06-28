"use client"

import dynamic from "next/dynamic"
import type { LineData } from "@/lib/types"
import { useLineReview } from "@/hooks/useLineReview"

const ReviewBoard = dynamic(
  () => import("@/components/ReviewBoard").then((m) => m.ReviewBoard),
  { ssr: false }
)

interface Props {
  line: LineData
  onDone?: () => void
  exitHref?: string
}

export function LineReviewClient({ line, onDone, exitHref }: Props) {
  const {
    boardFen,
    status,
    orientation,
    progressText,
    snapBoard,
    wrongCount,
    submitMove,
    advance,
    showHint,
  } = useLineReview(line)

  return (
    <ReviewBoard
      boardFen={boardFen}
      orientation={orientation}
      status={status}
      progressText={progressText}
      snapBoard={snapBoard}
      wrongCount={wrongCount}
      lineLabel={line.label}
      lineId={line.id}
      onMove={submitMove}
      onNext={advance}
      onShowHint={showHint}
      onDone={onDone}
      exitHref={exitHref}
    />
  )
}
