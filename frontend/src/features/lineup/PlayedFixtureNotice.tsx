import { useEffect, useId, useRef } from "react";

import { PAST_FIXTURE_LOCKED_MESSAGE } from "./lineupMessages";

type PlayedFixtureNoticeProps = {
  open: boolean;
  onClose: () => void;
};

export function PlayedFixtureNotice({ open, onClose }: PlayedFixtureNoticeProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="played-fixture-notice" onClick={onClose}>
      <div
        className="played-fixture-notice-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="played-fixture-notice-title">
          Lineup locked
        </h2>
        <p className="played-fixture-notice-body">{PAST_FIXTURE_LOCKED_MESSAGE}</p>
        <button
          ref={closeRef}
          type="button"
          className="played-fixture-notice-close"
          onClick={onClose}
        >
          OK
        </button>
      </div>
    </div>
  );
}
