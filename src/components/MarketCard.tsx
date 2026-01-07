"use client";

import Link from "next/link";
import type { Market } from "@/types";

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const yesOutcome = market.outcomes.find((o) => o.name.toLowerCase() === "yes");
  const noOutcome = market.outcomes.find((o) => o.name.toLowerCase() === "no");

  // Convert probability from 0-1 decimal string to percentage
  const yesProbability = (Number(yesOutcome?.probability) || 0.5) * 100;
  const noProbability = (Number(noOutcome?.probability) || 0.5) * 100;

  return (
    <Link href={`/market/${market.id}`}>
      <div className="bg-gray-800 rounded-xl p-6 hover:bg-gray-750 transition cursor-pointer border border-gray-700 hover:border-gray-600">
        <div className="flex items-start justify-between mb-4">
          <span className="px-2 py-1 bg-primary-900 text-primary-300 text-xs rounded">
            {market.category}
          </span>
          <span
            className={`px-2 py-1 text-xs rounded ${
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

        <h3 className="text-lg font-semibold text-white mb-4 line-clamp-2">
          {market.question}
        </h3>

        <div className="space-y-3">
          {/* Yes probability bar */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Yes</span>
            <div className="flex-1 mx-3 bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all"
                style={{ width: `${yesProbability}%` }}
              />
            </div>
            <span className="text-sm font-medium text-green-400 w-12 text-right">
              {yesProbability.toFixed(0)}%
            </span>
          </div>

          {/* No probability bar */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">No</span>
            <div className="flex-1 mx-3 bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-red-500 h-full transition-all"
                style={{ width: `${noProbability}%` }}
              />
            </div>
            <span className="text-sm font-medium text-red-400 w-12 text-right">
              {noProbability.toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-700 flex items-center justify-between text-sm text-gray-400">
          <span>Vol: ${parseFloat(market.volume_24h || "0").toLocaleString()}</span>
          <span>
            Resolves: {new Date(market.resolution_time).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Link>
  );
}
