import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n";
import { newsKindLabel, newsTitleLabel } from "./teamNewsLabels";

afterEach(() => { void i18n.changeLanguage("en"); });

describe("teamNewsLabels", () => {
  it("newsTitleLabel_translates_generated_changelog_sentences_and_keeps_names", () => {
    expect(newsTitleLabel("N. Williams se marcha con su selección")).toBe("N. Williams leaves for international duty");
    expect(newsTitleLabel("Yuri está ahora recuperado")).toBe("Yuri is now recovered");
    expect(newsTitleLabel("N. Williams está ahora tocado o al margen")).toBe("N. Williams is now knocked or sidelined");
    expect(newsTitleLabel("Djaló es ahora duda")).toBe("Djaló is now a doubt");
    expect(newsTitleLabel("Mayoral es ahora baja")).toBe("Mayoral is now out");
    expect(newsTitleLabel("Paredes pasa de baja a duda")).toBe("Paredes moves from out to doubtful");
    expect(newsTitleLabel("R. de Galarreta pasa de baja a disponible")).toBe("R. de Galarreta moves from out to available");
    expect(newsTitleLabel("Actualizada posible alineación de Athletic")).toBe("Probable lineup updated for Athletic");
    expect(newsTitleLabel("Publicada posible alineación de Athletic")).toBe("Probable lineup published for Athletic");
    expect(newsTitleLabel("Alineación confirmada de Athletic")).toBe("Confirmed lineup for Athletic");
    expect(newsTitleLabel("Convocatoria de Athletic disponible")).toBe("Squad list available for Athletic");
  });

  it("newsTitleLabel_leaves_article_headlines_to_the_translation_widget", () => {
    expect(newsTitleLabel("Sancet al margen en la vuelta al trabajo en Lezama")).toBeNull();
    expect(newsTitleLabel("Paredes pasa de lesionado a algo")).toBeNull();
  });

  it("newsKindLabel_names_every_kind_and_falls_back_to_update", () => {
    expect(newsKindLabel("injury_update")).toBe("Injury update");
    expect(newsKindLabel("national_team")).toBe("International duty");
    expect(newsKindLabel("something-new")).toBe("Update");
  });

  it("labels_follow_the_selected_language", async () => {
    await i18n.changeLanguage("es");
    expect(newsTitleLabel("Yuri está ahora recuperado")).toBe("Yuri está ahora recuperado");
  });
});
