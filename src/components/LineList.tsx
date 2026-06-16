"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { LineData, LineNode } from "@/lib/types"

const PAGE_SIZE = 10

function countNodes(nodes: LineNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0)
}

interface Props {
  initialLines: LineData[]
}

export function LineList({ initialLines }: Props) {
  const [lines, setLines] = useState(initialLines)
  const [search, setSearch] = useState("")
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setVisible(PAGE_SIZE) }, [search])

  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  const filtered = search.trim()
    ? lines.filter((l) =>
        (l.label ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : lines

  const shown = filtered.slice(0, visible)
  const remaining = filtered.length - visible

  function startRename(line: LineData, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setRenamingId(line.id)
    setRenameValue(line.label ?? "")
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, label: trimmed || null } : l))
    )
    await fetch(`/api/lines/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: trimmed || null }),
    })
  }

  function handleRenameKey(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") commitRename(id)
    if (e.key === "Escape") setRenamingId(null)
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
          placeholder='Search by name… e.g. "French Defense: Rubinstein Variation"'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-8 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {search && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
        </p>
      )}

      {/* List */}
      {shown.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 dark:text-zinc-500">
          {search ? `No lines match "${search}".` : "No lines yet."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((line) => {
            const moveCount = countNodes(line.tree)
            const isRenaming = renamingId === line.id

            return (
              <li key={line.id} className="relative">
                {!isRenaming && (
                  <Link
                    href={`/lines/${line.id}`}
                    className="absolute inset-0 rounded-lg z-0"
                    aria-label={line.label ?? "Untitled"}
                  />
                )}
                <div className={`flex items-start justify-between gap-4 border rounded-lg px-4 py-3 bg-white dark:bg-zinc-900 transition-colors ${
                  isRenaming
                    ? "border-zinc-400 dark:border-zinc-500"
                    : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer"
                }`}>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        ref={renameRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(line.id)}
                        onKeyDown={(e) => handleRenameKey(e, line.id)}
                        placeholder="Line name…"
                        className="font-medium text-zinc-900 dark:text-zinc-100 bg-transparent focus:outline-none w-full border-b border-zinc-400 dark:border-zinc-500 pb-0.5"
                      />
                    ) : (
                      <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {line.label || (
                          <span className="text-zinc-400 dark:text-zinc-500 font-normal italic">Untitled</span>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 font-mono truncate">{line.startFen}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {moveCount} {moveCount === 1 ? "move" : "moves"} &middot;{" "}
                      {new Date(line.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-0.5 relative z-10">
                    {isRenaming ? (
                      <button
                        onClick={() => setRenamingId(null)}
                        className="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        onClick={(e) => startRename(line, e)}
                        className="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        Rename
                      </button>
                    )}
                    <Link
                      href={`/lines/${line.id}`}
                      className="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {remaining > 0 && (
        <button
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="self-center px-5 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Show {Math.min(remaining, PAGE_SIZE)} more
          <span className="text-zinc-400 dark:text-zinc-500 ml-1">({remaining} remaining)</span>
        </button>
      )}
    </div>
  )
}
