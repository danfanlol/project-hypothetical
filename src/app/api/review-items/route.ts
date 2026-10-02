import { NextResponse } from "next/server"
import { Chess } from "chess.js"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { moverOf, reviewAutoPlies } from "@/lib/review"
import type { ReviewMove } from "@/lib/types"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { label, startFen, moves, lineId } = await req.json()
  if (typeof startFen !== "string" || !Array.isArray(moves) || !moves.length) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  // Replay the moves server-side so the stored FENs are always consistent.
  const path: ReviewMove[] = []
  try {
    const chess = new Chess(startFen)
    for (const san of moves) {
      const m = chess.move(String(san))
      path.push({ move: m.san, fen: chess.fen() })
    }
  } catch {
    return NextResponse.json({ error: "Invalid moves" }, { status: 400 })
  }

  const orientation = moverOf(path[path.length - 1].fen)
  if (path.length <= reviewAutoPlies(orientation)) {
    return NextResponse.json({ error: "Nothing to review" }, { status: 400 })
  }

  const item = await prisma.reviewItem.create({
    data: {
      label: (typeof label === "string" && label.trim()) || null,
      startFen,
      moves: path as unknown as object[],
      orientation,
      lineId: typeof lineId === "string" ? lineId : null,
      userId: session.user.id,
    },
  })

  return NextResponse.json({ id: item.id })
}
