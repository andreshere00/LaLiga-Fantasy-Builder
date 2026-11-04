import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "../../i18n";
import { ScrapedText } from "./ScrapedText";

let reveal: IntersectionObserverCallback;
beforeEach(() => {
  void i18n.changeLanguage("en");
  const windows = new WeakMap<HTMLIFrameElement, Window>();
  vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function (this: HTMLIFrameElement) {
    if (!windows.has(this)) windows.set(this, { postMessage: vi.fn() } as unknown as Window);
    return windows.get(this)!;
  });
  const logError = console.error;
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("Iframe page loading is disabled")) logError(...args);
  });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { reveal = callback; }
    observe() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function start() {
  act(() => reveal([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
  const frame = screen.getByTitle("Automatic translation") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  fireEvent.load(frame);
  const request = post.mock.calls.at(-1)![0] as { channel: string; text: string };
  return { frame, request };
}
function receive(frame: HTMLIFrameElement, data: object, source = frame.contentWindow) {
  act(() => window.dispatchEvent(new MessageEvent("message", { source,
    data: { type: "lfb-translation-result", ...data } })));
}

it("defers vendor loading and accepts translated text without sizing metadata", () => {
  render(<ScrapedText text="Lesión muscular" />);
  expect(screen.queryByTitle("Automatic translation")).toBeNull();
  const { frame, request } = start();
  expect(request.text).toBe("Lesión muscular");
  expect(request).not.toHaveProperty("style");
  receive(frame, { channel: request.channel, state: "translated", text: "Muscle injury" }, window);
  receive(frame, { channel: "stale", state: "translated", text: "Wrong text" });
  expect(screen.queryByText("Muscle injury")).toBeNull();
  expect(screen.queryByText("Wrong text")).toBeNull();
  receive(frame, { channel: request.channel, state: "translated", text: "Muscle injury" });
  expect(screen.getByText("Muscle injury")).toBeTruthy();
  expect(screen.getByText("Automatically translated")).toBeTruthy();
  expect(screen.queryByTitle("Automatic translation")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show original" }));
  expect(screen.getByText("Lesión muscular")).toBeTruthy();
});

it.each(["blocked", "timeout"])("preserves the original after %s and retries with a fresh channel", mode => {
  vi.useFakeTimers();
  render(<ScrapedText text="Lesión muscular" />);
  const old = start();
  if (mode === "blocked") receive(old.frame, { channel: old.request.channel, state: "error" });
  else act(() => vi.advanceTimersByTime(15000));
  expect(screen.getByText("Translation unavailable. Original Spanish shown.")).toBeTruthy();
  expect(screen.getByText("Lesión muscular")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry translation" }));
  const next = start();
  expect(next.request.channel).not.toBe(old.request.channel);
  receive(next.frame, { channel: old.request.channel, state: "translated", text: "Old result" });
  expect(screen.queryByText("Old result")).toBeNull();
  receive(next.frame, { channel: next.request.channel, state: "translated", text: "Recovered" });
  expect(screen.getByText("Recovered")).toBeTruthy();
});

it("keeps Spanish prose in the parent document without loading the vendor", () => {
  void i18n.changeLanguage("es");
  render(<ScrapedText text="Lesión muscular" />);
  expect(screen.getByText("Lesión muscular").getAttribute("lang")).toBe("es");
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByTitle("Automatic translation")).toBeNull();
});
