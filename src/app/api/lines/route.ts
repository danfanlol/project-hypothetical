import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import type { LineNode } from "@/lib/types"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const lines = await prisma.line.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(
    lines.map((l) => ({
      ...l,
      tree: l.tree as unknown as LineNode[],
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    }))
  )
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { label, startFen } = await req.json()
  const trimmedLabel: string | null = label?.trim() || null

  const line = await prisma.line.create({
    data: {
      label: trimmedLabel,
      labelAuto: !trimmedLabel,
      startFen: startFen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      tree: [],
      userId: session.user.id,
    },
  })

  return NextResponse.json({
    ...line,
    tree: line.tree as unknown as LineNode[],
    createdAt: line.createdAt.toISOString(),
    updatedAt: line.updatedAt.toISOString(),
  })
}
