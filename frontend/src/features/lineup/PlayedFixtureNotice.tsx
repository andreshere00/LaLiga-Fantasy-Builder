import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

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
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shell = document.querySelector(".app-shell");
    closeRef.current?.focus();
    if (shell instanceof HTMLElement) shell.inert = true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      event.preventDefault();
      closeRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (shell instanceof HTMLElement) shell.inert = false;
      window.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
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
    </div>,
    document.body,
  );
}
