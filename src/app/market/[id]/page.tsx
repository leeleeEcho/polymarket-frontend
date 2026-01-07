"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { TradingPanel } from "@/components/TradingPanel";
import { Orderbook } from "@/components/Orderbook";
import { SettlementPanel } from "@/components/SettlementPanel";
import { MintingPanel } from "@/components/MintingPanel";
import { useMarket, useTrades, useOrders } from "@/hooks/useApi";

// Dynamic import for KlineChart to avoid SSR issues with lightweight-charts
const KlineChart = dynamic(
  () => import("@/components/KlineChart").then((mod) => mod.KlineChart),
  {
    ssr: false,
    loading: () => (
      <div className="bg-gray-800 rounded-xl border border-gray-700 h-[250px] md:h-[350px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    )
  }
);
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAccount } from "wagmi";
import type { Outcome, Trade } from "@/types";

type TabType = "trade" | "orderbook" | "mint" | "history";

export default function MarketPage() {
  const params = useParams();
  const marketId = params.id as string;

  const { isConnected } = useAccount();
  const { market, loading, error, fetchMarket } = useMarket(marketId);
  const { trades, fetchTrades } = useTrades(marketId);
  const { orders, fetchOrders, cancelOrder } = useOrders();
  const { isConnected: wsConnected, subscribe, addHandler } = useWebSocket();

  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("trade");

  useEffect(() => {
    fetchMarket();
    fetchTrades();
  }, [fetchMarket, fetchTrades]);

  useEffect(() => {
    if (isConnected) {
      fetchOrders();
    }
  }, [isConnected, fetchOrders]);

  // Set default selected outcome
  useEffect(() => {
    if (market && market.outcomes.length > 0 && !selectedOutcome) {
      setSelectedOutcome(market.outcomes[0]);
    }
  }, [market, selectedOutcome]);

  // Subscribe to real-time trades
  useEffect(() => {
    if (!wsConnected || !marketId) return;

    subscribe(`trades:${marketId}`);

    const cleanup = addHandler("markettrade", (data: any) => {
      if (data.market_id === marketId) {
        setRecentTrades((prev) => [data, ...prev].slice(0, 20));
      }
    });

    return cleanup;
  }, [wsConnected, marketId, subscribe, addHandler]);

  // Merge API trades with WebSocket trades
  useEffect(() => {
    setRecentTrades(trades);
  }, [trades]);

  const marketOrders = orders.filter((o) => o.market_id === marketId);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Header />
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-900/50 border border-red-700 rounded-xl p-6 text-center">
            <p className="text-red-400">{error || "Market not found"}</p>
            <Link
              href="/"
              className="mt-4 inline-block px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm"
            >
              Back to Markets
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 pb-20 md:pb-0">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
        {/* Breadcrumb - Hidden on mobile */}
        <nav className="hidden md:block mb-6">
          <Link href="/" className="text-gray-400 hover:text-white transition">
            Markets
          </Link>
          <span className="mx-2 text-gray-600">/</span>
          <span className="text-white">{market.category}</span>
        </nav>

        {/* Mobile Back Button */}
        <div className="md:hidden mb-4">
          <Link
            href="/"
            className="inline-flex items-center text-gray-400 hover:text-white transition"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
        </div>

        {/* Market Header */}
        <div className="bg-gray-800 rounded-xl p-4 md:p-6 mb-4 md:mb-6 border border-gray-700">
          <div className="flex items-start justify-between mb-3 md:mb-4">
            <span className="px-2 md:px-3 py-1 bg-primary-900 text-primary-300 text-xs md:text-sm rounded">
              {market.category}
            </span>
            <span
              className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded ${
                market.status === "open"
                  ? "bg-green-900 text-green-300"
                  : market.status === "resolved"
                  ? "bg-blue-900 text-blue-300"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {market.status}
            </span>
          </div>

          <h1 className="text-lg md:text-2xl font-bold text-white mb-3 md:mb-4">{market.question}</h1>

          <p className="text-gray-400 text-sm md:text-base mb-4 md:mb-6 line-clamp-3 md:line-clamp-none">
            {market.description}
          </p>

          {/* Outcome probabilities */}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {market.outcomes.map((outcome) => (
              <button
                key={outcome.id}
                onClick={() => setSelectedOutcome(outcome)}
                className={`p-3 md:p-4 rounded-lg border transition ${
                  outcome.name.toLowerCase() === "yes"
                    ? "bg-green-900/20 border-green-700"
                    : "bg-red-900/20 border-red-700"
                } ${
                  selectedOutcome?.id === outcome.id
                    ? "ring-2 ring-primary-500"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium text-sm md:text-base">{outcome.name}</span>
                  <span
                    className={`text-xl md:text-2xl font-bold ${
                      outcome.name.toLowerCase() === "yes"
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {((Number(outcome.probability) || 0.5) * 100).toFixed(0)}%
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs md:text-sm text-gray-400">
            <span>Volume (24h): ${parseFloat(market.volume_24h || "0").toLocaleString()}</span>
            <span>
              Resolves: {new Date(market.resolution_time).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* K-line Chart */}
        {selectedOutcome && (
          <div className="mb-4 md:mb-6">
            <KlineChart
              marketId={marketId}
              outcomeId={selectedOutcome.id}
              shareType={selectedOutcome.name.toLowerCase() as "yes" | "no"}
              outcomeName={selectedOutcome.name}
            />
          </div>
        )}

        {/* Mobile Tabs */}
        <div className="md:hidden mb-4">
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab("trade")}
              className={`flex-1 py-3 text-sm font-medium transition ${
                activeTab === "trade"
                  ? "text-primary-400 border-b-2 border-primary-400"
                  : "text-gray-400"
              }`}
            >
              Trade
            </button>
            <button
              onClick={() => setActiveTab("orderbook")}
              className={`flex-1 py-3 text-sm font-medium transition ${
                activeTab === "orderbook"
                  ? "text-primary-400 border-b-2 border-primary-400"
                  : "text-gray-400"
              }`}
            >
              Orderbook
            </button>
            {isConnected && (
              <button
                onClick={() => setActiveTab("mint")}
                className={`flex-1 py-3 text-sm font-medium transition ${
                  activeTab === "mint"
                    ? "text-primary-400 border-b-2 border-primary-400"
                    : "text-gray-400"
                }`}
              >
                Mint
              </button>
            )}
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 py-3 text-sm font-medium transition ${
                activeTab === "history"
                  ? "text-primary-400 border-b-2 border-primary-400"
                  : "text-gray-400"
              }`}
            >
              History
            </button>
          </div>
        </div>

        {/* Mobile Tab Content */}
        <div className="md:hidden">
          {activeTab === "trade" && (
            <>
              {selectedOutcome && (market.status === "open" || market.status === "active") && (
                <TradingPanel
                  market={market}
                  selectedOutcome={selectedOutcome}
                  onOutcomeChange={setSelectedOutcome}
                />
              )}
              {(market.status === "resolved" || market.status === "cancelled") && (
                <SettlementPanel
                  marketId={marketId}
                  marketStatus={market.status}
                  winningOutcome={
                    market.outcomes.find(
                      (o) => o.probability === "1" || Number(o.probability) === 1
                    )?.name
                  }
                />
              )}
              {market.status === "paused" && (
                <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-yellow-400 mb-2">
                    Trading Paused
                  </h3>
                  <p className="text-yellow-300/80 text-sm">
                    Trading is temporarily paused for this market.
                  </p>
                </div>
              )}
            </>
          )}

          {activeTab === "orderbook" && selectedOutcome && (
            <Orderbook
              marketId={marketId}
              outcomeId={selectedOutcome.id}
              shareType={selectedOutcome.name.toLowerCase()}
            />
          )}

          {activeTab === "mint" && isConnected && (market.status === "open" || market.status === "active") && (
            <MintingPanel market={market} />
          )}

          {activeTab === "history" && (
            <div className="space-y-4">
              {/* Recent Trades */}
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-400 mb-4">
                  Recent Trades
                </h3>
                {recentTrades.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No trades yet</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {recentTrades.slice(0, 10).map((trade) => (
                      <div key={trade.id} className="flex items-center justify-between text-sm">
                        <span className={trade.side === "buy" ? "text-green-400" : "text-red-400"}>
                          {trade.side.toUpperCase()}
                        </span>
                        <span className="text-white">
                          {parseFloat(trade.amount).toFixed(0)} @ {parseFloat(trade.price).toFixed(2)}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {new Date(trade.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* User Orders */}
              {isConnected && (
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-400 mb-4">Your Orders</h3>
                  {marketOrders.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">No open orders</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {marketOrders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between text-sm bg-gray-700 rounded-lg p-2">
                          <div>
                            <span className={order.side === "buy" ? "text-green-400" : "text-red-400"}>
                              {order.side.toUpperCase()}
                            </span>
                            <span className="text-white ml-2">
                              {parseFloat(order.amount).toFixed(0)} @ {order.price}
                            </span>
                          </div>
                          <button
                            onClick={() => cancelOrder(order.id)}
                            className="text-gray-400 hover:text-red-400 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop Trading Interface */}
        <div className="hidden md:grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orderbook */}
          <div>
            {selectedOutcome && (
              <Orderbook
                marketId={marketId}
                outcomeId={selectedOutcome.id}
                shareType={selectedOutcome.name.toLowerCase()}
              />
            )}
          </div>

          {/* Trading Panel or Settlement Panel */}
          <div className="space-y-6">
            {/* Show Trading Panel for active/open markets */}
            {selectedOutcome && (market.status === "open" || market.status === "active") && (
              <TradingPanel
                market={market}
                selectedOutcome={selectedOutcome}
                onOutcomeChange={setSelectedOutcome}
              />
            )}

            {/* Show Settlement Panel for resolved/cancelled markets */}
            {(market.status === "resolved" || market.status === "cancelled") && (
              <SettlementPanel
                marketId={marketId}
                marketStatus={market.status}
                winningOutcome={
                  market.outcomes.find(
                    (o) => o.probability === "1" || Number(o.probability) === 1
                  )?.name
                }
              />
            )}

            {/* Show paused notice */}
            {market.status === "paused" && (
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-yellow-400 mb-2">
                  Trading Paused
                </h3>
                <p className="text-yellow-300/80 text-sm">
                  Trading is temporarily paused for this market. Please check back later.
                </p>
              </div>
            )}

            {/* Minting Panel for on-chain token operations */}
            {isConnected && (market.status === "open" || market.status === "active") && (
              <MintingPanel market={market} />
            )}
          </div>

          {/* Recent Trades & Orders */}
          <div className="space-y-6">
            {/* Recent Trades */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">
                Recent Trades
              </h3>

              {recentTrades.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  No trades yet
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recentTrades.slice(0, 10).map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span
                        className={
                          trade.side === "buy" ? "text-green-400" : "text-red-400"
                        }
                      >
                        {trade.side.toUpperCase()}
                      </span>
                      <span className="text-white">
                        {parseFloat(trade.amount).toFixed(0)} @ {parseFloat(trade.price).toFixed(2)}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {new Date(trade.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* User Orders */}
            {isConnected && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-400 mb-4">
                  Your Orders
                </h3>

                {marketOrders.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">
                    No open orders
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {marketOrders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between text-sm bg-gray-700 rounded-lg p-2"
                      >
                        <div>
                          <span
                            className={
                              order.side === "buy"
                                ? "text-green-400"
                                : "text-red-400"
                            }
                          >
                            {order.side.toUpperCase()}
                          </span>
                          <span className="text-white ml-2">
                            {parseFloat(order.amount).toFixed(0)} @ {order.price}
                          </span>
                        </div>
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="text-gray-400 hover:text-red-400 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
