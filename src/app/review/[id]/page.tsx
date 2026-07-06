import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import type { LineData, LineNode } from "@/lib/types"
import { LineReviewClient } from "./LineReviewClient"

export const dynamic = "force-dynamic"

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params
  const row = await prisma.line.findUnique({ where: { id } })
  if (!row || row.userId !== session.user.id) notFound()

  const line: LineData = {
    id: row.id,
    label: row.label,
    labelAuto: row.labelAuto,
    startFen: row.startFen,
    tree: row.tree as unknown as LineNode[],
    boardOrientation: row.boardOrientation as "white" | "black",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full flex flex-col items-center">
      <LineReviewClient line={line} />
    </div>
  )
}
