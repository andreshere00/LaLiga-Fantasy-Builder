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
/** Translate an exact application message; interpolated values are never reinterpreted. */
export function t(key: string, parameters?: Record<string, string | number>): string {
  return i18n.t(key, parameters ?? {});
}

/** Subscribe the caller to language changes without replacing component instances. */
export function useTranslation(): typeof t {
  useLanguage();
  return t;
}
