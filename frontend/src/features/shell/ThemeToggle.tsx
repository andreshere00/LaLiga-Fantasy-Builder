import { useEffect, useState } from "react";
import { readTheme, THEME_STORAGE_KEY, type Theme } from "../../styles/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Preference remains in memory. */ }
  }, [theme]);
  return <button type="button" className="theme-btn" aria-label={"Switch to " + (theme === "light" ? "dark" : "light") + " theme"}
    onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
    {theme === "light" ? "Dark" : "Light"}
  </button>;
}
