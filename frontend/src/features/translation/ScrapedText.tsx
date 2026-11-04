import { useEffect, useRef, useState } from "react";
import { copy as localizeCopy, useLanguage } from "../../i18n";
import "./translation.css";

/** Only public FutbolFantasy prose crosses the sandbox boundary. */
export function ScrapedText({ text, textId }: { text: string; textId?: string }) {
  const selected = useLanguage();
  const [original, setOriginal] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (selected === "es") return <span id={textId} lang="es">{text}</span>;
  return <span className="scraped-text">
    {original ? <span id={textId} lang="es">{text}</span> : <VisibleReader key={`${text}|${attempt}`} text={text} textId={textId} />}
    <span className="scraped-text-controls">
      <button type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); setOriginal(!original); }}>
        {localizeCopy(original ? "Translate to English" : "Show original")}
      </button>
      {!original && <button type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); setAttempt(attempt + 1); }}>{localizeCopy("Retry translation")}</button>}
      <a href="https://gtranslate.io/" target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>GTranslate</a>
    </span>
  </span>;
}
/** Start the vendor timeout only when the public report approaches the viewport. */
function VisibleReader(props: { text: string; textId?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "200px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return <span ref={host}>{visible ? <Reader {...props} /> : <span id={props.textId} lang="es">{props.text}</span>}</span>;
}
function Reader({ text, textId }: { text: string; textId?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const host = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{ text: string; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const channel = useRef(crypto.randomUUID());
  useEffect(() => {
    const timer = window.setTimeout(() => setFailed(true), 15000);
    const receive = (event: MessageEvent) => {
      const value = event.data;
      if (event.source !== frame.current?.contentWindow || !value ||
        value.type !== "lfb-translation-result" || value.channel !== channel.current) return;
      if (value.state === "error") { clearTimeout(timer); setFailed(true); }
      if (value.state === "translated" && typeof value.text === "string" && value.text.length <= 100000 &&
        typeof value.height === "number" && Number.isFinite(value.height)) {
        clearTimeout(timer); setResult({ text: value.text, height: Math.min(10000, Math.max(16, value.height)) });
      }
      if (value.state === "size" && typeof value.height === "number" && Number.isFinite(value.height)) {
        setResult(current => current ? { ...current, height: Math.min(10000, Math.max(16, value.height)) } : null);
      }
    };
    window.addEventListener("message", receive);
    return () => { clearTimeout(timer); window.removeEventListener("message", receive); };
  }, []);
  const ready = () => {
    if (!host.current) return;
    const computed = getComputedStyle(host.current);
    const style = Object.fromEntries(["fontFamily", "fontSize", "fontWeight", "lineHeight", "color", "letterSpacing"]
      .map(key => [key, computed[key as keyof CSSStyleDeclaration]]));
    frame.current?.contentWindow?.postMessage({ type: "lfb-translate", channel: channel.current, text, style }, "*");
  };
  return <span ref={host} className="translation-reader" lang={result && !failed ? "en" : "es"}>
    <span id={textId}>{result && !failed ? result.text : text}</span>
    {!failed && !result && <iframe ref={frame} title={localizeCopy("Automatic translation")} aria-hidden="true" tabIndex={-1}
      sandbox="allow-scripts" src="/translation-reader.html" onLoad={ready}
      style={{ height: 32, position: "absolute", opacity: 0 }} />}
    <span className="translation-reader-status" lang="en">{localizeCopy(failed ? "Translation unavailable. Original Spanish shown." : result ? "Automatically translated" : "Automatic translation requested")}</span>
  </span>;
}
