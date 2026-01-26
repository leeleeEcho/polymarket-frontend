"use client";

import Link from "next/link";
import type { Market } from "@/types";
import { getMarketUrl } from "@/types";

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const yesOutcome = market.outcomes.find((o) => o.name.toLowerCase() === "yes");
  const noOutcome = market.outcomes.find((o) => o.name.toLowerCase() === "no");

  // Convert probability from 0-1 decimal string to percentage
  const yesProbability = (Number(yesOutcome?.probability) || 0.5) * 100;
  const noProbability = (Number(noOutcome?.probability) || 0.5) * 100;

  const statusConfig = {
    open: { label: "LIVE", color: "bg-success/20 text-success", dot: "status-dot-green" },
    active: { label: "ACTIVE", color: "bg-success/20 text-success", dot: "status-dot-green" },
    resolved: { label: "RESOLVED", color: "bg-info/20 text-info", dot: "status-dot-blue" },
    closed: { label: "CLOSED", color: "bg-muted text-muted-foreground", dot: "" },
    paused: { label: "PAUSED", color: "bg-warning/20 text-warning", dot: "status-dot-yellow" },
    cancelled: { label: "CANCELLED", color: "bg-destructive/20 text-destructive", dot: "status-dot-red" },
  };

  const status = statusConfig[market.status] || statusConfig.closed;

  return (
    <Link href={getMarketUrl(market)}>
      <div className="card-9v p-5 hover-lift cursor-pointer group">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <span className="px-2 py-1 text-xs font-mono uppercase tracking-wider bg-secondary text-muted-foreground rounded">
            {market.category}
          </span>
          <span className={`px-2 py-1 text-xs font-mono uppercase tracking-wider rounded flex items-center gap-1.5 ${status.color}`}>
            {status.dot && <span className={`status-dot ${status.dot}`} />}
            {status.label}
          </span>
        </div>

        {/* Question */}
        <h3 className="text-lg font-medium text-foreground mb-5 line-clamp-2 group-hover:text-foreground/90 transition">
          {market.question}
        </h3>

        {/* Probability Display */}
        <div className="space-y-4">
          {/* Yes */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-success w-10">YES</span>
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-success transition-all duration-500"
                style={{ width: `${yesProbability}%` }}
              />
            </div>
            <span className="text-sm font-mono font-semibold text-foreground w-14 text-right">
              {yesProbability.toFixed(0)}%
            </span>
          </div>

          {/* No */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-destructive w-10">NO</span>
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-destructive transition-all duration-500"
                style={{ width: `${noProbability}%` }}
              />
            </div>
            <span className="text-sm font-mono font-semibold text-foreground w-14 text-right">
              {noProbability.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="metric-label">Volume 24h</p>
              <p className="metric-value text-foreground">
                ${parseFloat(market.volume_24h || "0").toLocaleString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="metric-label">Resolves</p>
            <p className="metric-value text-foreground">
              {new Date(market.resolution_time).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
