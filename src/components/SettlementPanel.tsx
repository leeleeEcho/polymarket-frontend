"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useSettlement, useBalance } from "@/hooks/useApi";

interface SettlementPanelProps {
  marketId: string;
  marketStatus: string;
  winningOutcome?: string;
}

export function SettlementPanel({
  marketId,
  marketStatus,
  winningOutcome,
}: SettlementPanelProps) {
  const { isConnected } = useAccount();
  const {
    status,
    loading,
    settling,
    error,
    fetchSettlementStatus,
    settleShares,
  } = useSettlement(marketId);
  const { fetchBalance } = useBalance();
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (isConnected && (marketStatus === "resolved" || marketStatus === "cancelled")) {
      fetchSettlementStatus();
    }
  }, [isConnected, marketStatus, fetchSettlementStatus]);

  const handleSettle = async () => {
    setSuccessMessage("");
    try {
      const result = await settleShares();
      if (result) {
        setSuccessMessage(
          `Successfully claimed ${parseFloat(result.total_payout).toFixed(2)} USDC!`
        );
        fetchBalance();
      }
    } catch (err) {
      console.error("Settlement failed:", err);
    }
  };

  // Only show for resolved or cancelled markets
  if (marketStatus !== "resolved" && marketStatus !== "cancelled") {
    return null;
  }

  // Not connected
  if (!isConnected) {
    return (
      <div className="card-9v p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">Settlement</h3>
        <p className="text-muted-foreground text-sm">
          Connect your wallet to check settlement status.
        </p>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="card-9v p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">Settlement</h3>
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-foreground border-t-transparent"></div>
        </div>
      </div>
    );
  }

  // No shares to settle
  if (!status) {
    return (
      <div className="card-9v p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">Settlement</h3>
        <p className="text-muted-foreground text-sm">
          You have no shares in this market.
        </p>
      </div>
    );
  }

  return (
    <div className="card-9v p-6">
      <h3 className="text-lg font-medium text-foreground mb-4">Settlement</h3>

      {/* Market Result */}
      <div className="mb-4 p-4 rounded-lg bg-secondary">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground text-sm">Market Status</span>
          <span
            className={`px-2 py-1 text-xs rounded font-mono ${
              marketStatus === "resolved"
                ? "bg-info/20 text-info"
                : "bg-warning/20 text-warning"
            }`}
          >
            {marketStatus === "resolved" ? "Resolved" : "Cancelled"}
          </span>
        </div>
        {marketStatus === "resolved" && winningOutcome && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Winning Outcome</span>
            <span className="text-success font-medium">{winningOutcome}</span>
          </div>
        )}
      </div>

      {/* Settlement Status */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Your Shares</span>
          <span className="text-foreground font-mono">{status.share_count} positions</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Potential Payout</span>
          <span className="text-success font-semibold font-mono">
            {parseFloat(status.potential_payout).toFixed(2)} USDC
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Settlement Status</span>
          <span
            className={`text-sm font-mono ${
              status.is_settled ? "text-success" : "text-warning"
            }`}
          >
            {status.is_settled ? "Claimed" : "Pending"}
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 card-9v p-3 border-destructive/50">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="mb-4 card-9v p-3 border-success/50">
          <p className="text-success text-sm">{successMessage}</p>
        </div>
      )}

      {/* Claim Button */}
      {status.can_settle && parseFloat(status.potential_payout) > 0 && (
        <button
          onClick={handleSettle}
          disabled={settling}
          className={`w-full py-3 px-4 rounded-lg font-medium transition ${
            settling
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-success hover:bg-success/90 text-white"
          }`}
        >
          {settling ? (
            <span className="flex items-center justify-center">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></span>
              Processing...
            </span>
          ) : (
            `Claim ${parseFloat(status.potential_payout).toFixed(2)} USDC`
          )}
        </button>
      )}

      {/* Already Settled */}
      {status.is_settled && (
        <div className="text-center py-2">
          <span className="text-success text-sm">
            You have already claimed your winnings for this market.
          </span>
        </div>
      )}

      {/* No Payout */}
      {!status.is_settled && parseFloat(status.potential_payout) === 0 && (
        <div className="text-center py-2">
          <span className="text-muted-foreground text-sm">
            {marketStatus === "resolved"
              ? "Your shares did not win in this market."
              : "Your positions have been refunded."}
          </span>
        </div>
      )}
    </div>
  );
}
