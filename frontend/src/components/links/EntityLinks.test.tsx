import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ClubLink, ManagerLink, PlayerLink } from "./EntityLinks";

afterEach(cleanup);

const wrap = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("PlayerLink", () => {
  it("renders a details link with the return state when the id is known", () => {
    wrap(<PlayerLink playerId="14" returnTo="/market">Ana</PlayerLink>);
    expect(screen.getByRole("link", { name: "Ana" }).getAttribute("href")).toBe("/players/14");
  });

  it("renders plain text when the id is missing", () => {
    wrap(<PlayerLink playerId={null}>Ana</PlayerLink>);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Ana")).toBeTruthy();
  });
});

describe("ManagerLink", () => {
  it("links to the lineup of the team", () => {
    wrap(<ManagerLink teamId="t1">Mia</ManagerLink>);
    expect(screen.getByRole("link", { name: "Mia" }).getAttribute("href")).toBe("/?team=t1");
  });

  it("renders plain text without a team id", () => {
    wrap(<ManagerLink teamId={undefined}>Mia</ManagerLink>);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("ClubLink", () => {
  it("links a known team id to Teams", () => {
    wrap(<ClubLink teamId="4">FC Barcelona</ClubLink>);
    expect(screen.getByRole("link", { name: "FC Barcelona" }).getAttribute("href")).toBe("/teams/4");
  });

  it("resolves a club by name", () => {
    wrap(<ClubLink name="FC Barcelona">Barça</ClubLink>);
    expect(screen.getByRole("link", { name: "Barça" }).getAttribute("href")).toBe("/teams/4");
  });

  it("renders plain text for an unknown club", () => {
    wrap(<ClubLink name="Nowhere FC">Nowhere</ClubLink>);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
