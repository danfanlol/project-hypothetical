"use client"

import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  hasError: boolean
}

export class ChessErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center w-full aspect-square bg-zinc-100 rounded-md border border-zinc-200 text-zinc-400 text-sm text-center p-4">
          Could not render board
          {this.props.label ? ` for "${this.props.label}"` : ""}
          <br />— the FEN may be invalid.
        </div>
      )
    }
    return this.props.children
  }
}
