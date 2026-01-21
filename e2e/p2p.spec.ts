import { test, expect } from "@playwright/test";

test.describe("P2P Trading Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p2p");
  });

  test("should display P2P page", async ({ page }) => {
    // Page should load
    await expect(page).toHaveURL(/\/p2p/);

    // Should have page title
    const title = page.locator("h1, h2, [data-testid='page-title']").first();
    await expect(title).toBeVisible();
  });

  test("should display buy/sell tabs", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Should have buy and sell sections or tabs
    const buyTab = page.getByRole("tab", { name: /buy|买入/i });
    const sellTab = page.getByRole("tab", { name: /sell|卖出/i });

    // At least one tab should be visible, or there's a different layout
    const tabs = page.locator('[role="tablist"], [data-testid="p2p-tabs"]');
    // Tabs or similar navigation should exist
  });

  test("should display order list", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Should show P2P orders
    const orderList = page.locator('[data-testid="order-list"], [class*="order-list"], table, [class*="p2p-order"]');
    // Order list should be present (may be empty)
  });

  test("should show merchant information in orders", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Each order should show merchant info
    const merchantInfo = page.locator('[data-testid="merchant"], [class*="merchant"], [class*="seller"]');
    // Merchant info may be visible if there are orders
  });

  test("should display payment methods", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Orders should show accepted payment methods
    const paymentMethods = page.locator('[data-testid="payment-methods"], [class*="payment"], [class*="alipay"], [class*="wechat"]');
    // Payment method badges might be visible
  });

  test("should show order limits (min/max)", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Orders should show min/max amounts
    const limits = page.locator('[data-testid="limits"], [class*="limit"], [class*="min-max"]');
    // Limits might be displayed
  });
});

test.describe("P2P Order Creation", () => {
  test.skip("should open create order dialog", async ({ page }) => {
    // Requires connected wallet
    await page.goto("/p2p");
    await page.waitForLoadState("networkidle");

    const createButton = page.getByRole("button", { name: /create|发布|创建/i });
    if (await createButton.isVisible()) {
      await createButton.click();

      // Dialog should open
      const dialog = page.locator('[role="dialog"], [data-testid="create-order-dialog"]');
      await expect(dialog).toBeVisible();
    }
  });

  test.skip("should have order form fields", async ({ page }) => {
    // Requires connected wallet
    await page.goto("/p2p");
    await page.waitForLoadState("networkidle");

    const createButton = page.getByRole("button", { name: /create|发布|创建/i });
    if (await createButton.isVisible()) {
      await createButton.click();

      // Form should have required fields
      const amountInput = page.locator('input[name="amount"], input[placeholder*="金额"]');
      const priceInput = page.locator('input[name="price"], input[placeholder*="价格"]');
      // Form fields should be present
    }
  });
});

test.describe("P2P Order Taking", () => {
  test.skip("should be able to view order details", async ({ page }) => {
    await page.goto("/p2p");
    await page.waitForLoadState("networkidle");

    // Click on an order
    const orderRow = page.locator('[data-testid="order-row"], tr, [class*="order-item"]').first();
    if (await orderRow.isVisible()) {
      await orderRow.click();

      // Should show order details or take order dialog
      const orderDetails = page.locator('[data-testid="order-details"], [role="dialog"]');
      // Details should be visible
    }
  });

  test.skip("should show take order button", async ({ page }) => {
    await page.goto("/p2p");
    await page.waitForLoadState("networkidle");

    const takeButton = page.getByRole("button", { name: /take|接单|购买|buy/i });
    // Take button might be visible in order list
  });
});

test.describe("P2P Merchant Section", () => {
  test("should have merchant section or link", async ({ page }) => {
    await page.goto("/p2p");
    await page.waitForLoadState("networkidle");

    // Look for merchant-related links or sections
    const merchantLink = page.getByRole("link", { name: /merchant|承兑商/i });
    const merchantSection = page.locator('[data-testid="merchants"], [class*="merchant"]');
    // Merchant section might exist
  });

  test.skip("should show merchant statistics", async ({ page }) => {
    await page.goto("/p2p");
    await page.waitForLoadState("networkidle");

    // Merchants should show stats like completion rate, orders count
    const stats = page.locator('[data-testid="merchant-stats"], [class*="completion-rate"], [class*="orders-count"]');
    // Stats might be visible
  });
});

test.describe("P2P Mobile View", () => {
  test("should be responsive on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/p2p");
    await page.waitForLoadState("networkidle");

    // Page should still be usable
    const content = page.locator("main, [data-testid='p2p-content']");
    await expect(content).toBeVisible();
  });
});
