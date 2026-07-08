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

  if (!fen) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 w-full">
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">Invalid or missing FEN.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full flex flex-col items-center">
      <AnalysisPanel key={fen} fen={fen} orientation={orientation} />
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
