import { test, expect } from "@playwright/test";
import { mockApplication, mockMarketBids, detail, catalog } from "./fixtures";

const fakeVendor = `window.__GT = { translator: { libReady: true, finished: true, error: false,
  translate() { const node = document.getElementById('report'); node.textContent = 'Translated: ' + node.textContent; setTimeout(() => this.resultCallback(), 0); return true; }
} };`;

test("locked release clause explains the restriction and countdown in Spanish", async ({ page }) => {
  await mockApplication(page);
  await page.addInitScript(() => localStorage.setItem("lfb-language", "es"));
  await page.route("**/api/market/leagues/l1", route => route.fulfill({ json: {
    marketPlayers: [{ id: "locked-listing", playerMaster: catalog[20],
      playerTeam: { playerTeamId: "locked-entry", teamId: "t2", buyoutClause: 12_000_000,
        buyoutClauseLockedEndTime: "2026-10-15T12:28:00Z" },
      sellerTeam: { id: "t2", manager: { managerName: "Other Manager" } },
    }], userBids: [],
  } }));
  await page.goto("/market");
  await page.getByRole("button", { name: "Opciones", exact: true }).click();
  const clause = page.getByRole("menuitem").filter({ hasText: "Pagar cláusula de rescisión" });
  await expect(clause).toContainText("Aún no se puede pagar la cláusula de rescisión del jugador.");
  await expect(clause).toContainText("Tiempo restante hasta el desbloqueo de la cláusula: 3 días 0 horas 28 minutos");
  await expect(clause).not.toContainText("The player's release clause");
  await expect(clause).not.toContainText("Time remaining");
});

for (const language of ["es", "en"]) for (const theme of ["light", "dark"]) for (const width of [375, 1440]) {
  test(`market copy and value tooltip fit their content: ${language} ${theme} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const fixture = await mockMarketBids(page);
    await page.addInitScript(({ language, theme }) => {
      localStorage.setItem("lfb-language", language);
      localStorage.setItem("lfb-theme", theme);
    }, { language, theme });
    await page.goto("/players");
    await expect(page.getByText(language === "es" ? /Mejores por puntos/ : /Top by points/)).toBeVisible();
    await expect(page.getByText(language === "es" ? "Forma: de antes → ahora" : "Form: oldest → latest", { exact: true })).toBeVisible();
    await page.goto("/market");
    const row = page.locator(".market-data-row").filter({ has: page.getByRole("link", { name: "Player 16", exact: true }) });
    const value = row.locator(".market-value-line");
    if (width === 1440) await value.hover();
    else await value.focus();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(language === "es" ? "Valor de mercado hace 14 días:" : "Last 14 days market value:");
    const bounds = await tooltip.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width,
        fits: element.scrollWidth <= element.clientWidth,
        linesFit: [...element.querySelectorAll(".market-value-tooltip-line")].every(line => line.scrollWidth <= line.clientWidth) };
    });
    expect(bounds.fits).toBe(true);
    expect(bounds.linesFit).toBe(true);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(width);
    if (width === 1440) expect(bounds.width).toBeGreaterThan(260);
    await page.screenshot({ path: info.outputPath("value-tooltip.png") });
    await page.keyboard.press("Escape");
    await row.getByRole("button", { name: language === "es" ? "Opciones" : "Options", exact: true }).click();
    await page.getByRole("menuitem", { name: language === "es" ? "Contratar" : "Hire", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: language === "es" ? "Fichar jugador" : "Hire player", exact: true });
    const guidance = language === "es" ? "saldo disponible más hasta el 20% del valor de la plantilla" : "available cash plus up to 20% of squad value";
    await expect(dialog.getByText(guidance, { exact: false })).toBeVisible();
    if (language === "es") await expect(dialog).not.toContainText("available cash");
    await page.screenshot({ path: info.outputPath("bid-dialog.png") });
    await dialog.getByRole("button", { name: language === "es" ? "Cancelar" : "Cancel", exact: true }).click();
    expect(fixture.writes).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const theme of ["light", "dark"]) for (const width of [375, 800, 1440]) {
  test(`ES/EN reader isolation, persistence and header: ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(value => { if (window !== window.top) return; if (!localStorage.getItem("lfb-language")) localStorage.setItem("lfb-language", "es"); localStorage.setItem("lfb-theme", value); }, theme);
    await mockApplication(page);
    await page.route("**/api/players/1/stats/detail?*", route => route.fulfill({ json: { ...detail,
      profile: { ...detail.profile, news: [{ title: "Vuelve al entrenamiento", url: "https://example.com/news", source: "FutbolFantasy" }], injuryHistory: [{ diagnosis: "Lesión muscular", start: "2026-10-01", ongoing: true }] } } }));
    await page.route("https://cdn.gtranslate.net/**", route => route.fulfill({ body: fakeVendor, contentType: "text/javascript" }));
    await page.goto("/players/1#player-fantasy-title");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { name: "Últimas noticias", exact: true })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    const select = page.getByRole("combobox", { name: "Idioma", exact: true });
    const themeButton = page.locator('.appearance-controls .theme-btn');
    await expect(select.locator("svg")).toBeVisible();
    const selectBounds = await select.boundingBox();
    expect(selectBounds?.width).toBe(44);
    expect(selectBounds?.height).toBe(44);
    expect(await select.evaluate((el, theme) => el.getBoundingClientRect().right <= (document.querySelector(theme)!.getBoundingClientRect().left), '.appearance-controls .theme-btn')).toBe(true);
    await expect(themeButton).toBeVisible();
    await select.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "Español", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("option", { name: "Español", exact: true })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("option", { name: "English", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Latest news", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Vuelve al entrenamiento", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("link", { name: "Translated: Vuelve al entrenamiento", exact: true })).toBeVisible();

    expect(await page.evaluate(() => '__GT' in window)).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('lfb-language'))).toBe('en');
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.getByRole("combobox", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "Español", exact: true }).click();
    await expect(page.getByRole("link", { name: "Vuelve al entrenamiento", exact: true })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/lfb-localization-${theme}-${width}.png` });
  });
}

test("live free GTranslate translates inside the opaque sandbox", async ({ page }) => {
  test.skip(process.env.LFB_LIVE_TRANSLATION !== "1", "Opt-in real vendor compatibility check with fictional public prose");
  await mockApplication(page);
  await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:3100" ? route.fallback() : route.continue());
  await page.route("**/api/players/1/stats/detail?*", route => route.fulfill({ json: { ...detail,
    profile: { ...detail.profile, news: [{ title: "El jugador vuelve al entrenamiento", url: "https://example.com/news" }], injuryHistory: [] } } }));
  await page.addInitScript(() => { if (window === window.top) localStorage.setItem("lfb-language", "en"); });
  await page.goto("/players/1#player-fantasy-title");
  await page.getByRole("link", { name: "El jugador vuelve al entrenamiento", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("link", { name: /player.*training/i })).toBeVisible({ timeout: 25000 });
  expect(await page.evaluate(() => '__GT' in window)).toBe(false);
  await page.screenshot({ path: "/tmp/lfb-localization-live.png", fullPage: true });
});

test("language changes retain independent history pages and blocked translation preserves source", async ({ page }) => {
  await mockApplication(page);
  await page.goto("/players/1#player-fantasy-title");
  const news = page.locator('.player-updates-news');
  const injuries = page.locator('.player-updates-injuries');
  await news.getByRole('button', { name: 'Page 2', exact: true }).click();
  await injuries.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(news.getByRole('navigation')).toContainText('6–10 of 21');
  await expect(injuries.getByRole('navigation')).toContainText('6–8 of 8');
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: 'Español', exact: true }).click();
  await expect(news.getByRole('navigation')).toContainText('6–10 de 21');
  await expect(injuries.getByRole('navigation')).toContainText('6–8 de 8');
  await page.getByRole('combobox', { name: 'Idioma', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await news.scrollIntoViewIfNeeded();
  await expect(news.getByRole('navigation')).toContainText('6–10 of 21');
  await expect(news.getByText('Translation unavailable. Original Spanish shown.').first()).toBeVisible();
  await expect(news.getByRole('heading', { level: 4 })).toHaveCount(5);
});

for (const { theme, width } of [{ theme: "light", width: 375 }, { theme: "dark", width: 1440 }]) {
  test(`structured player translations survive a language switch: ${theme} ${width}`, async ({ page }, info) => {
    const { default: examples } = await import("../test/fixtures/player-radars.json", { with: { type: "json" } });
    await mockApplication(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(value => {
      localStorage.setItem("lfb-language", "es");
      localStorage.setItem("lfb-theme", value);
    }, theme);
    const radar = { ...examples[0], player_id: "1", comparison_key: "test", cohort: {
      id: "test", label: "Custom population", eligibility: "300 minutes", reference_snapshot: "test-v1",
      size: 100, minimum_minutes: 300,
    } };
    await page.route("**/api/players/1/stats/radar?*", route => route.fulfill({ json: {
      player_id: "1", season: "2026-27", available_seasons: ["2026-27"], status: "available",
      reason: null, radars: [radar], comparison: null, comparison_reason: null,
      compatible_players: Array.from({ length: 21 }, (_, i) => ({
        player_id: String(i + 2), player: `Candidate ${i + 1}`, club: "Other Club", profile: radar.profile,
      })),
    } }));
    await page.route("**/api/players/1/stats/detail?*", route => route.fulfill({ json: { ...detail,
      segmentErrors: [
        { segment: "market", code: "disabled", detail: "segment disabled" },
        { segment: "recent", code: "upstream_error", detail: "unrecognized provider wording" },
      ],
    } }));
    await page.goto("/players/1");
    await page.getByRole("heading", { name: "Perfil de rendimiento", exact: true }).scrollIntoViewIfNeeded();
    const plot = page.locator(".player-radar");
    await expect(plot.getByRole("heading", { name: "Defensa central", exact: true })).toBeVisible();
    await expect(plot.getByText("Pases completados por 90 minutos", { exact: true })).toBeVisible();
    await expect(plot.locator(".recharts-polar-angle-axis")).toContainText(/Pases\s*compl\./);
    await plot.getByText("Fuente y metodología", { exact: true }).click();
    await expect(plot.getByText("Importación del usuario", { exact: true })).toBeVisible();
    await expect(plot.locator("dd").filter({ hasText: "Etiqueta original de la fuente: Custom population" })).toBeVisible();
    await page.getByText("Compara con un jugador compatible", { exact: true }).click();
    const search = page.getByLabel("Buscar un jugador compatible");
    await expect(page.getByText("21 jugadores compatibles.", { exact: false })).toBeVisible();
    await expect(page.getByText("Se muestran los primeros 20; afina la búsqueda.", { exact: false })).toBeVisible();
    await search.fill("missing");
    await expect(page.getByText("No hay jugadores compatibles con esta búsqueda. Prueba con otro nombre o club.")).toBeVisible();
    await expect(page.locator(".player-detail-segment-errors")).toContainText("Sección desactivada");
    await expect(page.locator(".player-detail-segment-errors")).toContainText("No disponible temporalmente");
    await expect(page.locator(".player-detail-segment-errors")).not.toContainText("unrecognized provider wording");
    const legend = page.locator(".player-detail-chart .recharts-legend-wrapper");
    await legend.scrollIntoViewIfNeeded();
    await expect(legend).toContainText("Tendencia");
    await expect(legend).toContainText("Valor");
    await page.getByRole("button", { name: "Personalizado", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Período personalizado" });
    await expect(dialog.getByText("octubre 2026", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Ir al mes siguiente" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`structured-es-${theme}-${width}.png`), fullPage: true });
    await page.getByRole("combobox", { name: "Idioma", exact: true }).click();
    await page.getByRole("option", { name: "English", exact: true }).click();
    await expect(plot.getByRole("heading", { name: "Centre-back", exact: true })).toBeVisible();
    await expect(legend).toContainText("Trend");
    await expect(page.getByLabel("Find compatible player")).toHaveValue("missing");
    await expect(page.getByText("No compatible players match this search. Try another name or club.")).toBeAttached();
  });
}
