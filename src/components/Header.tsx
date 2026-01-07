"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useBalance } from "@/hooks/useApi";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 md:py-4">
        {/* Desktop & Mobile Header */}
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 md:space-x-3 hover:opacity-80 transition">
            <Image
              src="/logo.png"
              alt="nextX Logo"
              width={32}
              height={32}
              className="rounded-lg md:w-9 md:h-9"
            />
            <span className="text-xl md:text-2xl font-bold text-white">nextX</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-6 items-center">
            <Link
              href="/"
              className={`transition ${
                pathname === "/" ? "text-white font-medium" : "text-gray-300 hover:text-white"
              }`}
            >
              Markets
            </Link>
            <Link
              href="/portfolio"
              className={`transition ${
                pathname === "/portfolio" ? "text-white font-medium" : "text-gray-300 hover:text-white"
              }`}
            >
              Portfolio
            </Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-4">
            {isConnected && usdcBalance && (
              <div className="bg-gray-700 px-4 py-2 rounded-lg">
                <span className="text-gray-400 text-sm">Balance:</span>
                <span className="ml-2 text-white font-medium">
                  {parseFloat(usdcBalance.available).toFixed(2)} USDC
                </span>
              </div>
            )}
            <ConnectButton />
          </div>

          {/* Mobile Actions */}
          <div className="flex md:hidden items-center space-x-3">
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <button
                    onClick={connected ? openAccountModal : openConnectModal}
                    className="bg-primary-600 hover:bg-primary-700 px-3 py-2 rounded-lg text-white text-sm font-medium transition"
                  >
                    {connected ? (
                      <span className="truncate max-w-[80px] inline-block">
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
              className="p-2 text-gray-400 hover:text-white transition"
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
          <div className="md:hidden mt-4 pt-4 border-t border-gray-700">
            <nav className="flex flex-col space-y-3">
              <Link
                href="/"
                className={`py-2 px-3 rounded-lg transition ${
                  pathname === "/"
                    ? "bg-primary-900 text-white"
                    : "text-gray-300 hover:bg-gray-700"
                }`}
              >
                Markets
              </Link>
              <Link
                href="/portfolio"
                className={`py-2 px-3 rounded-lg transition ${
                  pathname === "/portfolio"
                    ? "bg-primary-900 text-white"
                    : "text-gray-300 hover:bg-gray-700"
                }`}
              >
                Portfolio
              </Link>
            </nav>

            {/* Mobile Balance */}
            {isConnected && usdcBalance && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="bg-gray-700 px-4 py-3 rounded-lg flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Available Balance</span>
                  <span className="text-white font-medium">
                    {parseFloat(usdcBalance.available).toFixed(2)} USDC
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
