import { expect, test } from "@playwright/test";

test("browser preview degrades gracefully without the native bridge", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /MagAgent was not detected/i }),
  ).toBeVisible();
  await expect(
    page.getByText(/Not available in the browser preview/i),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("primary navigation remains keyboard accessible", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toBeVisible();
  await page
    .getByPlaceholder(/Search workspaces and commands/)
    .fill("workspace");
  await expect(
    page.getByRole("button", { name: /Open Files and Git/i }),
  ).toBeVisible();
});

test("release-candidate surfaces remain responsive without native data", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  // Primary sections sit in the rail; project tools live in the Projects context.
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: /^Files and Git/ }).click();
  await expect(
    page.getByRole("heading", { name: "Files, changes, and commands" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Runs", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Graph schedules" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: /^Tools and extensions/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Tools and extensions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace theme" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.getByLabel("Accent").selectOption("violet");
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-accent",
    "violet",
  );

  await page.setViewportSize({ width: 390, height: 780 });
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "auto");
  expect(errors).toEqual([]);
});
