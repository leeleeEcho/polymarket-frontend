"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Header } from "@/components/Header";
import {
  MerchantList,
  MerchantCard,
  CreateOrderModal,
  OrderList,
  OrderDetail,
} from "@/components/p2p";
import type { MerchantListItem, P2POrderListItem } from "@/types/p2p";

type Tab = "buy" | "orders";

export default function P2PPage() {
  const { isConnected } = useAccount();

  const [activeTab, setActiveTab] = useState<Tab>("buy");
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantListItem | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const handleSelectMerchant = (merchant: MerchantListItem) => {
    if (!isConnected) {
      alert("Please connect wallet first");
      return;
    }
    setSelectedMerchant(merchant);
  };

  const handleOrderCreated = (orderId: string) => {
    setSelectedMerchant(null);
    setSelectedOrderId(orderId);
    setActiveTab("orders");
  };

  const handleSelectOrder = (order: P2POrderListItem) => {
    setSelectedOrderId(order.id);
  };

  const handleBackFromOrder = () => {
    setSelectedOrderId(null);
  };

  // Render order detail view
  if (selectedOrderId) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-4 md:py-8">
          <OrderDetail orderId={selectedOrderId} onBack={handleBackFromOrder} />
        </main>
        <MobileNav active="p2p" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="status-dot status-dot-green" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              P2P Exchange
            </span>
          </div>
          <h1 className="text-2xl md:text-4xl font-light text-foreground mb-2">P2P Deposit</h1>
          <p className="text-muted-foreground">
            Purchase USDC through verified merchants. Funds secured by smart contract escrow.
          </p>
        </div>

        {/* Info Banner */}
        <div className="card-9v p-4 mb-6 border-info/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-info/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">Secure Escrow</h3>
              <p className="text-sm text-muted-foreground">
                All transactions secured by TimeLock Escrow smart contract. USDC held in escrow until payment confirmed.
              </p>
            </div>
          </div>
        </div>

        {/* Wallet Not Connected */}
        {!isConnected && (
          <div className="card-9v p-4 mb-6 border-warning/30">
            <p className="text-warning text-sm">
              Please connect your wallet to start P2P trading
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-1 bg-secondary p-1 rounded-lg w-fit mb-6">
          <button
            onClick={() => setActiveTab("buy")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition ${
              activeTab === "buy"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Buy USDC
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition ${
              activeTab === "orders"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            My Orders
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "buy" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-foreground">Select Merchant</h2>
            </div>
            <MerchantList onSelectMerchant={handleSelectMerchant} />
          </div>
        )}

        {activeTab === "orders" && (
          <div>
            {isConnected ? (
              <OrderList onSelectOrder={handleSelectOrder} />
            ) : (
              <div className="card-9v p-8 text-center">
                <p className="text-muted-foreground">Connect wallet to view orders</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Order Modal */}
      {selectedMerchant && (
        <CreateOrderModal
          merchant={selectedMerchant}
          onClose={() => setSelectedMerchant(null)}
          onSuccess={handleOrderCreated}
        />
      )}

      {/* Mobile Navigation */}
      <MobileNav active="p2p" />
    </div>
  );
}

// Mobile bottom navigation component
function MobileNav({ active }: { active: "markets" | "portfolio" | "p2p" }) {
  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-40 glass">
        <div className="flex items-center justify-around py-3">
          <Link
            href="/"
            className={`flex flex-col items-center ${
              active === "markets" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span className="text-xs mt-1 font-medium">Markets</span>
          </Link>
          <Link
            href="/p2p"
            className={`flex flex-col items-center ${
              active === "p2p" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-xs mt-1 font-medium">P2P</span>
          </Link>
          <Link
            href="/portfolio"
            className={`flex flex-col items-center ${
              active === "portfolio" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <span className="text-xs mt-1">Portfolio</span>
          </Link>
        </div>
      </nav>
      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:hidden" />
    </>
  );
}
