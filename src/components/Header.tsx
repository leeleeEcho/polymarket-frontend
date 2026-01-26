"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useBalance } from "@/hooks/useApi";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";

export function Header() {
  const { isConnected } = useAccount();
  const { balances, fetchBalance } = useBalance();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (isConnected) {
      fetchBalance();
    }
  }, [isConnected, fetchBalance]);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const usdcBalance = balances.find((b) => b.token === "USDC");

  const navItems = [
    { href: "/", label: "Markets" },
    { href: "/p2p", label: "P2P" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/account", label: "Account" },
  ];

  return (
    <header className="bg-background border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 md:py-4">
        {/* Desktop & Mobile Header */}
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition group">
            <Image
              src="/logo.png"
              alt="9V Logo"
              width={36}
              height={36}
              className="rounded-lg md:w-10 md:h-10"
            />
            <div className="flex items-center gap-2">
              <span className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                9V
              </span>
              <span className="hidden md:inline-block text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Prediction
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                  pathname === item.href
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-4">
            {isConnected && <NotificationBell />}
            {isConnected && usdcBalance && (
              <div className="flex items-center gap-3 bg-secondary px-4 py-2 rounded-lg">
                <span className="text-muted-foreground text-sm">Balance</span>
                <span className="text-foreground font-mono font-semibold">
                  {parseFloat(usdcBalance.available).toFixed(2)}
                </span>
                <span className="text-muted-foreground text-xs">USDC</span>
              </div>
            )}
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <button
                    onClick={connected ? openAccountModal : openConnectModal}
                    className="btn-9v btn-9v-primary"
                  >
                    {connected ? (
                      <span className="font-mono">
                        {account.displayName}
                      </span>
                    ) : (
                      "Connect Wallet"
                    )}
                  </button>
                );
              }}
            </ConnectButton.Custom>
          </div>

          {/* Mobile Actions */}
          <div className="flex md:hidden items-center space-x-3">
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <button
                    onClick={connected ? openAccountModal : openConnectModal}
                    className="bg-foreground text-background px-3 py-2 rounded-lg text-sm font-medium transition hover:opacity-90"
                  >
                    {connected ? (
                      <span className="truncate max-w-[80px] inline-block font-mono">
                        {account.displayName}
                      </span>
                    ) : (
                      "Connect"
                    )}
                  </button>
                );
              }}
            </ConnectButton.Custom>

            {/* Hamburger Menu */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-muted-foreground hover:text-foreground transition rounded-md hover:bg-secondary"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-border animate-slideDown">
            <nav className="flex flex-col space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`py-3 px-4 rounded-lg transition font-medium ${
                    pathname === item.href
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Mobile Balance */}
            {isConnected && usdcBalance && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="bg-secondary px-4 py-3 rounded-lg flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Available Balance</span>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-mono font-semibold">
                      {parseFloat(usdcBalance.available).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground text-xs">USDC</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
