import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const fen = new URL(req.url).searchParams.get("fen")
  if (!fen) return NextResponse.json({ error: "Missing fen" }, { status: 400 })

  const fenKey = fen.trim().split(" ").slice(0, 4).join(" ")
  const opening = await prisma.opening.findUnique({ where: { fenKey } })

  if (!opening) {
    return NextResponse.json({ opening: null })
  }

  return NextResponse.json({ opening: {
    id: opening.id,
    name: opening.name,
    eco: opening.eco,
    fen: opening.fen,
    moves: opening.moves as string[] | null,
  }})
}
