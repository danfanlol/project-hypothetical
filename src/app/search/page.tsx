"use client"

import { useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { Chess } from "chess.js"
import Link from "next/link"
import { ChessErrorBoundary } from "@/components/ChessErrorBoundary"
import type { PositionData } from "@/lib/types"
import { computePreview, fenKey } from "@/lib/chess-utils"

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false }
)

function parseFen(raw: string): string | null {
  try {
    const chess = new Chess(raw.trim())
    return chess.fen()
  } catch {
    return null
  }
}

export default function SearchPage() {
  const [fenInput, setFenInput] = useState("")
  const [finalFenMap, setFinalFenMap] = useState<Map<string, PositionData[]>>(new Map())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch("/api/positions")
      .then((r) => r.json())
      .then((data: PositionData[]) => {
        const map = new Map<string, PositionData[]>()
        for (const p of data) {
          const result = computePreview(p.fen, p.move1, p.move2)
          if (!result.valid) continue
          const key = fenKey(result.fen)
          const existing = map.get(key)
          if (existing) existing.push(p)
          else map.set(key, [p])
        }
        setFinalFenMap(map)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const normalizedFen = useMemo(() => parseFen(fenInput), [fenInput])
  const matches = useMemo(
    () => (normalizedFen ? (finalFenMap.get(fenKey(normalizedFen)) ?? []) : []),
    [normalizedFen, finalFenMap]
  )

  const hasInput = fenInput.trim().length > 0
  const isInvalid = hasInput && normalizedFen === null

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 w-full flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Search by Position</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Paste a FEN to find any saved opening line that reaches this position after its two setup moves.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left: input + board */}
        <div className="w-full max-w-[360px] shrink-0 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Position FEN</label>
            <input
              type="text"
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              placeholder="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
              className="border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
            />
            {isInvalid && (
              <p className="text-red-500 text-xs">Invalid FEN — check the input.</p>
            )}
          </div>

          {normalizedFen ? (
            <ChessErrorBoundary>
              <Chessboard
                options={{
                  position: normalizedFen,
                  allowDragging: false,
                  showAnimations: false,
                  boardStyle: { borderRadius: "4px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" },
                }}
              />
            </ChessErrorBoundary>
          ) : (
            <div className="w-full aspect-square bg-zinc-50 dark:bg-zinc-800 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-md flex items-center justify-center">
              <p className="text-zinc-400 dark:text-zinc-500 text-sm">Board preview</p>
            </div>
          )}
        </div>

        {/* Right: results */}
        <div className="flex-1 flex flex-col gap-4">
          {!hasInput && (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <p className="text-zinc-400 text-sm">Enter a FEN to search.</p>
            </div>
          )}

          {hasInput && loaded && !isInvalid && matches.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[200px] text-center">
              <p className="text-zinc-500 dark:text-zinc-400 font-medium">No match found</p>
              <p className="text-zinc-400 dark:text-zinc-500 text-sm">
                No saved lines reach this position after their two setup moves.
              </p>
              <Link
                href="/create"
                className="mt-2 px-4 py-2 text-sm bg-zinc-900 dark:bg-zinc-700 text-white rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
              >
                + Add this position
              </Link>
            </div>
          )}

          {matches.length > 0 && (
            <>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {matches.length} match{matches.length !== 1 ? "es" : ""} found
              </p>
              <ul className="flex flex-col gap-3">
                {matches.map((p) => (
                  <li
                    key={p.id}
                    className="border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 px-4 py-4 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {p.label || <span className="text-zinc-400 dark:text-zinc-500 font-normal italic">Untitled</span>}
                        </p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate">{p.fen}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Link
                          href={`/practice?id=${p.id}`}
                          className="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          Drill
                        </Link>
                        <Link
                          href={`/positions/${p.id}/edit`}
                          className="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          Edit
                        </Link>
                      </div>
                    </div>

                    {/* Move sequence */}
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-mono text-zinc-500">{p.move1}</span>
                      <span className="text-zinc-300 dark:text-zinc-600">→</span>
                      <span className="font-mono text-zinc-500 dark:text-zinc-400">{p.move2}</span>
                      <span className="text-zinc-300 dark:text-zinc-600">→</span>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                        {p.correctMoves.join(" / ")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
