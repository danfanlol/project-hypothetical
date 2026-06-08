import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { PositionList } from "@/components/PositionList"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function PositionsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const rows = await prisma.position.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })
  const positions = rows.map((p) => ({
    ...p,
    correctMoves: JSON.parse(p.correctMoves) as string[],
    boardOrientation: p.boardOrientation as "auto" | "white" | "black",
    createdAt: p.createdAt.toISOString(),
  }))

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          All Positions
          <span className="ml-2 text-sm font-normal text-zinc-400 dark:text-zinc-500">{positions.length}</span>
        </h1>
        <Link
          href="/create"
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
        >
          + Add position
        </Link>
      </div>
      <PositionList initialPositions={positions} />
    </div>
  )
}
