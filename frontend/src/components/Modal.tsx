import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import "./Modal.css";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
};

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  closeOnBackdrop = true,
}: ModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shell = document.querySelector(".app-shell");
    const focusTarget =
      closeRef.current ??
      cardRef.current?.querySelector<HTMLElement>(
        ".modal-body input, .modal-body textarea, .modal-body select, .modal-body button, .modal-footer button, .modal-close",
      );
    focusTarget?.focus();
    if (shell instanceof HTMLElement) shell.inert = true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
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
    <div
      className="modal-backdrop"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        ref={cardRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        <div className="modal-body">{children}</div>
        {footer ? (
          <div className="modal-footer">{footer}</div>
        ) : (
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            onClick={onClose}
          >
            OK
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
