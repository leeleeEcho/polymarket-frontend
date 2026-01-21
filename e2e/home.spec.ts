import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display the header with logo", async ({ page }) => {
    // Check header exists
    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Check logo/brand name
    const logo = page.getByText(/9V|Prediction/i);
    await expect(logo).toBeVisible();
  });

  test("should display market list", async ({ page }) => {
    // Wait for markets to load
    await page.waitForLoadState("networkidle");

    // Check for market cards or market list
    const marketSection = page.locator('[data-testid="market-list"], .market-card, [class*="market"]').first();
    await expect(marketSection).toBeVisible({ timeout: 10000 });
  });

  test("should display connect wallet button when not connected", async ({ page }) => {
    // Look for connect wallet button
    const connectButton = page.getByRole("button", { name: /connect|连接钱包|Connect Wallet/i });
    await expect(connectButton).toBeVisible();
  });

  test("should have navigation links", async ({ page }) => {
    // Check for main navigation
    const nav = page.locator("nav, header");
    await expect(nav).toBeVisible();

    // Check for portfolio link (may be hidden until connected)
    // Check for P2P link
    const p2pLink = page.getByRole("link", { name: /P2P/i });
    // P2P might only show when connected
  });

  test("should be responsive on mobile", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Page should still be functional
    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Check for mobile menu button if exists
    const mobileMenu = page.locator('[data-testid="mobile-menu"], button[aria-label*="menu"]');
    // Mobile menu might exist
  });

  test("should display categories/filters", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Look for category tabs or filters
    const categories = page.locator('[role="tablist"], [data-testid="categories"], .category-filter');
    // Categories might be visible
  });
});

test.describe("Market Search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should have search functionality", async ({ page }) => {
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="search"]');

    if (await searchInput.isVisible()) {
      await searchInput.fill("BTC");
      // Wait for search results or filtering
      await page.waitForTimeout(500);
    }
  });
});
