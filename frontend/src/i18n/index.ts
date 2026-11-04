import i18next from "i18next";
import { useSyncExternalStore } from "react";
import english from "./en.json";
import spanish from "./es.json";

export type Language = "en" | "es";
export const LANGUAGE_STORAGE_KEY = "lfb-language";
export function resolveLanguage(saved: string | null, preferred: readonly string[]): Language {
  if (saved === "en" || saved === "es") return saved;
  for (const candidate of preferred) {
    const code = candidate.toLowerCase().split("-")[0];
    if (code === "es" || code === "en") return code;
  }
  return "en";
}
function initialLanguage(): Language {
  let saved = null;
  try { saved = localStorage.getItem(LANGUAGE_STORAGE_KEY); } catch { /* In-memory preference. */ }
  return resolveLanguage(saved, typeof navigator === "undefined" ? [] : navigator.languages);
}
export const i18n = i18next.createInstance();
void i18n.init({
  lng: initialLanguage(), fallbackLng: "en", supportedLngs: ["en", "es"],
  resources: { en: { translation: english }, es: { translation: spanish } },
  keySeparator: false, nsSeparator: false, initAsync: false,
  interpolation: { escapeValue: false },
});
const subscribe = (listener: () => void) => {
  i18n.on("languageChanged", listener);
  return () => { i18n.off("languageChanged", listener); };
};
export function language(): Language { return i18n.language === "es" ? "es" : "en"; }
export function locale(): string { return language() === "es" ? "es-ES" : "en-GB"; }
export function useLanguage(): Language { return useSyncExternalStore(subscribe, language, () => "en"); }
export function setLanguage(value: Language): void {
  void i18n.changeLanguage(value);
  document.documentElement.lang = value;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, value); } catch { /* In-memory preference. */ }
}
// Literal source messages are stable catalog keys. Interpolated data stays verbatim.
const patterns = Object.keys(english).filter(key => /\{\{\d+\}\}/.test(key)).map(key => ({
  key,
  regex: new RegExp("^" + key.split(/\{\{\d+\}\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.*?)") + "$"),
}));
export function copy<T>(value: T): T {
  if (typeof value === "string") {
    if (Object.hasOwn(english, value)) return i18n.t(value) as T;
    for (const { key, regex } of patterns) {
      const match = regex.exec(value);
      if (match) return i18n.t(key, Object.fromEntries(match.slice(1).map((part, index) => [index, part]))) as T;
    }
  }
  if (Array.isArray(value)) return value.map(item => copy(item)) as T;
  return value;
}
