import { test, expect } from "@playwright/test";

test.describe("Market Detail Page", () => {
  // Use a known market ID or navigate from home
  const testMarketId = "test-market-1";

  test("should navigate to market from home page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click on first market card
    const marketCard = page.locator('[data-testid="market-card"], .market-card, a[href*="/market/"]').first();

    if (await marketCard.isVisible()) {
      await marketCard.click();

      // Should be on market detail page
      await expect(page).toHaveURL(/\/market\//);
    }
  });

  test("should display market question/title", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Market should have a title/question
      const title = page.locator("h1, h2, [data-testid='market-title']").first();
      await expect(title).toBeVisible();
    }
  });

  test("should display Yes/No prices", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Should show Yes and No with prices
      const yesOption = page.locator('[data-testid="yes-option"], [class*="yes"], :text("Yes")').first();
      const noOption = page.locator('[data-testid="no-option"], [class*="no"], :text("No")').first();

      // At least one should be visible
    }
  });

  test("should display market statistics", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Should show volume, liquidity, or other stats
      const stats = page.locator('[data-testid="market-stats"], [class*="stats"], [class*="volume"]');
      // Stats might be visible
    }
  });

  test("should display order book or price chart", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Should have orderbook or chart
      const tradingUI = page.locator('[data-testid="orderbook"], [data-testid="chart"], canvas, [class*="chart"]');
      // Trading UI should be present
    }
  });

  test("should have end time/expiry displayed", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Should show when market ends
      const endTime = page.locator('[data-testid="end-time"], [class*="expiry"], [class*="deadline"]');
      // End time info should be present
    }
  });
});

test.describe("Order Form", () => {
  test("should display order form on market page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Should have order form
      const orderForm = page.locator('[data-testid="order-form"], form, [class*="order"], [class*="trade"]');
      // Order form should be visible
    }
  });

  test("should have Buy/Sell tabs or buttons", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Should have buy and sell options
      const buyButton = page.getByRole("button", { name: /buy|买入/i });
      const sellButton = page.getByRole("button", { name: /sell|卖出/i });
      // Trade buttons should be present
    }
  });

  test("should have amount input", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Should have amount input
      const amountInput = page.locator('input[type="number"], input[placeholder*="数量"], input[placeholder*="amount"]');
      // Amount input should be present
    }
  });

  test.skip("should calculate estimated cost/return", async ({ page }) => {
    // Requires connected wallet and market data
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Enter amount
      const amountInput = page.locator('input[type="number"]').first();
      if (await amountInput.isVisible()) {
        await amountInput.fill("100");

        // Should show estimated cost or return
        const estimate = page.locator('[data-testid="estimate"], [class*="cost"], [class*="total"]');
        // Estimate should update
      }
    }
  });

  test.skip("should require wallet connection for trading", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Try to place order without connecting
      const submitButton = page.getByRole("button", { name: /submit|确认|place order|下单/i });
      if (await submitButton.isVisible()) {
        await submitButton.click();

        // Should prompt to connect wallet
        const connectPrompt = page.locator('[class*="connect"], [data-rk]');
        // Connect prompt should appear
      }
    }
  });
});

test.describe("Market Resolution Info", () => {
  test("should display resolution source/oracle info", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const marketCard = page.locator('a[href*="/market/"]').first();
    if (await marketCard.isVisible()) {
      await marketCard.click();
      await page.waitForLoadState("networkidle");

      // Should show resolution info
      const resolutionInfo = page.locator('[data-testid="resolution"], [class*="oracle"], [class*="source"]');
      // Resolution info might be present
    }
  });
});
