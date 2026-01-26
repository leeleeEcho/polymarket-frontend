"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  useP2POrder,
  useConfirmPayment,
  useReleaseOrder,
  useCancelP2POrder,
  useRateMerchant,
} from "@/hooks/useP2PApi";
import { DisputeForm } from "./DisputeForm";
import type { P2POrderStatus, PaymentMethodType } from "@/types/p2p";

interface OrderDetailProps {
  orderId: string;
  onBack: () => void;
}

const statusLabels: Record<P2POrderStatus, string> = {
  PENDING: "Awaiting Payment",
  PAID: "Payment Confirmed",
  RELEASED: "Complete",
  DISPUTED: "In Dispute",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

const statusColors: Record<P2POrderStatus, string> = {
  PENDING: "bg-warning/20 text-warning border-warning/30",
  PAID: "bg-info/20 text-info border-info/30",
  RELEASED: "bg-success/20 text-success border-success/30",
  DISPUTED: "bg-destructive/20 text-destructive border-destructive/30",
  REFUNDED: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  CANCELLED: "bg-muted text-muted-foreground border-border",
  EXPIRED: "bg-muted text-muted-foreground border-border",
};

const paymentMethodLabels: Record<PaymentMethodType, string> = {
  ALIPAY: "Alipay",
  WECHAT: "WeChat",
  BANK_CARD: "Bank Card",
  OTHER: "Other",
};

export function OrderDetail({ orderId, onBack }: OrderDetailProps) {
  const { address } = useAccount();
  const { order, loading, error, fetchOrder } = useP2POrder(orderId);
  const { confirmPayment, loading: confirming } = useConfirmPayment();
  const { releaseOrder, loading: releasing } = useReleaseOrder();
  const { cancelOrder, loading: cancelling } = useCancelP2POrder();
  const { rateMerchant, loading: rating } = useRateMerchant();

  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState("");

  useEffect(() => {
    fetchOrder();
    // Poll for updates every 10 seconds for active orders
    const interval = setInterval(() => {
      if (order?.status === "PENDING" || order?.status === "PAID") {
        fetchOrder();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchOrder, order?.status]);

  const isBuyer = address?.toLowerCase() === order?.buyer_address.toLowerCase();
  const isMerchant =
    address?.toLowerCase() === order?.merchant.wallet_address.toLowerCase();

  const handleConfirmPayment = async () => {
    try {
      await confirmPayment(orderId);
      fetchOrder();
    } catch (err) {
      console.error("Failed to confirm payment:", err);
    }
  };

  const handleRelease = async () => {
    try {
      await releaseOrder(orderId);
      fetchOrder();
    } catch (err) {
      console.error("Failed to release:", err);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this order?")) return;
    try {
      await cancelOrder(orderId);
      fetchOrder();
    } catch (err) {
      console.error("Failed to cancel:", err);
    }
  };

  const handleRate = async () => {
    try {
      await rateMerchant(orderId, {
        rating: ratingValue.toString(),
        comment: ratingComment || undefined,
      });
      setShowRating(false);
      fetchOrder();
    } catch (err) {
      console.error("Failed to rate:", err);
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US");
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="card-9v p-4 border-destructive/50">
        <p className="text-destructive">{error || "Order not found"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 className="text-lg font-medium text-foreground">Order Details</h2>
      </div>

      {/* Status Banner */}
      <div
        className={`rounded-lg p-4 border ${statusColors[order.status]}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold">{statusLabels[order.status]}</p>
            <p className="text-sm opacity-75 font-mono">Order #{order.contract_payment_id}</p>
          </div>
          {(order.status === "PENDING" || order.status === "PAID") && (
            <div className="text-right">
              <p className="text-sm opacity-75">Time remaining</p>
              <p className="text-lg font-semibold font-mono">
                {getTimeRemaining(order.unlock_time)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Amount Info */}
      <div className="card-9v p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="metric-label mb-1">Payment Amount</p>
            <p className="text-2xl font-bold text-foreground font-mono">
              ¥{parseFloat(order.fiat_amount).toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="metric-label mb-1">Receive USDC</p>
            <p className="text-2xl font-bold text-success font-mono">
              {parseFloat(order.token_amount).toFixed(2)}
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Exchange rate</span>
          <span className="text-foreground font-mono">
            1 USDC = ¥{parseFloat(order.exchange_rate).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Merchant Info */}
      <div className="card-9v p-4">
        <h3 className="font-medium text-foreground mb-3">Merchant Info</h3>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center">
            <span className="text-foreground font-semibold">
              {order.merchant.merchant_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-foreground">{order.merchant.merchant_name}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {order.merchant.wallet_address.slice(0, 10)}...
              {order.merchant.wallet_address.slice(-8)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-secondary rounded-lg p-2">
            <p className="metric-label">Rate</p>
            <p className="font-mono font-semibold text-success">
              {parseFloat(order.merchant.completion_rate).toFixed(1)}%
            </p>
          </div>
          <div className="bg-secondary rounded-lg p-2">
            <p className="metric-label">Orders</p>
            <p className="font-mono font-semibold text-foreground">
              {order.merchant.completed_orders}
            </p>
          </div>
          <div className="bg-secondary rounded-lg p-2">
            <p className="metric-label">Rating</p>
            <p className="font-mono font-semibold text-warning">
              {order.merchant.rating
                ? `${parseFloat(order.merchant.rating).toFixed(1)}`
                : "-"}
            </p>
          </div>
        </div>
      </div>

      {/* Payment Info */}
      {order.status === "PENDING" && isBuyer && order.payment_details && (
        <div className="card-9v p-4">
          <h3 className="font-medium text-foreground mb-3">
            Payment Info ({paymentMethodLabels[order.payment_method]})
          </h3>
          <div className="bg-secondary rounded-lg p-3 space-y-2 text-sm">
            {order.payment_method === "ALIPAY" &&
              order.payment_details.alipay && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account</span>
                    <span className="text-foreground font-mono">
                      {order.payment_details.alipay.account}
                    </span>
                  </div>
                </>
              )}
            {order.payment_method === "WECHAT" &&
              order.payment_details.wechat && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account</span>
                    <span className="text-foreground font-mono">
                      {order.payment_details.wechat.account}
                    </span>
                  </div>
                </>
              )}
            {order.payment_method === "BANK_CARD" &&
              order.payment_details.bank_card && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="text-foreground">
                      {order.payment_details.bank_card.bank_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Card Number</span>
                    <span className="text-foreground font-mono">
                      {order.payment_details.bank_card.card_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account Name</span>
                    <span className="text-foreground">
                      {order.payment_details.bank_card.holder_name}
                    </span>
                  </div>
                </>
              )}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="card-9v p-4">
        <h3 className="font-medium text-foreground mb-3">Order Progress</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-foreground">Order Created</p>
              <p className="text-xs text-muted-foreground font-mono">{formatTime(order.created_at)}</p>
            </div>
          </div>

          {order.paid_at && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-foreground">Payment Confirmed</p>
                <p className="text-xs text-muted-foreground font-mono">{formatTime(order.paid_at)}</p>
              </div>
            </div>
          )}

          {order.released_at && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-foreground">USDC Released</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {formatTime(order.released_at)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {/* Buyer: Confirm Payment */}
        {order.status === "PENDING" && isBuyer && (
          <button
            onClick={handleConfirmPayment}
            disabled={confirming}
            className="w-full py-3 bg-foreground text-background rounded-lg hover:opacity-90 transition disabled:opacity-50 font-medium"
          >
            {confirming ? "Confirming..." : "I Have Paid"}
          </button>
        )}

        {/* Merchant: Release */}
        {order.status === "PAID" && isMerchant && (
          <button
            onClick={handleRelease}
            disabled={releasing}
            className="w-full py-3 bg-success text-white rounded-lg hover:bg-success/90 transition disabled:opacity-50 font-medium"
          >
            {releasing ? "Releasing..." : "Confirm Receipt & Release USDC"}
          </button>
        )}

        {/* Cancel (before payment confirmation) */}
        {order.status === "PENDING" && (isBuyer || isMerchant) && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full py-3 bg-secondary text-muted-foreground rounded-lg hover:bg-secondary/80 hover:text-foreground transition disabled:opacity-50 font-medium"
          >
            {cancelling ? "Cancelling..." : "Cancel Order"}
          </button>
        )}

        {/* Dispute */}
        {(order.status === "PENDING" || order.status === "PAID") &&
          (isBuyer || isMerchant) && (
            <button
              onClick={() => setShowDisputeForm(true)}
              className="w-full py-3 bg-destructive/20 text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/30 transition font-medium"
            >
              Open Dispute
            </button>
          )}

        {/* Rate (after completion) */}
        {order.status === "RELEASED" && isBuyer && !showRating && (
          <button
            onClick={() => setShowRating(true)}
            className="w-full py-3 bg-warning/20 text-warning border border-warning/30 rounded-lg hover:bg-warning/30 transition font-medium"
          >
            Rate Merchant
          </button>
        )}
      </div>

      {/* Rating Form */}
      {showRating && (
        <div className="card-9v p-4">
          <h3 className="font-medium text-foreground mb-3">Rate Merchant</h3>
          <div className="flex gap-2 mb-3">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => setRatingValue(value)}
                className={`text-2xl transition ${
                  value <= ratingValue ? "text-warning" : "text-muted"
                }`}
              >
                {value <= ratingValue ? "★" : "☆"}
              </button>
            ))}
          </div>
          <textarea
            value={ratingComment}
            onChange={(e) => setRatingComment(e.target.value)}
            placeholder="Add a comment (optional)"
            className="w-full bg-input text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:border-foreground/50 focus:outline-none resize-none"
            rows={3}
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setShowRating(false)}
              className="flex-1 py-2 bg-secondary text-muted-foreground rounded-lg hover:bg-secondary/80 hover:text-foreground transition font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleRate}
              disabled={rating}
              className="flex-1 py-2 bg-warning text-white rounded-lg hover:bg-warning/90 disabled:opacity-50 transition font-medium"
            >
              {rating ? "Submitting..." : "Submit Rating"}
            </button>
          </div>
        </div>
      )}

      {/* Dispute Form Modal */}
      {showDisputeForm && (
        <DisputeForm
          orderId={orderId}
          onClose={() => setShowDisputeForm(false)}
          onSuccess={() => {
            setShowDisputeForm(false);
            fetchOrder();
          }}
        />
      )}

      {/* On-chain Info */}
      <div className="card-9v p-4">
        <h3 className="font-medium text-foreground mb-3">On-chain Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Chain ID</span>
            <span className="text-foreground font-mono">{order.chain_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contract</span>
            <span className="text-foreground font-mono text-xs">
              {order.escrow_contract_address.slice(0, 10)}...
              {order.escrow_contract_address.slice(-8)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Create Tx</span>
            <a
              href={`https://sepolia.etherscan.io/tx/${order.create_tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-info hover:text-info/80 font-mono text-xs"
            >
              {order.create_tx_hash.slice(0, 10)}...
            </a>
          </div>
          {order.release_tx_hash && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Release Tx</span>
              <a
                href={`https://sepolia.etherscan.io/tx/${order.release_tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-info hover:text-info/80 font-mono text-xs"
              >
                {order.release_tx_hash.slice(0, 10)}...
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
