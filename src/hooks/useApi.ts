"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { API_BASE_URL } from "@/lib/wagmi";
import type { Market, Order, Balance, Orderbook, Trade } from "@/types";

// Fetch wrapper with authentication
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  address?: string
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(address && { "X-Test-Address": address }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Hook for fetching markets
export function useMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<{ markets: Market[] }>("/api/v1/markets");
      setMarkets(data.markets || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch markets");
    } finally {
      setLoading(false);
    }
  }, []);

  return { markets, loading, error, fetchMarkets };
}

// Hook for fetching a single market
export function useMarket(marketId: string) {
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMarket = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<Market>(`/api/v1/markets/${marketId}`);
      setMarket(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch market");
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  return { market, loading, error, fetchMarket };
}

// Hook for fetching orderbook
export function useOrderbook(marketId: string, outcomeId: string, shareType: string) {
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderbook = useCallback(async () => {
    if (!marketId || !outcomeId) return;
    setLoading(true);
    setError(null);
    try {
      const symbol = `${marketId}:${outcomeId}:${shareType}`;
      const data = await fetchApi<Orderbook>(`/api/v1/orderbook/${encodeURIComponent(symbol)}`);
      setOrderbook(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch orderbook");
    } finally {
      setLoading(false);
    }
  }, [marketId, outcomeId, shareType]);

  return { orderbook, loading, error, fetchOrderbook, setOrderbook };
}

// Hook for user balance
export function useBalance() {
  const { address } = useAccount();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<{ balances: Balance[] }>(
        "/api/v1/deposit/balance",
        {},
        address
      );
      setBalances(data.balances || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch balance");
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { balances, loading, error, fetchBalance };
}

// Hook for user orders
export function useOrders() {
  const { address } = useAccount();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<{ orders: Order[] }>(
        "/api/v1/orders",
        {},
        address
      );
      setOrders(data.orders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, [address]);

  const cancelOrder = useCallback(async (orderId: string) => {
    if (!address) throw new Error("Wallet not connected");
    await fetchApi(
      `/api/v1/orders/${orderId}`,
      { method: "DELETE" },
      address
    );
    await fetchOrders();
  }, [address, fetchOrders]);

  return { orders, loading, error, fetchOrders, cancelOrder };
}

// Hook for recent trades
export function useTrades(marketId?: string) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = marketId
        ? `/api/v1/markets/${marketId}/trades`
        : "/api/v1/trades";
      const data = await fetchApi<{ trades: Trade[] }>(endpoint);
      setTrades(data.trades || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch trades");
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  return { trades, loading, error, fetchTrades };
}

// Hook for placing orders
export function usePlaceOrder() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeOrder = useCallback(async (orderData: {
    market_id: string;
    outcome_id: string;
    side: "buy" | "sell";
    order_type: "limit" | "market";
    price: string;
    amount: string;
    share_type: "yes" | "no";
    signature: string;
    timestamp: number;
    nonce: number;
  }) => {
    if (!address) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<Order>(
        "/api/v1/orders",
        {
          method: "POST",
          body: JSON.stringify(orderData),
        },
        address
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to place order";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { placeOrder, loading, error };
}

// Hook for deposits
export function useDeposit() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(async (amount: string) => {
    if (!address) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ deposit_id: string; new_balance: string }>(
        "/api/v1/deposit/direct",
        {
          method: "POST",
          body: JSON.stringify({ amount }),
        },
        address
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to deposit";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { deposit, loading, error };
}

// Hook for withdrawals
export function useWithdraw() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(async (amount: string) => {
    if (!address) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ withdraw_id: string; new_balance: string }>(
        "/api/v1/withdraw/direct",
        {
          method: "POST",
          body: JSON.stringify({ amount }),
        },
        address
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to withdraw";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { withdraw, loading, error };
}

// Settlement status response type
export interface SettlementStatus {
  market_id: string;
  market_status: string;
  is_settled: boolean;
  can_settle: boolean;
  potential_payout: string;
  share_count: number;
}

// Settlement result response type
export interface SettlementResult {
  market_id: string;
  settlement_type: string;
  shares_settled: Array<{
    outcome_id: string;
    share_type: string;
    amount: string;
    payout_per_share: string;
    total_payout: string;
  }>;
  total_payout: string;
  message: string;
}

// Hook for market settlement
export function useSettlement(marketId: string) {
  const { address } = useAccount();
  const [status, setStatus] = useState<SettlementStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettlementStatus = useCallback(async () => {
    if (!address || !marketId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<SettlementStatus>(
        `/api/v1/account/settle/${marketId}/status`,
        {},
        address
      );
      setStatus(data);
    } catch (e) {
      // If no shares found, that's not an error
      if (e instanceof Error && e.message.includes("NO_SHARES")) {
        setStatus(null);
      } else {
        setError(e instanceof Error ? e.message : "Failed to fetch settlement status");
      }
    } finally {
      setLoading(false);
    }
  }, [address, marketId]);

  const settleShares = useCallback(async (): Promise<SettlementResult | null> => {
    if (!address || !marketId) throw new Error("Wallet not connected");
    setSettling(true);
    setError(null);
    try {
      const result = await fetchApi<SettlementResult>(
        `/api/v1/account/settle/${marketId}`,
        { method: "POST" },
        address
      );
      // Refresh status after settlement
      await fetchSettlementStatus();
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to settle shares";
      setError(message);
      throw e;
    } finally {
      setSettling(false);
    }
  }, [address, marketId, fetchSettlementStatus]);

  return { status, loading, settling, error, fetchSettlementStatus, settleShares };
}

// Hook for user shares
export interface SharePosition {
  id: string;
  market_id: string;
  outcome_id: string;
  share_type: string;
  amount: string;
  avg_cost: string;
  current_price: string;
  unrealized_pnl: string;
  market_question?: string;
  outcome_name?: string;
}

export function useShares() {
  const { address } = useAccount();
  const [shares, setShares] = useState<SharePosition[]>([]);
  const [totalValue, setTotalValue] = useState("0");
  const [totalCost, setTotalCost] = useState("0");
  const [totalPnl, setTotalPnl] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShares = useCallback(async (marketId?: string) => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = marketId
        ? `/api/v1/account/shares?market_id=${marketId}`
        : "/api/v1/account/shares";
      const data = await fetchApi<{
        shares: SharePosition[];
        total_value: string;
        total_cost: string;
        total_unrealized_pnl: string;
      }>(
        endpoint,
        {},
        address
      );
      setShares(data.shares || []);
      setTotalValue(data.total_value || "0");
      setTotalCost(data.total_cost || "0");
      setTotalPnl(data.total_unrealized_pnl || "0");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch shares");
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { shares, totalValue, totalCost, totalPnl, loading, error, fetchShares };
}

// Portfolio summary type
export interface PortfolioSummary {
  total_position_value: string;
  total_cost_basis: string;
  total_unrealized_pnl: string;
  unrealized_pnl_percent: string;
  available_balance: string;
  frozen_balance: string;
  total_portfolio_value: string;
  active_positions: number;
  open_orders: number;
  realized_pnl: string;
}

// Hook for portfolio summary
export function usePortfolio() {
  const { address } = useAccount();
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolio = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<PortfolioSummary>(
        "/api/v1/account/portfolio",
        {},
        address
      );
      setPortfolio(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch portfolio");
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { portfolio, loading, error, fetchPortfolio };
}

// Hook for user trade history
export interface UserTrade {
  id: string;
  market_id: string;
  outcome_id: string;
  share_type: string;
  side: string;
  price: string;
  amount: string;
  fee: string;
  timestamp: number;
}

export function useUserTrades() {
  const { address } = useAccount();
  const [trades, setTrades] = useState<UserTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserTrades = useCallback(async (marketId?: string) => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = marketId
        ? `/api/v1/account/trades?market_id=${marketId}`
        : "/api/v1/account/trades";
      const data = await fetchApi<{ trades: UserTrade[] }>(
        endpoint,
        {},
        address
      );
      setTrades(data.trades || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch trades");
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { trades, loading, error, fetchUserTrades };
}
