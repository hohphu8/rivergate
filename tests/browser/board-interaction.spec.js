import { test, expect } from "@playwright/test";
import { createRequire } from 'node:module';
const { version: gyosVersion } = createRequire(import.meta.url)('gyosjs/package.json');
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

test("last move stays legible across turns, flip, history and undo", async ({ page }) => {
  await expect(page.locator('footer')).toContainText(gyosVersion);
  await point(page, 54).click();
  await point(page, 45).click();
  await expect(point(page, 54)).toHaveClass(/last-from/);
  await expect(point(page, 45)).toHaveClass(/last-to/);
  await expect(page.locator('[data-piece="red-p-54"]')).toHaveClass(/last-moved/);
  await expect(page.getByTestId('last-move')).toHaveText('Nước vừa đi: Đỏ · Tốt a4 → a5');
  await point(page, 27).click();
  await point(page, 36).click();
  await expect(page.locator('.last-moved')).toHaveCount(1);
  await expect(page.locator('[data-piece="black-p-27"]')).toHaveClass(/last-moved/);
  await expect(point(page, 27)).toHaveAttribute('aria-label', /điểm xuất phát/);
  await page.getByRole('button', { name: 'Xoay bàn' }).click();
  await expect(point(page, 36)).toHaveClass(/last-to/);
  await page.getByRole('button', { name: 'Về đầu ván' }).click();
  await expect(page.locator('.last-moved')).toHaveCount(0);
  await expect(page.getByTestId('last-move')).toHaveText('Chưa có nước đi');
  await page.getByRole('button', { name: 'Cuối ván', exact: true }).click();
  await expect(page.getByTestId('last-move')).toContainText('Nước đang xem: Đen');
  await page.locator('.continue').click();
  await page.getByRole('button', { name: 'Lùi nước' }).click();
  await expect(page.locator('[data-piece="red-p-54"]')).toHaveClass(/last-moved/);
  await expect(page.locator('.piece.black').first()).toHaveCSS('background-color', 'rgb(40, 59, 53)');
  await expect(page.locator('.piece.red').first()).toHaveCSS('background-color', 'rgb(251, 239, 205)');
  if (test.info().project.name === 'chromium') {
    await page.screenshot({ path: '.local/feedback-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/feedback-mobile.png', fullPage: true });
  }
});

test("casual repetition warns on the second occurrence and explains the draw", async ({ page }) => {
  const cycle = [[82, 63], [1, 18], [63, 82], [18, 1]];
  for (const [from, to] of cycle) { await point(page, from).click(); await point(page, to).click(); }
  await expect(page.locator('.repetition-note')).toContainText('đã xuất hiện 2 lần');
  for (const [from, to] of cycle) { await point(page, from).click(); await point(page, to).click(); }
  await expect(page.locator('.status-card h2')).toHaveText('Ván hòa');
  await expect(page.locator('.status-card')).toContainText('kể cả khi đang chiếu');
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
