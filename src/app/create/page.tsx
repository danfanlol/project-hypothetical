"use client"

import { useState, useCallback, useEffect } from "react"
import dynamic from "next/dynamic"
import { Chess } from "chess.js"
import { useRouter } from "next/navigation"
import { ChessErrorBoundary } from "@/components/ChessErrorBoundary"
import type { PositionData } from "@/lib/types"
import { normalizeMove, computePreview } from "@/lib/chess-utils"

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false }
)

export default function CreatePage() {
  const router = useRouter()
  const [fen, setFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
  const [move1, setMove1] = useState("")
  const [move2, setMove2] = useState("")
  const [correctMoves, setCorrectMoves] = useState<string[]>([""])
  const [label, setLabel] = useState("")
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fenDuplicate, setFenDuplicate] = useState<PositionData | null>(null)
  // Map of "final FEN after move1+move2" → existing position, built once on fetch
  const [finalFenMap, setFinalFenMap] = useState<Map<string, PositionData>>(new Map())

  const preview = computePreview(fen, move1, move2)
  const previewFen = preview.valid ? preview.fen : null

  // Fetch existing positions and precompute their post-move FENs
  useEffect(() => {
    fetch("/api/positions")
      .then((r) => r.json())
      .then((data: PositionData[]) => {
        const map = new Map<string, PositionData>()
        for (const p of data) {
          const result = computePreview(p.fen, p.move1, p.move2)
          if (result.valid) map.set(result.fen, p)
        }
        setFinalFenMap(map)
      })
      .catch(() => {})
  }, [])

  // Warn when the current position (after both setup moves) matches an existing one.
  // Only activates once both move fields are filled.
  useEffect(() => {
    if (!previewFen || !move1.trim() || !move2.trim()) { setFenDuplicate(null); return }
    setFenDuplicate(finalFenMap.get(previewFen) ?? null)
  }, [previewFen, finalFenMap, move1, move2])

  // Auto-detect orientation from FEN's active-color field whenever FEN changes
  useEffect(() => {
    const activeColor = fen.trim().split(" ")[1]
    if (activeColor === "w") setBoardOrientation("white")
    else if (activeColor === "b") setBoardOrientation("black")
  }, [fen])

  const addCorrectMove = useCallback(() => setCorrectMoves((m) => [...m, ""]), [])
  const removeCorrectMove = useCallback(
    (i: number) => setCorrectMoves((m) => m.filter((_, idx) => idx !== i)),
    []
  )
  const updateCorrectMove = useCallback(
    (i: number, val: string) =>
      setCorrectMoves((m) => m.map((v, idx) => (idx === i ? val : v))),
    []
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const moves = correctMoves.map((m) => m.trim()).filter(Boolean)
    if (!moves.length) {
      setSubmitError("Add at least one correct move")
      return
    }

    // Validate FEN first
    try { new Chess(fen) } catch {
      setSubmitError("Invalid FEN — check the starting position")
      return
    }

    // Normalize move1 and move2 via chess.js so "nc3" becomes "Nc3" etc.
    let normalizedMove1 = move1.trim()
    let normalizedMove2 = move2.trim()
    try {
      const g = new Chess(fen)
      const san1 = normalizeMove(g, normalizedMove1)
      if (!san1) { setSubmitError(`Invalid setup move 1: "${normalizedMove1}"`); return }
      normalizedMove1 = san1
      const san2 = normalizeMove(g, normalizedMove2)
      if (!san2) { setSubmitError(`Invalid setup move 2: "${normalizedMove2}"`); return }
      normalizedMove2 = san2
    } catch {
      setSubmitError("Invalid FEN or moves — check the starting position")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen, move1: normalizedMove1, move2: normalizedMove2, correctMoves: moves, label: label.trim(), boardOrientation }),
      })
      if (!res.ok) {
        const data = await res.json()
        setSubmitError(data.error ?? "Failed to save")
        return
      }
      router.push("/positions")
    } catch {
      setSubmitError("Network error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row gap-8 px-4 py-8 max-w-5xl mx-auto w-full">
      <div className="w-full max-w-[400px] mx-auto lg:mx-0 shrink-0">
        {preview.valid ? (
          <ChessErrorBoundary>
            <Chessboard
              options={{
                position: preview.fen,
                boardOrientation: boardOrientation,
                allowDragging: false,
                showAnimations: false,
                boardStyle: { borderRadius: "4px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" },
              }}
            />
          </ChessErrorBoundary>
        ) : (
          <div className="w-full aspect-square bg-zinc-50 border-2 border-dashed border-zinc-300 rounded-md flex flex-col items-center justify-center gap-2 text-center p-6">
            <p className="text-zinc-500 font-medium">Invalid FEN</p>
            <p className="text-zinc-400 text-sm">Fix the starting FEN above to see a preview.</p>
          </div>
        )}
        <p className="text-xs text-zinc-400 mt-2 text-center">
          Preview after both setup moves
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-5">
        <h1 className="text-xl font-semibold text-zinc-900">Add a Position</h1>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700">Label (optional)</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Sicilian Dragon"
            className="border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </label>

        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700">Starting FEN</span>
            <input
              type="text"
              value={fen}
              onChange={(e) => setFen(e.target.value)}
              required
              className="border border-zinc-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </label>
          {fenDuplicate && (
            <p className="text-amber-600 text-xs flex items-center gap-1">
              ⚠ This FEN already exists
              {fenDuplicate.label && (
                <span className="text-zinc-500">— <span className="font-medium text-zinc-700">{fenDuplicate.label}</span></span>
              )}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700">Setup move 1</span>
            <input
              type="text"
              value={move1}
              onChange={(e) => setMove1(e.target.value)}
              placeholder="e.g. e4"
              required
              className="border border-zinc-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700">Setup move 2</span>
            <input
              type="text"
              value={move2}
              onChange={(e) => setMove2(e.target.value)}
              placeholder="e.g. e5"
              required
              className="border border-zinc-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700">Board orientation during practice</span>
          <div className="flex gap-3">
            {(["white", "black"] as const).map((opt) => (
              <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="boardOrientation"
                  value={opt}
                  checked={boardOrientation === opt}
                  onChange={() => setBoardOrientation(opt)}
                  className="accent-zinc-900"
                />
                <span className="text-sm text-zinc-700 capitalize">{opt}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Auto-detected from FEN — you can override here.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-700">Correct move(s)</span>
          {correctMoves.map((m, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={m}
                onChange={(e) => updateCorrectMove(i, e.target.value)}
                placeholder="e.g. Nf3"
                className="flex-1 border border-zinc-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
              {correctMoves.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCorrectMove(i)}
                  className="text-zinc-400 hover:text-red-500 text-lg leading-none transition-colors"
                  aria-label="Remove"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addCorrectMove}
            className="text-sm text-zinc-500 hover:text-zinc-800 self-start transition-colors"
          >
            + Add another correct move
          </button>
        </div>

        {submitError && <p className="text-sm text-red-500">{submitError}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors self-start"
        >
          {submitting ? "Saving…" : "Save position"}
        </button>
      </form>
    </div>
  )
}
