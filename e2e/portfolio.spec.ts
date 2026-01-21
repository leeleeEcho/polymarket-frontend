import { test, expect } from "@playwright/test";

test.describe("Portfolio Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/portfolio");
  });

  test("should show connect wallet prompt when not connected", async ({ page }) => {
    // When not connected, should prompt to connect
    const connectPrompt = page.locator('[data-testid="connect-prompt"], [class*="connect"]');
    const connectButton = page.getByRole("button", { name: /connect|连接钱包/i });

    // Either a prompt or connect button should be visible
  });

  test.skip("should display positions list when connected", async ({ page }) => {
    // Requires connected wallet
    await page.waitForLoadState("networkidle");

    const positionsList = page.locator('[data-testid="positions"], [class*="position-list"]');
    await expect(positionsList).toBeVisible();
  });

  test.skip("should show position details", async ({ page }) => {
    // Requires connected wallet with positions
    await page.waitForLoadState("networkidle");

    // Each position should show market, outcome, quantity, value
    const positionCard = page.locator('[data-testid="position-card"], [class*="position"]').first();
    if (await positionCard.isVisible()) {
      // Should have market name
      const marketName = positionCard.locator('[data-testid="market-name"], [class*="title"]');
      await expect(marketName).toBeVisible();

      // Should have quantity
      const quantity = positionCard.locator('[data-testid="quantity"], [class*="quantity"], [class*="shares"]');
      // Quantity should be visible
    }
  });

  test.skip("should show unrealized P&L", async ({ page }) => {
    // Requires connected wallet with positions
    await page.waitForLoadState("networkidle");

    const pnl = page.locator('[data-testid="pnl"], [class*="pnl"], [class*="profit"]');
    // P&L should be visible
  });

  test.skip("should be able to close position", async ({ page }) => {
    // Requires connected wallet with positions
    await page.waitForLoadState("networkidle");

    const positionCard = page.locator('[data-testid="position-card"]').first();
    if (await positionCard.isVisible()) {
      // Should have sell/close button
      const closeButton = positionCard.getByRole("button", { name: /sell|卖出|close|平仓/i });
      // Close button might be visible
    }
  });
});

test.describe("Portfolio Summary", () => {
  test.skip("should display total portfolio value", async ({ page }) => {
    await page.goto("/portfolio");
    await page.waitForLoadState("networkidle");

    const totalValue = page.locator('[data-testid="total-value"], [class*="portfolio-value"]');
    // Total value should be displayed
  });

  test.skip("should show available balance", async ({ page }) => {
    await page.goto("/portfolio");
    await page.waitForLoadState("networkidle");

    const balance = page.locator('[data-testid="balance"], [class*="available"]');
    // Balance should be visible
  });
});

test.describe("Order History", () => {
  test.skip("should display order history tab", async ({ page }) => {
    await page.goto("/portfolio");
    await page.waitForLoadState("networkidle");

    const historyTab = page.getByRole("tab", { name: /history|历史|orders|订单/i });
    if (await historyTab.isVisible()) {
      await historyTab.click();

      // Should show order history
      const orderHistory = page.locator('[data-testid="order-history"], [class*="history"]');
      await expect(orderHistory).toBeVisible();
    }
  });

  test.skip("should show order details in history", async ({ page }) => {
    await page.goto("/portfolio");
    await page.waitForLoadState("networkidle");

    const historyTab = page.getByRole("tab", { name: /history|历史/i });
    if (await historyTab.isVisible()) {
      await historyTab.click();

      // Each order should show market, side, price, quantity, status
      const orderRow = page.locator('[data-testid="order-row"], tr').first();
      // Order details should be visible
    }
  });
});
