import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import type { ReviewItemData, ReviewMove } from "@/lib/types"
import { ReviewClient } from "./ReviewClient"

export const dynamic = "force-dynamic"

export default async function ReviewPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const rows = await prisma.reviewItem.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  const items: ReviewItemData[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    startFen: r.startFen,
    moves: r.moves as unknown as ReviewMove[],
    orientation: r.orientation as "white" | "black",
    lineId: r.lineId,
    createdAt: r.createdAt.toISOString(),
  }))

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full flex flex-col items-center">
      <ReviewClient items={items} />
    </div>
  )
}
