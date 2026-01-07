"use client";

import { useEffect } from "react";
import { useOrderbook } from "@/hooks/useApi";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { OrderbookLevel } from "@/types";

interface OrderbookProps {
  marketId: string;
  outcomeId: string;
  shareType: string;
  onPriceClick?: (price: string) => void;
}

export function Orderbook({
  marketId,
  outcomeId,
  shareType,
  onPriceClick,
}: OrderbookProps) {
  const { orderbook, fetchOrderbook, setOrderbook } = useOrderbook(
    marketId,
    outcomeId,
    shareType
  );
  const { isConnected, subscribe, addHandler } = useWebSocket();

  useEffect(() => {
    fetchOrderbook();
  }, [fetchOrderbook]);

  // Subscribe to real-time orderbook updates
  useEffect(() => {
    if (!isConnected) return;

    const channel = `orderbook:${marketId}`;
    subscribe(channel);

    const cleanup = addHandler("marketorderbook", (data: any) => {
      if (
        data.market_id === marketId &&
        data.outcome_id === outcomeId &&
        data.share_type === shareType
      ) {
        setOrderbook({
          market_id: data.market_id,
          outcome_id: data.outcome_id,
          share_type: data.share_type,
          bids: data.bids,
          asks: data.asks,
          timestamp: data.timestamp,
        });
      }
    });

    return cleanup;
  }, [isConnected, marketId, outcomeId, shareType, subscribe, addHandler, setOrderbook]);

  const bids = orderbook?.bids || [];
  const asks = orderbook?.asks || [];

  // Calculate max size for visualization
  const maxBidSize = Math.max(...bids.map((b) => parseFloat(b.size)), 1);
  const maxAskSize = Math.max(...asks.map((a) => parseFloat(a.size)), 1);

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">Order Book</h3>

      {/* Header */}
      <div className="grid grid-cols-3 text-xs text-gray-500 pb-2 border-b border-gray-700">
        <span>Price</span>
        <span className="text-center">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (sell orders) - reversed so lowest ask is at bottom */}
      <div className="max-h-40 overflow-y-auto">
        {[...asks].reverse().map((ask, i) => (
          <OrderbookRow
            key={`ask-${i}`}
            level={ask}
            type="ask"
            maxSize={maxAskSize}
            onClick={() => onPriceClick?.(ask.price)}
          />
        ))}
        {asks.length === 0 && (
          <div className="py-4 text-center text-gray-500 text-sm">No asks</div>
        )}
      </div>

      {/* Spread indicator */}
      <div className="py-2 border-y border-gray-700 my-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Spread</span>
          <span className="text-white">
            {bids.length > 0 && asks.length > 0
              ? (
                  parseFloat(asks[0]?.price || "0") -
                  parseFloat(bids[0]?.price || "0")
                ).toFixed(2)
              : "-"}
          </span>
        </div>
      </div>

      {/* Bids (buy orders) */}
      <div className="max-h-40 overflow-y-auto">
        {bids.map((bid, i) => (
          <OrderbookRow
            key={`bid-${i}`}
            level={bid}
            type="bid"
            maxSize={maxBidSize}
            onClick={() => onPriceClick?.(bid.price)}
          />
        ))}
        {bids.length === 0 && (
          <div className="py-4 text-center text-gray-500 text-sm">No bids</div>
        )}
      </div>
    </div>
  );
}

interface OrderbookRowProps {
  level: OrderbookLevel;
  type: "bid" | "ask";
  maxSize: number;
  onClick?: () => void;
}

function OrderbookRow({ level, type, maxSize, onClick }: OrderbookRowProps) {
  const size = parseFloat(level.size);
  const widthPercent = (size / maxSize) * 100;

  return (
    <div
      onClick={onClick}
      className={`relative grid grid-cols-3 py-1 text-sm cursor-pointer hover:bg-gray-700/50 ${
        type === "bid" ? "orderbook-bid" : "orderbook-ask"
      }`}
    >
      {/* Background bar */}
      <div
        className={`absolute inset-y-0 right-0 ${
          type === "bid" ? "bg-green-500/10" : "bg-red-500/10"
        }`}
        style={{ width: `${widthPercent}%` }}
      />

      {/* Content */}
      <span
        className={`relative z-10 ${
          type === "bid" ? "text-green-400" : "text-red-400"
        }`}
      >
        {parseFloat(level.price).toFixed(2)}
      </span>
      <span className="relative z-10 text-center text-white">
        {size.toFixed(0)}
      </span>
      <span className="relative z-10 text-right text-gray-400">
        {(parseFloat(level.price) * size).toFixed(2)}
      </span>
    </div>
  );
}
