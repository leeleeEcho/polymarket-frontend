"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useBalance, useSplitPosition, useMergePositions, useCtfPositions, type TokenPosition } from "@/hooks/useApi";
import type { Market } from "@/types";

interface MintingPanelProps {
  market: Market;
}

export function MintingPanel({ market }: MintingPanelProps) {
  const { isConnected } = useAccount();
  const { balances, fetchBalance } = useBalance();
  const { splitPosition, loading: splitLoading, error: splitError } = useSplitPosition();
  const { mergePositions, loading: mergeLoading, error: mergeError } = useMergePositions();
  const { fetchMarketPosition } = useCtfPositions();

  const [mode, setMode] = useState<"mint" | "burn">("mint");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [txHash, setTxHash] = useState("");
  const [position, setPosition] = useState<TokenPosition | null>(null);

  const usdcBalance = balances.find((b) => b.token === "USDC");

  useEffect(() => {
    if (isConnected) {
      fetchBalance();
      loadPosition();
    }
  }, [isConnected, fetchBalance]);

  const loadPosition = async () => {
    const pos = await fetchMarketPosition(market.id);
    setPosition(pos);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || submitting) return;

    setSubmitting(true);
    setSuccessMessage("");
    setTxHash("");

    try {
      if (mode === "mint") {
        // Split position: USDC -> Yes/No tokens
        const result = await splitPosition(market.id, amount);
        setSuccessMessage(result.message);
        setTxHash(result.tx_hash);
      } else {
        // Merge positions: Yes/No tokens -> USDC
        const result = await mergePositions(market.id, amount);
        setSuccessMessage(result.message);
        setTxHash(result.tx_hash);
      }

      setAmount("");
      fetchBalance();
      loadPosition();
    } catch (err) {
      console.error("Minting operation failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const loading = splitLoading || mergeLoading;
  const error = splitError || mergeError;

  // Quick amount buttons
  const quickAmounts = [10, 50, 100, 500];

  // Max amount based on mode
  const maxAmount = mode === "mint"
    ? parseFloat(usdcBalance?.available || "0")
    : Math.min(
        parseFloat(position?.yes_balance || "0"),
        parseFloat(position?.no_balance || "0")
      );

  return (
    <div className="card-9v p-4 md:p-6">
      <h3 className="text-lg font-medium text-foreground mb-4">Mint / Burn Tokens</h3>

      {/* Info text */}
      <p className="text-sm text-muted-foreground mb-4">
        {mode === "mint"
          ? "Convert USDC to equal amounts of Yes and No tokens."
          : "Burn equal amounts of Yes and No tokens back to USDC."}
      </p>

      {/* Mode Toggle */}
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode("mint")}
            className={`py-2.5 px-4 rounded-lg font-medium transition ${
              mode === "mint"
                ? "bg-success text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
            }`}
          >
            Mint Tokens
          </button>
          <button
            onClick={() => setMode("burn")}
            className={`py-2.5 px-4 rounded-lg font-medium transition ${
              mode === "burn"
                ? "bg-destructive text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
            }`}
          >
            Burn Tokens
          </button>
        </div>
      </div>

      {/* Current Positions */}
      {position && (parseFloat(position.yes_balance) > 0 || parseFloat(position.no_balance) > 0) && (
        <div className="bg-secondary/50 rounded-lg p-3 mb-4">
          <p className="text-sm text-muted-foreground mb-2">Your Token Positions</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-success font-medium">Yes: </span>
              <span className="text-foreground font-mono">{position.yes_balance}</span>
            </div>
            <div>
              <span className="text-destructive font-medium">No: </span>
              <span className="text-foreground font-mono">{position.no_balance}</span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Amount Input */}
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm text-muted-foreground">
              {mode === "mint" ? "USDC Amount" : "Tokens to Burn"}
            </label>
            {maxAmount > 0 && (
              <button
                type="button"
                onClick={() => setAmount(maxAmount.toString())}
                className="text-xs text-foreground hover:text-foreground/80 font-medium"
              >
                Max: {maxAmount.toFixed(2)}
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.01"
              step="0.01"
              className="w-full bg-input border border-border rounded-lg py-3 px-4 text-foreground text-base font-mono focus:outline-none focus:border-foreground/50"
              placeholder="100"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              {mode === "mint" ? "USDC" : "Pairs"}
            </span>
          </div>
          {/* Quick amount buttons */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(amt.toString())}
                className="py-1.5 text-xs bg-secondary text-muted-foreground rounded hover:bg-secondary/80 hover:text-foreground transition font-mono"
              >
                {amt}
              </button>
            ))}
          </div>
        </div>

        {/* Operation Summary */}
        <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
          {mode === "mint" ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">USDC to Convert</span>
                <span className="text-foreground font-medium font-mono">
                  {parseFloat(amount || "0").toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">You Receive</span>
                <span className="text-success font-medium font-mono">
                  {parseFloat(amount || "0").toFixed(2)} Yes + {parseFloat(amount || "0").toFixed(2)} No
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tokens to Burn</span>
                <span className="text-foreground font-medium font-mono">
                  {parseFloat(amount || "0").toFixed(2)} Yes + {parseFloat(amount || "0").toFixed(2)} No
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">You Receive</span>
                <span className="text-success font-medium font-mono">
                  {parseFloat(amount || "0").toFixed(2)} USDC
                </span>
              </div>
            </>
          )}
          <div className="flex justify-between text-sm pt-2 border-t border-border">
            <span className="text-muted-foreground">Available USDC</span>
            <span className="text-foreground font-mono">
              {usdcBalance ? parseFloat(usdcBalance.available).toFixed(2) : "0.00"} USDC
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="card-9v p-3 border-destructive/50">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="card-9v p-3 border-success/50">
            <p className="text-success text-sm">{successMessage}</p>
            {txHash && txHash !== "already_prepared" && (
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-info hover:underline mt-1 block font-mono"
              >
                View on Etherscan
              </a>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isConnected || submitting || loading || !amount || parseFloat(amount) <= 0}
          className={`w-full py-3.5 px-4 rounded-lg font-medium text-base transition active:scale-[0.98] ${
            !isConnected || submitting || loading || !amount || parseFloat(amount) <= 0
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : mode === "mint"
              ? "bg-success hover:bg-success/90 text-white"
              : "bg-destructive hover:bg-destructive/90 text-white"
          }`}
        >
          {!isConnected
            ? "Connect Wallet"
            : submitting || loading
            ? "Processing..."
            : mode === "mint"
            ? "Mint Yes/No Tokens"
            : "Burn Tokens to USDC"}
        </button>

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground text-center mt-2">
          This operation will execute an on-chain transaction.
        </p>
      </form>
    </div>
  );
}
