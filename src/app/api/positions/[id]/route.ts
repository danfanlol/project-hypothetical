import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const position = await prisma.position.findUnique({ where: { id } })
  if (!position || position.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { correctMoves, label, boardOrientation } = await req.json()
  const updated = await prisma.position.update({
    where: { id },
    data: {
      ...(correctMoves !== undefined && { correctMoves: JSON.stringify(correctMoves) }),
      ...(label !== undefined && { label: label || null }),
      ...(boardOrientation !== undefined && { boardOrientation }),
    },
  })

  return NextResponse.json({
    ...updated,
    correctMoves: JSON.parse(updated.correctMoves) as string[],
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const position = await prisma.position.findUnique({ where: { id } })
  if (!position || position.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.position.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
