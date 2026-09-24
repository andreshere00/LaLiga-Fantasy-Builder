export function TrophyIcon() {
  return (
    <svg className="trophy" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d={[
          "M7 3h10v2h3v3a5 5 0 0 1-4 4.9A5 5 0 0 1 13 16.9V19h3v2",
          "H8v-2h3v-2.1A5 5 0 0 1 8 12.9 5 5 0 0 1 4 8V5h3V3z",
          "m0 4H6v1a3 3 0 0 0 2.2 2.9A5 5 0 0 1 7 8V7z",
          "m10 0v1a5 5 0 0 1-1.2 2.9A3 3 0 0 0 18 8V7h-1z",
        ].join("")}
      />
    </svg>
  );
}

export function WarningIcon() {
  return (
    <svg className="warning-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
      />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
      />
    </svg>
  );
}

export function PersonIcon() {
  return (
    <svg className="person" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d={[
          "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z",
          "m0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z",
        ].join("")}
      />
    </svg>
  );
}
