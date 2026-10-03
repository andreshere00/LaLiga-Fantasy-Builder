import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
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
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const releaseFocusTrap = () => {
    const shell = shellRef.current;
    if (shell?.isConnected) shell.inert = false;
    shellRef.current = null;
    const previous = previousFocusRef.current;
    previousFocusRef.current = null;
    if (previous?.isConnected) previous.focus();
  };

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shell = document.querySelector(".app-shell");
    shellRef.current = shell instanceof HTMLElement ? shell : null;
    if (shellRef.current) shellRef.current.inert = true;
    const focusTarget =
      closeRef.current ??
      cardRef.current?.querySelector<HTMLElement>(
        ".modal-body input, .modal-body textarea, .modal-body select, .modal-body button, .modal-footer button, .modal-close",
      );
    focusTarget?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => () => releaseFocusTrap(), []);

  return createPortal(
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <AnimatePresence onExitComplete={releaseFocusTrap}>
          {open ? (
            <m.div
              key="modal"
              className="modal-backdrop"
              onClick={closeOnBackdrop ? onClose : undefined}
              role="presentation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.14 } }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <m.div
                ref={cardRef}
                className="modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(event) => event.stopPropagation()}
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
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
              </m.div>
            </m.div>
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>,
    document.body,
  );
}
