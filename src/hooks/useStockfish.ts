"use client"

import { useEffect, useRef, useState } from "react"
import { Chess } from "chess.js"

export interface AnalysisLine {
  multipv: number
  scoreType: "cp" | "mate"
  score: number      // centipawns (from side-to-move), or moves-to-mate
  sanMoves: string[] // PV converted to SAN from the analysis FEN
  depth: number
}

function uciToSan(fen: string, uciMoves: string[]): string[] {
  const san: string[] = []
  try {
    const chess = new Chess(fen)
    for (const uci of uciMoves) {
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const promotion = uci.length > 4 ? uci[4] : undefined
      const move = chess.move({ from, to, promotion })
      if (!move) break
      san.push(move.san)
    }
  } catch {}
  return san
}

function parseInfoLine(line: string, fen: string): AnalysisLine | null {
  if (!line.includes("multipv")) return null

  const multipvMatch = line.match(/\bmultipv (\d+)/)
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/)
  const pvMatch = line.match(/\bpv (.+)$/)
  const depthMatch = line.match(/\bdepth (\d+)/)

  if (!multipvMatch || !scoreMatch || !pvMatch) return null

  const uciMoves = pvMatch[1].trim().split(/\s+/).slice(0, 5)

  return {
    multipv: parseInt(multipvMatch[1]),
    scoreType: scoreMatch[1] as "cp" | "mate",
    score: parseInt(scoreMatch[2]),
    sanMoves: uciToSan(fen, uciMoves),
    depth: depthMatch ? parseInt(depthMatch[1]) : 0,
  }
}

export function useStockfish(fen: string | null) {
  const [lines, setLines] = useState<AnalysisLine[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    if (!fen) {
      setLines([])
      setIsAnalyzing(false)
      return
    }

    if (workerRef.current) {
      workerRef.current.postMessage("quit")
      workerRef.current.terminate()
      workerRef.current = null
    }

    setLines([])
    setIsAnalyzing(true)

    const worker = new Worker("/stockfish.js")
    workerRef.current = worker

    const bestLines = new Map<number, AnalysisLine>()

    worker.onmessage = (e: MessageEvent<string>) => {
      const msg = e.data
      if (msg.includes("multipv")) {
        const parsed = parseInfoLine(msg, fen)
        if (parsed && parsed.depth >= 6) {
          bestLines.set(parsed.multipv, parsed)
          setLines(Array.from(bestLines.values()).sort((a, b) => a.multipv - b.multipv))
        }
      }
      if (msg.startsWith("bestmove")) {
        setIsAnalyzing(false)
      }
    }

    worker.onerror = () => setIsAnalyzing(false)

    worker.postMessage("uci")
    worker.postMessage("setoption name MultiPV value 3")
    worker.postMessage(`position fen ${fen}`)
    worker.postMessage("go depth 18")

    return () => {
      worker.postMessage("quit")
      worker.terminate()
      workerRef.current = null
    }
  }, [fen])

  return { lines, isAnalyzing }
}
