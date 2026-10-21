import { Dialog as Primitive } from "@base-ui/react/dialog";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "./Button";

type DialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  initialFocus?: ComponentProps<typeof Primitive.Popup>["initialFocus"];
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  layout?: "dialog" | "sheet";
  className?: string;
  finalFocus?: () => HTMLElement | false;
  onOpenChangeComplete?: (open: boolean) => void;
};

/** Accessible controlled dialog; sheet layout becomes a bottom panel on mobile. */
export function Dialog({
  open, title, onClose, children, footer, closeOnBackdrop = true, layout = "dialog", className = "",
  finalFocus, onOpenChangeComplete, description, initialFocus, busy = false,
}: DialogProps) {
  return (
    <Primitive.Root open={open} disablePointerDismissal={busy || !closeOnBackdrop}
      onOpenChangeComplete={onOpenChangeComplete}
      onOpenChange={(next, details) => {
        if (!next) {
          if (busy) details.cancel();
          else onClose();
        }
      }}>
      <Primitive.Portal>
        <Primitive.Backdrop className="fb-dialog-backdrop" />
        <Primitive.Viewport className={"fb-dialog-viewport fb-dialog-viewport--" + layout}>
          <Primitive.Popup className={"fb-dialog fb-dialog--" + layout + " " + className}
            aria-busy={busy || undefined} initialFocus={initialFocus} finalFocus={finalFocus}>
            <header className="fb-dialog-heading">
              <Primitive.Title className="fb-section-title">{title}</Primitive.Title>
              <Primitive.Close disabled={busy || !closeOnBackdrop} render={<Button variant="ghost" shape="square" size="icon"
                aria-label="Close dialog" />}>×</Primitive.Close>
            </header>
            <div className="modal-body fb-dialog-body">
              {description ? <Primitive.Description className="fb-dialog-description">
                {description}
              </Primitive.Description> : null}
              {children}
            </div>
            <footer className="modal-footer fb-dialog-footer">
              {footer ?? <Primitive.Close disabled={busy} render={<Button />}>Close</Primitive.Close>}
            </footer>
          </Primitive.Popup>
        </Primitive.Viewport>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
