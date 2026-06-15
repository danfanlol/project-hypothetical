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

export interface LineNode {
  id: string
  move: string
  fen: string
  annotation?: string
  positionId?: string
  children: LineNode[]
}

export interface LineData {
  id: string
  label: string | null
  startFen: string
  tree: LineNode[]
  boardOrientation: "white" | "black"
  createdAt: string
  updatedAt: string
}
