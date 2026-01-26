"use client";

import { useEffect, useState } from "react";
import { useMerchants } from "@/hooks/useP2PApi";
import { MerchantCard } from "./MerchantCard";
import type { MerchantListItem, MerchantQueryParams, PaymentMethodType } from "@/types/p2p";

interface MerchantListProps {
  onSelectMerchant?: (merchant: MerchantListItem) => void;
}

export function MerchantList({ onSelectMerchant }: MerchantListProps) {
  const { merchants, total, loading, error, fetchMerchants } = useMerchants();
  const [filters, setFilters] = useState<MerchantQueryParams>({
    page: 1,
    page_size: 10,
    sort_by: "rating",
    sort_order: "desc",
  });

  useEffect(() => {
    fetchMerchants(filters);
  }, [fetchMerchants, filters]);

  const handleFilterChange = (key: keyof MerchantQueryParams, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const totalPages = Math.ceil(total / (filters.page_size || 10));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card-9v p-4">
        <div className="flex flex-wrap gap-4">
          {/* Payment Method Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm text-muted-foreground mb-1">Payment Method</label>
            <select
              className="w-full bg-input text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:border-foreground/50 focus:outline-none"
              value={filters.payment_method || ""}
              onChange={(e) =>
                handleFilterChange(
                  "payment_method",
                  e.target.value || undefined
                )
              }
            >
              <option value="">All</option>
              <option value="ALIPAY">Alipay</option>
              <option value="WECHAT">WeChat</option>
              <option value="BANK_CARD">Bank Card</option>
            </select>
          </div>

          {/* Amount Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm text-muted-foreground mb-1">Amount</label>
            <input
              type="number"
              placeholder="Enter amount"
              className="w-full bg-input text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:border-foreground/50 focus:outline-none font-mono"
              onChange={(e) => {
                const value = e.target.value;
                handleFilterChange("min_amount", value || undefined);
              }}
            />
          </div>

          {/* Sort */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm text-muted-foreground mb-1">Sort By</label>
            <select
              className="w-full bg-input text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:border-foreground/50 focus:outline-none"
              value={filters.sort_by || "rating"}
              onChange={(e) =>
                handleFilterChange("sort_by", e.target.value as MerchantQueryParams["sort_by"])
              }
            >
              <option value="rating">Highest Rating</option>
              <option value="completion_rate">Best Completion</option>
              <option value="volume">Most Volume</option>
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

      {/* Merchant List */}
      {!loading && !error && (
        <>
          {merchants.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No merchants found matching criteria
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {merchants.map((merchant) => (
                <MerchantCard
                  key={merchant.id}
                  merchant={merchant}
                  onSelect={onSelectMerchant}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                className="px-4 py-2 bg-secondary text-muted-foreground rounded-lg hover:bg-secondary/80 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
                disabled={filters.page === 1}
                onClick={() => handlePageChange((filters.page || 1) - 1)}
              >
                Previous
              </button>
              <span className="text-muted-foreground font-mono">
                {filters.page} / {totalPages}
              </span>
              <button
                className="px-4 py-2 bg-secondary text-muted-foreground rounded-lg hover:bg-secondary/80 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
                disabled={filters.page === totalPages}
                onClick={() => handlePageChange((filters.page || 1) + 1)}
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
