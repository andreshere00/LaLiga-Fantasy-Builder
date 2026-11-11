import { t, useTranslation } from "../../i18n";
import { LanguageSelector } from "./LanguageSelector";
import { ThemeToggle } from "./ThemeToggle";
import { Select } from "@base-ui/react/select";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { useRoutePrefetch } from "../../app/useRoutePrefetch";
import { leagueId, leagueLabel } from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import { Dialog } from "../../components/ui/Dialog";
import { useLeague } from "../lineup/LeagueProvider";
import { NavIcon, PersonIcon } from "./icons";
import { ScoutingDialog } from "../scouting/ScoutingPanel";
import { NotificationsButton } from "./NotificationsButton";
import { ProfilePhoto } from "./ProfilePhoto";
import { materialIconPaths } from "../../assets/material-icons/paths";
import "./Header.css";

const LOGOUT_ICON = "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z";

export function Header() {
  useTranslation();
  const headerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    const previousHeight = root.style.getPropertyValue("--app-header-height");
    const updateHeight = () => root.style.setProperty("--app-header-height", `${header.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => {
      observer.disconnect();
      if (previousHeight) root.style.setProperty("--app-header-height", previousHeight);
      else root.style.removeProperty("--app-header-height");
    };
  }, []);
  const { status, user, managerName, managerAvatar, notice, login, logout } = useAuth();
  const { leagues, selected, selectLeague } = useLeague();
  const [profileOpen, setProfileOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const prefetchHandlers = useRoutePrefetch();
  const signedIn = status !== "signed-out" && status !== "loading";
  const [params, setParams] = useSearchParams();
  // The scouting dialog only exists for signed-in users: a shared `?scouting=` link must not
  // linger in the URL and pop the sheet open after the next login.
  useEffect(() => {
    if (status !== "signed-out" || !params.has("scouting")) return;
    const next = new URLSearchParams(params);
    next.delete("scouting"); next.delete("scoutingQuery"); next.delete("scoutingFilter");
    setParams(next, { replace: true });
  }, [status, params, setParams]);
  const profilePhotoUrl = managerAvatar?.trim() || selected?.team?.manager?.avatar?.trim()
    || selected?.team?.manager?.profileImage?.trim() || null;
  const items = leagues.map((league) => ({ value: leagueId(league), label: leagueLabel(league) }));
  return (
    <header className="app-header" ref={headerRef}>
      <div className="header-content">
        <Link to="/" className="brand-bar">
          <img src="/favicon.png" className="brand-logo" alt="" />
          <span>{t("LALIGA Fantasy Builder")}</span>
        </Link>
        <nav className="nav-tabs" aria-label={t("Sections")}>
          <NavLink to="/" end className="nav-tab"><NavIcon name="lineup" /><span>{t("Lineup")}</span></NavLink>
          <NavLink to="/market" className="nav-tab" {...prefetchHandlers("/market")}><NavIcon name="market" /><span>{t("Market")}</span></NavLink>
          <NavLink to="/players" className="nav-tab" {...prefetchHandlers("/players")}><NavIcon name="players" /><span>{t("Players")}</span></NavLink>
          <NavLink to="/teams" className="nav-tab" {...prefetchHandlers("/teams")}><NavIcon name="teams" /><span>{t("Teams")}</span></NavLink>
        </nav>
        <div className={`nav-actions${optionsOpen ? " is-open" : ""}`}>
          {signedIn ? <><NotificationsButton /><ScoutingDialog /></> : null}
          <button
            type="button"
            className="nav-options-trigger"
            aria-label={t("Open settings and account options")}
            aria-expanded={optionsOpen}
            aria-controls="nav-actions-panel"
            onClick={() => setOptionsOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>{t("Options")}</span>
          </button>
          <div className="nav-actions-panel" id="nav-actions-panel">
            <section className="nav-group" aria-labelledby="nav-group-preferences">
              <h2 className="nav-group-title" id="nav-group-preferences">{t("Preferences")}</h2>
              <div className="appearance-controls"><LanguageSelector /><ThemeToggle /></div>
            </section>
            <section className="nav-group" aria-labelledby="nav-group-league">
              <h2 className="nav-group-title" id="nav-group-league">{t("League")}</h2>
            <Select.Root items={items} value={selected ? leagueId(selected) : null}
              onValueChange={(value) => { if (value) selectLeague(value); }}
              disabled={leagues.length === 0}>
              <Select.Trigger className="league-chip" aria-label={t("League")}>
                <Select.Value placeholder={t("No league")} />
                <Select.Icon className="league-chip-icon" aria-hidden="true">
                  <svg viewBox="0 0 18 18">
                    <path d="m4 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner sideOffset={4} className="fb-select-positioner">
                  <Select.Popup className="fb-selection-popup">
                    <Select.List>
                      {items.map((item) => (
                        <Select.Item key={item.value} value={item.value} className="fb-item">
                          <Select.ItemText>{item.label}</Select.ItemText>
                          <Select.ItemIndicator aria-hidden="true">✓</Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.List>
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
            </section>
            <section className="nav-group nav-group--list" aria-labelledby="nav-group-account">
              <h2 className="nav-group-title" id="nav-group-account">{t("Account")}</h2>
            <button type="button" className="profile-btn" aria-haspopup="dialog"
              aria-expanded={profileOpen} onClick={() => setProfileOpen(true)}>
              <span className="nav-row-icon" aria-hidden="true">
                <ProfilePhoto url={profilePhotoUrl} className="profile-btn-avatar" fallback={<PersonIcon />} />
              </span>
              <span className="nav-row-label">{t("Profile")}</span>
              <svg className="nav-row-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d={materialIconPaths.chevron_right} />
              </svg>
            </button>
            <button type="button" className="logout-btn" disabled={status === "loading"}
              onClick={signedIn ? () => void logout() : login}>
              <span className="nav-row-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false"><path d={LOGOUT_ICON} /></svg>
              </span>
              <span className="nav-row-label">{signedIn ? t("Log out") : t("Log in")}</span>
            </button>
            </section>
          </div>
        </div>
      </div>
      <Dialog open={profileOpen} title={t("Profile")} onClose={() => setProfileOpen(false)}>
        <p className="profile-name">{user?.name?.trim() || t("Not signed in")}</p>
        {user?.email ? <p>{user.email}</p> : null}
        {user ? <Link to="/account" onClick={() => setProfileOpen(false)}>{t("Account settings")}</Link> : null}
        {managerName ? <p>{managerName}</p> : null}
      </Dialog>
      {notice ? <p className="notice" role="status">{t(notice)}</p> : null}
    </header>
  );
}
