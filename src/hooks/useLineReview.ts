"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"
import { Chess } from "chess.js"
import type { LineData, LineNode } from "@/lib/types"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewFrame {
  nodes: LineNode[]
  parentFen: string
  index: number
}

type InternalStatus = "idle" | "auto_playing" | "showing_correct" | "showing_wrong" | "showing_hint" | "done"

interface ReviewState {
  stack: ReviewFrame[]
  siblingAutoPlay: boolean
  boardFen: string
  status: InternalStatus
  currentNode: LineNode | null
  orientation: "white" | "black"
  previewMoves: LineNode[]
  snapBoard: boolean
  wrongCount: number
}

export type ReviewStatus =
  | "idle"
  | "auto_playing"
  | "awaiting_user"
  | "showing_correct"
  | "showing_wrong"
  | "showing_hint"
  | "done"

type ReviewAction =
  | { type: "INIT"; line: LineData }
  | { type: "OPPONENT_PASS" }
  | { type: "PREVIEW_PASS" }
  | { type: "USER_MOVE"; san: string; fen: string }
  | { type: "RESET_WRONG" }
  | { type: "ADVANCE" }
  | { type: "SHOW_HINT" }
  | { type: "RESET_HINT" }

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function getStackCurrent(stack: ReviewFrame[]): LineNode | null {
  if (!stack.length) return null
  const f = stack[stack.length - 1]
  return f.nodes[f.index] ?? null
}

function isUserTurn(fen: string, orientation: "white" | "black"): boolean {
  try {
    return (new Chess(fen).turn() === "w") === (orientation === "white")
  } catch {
    return false
  }
}

function cloneFrames(stack: ReviewFrame[]): ReviewFrame[] {
  return stack.map((f) => ({ ...f }))
}

function pushChildren(stack: ReviewFrame[], node: LineNode): ReviewFrame[] {
  if (!node.children.length) return stack
  return [...stack, { nodes: node.children, parentFen: node.fen, index: 0 }]
}

function isSiblingTransition(oldStack: ReviewFrame[], newStack: ReviewFrame[]): boolean {
  if (!oldStack.length || !newStack.length) return false

  if (newStack.length === oldStack.length) {
    const o = oldStack[oldStack.length - 1]
    const n = newStack[newStack.length - 1]
    return n.index === o.index + 1
  }

  if (newStack.length < oldStack.length) {
    const parentIdx = newStack.length - 1
    const oldParent = oldStack[parentIdx]
    const newParent = newStack[parentIdx]
    return newParent.index > oldParent.index
  }

  return false
}

function advanceFrame(stack: ReviewFrame[]): ReviewFrame[] {
  if (!stack.length) return stack
  const frames = cloneFrames(stack)
  const frame = frames[frames.length - 1]
  frame.index++
  if (frame.index < frame.nodes.length) return frames
  return popFrame(frames)
}

function popFrame(stack: ReviewFrame[]): ReviewFrame[] {
  const frames = stack.slice(0, -1)
  if (!frames.length) return frames
  return advanceFrame(frames)
}

function nextDFSState(
  prev: ReviewState,
  stack: ReviewFrame[],
  boardFen?: string,
  siblingAutoPlay = false
): ReviewState {
  const node = getStackCurrent(stack)
  if (!stack.length || !node) {
    return {
      ...prev,
      stack,
      boardFen: boardFen ?? prev.boardFen,
      status: "done",
      currentNode: null,
      siblingAutoPlay: false,
      previewMoves: [],
      snapBoard: false,
      wrongCount: 0,
    }
  }

  const resolvedBoardFen = boardFen ?? stack[stack.length - 1].parentFen

  return {
    ...prev,
    stack,
    boardFen: resolvedBoardFen,
    status: "auto_playing",
    currentNode: node,
    siblingAutoPlay,
    previewMoves: [],
    snapBoard: false,
    wrongCount: 0,
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "INIT": {
      const { line } = action
      const stack: ReviewFrame[] = line.tree.length
        ? [{ nodes: line.tree, parentFen: line.startFen, index: 0 }]
        : []
      return nextDFSState(
        { ...state, orientation: line.boardOrientation },
        stack,
        line.startFen,
        false
      )
    }

    case "OPPONENT_PASS": {
      const node = getStackCurrent(state.stack)
      if (!node) return { ...state, status: "done" }

      const frame = state.stack[state.stack.length - 1]
      const wasUserSiblingAutoPlay =
        state.siblingAutoPlay && isUserTurn(frame.parentFen, state.orientation)

      const withChildren = pushChildren(state.stack, node)
      if (withChildren !== state.stack) {
        return nextDFSState(state, withChildren, node.fen, false)
      }

      const oldStack = state.stack
      const advanced = advanceFrame(state.stack)
      const sibling = wasUserSiblingAutoPlay ? false : isSiblingTransition(oldStack, advanced)
      return nextDFSState(state, advanced, undefined, sibling)
    }

    case "USER_MOVE": {
      const { san, fen } = action
      const node = getStackCurrent(state.stack)
      if (!node) return state

      if (node.move.toLowerCase() === san.toLowerCase()) {
        return { ...state, boardFen: node.fen, status: "showing_correct", siblingAutoPlay: false, previewMoves: [], snapBoard: false }
      }

      // Wrong: show the move on the board, then auto-reset for retry.
      return { ...state, boardFen: fen, status: "showing_wrong", snapBoard: false, wrongCount: state.wrongCount + 1 }
    }

    case "RESET_WRONG": {
      if (state.status !== "showing_wrong") return state
      const parentFen = state.stack[state.stack.length - 1].parentFen
      return { ...state, boardFen: parentFen, status: "auto_playing", snapBoard: true }
    }

    case "PREVIEW_PASS": {
      if (!state.previewMoves.length) return state
      const [preview, ...rest] = state.previewMoves
      return { ...state, boardFen: preview.fen, previewMoves: rest, snapBoard: false }
    }

    case "ADVANCE": {
      if (state.status !== "showing_correct") return state
      const node = getStackCurrent(state.stack)
      if (!node) return { ...state, status: "done" }

      const withKids = pushChildren(state.stack, node)
      if (withKids !== state.stack) {
        return nextDFSState(state, withKids, node.fen, false)
      }

      const oldStack = state.stack
      const advanced = advanceFrame(state.stack)
      const isSibling = isSiblingTransition(oldStack, advanced)

      // When the deviated move is the opponent's, first replay the user's move
      // that branches into this sibling group so the board always shows two moves.
      if (isSibling && advanced.length >= 1) {
        const topFrame = advanced[advanced.length - 1]
        const topNode = topFrame.nodes[topFrame.index]
        if (topNode && !isUserTurn(topFrame.parentFen, state.orientation)) {
          if (advanced.length >= 2) {
            const parentFrame = advanced[advanced.length - 2]
            const parentNode = parentFrame.nodes[parentFrame.index]
            if (parentNode && isUserTurn(parentFrame.parentFen, state.orientation)) {
              // Snap to before the user's branching move, queue it as a preview
              return {
                ...state,
                stack: advanced,
                boardFen: parentFrame.parentFen,
                previewMoves: [parentNode],
                snapBoard: true,
                siblingAutoPlay: false,
                status: "auto_playing",
                currentNode: topNode,
              }
            }
          }
          // No parent user node — at least snap to the correct starting position
          return {
            ...state,
            stack: advanced,
            boardFen: topFrame.parentFen,
            previewMoves: [],
            snapBoard: true,
            siblingAutoPlay: false,
            status: "auto_playing",
            currentNode: topNode,
          }
        }
      }

      return nextDFSState(state, advanced, node.fen, isSibling)
    }

    case "SHOW_HINT": {
      if (!state.currentNode) return state
      return { ...state, boardFen: state.currentNode.fen, status: "showing_hint", snapBoard: false }
    }

    case "RESET_HINT": {
      if (state.status !== "showing_hint") return state
      const parentFen = state.stack[state.stack.length - 1].parentFen
      return { ...state, boardFen: parentFen, status: "auto_playing", snapBoard: true }
    }

    default:
      return state
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const ANIMATION_MS = 200
const OPPONENT_DELAY = ANIMATION_MS + 300
const WRONG_DELAY = 350

export function useLineReview(line: LineData) {
  const [state, dispatch] = useReducer(reviewReducer, {
    stack: [],
    boardFen: line.startFen,
    status: "idle",
    currentNode: null,
    orientation: line.boardOrientation,
    siblingAutoPlay: false,
    previewMoves: [],
    snapBoard: false,
    wrongCount: 0,
  })

  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    dispatch({ type: "INIT", line })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id])

  useEffect(() => {
    if (state.status !== "auto_playing") return
    if (!state.currentNode || !state.stack.length) return

    if (state.previewMoves.length > 0) {
      const t = setTimeout(() => dispatch({ type: "PREVIEW_PASS" }), OPPONENT_DELAY)
      return () => clearTimeout(t)
    }

    const frame = state.stack[state.stack.length - 1]
    const userTurn = isUserTurn(frame.parentFen, state.orientation)
    if (userTurn && !state.siblingAutoPlay) return

    const t = setTimeout(() => dispatch({ type: "OPPONENT_PASS" }), OPPONENT_DELAY)
    return () => clearTimeout(t)
  }, [state.status, state.currentNode, state.stack, state.orientation, state.siblingAutoPlay, state.previewMoves])

  useEffect(() => {
    if (state.status !== "showing_wrong") return
    const t = setTimeout(() => dispatch({ type: "RESET_WRONG" }), WRONG_DELAY)
    return () => clearTimeout(t)
  }, [state.status])

  useEffect(() => {
    if (state.status !== "showing_hint") return
    const t = setTimeout(() => dispatch({ type: "RESET_HINT" }), 1500)
    return () => clearTimeout(t)
  }, [state.status])

  const submitMove = useCallback((from: string, to: string) => {
    const s = stateRef.current
    if (!s.currentNode || !s.stack.length) return
    const parentFen = s.stack[s.stack.length - 1].parentFen
    if (!isUserTurn(parentFen, s.orientation)) return
    if (s.siblingAutoPlay) return
    if (s.status !== "auto_playing") return

    const chess = new Chess(s.boardFen)
    let move
    try {
      move = chess.move({ from, to, promotion: "q" })
    } catch {
      return
    }
    if (!move) return
    dispatch({ type: "USER_MOVE", san: move.san, fen: chess.fen() })
  }, [])

  const advance = useCallback(() => {
    if (stateRef.current.status === "showing_correct") {
      dispatch({ type: "ADVANCE" })
    }
  }, [])

  const showHint = useCallback(() => {
    if (stateRef.current.wrongCount >= 3) {
      dispatch({ type: "SHOW_HINT" })
    }
  }, [])

  const exposedStatus: ReviewStatus = (() => {
    if (state.status !== "auto_playing") return state.status
    if (!state.stack.length) return state.status
    if (state.siblingAutoPlay) return "auto_playing"
    const frame = state.stack[state.stack.length - 1]
    return isUserTurn(frame.parentFen, state.orientation) ? "awaiting_user" : "auto_playing"
  })()

  const progressText = (() => {
    if (!state.stack.length) return ""
    const frame = state.stack[state.stack.length - 1]
    const rem = frame.nodes.length - frame.index
    return `${rem} node${rem !== 1 ? "s" : ""} remaining at this level`
  })()

  return {
    boardFen: state.boardFen,
    status: exposedStatus,
    orientation: state.orientation,
    progressText,
    snapBoard: state.snapBoard,
    wrongCount: state.wrongCount,
    submitMove,
    advance,
    showHint,
  }
}
