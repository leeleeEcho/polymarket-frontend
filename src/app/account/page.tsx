"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Header } from "@/components/Header";
import { usePortfolio, useBalance, useUserTrades, useOrders } from "@/hooks/useApi";

function formatNumber(value: string | number, decimals = 2): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDate(timestamp: number | string): string {
  const date = new Date(typeof timestamp === "string" ? timestamp : timestamp);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
  color?: "default" | "success" | "destructive";
}) {
  const colorClass =
    color === "success"
      ? "text-success"
      : color === "destructive"
      ? "text-destructive"
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

function MobileNav({ active }: { active: string }) {
  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-40 glass">
        <div className="flex items-center justify-around py-3">
          <Link
            href="/"
            className={`flex flex-col items-center ${
              active === "markets" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1">Markets</span>
          </Link>
          <Link
            href="/portfolio"
            className={`flex flex-col items-center ${
              active === "portfolio" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs mt-1">Portfolio</span>
          </Link>
          <Link
            href="/account"
            className={`flex flex-col items-center ${
              active === "account" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs mt-1 font-medium">Account</span>
          </Link>
        </div>
      </nav>
      <div className="h-16 md:hidden" />
    </>
  );
}

export default function AccountPage() {
  const { isConnected, address } = useAccount();
  const { portfolio, loading: portfolioLoading, fetchPortfolio } = usePortfolio();
  const { balances, fetchBalance } = useBalance();
  const { trades, fetchUserTrades } = useUserTrades();
  const { orders, fetchOrders } = useOrders();

  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "settings">("overview");
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (isConnected) {
      fetchPortfolio();
      fetchBalance();
      fetchUserTrades();
      fetchOrders();
    }
  }, [isConnected, fetchPortfolio, fetchBalance, fetchUserTrades, fetchOrders]);

  const copyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
          <div className="card-9v p-8 md:p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-secondary rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-lg md:text-xl font-medium text-foreground mb-4">Connect Your Wallet</h2>
            <p className="text-muted-foreground text-sm md:text-base">Please connect your wallet to view your account.</p>
          </div>
        </main>
        <MobileNav active="account" />
      </div>
    );
  }

  const usdcBalance = balances.find((b) => b.token === "USDC");
  const totalTrades = trades.length;
  const completedOrders = orders.filter((o) => o.status === "filled").length;
  const pnl = portfolio ? parseFloat(portfolio.total_unrealized_pnl) + parseFloat(portfolio.realized_pnl) : 0;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
        {/* Profile Header */}
        <div className="card-9v p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/40 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">
                  {address?.slice(2, 4).toUpperCase()}
                </span>
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-foreground">My Account</h1>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition group"
                >
                  <span className="font-mono text-sm">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                  {copySuccess ? (
                    <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <Link
              href="/referral"
              className="btn-9v btn-9v-primary flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Referral Program
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-4 md:mb-6">
          <div className="flex space-x-1 bg-secondary p-1 rounded-lg w-fit min-w-full md:min-w-0 md:w-fit">
            {["overview", "activity", "settings"].map((tab) => (
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

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-4 md:space-y-6">
            {/* Stats Grid */}
            {portfolioLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <StatCard
                  label="Portfolio Value"
                  value={`$${formatNumber(portfolio?.total_portfolio_value || 0)}`}
                  icon={
                    <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
                <StatCard
                  label="Available Balance"
                  value={`$${formatNumber(usdcBalance?.available || 0)}`}
                  subValue="USDC"
                  icon={
                    <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  }
                />
                <StatCard
                  label="Total P&L"
                  value={`${pnl >= 0 ? "+" : ""}$${formatNumber(Math.abs(pnl))}`}
                  color={pnl >= 0 ? "success" : "destructive"}
                  icon={
                    <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  }
                />
                <StatCard
                  label="Total Trades"
                  value={totalTrades.toString()}
                  subValue={`${completedOrders} filled`}
                  icon={
                    <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  }
                />
              </div>
            )}

            {/* Quick Actions */}
            <div className="card-9v p-4 md:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Link
                  href="/p2p"
                  className="flex flex-col items-center p-4 bg-secondary rounded-lg hover:bg-secondary/80 transition"
                >
                  <svg className="w-6 h-6 text-foreground mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">Deposit</span>
                </Link>
                <Link
                  href="/p2p"
                  className="flex flex-col items-center p-4 bg-secondary rounded-lg hover:bg-secondary/80 transition"
                >
                  <svg className="w-6 h-6 text-foreground mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="text-sm font-medium">Withdraw</span>
                </Link>
                <Link
                  href="/portfolio"
                  className="flex flex-col items-center p-4 bg-secondary rounded-lg hover:bg-secondary/80 transition"
                >
                  <svg className="w-6 h-6 text-foreground mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="text-sm font-medium">Portfolio</span>
                </Link>
                <Link
                  href="/referral"
                  className="flex flex-col items-center p-4 bg-secondary rounded-lg hover:bg-secondary/80 transition"
                >
                  <svg className="w-6 h-6 text-foreground mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  <span className="text-sm font-medium">Invite</span>
                </Link>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="card-9v p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
                <button
                  onClick={() => setActiveTab("activity")}
                  className="text-sm text-muted-foreground hover:text-foreground transition"
                >
                  View All
                </button>
              </div>
              {trades.length > 0 ? (
                <div className="space-y-3">
                  {trades.slice(0, 5).map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            trade.side === "buy" ? "bg-success/20" : "bg-destructive/20"
                          }`}
                        >
                          <span className={`text-xs font-medium ${trade.side === "buy" ? "text-success" : "text-destructive"}`}>
                            {trade.side === "buy" ? "B" : "S"}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm text-foreground">
                            {trade.side === "buy" ? "Bought" : "Sold"}{" "}
                            <span className={trade.share_type === "yes" ? "text-success" : "text-destructive"}>
                              {trade.share_type.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatNumber(trade.amount, 0)} @ {formatNumber(trade.price, 4)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono text-foreground">
                          ${formatNumber(parseFloat(trade.price) * parseFloat(trade.amount))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(trade.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No recent activity
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === "activity" && (
          <div className="card-9v p-4 md:p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Trade History</h2>
            {trades.length > 0 ? (
              <div className="space-y-3">
                {trades.map((trade) => (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between py-3 border-b border-border last:border-b-0"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          trade.side === "buy" ? "bg-success/20" : "bg-destructive/20"
                        }`}
                      >
                        <span className={`text-sm font-medium ${trade.side === "buy" ? "text-success" : "text-destructive"}`}>
                          {trade.side === "buy" ? "B" : "S"}
                        </span>
                      </div>
                      <div>
                        <div className="text-foreground">
                          {trade.side === "buy" ? "Bought" : "Sold"} {formatNumber(trade.amount, 0)}{" "}
                          <span className={trade.share_type === "yes" ? "text-success" : "text-destructive"}>
                            {trade.share_type.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground font-mono">
                          @ {formatNumber(trade.price, 4)} USDC
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-foreground font-mono">
                        ${formatNumber(parseFloat(trade.price) * parseFloat(trade.amount))}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(trade.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p>No trade history yet</p>
                <Link href="/" className="text-primary hover:underline mt-2 inline-block">
                  Start trading
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-4">
            {/* Wallet Info */}
            <div className="card-9v p-4 md:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Wallet Information</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-muted-foreground">Address</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-foreground">{address}</span>
                    <button onClick={copyAddress} className="text-muted-foreground hover:text-foreground">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-muted-foreground">Network</span>
                  <span className="text-foreground">Sepolia Testnet</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-muted-foreground">Connection Status</span>
                  <span className="flex items-center gap-2 text-success">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    Connected
                  </span>
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="card-9v p-4 md:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Preferences</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <div className="text-foreground">Trade Notifications</div>
                    <div className="text-sm text-muted-foreground">Get notified when orders are filled</div>
                  </div>
                  <button className="w-12 h-6 bg-primary rounded-full relative">
                    <span className="absolute right-1 top-1 w-4 h-4 bg-background rounded-full transition"></span>
                  </button>
                </div>
                <div className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-foreground">Market Alerts</div>
                    <div className="text-sm text-muted-foreground">Alerts for market resolution</div>
                  </div>
                  <button className="w-12 h-6 bg-secondary rounded-full relative">
                    <span className="absolute left-1 top-1 w-4 h-4 bg-muted-foreground rounded-full transition"></span>
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="card-9v p-4 md:p-6 border-destructive/20">
              <h2 className="text-lg font-semibold text-destructive mb-4">Danger Zone</h2>
              <p className="text-sm text-muted-foreground mb-4">
                These actions are irreversible. Please proceed with caution.
              </p>
              <button className="btn-9v bg-destructive/20 text-destructive hover:bg-destructive/30">
                Cancel All Orders
              </button>
            </div>
          </div>
        )}
      </main>

      <MobileNav active="account" />
    </div>
  );
}
