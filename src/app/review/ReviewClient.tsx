"use client"

import { useState } from "react"
import Link from "next/link"
import type { ReviewItemData } from "@/lib/types"
import { formatMoves } from "@/lib/review"
import { ReviewItemSession } from "./ReviewItemSession"

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

interface Props {
  items: ReviewItemData[]
}

export function ReviewClient({ items: initialItems }: Props) {
  const [items, setItems] = useState(initialItems)
  const [queue, setQueue] = useState<ReviewItemData[] | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function removeItem(id: string) {
    setRemovingId(id)
    try {
      const res = await fetch(`/api/review-items/${id}`, { method: "DELETE" })
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id))
    } finally {
      setRemovingId(null)
    }
  }

  function startReview() {
    setQueue(shuffle(items))
    setCurrentIndex(0)
  }

  // ─── Reviewing ─────────────────────────────────────────────────────────────

  if (queue) {
    if (currentIndex >= queue.length) {
      return (
        <div className="flex flex-col items-center gap-4 py-16">
          <p className="text-zinc-900 dark:text-zinc-100 font-semibold text-xl">All lines reviewed!</p>
          <p className="text-zinc-400 dark:text-zinc-500 text-sm">
            {queue.length} {queue.length === 1 ? "line" : "lines"} completed
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={startReview}
              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
            >
              Review again
            </button>
            <button
              onClick={() => setQueue(null)}
              className="px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 rounded-md text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Back to review list
            </button>
          </div>
        </div>
      )
    }

    const item = queue[currentIndex]
    return (
      <ReviewItemSession
        key={`${currentIndex}-${item.id}`}
        item={item}
        progressText={`Line ${currentIndex + 1} of ${queue.length}`}
        doneLabel={currentIndex === queue.length - 1 ? "Finish" : "Next line"}
        onDone={() => setCurrentIndex((i) => i + 1)}
        onExit={() => setQueue(null)}
      />
    )
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Review
          <span className="ml-2 text-sm font-normal text-zinc-400 dark:text-zinc-500">{items.length}</span>
        </h1>
        {items.length > 0 && (
          <button
            onClick={startReview}
            className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
          >
            Start review
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-zinc-900 dark:text-zinc-100 font-semibold text-lg">Nothing to review yet.</p>
          <p className="text-zinc-400 dark:text-zinc-500 text-sm">
            Open a line, select a move, and click &ldquo;Add to Review&rdquo;.
          </p>
          <Link
            href="/lines"
            className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
          >
            Go to lines
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-4 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 bg-white dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {item.label || (
                    <span className="text-zinc-400 dark:text-zinc-500 font-normal italic">Untitled</span>
                  )}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 font-mono">
                  {formatMoves(item.startFen, item.moves.map((m) => m.move))}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Playing as {item.orientation === "white" ? "White" : "Black"} &middot;{" "}
                  {new Date(item.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => removeItem(item.id)}
                disabled={removingId === item.id}
                className="shrink-0 mt-0.5 text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {removingId === item.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
