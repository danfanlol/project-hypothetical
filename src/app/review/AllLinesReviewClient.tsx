"use client"

import { useState } from "react"
import Link from "next/link"
import type { LineData } from "@/lib/types"
import { LineReviewClient } from "@/app/review/[id]/LineReviewClient"

interface Props {
  lines: LineData[]
}

export function AllLinesReviewClient({ lines }: Props) {
  const [queue] = useState(() => {
    const arr = [...lines]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  })
  const [currentIndex, setCurrentIndex] = useState(0)

  if (currentIndex >= queue.length) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-zinc-900 dark:text-zinc-100 font-semibold text-xl">
          All lines reviewed!
        </p>
        <p className="text-zinc-400 dark:text-zinc-500 text-sm">
          {queue.length} {queue.length === 1 ? "line" : "lines"} completed
        </p>
        <Link
          href="/lines"
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
        >
          Back to lines
        </Link>
      </div>
    )
  }

  const line = queue[currentIndex]

  return (
    <LineReviewClient
      key={line.id}
      line={line}
      onDone={() => setCurrentIndex((i) => i + 1)}
      exitHref="/lines"
    />
  )
}
