import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n";
import {
  daysSince, expectedReturnLabel, injuryDiagnosisLabel, injuryPhaseLabel, startedLabel,
} from "./teamInjuryLabels";

afterEach(() => { void i18n.changeLanguage("en"); });

describe("teamInjuryLabels", () => {
  it("injuryPhaseLabel_translates_every_published_step_including_treatment", () => {
    expect(injuryPhaseLabel("Tratamiento")).toBe("Treatment");
    expect(injuryPhaseLabel("Pendiente pruebas")).toBe("Awaiting tests");
    expect(injuryPhaseLabel("Rehabilitación")).toBe("Rehabilitation");
    expect(injuryPhaseLabel("Grupo sin el alta")).toBe("Training with the group");
    expect(injuryPhaseLabel("Otra fase")).toBeNull();
  });

  it("injuryDiagnosisLabel_translates_observed_and_composed_wording", () => {
    expect(injuryDiagnosisLabel("Lesión de rodilla")).toBe("Knee injury");
    expect(injuryDiagnosisLabel("Lesión en el cuádriceps")).toBe("Quadriceps injury");
    expect(injuryDiagnosisLabel("Rotura en los isquiotibiales")).toBe("Hamstring tear");
    expect(injuryDiagnosisLabel("Rotura de lig. cruzado anterior")).toBe("Anterior cruciate ligament tear");
    expect(injuryDiagnosisLabel("Rotura de ligamento cruzado y menisco")).toBe("Cruciate ligament and meniscus tear");
    expect(injuryDiagnosisLabel("Calambres en los isquiotibiales")).toBe("Hamstring cramps");
    expect(injuryDiagnosisLabel("Lesión en los isquiotibiales")).toBe("Hamstring injury");
    expect(injuryDiagnosisLabel("Molestias musculares")).toBe("Muscle discomfort");
    expect(injuryDiagnosisLabel("Molestias sin determinar")).toBe("Undetermined discomfort");
    expect(injuryDiagnosisLabel("Gastroenteritis")).toBe("Gastroenteritis");
    expect(injuryDiagnosisLabel("Lesión de algo raro")).toBeNull();
  });

  it("expectedReturnLabel_translates_month_and_matchday_wording", () => {
    expect(expectedReturnLabel("Baja hasta mayo")).toBe("Out until May");
    expect(expectedReturnLabel("Baja hasta mayo 2027")).toBe("Out until May 2027");
    expect(expectedReturnLabel("Baja confirmada para la jornada 12")).toBe("Confirmed out for matchday 12");
    expect(expectedReturnLabel("Baja hasta finales de diciembre")).toBe("Out until late December");
    expect(expectedReturnLabel("Duda para la jornada 13")).toBe("Doubtful for matchday 13");
    expect(expectedReturnLabel("Disponible para la jornada 13")).toBe("Available for matchday 13");
    expect(expectedReturnLabel("Pendiente de evolución")).toBeNull();
  });

  it("startedLabel_shows_the_date_and_elapsed_days", () => {
    const today = new Date(2026, 10, 9);
    expect(daysSince("2026-10-17", today)).toBe(23);
    expect(startedLabel("2026-10-17", today)).toBe("Since 17 Oct · 23 days");
    expect(daysSince("2027-01-01", today)).toBe(0);
  });

  it("labels_follow_the_selected_language", async () => {
    await i18n.changeLanguage("es");
    expect(injuryPhaseLabel("Tratamiento")).toBe("Tratamiento");
    expect(injuryDiagnosisLabel("Lesión de rodilla")).toBe("Lesión de rodilla");
  });
});
