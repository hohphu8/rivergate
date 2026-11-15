import { test, expect } from '@playwright/test';
const point = (page, at) => page.locator(`[data-at="${at}"]`);
const count = page => page.getByTestId('move-count');
async function move(page, from, to) { await point(page, from).click(); await point(page, to).click(); }
async function host(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tạo phòng online', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo phòng', exact: true }).click();
  await expect(page.getByLabel('Link mời', { exact: true })).toBeVisible();
  return page.getByLabel('Link mời', { exact: true }).inputValue();
}
async function join(page, link) {
  await page.goto(link);
  await page.getByRole('button', { name: 'Vào phòng được mời', exact: true }).click();
  await expect(page.getByTestId('room-info')).toContainText('Bạn cầm Đen');
  await expect(page.getByTestId('room-info')).toContainText('Đối thủ đang kết nối');
  await expect(page.locator('.own-player strong')).toHaveText('Bạn cầm Đen');
}

test('two independent players, seat ownership, reload, offers and preserved local game', async ({ page, browser, baseURL }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const blackContext = await browser.newContext({ baseURL });
  const strangerContext = await browser.newContext({ baseURL });
  try {
    await page.goto('/'); await page.locator('#mode').selectOption('local');
    await move(page, 54, 45);
    const local = await page.evaluate(() => localStorage.getItem('rivergate.game.v1'));
    const link = await host(page), black = await blackContext.newPage();
    black.on('pageerror', e => errors.push(e.message));
    await join(black, link);
    await expect(page.getByTestId('room-info')).toContainText('Đối thủ đang kết nối');
    await expect(black.getByRole('button', { name: 'Lùi nước' })).toBeDisabled();
    await move(black, 27, 36); await expect(count(black)).toHaveText('0');
    await move(page, 54, 45); await expect(count(black)).toHaveText('1');
    await black.reload(); await expect(black.getByTestId('room-info')).toContainText('Bạn cầm Đen');
    await move(black, 27, 36); await expect(count(page)).toHaveText('2');
    await expect(page.getByTestId('last-move')).toContainText('Đen');
    const stranger = await strangerContext.newPage(); await stranger.goto(link);
    await stranger.getByRole('button', { name: 'Vào phòng được mời' }).click();
    await expect(stranger.locator('.last-notice')).toContainText('đủ hai người');
    await page.getByRole('button', { name: 'Hòa ván', exact: true }).click();
    await page.getByRole('button', { name: 'Đồng ý hòa', exact: true }).click();
    await black.getByRole('button', { name: 'Từ chối đề nghị' }).click();
    await expect(page.locator('.status-card h2')).toHaveText('Đỏ tới lượt');
    await page.getByRole('button', { name: 'Ván mới', exact: true }).click();
    await page.getByRole('button', { name: 'Bắt đầu ván mới', exact: true }).click();
    await black.getByRole('button', { name: 'Chấp nhận đề nghị' }).click();
    await expect(count(page)).toHaveText('0'); await expect(count(black)).toHaveText('0');
    await black.getByRole('button', { name: 'Xin thua', exact: true }).click();
    await black.getByRole('button', { name: 'Xác nhận xin thua', exact: true }).click();
    await expect(page.locator('.status-card h2')).toHaveText('Đỏ thắng');
    expect(await page.evaluate(() => localStorage.getItem('rivergate.game.v1'))).toBe(local);
    await page.getByRole('button', { name: 'Về bàn local' }).click();
    await page.getByRole('button', { name: 'Về local', exact: true }).click();
    await expect(count(page)).toHaveText('1'); await expect(page.locator('#mode')).toHaveValue('local');
    await page.getByRole('button', { name: 'Vào lại phòng' }).click();
    await expect(page.locator('.status-card h2')).toHaveText('Đỏ thắng');
    if (test.info().project.name === 'chromium') {
      await page.screenshot({ path: '.local/online-desktop.png', fullPage: true });
      await black.setViewportSize({ width: 390, height: 844 });
      await black.screenshot({ path: '.local/online-mobile.png', fullPage: true });
      expect(await black.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally { await blackContext.close(); await strangerContext.close(); }
});

test('lost acknowledgement, offline lock and reload recover the canonical board once', async ({ page, context, browser, baseURL }) => {
  const link = await host(page), opponent = await browser.newContext({ baseURL });
  try {
    const black = await opponent.newPage(); await join(black, link);
    await expect(page.getByTestId('room-info')).toContainText('Đối thủ đang kết nối');
    await page.route('**/api/rooms/*/commands', async route => { await route.fetch(); await route.abort('failed'); });
    await move(page, 54, 45);
    await expect(count(black)).toHaveText('1');
    await expect(page.locator('.last-notice')).toContainText('kết nối lại');
    await page.unroute('**/api/rooms/*/commands');
    await page.reload(); await expect(count(page)).toHaveText('1');
    await expect(page.getByTestId('room-info')).toContainText('Đối thủ đang kết nối');
    await context.setOffline(true);
    await expect(page.getByTestId('room-info')).toContainText('Mất kết nối');
    await move(black, 27, 36);
    await move(page, 56, 47); await expect(count(page)).toHaveText('1');
    await context.setOffline(false);
    await expect(count(page)).toHaveText('2');
    await move(page, 56, 47); await expect(count(black)).toHaveText('3');
    await expect(count(page)).toHaveText('3');
  } finally { await context.setOffline(false); await opponent.close(); }
});

test('polling preserves a held piece; history stays read-only while the live room advances', async ({ page, browser, baseURL }) => {
  const link = await host(page), opponent = await browser.newContext({ baseURL });
  try {
    const black = await opponent.newPage(); await join(black, link);
    await expect(page.getByTestId('room-info')).toContainText('Đối thủ đang kết nối');
    await point(page, 54).scrollIntoViewIfNeeded();
    const from = await point(page, 54).boundingBox(), to = await point(page, 45).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down(); await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await expect(page.locator('.drag-ghost')).toBeVisible();
    await page.waitForResponse(response => response.url().includes('/api/rooms/') && response.request().method() === 'GET');
    await expect(page.locator('.drag-ghost')).toBeVisible();
    await page.mouse.up(); await expect(count(black)).toHaveText('1');
    await page.getByRole('button', { name: 'Về đầu ván' }).click();
    await move(black, 27, 36); await expect(count(page)).toHaveText('2');
    await expect(page.getByTestId('last-move')).toHaveText('Chưa có nước đi');
    await move(page, 54, 45); await expect(count(page)).toHaveText('2');
    await page.getByRole('button', { name: 'Trở lại ván đang chơi' }).click();
    await expect(page.getByTestId('last-move')).toContainText('Đen');
    await page.getByRole('button', { name: 'Hòa ván', exact: true }).click();
    await page.getByRole('button', { name: 'Đồng ý hòa', exact: true }).click();
    await black.getByRole('button', { name: 'Chấp nhận đề nghị' }).click();
    await expect(page.locator('.status-card h2')).toHaveText('Ván hòa');
    await expect(black.locator('.status-card h2')).toHaveText('Ván hòa');
  } finally { await opponent.close(); }
});
