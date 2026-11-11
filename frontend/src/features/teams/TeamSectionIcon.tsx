import { materialIconPaths } from "../../assets/material-icons/paths";
import type { TeamSection } from "./teamRoutes";

// Football (Boxicons, 30px grid): Material Icons has no filled ball that reads at 18px.
const FOOTBALL =
  "M15 2.5C8.1125 2.5 2.5 8.1125 2.5 15C2.5 21.8875 8.1125 27.5 15 27.5C21.8875 27.5 27.5 21.8875 27.5 15C27.5 8.1125 21.8875 2.5 15 2.5ZM22.7875 21.25H20L18.4375 24.375C17.3625 24.775 16.2125 25 15 25C13.7875 25 12.6375 24.775 11.5625 24.375L10 21.25H7.2125C6.1808 19.9691 5.48097 18.4535 5.175 16.8375L7.5 13.7375L5.975 10.7C6.56283 9.46464 7.39729 8.36268 8.42701 7.46194C9.45674 6.5612 10.6599 5.88076 11.9625 5.4625L15 7.4875L18.0375 5.4625C20.675 6.3125 22.8375 8.225 24.025 10.7L22.5 13.75L24.825 16.85C24.5159 18.4589 23.821 19.9688 22.8 21.25H22.7875Z";
const BALL_CORE = "M10.625 13.75L12.5 18.75H17.5L19.375 13.75L15 10.625L10.625 13.75Z";

const SECTION_ICON: Record<TeamSection, { viewBox: string; paths: string[] }> = {
  players: { viewBox: "0 0 24 24", paths: [materialIconPaths.groups] },
  performance: { viewBox: "0 0 24 24", paths: [materialIconPaths.bar_chart] },
  lineup: { viewBox: "0 0 30 30", paths: [FOOTBALL, BALL_CORE] },
  news: { viewBox: "0 0 24 24", paths: [materialIconPaths.medical_services] },
};

/** Decorative glyph for a club section tab; the visible label carries the meaning. */
export function TeamSectionIcon({ section }: { section: TeamSection }) {
  const { viewBox, paths } = SECTION_ICON[section];
  return (
    <svg className="fb-section-tabs-icon team-section-icon" aria-hidden="true" focusable="false" viewBox={viewBox}>
      {paths.map((d) => <path key={d} d={d} fillRule="evenodd" />)}
    </svg>
  );
}
