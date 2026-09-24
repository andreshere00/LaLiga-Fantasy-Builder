import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { leagueId, leagueLabel } from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import lineupActive from "../../assets/nav_tab_lineup_active.svg";
import lineupIdle from "../../assets/nav_tab_lineup.svg";
import marketActive from "../../assets/nav_tab_market_active.svg";
import marketIdle from "../../assets/nav_tab_market.svg";
import { useLeague } from "../lineup/LeagueProvider";
import { PersonIcon, TrophyIcon } from "./icons";
import { ProfilePhoto } from "./ProfilePhoto";
import "./Header.css";

export function Header() {
  const { status, user, managerName, managerAvatar, notice, login, logout } = useAuth();
  const { leagues, selected, selectLeague } = useLeague();
  const profilePhotoUrl =
    managerAvatar?.trim() ||
    selected?.team?.manager?.avatar?.trim() ||
    selected?.team?.manager?.profileImage?.trim() ||
    null;
  const [openMenu, setOpenMenu] = useState<"league" | "profile" | null>(null);
  const leagueRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const leagueTitleId = useId();
  const profileTitleId = useId();
  const signedIn = status !== "signed-out" && status !== "loading";
  const canSelectLeague = leagues.length > 0;

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const root = openMenu === "league" ? leagueRef.current : profileRef.current;
      if (root && !root.contains(event.target as Node)) setOpenMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openMenu]);

  return (
    <header className="app-header">
      <Link to="/" className="brand-bar">
        LALIGA Fantasy Builder
      </Link>
      <div className="nav-bar">
        <div className="league-wrap" ref={leagueRef}>
          <button
            type="button"
            className="league-chip"
            aria-label="League"
            aria-expanded={openMenu === "league"}
            aria-controls={leagueTitleId}
            aria-haspopup="listbox"
            disabled={!canSelectLeague}
            onClick={() =>
              setOpenMenu((current) => (current === "league" ? null : "league"))
            }
          >
            <TrophyIcon />
            <span className="league-name">{leagueLabel(selected)}</span>
            {canSelectLeague ? (
              <span className="league-caret" aria-hidden="true" />
            ) : null}
          </button>
          {openMenu === "league" && canSelectLeague ? (
            <ul className="league-menu" id={leagueTitleId} role="listbox">
              {leagues.map((league) => {
                const id = leagueId(league);
                const active = selected ? leagueId(selected) === id : false;
                return (
                  <li key={id || leagueLabel(league)}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={active ? "is-active" : undefined}
                      onClick={() => {
                        selectLeague(id);
                        setOpenMenu(null);
                      }}
                    >
                      {leagueLabel(league)}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <nav className="nav-tabs" aria-label="Sections">
          <NavLink to="/" end className="nav-tab">
            {({ isActive }) => (
              <>
                <span className="nav-tab-icon-wrap" aria-hidden="true">
                  <img src={isActive ? lineupActive : lineupIdle} alt="" />
                </span>
                <span className="nav-tab-label">Lineup</span>
              </>
            )}
          </NavLink>
          <NavLink to="/market" className="nav-tab">
            {({ isActive }) => (
              <>
                <span className="nav-tab-icon-wrap" aria-hidden="true">
                  <img src={isActive ? marketActive : marketIdle} alt="" />
                </span>
                <span className="nav-tab-label">Market</span>
              </>
            )}
          </NavLink>
        </nav>
        <div className="nav-actions">
          {signedIn ? (
            <button type="button" className="logout-btn" onClick={() => void logout()}>
              Log out
            </button>
          ) : (
            <button
              type="button"
              className="logout-btn"
              onClick={login}
              disabled={status === "loading"}
            >
              Log in
            </button>
          )}
          <div className="profile-wrap" ref={profileRef}>
            <button
              type="button"
              className="profile-btn"
              aria-expanded={openMenu === "profile"}
              aria-controls={profileTitleId}
              onClick={() =>
                setOpenMenu((current) => (current === "profile" ? null : "profile"))
              }
            >
              <ProfilePhoto
                url={profilePhotoUrl}
                className="profile-btn-avatar"
                fallback={<PersonIcon />}
              />
              Profile
            </button>
            {openMenu === "profile" ? (
              <div className="profile-panel" id={profileTitleId}>
                <p className="profile-name">{user?.name?.trim() || "Not signed in"}</p>
                {user?.email ? <p>{user.email}</p> : null}
                {managerName ? <p>{managerName}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
    </header>
  );
}
