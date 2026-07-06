"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Chess, type Square } from "chess.js"
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs } from "react-chessboard"
import type { LineData, LineNode, OpeningData, PositionData } from "@/lib/types"
import { fenKey } from "@/lib/chess-utils"
import { LineTreeView } from "@/components/LineTreeView"
import { AnalysisPanel } from "@/components/AnalysisPanel"
import { ChessErrorBoundary } from "@/components/ChessErrorBoundary"
import { useSettings } from "@/components/SettingsProvider"
import { BOARD_THEMES } from "@/lib/settings"

// ─── Tree helpers ────────────────────────────────────────────────────────────

function insertChild(nodes: LineNode[], parentId: string | null, child: LineNode): LineNode[] {
  if (parentId === null) return [...nodes, child]
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: [...n.children, child] }
    return { ...n, children: insertChild(n.children, parentId, child) }
  })
}

function removeNode(nodes: LineNode[], id: string): LineNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }))
}

function updateNode(nodes: LineNode[], id: string, patch: Partial<LineNode>): LineNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch }
    return { ...n, children: updateNode(n.children, id, patch) }
  })
}

function findNode(nodes: LineNode[], id: string): LineNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return null
}

function findParentNode(nodes: LineNode[], targetId: string): LineNode | null {
  for (const n of nodes) {
    if (n.children.some((c) => c.id === targetId)) return n
    const found = findParentNode(n.children, targetId)
    if (found) return found
  }
  return null
}

function walkNodes(nodes: LineNode[], cb: (node: LineNode) => void): void {
  for (const n of nodes) { cb(n); walkNodes(n.children, cb) }
}

// Returns a stripped tree: the single path from root to targetId, each ancestor
// pruned to only the child on that path. The target node keeps all its children.
function buildPathTree(nodes: LineNode[], targetId: string): LineNode[] {
  for (const n of nodes) {
    if (n.id === targetId) return [n]
    const sub = buildPathTree(n.children, targetId)
    if (sub.length > 0) return [{ ...n, children: sub }]
  }
  return []
}

// Returns an existing child of parentId (or top-level node) that matches the SAN move.
function getExistingChild(tree: LineNode[], parentId: string | null, san: string): LineNode | null {
  const siblings = parentId === null ? tree : (findNode(tree, parentId)?.children ?? [])
  return siblings.find((c) => c.move === san) ?? null
}

// ─── Move helpers ─────────────────────────────────────────────────────────────

function tryMove(chess: Chess, san: string): string | null {
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

// ─── Transposition ───────────────────────────────────────────────────────────

type TranspositionMatch = { lineId: string; lineLabel: string | null; move: string }

// ─── Save status ─────────────────────────────────────────────────────────────

type SaveStatus = "saved" | "saving" | "unsaved"

// ─── Component ───────────────────────────────────────────────────────────────

export default function LineEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { settings } = useSettings()
  const boardColors = BOARD_THEMES[settings.boardTheme]

  const [line, setLine] = useState<LineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Which node is selected (null = root / start position)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentFen, setCurrentFen] = useState("")

  // Move input
  const [moveInput, setMoveInput] = useState("")
  const [moveError, setMoveError] = useState("")

  // Annotation input (shown when a node is selected)
  const [annotationInput, setAnnotationInput] = useState("")

  // Label editing
  const [label, setLabel] = useState("")

  // Board selection state for click-to-move
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)

  // Save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved")
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Link-to-position modal
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [positions, setPositions] = useState<PositionData[] | null>(null)
  const [posSearch, setPosSearch] = useState("")
  const [opening, setOpening] = useState<OpeningData | null>(null)

  // Board orientation
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white")

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Engine analysis toggle
  const [showAnalysis, setShowAnalysis] = useState(false)

  // Transposition detection
  const [fenMap, setFenMap] = useState<Map<string, TranspositionMatch[]> | null>(null)
  const [lineLabelMap, setLineLabelMap] = useState<Map<string, string | null>>(new Map())

  // ─── Load line ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/lines/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null }
        return r.json()
      })
      .then((data: LineData | null) => {
        if (!data) return
        setLine(data)
        setLabel(data.label ?? "")
        setCurrentFen(data.startFen)
        setBoardOrientation(data.boardOrientation ?? "white")
        setLoading(false)
      })
  }, [id])

  // ─── Opening lookup ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!line || !currentFen) return
    const activeLine = line

    const controller = new AbortController()

    async function lookupOpening() {
      try {
        const response = await fetch(`/api/openings?fen=${encodeURIComponent(currentFen)}`, {
          signal: controller.signal,
        })
        if (!response.ok) return
        const data = await response.json() as { opening: OpeningData | null }
        setOpening(data.opening)

        if (data.opening?.name && activeLine.labelAuto) {
          const nextLabel = data.opening.name
          if (activeLine.label !== nextLabel) {
            setLabel(nextLabel)
            setLine({ ...activeLine, label: nextLabel })
            scheduleSave({ label: nextLabel })
          }
        }
      } catch {
        // ignore failures
      }
    }

    lookupOpening()
    return () => controller.abort()
  }, [currentFen, line])

  // ─── Keyboard navigation ─────────────────────────────────────────────────

  useEffect(() => {
    if (!line) return

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return

      if (showAnalysis && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return

      if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (selectedId === null) return
        const isTopLevel = line!.tree.some((n) => n.id === selectedId)
        if (isTopLevel) {
          setSelectedId(null)
          setCurrentFen(line!.startFen)
          setAnnotationInput("")
        } else {
          const parent = findParentNode(line!.tree, selectedId)
          if (parent) {
            setSelectedId(parent.id)
            setCurrentFen(parent.fen)
            setAnnotationInput(parent.annotation ?? "")
          }
        }
        setMoveInput("")
        setMoveError("")
        setSelectedSquare(null)
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        let target: LineNode | null = null
        if (selectedId === null) {
          target = line!.tree[0] ?? null
        } else {
          const node = findNode(line!.tree, selectedId)
          target = node?.children[0] ?? null
        }
        if (target) {
          setSelectedId(target.id)
          setCurrentFen(target.fen)
          setAnnotationInput(target.annotation ?? "")
          setMoveInput("")
          setMoveError("")
          setSelectedSquare(null)
        }
      } else if (e.key === "x" || e.key === "X") {
        e.preventDefault()
        const next = boardOrientation === "white" ? "black" : "white"
        setBoardOrientation(next)
        scheduleSave({ boardOrientation: next })
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedId, line, boardOrientation, showAnalysis])

  // ─── Transposition map ───────────────────────────────────────────────────

  useEffect(() => {
    if (!line) return
    fetch("/api/lines")
      .then((r) => r.json())
      .then((lines: LineData[]) => {
        const map = new Map<string, TranspositionMatch[]>()
        const labels = new Map<string, string | null>()
        for (const l of lines) {
          if (l.id === id) continue
          labels.set(l.id, l.label)
          walkNodes(l.tree, (node) => {
            const key = fenKey(node.fen)
            const existing = map.get(key) ?? []
            if (!existing.some((m) => m.lineId === l.id)) {
              existing.push({ lineId: l.id, lineLabel: l.label, move: node.move })
              map.set(key, existing)
            }
          })
        }
        setFenMap(map)
        setLineLabelMap(labels)
      })
      .catch(() => {/* silently skip if fetch fails */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id])

  // ─── Autosave ────────────────────────────────────────────────────────────

  type SavePatch = { label?: string | null; labelAuto?: boolean; tree?: LineNode[]; boardOrientation?: "white" | "black" }

  const saveToServer = useCallback(
    async (patch: SavePatch) => {
      setSaveStatus("saving")
      await fetch(`/api/lines/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      setSaveStatus("saved")
    },
    [id]
  )

  function scheduleSave(patch: SavePatch) {
    setSaveStatus("unsaved")
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveToServer(patch), 800)
  }

  // ─── Select node ─────────────────────────────────────────────────────────

  function selectNode(node: LineNode | null) {
    if (node === null) {
      setSelectedId(null)
      setCurrentFen(line!.startFen)
      setAnnotationInput("")
    } else {
      setSelectedId(node.id)
      setCurrentFen(node.fen)
      setAnnotationInput(node.annotation ?? "")
    }
    setMoveInput("")
    setMoveError("")
    setSelectedSquare(null)
  }

  // ─── Add move (text input) ────────────────────────────────────────────────

  function addMoveFromText(e: React.FormEvent) {
    e.preventDefault()
    if (!line || !moveInput.trim()) return
    const san = attemptAddMove(moveInput.trim())
    if (san) setMoveInput("")
  }

  function attemptAddMove(raw: string): string | null {
    if (!line) return null
    const chess = new Chess(currentFen)
    const san = tryMove(chess, raw)
    if (!san) {
      setMoveError(`"${raw}" is not a legal move here.`)
      return null
    }
    setMoveError("")
    const existing = getExistingChild(line.tree, selectedId, san)
    if (existing) {
      setSelectedId(existing.id)
      setCurrentFen(existing.fen)
      setAnnotationInput(existing.annotation ?? "")
      return san
    }
    const newNode: LineNode = {
      id: crypto.randomUUID(),
      move: san,
      fen: chess.fen(),
      children: [],
    }
    const newTree = insertChild(line.tree, selectedId, newNode)
    const updated = { ...line, tree: newTree }
    setLine(updated)
    setSelectedId(newNode.id)
    setCurrentFen(newNode.fen)
    setAnnotationInput("")
    scheduleSave({ tree: newTree })
    return san
  }

  // ─── Add move via board drag/click ────────────────────────────────────────

  function handlePieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!targetSquare) return false
    const chess = new Chess(currentFen)
    let move
    try {
      move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" })
    } catch {
      return false
    }
    if (!move) return false

    setMoveError("")
    const existing = getExistingChild(line!.tree, selectedId, move.san)
    if (existing) {
      setSelectedId(existing.id)
      setCurrentFen(existing.fen)
      setAnnotationInput(existing.annotation ?? "")
      setSelectedSquare(null)
      return true
    }
    const newNode: LineNode = {
      id: crypto.randomUUID(),
      move: move.san,
      fen: chess.fen(),
      children: [],
    }
    const newTree = insertChild(line!.tree, selectedId, newNode)
    const updated = { ...line!, tree: newTree }
    setLine(updated)
    setSelectedId(newNode.id)
    setCurrentFen(newNode.fen)
    setAnnotationInput("")
    setSelectedSquare(null)
    scheduleSave({ tree: newTree })
    return true
  }

  function handleSquareMouseDown({ piece, square }: SquareHandlerArgs, e: React.MouseEvent) {
    if (e.button !== 0) { setSelectedSquare(null); return }
    if (!line) return
    const chess = new Chess(currentFen)
    const turn = chess.turn()
    if (piece?.pieceType[0] === turn) {
      setSelectedSquare(square)
    }
  }

  function handleSquareClick({ square }: SquareHandlerArgs) {
    if (!selectedSquare || selectedSquare === square || !line) return
    const chess = new Chess(currentFen)
    let move
    try {
      move = chess.move({ from: selectedSquare, to: square, promotion: "q" })
    } catch {
      setSelectedSquare(null)
      return
    }
    if (!move) { setSelectedSquare(null); return }

    setMoveError("")
    const existing = getExistingChild(line.tree, selectedId, move.san)
    if (existing) {
      setSelectedId(existing.id)
      setCurrentFen(existing.fen)
      setAnnotationInput(existing.annotation ?? "")
      setSelectedSquare(null)
      return
    }
    const newNode: LineNode = {
      id: crypto.randomUUID(),
      move: move.san,
      fen: chess.fen(),
      children: [],
    }
    const newTree = insertChild(line.tree, selectedId, newNode)
    const updated = { ...line, tree: newTree }
    setLine(updated)
    setSelectedId(newNode.id)
    setCurrentFen(newNode.fen)
    setAnnotationInput("")
    setSelectedSquare(null)
    scheduleSave({ tree: newTree })
  }

  // ─── Delete selected node ─────────────────────────────────────────────────

  function deleteSelected() {
    if (!selectedId || !line) return
    deleteNode(selectedId)
  }

  function deleteNode(nodeId: string) {
    if (!line) return
    const newTree = removeNode(line.tree, nodeId)
    const updated = { ...line, tree: newTree }
    setLine(updated)
    if (selectedId === nodeId) {
      setSelectedId(null)
      setCurrentFen(line.startFen)
      setAnnotationInput("")
    }
    scheduleSave({ tree: newTree })
  }

  // ─── Save annotation ─────────────────────────────────────────────────────

  function saveAnnotation() {
    if (!selectedId || !line) return
    const newTree = updateNode(line.tree, selectedId, { annotation: annotationInput || undefined })
    const updated = { ...line, tree: newTree }
    setLine(updated)
    scheduleSave({ tree: newTree })
  }

  // ─── Save label ───────────────────────────────────────────────────────────

  function handleLabelBlur() {
    if (!line) return
    const trimmed = label.trim() || null
    const updated = { ...line, label: trimmed, labelAuto: !trimmed }
    setLine(updated)
    scheduleSave({ label: trimmed, labelAuto: !trimmed })
  }

  function handleLabelChange(value: string) {
    setLabel(value)
  }

  function flipBoard() {
    const next = boardOrientation === "white" ? "black" : "white"
    setBoardOrientation(next)
    scheduleSave({ boardOrientation: next })
  }

  // ─── Link to position ─────────────────────────────────────────────────────

  async function openLinkModal() {
    setShowLinkModal(true)
    if (!positions) {
      const res = await fetch("/api/positions")
      const data = await res.json()
      setPositions(data)
    }
  }

  function linkPosition(positionId: string) {
    if (!selectedId || !line) return
    const newTree = updateNode(line.tree, selectedId, { positionId })
    const updated = { ...line, tree: newTree }
    setLine(updated)
    scheduleSave({ tree: newTree })
    setShowLinkModal(false)
  }

  function unlinkPosition() {
    if (!selectedId || !line) return
    const newTree = updateNode(line.tree, selectedId, { positionId: undefined })
    const updated = { ...line, tree: newTree }
    setLine(updated)
    scheduleSave({ tree: newTree })
  }

  // ─── Transposition linking ────────────────────────────────────────────────

  function linkTransposition(transposeLineId: string) {
    if (!selectedId || !line) return
    const newTree = updateNode(line.tree, selectedId, { transposeLineId })
    const updated = { ...line, tree: newTree }
    setLine(updated)
    scheduleSave({ tree: newTree })
  }

  function unlinkTransposition() {
    if (!selectedId || !line) return
    const newTree = updateNode(line.tree, selectedId, { transposeLineId: undefined })
    const updated = { ...line, tree: newTree }
    setLine(updated)
    scheduleSave({ tree: newTree })
  }

  // ─── Delete line ─────────────────────────────────────────────────────────

  async function deleteLine() {
    await fetch(`/api/lines/${id}`, { method: "DELETE" })
    router.push("/lines")
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  // Must be before early returns — hooks cannot be called conditionally
  const intraFenMap = useMemo(() => {
    if (!line) return new Map<string, LineNode[]>()
    const map = new Map<string, LineNode[]>()
    walkNodes(line.tree, (node) => {
      const key = fenKey(node.fen)
      const existing = map.get(key) ?? []
      existing.push(node)
      map.set(key, existing)
    })
    return map
  }, [line])

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 text-zinc-400 dark:text-zinc-500 text-sm">
        Loading…
      </div>
    )
  }

  if (notFound || !line) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <p className="text-zinc-500">Line not found.</p>
        <Link href="/lines" className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
          ← Back to Lines
        </Link>
      </div>
    )
  }

  const selectedNode = selectedId ? findNode(line.tree, selectedId) : null
  const boardSizePx = settings.boardSizePx
  const transpositions = fenMap?.get(fenKey(currentFen)) ?? []

  // Show only the spine from root to selectedId (no siblings at intermediate levels),
  // with the selected node's children fully expanded below it.
  const treeViewNodes = selectedId ? buildPathTree(line.tree, selectedId) : line.tree

  const intraTranspositions = selectedId
    ? (intraFenMap.get(fenKey(currentFen)) ?? []).filter((n) => n.id !== selectedId)
    : []

  const filteredPositions = positions
    ? posSearch.trim()
      ? positions.filter((p) => (p.label ?? "").toLowerCase().includes(posSearch.toLowerCase()))
      : positions
    : []

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2 flex items-center gap-3">
        <div className="flex-1 flex flex-col min-w-0">
          <input
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            onBlur={handleLabelBlur}
            placeholder="Untitled line"
            className="w-full bg-transparent text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none min-w-0"
          />
          {opening?.name && opening.name !== label && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
              Currently in: {opening.name}
            </span>
          )}
        </div>
        {saveStatus !== "saved" && (
          <span className="text-xs text-amber-500 shrink-0">
            {saveStatus === "saving" ? "Saving…" : "Unsaved"}
          </span>
        )}
        <Link
          href="/lines"
          className="shrink-0 px-3 py-1.5 text-sm font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          ← Lines
        </Link>
        <Link
          href={`/review/${id}`}
          className="shrink-0 px-3 py-1.5 text-sm font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Review
        </Link>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="shrink-0 px-3 py-1.5 text-sm font-medium border border-red-300 dark:border-red-800 text-red-500 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            Delete line
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Delete this line?</span>
            <button
              onClick={deleteLine}
              className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 text-sm font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Main split panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden justify-center">
        <div className="flex min-h-0 w-full" style={{ maxWidth: boardSizePx + 32 + 256 + 256 }}>
        {/* Left: transposition panel */}
        <div className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Transpositions</h2>
          </div>

          {/* Within-line transposition banner */}
          {intraTranspositions.length > 0 && (
            <div className="w-full rounded-md border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 flex flex-col gap-1.5 mb-3">
              <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                ↩ Another variation in this line reaches the same position:
              </p>
              <div className="flex flex-col gap-1">
                {intraTranspositions.map((n) => (
                  <div key={n.id} className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-sky-600 dark:text-sky-300 flex-1 truncate font-mono">…{n.move}</span>
                    <button
                      onClick={() => selectNode(n)}
                      className="shrink-0 text-xs text-sky-700 dark:text-sky-400 border border-sky-300 dark:border-sky-700 rounded px-1.5 py-0.5 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                    >
                      Jump to
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross-line transposition banner */}
          {transpositions.length > 0 && (
            <div className="w-full rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 flex flex-col gap-1.5">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                ⇄ Transposition — this position is also reached in:
              </p>
              <div className="flex flex-col gap-1">
                {transpositions.map((t) => (
                  <div key={t.lineId} className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-amber-600 dark:text-amber-300 flex-1 truncate">{t.lineLabel ?? "Untitled line"}</span>
                    {selectedId && selectedNode?.transposeLineId !== t.lineId && (
                      <button
                        onClick={() => linkTransposition(t.lineId)}
                        className="shrink-0 text-xs text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded px-1.5 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                      >
                        Link
                      </button>
                    )}
                    {selectedNode?.transposeLineId === t.lineId && (
                      <span className="shrink-0 text-xs text-amber-500 dark:text-amber-500">Linked ✓</span>
                    )}
                    <Link
                      href={`/lines/${t.lineId}`}
                      className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    >
                      Open →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Middle: board + controls */}
        <div className="flex flex-col items-center gap-4 p-4 shrink-0 overflow-y-auto" style={{ width: boardSizePx + 32 }}>
          {/* Breadcrumb showing current move */}
          <div className="w-full text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            {selectedNode ? (
              <span>
                <button
                  onClick={() => selectNode(null)}
                  className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                >
                  start
                </button>
                {" / "}
                <span className="text-zinc-900 dark:text-zinc-100 font-medium">{selectedNode.move}</span>
              </span>
            ) : (
              <span className="text-zinc-900 dark:text-zinc-100 font-medium">start</span>
            )}
          </div>

          {/* Board */}
          <div className="w-full flex flex-col gap-2" style={{ width: boardSizePx }}>
            <ChessErrorBoundary>
              <Chessboard
                options={{
                  position: currentFen,
                  boardOrientation,
                  allowDragging: true,
                  animationDurationInMs: 150,
                  boardStyle: { borderRadius: "4px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" },
                  darkSquareStyle: { backgroundColor: boardColors.dark },
                  lightSquareStyle: { backgroundColor: boardColors.light },
                  onPieceDrop: handlePieceDrop,
                  onSquareMouseDown: handleSquareMouseDown,
                  onSquareClick: handleSquareClick,
                }}
              />
            </ChessErrorBoundary>
            <button
              onClick={flipBoard}
              className="self-end text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              title="Flip board"
            >
              ⇅ Flip board ({boardOrientation === "white" ? "White" : "Black"} on bottom)
            </button>
          </div>

          {/* Add move input */}
          <div className="w-full flex flex-col gap-2">
            <form onSubmit={addMoveFromText} className="flex gap-2">
              <input
                type="text"
                value={moveInput}
                onChange={(e) => { setMoveInput(e.target.value); setMoveError("") }}
                placeholder="Add move (e.g. Nf3)"
                className="flex-1 px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
              >
                +
              </button>
            </form>
            {moveError && <p className="text-xs text-red-500">{moveError}</p>}
          </div>

          {/* Engine analysis */}
          <div className="w-full">
            <button
              onClick={() => setShowAnalysis((s) => !s)}
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 transition-colors"
            >
              {showAnalysis ? "Hide analysis" : "Analyze"}
            </button>
            {showAnalysis && (
              <AnalysisPanel key={currentFen} fen={currentFen} orientation={boardOrientation} />
            )}
          </div>

          {/* Transposition banners moved to left column */}

          {/* Node actions (only when a node is selected) */}
          {selectedNode && (
            <div className="w-full flex flex-col gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              {/* Annotation */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500 dark:text-zinc-400">Note</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={annotationInput}
                    onChange={(e) => setAnnotationInput(e.target.value)}
                    onBlur={saveAnnotation}
                    placeholder="Optional annotation…"
                    className="flex-1 px-2 py-1 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                  />
                </div>
              </div>

              {/* Link to position */}
              <div className="flex items-center gap-2">
                {selectedNode.positionId ? (
                  <>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Linked to drill position</span>
                    <button
                      onClick={unlinkPosition}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      Unlink
                    </button>
                  </>
                ) : (
                  <button
                    onClick={openLinkModal}
                    className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 transition-colors"
                  >
                    Link to drill position…
                  </button>
                )}
              </div>

              {/* Transposition link status */}
              {selectedNode.transposeLineId && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    ⇄ Linked to {lineLabelMap.get(selectedNode.transposeLineId) ?? "Untitled line"}
                  </span>
                  <Link
                    href={`/lines/${selectedNode.transposeLineId}`}
                    className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                  >
                    Open →
                  </Link>
                  <button
                    onClick={unlinkTransposition}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    Unlink
                  </button>
                </div>
              )}

              {/* Delete node */}
              <button
                onClick={deleteSelected}
                className="self-start text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove this move and its variations
              </button>
            </div>
          )}
        </div>

        {/* Right: move tree */}
        <div className="w-64 shrink-0 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Move Tree
            </h2>
            <button
              onClick={() => selectNode(null)}
              className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              ↑ Root
            </button>
          </div>

          {/* Root node */}
          <div className="mb-2">
            <button
              onClick={() => selectNode(null)}
              className={`text-left px-2 py-1 rounded text-sm font-mono transition-colors ${
                selectedId === null
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              ● start
            </button>
          </div>

          <LineTreeView
            nodes={treeViewNodes}
            startFen={line.startFen}
            selectedId={selectedId}
            onSelect={selectNode}
            onDelete={(node) => deleteNode(node.id)}
          />
        </div>
        </div>
      </div>

      {/* Link-to-position modal */}
      {showLinkModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowLinkModal(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">Link to drill position</h3>
              <button
                onClick={() => setShowLinkModal(false)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="p-3 border-b border-zinc-100 dark:border-zinc-800">
              <input
                type="text"
                value={posSearch}
                onChange={(e) => setPosSearch(e.target.value)}
                placeholder="Search by label…"
                className="w-full px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                autoFocus
              />
            </div>
            <ul className="overflow-y-auto flex-1">
              {positions === null ? (
                <li className="px-4 py-3 text-sm text-zinc-400">Loading…</li>
              ) : filteredPositions.length === 0 ? (
                <li className="px-4 py-3 text-sm text-zinc-400">No positions found.</li>
              ) : (
                filteredPositions.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => linkPosition(p.id)}
                      className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex flex-col gap-0.5"
                    >
                      <span className="text-sm text-zinc-900 dark:text-zinc-100">
                        {p.label || <span className="italic text-zinc-400">Untitled</span>}
                      </span>
                      <span className="text-xs text-zinc-400 font-mono truncate">{p.fen}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
