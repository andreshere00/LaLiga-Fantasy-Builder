import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { copy, i18n } from "./i18n";
import { NumericCounterField } from "./components/NumericCounterField";
import { radarMetric, radarProfile, radarSourceText } from "./features/players/radar/radarLocalization";
import { durationLabel } from "./i18n/format";
import { clauseUnlockCountdown } from "./features/market/model/valueSeries";
import { PlayerAveragesPanel } from "./features/players/PlayerAveragesPanel";
import { DateRangeDialog } from "./features/players/DateRangeDialog";
import { PlayerDetailsLink } from "./features/players/PlayerDetailsLink";
import { PlayerMatchesSection } from "./features/players/PlayerMatchesSection";
import { LineupBuilderScoreDetails } from "./features/lineup/LineupBuilderScoreDetails";
import { PlayerRadarPlot } from "./features/players/radar/PlayerRadarPlot";
import { lineupBuildResponseSchema, playerRadarResponseSchema } from "./api/schemas";
import response from "../../contracts/lineup-builder-response.json";
import examples from "../test/fixtures/player-radars.json";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadarChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  PolarAngleAxis: () => null, PolarRadiusAxis: () => null, PolarGrid: () => null, Radar: () => null,
}));
afterEach(() => { cleanup(); void i18n.changeLanguage("en"); });
const spanish = () => { void i18n.changeLanguage("es"); };

// Regression coverage for finite structured metadata and composed presentation messages.
it("switches an open calendar without losing the selected range", async () => {
  spanish();
  render(<DateRangeDialog from="2026-10-01" to="2026-10-12" onClose={() => {}} onApply={() => {}} />);
  expect(screen.getByText("octubre 2026")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ir al mes siguiente" })).toBeTruthy();
  await act(() => i18n.changeLanguage("en"));
  expect(screen.getByText("October 2026")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Go to the Next Month" })).toBeTruthy();
  expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-10-01");
});
it("localizes the details-link accessible name", () => {
  spanish();
  render(<MemoryRouter><PlayerDetailsLink playerId="1" playerName="Demo Player" /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Demo Player, ver detalles" })).toBeTruthy();
});
it("localizes competition headings and weather decimals", () => {
  spanish();
  render(<PlayerMatchesSection recent={{ matches: [] }} upcoming={{ matches: [{
    fixture: { competition: "LaLiga", matchweek: 12, date: "2026-11-09T18:00:00Z", homeTeam: "Demo Home", awayTeam: "Demo Away" },
    weather: { snapshot: { conditionCode: 800, temperatureC: 12.5, feelsLikeC: 11.5, humidityPct: 60, windSpeedMs: 1 } },
  }] }} playerTeamName="Demo Home" />);
  expect(screen.getByText("Jornada 12 · LALIGA")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pronóstico" })).toBeTruthy();
  expect(screen.getByText(/12,5°C/)).toBeTruthy();
});
it("uses complete empty and failed match sentences", () => {
  spanish();
  const { container } = render(<PlayerMatchesSection recent={{ matches: [] }} upcoming={null} playerTeamName="Demo Home" />);
  const texts = [...container.querySelectorAll(".player-match-empty")].map(e => e.textContent);
  expect(texts).toEqual(["No hay partidos recientes disponibles.", "Los próximos partidos no están disponibles temporalmente."]);
});
it("localizes nested builder roles, results and sources", () => {
  spanish();
  const base = lineupBuildResponseSchema.parse(response.payload).candidates[0].starters[0];
  const criteria = [
    { ruleId: "role_and_starting_probability", observed: "Clave: 90%", lineup: 6, trading: null, source: "fantasy_catalog", lineupLower: -5, lineupUpper: 5, tradingLower: -10, tradingUpper: 10 },
    { ruleId: "club_results", observed: "('D', 'W', 'L')", lineup: 5, trading: null, source: "fantasy_catalog", lineupLower: -5, lineupUpper: 5, tradingLower: -10, tradingUpper: 10 },
  ];
  render(<LineupBuilderScoreDetails player={{ ...base, sections: [{ section: "indicators", criteria, lineupRaw: 0, tradingRaw: 0, lineupLower: -5, lineupUpper: 5, tradingLower: -10, tradingUpper: 10, lineupNormalized: 0, tradingNormalized: 0, effectiveWeight: 0.25 }] }} />);
  expect(screen.getByText("Jugador clave · 90% de probabilidad de titularidad")).toBeTruthy();
  expect(screen.getByText("Empate · Victoria · Derrota")).toBeTruthy();
  expect(screen.getAllByText("Fuente: Catálogo de jugadores de Fantasy")).toHaveLength(2);
});
it("localizes radar metadata and methodology", () => {
  spanish();
  const radar = playerRadarResponseSchema.parse({ player_id: "1", season: "2026-27", available_seasons: ["2026-27"], status: "available", reason: null, radars: [examples[0]], comparison: null, comparison_reason: null, compatible_players: [] }).radars[0];
  render(<PlayerRadarPlot radar={radar} embedded />);
  expect(screen.getByRole("heading", { name: "Defensa central" })).toBeTruthy();
  expect(screen.getByText("Pases completados por 90 minutos")).toBeTruthy();
  expect(screen.getByText("Importación del usuario")).toBeTruthy();
  expect(screen.getByText("Importado")).toBeTruthy();
  expect(screen.getByText("La fuente no lo indica")).toBeTruthy();
});
it("formats singular, plural and zero duration units before interpolation", () => {
  spanish();
  expect(durationLabel(1560, true)).toBe("1 día 2 horas");
  expect(copy(`Next kickoff in ${durationLabel(1560, true)}`)).toBe("Próximo inicio en 1 día 2 horas");
  expect(durationLabel(0, true)).toBe("0 minutos");
  expect(clauseUnlockCountdown(61 * 60_000, 0)).toBe("0 días 1 hora 1 minuto");
  expect(copy(`Fixture 12. ${copy("Finished")}.`)).toBe("Jornada 12. Finalizado.");
  expect(copy(`Home goals: ${copy("no result")}`)).toBe("Goles del local: sin resultado");
});
it.each([0, 1, 2])("uses a full sample message for %s appearances", count => {
  spanish();
  render(<PlayerAveragesPanel positionId={4} rows={[
    { code: "G", label: "Goals", value: 1, source: "fantasy", sampleSize: count },
  ]} />);
  expect(screen.getByText(`Las medias alternativas de la API de LaLiga Fantasy usan ${count} ${count === 1 ? "jornada disputada" : "jornadas disputadas"}.`)).toBeTruthy();
});
it("normalizes legacy goalkeeper labels in English", () => {
  expect(copy("Aéreos ganados")).toBe("Aerial duels won");
  expect(copy("Pases cmp")).toBe("Passes cmp");
});

it("localizes every supported radar profile and definition using stable IDs", () => {
  spanish();
  for (const example of examples) {
    const radar = playerRadarResponseSchema.parse({ player_id: "1", season: "2026-27", available_seasons: ["2026-27"], status: "available", reason: null, radars: [{ ...example, player_id: "1" }], comparison: null, comparison_reason: null, compatible_players: [] }).radars[0];
    expect(radarProfile(radar)).not.toBe(radar.profileLabel);
    for (const axis of radar.axes) {
      expect(radarMetric(axis).definition).not.toBe(axis.definition);
    }
  }
  expect(radarSourceText("Custom population")).toBe("Etiqueta original de la fuente: Custom population");
});
it("localizes counter button arguments and updates already-mounted controls", async () => {
  render(<NumericCounterField id="minimum" ariaLabel="Minimum" value="2"
    formatInput={value => value} parseValue={Number} stepValue={value => value} onValueChange={() => {}} />);
  expect(screen.getByRole("button", { name: "Increase Minimum" })).toBeTruthy();
  await act(() => i18n.changeLanguage("es"));
  expect(screen.getByRole("button", { name: "Aumentar Mínimo" })).toBeTruthy();
});
