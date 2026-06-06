import { Chess } from "chess.js"

export function normalizeMove(chess: Chess, san: string): string | null {
  try {
    const result = chess.move(san)
    return result?.san ?? null
  } catch {
    const match = chess.moves({ verbose: true }).find(
      (m) => m.san.toLowerCase() === san.toLowerCase()
    )
    if (match) {
      try {
        return chess.move(match.san)?.san ?? null
      } catch {}
    }
    return null
  }
}

export function computePreview(
  fen: string,
  move1: string,
  move2: string
): { valid: true; fen: string } | { valid: false } {
  try {
    const g = new Chess(fen)
    if (move1.trim()) normalizeMove(g, move1.trim())
    if (move2.trim()) normalizeMove(g, move2.trim())
    return { valid: true, fen: g.fen() }
  } catch {
    return { valid: false }
  }
}

// Compares only the meaningful FEN parts (piece placement, turn, castling, en passant)
// so move-counter differences don't prevent matches.
export function fenKey(fen: string): string {
  return fen.trim().split(" ").slice(0, 4).join(" ")
}
