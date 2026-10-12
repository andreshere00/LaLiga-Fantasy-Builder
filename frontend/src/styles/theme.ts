export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "lfb-theme";

export function readTheme(): Theme {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}
