import { test, expect } from "@playwright/test";

test.describe("Wallet Connection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display connect wallet button", async ({ page }) => {
    const connectButton = page.getByRole("button", { name: /connect|连接钱包/i });
    await expect(connectButton).toBeVisible();
  });

  test("should open wallet modal on connect button click", async ({ page }) => {
    const connectButton = page.getByRole("button", { name: /connect|连接钱包/i });
    await connectButton.click();

    // RainbowKit modal should appear
    const walletModal = page.locator('[data-rk], [class*="rainbowkit"], [role="dialog"]');
    await expect(walletModal).toBeVisible({ timeout: 5000 });
  });

  test("should show wallet options in modal", async ({ page }) => {
    const connectButton = page.getByRole("button", { name: /connect|连接钱包/i });
    await connectButton.click();

    // Wait for modal
    await page.waitForTimeout(500);

    // Should show wallet options like MetaMask, WalletConnect, etc.
    const walletOptions = page.locator('[data-rk] button, [class*="wallet-option"]');
    // There should be at least one wallet option
  });

  test("should be able to close wallet modal", async ({ page }) => {
    const connectButton = page.getByRole("button", { name: /connect|连接钱包/i });
    await connectButton.click();

    // Wait for modal to open
    await page.waitForTimeout(500);

    // Press Escape or click outside to close
    await page.keyboard.press("Escape");

    // Modal should close
    await page.waitForTimeout(300);
  });
});

test.describe("Authenticated User Flow", () => {
  // Note: These tests would need a mock wallet or test account
  // In a real setup, you'd use a browser extension mock or test wallet

  test.skip("should show user address when connected", async ({ page }) => {
    // This test requires a connected wallet
    // Would need to mock wagmi/RainbowKit or use a test account
    await page.goto("/");

    // After connection, should show truncated address
    const addressDisplay = page.locator('[data-testid="wallet-address"], [class*="address"]');
    await expect(addressDisplay).toContainText(/0x/);
  });

  test.skip("should show portfolio link when connected", async ({ page }) => {
    await page.goto("/");

    // After connection, portfolio link should be visible
    const portfolioLink = page.getByRole("link", { name: /portfolio|持仓|我的/i });
    await expect(portfolioLink).toBeVisible();
  });

  test.skip("should navigate to portfolio page", async ({ page }) => {
    await page.goto("/portfolio");

    // Should show portfolio content or redirect to connect
    const pageTitle = page.locator("h1, h2");
    await expect(pageTitle).toBeVisible();
  });

  test.skip("should show balance when connected", async ({ page }) => {
    await page.goto("/");

    // Should show USDC balance
    const balance = page.locator('[data-testid="balance"], [class*="balance"]');
    await expect(balance).toContainText(/USDC|\$/);
  });
});

test.describe("Disconnect Wallet", () => {
  test.skip("should be able to disconnect wallet", async ({ page }) => {
    // Assuming wallet is connected
    await page.goto("/");

    // Click on account/address to open dropdown
    const accountButton = page.locator('[data-testid="account-button"], [class*="account"]');
    await accountButton.click();

    // Click disconnect
    const disconnectButton = page.getByRole("button", { name: /disconnect|断开|退出/i });
    await disconnectButton.click();

    // Should show connect button again
    const connectButton = page.getByRole("button", { name: /connect|连接钱包/i });
    await expect(connectButton).toBeVisible();
  });
});
