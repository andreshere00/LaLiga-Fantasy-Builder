import { useEffect, useId, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { leagueId, leagueLabel } from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import lineupActive from "../../assets/button_lineup_red_bold.svg";
import lineupIdle from "../../assets/button_lineup_gray.svg";
import marketActive from "../../assets/button_market_red.svg";
import marketIdle from "../../assets/button_market_gray.svg";
import { useLeague } from "../lineup/LeagueProvider";
import { PersonIcon, TrophyIcon } from "./icons";
import "./Header.css";

export function Header() {
  const { status, user, managerName, notice, login, logout } = useAuth();
  const { leagues, selected, selectLeague } = useLeague();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileTitleId = useId();
  const signedIn = status !== "signed-out" && status !== "loading";

  useEffect(() => {
    if (!profileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const root = profileRef.current;
      if (root && !root.contains(event.target as Node)) setProfileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [profileOpen]);

  return (
    <header className="app-header">
      <div className="brand-bar">LALIGA Fantasy Builder</div>
      <div className="nav-bar">
        <div className="league-chip">
          <TrophyIcon />
          {leagues.length > 1 ? (
            <select
              className="league-select"
              aria-label="League"
              value={selected ? leagueId(selected) : ""}
              onChange={(event) => selectLeague(event.target.value)}
            >
              {leagues.map((league) => (
                <option key={leagueId(league)} value={leagueId(league)}>
                  {leagueLabel(league)}
                </option>
              ))}
            </select>
          ) : (
            <span className="league-name">{leagueLabel(selected)}</span>
          )}
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
              aria-expanded={profileOpen}
              aria-controls={profileTitleId}
              onClick={() => setProfileOpen((open) => !open)}
            >
              <PersonIcon />
              Profile
            </button>
            {profileOpen ? (
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
