export const BOARD_THEMES = {
  green:  { dark: "#4a7c59", light: "#eeeed2" },
  brown:  { dark: "#b58863", light: "#f0d9b5" },
  gray:   { dark: "#909090", light: "#e2e2e2" },
  slate:  { dark: "#404040", light: "#808080" },
  purple: { dark: "#7c4daa", light: "#e8d5f0" },
  teal:   { dark: "#2d7a7a", light: "#a8e0e0" },
} as const

export type BoardTheme = keyof typeof BOARD_THEMES

export interface Settings {
  boardSizePx: number        // 300–640, controls max-width of the board
  practiceOrder: "ordered" | "random"
  theme: "light" | "dark"
  boardTheme: BoardTheme
}

export const DEFAULT_SETTINGS: Settings = {
  boardSizePx: 480,
  practiceOrder: "ordered",
  theme: "light",
  boardTheme: "brown",
}
