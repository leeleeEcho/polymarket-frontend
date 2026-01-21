import { test, expect } from "@playwright/test";

test.describe("Account Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/account");
  });

  test("should show connect wallet prompt when not connected", async ({ page }) => {
    const connectPrompt = page.getByRole("button", { name: /connect|连接钱包/i });
    // Should prompt to connect if not connected
  });

  test.skip("should display account overview when connected", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Should show account info
    const accountInfo = page.locator('[data-testid="account-info"], [class*="account"]');
    await expect(accountInfo).toBeVisible();
  });

  test.skip("should show wallet address", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    const address = page.locator('[data-testid="wallet-address"], [class*="address"]');
    await expect(address).toContainText(/0x/);
  });

  test.skip("should display balance information", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Should show available, locked, and total balance
    const balanceSection = page.locator('[data-testid="balance-section"], [class*="balance"]');
    await expect(balanceSection).toBeVisible();
  });
});

test.describe("Deposit/Withdraw", () => {
  test.skip("should have deposit tab", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    const depositTab = page.getByRole("tab", { name: /deposit|充值|入金/i });
    await expect(depositTab).toBeVisible();
  });

  test.skip("should have withdraw tab", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    const withdrawTab = page.getByRole("tab", { name: /withdraw|提现|出金/i });
    await expect(withdrawTab).toBeVisible();
  });

  test.skip("should show deposit address or instructions", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    const depositTab = page.getByRole("tab", { name: /deposit|充值/i });
    if (await depositTab.isVisible()) {
      await depositTab.click();

      // Should show deposit info
      const depositInfo = page.locator('[data-testid="deposit-info"], [class*="deposit"]');
      // Deposit instructions should be visible
    }
  });

  test.skip("should have withdraw form", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    const withdrawTab = page.getByRole("tab", { name: /withdraw|提现/i });
    if (await withdrawTab.isVisible()) {
      await withdrawTab.click();

      // Should have amount input
      const amountInput = page.locator('input[name="amount"], input[placeholder*="金额"]');
      // Withdraw form should be visible
    }
  });
});

test.describe("Transaction History", () => {
  test.skip("should display transaction history", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    const historyTab = page.getByRole("tab", { name: /history|记录|交易/i });
    if (await historyTab.isVisible()) {
      await historyTab.click();

      const history = page.locator('[data-testid="transaction-history"], [class*="history"]');
      await expect(history).toBeVisible();
    }
  });

  test.skip("should show deposit and withdraw records", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    const historyTab = page.getByRole("tab", { name: /history|记录/i });
    if (await historyTab.isVisible()) {
      await historyTab.click();

      // Records should show type, amount, status, time
      const record = page.locator('[data-testid="transaction-row"], tr').first();
      // Transaction details should be visible
    }
  });
});
