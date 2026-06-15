"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function NewLinePage() {
  const router = useRouter()
  const [label, setLabel] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError("")

    const res = await fetch("/api/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() || null }),
    })

    if (!res.ok) {
      setError("Failed to create line.")
      setSubmitting(false)
      return
    }

    const line = await res.json()
    router.push(`/lines/${line.id}`)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 w-full">
      <div className="flex items-center gap-2 mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        <Link href="/lines" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
          Lines
        </Link>
        <span>/</span>
        <span className="text-zinc-900 dark:text-zinc-100">New</span>
      </div>

      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">New Line</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Name <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Sicilian Defense"
            autoFocus
            className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-zinc-900 dark:bg-zinc-700 text-white rounded-md text-sm hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create line"}
          </button>
          <Link
            href="/lines"
            className="px-5 py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-md text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
