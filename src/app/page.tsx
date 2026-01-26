"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { MarketCard } from "@/components/MarketCard";
import { DepositPanel } from "@/components/DepositPanel";
import { useMarkets } from "@/hooks/useApi";
import { useAccount } from "wagmi";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "politics", label: "Politics" },
  { id: "sports", label: "Sports" },
  { id: "crypto", label: "Crypto" },
  { id: "entertainment", label: "Entertainment" },
];

export default function Home() {
  const { isConnected } = useAccount();
  const { markets, loading, error, fetchMarkets } = useMarkets();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // Filter markets based on category and search
  const filteredMarkets = markets.filter((market) => {
    const matchesCategory =
      selectedCategory === "all" ||
      market.category?.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch =
      searchQuery === "" ||
      market.question?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      market.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-10">
        {/* Hero Section */}
        <div className="mb-8 md:mb-12">
          <div className="flex items-center gap-2 mb-3">
            <span className="status-dot status-dot-green" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Live Markets
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-light text-foreground mb-3">
            Predict the Future
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Trade on real-world events. Buy and sell shares based on your predictions.
          </p>
        </div>

        {/* Balance Management */}
        {isConnected && <DepositPanel />}

        {/* Search & Filters */}
        <div className="mb-6 md:mb-8">
          {/* Search Bar */}
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-4 py-3 pl-11 text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground/50 transition font-mono text-sm"
            />
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  selectedCategory === category.id
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card-9v p-4">
            <p className="metric-label">Total Markets</p>
            <p className="metric-value text-2xl text-foreground">{markets.length}</p>
          </div>
          <div className="card-9v p-4">
            <p className="metric-label">Active</p>
            <p className="metric-value text-2xl text-success">
              {markets.filter(m => m.status === "open" || m.status === "active").length}
            </p>
          </div>
          <div className="card-9v p-4 hidden md:block">
            <p className="metric-label">Total Volume</p>
            <p className="metric-value text-2xl text-foreground">
              ${markets.reduce((sum, m) => sum + parseFloat(m.total_volume || "0"), 0).toLocaleString()}
            </p>
          </div>
          <div className="card-9v p-4 hidden md:block">
            <p className="metric-label">Network</p>
            <p className="metric-value text-2xl text-info">Sepolia</p>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent mb-4"></div>
            <p className="text-muted-foreground font-mono text-sm">Loading markets...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="card-9v p-6 md:p-8 text-center border-destructive/50">
            <p className="text-destructive mb-4">{error}</p>
            <button
              onClick={fetchMarkets}
              className="btn-9v btn-9v-outline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredMarkets.length === 0 && (
          <div className="card-9v p-8 md:p-12 text-center">
            {markets.length === 0 ? (
              <>
                <p className="text-foreground mb-2">No markets available</p>
                <p className="text-muted-foreground text-sm">
                  Create markets using the admin API to get started.
                </p>
              </>
            ) : (
              <>
                <p className="text-foreground mb-2">No markets found</p>
                <p className="text-muted-foreground text-sm mb-4">
                  Try adjusting your search or category filter.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                  }}
                  className="btn-9v btn-9v-outline"
                >
                  Clear Filters
                </button>
              </>
            )}
          </div>
        )}

        {/* Markets Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMarkets.map((market, index) => (
            <div
              key={market.id}
              className="animate-fadeIn"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <MarketCard market={market} />
            </div>
          ))}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-40 glass">
        <div className="flex items-center justify-around py-3">
          <Link
            href="/"
            className="flex flex-col items-center text-foreground"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1 font-medium">Markets</span>
          </Link>
          <Link
            href="/p2p"
            className="flex flex-col items-center text-muted-foreground hover:text-foreground transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs mt-1">P2P</span>
          </Link>
          <Link
            href="/portfolio"
            className="flex flex-col items-center text-muted-foreground hover:text-foreground transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs mt-1">Portfolio</span>
          </Link>
        </div>
      </nav>

      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:hidden" />
    </div>
  );
}
