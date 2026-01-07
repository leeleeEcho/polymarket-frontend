"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useOrderSigning } from "@/hooks/useOrderSigning";
import { usePlaceOrder, useBalance } from "@/hooks/useApi";
import type { Market, Outcome } from "@/types";

interface TradingPanelProps {
  market: Market;
  selectedOutcome: Outcome;
  onOutcomeChange: (outcome: Outcome) => void;
}

export function TradingPanel({
  market,
  selectedOutcome,
  onOutcomeChange,
}: TradingPanelProps) {
  const { isConnected } = useAccount();
  const { signOrder } = useOrderSigning();
  const { placeOrder, loading: orderLoading, error: orderError } = usePlaceOrder();
  const { balances, fetchBalance } = useBalance();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [shareType, setShareType] = useState<"yes" | "no">("yes");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [price, setPrice] = useState("0.50");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const usdcBalance = balances.find((b) => b.token === "USDC");

  useEffect(() => {
    if (isConnected) {
      fetchBalance();
    }
  }, [isConnected, fetchBalance]);

  // Calculate estimated cost/return
  const estimatedCost = parseFloat(price) * parseFloat(amount || "0");
  const potentialReturn = parseFloat(amount || "0") - estimatedCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || submitting) return;

    setSubmitting(true);
    setSuccessMessage("");

    try {
      // Sign the order with EIP-712
      const signedOrder = await signOrder({
        market_id: market.id,
        outcome_id: selectedOutcome.id,
        side,
        order_type: orderType,
        price,
        amount,
        share_type: shareType,
      });

      // Place the order
      await placeOrder(signedOrder);

      setSuccessMessage("Order placed successfully!");
      setAmount("");
      fetchBalance();
    } catch (err) {
      console.error("Failed to place order:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick amount buttons
  const quickAmounts = [10, 50, 100, 500];

  return (
    <div className="bg-gray-800 rounded-xl p-4 md:p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">Trade</h3>

      {/* Outcome Selection */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Outcome</label>
        <div className="grid grid-cols-2 gap-2">
          {market.outcomes.map((outcome) => (
            <button
              key={outcome.id}
              onClick={() => {
                onOutcomeChange(outcome);
                setShareType(outcome.name.toLowerCase() as "yes" | "no");
              }}
              className={`py-2.5 md:py-2 px-3 md:px-4 rounded-lg font-medium text-sm md:text-base transition ${
                selectedOutcome.id === outcome.id
                  ? outcome.name.toLowerCase() === "yes"
                    ? "bg-green-600 text-white"
                    : "bg-red-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600 active:bg-gray-600"
              }`}
            >
              {outcome.name} ({((Number(outcome.probability) || 0.5) * 100).toFixed(0)}%)
            </button>
          ))}
        </div>
      </div>

      {/* Buy/Sell Toggle */}
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide("buy")}
            className={`py-2.5 md:py-2 px-4 rounded-lg font-medium transition ${
              side === "buy"
                ? "bg-green-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600 active:bg-gray-600"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => setSide("sell")}
            className={`py-2.5 md:py-2 px-4 rounded-lg font-medium transition ${
              side === "sell"
                ? "bg-red-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600 active:bg-gray-600"
            }`}
          >
            Sell
          </button>
        </div>
      </div>

      {/* Order Type */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Order Type</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOrderType("limit")}
            className={`py-2 px-4 rounded-lg font-medium text-sm transition ${
              orderType === "limit"
                ? "bg-primary-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600 active:bg-gray-600"
            }`}
          >
            Limit
          </button>
          <button
            onClick={() => setOrderType("market")}
            className={`py-2 px-4 rounded-lg font-medium text-sm transition ${
              orderType === "market"
                ? "bg-primary-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600 active:bg-gray-600"
            }`}
          >
            Market
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Price Input (only for limit orders) */}
        {orderType === "limit" && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Price (0.01 - 0.99)
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min="0.01"
                max="0.99"
                step="0.01"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white text-base focus:outline-none focus:border-primary-500"
                placeholder="0.50"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                USDC
              </span>
            </div>
            {/* Quick price buttons */}
            <div className="flex gap-2 mt-2">
              {[0.25, 0.50, 0.75].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrice(p.toString())}
                  className="flex-1 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Amount Input */}
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm text-gray-400">
              Shares to {side}
            </label>
            {usdcBalance && (
              <button
                type="button"
                onClick={() => {
                  const maxShares = Math.floor(parseFloat(usdcBalance.available) / parseFloat(price));
                  setAmount(maxShares.toString());
                }}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                Max
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              step="1"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white text-base focus:outline-none focus:border-primary-500"
              placeholder="100"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              Shares
            </span>
          </div>
          {/* Quick amount buttons */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(amt.toString())}
                className="py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition"
              >
                {amt}
              </button>
            ))}
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-gray-700/50 rounded-lg p-3 md:p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">
              {side === "buy" ? "Cost" : "Return"}
            </span>
            <span className="text-white font-medium">
              {estimatedCost.toFixed(2)} USDC
            </span>
          </div>
          {side === "buy" && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Potential Profit</span>
              <span className="text-green-400 font-medium">
                +{potentialReturn.toFixed(2)} USDC
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm pt-2 border-t border-gray-600">
            <span className="text-gray-400">Available</span>
            <span className="text-white">
              {usdcBalance ? parseFloat(usdcBalance.available).toFixed(2) : "0.00"} USDC
            </span>
          </div>
        </div>

        {/* Error Message */}
        {orderError && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3">
            <p className="text-red-400 text-sm">{orderError}</p>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-900/50 border border-green-700 rounded-lg p-3">
            <p className="text-green-400 text-sm">{successMessage}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isConnected || submitting || orderLoading || !amount}
          className={`w-full py-3.5 md:py-3 px-4 rounded-lg font-medium text-base transition active:scale-[0.98] ${
            !isConnected || submitting || orderLoading || !amount
              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
              : side === "buy"
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-red-600 hover:bg-red-700 text-white"
          }`}
        >
          {!isConnected
            ? "Connect Wallet"
            : submitting || orderLoading
            ? "Signing..."
            : `${side === "buy" ? "Buy" : "Sell"} ${selectedOutcome.name} Shares`}
        </button>
      </form>
    </div>
  );
}
