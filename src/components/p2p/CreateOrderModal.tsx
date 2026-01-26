"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useCreateP2POrder, useExchangeRate } from "@/hooks/useP2PApi";
import type {
  MerchantListItem,
  PaymentMethodType,
  CreateP2POrderRequest,
} from "@/types/p2p";

interface CreateOrderModalProps {
  merchant: MerchantListItem;
  onClose: () => void;
  onSuccess: (orderId: string) => void;
}

const paymentMethodLabels: Record<PaymentMethodType, string> = {
  ALIPAY: "Alipay",
  WECHAT: "WeChat",
  BANK_CARD: "Bank Card",
  OTHER: "Other",
};

export function CreateOrderModal({
  merchant,
  onClose,
  onSuccess,
}: CreateOrderModalProps) {
  const { address, isConnected } = useAccount();
  const { createOrder, loading, error } = useCreateP2POrder();
  const { rate, fetchRate } = useExchangeRate();

  const [fiatAmount, setFiatAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(
    (merchant.supported_payment_methods[0] as PaymentMethodType) || "ALIPAY"
  );

  // Fetch exchange rate
  useEffect(() => {
    fetchRate("CNY", "USDC");
  }, [fetchRate]);

  const minAmount = parseFloat(merchant.min_order_amount);
  const maxAmount = parseFloat(merchant.max_order_amount);
  const exchangeRate = rate ? parseFloat(rate.rate) : 7.2;
  const fiatValue = parseFloat(fiatAmount) || 0;
  const usdcAmount = fiatValue / exchangeRate;

  const isValidAmount = fiatValue >= minAmount && fiatValue <= maxAmount;

  const handleSubmit = async () => {
    if (!isConnected || !isValidAmount) return;

    try {
      const orderData: CreateP2POrderRequest = {
        merchant_id: merchant.id,
        fiat_amount: fiatAmount,
        fiat_currency: "CNY",
        payment_method: paymentMethod,
      };

      const result = await createOrder(orderData);
      onSuccess(result.id);
    } catch (err) {
      console.error("Failed to create order:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card-9v max-w-md w-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-medium text-foreground">Buy USDC</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Merchant Info */}
          <div className="bg-secondary rounded-lg p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                <span className="text-foreground font-semibold">
                  {merchant.merchant_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-medium text-foreground">{merchant.merchant_name}</p>
                <p className="text-sm text-muted-foreground">
                  Rate {parseFloat(merchant.completion_rate).toFixed(1)}% · {merchant.completed_orders} orders
                </p>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">
              Amount (CNY)
            </label>
            <div className="relative">
              <input
                type="number"
                value={fiatAmount}
                onChange={(e) => setFiatAmount(e.target.value)}
                placeholder={`${minAmount} - ${maxAmount}`}
                className="w-full bg-input text-foreground rounded-lg px-4 py-3 text-lg border border-border focus:border-foreground/50 focus:outline-none font-mono"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                CNY
              </span>
            </div>
            {fiatAmount && !isValidAmount && (
              <p className="text-destructive text-sm mt-1">
                Amount must be between ¥{minAmount.toLocaleString()} - ¥{maxAmount.toLocaleString()}
              </p>
            )}
          </div>

          {/* USDC Preview */}
          {fiatAmount && (
            <div className="bg-secondary rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">You receive</span>
                <span className="text-xl font-semibold text-success font-mono">
                  {usdcAmount.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">Exchange rate</span>
                <span className="text-xs text-muted-foreground font-mono">
                  1 USDC = ¥{exchangeRate.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Payment Method */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Payment Method</label>
            <div className="flex gap-2">
              {merchant.supported_payment_methods.map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method as PaymentMethodType)}
                  className={`flex-1 py-2 rounded-lg border transition font-medium ${
                    paymentMethod === method
                      ? "bg-foreground border-foreground text-background"
                      : "bg-secondary border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"
                  }`}
                >
                  {paymentMethodLabels[method as PaymentMethodType] || method}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="card-9v p-3 border-destructive/50">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          {/* Notice */}
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
            <p className="text-warning text-sm">
              Complete payment within the time limit. USDC will be released after merchant confirms receipt.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-secondary text-muted-foreground rounded-lg hover:bg-secondary/80 hover:text-foreground transition font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isConnected || !isValidAmount || loading}
            className="flex-1 py-3 bg-success text-white rounded-lg hover:bg-success/90 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Creating...
              </span>
            ) : (
              "Confirm Purchase"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
