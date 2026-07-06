// One-time seed for the Opening table, sourced from the public-domain
// lichess-org/chess-openings TSV files (eco, name, pgn columns).
// Run with: node prisma/seed-openings.mjs
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { Chess } from "chess.js"

const prisma = new PrismaClient()

const FILES = ["a", "b", "c", "d", "e"]
const BASE_URL = "https://cdn.jsdelivr.net/gh/lichess-org/chess-openings@master"

function fenKey(fen) {
  return fen.trim().split(" ").slice(0, 4).join(" ")
}

function parseTsv(text) {
  const lines = text.trim().split("\n")
  const [header, ...rows] = lines
  const cols = header.split("\t")
  return rows.map((row) => {
    const cells = row.split("\t")
    const entry = {}
    cols.forEach((c, i) => { entry[c] = cells[i] })
    return entry
  })
}

async function main() {
  const seen = new Map() // fenKey -> row, dedupe across files (later files can repeat earlier entries)

  for (const file of FILES) {
    const res = await fetch(`${BASE_URL}/${file}.tsv`)
    if (!res.ok) throw new Error(`Failed to fetch ${file}.tsv: ${res.status}`)
    const rows = parseTsv(await res.text())

    for (const row of rows) {
      const chess = new Chess()
      const sanMoves = []
      try {
        for (const token of row.pgn.trim().split(/\s+/)) {
          if (/^\d+\.$/.test(token) || /^\d+\.\.\.$/.test(token)) continue
          const move = chess.move(token)
          if (!move) throw new Error(`illegal move ${token}`)
          sanMoves.push(move.san)
        }
      } catch (err) {
        console.warn(`Skipping "${row.name}" — ${err.message}`)
        continue
      }

      const fen = chess.fen()
      const key = fenKey(fen)
      seen.set(key, { name: row.name, eco: row.eco, fen, fenKey: key, moves: sanMoves })
    }
  }

  console.log(`Parsed ${seen.size} unique openings. Upserting…`)

  let count = 0
  for (const opening of seen.values()) {
    await prisma.opening.upsert({
      where: { fenKey: opening.fenKey },
      create: opening,
      update: opening,
    })
    count++
    if (count % 500 === 0) console.log(`  ${count}/${seen.size}`)
  }

  console.log(`Done. Seeded ${count} openings.`)
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
