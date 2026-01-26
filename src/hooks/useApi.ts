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

// Hook for fetching market by slug (Polymarket-style URLs)
export function useMarketBySlug(slug: string) {
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMarketBySlug = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      // Extract the ID suffix from slug (last part after final hyphen)
      const idSuffix = slug.split('-').pop() || '';

      // Fetch all markets and find matching one
      const data = await fetchApi<{ markets: Market[] }>("/api/v1/markets");
      const markets = data.markets || [];

      // Find market where ID ends with the suffix (case insensitive)
      const found = markets.find(m => {
        const cleanId = m.id.replace(/-/g, '').toLowerCase();
        return cleanId.endsWith(idSuffix.toLowerCase());
      });

      if (found) {
        setMarket(found);
      } else {
        // Fallback: try direct UUID lookup if slug looks like a UUID
        if (/^[0-9a-f-]{36}$/i.test(slug)) {
          const directData = await fetchApi<Market>(`/api/v1/markets/${slug}`);
          setMarket(directData);
        } else {
          setError("Market not found");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch market");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  return { market, loading, error, fetchMarketBySlug };
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

// ============================================================================
// CTF Conditional Token Minting Hooks
// ============================================================================

// Token position type
export interface TokenPosition {
  market_id: string;
  market_question: string;
  yes_balance: string;
  no_balance: string;
  yes_token_id: string;
  no_token_id: string;
}

// Position operation result
export interface PositionOperationResult {
  success: boolean;
  tx_hash: string;
  market_id: string;
  amount: string;
  message: string;
}

// Hook for CTF token positions
export function useCtfPositions() {
  const { address } = useAccount();
  const [positions, setPositions] = useState<TokenPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<{ positions: TokenPosition[] }>(
        "/api/v1/ctf/positions",
        {},
        address
      );
      setPositions(data.positions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch positions");
    } finally {
      setLoading(false);
    }
  }, [address]);

  const fetchMarketPosition = useCallback(async (marketId: string) => {
    if (!address) return null;
    try {
      const data = await fetchApi<TokenPosition>(
        `/api/v1/ctf/positions/${marketId}`,
        {},
        address
      );
      return data;
    } catch (e) {
      console.error("Failed to fetch market position:", e);
      return null;
    }
  }, [address]);

  return { positions, loading, error, fetchPositions, fetchMarketPosition };
}

// Hook for splitting position (minting Yes/No tokens from USDC)
export function useSplitPosition() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const splitPosition = useCallback(async (marketId: string, amount: string): Promise<PositionOperationResult> => {
    if (!address) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<PositionOperationResult>(
        "/api/v1/ctf/split",
        {
          method: "POST",
          body: JSON.stringify({ market_id: marketId, amount }),
        },
        address
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to split position";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { splitPosition, loading, error };
}

// Hook for merging positions (burning Yes/No tokens back to USDC)
export function useMergePositions() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mergePositions = useCallback(async (marketId: string, amount: string): Promise<PositionOperationResult> => {
    if (!address) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<PositionOperationResult>(
        "/api/v1/ctf/merge",
        {
          method: "POST",
          body: JSON.stringify({ market_id: marketId, amount }),
        },
        address
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to merge positions";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { mergePositions, loading, error };
}

// Hook for redeeming positions after market resolution
export function useRedeemPositions() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redeemPositions = useCallback(async (marketId: string): Promise<PositionOperationResult> => {
    if (!address) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<PositionOperationResult>(
        "/api/v1/ctf/redeem",
        {
          method: "POST",
          body: JSON.stringify({ market_id: marketId }),
        },
        address
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to redeem positions";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { redeemPositions, loading, error };
}

// ============================================================================
// CTF Order API (On-Chain Settlement)
// ============================================================================

// CTF Order request type (matches backend CreateCtfOrderRequest)
export interface CtfOrderRequest {
  // Market identifiers
  market_id: string;
  outcome_id: string;
  share_type: "yes" | "no";

  // Order parameters
  side: "buy" | "sell";
  price: string;
  amount: string;

  // CTF-specific fields (for on-chain settlement)
  token_id: string;
  maker_amount: string;
  taker_amount: string;
  expiration: number;
  nonce: number;
  fee_rate_bps?: number;
  sig_type?: number;

  // EIP-712 signature
  signature: string;
}

// CTF Order response type
export interface CtfOrderResponse {
  order_id: string;
  market_id: string;
  outcome_id: string;
  share_type: "yes" | "no";
  status: string;
  filled_amount: string;
  remaining_amount: string;
  settlement_status: string;
  created_at: number;
}

// Hook for placing CTF orders with on-chain settlement
export function usePlaceCtfOrder() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeCtfOrder = useCallback(async (orderData: CtfOrderRequest): Promise<CtfOrderResponse> => {
    if (!address) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<CtfOrderResponse>(
        "/api/v1/orders/ctf",
        {
          method: "POST",
          body: JSON.stringify(orderData),
        },
        address
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to place CTF order";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { placeCtfOrder, loading, error };
}

// ============================================================================
// Referral System Hooks
// ============================================================================

// Referral dashboard types
export interface ReferralTier {
  level: number;
  name: string;
  commission_rate: string;
  next_tier_requirement: number | null;
}

export interface ReferralActivity {
  referral_address: string;
  event_type: string;
  volume: string;
  commission: string;
  timestamp: number;
}

export interface ReferralDashboard {
  code: string | null;
  total_referrals: number;
  active_referrals: number;
  total_earnings: string;
  pending_earnings: string;
  claimed_earnings: string;
  tier: ReferralTier;
  recent_activity: ReferralActivity[];
}

// Hook for fetching referral dashboard
export function useReferralDashboard() {
  const { address } = useAccount();
  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<ReferralDashboard>(
        "/api/v1/referral/dashboard",
        {},
        address
      );
      setDashboard(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch referral dashboard");
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { dashboard, loading, error, fetchDashboard };
}

// Hook for creating referral code
export function useCreateReferralCode() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCode = useCallback(async (timestamp: number, signature: string) => {
    if (!address) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ success: boolean; code: string; created_at: number }>(
        "/api/v1/referral/code",
        {
          method: "POST",
          body: JSON.stringify({ timestamp, signature }),
        },
        address
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create referral code";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { createCode, loading, error };
}

// Hook for binding to a referral code
export function useBindReferralCode() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bindCode = useCallback(async (code: string, timestamp: number, signature: string) => {
    if (!address) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ success: boolean; referrer_address: string; referrer_code: string }>(
        "/api/v1/referral/bind",
        {
          method: "POST",
          body: JSON.stringify({ code, timestamp, signature }),
        },
        address
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to bind referral code";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { bindCode, loading, error };
}

// Hook for claiming referral earnings
export function useClaimReferralEarnings() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claimEarnings = useCallback(async () => {
    if (!address) throw new Error("Wallet not connected");
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ success: boolean; amount: string; tx_hash: string | null }>(
        "/api/v1/referral/claim",
        {
          method: "POST",
        },
        address
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to claim earnings";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { claimEarnings, loading, error };
}
