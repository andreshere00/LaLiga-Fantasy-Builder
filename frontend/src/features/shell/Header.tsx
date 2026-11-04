import { copy as localizeCopy, useLanguage } from "../../i18n";
import { LanguageSelector } from "./LanguageSelector";
import { ThemeToggle } from "./ThemeToggle";
import { Select } from "@base-ui/react/select";
import { useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { leagueId, leagueLabel } from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import { Dialog } from "../../components/ui/Dialog";
import { useLeague } from "../lineup/LeagueProvider";
import { PersonIcon } from "./icons";
import { ProfilePhoto } from "./ProfilePhoto";
import "./Header.css";

export function Header() {
  useLanguage();
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
  const signedIn = status !== "signed-out" && status !== "loading";
  const profilePhotoUrl = managerAvatar?.trim() || selected?.team?.manager?.avatar?.trim()
    || selected?.team?.manager?.profileImage?.trim() || null;
  const items = leagues.map((league) => ({ value: leagueId(league), label: leagueLabel(league) }));
  return (
    <header className="app-header" ref={headerRef}>
      <div className="header-content">
        <Link to="/" className="brand-bar">
          <img src="/favicon.png" className="brand-logo" alt="" />
          <span>{localizeCopy("LALIGA Fantasy Builder")}</span>
        </Link>
        <nav className="nav-tabs" aria-label={localizeCopy("Sections")}>
          <NavLink to="/" end className="nav-tab">{localizeCopy("Lineup")}</NavLink>
          <NavLink to="/market" className="nav-tab">{localizeCopy("Market")}</NavLink>
          <NavLink to="/players" className="nav-tab">{localizeCopy("Players")}</NavLink>
        </nav>
        <div className={`nav-actions${optionsOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="nav-options-trigger"
            aria-label={localizeCopy("Open settings and account options")}
            aria-expanded={optionsOpen}
            aria-controls="nav-actions-panel"
            onClick={() => setOptionsOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>{localizeCopy("Options")}</span>
          </button>
          <div className="nav-actions-panel" id="nav-actions-panel">
            <div className="appearance-controls"><LanguageSelector /><ThemeToggle /></div>
            <Select.Root items={items} value={selected ? leagueId(selected) : null}
              onValueChange={(value) => { if (value) selectLeague(value); }}
              disabled={leagues.length === 0}>
              <Select.Trigger className="league-chip" aria-label={localizeCopy("League")}>
                <Select.Value placeholder={localizeCopy("No league")} />
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
            <button type="button" className="logout-btn" disabled={status === "loading"}
              onClick={signedIn ? () => void logout() : login}>
              {localizeCopy(signedIn ? "Log out" : "Log in")}
            </button>
            <button type="button" className="profile-btn" aria-haspopup="dialog"
              aria-expanded={profileOpen} onClick={() => setProfileOpen(true)}>
              <ProfilePhoto url={profilePhotoUrl} className="profile-btn-avatar" fallback={<PersonIcon />} />
              {localizeCopy("Profile")}</button>
          </div>
        </div>
      </div>
      <Dialog open={profileOpen} title={localizeCopy("Profile")} onClose={() => setProfileOpen(false)}>
        <p className="profile-name">{user?.name?.trim() || localizeCopy("Not signed in")}</p>
        {user?.email ? <p>{localizeCopy(user.email)}</p> : null}
        {user ? <Link to="/account" onClick={() => setProfileOpen(false)}>{localizeCopy("Account settings")}</Link> : null}
        {managerName ? <p>{managerName}</p> : null}
      </Dialog>
      {notice ? <p className="notice" role="status">{localizeCopy(notice)}</p> : null}
    </header>
  );
}
