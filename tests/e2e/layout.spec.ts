import { expect, test, type Page } from "@playwright/test";

// UI-4: the shell is exactly one window tall at every size; each view scrolls inside
// its own region, so the document itself never scrolls.
const views = [
  "Chat",
  "Runs",
  "Projects",
  "Files and Git",
  "Graph Board",
  "Agents",
  "Memory",
  "Research",
  "Workbench",
  "SQLite",
  "Plugins",
  "Tools and extensions",
  "Settings",
  "Setup",
  "Help",
];
const sizes = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1024, height: 700 },
  { width: 375, height: 812 },
];

async function open(page: Page, label: string) {
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder(/Search workspaces and commands/).fill(label);
  await page
    .getByRole("button", { name: new RegExp(`^Open ${label}\\b`) })
    .first()
    .click();
}

for (const size of sizes) {
  test(`every view fits a ${size.width}x${size.height} window`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const overflowing: string[] = [];
    for (const view of views) {
      await open(page, view);
      await expect(page.locator(".workspace-header h1")).toBeVisible();
      const metrics = await page.evaluate(() => ({
        scroll: document.documentElement.scrollHeight,
        inner: window.innerHeight,
      }));
      if (metrics.scroll !== metrics.inner)
        overflowing.push(`${view}: ${metrics.scroll} vs ${metrics.inner}`);
    }
    expect(overflowing).toEqual([]);
  });
}

test("chat keeps the composer in the window and the rail full height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.goto("/");
  await open(page, "Chat");
  const composer = await page.locator(".composer").boundingBox();
  expect(composer).not.toBeNull();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(700);
  const toolbar = page.locator(".composer-actions");
  const buttons = await toolbar
    .locator(":scope > *")
    .evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().top)),
    );
  expect(new Set(buttons).size, "composer toolbar is one row").toBe(1);
  const rail = await page.locator(".app-rail").boundingBox();
  expect(Math.round(rail!.height)).toBe(700);
});
