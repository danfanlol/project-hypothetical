import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import type { LineData, LineNode } from "@/lib/types"
import { LineReviewClient } from "./LineReviewClient"

export const dynamic = "force-dynamic"

function findNode(nodes: LineNode[], id: string): LineNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return null
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params
  const { from } = await searchParams
  const row = await prisma.line.findUnique({ where: { id } })
  if (!row || row.userId !== session.user.id) notFound()

  let startFen = row.startFen
  let tree = row.tree as unknown as LineNode[]

  if (from) {
    const node = findNode(tree, from)
    if (node) {
      startFen = node.fen
      tree = node.children
    }
  }

  const line: LineData = {
    id: row.id,
    label: row.label,
    labelAuto: row.labelAuto,
    startFen,
    tree,
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
