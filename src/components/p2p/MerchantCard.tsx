"use client";

import type { MerchantListItem, PaymentMethodType } from "@/types/p2p";

interface MerchantCardProps {
  merchant: MerchantListItem;
  onSelect?: (merchant: MerchantListItem) => void;
}

const paymentMethodLabels: Record<PaymentMethodType, string> = {
  ALIPAY: "Alipay",
  WECHAT: "WeChat",
  BANK_CARD: "Bank",
  OTHER: "Other",
};

const paymentMethodIcons: Record<PaymentMethodType, string> = {
  ALIPAY: "A",
  WECHAT: "W",
  BANK_CARD: "B",
  OTHER: "O",
};

export function MerchantCard({ merchant, onSelect }: MerchantCardProps) {
  const completionRate = parseFloat(merchant.completion_rate);
  const rating = merchant.rating ? parseFloat(merchant.rating) : null;

  return (
    <div
      className={`card-9v p-5 ${
        onSelect ? "hover-lift cursor-pointer" : ""
      }`}
      onClick={() => onSelect?.(merchant)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center">
            <span className="text-foreground font-semibold text-lg">
              {merchant.merchant_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="font-medium text-foreground">{merchant.merchant_name}</h3>
            <p className="text-xs text-muted-foreground font-mono">
              {merchant.wallet_address.slice(0, 6)}...
              {merchant.wallet_address.slice(-4)}
            </p>
          </div>
        </div>
        {merchant.is_whitelisted && (
          <span className="px-2 py-1 bg-success/20 text-success text-xs rounded flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
            Verified
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-secondary rounded-lg p-2 text-center">
          <p className="metric-label mb-1">Rate</p>
          <p
            className={`font-mono font-semibold ${
              completionRate >= 95
                ? "text-success"
                : completionRate >= 80
                ? "text-warning"
                : "text-destructive"
            }`}
          >
            {completionRate.toFixed(1)}%
          </p>
        </div>
        <div className="bg-secondary rounded-lg p-2 text-center">
          <p className="metric-label mb-1">Orders</p>
          <p className="font-mono font-semibold text-foreground">{merchant.completed_orders}</p>
        </div>
        <div className="bg-secondary rounded-lg p-2 text-center">
          <p className="metric-label mb-1">Rating</p>
          <p className="font-mono font-semibold text-warning">
            {rating ? `${rating.toFixed(1)}` : "-"}
          </p>
        </div>
      </div>

      {/* Order Limits */}
      <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
        <span>Limit</span>
        <span className="text-foreground font-mono">
          ¥{parseFloat(merchant.min_order_amount).toLocaleString()} -{" "}
          ¥{parseFloat(merchant.max_order_amount).toLocaleString()}
        </span>
      </div>

      {/* Payment Methods */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Payment:</span>
        <div className="flex gap-1">
          {merchant.supported_payment_methods.map((method) => (
            <span
              key={method}
              className="px-2 py-1 bg-secondary text-muted-foreground text-xs rounded font-mono"
              title={paymentMethodLabels[method as PaymentMethodType] || method}
            >
              {paymentMethodLabels[method as PaymentMethodType] || method}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
