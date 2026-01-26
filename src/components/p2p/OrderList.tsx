"use client";

import { useEffect, useState } from "react";
import { useP2POrders } from "@/hooks/useP2PApi";
import type { P2POrderListItem, P2POrderQueryParams, P2POrderStatus } from "@/types/p2p";

interface OrderListProps {
  onSelectOrder?: (order: P2POrderListItem) => void;
}

const statusLabels: Record<P2POrderStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  RELEASED: "Complete",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

const statusColors: Record<P2POrderStatus, string> = {
  PENDING: "bg-warning/20 text-warning",
  PAID: "bg-info/20 text-info",
  RELEASED: "bg-success/20 text-success",
  DISPUTED: "bg-destructive/20 text-destructive",
  REFUNDED: "bg-purple-500/20 text-purple-400",
  CANCELLED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
};

const statusDots: Record<P2POrderStatus, string> = {
  PENDING: "status-dot-yellow",
  PAID: "status-dot-blue",
  RELEASED: "status-dot-green",
  DISPUTED: "status-dot-red",
  REFUNDED: "",
  CANCELLED: "",
  EXPIRED: "",
};

export function OrderList({ onSelectOrder }: OrderListProps) {
  const { orders, total, loading, error, fetchOrders } = useP2POrders();
  const [filters, setFilters] = useState<P2POrderQueryParams>({
    page: 1,
    page_size: 10,
  });

  useEffect(() => {
    fetchOrders(filters);
  }, [fetchOrders, filters]);

  const handleFilterChange = (key: keyof P2POrderQueryParams, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const totalPages = Math.ceil(total / (filters.page_size || 10));

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTimeRemaining = (unlockTime: string) => {
    const now = new Date();
    const unlock = new Date(unlockTime);
    const diff = unlock.getTime() - now.getTime();

    if (diff <= 0) return "Expired";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card-9v p-4">
        <div className="flex flex-wrap gap-4">
          {/* Status Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm text-muted-foreground mb-1">Status</label>
            <select
              className="w-full bg-input text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:border-foreground/50 focus:outline-none"
              value={filters.status || ""}
              onChange={(e) =>
                handleFilterChange(
                  "status",
                  e.target.value || undefined
                )
              }
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="RELEASED">Complete</option>
              <option value="DISPUTED">Disputed</option>
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm text-muted-foreground mb-1">Role</label>
            <select
              className="w-full bg-input text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:border-foreground/50 focus:outline-none"
              value={filters.role || ""}
              onChange={(e) =>
                handleFilterChange("role", e.target.value || undefined)
              }
            >
              <option value="">All</option>
              <option value="buyer">Buyer</option>
              <option value="merchant">Merchant</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="card-9v p-4 border-destructive/50">
          <p className="text-destructive">{error}</p>
        </div>
      )}

      {/* Order List */}
      {!loading && !error && (
        <>
          {orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No orders found</div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="card-9v p-4 hover-lift cursor-pointer"
                  onClick={() => onSelectOrder?.(order)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-1 text-xs rounded flex items-center gap-1.5 font-mono ${
                          statusColors[order.status]
                        }`}
                      >
                        {statusDots[order.status] && (
                          <span className={`status-dot ${statusDots[order.status]}`} />
                        )}
                        {statusLabels[order.status]}
                      </span>
                      <span className="text-sm text-muted-foreground font-mono">
                        #{order.contract_payment_id}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatTime(order.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {order.merchant_name || "Merchant"}
                      </p>
                      <p className="text-lg font-semibold text-foreground font-mono">
                        ¥{parseFloat(order.fiat_amount).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Receive</p>
                      <p className="text-lg font-semibold text-success font-mono">
                        {parseFloat(order.token_amount).toFixed(2)} USDC
                      </p>
                    </div>
                  </div>

                  {(order.status === "PENDING" || order.status === "PAID") && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Time remaining</span>
                      <span className="text-sm text-warning font-mono">
                        {getTimeRemaining(order.unlock_time)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                className="px-4 py-2 bg-secondary text-muted-foreground rounded-lg hover:bg-secondary/80 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
                disabled={filters.page === 1}
                onClick={() =>
                  setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))
                }
              >
                Previous
              </button>
              <span className="text-muted-foreground font-mono">
                {filters.page} / {totalPages}
              </span>
              <button
                className="px-4 py-2 bg-secondary text-muted-foreground rounded-lg hover:bg-secondary/80 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
                disabled={filters.page === totalPages}
                onClick={() =>
                  setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))
                }
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
