import { test, expect } from "@playwright/test";
import { detail, mockApplication } from "./fixtures";

for (const { theme, width } of [{ theme: "light", width: 1440 }, { theme: "dark", width: 320 }]) {
  test(`news and injury timelines support independent keyboard pagination: ${theme} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await mockApplication(page);
    const headline = "Training update: the coach discusses recent performances, the next match and the players returning to the squad";
    await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: {
      ...detail, profile: { ...detail.profile,
        news: detail.profile.news.map((item, index) => index === 20 ? { ...item, title: headline } : item),
        injuryHistory: [
          ...detail.profile.injuryHistory,
          { diagnosis: "Current shoulder issue", start: "2025-01-01", ongoing: true, end: "2027-01-01" },
          { diagnosis: "Unreported end", start: "2026-10-01", end: null },
        ],
      },
    } }));
    await page.goto("/players/1#player-fantasy-title");
    const section = page.getByRole("region", { name: "News & injuries", exact: true });
    const news = section.getByRole("region", { name: "Latest news", exact: true });
    const injuries = section.getByRole("region", { name: "Injury history", exact: true });
    await expect(news.getByRole("listitem")).toHaveCount(5);
    await expect(injuries.getByRole("listitem")).toHaveCount(5);
    await expect(injuries.getByRole("listitem").first()).toContainText("Current shoulder issue");
    await expect(injuries.getByRole("listitem").first()).toContainText("Current injury");
    await expect(injuries.getByRole("listitem").first()).not.toContainText("2027");
    await expect(injuries.getByRole("listitem").nth(1)).toContainText("End date unreported");
    const article = news.getByRole("link", { name: headline, exact: true });
    await article.focus();
    await expect(article).toBeFocused();
    await expect(article).toHaveCSS("outline-style", "solid");
    await expect(article).toHaveCSS("text-decoration-line", "none");
    await expect(article).toHaveAttribute("target", "_blank");
    await expect(article).toHaveAccessibleDescription("Opens in a new tab.");
    await expect(news.getByRole("heading", { name: headline, exact: true })).toHaveText(headline);
    expect(await article.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(44);
    const clippedHeadlines = await news.locator("h4").evaluateAll((elements) => elements.some((element) =>
      element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth));
    expect(clippedHeadlines).toBe(false);

    const newsPages = news.getByRole("navigation", { name: "News history pages" });
    const injuryPages = injuries.getByRole("navigation", { name: "Injury records history pages" });
    await newsPages.getByRole("button", { name: "Page 2", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(newsPages).toContainText("6–10 of 21");
    await expect(newsPages.getByRole("button", { name: "Page 2", exact: true })).toBeFocused();
    await expect(injuryPages).toContainText("1–5 of 10");
    await expect(injuries.getByText("Current injury", { exact: true })).toBeVisible();
    await injuryPages.getByRole("button", { name: "Page 2", exact: true }).click();
    await expect(injuryPages).toContainText("6–10 of 10");
    await expect(newsPages).toContainText("6–10 of 21");
    const smallButtons = await section.getByRole("button").evaluateAll((elements) => elements.some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    }));
    expect(smallButtons).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await section.screenshot({ path: info.outputPath(`news-injuries-${theme}-${width}.png`) });
  });
}

test("empty lists and unavailable profile data have distinct feedback", async ({ page }) => {
  await mockApplication(page);
  let unavailable = false;
  await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: {
    ...detail, profile: unavailable ? null : { ...detail.profile, news: [], injuryHistory: [] },
    segmentErrors: unavailable ? [{ segment: "profile", code: "scraping_unavailable", detail: "Temporarily unavailable." }] : [],
  } }));
  await page.goto("/players/1#player-fantasy-title");
  const section = page.getByRole("region", { name: "News & injuries", exact: true });
  await expect(section.getByText("No recent news available.", { exact: true })).toBeVisible();
  await expect(section.getByText("No injury history available.", { exact: true })).toBeVisible();
  await expect(section.getByRole("navigation")).toHaveCount(0);
  unavailable = true;
  await page.reload();
  await expect(section.getByText("News & injuries data is temporarily unavailable.", { exact: true })).toBeVisible();
  await expect(section.getByText("No injury history available.", { exact: true })).toHaveCount(0);
});
