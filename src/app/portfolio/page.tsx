"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Header } from "@/components/Header";
import { usePortfolio, useShares, useOrders, useUserTrades, SharePosition, UserTrade } from "@/hooks/useApi";

function formatNumber(value: string | number, decimals = 2): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00%";
  return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
}

function PnLDisplay({ value, size = "normal" }: { value: string | number; size?: "normal" | "large" }) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  const isPositive = num > 0;
  const isNegative = num < 0;
  const sizeClass = size === "large" ? "text-xl md:text-2xl font-bold" : "";

  return (
    <span
      className={`${sizeClass} ${
        isPositive ? "text-green-400" : isNegative ? "text-red-400" : "text-gray-400"
      }`}
    >
      {isPositive ? "+" : ""}
      {formatNumber(num)}
    </span>
  );
}

function PositionCard({ position }: { position: SharePosition }) {
  const pnl = parseFloat(position.unrealized_pnl);
  const pnlPercent = parseFloat(position.avg_cost) > 0
    ? ((parseFloat(position.current_price) - parseFloat(position.avg_cost)) / parseFloat(position.avg_cost)) * 100
    : 0;

  return (
    <Link
      href={`/market/${position.market_id}`}
      className="block bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-gray-600 transition active:scale-[0.98]"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 pr-4">
          <h3 className="text-white font-medium text-sm line-clamp-2">
            {position.market_question || "Unknown Market"}
          </h3>
          <div className="flex items-center space-x-2 mt-1">
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                position.share_type === "yes"
                  ? "bg-green-900/50 text-green-400"
                  : "bg-red-900/50 text-red-400"
              }`}
            >
              {position.share_type.toUpperCase()}
            </span>
            <span className="text-gray-500 text-xs">{position.outcome_name}</span>
          </div>
        </div>
        <div className="text-right">
          <PnLDisplay value={pnl} />
          <div className={`text-xs ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatPercent(pnlPercent)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-gray-500 text-xs">Shares</div>
          <div className="text-white">{formatNumber(position.amount, 0)}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Avg Cost</div>
          <div className="text-white">{formatNumber(position.avg_cost, 4)}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Current</div>
          <div className="text-white">{formatNumber(position.current_price, 4)}</div>
        </div>
      </div>
    </Link>
  );
}

function TradeRow({ trade }: { trade: UserTrade }) {
  const isBuy = trade.side === "buy";
  const date = new Date(trade.timestamp);

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-700 last:border-b-0">
      <div className="flex items-center space-x-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isBuy ? "bg-green-900/50" : "bg-red-900/50"
          }`}
        >
          <span className={`text-xs font-medium ${isBuy ? "text-green-400" : "text-red-400"}`}>
            {isBuy ? "B" : "S"}
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-white text-sm">
            {isBuy ? "Bought" : "Sold"} {formatNumber(trade.amount, 0)}{" "}
            <span className={trade.share_type === "yes" ? "text-green-400" : "text-red-400"}>
              {trade.share_type.toUpperCase()}
            </span>
          </div>
          <div className="text-gray-500 text-xs">
            @ {formatNumber(trade.price, 4)} USDC
          </div>
        </div>
      </div>
      <div className="text-right flex-shrink-0 ml-2">
        <div className="text-white text-sm">
          {formatNumber(parseFloat(trade.price) * parseFloat(trade.amount))} USDC
        </div>
        <div className="text-gray-500 text-xs">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// Mobile order card component
function OrderCard({ order, onCancel }: { order: any; onCancel: (id: string) => void }) {
  return (
    <div className="bg-gray-700/50 rounded-lg p-4 mb-3 last:mb-0">
      <div className="flex justify-between items-start mb-3">
        <Link
          href={`/market/${order.market_id}`}
          className="text-white hover:text-primary-400 text-sm font-medium"
        >
          {order.market_id.slice(0, 8)}...
        </Link>
        <span className="text-yellow-400 text-xs">{order.status}</span>
      </div>

      <div className="flex items-center space-x-2 mb-3">
        <span
          className={`px-2 py-1 rounded text-xs ${
            order.side === "buy"
              ? "bg-green-900/50 text-green-400"
              : "bg-red-900/50 text-red-400"
          }`}
        >
          {order.side.toUpperCase()}
        </span>
        <span
          className={`text-xs ${
            order.share_type === "yes" ? "text-green-400" : "text-red-400"
          }`}
        >
          {order.share_type.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm mb-3">
        <div>
          <div className="text-gray-500 text-xs">Price</div>
          <div className="text-white">{formatNumber(order.price, 4)}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Amount</div>
          <div className="text-white">{formatNumber(order.amount, 0)}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">Filled</div>
          <div className="text-gray-400">{formatNumber(order.filled_amount, 0)}</div>
        </div>
      </div>

      <button
        onClick={() => onCancel(order.id)}
        className="w-full py-2 bg-red-900/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-900/50 transition"
      >
        Cancel Order
      </button>
    </div>
  );
}

export default function PortfolioPage() {
  const { isConnected, address } = useAccount();
  const { portfolio, loading: portfolioLoading, fetchPortfolio } = usePortfolio();
  const { shares, loading: sharesLoading, fetchShares } = useShares();
  const { orders, loading: ordersLoading, fetchOrders, cancelOrder } = useOrders();
  const { trades, loading: tradesLoading, fetchUserTrades } = useUserTrades();

  const [activeTab, setActiveTab] = useState<"positions" | "orders" | "history">("positions");

  useEffect(() => {
    if (isConnected) {
      fetchPortfolio();
      fetchShares();
      fetchOrders();
      fetchUserTrades();
    }
  }, [isConnected, fetchPortfolio, fetchShares, fetchOrders, fetchUserTrades]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-900 pb-20 md:pb-0">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 md:p-12 text-center">
            <h2 className="text-lg md:text-xl font-bold text-white mb-4">Connect Your Wallet</h2>
            <p className="text-gray-400 text-sm md:text-base">Please connect your wallet to view your portfolio.</p>
          </div>
        </main>
        {/* Mobile Bottom Navigation */}
        <MobileNav active="portfolio" />
      </div>
    );
  }

  const openOrders = orders.filter((o) => ["open", "pending", "partially_filled"].includes(o.status));

  return (
    <div className="min-h-screen bg-gray-900 pb-20 md:pb-0">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
        {/* Portfolio Summary */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 md:p-6 mb-4 md:mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6">Portfolio</h1>

          {portfolioLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : portfolio ? (
            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-4 md:gap-6">
              {/* Total Value - Full width on mobile */}
              <div className="col-span-2 bg-gray-700/30 rounded-lg p-4 md:bg-transparent md:p-0">
                <div className="text-gray-400 text-sm mb-1">Total Portfolio Value</div>
                <div className="text-2xl md:text-3xl font-bold text-white">
                  ${formatNumber(portfolio.total_portfolio_value)}
                </div>
              </div>

              {/* Unrealized P&L */}
              <div className="bg-gray-700/30 rounded-lg p-4 md:bg-transparent md:p-0">
                <div className="text-gray-400 text-sm mb-1">Unrealized P&L</div>
                <PnLDisplay value={portfolio.total_unrealized_pnl} size="large" />
                <div
                  className={`text-sm ${
                    parseFloat(portfolio.total_unrealized_pnl) >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {formatPercent(portfolio.unrealized_pnl_percent)}
                </div>
              </div>

              {/* Realized P&L */}
              <div className="bg-gray-700/30 rounded-lg p-4 md:bg-transparent md:p-0">
                <div className="text-gray-400 text-sm mb-1">Realized P&L</div>
                <PnLDisplay value={portfolio.realized_pnl} size="large" />
              </div>

              {/* Additional stats - 2x2 grid on mobile */}
              <div className="grid grid-cols-2 gap-3 col-span-2 md:col-span-4 md:grid-cols-4 md:gap-6 md:mt-4">
                <div className="bg-gray-700/30 rounded-lg p-3 md:bg-transparent md:p-0">
                  <div className="text-gray-400 text-xs md:text-sm mb-1">Position Value</div>
                  <div className="text-lg md:text-xl text-white">${formatNumber(portfolio.total_position_value)}</div>
                </div>

                <div className="bg-gray-700/30 rounded-lg p-3 md:bg-transparent md:p-0">
                  <div className="text-gray-400 text-xs md:text-sm mb-1">Cost Basis</div>
                  <div className="text-lg md:text-xl text-white">${formatNumber(portfolio.total_cost_basis)}</div>
                </div>

                <div className="bg-gray-700/30 rounded-lg p-3 md:bg-transparent md:p-0">
                  <div className="text-gray-400 text-xs md:text-sm mb-1">Available USDC</div>
                  <div className="text-lg md:text-xl text-white">${formatNumber(portfolio.available_balance)}</div>
                </div>

                <div className="bg-gray-700/30 rounded-lg p-3 md:bg-transparent md:p-0">
                  <div className="text-gray-400 text-xs md:text-sm mb-1">In Orders</div>
                  <div className="text-lg md:text-xl text-white">${formatNumber(portfolio.frozen_balance)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              No portfolio data available
            </div>
          )}
        </div>

        {/* Tabs - Horizontal scroll on mobile */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-4 md:mb-6">
          <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg w-fit min-w-full md:min-w-0 md:w-fit">
            <button
              onClick={() => setActiveTab("positions")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
                activeTab === "positions"
                  ? "bg-primary-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Positions ({shares.length})
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
                activeTab === "orders"
                  ? "bg-primary-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Orders ({openOrders.length})
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
                activeTab === "history"
                  ? "bg-primary-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              History
            </button>
          </div>
        </div>

        {/* Positions Tab */}
        {activeTab === "positions" && (
          <div>
            {sharesLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            ) : shares.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {shares.map((position) => (
                  <PositionCard key={position.id} position={position} />
                ))}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 md:p-12 text-center">
                <p className="text-gray-400 mb-4">No positions yet</p>
                <Link
                  href="/"
                  className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                >
                  Explore Markets
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === "orders" && (
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            {ordersLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            ) : openOrders.length > 0 ? (
              <>
                {/* Mobile view - Cards */}
                <div className="md:hidden p-4">
                  {openOrders.map((order) => (
                    <OrderCard key={order.id} order={order} onCancel={cancelOrder} />
                  ))}
                </div>

                {/* Desktop view - Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-gray-400 text-sm border-b border-gray-700">
                        <th className="text-left p-4">Market</th>
                        <th className="text-left p-4">Side</th>
                        <th className="text-right p-4">Price</th>
                        <th className="text-right p-4">Amount</th>
                        <th className="text-right p-4">Filled</th>
                        <th className="text-right p-4">Status</th>
                        <th className="text-right p-4">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openOrders.map((order) => (
                        <tr key={order.id} className="border-b border-gray-700 last:border-b-0">
                          <td className="p-4">
                            <Link
                              href={`/market/${order.market_id}`}
                              className="text-white hover:text-primary-400"
                            >
                              {order.market_id.slice(0, 8)}...
                            </Link>
                            <div
                              className={`text-xs ${
                                order.share_type === "yes" ? "text-green-400" : "text-red-400"
                              }`}
                            >
                              {order.share_type.toUpperCase()}
                            </div>
                          </td>
                          <td className="p-4">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                order.side === "buy"
                                  ? "bg-green-900/50 text-green-400"
                                  : "bg-red-900/50 text-red-400"
                              }`}
                            >
                              {order.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-4 text-right text-white">{formatNumber(order.price, 4)}</td>
                          <td className="p-4 text-right text-white">{formatNumber(order.amount, 0)}</td>
                          <td className="p-4 text-right text-gray-400">
                            {formatNumber(order.filled_amount, 0)}
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-yellow-400 text-sm">{order.status}</span>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => cancelOrder(order.id)}
                              className="text-red-400 hover:text-red-300 text-sm"
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-8 md:p-12 text-center text-gray-400">No open orders</div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            {tradesLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            ) : trades.length > 0 ? (
              <div className="divide-y divide-gray-700">
                {trades.map((trade) => (
                  <TradeRow key={trade.id} trade={trade} />
                ))}
              </div>
            ) : (
              <div className="p-8 md:p-12 text-center text-gray-400">No trade history</div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav active="portfolio" />
    </div>
  );
}

// Mobile bottom navigation component
function MobileNav({ active }: { active: "markets" | "portfolio" }) {
  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 md:hidden z-40">
        <div className="flex items-center justify-around py-3">
          <Link
            href="/"
            className={`flex flex-col items-center ${
              active === "markets" ? "text-primary-400" : "text-gray-400"
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
              active === "portfolio" ? "text-primary-400" : "text-gray-400"
            }`}
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
    </>
  );
}
