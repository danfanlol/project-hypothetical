"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import type { PositionData } from "@/lib/types"

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false }
)

export default function EditPositionPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get("returnTo") ?? "/positions"

  const [position, setPosition] = useState<PositionData | null>(null)
  const [correctMoves, setCorrectMoves] = useState<string[]>([])
  const [label, setLabel] = useState("")
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/positions`)
      .then((r) => r.json())
      .then((data: PositionData[]) => {
        const found = data.find((p) => p.id === id)
        if (!found) { setError("Position not found"); return }
        setPosition(found)
        setCorrectMoves(found.correctMoves)
        setLabel(found.label ?? "")
        // "auto" in old data → infer from FEN's active-color field
        const stored = found.boardOrientation
        if (stored === "white" || stored === "black") {
          setBoardOrientation(stored)
        } else {
          setBoardOrientation(found.fen.trim().split(" ")[1] === "b" ? "black" : "white")
        }
      })
      .catch(() => setError("Failed to load position"))
  }, [id])

  const addMove = useCallback(() => setCorrectMoves((m) => [...m, ""]), [])
  const removeMove = useCallback(
    (i: number) => setCorrectMoves((m) => m.filter((_, idx) => idx !== i)),
    []
  )
  const updateMove = useCallback(
    (i: number, val: string) =>
      setCorrectMoves((m) => m.map((v, idx) => (idx === i ? val : v))),
    []
  )

  async function handleSave() {
    const moves = correctMoves.map((m) => m.trim()).filter(Boolean)
    if (!moves.length) { setError("At least one correct move is required"); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/positions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correctMoves: moves, label, boardOrientation }),
      })
      if (!res.ok) { setError("Failed to save"); return }
      router.push(returnTo)
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  if (error && !position) {
    return <div className="flex flex-1 items-center justify-center text-red-500">{error}</div>
  }
  if (!position) {
    return <div className="flex flex-1 items-center justify-center text-zinc-400">Loading…</div>
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row gap-8 px-4 py-8 max-w-5xl mx-auto w-full">
      {/* Board preview */}
      <div className="w-full max-w-[360px] mx-auto lg:mx-0 shrink-0">
        <Chessboard
          options={{
            position: position.fen,
            boardOrientation: boardOrientation,
            allowDragging: false,
            showAnimations: false,
            boardStyle: { borderRadius: "4px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" },
          }}
        />
        <div className="mt-2 text-xs text-zinc-400 text-center space-y-0.5">
          <p className="font-mono truncate">{position.fen}</p>
          <p>
            <span className="font-mono">{position.move1}</span>
            {" → "}
            <span className="font-mono">{position.move2}</span>
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col gap-5">
        <h1 className="text-xl font-semibold text-zinc-900">Edit Position</h1>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700">Label</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Sicilian Dragon"
            className="border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-700">Correct moves</span>
          {correctMoves.map((m, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={m}
                onChange={(e) => updateMove(i, e.target.value)}
                placeholder="e.g. Nf3"
                className="flex-1 border border-zinc-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
              {correctMoves.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMove(i)}
                  className="text-zinc-400 hover:text-red-500 text-lg leading-none transition-colors"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addMove}
            className="text-sm text-zinc-500 hover:text-zinc-800 self-start transition-colors"
          >
            + Add another correct move
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700">Board orientation during practice</span>
          <div className="flex gap-3">
            {(["white", "black"] as const).map((opt) => (
              <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="orientation"
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
            Which side's pieces appear at the bottom during practice.
          </p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={() => router.push(returnTo)}
            className="px-5 py-2.5 border border-zinc-300 rounded-md text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
