"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { useSettings } from "@/components/SettingsProvider"
import { BOARD_THEMES } from "@/lib/settings"
import dynamic from "next/dynamic"
import { Chess, type Square } from "chess.js"
import { useStockfish, type AnalysisLine } from "@/hooks/useStockfish"
import type { PieceDropHandlerArgs, SquareHandlerArgs } from "react-chessboard"

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

interface HistoryEntry {
  fen: string
  san: string | null // move leading to this position; null for the starting position
}

// Replays SAN moves from fen, stopping at the first illegal one.
function buildHistory(fen: string, moves: string[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [{ fen, san: null }]
  const game = new Chess(fen)
  for (const m of moves) {
    try {
      const move = game.move(m)
      entries.push({ fen: game.fen(), san: move.san })
    } catch {
      break
    }
  }
  return entries
}

interface AnalysisPanelProps {
  fen: string
  orientation: "white" | "black"
  // Optional line (SANs from fen) to step through; the panel starts at fen.
  moves?: string[]
  // Ply of moves to open at instead of fen (clamped to the line's length)
  startPly?: number
}

export function AnalysisPanel({ fen: initialFen, orientation, moves, startPly = 0 }: AnalysisPanelProps) {
  const { settings } = useSettings()
  const boardColors = BOARD_THEMES[settings.boardTheme]
  const [initialHistory] = useState(() => buildHistory(initialFen, moves ?? []))
  const initialIndex = Math.max(0, Math.min(startPly, initialHistory.length - 1))
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory)
  const [historyIndex, setHistoryIndex] = useState(initialIndex)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [optionSquares, setOptionSquares] = useState<Record<string, CSSProperties>>({})
  const explorationFen = history[historyIndex].fen

  const { lines, isAnalyzing } = useStockfish(explorationFen)

  // Keep the last non-empty lines so the panel doesn't collapse while re-analyzing
  const lastLinesRef = useRef<typeof lines>([])
  useEffect(() => { if (lines.length > 0) lastLinesRef.current = lines }, [lines])
  const displayLines = lines.length > 0 ? lines : lastLinesRef.current
  const isStale = isAnalyzing && lines.length === 0

  const isBlackToMove = explorationFen.trim().split(" ")[1] === "b"
  const topLine = displayLines[0]
  const depth = lines[0]?.depth ?? (isStale ? lastLinesRef.current[0]?.depth ?? 0 : 0)
  const deviated =
    history.length !== initialHistory.length || history.some((h, i) => h.fen !== initialHistory[i].fen)
  const hasMoved = historyIndex !== initialIndex || deviated

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

  function getMoveOptions(square: string, fen: string): Record<string, CSSProperties> {
    const game = new Chess(fen)
    const moves = game.moves({ square: square as Square, verbose: true })
    const options: Record<string, CSSProperties> = {
      [square]: { background: "rgba(255,255,0,0.4)" },
    }
    for (const m of moves) {
      options[m.to] = game.get(m.to)
        ? { background: "radial-gradient(circle, rgba(0,0,0,.18) 80%, transparent 80%)" }
        : { background: "radial-gradient(circle, rgba(0,0,0,.18) 25%, transparent 25%)" }
    }
    return options
  }

  function applyMove(from: string, to: string): boolean {
    const game = new Chess(explorationFen)
    try {
      game.move({ from, to, promotion: "q" })
    } catch {
      return false
    }
    const fen = game.fen()
    // Playing the next move of the current history just steps forward, keeping the rest of it
    if (history[historyIndex + 1]?.fen !== fen) {
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), { fen, san: game.history().at(-1) ?? null }])
    }
    setHistoryIndex((i) => i + 1)
    return true
  }

  // Numbered move tokens for history[1..]: "1." / "1..." prefixes from initialFen's counters
  const startFields = initialFen.split(" ")
  const startMoveNum = Number(startFields[5]) || 1
  const startWhiteToMove = startFields[1] !== "b"
  const moveTokens = history.slice(1).map((entry, i) => {
    const ply = i + (startWhiteToMove ? 0 : 1)
    const num = startMoveNum + Math.floor(ply / 2)
    const isWhite = ply % 2 === 0
    const prefix = isWhite ? `${num}.` : i === 0 ? `${num}...` : null
    return { index: i + 1, san: entry.san, prefix }
  })

  function handlePieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!targetSquare) return false
    const moved = applyMove(sourceSquare, targetSquare)
    if (moved) { setSelectedSquare(null); setOptionSquares({}) }
    return moved
  }

  function handleSquareMouseDown({ piece, square }: SquareHandlerArgs, e: React.MouseEvent) {
    if (e.button !== 0) {
      setSelectedSquare(null)
      setOptionSquares({})
      return
    }
    const turn = new Chess(explorationFen).turn()
    if (piece?.pieceType[0] === turn) {
      setSelectedSquare(square)
      setOptionSquares(getMoveOptions(square, explorationFen))
    }
  }

  function handleSquareClick({ piece, square }: SquareHandlerArgs) {
    if (!selectedSquare || selectedSquare === square) return
    const turn = new Chess(explorationFen).turn()
    if (applyMove(selectedSquare, square)) {
      setSelectedSquare(null)
      setOptionSquares({})
      return
    }
    if (!piece || piece.pieceType[0] !== turn) {
      setSelectedSquare(null)
      setOptionSquares({})
    }
  }

  return (
    <div className="w-full border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 bg-white dark:bg-zinc-900 mt-3" style={{ maxWidth: settings.boardSizePx }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Engine Analysis</h3>
        <div className="flex items-center gap-3">
          {hasMoved && (
            <button
              onClick={() => { setHistory(initialHistory); setHistoryIndex(initialIndex) }}
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 underline transition-colors"
            >
              Reset
            </button>
          )}
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
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
            onSquareMouseDown: handleSquareMouseDown,
            onSquareClick: handleSquareClick,
            squareStyles: optionSquares,
            animationDurationInMs: 150,
            boardStyle: { borderRadius: "4px" },
            darkSquareStyle: { backgroundColor: boardColors.dark },
            lightSquareStyle: { backgroundColor: boardColors.light },
          }}
        />
        <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center mt-1.5">
          {isBlackToMove ? "Black to move" : "White to move"}
          {" · click or drag to explore"}
        </p>
      </div>

      {/* Move list */}
      {moves && moveTokens.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-sm font-mono mt-2 mb-1">
          <button
            onClick={() => setHistoryIndex(0)}
            className={`px-1 rounded transition-colors ${
              historyIndex === 0
                ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                : "text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            Start
          </button>
          {moveTokens.map((t) => (
            <span key={t.index} className="flex items-baseline">
              {t.prefix && <span className="text-zinc-400 dark:text-zinc-500 mr-0.5">{t.prefix}</span>}
              <button
                onClick={() => setHistoryIndex(t.index)}
                className={`px-1 rounded transition-colors ${
                  historyIndex === t.index
                    ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {t.san}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Analysis lines */}
      {displayLines.length === 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center py-3">
          {isAnalyzing ? "Loading engine…" : "No analysis available"}
        </p>
      )}

      <div className={`flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800 mt-2 transition-opacity duration-200 ${isStale ? "opacity-40" : "opacity-100"}`}>
        {displayLines.map((line) => (
          <div key={line.multipv} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
            <span
              className={`text-sm font-mono font-semibold w-14 shrink-0 ${
                isPositiveScore(line, isBlackToMove) ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {formatScore(line, isBlackToMove)}
            </span>
            <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400 leading-snug">
              {line.sanMoves.slice(0, 4).join("  ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
