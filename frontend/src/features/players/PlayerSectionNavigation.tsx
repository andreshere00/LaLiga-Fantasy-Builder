import { useEffect, useRef, useState } from "react";
import { materialIconPaths } from "../../assets/material-icons/paths";

const SECTIONS = [
  { id: "player-overview", label: "Overview", icon: materialIconPaths.account_circle },
  { id: "player-form-title", label: "Form", icon: materialIconPaths.trending_up },
  { id: "player-market-title", label: "Market value", icon: materialIconPaths.euro_symbol },
  { id: "player-matches-title", label: "Matches", icon: materialIconPaths.event },
  { id: "player-fantasy-title", label: "News & injuries", icon: materialIconPaths.assignment },
] as const;

/** Native section links retain heading focus and track the current reading position. */
export function PlayerSectionNavigation({ detailReady }: { detailReady: boolean }) {
  const navigation = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<string>(SECTIONS[0].id);
  const sections = detailReady ? SECTIONS : SECTIONS.slice(0, 3);

  useEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    const headings = (detailReady ? SECTIONS : SECTIONS.slice(0, 3))
      .map(({ id }) => document.getElementById(id))
      .filter((heading): heading is HTMLElement => heading != null);
    const header = document.querySelector(".app-header");
    let frame: number | null = null;

    const update = () => {
      frame = null;
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const navHeight = getComputedStyle(nav).position === "sticky" ? nav.offsetHeight : 0;
      const scrollPadding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const threshold = Math.max(scrollPadding, headerHeight + navHeight) + 24;
      let active: HTMLElement | undefined = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= threshold) active = heading;
      }
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2) active = headings.at(-1);
      if (active) setCurrent(active.id);
    };
    const schedule = () => { if (frame == null) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    resize.observe(nav);
    if (header) resize.observe(header);
    const profile = nav.closest(".player-detail-page");
    if (profile) resize.observe(profile);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    schedule();
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [detailReady]);

  useEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    const reveal = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="location"]');
      if (!active || nav.scrollWidth <= nav.clientWidth) return;
      const viewport = nav.getBoundingClientRect();
      const link = active.getBoundingClientRect();
      if (link.left < viewport.left || link.right > viewport.right) {
        nav.scrollBy({ left: (link.left + link.right - viewport.left - viewport.right) / 2 });
      }
    };
    const resize = new ResizeObserver(reveal);
    resize.observe(nav);
    reveal();
    return () => resize.disconnect();
  }, [current]);

  return (
    <nav ref={navigation} className="player-detail-sections" aria-label="Player sections">
      {sections.map(({ id, label, icon }) => (
        <a key={id} href={`#${id}`} aria-current={current === id ? "location" : undefined}>
          <svg className="player-section-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d={icon} />
          </svg>
          {label}
        </a>
      ))}
    </nav>
  );
}
