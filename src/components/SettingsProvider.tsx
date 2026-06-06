"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings"

interface SettingsCtx {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const Ctx = createContext<SettingsCtx>({ settings: DEFAULT_SETTINGS, update: () => {} })

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("chess-lines-settings")
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) })
    } catch {}
  }, [])

  function update(patch: Partial<Settings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem("chess-lines-settings", JSON.stringify(next)) } catch {}
      return next
    })
  }

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>
}

export const useSettings = () => useContext(Ctx)
