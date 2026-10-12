import { Toast } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import { Button } from "./Button";

const manager = Toast.createToastManager();

/** Call only after a confirmed response; stable IDs deduplicate repeated errors. */
export function notify(title: string, type: "success" | "error" = "success") {
  manager.add({ id: type + ":" + title, title, type,
    timeout: type === "error" ? 0 : 5000, priority: type === "error" ? "high" : "low" });
}

function NotificationList() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="fb-toast-viewport">
        {toasts.map((toast) => (
          <Toast.Root key={toast.id} toast={toast} className="fb-toast" data-tone={toast.type}>
            <Toast.Content>
              <Toast.Title className="fb-toast-title" />
              <Toast.Description />
            </Toast.Content>
            <Toast.Close render={<Button variant="ghost" shape="square" size="icon"
              aria-label="Dismiss notification" />}>×</Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export function Notifications({ children }: { children: ReactNode }) {
  return <Toast.Provider toastManager={manager}>{children}<NotificationList /></Toast.Provider>;
}
