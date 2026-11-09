import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamNewsInjuriesSection } from "./TeamNewsInjuriesSection";

// ---- Mocks, fixtures & helpers ---- //

vi.mock("../lineup/useSquadStats", () => ({
  usePlayerOutlooks: (ids: string[]) => ({
    profiles: new Map(ids.map((id) => [id, profiles[id]])),
    isLoading: false,
    errors: [],
  }),
}));

vi.mock("../shell/ProfilePhoto", () => ({
  ProfilePhoto: ({ url, className }: { url: string | null; className?: string }) => (
    <span className={className}>{url ? <img src={url} alt="" /> : null}</span>
  ),
}));

const profiles: Record<string, unknown> = {
  "1": { hierarchy: { label: "Rotación", rank: 4 } },
  "2": { hierarchy: { label: "Clave", rank: 2 } },
};

const squad = [
  { playerId: "1", name: "Gorka Guruzeta", points: 40, stats: {} },
  { playerId: "2", name: "Unai Egiluz", points: 18, stats: {} },
];

const injuries = {
  published: true,
  items: [
    {
      name: "Gorka Guruzeta", photoUrl: "https://x.test/g.png", diagnosis: "Rotura de lig. cruzado anterior",
      startedOn: "2026-10-17", expectedReturn: "Baja hasta mayo 2027", status: "Tratamiento",
      reportUrl: "https://www.futbolfantasy.com/laliga/noticias/1-parte",
    },
    { name: "Unai Egiluz", diagnosis: "Lesión de rodilla", status: "Rehabilitación", expectedReturn: "Baja confirmada para la jornada 12" },
    { name: "Visitante Desconocido", diagnosis: "Algo muy raro" },
  ],
};

const club = "https://www.futbolfantasy.com/laliga/equipos/athletic";
function feed(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    title: index === 0 ? "Sancet al margen en la vuelta al trabajo" : "Yuri está ahora recuperado",
    url: index === 0 ? "https://www.futbolfantasy.com/laliga/noticias/154051-x" : club,
    publishedAt: `2026-11-0${Math.max(1, 8 - Math.floor(index / 4))}T1${index % 10}:00:00+01:00`,
    kind: index === 0 ? "injury_update" : "lineup",
    target: index === 0 ? "article" : "club",
  }));
}

function renderSection(news = { items: feed(12) }, inj: typeof injuries | null = injuries) {
  return render(
    <MemoryRouter>
      <TeamNewsInjuriesSection injuries={inj} news={news} squad={squad as never}
        returnTo="/teams/3?section=news" />
    </MemoryRouter>,
  );
}

describe("TeamNewsInjuriesSection", () => {
  beforeEach(() => cleanup());

  // ---- Happy path ---- //

  it("TeamNewsInjuriesSection_names_the_merged_section_and_both_blocks", () => {
    renderSection();
    expect(screen.getByRole("heading", { level: 2, name: "News & Injuries" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: /Injured players/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "News" })).toBeTruthy();
  });

  it("TeamNewsInjuriesSection_injury_card_shows_photo_fsyp_hierarchy_type_status_return_and_start", () => {
    renderSection();
    const list = screen.getByRole("list", { name: "Injured players" });
    const card = within(list).getByRole("link", { name: "Gorka Guruzeta" }).closest("li") as HTMLElement;
    expect(card.querySelector("img[src='https://x.test/g.png']")).toBeTruthy();
    expect(within(card).getByText("40")).toBeTruthy();
    expect(within(card).getByText("Rotation")).toBeTruthy();
    expect(within(card).getByText("Anterior cruciate ligament tear")).toBeTruthy();
    expect(within(card).getByText("Treatment")).toBeTruthy();
    expect(within(card).getByText("Out until May 2027")).toBeTruthy();
    expect(card.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-17");
    expect(within(card).getByRole("link", { name: /Medical report/ }).getAttribute("href"))
      .toBe("https://www.futbolfantasy.com/laliga/noticias/1-parte");
    expect(within(card).getByRole("link", { name: "Gorka Guruzeta" }).getAttribute("href")).toBe("/players/1");
    expect(screen.queryByText(/Tratamiento|Baja hasta|Rotura/)).toBeNull();
  });

  it("TeamNewsInjuriesSection_sorts_injuries_by_squad_role_then_keeps_unmatched_last", () => {
    renderSection();
    const names = screen.getAllByRole("listitem")
      .filter((item) => item.classList.contains("team-injury"))
      .map((item) => item.querySelector(".team-injury-head")?.textContent ?? "");
    expect(names[0]).toContain("Unai Egiluz");
    expect(names[1]).toContain("Gorka Guruzeta");
    expect(names[2]).toContain("Visitante Desconocido");
  });

  it("TeamNewsInjuriesSection_unmatched_injury_is_plain_text_with_dashes", () => {
    renderSection();
    const card = screen.getByText("Visitante Desconocido").closest("li") as HTMLElement;
    expect(within(card).queryByRole("link", { name: "Visitante Desconocido" })).toBeNull();
    expect(within(card).getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  // ---- News feed ---- //

  it("TeamNewsInjuriesSection_feed_shows_five_by_default_and_expands_with_the_range_control", () => {
    renderSection();
    const feedBlock = document.querySelector(".team-feed") as HTMLElement;
    expect(feedBlock.querySelectorAll(".team-feed-item")).toHaveLength(5);
    expect(within(feedBlock).getByRole("button", { name: "5" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(feedBlock).queryByRole("button", { name: "20" })).toBeNull();
    fireEvent.click(within(feedBlock).getByRole("button", { name: "10" }));
    expect(feedBlock.querySelectorAll(".team-feed-item")).toHaveLength(10);
    fireEvent.click(within(feedBlock).getByRole("button", { name: "All" }));
    expect(feedBlock.querySelectorAll(".team-feed-item")).toHaveLength(12);
    expect(within(feedBlock).getByRole("status").textContent).toMatch(/Showing 12 of 12 events, covering \d+ days?/);
  });

  it("TeamNewsInjuriesSection_feed_translates_sentences_and_only_links_articles", () => {
    renderSection();
    const feedBlock = document.querySelector(".team-feed") as HTMLElement;
    expect(within(feedBlock).getAllByText("Yuri is now recovered").length).toBeGreaterThan(0);
    expect(within(feedBlock).getAllByText("Lineup").length).toBeGreaterThan(0);
    expect(within(feedBlock).getByText("Injury update")).toBeTruthy();
    const links = within(feedBlock).getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.includes("futbolfantasy.com"));
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://www.futbolfantasy.com/laliga/noticias/154051-x");
  });

  it("TeamNewsInjuriesSection_repeated_urls_and_titles_render_without_key_collisions", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderSection({ items: Array.from({ length: 8 }, () => ({
      title: "Actualizada posible alineación de Athletic", url: club,
      publishedAt: "2026-11-08T10:00:00+01:00", kind: "lineup", target: "club",
    })) });
    expect(spy).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".team-feed-item")).toHaveLength(5);
    spy.mockRestore();
  });

  // ---- Edge cases ---- //

  it("TeamNewsInjuriesSection_a_burst_of_departures_becomes_one_row", () => {
    const leave = (name: string, minute: number) => ({
      title: `${name} se marcha con su selección`, url: club, kind: "national_team", target: "club",
      publishedAt: `2026-11-08T22:${String(minute).padStart(2, "0")}:00+01:00`,
    });
    renderSection({ items: [
      leave("Imga", 26), leave("Djaló", 26), leave("Sancet", 25),
      ...feed(6).map((item) => ({ ...item, publishedAt: "2026-11-07T10:00:00+01:00" })),
    ] });
    const rows = document.querySelectorAll(".team-feed-item");
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toContain("3 players leave for international duty: Imga, Djaló, Sancet");
  });

  it("TeamNewsInjuriesSection_short_feed_hides_the_range_control", () => {
    renderSection({ items: feed(4) });
    expect(screen.queryByRole("group", { name: "Events shown" })).toBeNull();
  });

  it("TeamNewsInjuriesSection_empty_and_unpublished_states_name_themselves", () => {
    renderSection({ items: [] }, { published: false, items: [] });
    expect(screen.getByText("Current injuries are not published for this club.")).toBeTruthy();
    expect(screen.getByText("No recent club events were published.")).toBeTruthy();
    cleanup();
    renderSection({ items: [] }, { published: true, items: [] });
    expect(screen.getByText("No current injuries were published.")).toBeTruthy();
  });
});
