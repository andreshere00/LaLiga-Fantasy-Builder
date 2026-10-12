import { Dialog as Primitive } from "@base-ui/react/dialog";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  layout?: "dialog" | "sheet";
};

/** Accessible controlled dialog; sheet layout becomes a bottom panel on mobile. */
export function Dialog({
  open, title, onClose, children, footer, closeOnBackdrop = true, layout = "dialog",
}: DialogProps) {
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) {
      previousFocus.current = document.activeElement;
    }
  }, [open]);
  return (
    <Primitive.Root open={open} disablePointerDismissal={!closeOnBackdrop}
      onOpenChange={(next) => { if (!next) onClose(); }}>
      <Primitive.Portal>
        <Primitive.Backdrop className="fb-dialog-backdrop" />
        <Primitive.Viewport className={"fb-dialog-viewport fb-dialog-viewport--" + layout}>
          <Primitive.Popup className={"fb-dialog fb-dialog--" + layout}
            finalFocus={() => previousFocus.current?.isConnected ? previousFocus.current : false}>
            <header className="fb-dialog-heading">
              <Primitive.Title className="fb-section-title">{title}</Primitive.Title>
              <Primitive.Close disabled={!closeOnBackdrop} render={<Button variant="ghost" shape="square" size="icon"
                aria-label="Close dialog" />}>×</Primitive.Close>
            </header>
            <div className="modal-body fb-dialog-body">{children}</div>
            <footer className="modal-footer fb-dialog-footer">
              {footer ?? <Primitive.Close render={<Button />}>OK</Primitive.Close>}
            </footer>
          </Primitive.Popup>
        </Primitive.Viewport>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
