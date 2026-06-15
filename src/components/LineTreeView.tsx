"use client"

import { useEffect, useRef, useState } from "react"
import type { LineNode } from "@/lib/types"

// ─── Types ───────────────────────────────────────────────────────────────────

type PairRow = {
  type: "pair"
  moveNum: number
  white: LineNode | null
  black: LineNode | null
}

type SepRow = {
  type: "sep"
  label: string
}

type Row = PairRow | SepRow

interface ContextMenu {
  x: number
  y: number
  node: LineNode
}

interface Props {
  nodes: LineNode[]
  startFen: string
  selectedId: string | null
  onSelect: (node: LineNode) => void
  onDelete: (node: LineNode) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMoveInfo(depth: number, startFen: string): { moveNum: number; isWhite: boolean } {
  const parts = startFen.split(" ")
  const startIsWhite = parts[1] !== "b"
  const startMoveNum = Math.max(1, parseInt(parts[5]) || 1)
  const isWhite = startIsWhite ? depth % 2 === 0 : depth % 2 !== 0
  const moveNum = startIsWhite
    ? startMoveNum + Math.floor(depth / 2)
    : startMoveNum + Math.floor((depth + 1) / 2)
  return { isWhite, moveNum }
}

// DFS traversal: builds a flat list of pair rows and separator rows.
// Siblings at the same depth are the "variations" — first sibling is main line.
function collectRows(nodes: LineNode[], depth: number, startFen: string): Row[] {
  if (nodes.length === 0) return []

  const { isWhite, moveNum } = getMoveInfo(depth, startFen)
  const rows: Row[] = []

  nodes.forEach((node, i) => {
    // Variation separator before each alternative (not before the main line)
    if (i > 0) {
      rows.push({ type: "sep", label: isWhite ? `${moveNum}.` : `${moveNum}...` })
    }

    if (isWhite) {
      const blackNode = node.children[0] ?? null
      rows.push({ type: "pair", moveNum, white: node, black: blackNode })

      // Continue main line from black's children
      if (blackNode) {
        rows.push(...collectRows(blackNode.children, depth + 2, startFen))
      }

      // Alternative black responses for this white move
      for (const altBlack of node.children.slice(1)) {
        rows.push({ type: "sep", label: `${moveNum}...` })
        rows.push({ type: "pair", moveNum, white: null, black: altBlack })
        rows.push(...collectRows(altBlack.children, depth + 2, startFen))
      }
    } else {
      // Black to move (when startFen starts with black's turn)
      const whiteNode = node.children[0] ?? null
      rows.push({ type: "pair", moveNum, white: whiteNode, black: node })

      if (whiteNode) {
        rows.push(...collectRows(whiteNode.children, depth + 2, startFen))
      }

      for (const altWhite of node.children.slice(1)) {
        rows.push({ type: "sep", label: `${moveNum + 1}.` })
        rows.push({ type: "pair", moveNum: moveNum + 1, white: altWhite, black: null })
        rows.push(...collectRows(altWhite.children, depth + 2, startFen))
      }
    }
  })

  return rows
}

// ─── Move button ─────────────────────────────────────────────────────────────

function MoveBtn({
  node,
  selectedId,
  onSelect,
  onContextMenu,
}: {
  node: LineNode
  selectedId: string | null
  onSelect: (n: LineNode) => void
  onContextMenu: (e: React.MouseEvent, n: LineNode) => void
}) {
  const selected = node.id === selectedId
  return (
    <button
      onClick={() => onSelect(node)}
      onContextMenu={(e) => onContextMenu(e, node)}
      className={`px-2 py-0.5 rounded text-sm font-mono transition-colors w-[72px] text-left truncate ${
        selected
          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {node.move}
      {node.annotation && (
        <span
          className={`ml-1 text-xs italic ${
            selected ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          {node.annotation}
        </span>
      )}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LineTreeView({ nodes, startFen, selectedId, onSelect, onDelete }: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contextMenu) return
    function handleClose(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return
      if (e instanceof MouseEvent && menuRef.current?.contains(e.target as Node)) return
      setContextMenu(null)
    }
    document.addEventListener("mousedown", handleClose)
    document.addEventListener("keydown", handleClose)
    return () => {
      document.removeEventListener("mousedown", handleClose)
      document.removeEventListener("keydown", handleClose)
    }
  }, [contextMenu])

  function handleContextMenu(e: React.MouseEvent, node: LineNode) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  if (nodes.length === 0) {
    return (
      <p className="text-xs text-zinc-400 dark:text-zinc-500 italic px-2 py-1">
        No moves yet. Drag a piece or type a move on the left.
      </p>
    )
  }

  const rows = collectRows(nodes, 0, startFen)

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {rows.map((row, i) => {
          if (row.type === "sep") {
            return (
              <div key={`sep-${i}`} className="flex items-center gap-2 my-1">
                <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono shrink-0">
                  {row.label}
                </span>
                <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
              </div>
            )
          }

          // Pair row
          const label = row.white ? `${row.moveNum}.` : `${row.moveNum}...`
          return (
            <div key={`pair-${i}`} className="flex items-center gap-1">
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono w-8 text-right shrink-0 select-none">
                {label}
              </span>
              {row.white ? (
                <MoveBtn
                  node={row.white}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onContextMenu={handleContextMenu}
                />
              ) : (
                <div className="w-[72px] shrink-0" />
              )}
              {row.black && (
                <MoveBtn
                  node={row.black}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onContextMenu={handleContextMenu}
                />
              )}
            </div>
          )
        })}
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg py-1 min-w-[180px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="px-3 py-1.5 text-xs text-zinc-400 dark:text-zinc-500 font-mono border-b border-zinc-100 dark:border-zinc-700 mb-1">
            {contextMenu.node.move}
          </div>
          <button
            onClick={() => {
              onDelete(contextMenu.node)
              setContextMenu(null)
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            Delete move and branch
          </button>
        </div>
      )}
    </>
  )
}
