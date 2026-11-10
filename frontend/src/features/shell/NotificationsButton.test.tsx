import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { NotificationsButton } from "./NotificationsButton";

const scouting = vi.hoisted(() => ({ unread: 0 }));
vi.mock("../scouting/ScoutingProvider", () => ({ useScouting: () => scouting }));

afterEach(cleanup);

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p>; }
function setup(path: string) {
  render(<MemoryRouter initialEntries={[path]}><NotificationsButton /><Where /></MemoryRouter>);
}

describe("NotificationsButton", () => {
  it("button_noUnread_isIconOnlyWithPlainName", () => {
    scouting.unread = 0;
    setup("/");
    const button = screen.getByRole("button", { name: "Alerts" });
    expect(button.textContent).toBe("");
  });

  it("button_unread_announcesCountAndShowsBadge", () => {
    scouting.unread = 12;
    setup("/");
    const button = screen.getByRole("button", { name: "Alerts, 12 unread" });
    expect(button.textContent).toBe("9+");
  });

  it("click_anyPage_staysOnPageAndAddsAlertsParam", () => {
    scouting.unread = 0;
    setup("/players?q=a");
    fireEvent.click(screen.getByRole("button", { name: "Alerts" }));
    expect(screen.getByTestId("where").textContent).toBe("/players?q=a&scouting=alerts");
  });
});
