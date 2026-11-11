import { test, expect } from "@playwright/test";
const production = process.env.RIVERGATE_PRODUCTION === "1";
async function ready(page) {
  await page.goto("/");
  await expect(page.locator(".piece")).toHaveCount(32);
}
async function move(page, from = 54, to = 45) {
  await page.locator(`[data-at="${from}"]`).click();
  await page.locator(`[data-at="${to}"]`).click();
}
async function controlledWorker(page) {
  await page.addInitScript(() => {
    window.__workers = [];
    window.Worker = class {
      constructor() {
        this.dead = false;
        window.__workers.push(this);
      }
      postMessage(data) {
        this.request = data;
        this.savedHandler = this.onmessage;
      }
      terminate() {
        this.dead = true;
      }
      deliver(type, extra = {}) {
        this.savedHandler({ data: { ...this.request, type, ...extra } });
      }
    };
  });
}

test("undo/reset/history/mode changes terminate workers and reject late replies", async ({
  page,
}) => {
  await controlledWorker(page);
  await ready(page);
  await move(page);
  await expect(page.locator(".status-card h2")).toContainText("suy nghĩ");
  await page.getByRole("button", { name: "Lùi nước" }).click();
  expect(await page.evaluate(() => window.__workers[0].dead)).toBe(true);
  await page.evaluate(() =>
    window.__workers[0].deliver("result", { move: { from: 27, to: 36 } }),
  );
  await expect(page.getByTestId("move-count")).toHaveText("0");
  await move(page);
  await page.getByRole("button", { name: "Ván mới", exact: true }).click();
  await page.getByRole("button", { name: "Bắt đầu ván mới" }).click();
  await page.evaluate(() =>
    window.__workers[1].deliver("result", { move: { from: 27, to: 36 } }),
  );
  await expect(page.getByTestId("move-count")).toHaveText("0");
  await move(page);
  await page.getByRole("button", { name: "Về đầu ván" }).click();
  await page.evaluate(() =>
    window.__workers[2].deliver("result", { move: { from: 27, to: 36 } }),
  );
  await expect(page.getByTestId("move-count")).toHaveText("1");
  await page.locator(".continue").click();
  expect(await page.evaluate(() => window.__workers.length)).toBe(4);
  await page.locator("#mode").selectOption("local");
  await page.evaluate(() => window.__workers[3].deliver("error"));
  await expect(page.locator(".error-box")).toBeHidden();
  expect(await page.evaluate(() => window.__workers.every((w) => w.dead))).toBe(
    true,
  );
  await move(page, 27, 36);
  await expect(page.getByTestId("move-count")).toHaveText("2");
});

test("worker errors offer retry and local fallback, illegal replies cannot corrupt board", async ({
  page,
}) => {
  await controlledWorker(page);
  await ready(page);
  await move(page);
  await page.evaluate(() =>
    window.__workers[0].onerror({ preventDefault() {} }),
  );
  await expect(page.locator(".error-box")).toBeVisible();
  await page.getByRole("button", { name: "Thử lại bot" }).click();
  await page.evaluate(() =>
    window.__workers[1].deliver("result", { move: { from: 4, to: 85 } }),
  );
  await expect(page.locator(".error-box")).toBeVisible();
  await expect(page.locator(".piece")).toHaveCount(32);
  await page.locator("#mode").selectOption("local");
  await move(page, 27, 36);
  await expect(page.getByTestId("move-count")).toHaveText("2");
});

test("blocked storage and corrupt saves are visible and gameplay remains usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw Error("blocked");
      },
    });
  });
  await ready(page);
  await page.locator("#mode").selectOption("local");
  await move(page);
  await expect(page.locator(".save-card")).toContainText("Không lưu được");
  await expect(page.getByTestId("move-count")).toHaveText("1");
  const other = await page.context().newPage();
  await other.addInitScript(() =>
    localStorage.setItem("rivergate.game.v1", "{broken"),
  );
  await ready(other);
  await expect(other.locator(".save-card")).toContainText("Không đọc được");
  await other.close();
});

test("mobile touch targets, reduced motion, keyboard and no horizontal overflow", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.locator("#mode").selectOption("local");
  await move(page);
  await expect(page.getByTestId("move-count")).toHaveText("1");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".piece")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await page.setViewportSize({ width: 320, height: 720 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await page.locator('[data-at="54"]').boundingBox();
  expect(bounds.width).toBeGreaterThanOrEqual(29);
  await page.screenshot({
    path: `.local/mobile-${production ? "production" : "development"}-${browserName}.png`,
    fullPage: true,
  });
});

test("touch input selects and moves pieces without hover", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await ready(page);
    await page.locator("#mode").selectOption("local");
    await page.locator('[data-at="54"]').tap();
    await expect(page.locator('[data-at="45"]')).toHaveClass(/legal/);
    await page.locator('[data-at="45"]').tap();
    await expect(page.getByTestId("move-count")).toHaveText("1");
    await page.getByRole("button", { name: "Xoay bàn" }).tap();
    await page.locator('[data-at="27"]').tap();
    await page.locator('[data-at="36"]').tap();
    await expect(page.getByTestId("move-count")).toHaveText("2");
  } finally {
    await context.close();
  }
});

test("CSP without unsafe-eval supports the reactive UI and real Worker", async ({
  page,
}) => {
  await page.route("**/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; object-src 'none'; base-uri 'none'",
      },
    });
  });
  const violations = [];
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.__violations.push(e.violatedDirective),
    );
  });
  await ready(page);
  await move(page);
  await expect(page.getByTestId("move-count")).toHaveText("2", {
    timeout: 15000,
  });
  expect(await page.evaluate(() => window.__violations)).toEqual(violations);
});

test("scope teardown cancels Worker, replay and event listeners", async ({
  page,
}) => {
  test.skip(
    production,
    "Development-only lifecycle inspection hook is excluded from the production build.",
  );
  await controlledWorker(page);
  await ready(page);
  await move(page);
  await page.evaluate(() => window.__rivergate.dispose());
  expect(await page.evaluate(() => window.__workers.every((w) => w.dead))).toBe(
    true,
  );
  expect(await page.evaluate(() => typeof window.__rivergate)).toBe(
    "undefined",
  );
  await page.evaluate(() =>
    window.__workers[0].deliver("result", { move: { from: 27, to: 36 } }),
  );
  await expect(page.getByTestId("move-count")).toHaveText("1");
});

test("all game resources and the real worker are served locally", async ({
  page,
}) => {
  const external = [],
    workerURLs = [],
    errors = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:")) external.push(r.url());
  });
  page.on("worker", (w) => workerURLs.push(w.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await move(page);
  await expect(page.getByTestId("move-count")).toHaveText("2", {
    timeout: 15000,
  });
  expect(workerURLs).toHaveLength(1);
  expect(workerURLs[0]).toContain(
    production ? "/assets/bot.worker-" : "/src/bot.worker.js",
  );
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  if (production)
    expect(await page.evaluate(() => typeof window.__rivergate)).toBe(
      "undefined",
    );
});
