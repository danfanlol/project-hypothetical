import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const positions = await prisma.position.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(
    positions.map((p) => ({ ...p, correctMoves: JSON.parse(p.correctMoves) as string[] }))
  )
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { fen, move1, move2, correctMoves, label, boardOrientation } = body

  if (!fen || !move1 || !move2 || !Array.isArray(correctMoves) || correctMoves.length === 0) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const position = await prisma.position.create({
    data: {
      fen, move1, move2,
      correctMoves: JSON.stringify(correctMoves),
      label: label || null,
      boardOrientation: boardOrientation ?? "auto",
      userId: session.user.id,
    },
  })

  return NextResponse.json(
    { ...position, correctMoves: JSON.parse(position.correctMoves) as string[] },
    { status: 201 }
  )
}
