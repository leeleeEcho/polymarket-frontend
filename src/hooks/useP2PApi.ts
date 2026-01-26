"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { API_BASE_URL } from "@/lib/wagmi";
import type {
  Merchant,
  MerchantListItem,
  MerchantListResponse,
  MerchantQueryParams,
  CreateMerchantRequest,
  P2POrderListItem,
  P2POrderListResponse,
  P2POrderDetail,
  P2POrderQueryParams,
  CreateP2POrderRequest,
  ConfirmPaymentRequest,
  P2PDisputeResponse,
  DisputeListResponse,
  DisputeQueryParams,
  CreateDisputeRequest,
  CreateRatingRequest,
  MerchantRating,
} from "@/types/p2p";

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
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Build query string from params
function buildQueryString<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

// ============================================================================
// Merchant Hooks
// ============================================================================

// Hook for fetching merchant list
export function useMerchants() {
  const [merchants, setMerchants] = useState<MerchantListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMerchants = useCallback(async (params?: MerchantQueryParams) => {
    setLoading(true);
    setError(null);
    try {
      const query = params ? buildQueryString(params) : "";
      const data = await fetchApi<MerchantListResponse>(
        `/api/v1/p2p/merchants${query}`
      );
      setMerchants(data.merchants || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch merchants");
    } finally {
      setLoading(false);
    }
  }, []);

  return { merchants, total, loading, error, fetchMerchants };
}

// Hook for fetching a single merchant
export function useMerchant(merchantId?: string) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMerchant = useCallback(async (id?: string) => {
    const targetId = id || merchantId;
    if (!targetId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<Merchant>(`/api/v1/p2p/merchants/${targetId}`);
      setMerchant(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch merchant");
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  return { merchant, loading, error, fetchMerchant };
}

// Hook for merchant registration
export function useRegisterMerchant() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerMerchant = useCallback(
    async (data: CreateMerchantRequest): Promise<Merchant> => {
      if (!address) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const result = await fetchApi<Merchant>(
          "/api/v1/p2p/merchants",
          {
            method: "POST",
            body: JSON.stringify(data),
          },
          address
        );
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to register";
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return { registerMerchant, loading, error };
}

// Hook for updating merchant
export function useUpdateMerchant() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateMerchant = useCallback(
    async (
      merchantId: string,
      data: Partial<CreateMerchantRequest>
    ): Promise<Merchant> => {
      if (!address) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const result = await fetchApi<Merchant>(
          `/api/v1/p2p/merchants/${merchantId}`,
          {
            method: "PUT",
            body: JSON.stringify(data),
          },
          address
        );
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to update";
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return { updateMerchant, loading, error };
}

// Hook for current user's merchant profile
export function useMyMerchant() {
  const { address } = useAccount();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMyMerchant = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<Merchant>(
        "/api/v1/p2p/merchants/me",
        {},
        address
      );
      setMerchant(data);
    } catch (e) {
      // Not being a merchant is not an error
      if (e instanceof Error && e.message.includes("NOT_FOUND")) {
        setMerchant(null);
      } else {
        setError(e instanceof Error ? e.message : "Failed to fetch merchant");
      }
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { merchant, loading, error, fetchMyMerchant };
}

// ============================================================================
// P2P Order Hooks
// ============================================================================

// Hook for fetching user's P2P orders
export function useP2POrders() {
  const { address } = useAccount();
  const [orders, setOrders] = useState<P2POrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(
    async (params?: P2POrderQueryParams) => {
      if (!address) return;
      setLoading(true);
      setError(null);
      try {
        const query = params ? buildQueryString(params) : "";
        const data = await fetchApi<P2POrderListResponse>(
          `/api/v1/p2p/orders${query}`,
          {},
          address
        );
        setOrders(data.orders || []);
        setTotal(data.total || 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch orders");
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return { orders, total, loading, error, fetchOrders };
}

// Hook for fetching a single P2P order
export function useP2POrder(orderId?: string) {
  const { address } = useAccount();
  const [order, setOrder] = useState<P2POrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(
    async (id?: string) => {
      const targetId = id || orderId;
      if (!address || !targetId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchApi<P2POrderDetail>(
          `/api/v1/p2p/orders/${targetId}`,
          {},
          address
        );
        setOrder(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch order");
      } finally {
        setLoading(false);
      }
    },
    [address, orderId]
  );

  return { order, loading, error, fetchOrder, setOrder };
}

// Hook for creating P2P order
export function useCreateP2POrder() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = useCallback(
    async (data: CreateP2POrderRequest): Promise<P2POrderDetail> => {
      if (!address) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const result = await fetchApi<P2POrderDetail>(
          "/api/v1/p2p/orders",
          {
            method: "POST",
            body: JSON.stringify(data),
          },
          address
        );
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to create order";
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return { createOrder, loading, error };
}

// Hook for confirming payment (buyer marks as paid)
export function useConfirmPayment() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmPayment = useCallback(
    async (
      orderId: string,
      data?: ConfirmPaymentRequest
    ): Promise<P2POrderDetail> => {
      if (!address) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const result = await fetchApi<P2POrderDetail>(
          `/api/v1/p2p/orders/${orderId}/confirm-payment`,
          {
            method: "POST",
            body: JSON.stringify(data || {}),
          },
          address
        );
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to confirm payment";
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return { confirmPayment, loading, error };
}

// Hook for releasing USDC (merchant releases to buyer)
export function useReleaseOrder() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const releaseOrder = useCallback(
    async (orderId: string): Promise<P2POrderDetail> => {
      if (!address) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const result = await fetchApi<P2POrderDetail>(
          `/api/v1/p2p/orders/${orderId}/release`,
          { method: "POST" },
          address
        );
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to release order";
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return { releaseOrder, loading, error };
}

// Hook for cancelling order
export function useCancelP2POrder() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelOrder = useCallback(
    async (orderId: string): Promise<P2POrderDetail> => {
      if (!address) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const result = await fetchApi<P2POrderDetail>(
          `/api/v1/p2p/orders/${orderId}/cancel`,
          { method: "POST" },
          address
        );
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to cancel order";
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return { cancelOrder, loading, error };
}

// ============================================================================
// Dispute Hooks
// ============================================================================

// Hook for fetching disputes
export function useP2PDisputes() {
  const { address } = useAccount();
  const [disputes, setDisputes] = useState<P2PDisputeResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDisputes = useCallback(
    async (params?: DisputeQueryParams) => {
      if (!address) return;
      setLoading(true);
      setError(null);
      try {
        const query = params ? buildQueryString(params) : "";
        const data = await fetchApi<DisputeListResponse>(
          `/api/v1/p2p/disputes${query}`,
          {},
          address
        );
        setDisputes(data.disputes || []);
        setTotal(data.total || 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch disputes");
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return { disputes, total, loading, error, fetchDisputes };
}

// Hook for fetching a single dispute
export function useP2PDispute(disputeId?: string) {
  const { address } = useAccount();
  const [dispute, setDispute] = useState<P2PDisputeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDispute = useCallback(
    async (id?: string) => {
      const targetId = id || disputeId;
      if (!address || !targetId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchApi<P2PDisputeResponse>(
          `/api/v1/p2p/disputes/${targetId}`,
          {},
          address
        );
        setDispute(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch dispute");
      } finally {
        setLoading(false);
      }
    },
    [address, disputeId]
  );

  return { dispute, loading, error, fetchDispute };
}

// Hook for creating a dispute
export function useCreateDispute() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDispute = useCallback(
    async (
      orderId: string,
      data: CreateDisputeRequest
    ): Promise<P2PDisputeResponse> => {
      if (!address) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const result = await fetchApi<P2PDisputeResponse>(
          `/api/v1/p2p/orders/${orderId}/dispute`,
          {
            method: "POST",
            body: JSON.stringify(data),
          },
          address
        );
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to create dispute";
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return { createDispute, loading, error };
}

// ============================================================================
// Rating Hooks
// ============================================================================

// Hook for rating a merchant
export function useRateMerchant() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rateMerchant = useCallback(
    async (
      orderId: string,
      data: CreateRatingRequest
    ): Promise<MerchantRating> => {
      if (!address) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const result = await fetchApi<MerchantRating>(
          `/api/v1/p2p/orders/${orderId}/rate`,
          {
            method: "POST",
            body: JSON.stringify(data),
          },
          address
        );
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to rate merchant";
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return { rateMerchant, loading, error };
}

// Hook for fetching merchant ratings
export function useMerchantRatings(merchantId?: string) {
  const [ratings, setRatings] = useState<MerchantRating[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRatings = useCallback(
    async (id?: string) => {
      const targetId = id || merchantId;
      if (!targetId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchApi<{ ratings: MerchantRating[] }>(
          `/api/v1/p2p/merchants/${targetId}/ratings`
        );
        setRatings(data.ratings || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch ratings");
      } finally {
        setLoading(false);
      }
    },
    [merchantId]
  );

  return { ratings, loading, error, fetchRatings };
}

// ============================================================================
// Exchange Rate Hook
// ============================================================================

export interface ExchangeRate {
  from_currency: string;
  to_currency: string;
  rate: string;
  updated_at: string;
}

export function useExchangeRate() {
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRate = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<ExchangeRate>(
        `/api/v1/p2p/exchange-rate?from=${from}&to=${to}`
      );
      setRate(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch exchange rate");
    } finally {
      setLoading(false);
    }
  }, []);

  return { rate, loading, error, fetchRate };
}
