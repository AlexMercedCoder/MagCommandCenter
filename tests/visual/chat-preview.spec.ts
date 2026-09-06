import { expect, test } from "@playwright/test";

test("chat controls remain legible and interactive during a long run", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/tests/visual/chat-preview.html");

  for (const label of ["Project", "Session", "Agent", "Permission mode"])
    await expect(page.getByText(label, { exact: true })).toBeVisible();

  const project = page.getByLabel("Project");
  await expect(project).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(project).toHaveCSS("color", "rgb(23, 32, 25)");
  const openButton = page.getByRole("button", { name: "Open" });
  const openBox = await openButton.boundingBox();
  expect(openBox?.width).toBeGreaterThan(70);
  expect(openBox?.height).toBeLessThan(60);

  const composer = page.getByLabel("Message MagAgent");
  await composer.fill("Build a responsive project");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeEnabled();
  await expect(
    page.getByText(/MagAgent is still running/).first(),
  ).toBeVisible();
  await expect(page.getByText(/I’m building the project now/)).toBeVisible();
  await expect(page.getByText("Progress", { exact: true })).toBeVisible();

  await composer.fill("The interface is still responsive");
  await expect(composer).toHaveValue("The interface is still responsive");
  await expect(page.getByText(/Running (?!0ms)/)).toBeVisible({
    timeout: 3_000,
  });

  await page.screenshot({
    path: "/tmp/mag-command-center-chat-visual.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});
