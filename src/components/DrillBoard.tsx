"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs } from "react-chessboard"
import { Chess, type Square } from "chess.js"
import type { PositionData } from "@/lib/types"
import Link from "next/link"
import { ChessErrorBoundary } from "@/components/ChessErrorBoundary"
import { AnalysisPanel } from "@/components/AnalysisPanel"
import { useSettings } from "@/components/SettingsProvider"
import { BOARD_THEMES } from "@/lib/settings"

type Phase = "ready" | "move1" | "move2" | "waiting" | "done"

const READY_DELAY = 500    // pause on starting position before first move
const BETWEEN_DELAY = 400   // gap between move1 finishing and move2 starting
const ANIMATION_MS = 200    // piece slide duration

// Capitalize piece letter in SAN for display (qxe8+ → Qxe8+, nc3 → Nc3).
// Pawn moves (e4, exd5) are unaffected since they start with a file letter.
function displaySan(san: string): string {
  return san.replace(/^([nbqrk])/i, (c) => c.toUpperCase())
}

// chess.js SAN is case-sensitive (Nc3, Be7). Try the move as-is, then fall
// back to a case-insensitive search over legal moves so user-entered lowercase
// moves like "nc3" or "be7" still work.
function tryMove(chess: Chess, san: string): string | null {
  try {
    const result = chess.move(san)
    return result?.san ?? null
  } catch {
    const match = chess.moves({ verbose: true }).find(
      (m) => m.san.toLowerCase() === san.toLowerCase()
    )
    if (match) {
      try {
        const result = chess.move(match.san)
        return result?.san ?? null
      } catch {}
    }
    return null
  }
}

interface DrillBoardProps {
  position: PositionData
  onNext: (wasCorrect: boolean) => void
  nextLabel?: string
}

function InvalidPosition({ label, onSkip, skipLabel }: { label: string | null; onSkip: () => void; skipLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-[480px]">
      {label && (
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{label}</p>
      )}
      <div className="w-full aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center gap-2 text-center p-6">
        <p className="text-zinc-700 dark:text-zinc-300 font-medium">Invalid position</p>
        <p className="text-zinc-400 dark:text-zinc-500 text-sm">The FEN for this position is invalid. Edit it to fix.</p>
      </div>
      <button
        onClick={onSkip}
        className="px-5 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
      >
        {skipLabel}
      </button>
    </div>
  )
}

export function DrillBoard({ position, onNext, nextLabel = "Next position →" }: DrillBoardProps) {
  const { settings } = useSettings()
  const boardSizePx = settings.boardSizePx
  const boardColors = BOARD_THEMES[settings.boardTheme]
  const isFenValid = (() => { try { new Chess(position.fen); return true } catch { return false } })()
  const [fen, setFen] = useState(position.fen)
  const [phase, setPhase] = useState<Phase>("ready")
  const [playedSan, setPlayedSan] = useState<string | null>(null)
  const [result, setResult] = useState<"correct" | "wrong" | null>(null)
  const [wrongMove, setWrongMove] = useState<string | null>(null)
  const [analysisFen, setAnalysisFen] = useState<string | null>(null)
  const [replayKey, setReplayKey] = useState(0)
  const [userMoveSan, setUserMoveSan] = useState<string | null>(null)
  const [isReplaying, setIsReplaying] = useState(false)
  const [replayResetting, setReplayResetting] = useState(false)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [optionSquares, setOptionSquares] = useState<Record<string, CSSProperties>>({})
  const fenRef = useRef(fen)
  const preMoveRef = useRef(fen)  // FEN after move1+move2, before user's response
  const replayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  fenRef.current = fen

  // Board orientation: use stored preference, fall back to inferring from FEN
  const orientation = (() => {
    if (position.boardOrientation === "white") return "white"
    if (position.boardOrientation === "black") return "black"
    try {
      const g = new Chess(position.fen)
      tryMove(g, position.move1)
      tryMove(g, position.move2)
      return g.turn() === "w" ? "white" : "black"
    } catch {
      return "white" as const
    }
  })()

  useEffect(() => {
    setFen(position.fen)
    setPhase("ready")
    setPlayedSan(null)
    setResult(null)
    setWrongMove(null)
    setAnalysisFen(null)
    setUserMoveSan(null)
    setIsReplaying(false)
    setReplayResetting(false)
    setSelectedSquare(null)
    setOptionSquares({})
    replayTimersRef.current.forEach(clearTimeout)
    replayTimersRef.current = []

    const chess = new Chess(position.fen)
    const timers: ReturnType<typeof setTimeout>[] = []

    // After initial pause, play move 1
    timers.push(setTimeout(() => {
      const san = tryMove(chess, position.move1)
      setPlayedSan(san ?? position.move1)
      setPhase("move1")
      setFen(chess.fen())

      // After piece slides in + gap, play move 2
      timers.push(setTimeout(() => {
        const san2 = tryMove(chess, position.move2)
        setPlayedSan(san2 ?? position.move2)
        setPhase("move2")
        setFen(chess.fen())

        // After piece slides in, hand control to the user
        timers.push(setTimeout(() => {
          setPhase("waiting")
          setPlayedSan(null)
        }, ANIMATION_MS + 300))
      }, ANIMATION_MS + BETWEEN_DELAY))
    }, READY_DELAY))

    return () => {
      timers.forEach(clearTimeout)
      replayTimersRef.current.forEach(clearTimeout)
      replayTimersRef.current = []
    }
  }, [position, replayKey])

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

  function executeMove(from: string, to: string): boolean {
    const game = new Chess(fenRef.current)
    let move
    try {
      move = game.move({ from, to, promotion: "q" })
    } catch {
      return false
    }
    if (!move) return false
    preMoveRef.current = fenRef.current
    const isCorrect = position.correctMoves.some(
      (m) => m.toLowerCase() === move.san.toLowerCase()
    )
    setResult(isCorrect ? "correct" : "wrong")
    setPhase("done")
    setUserMoveSan(move.san)
    if (isCorrect) setFen(game.fen())
    else setWrongMove(move.san)
    return true
  }

  function handlePieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (phase !== "waiting" || !targetSquare) return false
    const moved = executeMove(sourceSquare, targetSquare)
    if (moved) { setSelectedSquare(null); setOptionSquares({}) }
    return moved
  }

  function handleSquareMouseDown({ piece, square }: SquareHandlerArgs, e: React.MouseEvent) {
    if (e.button !== 0) return
    if (phase !== "waiting" || isReplaying) return
    const turn = new Chess(fenRef.current).turn()
    if (piece?.pieceType[0] === turn) {
      setSelectedSquare(square)
      setOptionSquares(getMoveOptions(square))
    }
  }

  function handleSquareClick({ piece, square }: SquareHandlerArgs) {
    if (phase !== "waiting" || isReplaying) return
    if (!selectedSquare || selectedSquare === square) return
    const turn = new Chess(fenRef.current).turn()
    if (executeMove(selectedSquare, square)) {
      setSelectedSquare(null)
      setOptionSquares({})
      return
    }
    if (!piece || piece.pieceType[0] !== turn) {
      setSelectedSquare(null)
      setOptionSquares({})
    }
  }

  function startDoneReplay() {
    replayTimersRef.current.forEach(clearTimeout)
    replayTimersRef.current = []

    setReplayResetting(true)
    setIsReplaying(true)

    const chess = new Chess(position.fen)
    setFen(position.fen)

    const timers: ReturnType<typeof setTimeout>[] = []

    timers.push(setTimeout(() => {
      setReplayResetting(false)
      tryMove(chess, position.move1)
      setFen(chess.fen())

      timers.push(setTimeout(() => {
        tryMove(chess, position.move2)
        setFen(chess.fen())

        if (result === "correct" && userMoveSan) {
          timers.push(setTimeout(() => {
            tryMove(chess, userMoveSan)
            setFen(chess.fen())
            timers.push(setTimeout(() => setIsReplaying(false), ANIMATION_MS))
          }, ANIMATION_MS + BETWEEN_DELAY))
        } else {
          timers.push(setTimeout(() => setIsReplaying(false), ANIMATION_MS))
        }
      }, ANIMATION_MS + BETWEEN_DELAY))
    }, READY_DELAY))

    replayTimersRef.current = timers
  }

  if (!isFenValid) {
    return <InvalidPosition label={position.label} onSkip={() => onNext(true)} skipLabel={nextLabel} />
  }

  return (
    <div className="flex flex-col items-center gap-4" style={{ width: "100%", maxWidth: boardSizePx }}>
      {position.label && (
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          {position.label}
        </p>
      )}

      <div className="w-full">
        <ChessErrorBoundary>
          <Chessboard
            options={{
              position: fen,
              boardOrientation: orientation,
              allowDragging: phase === "waiting" && !isReplaying,
              animationDurationInMs: replayResetting ? 0 : (phase === "ready" ? 0 : ANIMATION_MS),
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
      <div className="h-16 flex flex-col items-center justify-center gap-1">
        {phase === "ready" && (
          <p className="text-zinc-400 text-sm">Get ready…</p>
        )}
        {(phase === "move1" || phase === "move2") && playedSan && (
          <p className="text-zinc-600 dark:text-zinc-400 font-mono text-base">
            Playing <span className="font-bold text-zinc-900 dark:text-zinc-100">{playedSan}</span>
          </p>
        )}
        {phase === "waiting" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-zinc-900 dark:text-zinc-100 font-semibold text-lg">Make the best move</p>
            <button
              onClick={() => setReplayKey((k) => k + 1)}
              className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              ↺ Replay
            </button>
          </div>
        )}
        {phase === "done" && result === "correct" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-green-600 font-semibold text-lg">Correct!</p>
            <div className="flex gap-2 flex-wrap justify-center">
              <button
                onClick={startDoneReplay}
                disabled={isReplaying}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                ↺ Replay
              </button>
              <button
                onClick={() => setAnalysisFen(preMoveRef.current)}
                disabled={analysisFen !== null}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                Analyze
              </button>
              <button
                onClick={() => onNext(true)}
                className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
              >
                {nextLabel}
              </button>
            </div>
          </div>
        )}
        {phase === "done" && result === "wrong" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-red-500 font-semibold">
              Wrong — you played <span className="font-mono">{wrongMove ? displaySan(wrongMove) : ""}</span>
            </p>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              Correct:{" "}
              <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                {position.correctMoves.map(displaySan).join(" or ")}
              </span>
            </p>
            <div className="flex gap-2 flex-wrap justify-center">
              <button
                onClick={startDoneReplay}
                disabled={isReplaying}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                ↺ Replay
              </button>
              <button
                onClick={() => setAnalysisFen(preMoveRef.current)}
                disabled={analysisFen !== null}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                Analyze
              </button>
              <Link
                href={`/positions/${position.id}/edit?returnTo=${encodeURIComponent(`/practice?startAt=${position.id}`)}`}
                className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded-md text-sm hover:bg-zinc-50 transition-colors"
              >
                Edit
              </Link>
              <button
                onClick={() => onNext(false)}
                className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
              >
                {nextLabel}
              </button>
            </div>
          </div>
        )}
      </div>

      {analysisFen && <AnalysisPanel fen={analysisFen} orientation={orientation} />}
    </div>
  )
}
