import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { t, useTranslation } from "../../i18n";
import { useScouting } from "../scouting/ScoutingProvider";

const BELL = "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z";

/** Icon-only alerts button, always in the navbar; opens the scouting alerts from any page. */
export function NotificationsButton() {
  useTranslation();
  const { unread } = useScouting();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const open = () => {
    if (pathname.startsWith("/market")) {
      const next = new URLSearchParams(params);
      next.set("scouting", "alerts");
      setParams(next, { replace: true });
    } else navigate("/market?scouting=alerts");
  };
  const label = unread > 0 ? t("Alerts, {{0}} unread", { 0: unread }) : t("Alerts");
  return (
    <button type="button" className="nav-alerts-btn" aria-label={label} title={t("Alerts")} onClick={open}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d={BELL} /></svg>
      {unread > 0 ? <span className="nav-alerts-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span> : null}
    </button>
  );
}
