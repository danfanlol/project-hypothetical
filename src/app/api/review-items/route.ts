import { NextResponse } from "next/server"
import { Chess } from "chess.js"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { moverOf, reviewAutoPlies } from "@/lib/review"
import type { ReviewMove } from "@/lib/types"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // resolve: how to handle overlapping saved items (see below). Omitted → report them instead of saving.
  const { label, startFen, moves, lineId, resolve } = await req.json()
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

  // Overlaps with saved items drilled from the same side, from the same start:
  // - "extends": a saved item's moves are the start of the new path (the new one supersedes it)
  // - "covered": the new path is the start of (or identical to) a saved item
  const sans = path.map((m) => m.move)
  const sameSide = await prisma.reviewItem.findMany({
    where: { userId: session.user.id, orientation },
    orderBy: { createdAt: "asc" },
  })
  const extended: OverlapItem[] = []
  const covering: OverlapItem[] = []
  for (const it of sameSide) {
    if (positionKey(it.startFen) !== positionKey(startFen)) continue
    const itSans = (it.moves as unknown as ReviewMove[]).map((m) => m.move)
    const summary = { id: it.id, label: it.label, startFen: it.startFen, moves: itSans }
    if (itSans.length < sans.length && isPrefix(itSans, sans)) extended.push(summary)
    else if (isPrefix(sans, itSans)) covering.push(summary)
  }

  if (!resolve && (extended.length || covering.length)) {
    return NextResponse.json({ conflict: true, extended, covering }, { status: 409 })
  }

  const data = {
    label: (typeof label === "string" && label.trim()) || null,
    startFen,
    moves: path as unknown as object[],
    orientation,
    lineId: typeof lineId === "string" ? lineId : null,
    userId: session.user.id,
  }

  // "replace": save the new item and delete the saved items it extends; "keep": just save it
  if (resolve === "replace" && extended.length) {
    const [item] = await prisma.$transaction([
      prisma.reviewItem.create({ data }),
      prisma.reviewItem.deleteMany({ where: { id: { in: extended.map((e) => e.id) }, userId: session.user.id } }),
    ])
    return NextResponse.json({ id: item.id, replaced: extended.length })
  }

  const item = await prisma.reviewItem.create({ data })
  return NextResponse.json({ id: item.id })
}

type OverlapItem = { id: string; label: string | null; startFen: string; moves: string[] }

// Board, side to move, castling and en passant; ignores the move counters
function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ")
}

function isPrefix(prefix: string[], full: string[]): boolean {
  return prefix.length <= full.length && prefix.every((m, i) => m === full[i])
}

// Clears the user's whole review list
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { count } = await prisma.reviewItem.deleteMany({ where: { userId: session.user.id } })
  return NextResponse.json({ count })
}
