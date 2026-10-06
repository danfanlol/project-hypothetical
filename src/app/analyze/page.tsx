"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { Chess } from "chess.js"

const AnalysisPanel = dynamic(
  () => import("@/components/AnalysisPanel").then((m) => m.AnalysisPanel),
  { ssr: false }
)

function parseFen(raw: string | null): string | null {
  if (!raw) return null
  try {
    return new Chess(raw).fen()
  } catch {
    return null
  }
}

function AnalyzeContent() {
  const searchParams = useSearchParams()
  const fen = parseFen(searchParams.get("fen"))
  const orientation = searchParams.get("orientation") === "black" ? "black" : "white"
  // Optional space-separated SANs from fen; the panel lets you step through them
  const movesParam = searchParams.get("moves")?.trim() ?? ""
  const moves = movesParam ? movesParam.split(/\s+/) : undefined
  // Optional ply to open at; "end" opens after the last move
  const plyParam = searchParams.get("ply")
  const startPly = plyParam === "end" ? (moves?.length ?? 0) : Number(plyParam) || 0

  if (!fen) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 w-full">
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">Invalid or missing FEN.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full flex flex-col items-center">
      <AnalysisPanel key={`${fen}|${movesParam}|${startPly}`} fen={fen} orientation={orientation} moves={moves} startPly={startPly} />
    </div>
  )
}

export default function AnalyzePage() {
  return (
    <Suspense>
      <AnalyzeContent />
    </Suspense>
  )
}
