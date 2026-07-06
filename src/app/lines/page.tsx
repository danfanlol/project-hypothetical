import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import type { LineNode } from "@/lib/types"
import { LineList } from "@/components/LineList"

export const dynamic = "force-dynamic"

export default async function LinesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const rows = await prisma.line.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  const lines = rows.map((l) => ({
    id: l.id,
    label: l.label,
    labelAuto: l.labelAuto,
    startFen: l.startFen,
    tree: l.tree as unknown as LineNode[],
    boardOrientation: l.boardOrientation as "white" | "black",
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }))

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Lines
          <span className="ml-2 text-sm font-normal text-zinc-400 dark:text-zinc-500">{lines.length}</span>
        </h1>
        <Link
          href="/lines/new"
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
        >
          + New line
        </Link>
      </div>
      <LineList initialLines={lines} />
    </div>
  )
}
