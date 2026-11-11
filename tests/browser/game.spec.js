import { test, expect } from "@playwright/test";
const point = (page, at) => page.locator(`[data-at="${at}"]`);
async function move(page, from, to) {
  await point(page, from).click();
  await point(page, to).click();
}
async function local(page) {
  await page.locator("#mode").selectOption("local");
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".piece")).toHaveCount(32);
});

test("local game, keyed pieces, legal hints, keyboard, flip and labels", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await local(page);
  await page.evaluate(() => {
    window.originalPiece = document.querySelector('[data-piece="red-p-54"]');
  });
  await point(page, 54).click();
  await expect(point(page, 45)).toHaveClass(/legal/);
  await point(page, 45).click();
  await expect(page.getByTestId("move-count")).toHaveText("1");
  expect(
    await page.evaluate(
      () =>
        window.originalPiece ===
        document.querySelector('[data-piece="red-p-54"]'),
    ),
  ).toBe(true);
  await expect(page.locator(".status-card h2")).toHaveText("Đen tới lượt");
  await move(page, 27, 36);
  await expect(page.getByTestId("move-count")).toHaveText("2");
  await point(page, 81).focus();
  await page.keyboard.press("ArrowUp");
  await expect(point(page, 72)).toBeFocused();
  await page.getByRole("button", { name: "Xoay bàn" }).click();
  await point(page, 72).focus();
  await page.keyboard.press("ArrowUp");
  await expect(point(page, 81)).toBeFocused();
  await page.getByRole("button", { name: "Tên tiếng Việt" }).click();
  await expect(page.locator(".piece.latin")).toHaveCount(32);
  await page.getByRole("button", { name: "Lùi nước" }).click();
  await expect(page.getByTestId("move-count")).toHaveText("1");
  expect(errors).toEqual([]);
});

test("real worker returns a legal move while controls stay usable", async ({
  page,
}) => {
  await move(page, 54, 45);
  await page.getByRole("button", { name: "Xoay bàn" }).click();
  await expect(page.getByTestId("move-count")).toHaveText("2", {
    timeout: 15000,
  });
  await expect(page.locator(".status-card h2")).toHaveText("Đỏ tới lượt");
  await page.getByRole("button", { name: "Lùi nước" }).click();
  await expect(page.getByTestId("move-count")).toHaveText("0");
});

test("history is read-only including its final move; save resumes live position", async ({
  page,
}) => {
  await local(page);
  await move(page, 54, 45);
  await move(page, 27, 36);
  await page.getByRole("button", { name: "Về đầu ván" }).click();
  await expect(page.locator(".continue")).toBeVisible();
  await move(page, 56, 47);
  await expect(page.getByTestId("move-count")).toHaveText("2");
  await page.getByRole("button", { name: "Cuối ván", exact: true }).click();
  await expect(page.locator(".continue")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("move-count")).toHaveText("2");
  await expect(page.locator(".continue")).toBeHidden();
  await expect(page.locator("#mode")).toHaveValue("local");
  await page.getByRole("button", { name: "Xem lại", exact: true }).click();
  await expect(page.locator(".status-card h2")).toHaveText("Đang xem lượt 0");
  await expect(page.locator(".status-card h2")).toHaveText("Đang xem lượt 2", {
    timeout: 5000,
  });
  await expect(
    page.getByRole("button", { name: "Xem lại", exact: true }),
  ).toBeVisible();
  await page.locator(".continue").click();
  await move(page, 56, 47);
  await expect(page.getByTestId("move-count")).toHaveText("3");
});

test("confirmations, rules, validated import and download", async ({
  page,
}) => {
  await local(page);
  await move(page, 54, 45);
  await page.getByRole("button", { name: "Ván mới", exact: true }).click();
  await expect(page.locator("#dialog-title")).toHaveText(
    "Bắt đầu một ván mới?",
  );
  await expect(page.locator("dialog")).toContainText(
    "Ván đang chơi sẽ được thay thế.",
  );
  await page.getByRole("button", { name: "Chơi tiếp", exact: true }).click();
  await expect(page.getByTestId("move-count")).toHaveText("1");
  await page.getByRole("button", { name: "Hòa ván", exact: true }).click();
  await page.getByRole("button", { name: "Đồng ý hòa", exact: true }).click();
  await expect(page.locator(".status-card h2")).toHaveText("Ván hòa");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất bản ghi" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "rivergate-game.json",
  );
  await page.getByRole("button", { name: "Mở bản ghi", exact: true }).click();
  await page.locator("#record-text").fill("{bad");
  await page.getByRole("button", { name: "Mở ván này" }).click();
  await expect(page.locator(".import-error")).toContainText("không hợp lệ");
  await expect(page.getByTestId("move-count")).toHaveText("1");
  await page.locator("input[type=file]").setInputFiles({
    name: "game.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        rules: "rivergate-casual-v1",
        mode: "local",
        moves: [
          [54, 45],
          [27, 36],
        ],
        ending: null,
      }),
    ),
  });
  await expect(page.locator("#record-text")).toHaveValue(/rivergate-casual-v1/);
  await page.getByRole("button", { name: "Mở ván này" }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.getByTestId("move-count")).toHaveText("2");
  await page.getByRole("button", { name: "Xin thua", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận xin thua" }).click();
  await expect(page.locator(".status-card h2")).toHaveText("Đen thắng");
  await page.getByRole("button", { name: "Cách chơi" }).click();
  await expect(page.locator(".help-copy")).toContainText(
    "chưa phân xử chiếu/đuổi dai",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Ván mới", exact: true }).click();
  await page.getByRole("button", { name: "Bắt đầu ván mới" }).click();
  await expect(page.getByTestId("move-count")).toHaveText("0");
});
