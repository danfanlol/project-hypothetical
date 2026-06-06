"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { PositionData } from "@/lib/types"

const PAGE_SIZE = 10

interface Props {
  initialPositions: PositionData[]
}

export function PositionList({ initialPositions }: Props) {
  const [positions, setPositions] = useState(initialPositions)
  const [search, setSearch] = useState("")
  const [visible, setVisible] = useState(PAGE_SIZE)

  // Reset pagination whenever the search query changes
  useEffect(() => { setVisible(PAGE_SIZE) }, [search])

  const filtered = search.trim()
    ? positions.filter((p) =>
        (p.label ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : positions

  const shown = filtered.slice(0, visible)
  const remaining = filtered.length - visible

  async function handleDelete(id: string) {
    await fetch(`/api/positions/${id}`, { method: "DELETE" })
    setPositions((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search by label…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {search && (
        <p className="text-xs text-zinc-400">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
        </p>
      )}

      {/* List */}
      {shown.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          {search ? `No positions match "${search}".` : "No positions yet."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-4 border border-zinc-200 rounded-lg px-4 py-3 bg-white"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <p className="font-medium text-zinc-900 truncate">
                  {p.label || <span className="text-zinc-400 font-normal italic">Untitled</span>}
                </p>
                <p className="text-xs text-zinc-500 font-mono truncate">{p.fen}</p>
                <p className="text-sm text-zinc-600">
                  <span className="font-mono">{p.move1}</span>
                  {" → "}
                  <span className="font-mono">{p.move2}</span>
                  {" → "}
                  <span className="font-mono font-medium text-zinc-800">
                    {p.correctMoves.join(" / ")}
                  </span>
                </p>
              </div>
              <div className="flex gap-2 shrink-0 mt-0.5">
                <Link
                  href={`/practice?id=${p.id}`}
                  className="text-xs px-3 py-1.5 border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors"
                >
                  Drill
                </Link>
                <Link
                  href={`/positions/${p.id}/edit`}
                  className="text-xs px-3 py-1.5 border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-md hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Show more */}
      {remaining > 0 && (
        <button
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="self-center px-5 py-2 border border-zinc-300 rounded-md text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          Show {Math.min(remaining, PAGE_SIZE)} more
          <span className="text-zinc-400 ml-1">({remaining} remaining)</span>
        </button>
      )}
    </div>
  )
}
