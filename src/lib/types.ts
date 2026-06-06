export interface PositionData {
  id: string
  fen: string
  move1: string
  move2: string
  correctMoves: string[]
  label: string | null
  boardOrientation: "auto" | "white" | "black"
  createdAt: string
}
