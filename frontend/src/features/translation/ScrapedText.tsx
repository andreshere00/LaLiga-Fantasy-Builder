import { useEffect, useRef, useState } from "react";
import { t, useLanguage } from "../../i18n";
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
        {original ? t("Translate to English") : t("Show original")}
      </button>
      {!original && <button type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); setAttempt(attempt + 1); }}>{t("Retry translation")}</button>}
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
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const channel = useRef(crypto.randomUUID());
  useEffect(() => {
    const timer = window.setTimeout(() => setFailed(true), 15000);
    const receive = (event: MessageEvent) => {
      const value = event.data;
      if (event.source !== frame.current?.contentWindow || !value ||
        value.type !== "lfb-translation-result" || value.channel !== channel.current) return;
      if (value.state === "error") { clearTimeout(timer); setFailed(true); }
      if (value.state === "translated" && typeof value.text === "string" && value.text.length <= 100000) {
        clearTimeout(timer); setResult(value.text);
      }
    };
    window.addEventListener("message", receive);
    return () => { clearTimeout(timer); window.removeEventListener("message", receive); };
  }, []);
  const ready = () => {
    frame.current?.contentWindow?.postMessage({ type: "lfb-translate", channel: channel.current, text }, "*");
  };
  return <span className="translation-reader" lang={result !== null && !failed ? "en" : "es"}>
    <span id={textId}>{result !== null && !failed ? result : text}</span>
    {!failed && result === null && <iframe ref={frame} title={t("Automatic translation")} aria-hidden="true" tabIndex={-1}
      sandbox="allow-scripts" src="/translation-reader.html" onLoad={ready}
      style={{ height: 32, position: "absolute", opacity: 0 }} />}
    <span className="translation-reader-status" lang="en">{failed ? t("Translation unavailable. Original Spanish shown.") : result !== null ? t("Automatically translated") : t("Automatic translation requested")}</span>
  </span>;
}
