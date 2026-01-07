"use client";

import * as React from "react";
import dynamic from "next/dynamic";

// Dynamically import wallet providers to prevent SSR issues
const WalletProviders = dynamic(
  () => import("@/app/wallet-providers").then((mod) => mod.WalletProviders),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-gray-900">
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      </div>
    ),
  }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
