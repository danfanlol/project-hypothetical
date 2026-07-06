import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import type { LineNode } from "@/lib/types"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const line = await prisma.line.findUnique({ where: { id } })
  if (!line || line.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({
    ...line,
    tree: line.tree as unknown as LineNode[],
    createdAt: line.createdAt.toISOString(),
    updatedAt: line.updatedAt.toISOString(),
  })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const line = await prisma.line.findUnique({ where: { id } })
  if (!line || line.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const updated = await prisma.line.update({
    where: { id },
    data: {
      ...(body.label !== undefined && { label: body.label || null }),
      ...(body.labelAuto !== undefined && { labelAuto: body.labelAuto }),
      ...(body.tree !== undefined && { tree: body.tree }),
      ...(body.boardOrientation !== undefined && { boardOrientation: body.boardOrientation }),
    },
  })

  return NextResponse.json({
    ...updated,
    tree: updated.tree as unknown as LineNode[],
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const line = await prisma.line.findUnique({ where: { id } })
  if (!line || line.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.line.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
