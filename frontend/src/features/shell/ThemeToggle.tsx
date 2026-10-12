import { useEffect, useState } from "react";
import { readTheme, THEME_STORAGE_KEY, type Theme } from "../../styles/theme";
import configBlackUrl from "../../assets/button_config_black.svg";
import configGrayUrl from "../../assets/button_config_gray.svg";
import configRedUrl from "../../assets/button_config_red.svg";
import configWhiteUrl from "../../assets/button_config_white.svg";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Preference remains in memory. */ }
  }, [theme]);
  return <button type="button" className="theme-btn" aria-label={"Switch to " + (theme === "light" ? "dark" : "light") + " theme"}
    onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
    <img className="theme-config-icon theme-config-icon--black" src={configBlackUrl} alt="" />
    <img className="theme-config-icon theme-config-icon--white" src={configWhiteUrl} alt="" />
    <img className="theme-config-icon theme-config-icon--red" src={configRedUrl} alt="" />
    <img className="theme-config-icon theme-config-icon--gray" src={configGrayUrl} alt="" />
  </button>;
}
