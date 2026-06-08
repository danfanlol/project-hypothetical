"use client"

import { useEffect, useRef, useState } from "react"
import { useSettings } from "@/components/SettingsProvider"

export function SettingsDropdown() {
  const { settings, update } = useSettings()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onOutside)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onOutside)
      document.removeEventListener("keydown", onEsc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        aria-label="Settings"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Settings
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-4 z-50 flex flex-col gap-5">
          {/* Dark mode */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Dark mode</span>
            <button
              onClick={() => update({ theme: settings.theme === "dark" ? "light" : "dark" })}
              role="switch"
              aria-checked={settings.theme === "dark"}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                settings.theme === "dark" ? "bg-zinc-800" : "bg-zinc-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-zinc-900 shadow transition-transform ${
                  settings.theme === "dark" ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Board size */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Board size</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{settings.boardSizePx}px</span>
            </div>
            <input
              type="range"
              min={300}
              max={640}
              step={20}
              value={settings.boardSizePx}
              onChange={(e) => update({ boardSizePx: Number(e.target.value) })}
              className="w-full accent-zinc-900 dark:accent-zinc-100"
            />
            <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500">
              <span>Small</span>
              <span>Large</span>
            </div>
          </div>

          {/* Practice order */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Practice order</span>
            <div className="flex flex-col gap-1.5">
              {([
                ["ordered", "Increasing move count"],
                ["random", "Randomized"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="practiceOrder"
                    value={value}
                    checked={settings.practiceOrder === value}
                    onChange={() => update({ practiceOrder: value })}
                    className="accent-zinc-900 dark:accent-zinc-100"
                  />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
