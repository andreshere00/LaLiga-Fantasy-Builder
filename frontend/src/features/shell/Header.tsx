import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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

function leagueCursorForKey(current: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return Math.min(count - 1, current + 1);
  if (key === "ArrowUp") return Math.max(0, current - 1);
  return null;
}

export function Header() {
  const { status, user, managerName, managerAvatar, notice, login, logout } = useAuth();
  const { leagues, selected, selectLeague } = useLeague();
  const profilePhotoUrl =
    managerAvatar?.trim() ||
    selected?.team?.manager?.avatar?.trim() ||
    selected?.team?.manager?.profileImage?.trim() ||
    null;
  const [openMenu, setOpenMenu] = useState<"league" | "profile" | null>(null);
  const [leagueCursor, setLeagueCursor] = useState(0);
  const leagueRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const leagueButtonRef = useRef<HTMLButtonElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const leagueOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const leagueTitleId = useId();
  const leagueNameId = useId();
  const profileTitleId = useId();
  const signedIn = status !== "signed-out" && status !== "loading";
  const canSelectLeague = leagues.length > 0;
  const selectedLeagueIndex = selected
    ? leagues.findIndex((league) => leagueId(league) === leagueId(selected))
    : -1;

  useEffect(() => {
    if (openMenu !== "league") return;
    leagueOptionRefs.current[leagueCursor]?.focus();
  }, [leagueCursor, openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenu(null);
      if (openMenu === "league") leagueButtonRef.current?.focus();
      if (openMenu === "profile") profileButtonRef.current?.focus();
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
            ref={leagueButtonRef}
            type="button"
            className="league-chip"
            aria-labelledby={leagueNameId}
            aria-expanded={openMenu === "league"}
            aria-controls={leagueTitleId}
            aria-haspopup="listbox"
            disabled={!canSelectLeague}
            onClick={() => {
              if (openMenu === "league") {
                setOpenMenu(null);
                return;
              }
              setLeagueCursor(selectedLeagueIndex < 0 ? 0 : selectedLeagueIndex);
              setOpenMenu("league");
            }}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (!canSelectLeague) return;
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              setLeagueCursor(selectedLeagueIndex < 0 ? 0 : selectedLeagueIndex);
              setOpenMenu("league");
            }}
          >
            <TrophyIcon />
            <span id={leagueNameId} className="league-name">
              {leagueLabel(selected)}
            </span>
            {canSelectLeague ? (
              <span className="league-caret" aria-hidden="true" />
            ) : null}
          </button>
          {openMenu === "league" && canSelectLeague ? (
            <ul
              className="league-menu"
              id={leagueTitleId}
              role="listbox"
              aria-labelledby={leagueNameId}
              onKeyDown={(event: KeyboardEvent<HTMLUListElement>) => {
                const next = leagueCursorForKey(leagueCursor, leagues.length, event.key);
                if (next == null) return;
                event.preventDefault();
                setLeagueCursor(next);
              }}
            >
              {leagues.map((league, index) => {
                const id = leagueId(league);
                const active = selected ? leagueId(selected) === id : false;
                return (
                  <li key={id || leagueLabel(league)}>
                    <button
                      ref={(node) => {
                        leagueOptionRefs.current[index] = node;
                      }}
                      type="button"
                      role="option"
                      tabIndex={index === leagueCursor ? 0 : -1}
                      aria-selected={active}
                      className={active ? "is-active" : undefined}
                      onClick={() => {
                        selectLeague(id);
                        setOpenMenu(null);
                        leagueButtonRef.current?.focus();
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
              ref={profileButtonRef}
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
