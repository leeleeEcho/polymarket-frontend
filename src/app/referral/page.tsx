"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useSignTypedData } from "wagmi";
import { Header } from "@/components/Header";
import {
  useReferralDashboard,
  useCreateReferralCode,
  useClaimReferralEarnings,
  ReferralActivity,
} from "@/hooks/useApi";

// EIP-712 Domain for referral operations
const REFERRAL_DOMAIN = {
  name: "9V Referral",
  version: "1",
  chainId: 1,
} as const;

// EIP-712 Types
const CREATE_REFERRAL_TYPES = {
  CreateReferral: [
    { name: "wallet", type: "address" },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

function formatNumber(value: string | number, decimals = 2): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function MobileNav() {
  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-40 glass">
        <div className="flex items-center justify-around py-3">
          <Link href="/" className="flex flex-col items-center text-muted-foreground">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1">Markets</span>
          </Link>
          <Link href="/portfolio" className="flex flex-col items-center text-muted-foreground">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs mt-1">Portfolio</span>
          </Link>
          <Link href="/account" className="flex flex-col items-center text-muted-foreground">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs mt-1">Account</span>
          </Link>
        </div>
      </nav>
      <div className="h-16 md:hidden" />
    </>
  );
}

function StatCard({
  label,
  value,
  subValue,
  icon,
  color = "default",
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  color?: "default" | "success" | "warning" | "primary";
}) {
  const colorClass =
    color === "success"
      ? "text-success"
      : color === "warning"
      ? "text-warning"
      : color === "primary"
      ? "text-primary"
      : "text-foreground";

  return (
    <div className="card-9v p-4 md:p-6">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 bg-secondary rounded-lg">{icon}</div>
      </div>
      <div className="metric-label mb-1">{label}</div>
      <div className={`text-xl md:text-2xl font-bold font-mono ${colorClass}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-sm text-muted-foreground mt-1">{subValue}</div>
      )}
    </div>
  );
}

function TierBadge({ tier, name }: { tier: number; name: string }) {
  const colors: Record<number, string> = {
    1: "bg-gray-500/20 text-gray-400",
    2: "bg-yellow-500/20 text-yellow-400",
    3: "bg-purple-500/20 text-purple-400",
    4: "bg-blue-500/20 text-blue-400",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[tier] || colors[1]}`}>
      {name}
    </span>
  );
}

export default function ReferralPage() {
  const { isConnected, address } = useAccount();
  const { dashboard, loading, error, fetchDashboard } = useReferralDashboard();
  const { createCode, loading: creatingCode } = useCreateReferralCode();
  const { claimEarnings, loading: claiming } = useClaimReferralEarnings();
  const { signTypedDataAsync } = useSignTypedData();

  const [copySuccess, setCopySuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "referrals" | "commissions">("overview");
  const [createError, setCreateError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected) {
      fetchDashboard();
    }
  }, [isConnected, fetchDashboard]);

  const handleCreateCode = async () => {
    if (!address) return;
    setCreateError(null);
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await signTypedDataAsync({
        domain: REFERRAL_DOMAIN,
        types: CREATE_REFERRAL_TYPES,
        primaryType: "CreateReferral",
        message: {
          wallet: address as `0x${string}`,
          timestamp: BigInt(timestamp),
        },
      });
      await createCode(timestamp, signature);
      await fetchDashboard();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create referral code");
    }
  };

  const copyReferralLink = async () => {
    if (!dashboard?.code) return;
    const link = `${window.location.origin}?ref=${dashboard.code}`;
    await navigator.clipboard.writeText(link);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const copyReferralCode = async () => {
    if (!dashboard?.code) return;
    await navigator.clipboard.writeText(dashboard.code);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleClaimCommission = async () => {
    if (!dashboard || parseFloat(dashboard.pending_earnings) <= 0) return;
    setClaimError(null);
    try {
      await claimEarnings();
      await fetchDashboard();
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Failed to claim commission");
    }
  };

  // Get tier progress info
  const getTierProgress = () => {
    if (!dashboard) return { current: 0, next: 10, percent: 0, nextTierName: "Gold" };
    const referrals = dashboard.total_referrals;
    const nextReq = dashboard.tier.next_tier_requirement;

    if (!nextReq) {
      return { current: referrals, next: referrals, percent: 100, nextTierName: "Max" };
    }

    const tierThresholds = [0, 10, 50, 100];
    const tierNames = ["Silver", "Gold", "Platinum", "Diamond"];
    const currentTierIndex = dashboard.tier.level - 1;
    const prevThreshold = tierThresholds[currentTierIndex] || 0;

    const progress = referrals - prevThreshold;
    const needed = nextReq - prevThreshold;
    const percent = Math.min((progress / needed) * 100, 100);

    return {
      current: referrals,
      next: nextReq,
      percent,
      nextTierName: tierNames[currentTierIndex + 1] || "Diamond",
    };
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
          <div className="card-9v p-8 md:p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-secondary rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-lg md:text-xl font-medium text-foreground mb-4">Connect Your Wallet</h2>
            <p className="text-muted-foreground text-sm md:text-base">Please connect your wallet to access the referral program.</p>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  const tierProgress = getTierProgress();

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
        {/* Header */}
        <div className="card-9v p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl md:text-2xl font-bold text-foreground">Referral Program</h1>
                {dashboard?.tier && <TierBadge tier={dashboard.tier.level} name={dashboard.tier.name} />}
              </div>
              <p className="text-muted-foreground text-sm md:text-base">
                Invite friends and earn {dashboard?.tier ? `${parseFloat(dashboard.tier.commission_rate) * 100}%` : "10%"} commission on their trading fees
              </p>
            </div>
            <Link
              href="/account"
              className="btn-9v bg-secondary text-foreground hover:bg-secondary/80 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Account
            </Link>
          </div>
        </div>

        {/* Referral Link Card */}
        <div className="card-9v p-4 md:p-6 mb-4 md:mb-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <h2 className="text-lg font-semibold text-foreground mb-4">Your Referral Link</h2>
          {dashboard?.code ? (
            <>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 bg-background rounded-lg p-3 font-mono text-sm overflow-hidden">
                  <span className="text-muted-foreground">{typeof window !== "undefined" ? window.location.origin : ""}?ref=</span>
                  <span className="text-primary">{dashboard.code}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={copyReferralLink}
                    className="btn-9v btn-9v-primary flex items-center gap-2"
                  >
                    {copySuccess ? (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Link
                      </>
                    )}
                  </button>
                  <button
                    onClick={copyReferralCode}
                    className="btn-9v bg-secondary text-foreground hover:bg-secondary/80"
                    title="Copy code only"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Share this link with friends. When they sign up and trade, you earn commission!
              </p>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">You don&apos;t have a referral code yet.</p>
              <button
                onClick={handleCreateCode}
                disabled={creatingCode}
                className="btn-9v btn-9v-primary"
              >
                {creatingCode ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent"></div>
                    Creating...
                  </div>
                ) : (
                  "Generate Referral Code"
                )}
              </button>
              {createError && (
                <p className="text-destructive text-sm mt-2">{createError}</p>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-4 md:mb-6">
          <div className="flex space-x-1 bg-secondary p-1 rounded-lg w-fit min-w-full md:min-w-0 md:w-fit">
            {["overview", "referrals", "commissions"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as typeof activeTab)}
                className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition whitespace-nowrap capitalize ${
                  activeTab === tab
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="card-9v p-8 text-center">
            <p className="text-destructive">{error}</p>
            <button
              onClick={fetchDashboard}
              className="btn-9v btn-9v-primary mt-4"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === "overview" && dashboard && (
              <div className="space-y-4 md:space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  <StatCard
                    label="Total Referrals"
                    value={dashboard.total_referrals.toString()}
                    subValue={`${dashboard.active_referrals} active`}
                    icon={
                      <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    }
                  />
                  <StatCard
                    label="Commission Rate"
                    value={`${parseFloat(dashboard.tier.commission_rate) * 100}%`}
                    subValue={dashboard.tier.name}
                    icon={
                      <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    }
                  />
                  <StatCard
                    label="Total Earned"
                    value={`$${formatNumber(dashboard.total_earnings)}`}
                    color="success"
                    icon={
                      <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                  />
                  <StatCard
                    label="Pending"
                    value={`$${formatNumber(dashboard.pending_earnings)}`}
                    color="warning"
                    icon={
                      <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                  />
                </div>

                {/* Claim Commission Card */}
                <div className="card-9v p-4 md:p-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground mb-1">Pending Commission</h2>
                      <p className="text-muted-foreground text-sm">
                        You have unclaimed commission ready to withdraw
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold font-mono text-warning">
                          ${formatNumber(dashboard.pending_earnings)}
                        </div>
                        <div className="text-sm text-muted-foreground">USDC</div>
                      </div>
                      <button
                        onClick={handleClaimCommission}
                        disabled={claiming || parseFloat(dashboard.pending_earnings) <= 0}
                        className="btn-9v btn-9v-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {claiming ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent"></div>
                            Claiming...
                          </div>
                        ) : (
                          "Claim Now"
                        )}
                      </button>
                    </div>
                  </div>
                  {claimError && (
                    <p className="text-destructive text-sm mt-2">{claimError}</p>
                  )}
                </div>

                {/* Tier Progress */}
                <div className="card-9v p-4 md:p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Tier Progress</h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <TierBadge tier={dashboard.tier.level} name={dashboard.tier.name} />
                      <span className="text-sm text-muted-foreground">
                        Commission Rate: <span className="text-foreground font-medium">{parseFloat(dashboard.tier.commission_rate) * 100}%</span>
                      </span>
                    </div>
                    {dashboard.tier.next_tier_requirement && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Progress to {tierProgress.nextTierName}</span>
                          <span className="text-foreground">{tierProgress.current} / {tierProgress.next} referrals</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${tierProgress.percent}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Reach {tierProgress.next} referrals to unlock {tierProgress.nextTierName} tier
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* How It Works */}
                <div className="card-9v p-4 md:p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">How It Works</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4">
                      <div className="w-12 h-12 mx-auto mb-3 bg-primary/20 rounded-full flex items-center justify-center">
                        <span className="text-xl font-bold text-primary">1</span>
                      </div>
                      <h3 className="font-medium text-foreground mb-1">Share Your Link</h3>
                      <p className="text-sm text-muted-foreground">
                        Share your unique referral link with friends
                      </p>
                    </div>
                    <div className="text-center p-4">
                      <div className="w-12 h-12 mx-auto mb-3 bg-primary/20 rounded-full flex items-center justify-center">
                        <span className="text-xl font-bold text-primary">2</span>
                      </div>
                      <h3 className="font-medium text-foreground mb-1">Friends Trade</h3>
                      <p className="text-sm text-muted-foreground">
                        When they sign up and trade, you both benefit
                      </p>
                    </div>
                    <div className="text-center p-4">
                      <div className="w-12 h-12 mx-auto mb-3 bg-primary/20 rounded-full flex items-center justify-center">
                        <span className="text-xl font-bold text-primary">3</span>
                      </div>
                      <h3 className="font-medium text-foreground mb-1">Earn Commission</h3>
                      <p className="text-sm text-muted-foreground">
                        Claim your commission anytime to your balance
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Referrals Tab - Shows recent activity as referral list proxy */}
            {activeTab === "referrals" && dashboard && (
              <div className="card-9v">
                <div className="p-4 md:p-6 border-b border-border">
                  <h2 className="text-lg font-semibold text-foreground">Your Referrals</h2>
                  <p className="text-sm text-muted-foreground">
                    {dashboard.total_referrals} total referrals, {dashboard.active_referrals} active
                  </p>
                </div>
                {dashboard.recent_activity.length > 0 ? (
                  <div className="divide-y divide-border">
                    {/* Group activities by unique referral addresses */}
                    {Array.from(new Set(dashboard.recent_activity.map(a => a.referral_address))).map((addr, index) => {
                      const activities = dashboard.recent_activity.filter(a => a.referral_address === addr);
                      const totalVolume = activities.reduce((sum, a) => sum + parseFloat(a.volume), 0);
                      const totalCommission = activities.reduce((sum, a) => sum + parseFloat(a.commission), 0);
                      const lastActivity = activities[0];

                      return (
                        <div key={index} className="p-4 md:p-6 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                              <span className="text-sm font-medium text-success">
                                {addr.slice(2, 4).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="font-mono text-foreground">
                                {shortenAddress(addr)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Last activity {formatDate(lastActivity.timestamp)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-foreground font-mono">
                              ${formatNumber(totalVolume)} volume
                            </div>
                            <div className="text-sm text-success">
                              +${formatNumber(totalCommission)} earned
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 md:p-12 text-center text-muted-foreground">
                    <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p>No referrals yet</p>
                    <p className="text-sm mt-2">Share your referral link to get started!</p>
                  </div>
                )}
              </div>
            )}

            {/* Commissions Tab */}
            {activeTab === "commissions" && dashboard && (
              <div className="card-9v">
                <div className="p-4 md:p-6 border-b border-border">
                  <h2 className="text-lg font-semibold text-foreground">Commission History</h2>
                  <div className="flex gap-4 mt-2">
                    <span className="text-sm text-muted-foreground">
                      Total: <span className="text-success">${formatNumber(dashboard.total_earnings)}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Claimed: <span className="text-foreground">${formatNumber(dashboard.claimed_earnings)}</span>
                    </span>
                  </div>
                </div>
                {dashboard.recent_activity.length > 0 ? (
                  <div className="divide-y divide-border">
                    {dashboard.recent_activity.map((activity: ReferralActivity, index: number) => (
                      <div key={index} className="p-4 md:p-6 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-foreground capitalize">
                              {activity.event_type.replace(/_/g, " ")}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              From {shortenAddress(activity.referral_address)} - {formatDate(activity.timestamp)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-success">
                            +${formatNumber(activity.commission)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            from ${formatNumber(activity.volume)} volume
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 md:p-12 text-center text-muted-foreground">
                    <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p>No commission history yet</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
