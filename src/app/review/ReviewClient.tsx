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

// Opens the item in /analyze at its start position, with its moves to step through
function analyzeHref(item: ReviewItemData): string {
  const params = new URLSearchParams({
    fen: item.startFen,
    moves: item.moves.map((m) => m.move).join(" "),
    orientation: item.orientation,
  })
  return `/analyze?${params}`
}

interface Props {
  items: ReviewItemData[]
}

export function ReviewClient({ items: initialItems }: Props) {
  const [items, setItems] = useState(initialItems)
  // Session queue: the head is the current line. Perfect lines leave it (and the
  // review list); lines with a mistake go to the back, until the queue is empty.
  const [queue, setQueue] = useState<ReviewItemData[] | null>(null)
  const [sessionTotal, setSessionTotal] = useState(0)
  const [attempt, setAttempt] = useState(0) // remounts the session board each line
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  async function removeItem(id: string) {
    setRemovingId(id)
    try {
      const res = await fetch(`/api/review-items/${id}`, { method: "DELETE" })
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id))
    } finally {
      setRemovingId(null)
    }
  }

  async function clearAll() {
    setClearing(true)
    try {
      const res = await fetch("/api/review-items", { method: "DELETE" })
      if (res.ok) setItems([])
    } finally {
      setClearing(false)
      setConfirmClear(false)
    }
  }

  function startReview() {
    setQueue(shuffle(items))
    setSessionTotal(items.length)
    setAttempt(0)
  }

  function finishLine(hadMistake: boolean) {
    if (!queue?.length) return
    const [current, ...rest] = queue
    if (hadMistake) {
      setQueue([...rest, current])
    } else {
      setQueue(rest)
      fetch(`/api/review-items/${current.id}`, { method: "DELETE" })
        .then((res) => {
          if (res.ok) setItems((prev) => prev.filter((i) => i.id !== current.id))
        })
        .catch(() => {/* stays in the list; it'll be reviewed again next session */})
    }
    setAttempt((a) => a + 1)
  }

  // ─── Reviewing ─────────────────────────────────────────────────────────────

  if (queue) {
    if (queue.length === 0) {
      return (
        <div className="flex flex-col items-center gap-4 py-16">
          <p className="text-zinc-900 dark:text-zinc-100 font-semibold text-xl">All lines cleared!</p>
          <p className="text-zinc-400 dark:text-zinc-500 text-sm">
            {sessionTotal} {sessionTotal === 1 ? "line" : "lines"} cleared from your review list
          </p>
          <button
            onClick={() => setQueue(null)}
            className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
          >
            Back to review list
          </button>
        </div>
      )
    }

    const item = queue[0]
    const cleared = sessionTotal - queue.length
    return (
      <ReviewItemSession
        key={`${attempt}-${item.id}`}
        item={item}
        progressText={`${cleared} of ${sessionTotal} cleared · ${queue.length} left`}
        isLastInQueue={queue.length === 1}
        onDone={finishLine}
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
          <div className="flex items-center gap-2">
            {!confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                className="px-4 py-2 border border-red-300 dark:border-red-800 text-red-500 dark:text-red-400 rounded-md text-sm hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                Clear all
              </button>
            ) : (
              <>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Remove all {items.length} {items.length === 1 ? "line" : "lines"}?
                </span>
                <button
                  onClick={clearAll}
                  disabled={clearing}
                  className="px-4 py-2 bg-red-500 text-white rounded-md text-sm hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {clearing ? "Clearing…" : "Clear"}
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  disabled={clearing}
                  className="px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 rounded-md text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
            <button
              onClick={startReview}
              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
            >
              Start review
            </button>
          </div>
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
              <div className="shrink-0 mt-0.5 flex items-center gap-2">
                <Link
                  href={analyzeHref(item)}
                  className="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  Analyze
                </Link>
                <button
                  onClick={() => removeItem(item.id)}
                  disabled={removingId === item.id}
                  className="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >
                  {removingId === item.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
