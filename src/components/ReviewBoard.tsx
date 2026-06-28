"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs } from "react-chessboard"
import { Chess, type Square } from "chess.js"
import Link from "next/link"
import { ChessErrorBoundary } from "@/components/ChessErrorBoundary"
import { useSettings } from "@/components/SettingsProvider"
import { BOARD_THEMES } from "@/lib/settings"
import type { ReviewStatus } from "@/hooks/useLineReview"


interface ReviewBoardProps {
  boardFen: string
  orientation: "white" | "black"
  status: ReviewStatus
  progressText: string
  snapBoard: boolean
  wrongCount: number
  isLastMove: boolean
  lineLabel: string | null
  lineId: string
  onMove: (from: string, to: string) => void
  onNext: () => void
  onShowHint: () => void
  onDone?: () => void
  exitHref?: string
}

export function ReviewBoard({
  boardFen,
  orientation,
  status,
  progressText,
  snapBoard,
  wrongCount,
  isLastMove,
  lineLabel,
  lineId,
  onMove,
  onNext,
  onShowHint,
  onDone,
  exitHref,
}: ReviewBoardProps) {
  const { settings } = useSettings()
  const boardSizePx = settings.boardSizePx
  const boardColors = BOARD_THEMES[settings.boardTheme]

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [optionSquares, setOptionSquares] = useState<Record<string, CSSProperties>>({})
  const [showCorrect, setShowCorrect] = useState(false)
  const fenRef = useRef(boardFen)
  fenRef.current = boardFen

  useEffect(() => {
    setSelectedSquare(null)
    setOptionSquares({})
  }, [boardFen])

  // Track "Correct!" feedback through the subsequent auto-play phase
  useEffect(() => {
    if (status === "showing_correct") {
      setShowCorrect(true)
    } else if (status !== "auto_playing") {
      setShowCorrect(false)
    }
  }, [status])

  // Auto-advance after a correct answer
  useEffect(() => {
    if (status !== "showing_correct") return
    const t = setTimeout(onNext, isLastMove ? 300 : 0)
    return () => clearTimeout(t)
  }, [status, onNext, isLastMove])

  const isInteractive = status === "awaiting_user"

  function getMoveOptions(square: string): Record<string, CSSProperties> {
    const game = new Chess(fenRef.current)
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

  function handleSquareMouseDown({ piece, square }: SquareHandlerArgs, e: React.MouseEvent) {
    if (e.button !== 0) { setSelectedSquare(null); setOptionSquares({}); return }
    if (!isInteractive) return
    const turn = new Chess(fenRef.current).turn()
    if (piece?.pieceType[0] === turn) {
      setSelectedSquare(square)
      setOptionSquares(getMoveOptions(square))
    }
  }

  function handleSquareClick({ piece, square }: SquareHandlerArgs) {
    if (!isInteractive) return
    if (!selectedSquare || selectedSquare === square) return
    onMove(selectedSquare, square)
    setSelectedSquare(null)
    setOptionSquares({})
    // Re-select if clicking another own piece
    const turn = new Chess(fenRef.current).turn()
    if (piece?.pieceType[0] === turn) {
      setSelectedSquare(square)
      setOptionSquares(getMoveOptions(square))
    }
  }

  function handlePieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!isInteractive || !targetSquare) return false
    onMove(sourceSquare, targetSquare)
    setSelectedSquare(null)
    setOptionSquares({})
    return true
  }

  return (
    <div className="flex flex-col items-center gap-4" style={{ width: "100%", maxWidth: boardSizePx }}>
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          {lineLabel && (
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{lineLabel}</p>
          )}
          {progressText && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{progressText}</p>
          )}
        </div>
        <Link
          href={exitHref ?? `/lines/${lineId}`}
          className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          Exit review
        </Link>
      </div>

      {/* Board */}
      <div className="w-full">
        <ChessErrorBoundary>
          <Chessboard
            options={{
              position: boardFen,
              boardOrientation: orientation,
              allowDragging: isInteractive,
              animationDurationInMs: snapBoard || status === "idle" ? 0 : 200,
              boardStyle: { borderRadius: "4px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" },
              darkSquareStyle: { backgroundColor: boardColors.dark },
              lightSquareStyle: { backgroundColor: boardColors.light },
              squareStyles: optionSquares,
              onSquareMouseDown: handleSquareMouseDown,
              onSquareClick: handleSquareClick,
              onPieceDrop: handlePieceDrop,
            }}
          />
        </ChessErrorBoundary>
      </div>

      {/* Status bar */}
      <div className="h-20 w-full flex flex-col items-center justify-center gap-2">
        {(status === "idle" || (status === "auto_playing" && !showCorrect)) && (
          <p className="text-zinc-400 dark:text-zinc-500 text-sm">
            {status === "idle" ? "Loading…" : "Playing…"}
          </p>
        )}

        {status === "awaiting_user" && !showCorrect && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-zinc-900 dark:text-zinc-100 font-semibold text-lg">
              Make the best move
            </p>
            {wrongCount >= 1 && (
              <button
                onClick={onShowHint}
                className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors"
              >
                Show correct move
              </button>
            )}
          </div>
        )}

        {status === "showing_wrong" && (
          <p className="text-red-500 dark:text-red-400 font-semibold text-lg">Wrong!</p>
        )}

        {status === "showing_hint" && (
          <p className="text-zinc-400 dark:text-zinc-500 text-sm">Correct move shown…</p>
        )}

        {showCorrect && (
          <p className="text-green-600 dark:text-green-500 font-semibold text-lg">Correct!</p>
        )}

        {status === "done" && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-zinc-900 dark:text-zinc-100 font-semibold text-lg">
              Line complete!
            </p>
            {onDone ? (
              <button
                onClick={onDone}
                className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
              >
                Next line
              </button>
            ) : (
              <Link
                href={`/lines/${lineId}`}
                className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
              >
                Back to line
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
