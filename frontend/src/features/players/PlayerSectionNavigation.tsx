import { t, useTranslation } from "../../i18n";
import { useEffect, useRef, useState } from "react";
import { materialIconPaths } from "../../assets/material-icons/paths";

type SectionLink = { id: string; label: string; icon: string; needs?: "detail" | "radar" };

const SECTIONS: readonly SectionLink[] = [
  { id: "player-overview", label: "Overview", icon: materialIconPaths.account_circle },
  { id: "player-radar-title", label: "Performance profile", icon: materialIconPaths.bar_chart, needs: "radar" },
  { id: "player-form-title", label: "Form", icon: materialIconPaths.trending_up },
  { id: "player-market-title", label: "Market value", icon: materialIconPaths.euro_symbol },
  { id: "player-matches-title", label: "Matches", icon: materialIconPaths.event, needs: "detail" },
  { id: "player-fantasy-title", label: "News & injuries", icon: materialIconPaths.assignment, needs: "detail" },
];

/** Native section links retain heading focus and track the current reading position. */
export function PlayerSectionNavigation({ detailReady, radar = false }: { detailReady: boolean; radar?: boolean }) {
  useTranslation();
  const navigation = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<string>(SECTIONS[0].id);
  // The radar hides itself when nothing is published, so its link follows its heading.
  const [radarShown, setRadarShown] = useState(false);
  const sections = SECTIONS.filter(({ needs }) =>
    needs == null || (needs === "detail" ? detailReady : radar && radarShown));
  const sectionKey = SECTIONS.filter(({ needs }) =>
    needs !== "detail" || detailReady).map(({ id }) => id).join(" ");

  useEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    const header = document.querySelector(".app-header");
    let frame: number | null = null;

    const update = () => {
      frame = null;
      const headings = sectionKey.split(" ")
        .map((id) => document.getElementById(id))
        .filter((heading): heading is HTMLElement => heading != null);
      setRadarShown(headings.some((heading) => heading.id === "player-radar-title"));
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
    const mutations = new MutationObserver(schedule);
    if (profile) mutations.observe(profile, { childList: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    schedule();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [sectionKey]);

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
    <nav ref={navigation} className="fb-section-tabs player-detail-sections" aria-label={t("Player sections")}>
      {sections.map(({ id, label, icon }) => (
        <a key={id} href={`#${id}`} aria-current={current === id ? "location" : undefined}>
          <svg className="fb-section-tabs-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d={icon} />
          </svg>
          {t(label)}
        </a>
      ))}
    </nav>
  );
}
