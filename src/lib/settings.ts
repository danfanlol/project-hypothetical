export interface Settings {
  boardSizePx: number        // 300–640, controls max-width of the board
  practiceOrder: "ordered" | "random"
  theme: "light" | "dark"
}

export const DEFAULT_SETTINGS: Settings = {
  boardSizePx: 480,
  practiceOrder: "ordered",
  theme: "light",
}
