import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
test("real worker, Git operations, persistence, export and offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE", m.text());
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Your repository, in perspective." }),
  ).toBeVisible();
  await expect(page.locator(".commit-row")).toHaveCount(8, { timeout: 30000 });
  await expect(page.locator(".monaco-diff-editor")).toBeVisible();
  mkdirSync("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/history.png", fullPage: true });
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Merge lab", exact: true })
    .click();
  await page.getByLabel("Incoming branch").selectOption("feature/dark-mode");
  await page.getByRole("button", { name: "Compare & merge" }).click();
  await expect(
    page.getByRole("button", { name: "Use incoming" }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/merge.png", fullPage: true });
  await page.getByRole("button", { name: "Use incoming" }).click();
  await page.getByRole("button", { name: "Mark resolved" }).click();
  await expect(
    page.getByRole("button", { name: "Complete merge", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Complete merge", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Compare & merge" }),
  ).toBeVisible();
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "History", exact: true })
    .click();
  await expect(page.locator(".commit-row")).toHaveCount(9);
  await page.reload();
  await expect(page.locator(".commit-row")).toHaveCount(9);
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Terminal", exact: true })
    .click();
  await page.getByLabel("Git command").fill("git branch release/v2");
  await page.getByRole("button", { name: "Run command" }).click();
  await expect(page.locator(".terminal-output")).toContainText("Done.");
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Challenges", exact: true })
    .click();
  await page
    .locator(".challenge-card")
    .first()
    .getByRole("button", { name: "Validate" })
    .click();
  await expect(page.locator(".challenge-card").first()).toContainText(
    "Challenge complete",
  );
  for (const view of [
    "Working files",
    "Time machine",
    "Detective",
    "Rewrite simulator",
  ]) {
    await page
      .locator(".sidebar nav")
      .getByRole("button", { name: view, exact: true })
      .click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `artifacts/${view.replaceAll(" ", "-")}.png`,
      fullPage: true,
    });
  }
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const d = await download;
  await d.saveAs("artifacts/atlas.gitscope.zip");
  expect(d.suggestedFilename()).toContain(".zip");
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "History", exact: true })
    .click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator(".commit-row")).toHaveCount(9);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".commit-row")).toHaveCount(9);
  await context.setOffline(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
