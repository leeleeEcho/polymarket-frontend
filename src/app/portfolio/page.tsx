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
  const sizeClass = size === "large" ? "text-xl md:text-2xl font-bold font-mono" : "font-mono";

  return (
    <span
      className={`${sizeClass} ${
        isPositive ? "text-success" : isNegative ? "text-destructive" : "text-muted-foreground"
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
      className="block card-9v p-4 hover-lift"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 pr-4">
          <h3 className="text-foreground font-medium text-sm line-clamp-2">
            {position.market_question || "Unknown Market"}
          </h3>
          <div className="flex items-center space-x-2 mt-1">
            <span
              className={`text-xs px-2 py-0.5 rounded font-mono ${
                position.share_type === "yes"
                  ? "bg-success/20 text-success"
                  : "bg-destructive/20 text-destructive"
              }`}
            >
              {position.share_type.toUpperCase()}
            </span>
            <span className="text-muted-foreground text-xs">{position.outcome_name}</span>
          </div>
        </div>
        <div className="text-right">
          <PnLDisplay value={pnl} />
          <div className={`text-xs font-mono ${pnl >= 0 ? "text-success" : "text-destructive"}`}>
            {formatPercent(pnlPercent)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="metric-label">Shares</div>
          <div className="text-foreground font-mono">{formatNumber(position.amount, 0)}</div>
        </div>
        <div>
          <div className="metric-label">Avg Cost</div>
          <div className="text-foreground font-mono">{formatNumber(position.avg_cost, 4)}</div>
        </div>
        <div>
          <div className="metric-label">Current</div>
          <div className="text-foreground font-mono">{formatNumber(position.current_price, 4)}</div>
        </div>
      </div>
    </Link>
  );
}

function TradeRow({ trade }: { trade: UserTrade }) {
  const isBuy = trade.side === "buy";
  const date = new Date(trade.timestamp);

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
      <div className="flex items-center space-x-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isBuy ? "bg-success/20" : "bg-destructive/20"
          }`}
        >
          <span className={`text-xs font-medium ${isBuy ? "text-success" : "text-destructive"}`}>
            {isBuy ? "B" : "S"}
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-foreground text-sm">
            {isBuy ? "Bought" : "Sold"} {formatNumber(trade.amount, 0)}{" "}
            <span className={trade.share_type === "yes" ? "text-success" : "text-destructive"}>
              {trade.share_type.toUpperCase()}
            </span>
          </div>
          <div className="text-muted-foreground text-xs font-mono">
            @ {formatNumber(trade.price, 4)} USDC
          </div>
        </div>
      </div>
      <div className="text-right flex-shrink-0 ml-2">
        <div className="text-foreground text-sm font-mono">
          {formatNumber(parseFloat(trade.price) * parseFloat(trade.amount))} USDC
        </div>
        <div className="text-muted-foreground text-xs">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// Mobile order card component
function OrderCard({ order, onCancel }: { order: any; onCancel: (id: string) => void }) {
  return (
    <div className="bg-secondary rounded-lg p-4 mb-3 last:mb-0">
      <div className="flex justify-between items-start mb-3">
        <Link
          href={`/market/${order.market_id}`}
          className="text-foreground hover:text-foreground/80 text-sm font-medium font-mono"
        >
          {order.market_id.slice(0, 8)}...
        </Link>
        <span className="text-warning text-xs font-mono">{order.status}</span>
      </div>

      <div className="flex items-center space-x-2 mb-3">
        <span
          className={`px-2 py-1 rounded text-xs font-mono ${
            order.side === "buy"
              ? "bg-success/20 text-success"
              : "bg-destructive/20 text-destructive"
          }`}
        >
          {order.side.toUpperCase()}
        </span>
        <span
          className={`text-xs font-mono ${
            order.share_type === "yes" ? "text-success" : "text-destructive"
          }`}
        >
          {order.share_type.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm mb-3">
        <div>
          <div className="metric-label">Price</div>
          <div className="text-foreground font-mono">{formatNumber(order.price, 4)}</div>
        </div>
        <div>
          <div className="metric-label">Amount</div>
          <div className="text-foreground font-mono">{formatNumber(order.amount, 0)}</div>
        </div>
        <div>
          <div className="metric-label">Filled</div>
          <div className="text-muted-foreground font-mono">{formatNumber(order.filled_amount, 0)}</div>
        </div>
      </div>

      <button
        onClick={() => onCancel(order.id)}
        className="w-full py-2 bg-destructive/20 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/30 transition"
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
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
          <div className="card-9v p-8 md:p-12 text-center">
            <h2 className="text-lg md:text-xl font-medium text-foreground mb-4">Connect Your Wallet</h2>
            <p className="text-muted-foreground text-sm md:text-base">Please connect your wallet to view your portfolio.</p>
          </div>
        </main>
        {/* Mobile Bottom Navigation */}
        <MobileNav active="portfolio" />
      </div>
    );
  }

  const openOrders = orders.filter((o) => ["open", "pending", "partially_filled"].includes(o.status));

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
        {/* Portfolio Summary */}
        <div className="card-9v p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="status-dot status-dot-green" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Portfolio
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-light text-foreground mb-4 md:mb-6">Your Holdings</h1>

          {portfolioLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent"></div>
            </div>
          ) : portfolio ? (
            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-4 md:gap-6">
              {/* Total Value - Full width on mobile */}
              <div className="col-span-2 bg-secondary rounded-lg p-4 md:bg-transparent md:p-0">
                <div className="metric-label mb-1">Total Portfolio Value</div>
                <div className="text-2xl md:text-3xl font-bold text-foreground font-mono">
                  ${formatNumber(portfolio.total_portfolio_value)}
                </div>
              </div>

              {/* Unrealized P&L */}
              <div className="bg-secondary rounded-lg p-4 md:bg-transparent md:p-0">
                <div className="metric-label mb-1">Unrealized P&L</div>
                <PnLDisplay value={portfolio.total_unrealized_pnl} size="large" />
                <div
                  className={`text-sm font-mono ${
                    parseFloat(portfolio.total_unrealized_pnl) >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {formatPercent(portfolio.unrealized_pnl_percent)}
                </div>
              </div>

              {/* Realized P&L */}
              <div className="bg-secondary rounded-lg p-4 md:bg-transparent md:p-0">
                <div className="metric-label mb-1">Realized P&L</div>
                <PnLDisplay value={portfolio.realized_pnl} size="large" />
              </div>

              {/* Additional stats - 2x2 grid on mobile */}
              <div className="grid grid-cols-2 gap-3 col-span-2 md:col-span-4 md:grid-cols-4 md:gap-6 md:mt-4">
                <div className="bg-secondary rounded-lg p-3 md:bg-transparent md:p-0">
                  <div className="metric-label mb-1">Position Value</div>
                  <div className="text-lg md:text-xl text-foreground font-mono">${formatNumber(portfolio.total_position_value)}</div>
                </div>

                <div className="bg-secondary rounded-lg p-3 md:bg-transparent md:p-0">
                  <div className="metric-label mb-1">Cost Basis</div>
                  <div className="text-lg md:text-xl text-foreground font-mono">${formatNumber(portfolio.total_cost_basis)}</div>
                </div>

                <div className="bg-secondary rounded-lg p-3 md:bg-transparent md:p-0">
                  <div className="metric-label mb-1">Available USDC</div>
                  <div className="text-lg md:text-xl text-foreground font-mono">${formatNumber(portfolio.available_balance)}</div>
                </div>

                <div className="bg-secondary rounded-lg p-3 md:bg-transparent md:p-0">
                  <div className="metric-label mb-1">In Orders</div>
                  <div className="text-lg md:text-xl text-foreground font-mono">${formatNumber(portfolio.frozen_balance)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No portfolio data available
            </div>
          )}
        </div>

        {/* Tabs - Horizontal scroll on mobile */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-4 md:mb-6">
          <div className="flex space-x-1 bg-secondary p-1 rounded-lg w-fit min-w-full md:min-w-0 md:w-fit">
            <button
              onClick={() => setActiveTab("positions")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
                activeTab === "positions"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Positions ({shares.length})
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
                activeTab === "orders"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Orders ({openOrders.length})
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
                activeTab === "history"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
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
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent"></div>
              </div>
            ) : shares.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {shares.map((position) => (
                  <PositionCard key={position.id} position={position} />
                ))}
              </div>
            ) : (
              <div className="card-9v p-8 md:p-12 text-center">
                <p className="text-muted-foreground mb-4">No positions yet</p>
                <Link
                  href="/"
                  className="inline-block px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 transition font-medium"
                >
                  Explore Markets
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === "orders" && (
          <div className="card-9v">
            {ordersLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent"></div>
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
                      <tr className="text-muted-foreground text-sm border-b border-border">
                        <th className="text-left p-4 font-medium">Market</th>
                        <th className="text-left p-4 font-medium">Side</th>
                        <th className="text-right p-4 font-medium">Price</th>
                        <th className="text-right p-4 font-medium">Amount</th>
                        <th className="text-right p-4 font-medium">Filled</th>
                        <th className="text-right p-4 font-medium">Status</th>
                        <th className="text-right p-4 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openOrders.map((order) => (
                        <tr key={order.id} className="border-b border-border last:border-b-0 hover:bg-secondary/50 transition">
                          <td className="p-4">
                            <Link
                              href={`/market/${order.market_id}`}
                              className="text-foreground hover:text-foreground/80 font-mono"
                            >
                              {order.market_id.slice(0, 8)}...
                            </Link>
                            <div
                              className={`text-xs font-mono ${
                                order.share_type === "yes" ? "text-success" : "text-destructive"
                              }`}
                            >
                              {order.share_type.toUpperCase()}
                            </div>
                          </td>
                          <td className="p-4">
                            <span
                              className={`px-2 py-1 rounded text-xs font-mono ${
                                order.side === "buy"
                                  ? "bg-success/20 text-success"
                                  : "bg-destructive/20 text-destructive"
                              }`}
                            >
                              {order.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-4 text-right text-foreground font-mono">{formatNumber(order.price, 4)}</td>
                          <td className="p-4 text-right text-foreground font-mono">{formatNumber(order.amount, 0)}</td>
                          <td className="p-4 text-right text-muted-foreground font-mono">
                            {formatNumber(order.filled_amount, 0)}
                          </td>
                          <td className="p-4 text-right">
                            <span className="text-warning text-sm font-mono">{order.status}</span>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => cancelOrder(order.id)}
                              className="text-destructive hover:text-destructive/80 text-sm font-medium"
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
              <div className="p-8 md:p-12 text-center text-muted-foreground">No open orders</div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="card-9v p-4">
            {tradesLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent"></div>
              </div>
            ) : trades.length > 0 ? (
              <div className="divide-y divide-border">
                {trades.map((trade) => (
                  <TradeRow key={trade.id} trade={trade} />
                ))}
              </div>
            ) : (
              <div className="p-8 md:p-12 text-center text-muted-foreground">No trade history</div>
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
function MobileNav({ active }: { active: "markets" | "portfolio" | "p2p" }) {
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
            <span className="text-xs mt-1 font-medium">Markets</span>
          </Link>
          <Link
            href="/p2p"
            className={`flex flex-col items-center ${
              active === "p2p" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs mt-1">P2P</span>
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
            <span className="text-xs mt-1 font-medium">Portfolio</span>
          </Link>
        </div>
      </nav>
      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:hidden" />
    </>
  );
}
