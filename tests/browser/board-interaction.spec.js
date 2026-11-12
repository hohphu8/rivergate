import { test, expect } from "@playwright/test";
const point = (page, at) => page.locator(`[data-at="${at}"]`);
async function center(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function dragTo(page, from, to) {
  await point(page, from).scrollIntoViewIfNeeded();
  const start = await center(point(page, from));
  const end = await center(point(page, to));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.locator("#mode").selectOption("local");
});

test("mouse drag previews a legal move and commits once on either orientation", async ({ page }) => {
  await dragTo(page, 54, 45);
  await expect(page.locator(".drag-ghost")).toBeVisible();
  await expect(point(page, 45)).toHaveClass(/drop-target/);
  await expect(page.locator('[data-piece="red-p-54"]')).toHaveCSS("opacity", "0.3");
  await page.mouse.up();
  await expect(page.getByTestId("move-count")).toHaveText("1");
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await expect(page.locator("[data-drag-source]")).toHaveCount(0);
  await page.getByRole("button", { name: "Xoay bàn" }).click();
  await dragTo(page, 27, 36);
  await page.mouse.up();
  await expect(page.getByTestId("move-count")).toHaveText("2");
  await page.getByRole("button", { name: "Về đầu ván" }).click();
  await dragTo(page, 54, 45);
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByTestId("move-count")).toHaveText("2");
});

test("invalid clicks and drops preserve selection; Escape and outside drops cancel", async ({ page }) => {
  await point(page, 54).click();
  await point(page, 46).click();
  await expect(point(page, 54)).toHaveAttribute("aria-pressed", "true");
  await expect(point(page, 45)).toHaveClass(/legal/);
  await dragTo(page, 54, 46);
  await page.mouse.up();
  await expect(page.getByTestId("move-count")).toHaveText("0");
  await expect(point(page, 54)).toHaveAttribute("aria-pressed", "true");
  await dragTo(page, 54, 45);
  await page.keyboard.press("Escape");
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByTestId("move-count")).toHaveText("0");
  await dragTo(page, 54, 45);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await expect(page.getByTestId("move-count")).toHaveText("0");
  await point(page, 45).click();
  await expect(page.getByTestId("move-count")).toHaveText("1");
});

test("pointer cancellation removes the drag preview without moving", async ({ page }) => {
  await dragTo(page, 54, 45);
  await point(page, 54).dispatchEvent("pointercancel", { pointerId: 1 });
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByTestId("move-count")).toHaveText("0");
});

test("scope disposal removes the drag preview", async ({ page }) => {
  test.skip(process.env.RIVERGATE_PRODUCTION === "1", "Dev-only scope disposal hook");
  await dragTo(page, 54, 45);
  await page.evaluate(() => window.__rivergate.dispose());
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await expect(page.locator("[data-drag-source]")).toHaveCount(0);
  await page.mouse.up();
});
