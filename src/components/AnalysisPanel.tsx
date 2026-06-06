"use client"

import { useEffect, useRef, useState } from "react"
import { useSettings } from "@/components/SettingsProvider"
import dynamic from "next/dynamic"
import { Chess } from "chess.js"
import { useStockfish, type AnalysisLine } from "@/hooks/useStockfish"
import type { PieceDropHandlerArgs } from "react-chessboard"

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false }
)

function formatScore(line: AnalysisLine, isBlackToMove: boolean): string {
  if (line.scoreType === "mate") {
    const m = isBlackToMove ? -line.score : line.score
    return m > 0 ? `M${m}` : `-M${Math.abs(m)}`
  }
  const cp = isBlackToMove ? -line.score : line.score
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`
}

function isPositiveScore(line: AnalysisLine, isBlackToMove: boolean): boolean {
  const cp =
    line.scoreType === "cp"
      ? isBlackToMove ? -line.score : line.score
      : isBlackToMove ? -line.score : line.score
  return cp >= 0
}

function EvalBar({ line, isBlackToMove }: { line: AnalysisLine; isBlackToMove: boolean }) {
  const whiteCp =
    line.scoreType === "cp"
      ? isBlackToMove ? -line.score : line.score
      : (isBlackToMove ? -line.score : line.score) * 300
  const clamped = Math.max(-800, Math.min(800, whiteCp))
  const whitePercent = 50 + (clamped / 800) * 50

  return (
    <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden mb-3">
      <div
        className="h-full bg-white transition-all duration-500 ease-out"
        style={{ width: `${whitePercent}%` }}
      />
    </div>
  )
}

interface AnalysisPanelProps {
  fen: string
  orientation: "white" | "black"
}

export function AnalysisPanel({ fen: initialFen, orientation }: AnalysisPanelProps) {
  const { settings } = useSettings()
  const [history, setHistory] = useState<string[]>([initialFen])
  const [historyIndex, setHistoryIndex] = useState(0)
  const explorationFen = history[historyIndex]

  const { lines, isAnalyzing } = useStockfish(explorationFen)

  // Keep the last non-empty lines so the panel doesn't collapse while re-analyzing
  const lastLinesRef = useRef<typeof lines>([])
  useEffect(() => { if (lines.length > 0) lastLinesRef.current = lines }, [lines])
  const displayLines = lines.length > 0 ? lines : lastLinesRef.current
  const isStale = isAnalyzing && lines.length === 0

  const isBlackToMove = explorationFen.trim().split(" ")[1] === "b"
  const topLine = displayLines[0]
  const depth = lines[0]?.depth ?? (isStale ? lastLinesRef.current[0]?.depth ?? 0 : 0)
  const hasMoved = historyIndex > 0

  // Keep a ref to history.length so the keyboard handler (empty-dep effect) can
  // clamp the right-arrow index without a stale closure.
  const historyLengthRef = useRef(history.length)
  useEffect(() => { historyLengthRef.current = history.length }, [history])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      if (e.key === "ArrowLeft") {
        e.preventDefault()
        setHistoryIndex((i) => Math.max(0, i - 1))
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        setHistoryIndex((i) => Math.min(i + 1, historyLengthRef.current - 1))
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  function handlePieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!targetSquare) return false
    const game = new Chess(explorationFen)
    try {
      game.move({ from: sourceSquare, to: targetSquare, promotion: "q" })
    } catch {
      return false
    }
    const newFen = game.fen()
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), newFen])
    setHistoryIndex((i) => i + 1)
    return true
  }

  return (
    <div className="w-full border border-zinc-200 rounded-lg p-4 bg-white mt-3" style={{ maxWidth: settings.boardSizePx }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700">Engine Analysis</h3>
        <div className="flex items-center gap-3">
          {hasMoved && (
            <button
              onClick={() => { setHistory([initialFen]); setHistoryIndex(0) }}
              className="text-xs text-zinc-500 hover:text-zinc-800 underline transition-colors"
            >
              Reset
            </button>
          )}
          <span className="text-xs text-zinc-400">
            {isStale
              ? <span className="animate-pulse">Updating…</span>
              : isAnalyzing
                ? <span className="animate-pulse">Analyzing…</span>
                : depth > 0 ? `depth ${depth}` : null}
          </span>
        </div>
      </div>

      {/* Eval bar */}
      {topLine && <EvalBar line={topLine} isBlackToMove={isBlackToMove} />}

      {/* Interactive exploration board */}
      <div className="mb-1">
        <Chessboard
          options={{
            position: explorationFen,
            boardOrientation: orientation,
            allowDragging: true,
            onPieceDrop: handlePieceDrop,
            animationDurationInMs: 150,
            boardStyle: { borderRadius: "4px" },
          }}
        />
        <p className="text-xs text-zinc-400 text-center mt-1.5">
          {isBlackToMove ? "Black to move" : "White to move"}
          {" · drag pieces to explore"}
        </p>
      </div>

      {/* Analysis lines */}
      {displayLines.length === 0 && (
        <p className="text-xs text-zinc-400 text-center py-3">
          {isAnalyzing ? "Loading engine…" : "No analysis available"}
        </p>
      )}

      <div className={`flex flex-col divide-y divide-zinc-100 mt-2 transition-opacity duration-200 ${isStale ? "opacity-40" : "opacity-100"}`}>
        {displayLines.map((line) => (
          <div key={line.multipv} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
            <span
              className={`text-sm font-mono font-semibold w-14 shrink-0 ${
                isPositiveScore(line, isBlackToMove) ? "text-zinc-900" : "text-zinc-400"
              }`}
            >
              {formatScore(line, isBlackToMove)}
            </span>
            <span className="text-sm font-mono text-zinc-600 leading-snug">
              {line.sanMoves.slice(0, 4).join("  ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
