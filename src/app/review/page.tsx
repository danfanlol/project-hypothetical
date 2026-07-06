import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import type { LineData, LineNode } from "@/lib/types"
import { AllLinesReviewClient } from "./AllLinesReviewClient"

export const dynamic = "force-dynamic"

export default async function ReviewAllPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const rows = await prisma.line.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  const lines: LineData[] = rows.map((l) => ({
    id: l.id,
    label: l.label,
    labelAuto: l.labelAuto,
    startFen: l.startFen,
    tree: l.tree as unknown as LineNode[],
    boardOrientation: l.boardOrientation as "white" | "black",
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }))

  const reviewable = lines.filter((l) => l.tree.length > 0)

  if (!reviewable.length) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 w-full flex flex-col items-center gap-4">
        <p className="text-zinc-900 dark:text-zinc-100 font-semibold text-lg">No lines to review yet.</p>
        <p className="text-zinc-400 dark:text-zinc-500 text-sm">Add moves to a line first.</p>
        <Link
          href="/lines"
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
        >
          Go to lines
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full flex flex-col items-center">
      <AllLinesReviewClient lines={reviewable} />
    </div>
  )
}
