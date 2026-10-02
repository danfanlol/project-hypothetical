// The side that played the move leading to this position.
export function moverOf(fenAfterMove: string): "white" | "black" {
  return fenAfterMove.split(" ")[1] === "b" ? "white" : "black"
}

// Opening plies played automatically before the user is first asked to move:
// from white's POV both sides' first moves, from black's POV white's first move.
export function reviewAutoPlies(orientation: "white" | "black"): number {
  return orientation === "white" ? 2 : 1
}

// "1. e4 e5 2. Nf3", numbered from startFen's move counter and side to move.
export function formatMoves(startFen: string, moves: string[]): string {
  const fields = startFen.split(" ")
  let num = Number(fields[5]) || 1
  let whiteToMove = fields[1] !== "b"
  const parts: string[] = []
  moves.forEach((m, i) => {
    if (whiteToMove) {
      parts.push(`${num}. ${m}`)
    } else {
      parts.push(i === 0 ? `${num}... ${m}` : m)
      num++
    }
    whiteToMove = !whiteToMove
  })
  return parts.join(" ")
}
