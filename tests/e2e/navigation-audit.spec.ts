import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("workspace and project rail controls live inside their own navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(process.env.TEST_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await page.getByLabel("Project name", { exact: true }).fill(`Navigation audit ${randomUUID().slice(0, 8)}`);
  await page.getByRole("button", { name: "Create project" }).click();

  const workspaceRail = page.locator("#workspace-navigation");
  const projectRail = page.locator("#project-navigation");
  const workspaceToggle = workspaceRail.getByRole("button", { name: "Collapse workspace navigation" });
  const projectToggle = projectRail.getByRole("button", { name: "Collapse project navigation" });

  await expect(workspaceToggle).toBeVisible();
  await expect(projectToggle).toBeVisible();
  await expect(page.locator(".topbar").getByRole("button", { name: /workspace navigation/ })).toHaveCount(0);
  await page.screenshot({ path: "test-results/navigation-controls-expanded.png", fullPage: true });

  await workspaceToggle.click();
  await projectToggle.click();
  await expect(workspaceRail.getByRole("button", { name: "Expand workspace navigation" })).toBeVisible();
  await expect(projectRail.getByRole("button", { name: "Expand project navigation" })).toBeVisible();
  await expect(workspaceRail).toHaveCSS("width", "68px");
  await expect(page.locator(".project-navigation")).toHaveCSS("width", "68px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/navigation-controls-collapsed.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Open workspace navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open project navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Open project navigation" }).click();
  await expect(projectRail.getByRole("button", { name: "Close project navigation" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/navigation-controls-mobile.png", fullPage: true });
});
