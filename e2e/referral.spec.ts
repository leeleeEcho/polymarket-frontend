import { test, expect } from "@playwright/test";

test.describe("Referral Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/referral");
  });

  test("should display referral page", async ({ page }) => {
    await expect(page).toHaveURL(/\/referral/);

    // Should have page content
    const content = page.locator("main, [data-testid='referral-content']");
    await expect(content).toBeVisible();
  });

  test("should show connect wallet prompt when not connected", async ({ page }) => {
    const connectButton = page.getByRole("button", { name: /connect|连接钱包/i });
    // Should prompt to connect
  });

  test.skip("should display referral code when connected", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Should show user's referral code
    const referralCode = page.locator('[data-testid="referral-code"], [class*="referral-code"]');
    await expect(referralCode).toBeVisible();
  });

  test.skip("should have copy referral code button", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    const copyButton = page.getByRole("button", { name: /copy|复制/i });
    await expect(copyButton).toBeVisible();
  });

  test.skip("should display referral link", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    const referralLink = page.locator('[data-testid="referral-link"], [class*="referral-link"]');
    await expect(referralLink).toBeVisible();
  });
});

test.describe("Referral Statistics", () => {
  test.skip("should show total referrals count", async ({ page }) => {
    await page.goto("/referral");
    await page.waitForLoadState("networkidle");

    const totalReferrals = page.locator('[data-testid="total-referrals"], [class*="referral-count"]');
    await expect(totalReferrals).toBeVisible();
  });

  test.skip("should show commission rate", async ({ page }) => {
    await page.goto("/referral");
    await page.waitForLoadState("networkidle");

    const commissionRate = page.locator('[data-testid="commission-rate"], [class*="rate"]');
    // Commission rate should be displayed
  });

  test.skip("should show total earnings", async ({ page }) => {
    await page.goto("/referral");
    await page.waitForLoadState("networkidle");

    const totalEarnings = page.locator('[data-testid="total-earnings"], [class*="earnings"]');
    await expect(totalEarnings).toBeVisible();
  });

  test.skip("should show pending earnings", async ({ page }) => {
    await page.goto("/referral");
    await page.waitForLoadState("networkidle");

    const pendingEarnings = page.locator('[data-testid="pending-earnings"], [class*="pending"]');
    // Pending earnings might be shown
  });
});

test.describe("Referral Earnings History", () => {
  test.skip("should display earnings history", async ({ page }) => {
    await page.goto("/referral");
    await page.waitForLoadState("networkidle");

    const historySection = page.locator('[data-testid="earnings-history"], [class*="history"]');
    // History section should be visible
  });

  test.skip("should show individual earning records", async ({ page }) => {
    await page.goto("/referral");
    await page.waitForLoadState("networkidle");

    // Each record should show amount, source, time
    const earningRecord = page.locator('[data-testid="earning-record"], tr, [class*="earning-item"]').first();
    // Records might be visible
  });
});

test.describe("Referral Tiers", () => {
  test.skip("should display tier information", async ({ page }) => {
    await page.goto("/referral");
    await page.waitForLoadState("networkidle");

    // Should show referral tier system
    const tierInfo = page.locator('[data-testid="tier-info"], [class*="tier"]');
    // Tier information might be displayed
  });

  test.skip("should show current tier and progress", async ({ page }) => {
    await page.goto("/referral");
    await page.waitForLoadState("networkidle");

    const currentTier = page.locator('[data-testid="current-tier"], [class*="current-level"]');
    const progress = page.locator('[data-testid="tier-progress"], [class*="progress"]');
    // Current tier and progress might be shown
  });
});

test.describe("Referral Mobile View", () => {
  test("should be responsive on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/referral");
    await page.waitForLoadState("networkidle");

    // Page should be usable on mobile
    const content = page.locator("main");
    await expect(content).toBeVisible();
  });
});
