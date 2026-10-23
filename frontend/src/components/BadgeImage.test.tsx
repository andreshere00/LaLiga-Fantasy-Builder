import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BadgeImage } from "./BadgeImage";

afterEach(cleanup);
it("tries each image once and keeps a readable fallback after exhaustion", () => {
  const { container, rerender } = render(<BadgeImage media={{ name: "Club", badge: "https://example.com/api.png", fallbackBadges: ["https://example.com/scraped.png", "/badges/football-logos/spain-celta.png"] }} fallback="C" />);
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.com/scraped.png");
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/badges/football-logos/spain-celta.png");
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("C");
  rerender(<BadgeImage media={{ name: "New", badge: "https://example.com/new.png" }} />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.com/new.png");
});
