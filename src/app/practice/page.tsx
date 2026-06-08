"use client"

import { useCallback, useEffect, useState, Suspense } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { PositionData } from "@/lib/types"
import { useSettings } from "@/components/SettingsProvider"

const DrillBoard = dynamic(
  () => import("@/components/DrillBoard").then((m) => m.DrillBoard),
  { ssr: false }
)

function fullmoveNumber(fen: string): number {
  return parseInt(fen.trim().split(" ").at(-1) ?? "1", 10) || 1
}

function sortByMoveNumber(positions: PositionData[]): PositionData[] {
  return [...positions].sort((a, b) => fullmoveNumber(a.fen) - fullmoveNumber(b.fen))
}

// Re-insert item into arr at the correct sorted position by fullmove number
function insertSorted(item: PositionData, arr: PositionData[]): PositionData[] {
  const n = fullmoveNumber(item.fen)
  const i = arr.findIndex((p) => fullmoveNumber(p.fen) > n)
  return i === -1 ? [...arr, item] : [...arr.slice(0, i), item, ...arr.slice(i)]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function PracticeContent() {
  const searchParams = useSearchParams()
  const targetId = searchParams.get("id")
  const startAt = searchParams.get("startAt")
  const { settings } = useSettings()

  const [allPositions, setAllPositions] = useState<PositionData[]>([])
  const [queue, setQueue] = useState<PositionData[]>([])
  const [stepKey, setStepKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Persist the queue so navigation away (e.g. to the edit page) doesn't reset it
  useEffect(() => {
    if (!targetId && queue.length > 0) {
      sessionStorage.setItem("practice-queue-ids", JSON.stringify(queue.map((p) => p.id)))
    }
  }, [queue, targetId])

  useEffect(() => {
    fetch("/api/positions")
      .then((r) => r.json())
      .then((data: PositionData[]) => {
        setAllPositions(data)
        const posMap = new Map(data.map((p) => [p.id, p]))
        const sorted = settings.practiceOrder === "random" ? shuffle(data) : sortByMoveNumber(data)

        if (targetId) {
          const found = data.find((p) => p.id === targetId)
          setQueue(found ? [found] : sorted)
        } else if (startAt) {
          // Try to restore the saved session queue so "X remaining" is preserved
          try {
            const raw = sessionStorage.getItem("practice-queue-ids")
            sessionStorage.removeItem("practice-queue-ids")
            if (raw) {
              const ids = JSON.parse(raw) as string[]
              const restored = ids
                .map((id) => posMap.get(id))
                .filter((p): p is PositionData => p !== undefined)
              if (restored.length > 0) {
                // Put startAt at the front in case it moved
                const idx = restored.findIndex((p) => p.id === startAt)
                setQueue(idx > 0 ? [...restored.slice(idx), ...restored.slice(0, idx)] : restored)
                return
              }
            }
          } catch {}
          // Fallback: rotate sorted queue to startAt
          const idx = sorted.findIndex((p) => p.id === startAt)
          setQueue(idx >= 0 ? [...sorted.slice(idx), ...sorted.slice(0, idx)] : sorted)
        } else {
          sessionStorage.removeItem("practice-queue-ids")
          setQueue(sorted)
        }
      })
      .catch(() => setError("Failed to load positions"))
      .finally(() => setLoading(false))
  }, [targetId, startAt])

  const current = queue[0] ?? null

  const handleNext = useCallback((wasCorrect: boolean) => {
    setStepKey((k) => k + 1)
    if (targetId) return
    setQueue((q) => {
      const [head, ...rest] = q
      if (!head) return q
      if (wasCorrect) {
        // Remove from queue; restart when all done
        return rest.length > 0 ? rest : (settings.practiceOrder === "random" ? shuffle(allPositions) : sortByMoveNumber(allPositions))
      } else {
        // Re-insert at its sorted position among the remaining positions
        return insertSorted(head, rest)
      }
    })
  }, [targetId, allPositions])

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-zinc-400 dark:text-zinc-500">Loading…</div>
  }

  if (error) {
    return <div className="flex flex-1 items-center justify-center text-red-500">{error}</div>
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-zinc-500 dark:text-zinc-400 text-lg">No positions saved yet.</p>
        <Link href="/create" className="px-5 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors">
          Add your first position
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
      {targetId && (
        <div className="mb-4 w-full max-w-[480px] flex items-center justify-between">
          <Link href="/positions" className="text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
            ← All positions
          </Link>
          <Link href="/practice" className="text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
            Full session →
          </Link>
        </div>
      )}

      {!targetId && (
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
          {queue.length} remaining
        </p>
      )}

      {current && (
        <DrillBoard
          key={stepKey}
          position={current}
          onNext={handleNext}
          nextLabel={targetId ? "Drill again" : "Next position →"}
        />
      )}
    </div>
  )
}

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-zinc-400">Loading…</div>}>
      <PracticeContent />
    </Suspense>
  )
}
