"use client";

import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { useUSDCDeposit, DepositStep } from "@/hooks/useUSDCDeposit";
import { useUSDCWithdraw, WithdrawStep } from "@/hooks/useUSDCWithdraw";
import { useDeposit, useWithdraw, useBalance } from "@/hooks/useApi";
import { getNetworkConfig, isSupportedChain } from "@/lib/contracts";

interface DepositPanelProps {
  onBalanceUpdate?: () => void;
}

export function DepositPanel({ onBalanceUpdate }: DepositPanelProps) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { balances, fetchBalance } = useBalance();

  // Development mode deposit/withdraw (API-based)
  const { deposit: devDeposit, loading: devDepositLoading } = useDeposit();
  const { withdraw: devWithdraw, loading: devWithdrawLoading } = useWithdraw();

  // On-chain deposit (with Polymarket approve mode)
  const {
    step: depositStep,
    error: depositError,
    txHash: depositTxHash,
    depositResult,
    isLoading: depositLoading,
    usdcBalance: walletUsdcBalance,
    allowance: ctfAllowance,
    isChainSupported,
    networkConfig,
    ctfExchangeAddress,
    useApproveMode,
    setUseApproveMode,
    deposit: onChainDeposit,
    reset: resetDeposit,
    getStepLabel: getDepositStepLabel,
  } = useUSDCDeposit();

  // On-chain withdraw
  const {
    step: withdrawStep,
    error: withdrawError,
    txHash: withdrawTxHash,
    withdrawResult,
    isLoading: withdrawLoading,
    withdraw: onChainWithdraw,
    reset: resetWithdraw,
    getStepLabel: getWithdrawStepLabel,
  } = useUSDCWithdraw();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [message, setMessage] = useState("");
  const [useOnChain, setUseOnChain] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const usdcBalance = balances.find((b) => b.token === "USDC");

  // Handle development deposit
  const handleDevDeposit = async () => {
    try {
      setMessage("");
      await devDeposit(depositAmount);
      setMessage("Deposit successful!");
      setDepositAmount("");
      fetchBalance();
      onBalanceUpdate?.();
    } catch (e) {
      setMessage(`Deposit failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  // Handle on-chain deposit
  const handleOnChainDeposit = async () => {
    try {
      setMessage("");
      resetDeposit();
      await onChainDeposit(depositAmount);
      setMessage("On-chain deposit confirmed!");
      setDepositAmount("");
      fetchBalance();
      onBalanceUpdate?.();
    } catch (e) {
      // Error is handled in the hook
    }
  };

  // Handle development withdraw
  const handleDevWithdraw = async () => {
    try {
      setMessage("");
      await devWithdraw(withdrawAmount);
      setMessage("Withdrawal successful!");
      setWithdrawAmount("");
      fetchBalance();
      onBalanceUpdate?.();
    } catch (e) {
      setMessage(`Withdrawal failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  // Handle on-chain withdraw
  const handleOnChainWithdraw = async () => {
    try {
      setMessage("");
      resetWithdraw();
      await onChainWithdraw(withdrawAmount);
      setMessage("On-chain withdrawal confirmed!");
      setWithdrawAmount("");
      fetchBalance();
      onBalanceUpdate?.();
    } catch (e) {
      // Error is handled in the hook
    }
  };

  // Get step indicator color for deposit
  const getDepositStepColor = (currentStep: DepositStep) => {
    switch (currentStep) {
      case "complete":
        return "text-success";
      case "error":
        return "text-destructive";
      default:
        return "text-info";
    }
  };

  // Get step indicator color for withdraw
  const getWithdrawStepColor = (currentStep: WithdrawStep) => {
    switch (currentStep) {
      case "complete":
        return "text-success";
      case "error":
        return "text-destructive";
      default:
        return "text-info";
    }
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="card-9v p-4 md:p-6 mb-6 md:mb-8">
      {/* Header - Collapsible on mobile */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between md:cursor-default"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-foreground">Balance</h2>
          <span className="metric-value text-xl text-foreground">
            {usdcBalance ? parseFloat(usdcBalance.available).toFixed(2) : "0.00"}
          </span>
          <span className="text-muted-foreground text-sm">USDC</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode indicator */}
          <span className="hidden sm:inline px-2 py-1 bg-secondary rounded text-xs font-mono text-muted-foreground">
            {useOnChain ? (useApproveMode ? "APPROVE" : "VAULT") : "TEST"}
          </span>
          {/* Expand/Collapse icon - Mobile only */}
          <svg
            className={`w-5 h-5 text-muted-foreground md:hidden transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable content on mobile, always visible on desktop */}
      <div className={`${isExpanded ? "block" : "hidden"} md:block mt-4`}>
        {/* Mode selector */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Mode:</span>
          <div className="flex gap-1">
            <button
              onClick={() => {
                setUseOnChain(false);
                resetDeposit();
                resetWithdraw();
              }}
              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                !useOnChain
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Test
            </button>
            <button
              onClick={() => {
                setUseOnChain(true);
                setUseApproveMode(true);
              }}
              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                useOnChain && useApproveMode
                  ? "bg-success text-white"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
              title="Polymarket-style: Approve USDC for CTFExchange"
            >
              Approve
            </button>
            <button
              onClick={() => {
                setUseOnChain(true);
                setUseApproveMode(false);
              }}
              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                useOnChain && !useApproveMode
                  ? "bg-info text-white"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
              title="Legacy: Transfer USDC to vault"
            >
              Vault
            </button>
          </div>
        </div>

        {/* Network warning for on-chain mode */}
        {useOnChain && !isChainSupported && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-4">
            <p className="text-warning text-sm">
              Please switch to Polygon or Polygon Amoy to use on-chain deposits.
            </p>
          </div>
        )}

        {/* Network info for on-chain mode */}
        {useOnChain && isChainSupported && networkConfig && (
          <div className="bg-secondary/50 rounded-lg p-3 mb-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Network:</span>
                <span className="text-foreground ml-2 font-mono">{networkConfig.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Wallet:</span>
                <span className="text-foreground ml-2 font-mono">{walletUsdcBalance} USDC</span>
              </div>
              {useApproveMode && ctfExchangeAddress && (
                <>
                  <div>
                    <span className="text-muted-foreground">Allowance:</span>
                    <span className={`ml-2 font-mono ${parseFloat(ctfAllowance) > 0 ? 'text-success' : 'text-warning'}`}>
                      {parseFloat(ctfAllowance) > 1e12 ? 'Unlimited' : `${ctfAllowance}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">CTF:</span>
                    <span className="text-muted-foreground ml-2 text-xs font-mono">
                      {ctfExchangeAddress.slice(0, 6)}...{ctfExchangeAddress.slice(-4)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Balance and Actions Grid */}
        <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-3 md:gap-6">
          {/* Current Balance - Hidden on mobile (shown in header) */}
          <div className="hidden md:block bg-secondary rounded-lg p-4">
            <p className="metric-label mb-1">Platform Balance</p>
            <p className="metric-value text-2xl text-foreground">
              {usdcBalance ? parseFloat(usdcBalance.available).toFixed(2) : "0.00"} USDC
            </p>
            {usdcBalance && parseFloat(usdcBalance.frozen) > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                + {parseFloat(usdcBalance.frozen).toFixed(2)} frozen
              </p>
            )}
          </div>

          {/* Mobile Balance Card */}
          <div className="md:hidden bg-secondary/50 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Available</span>
              <span className="text-foreground font-mono font-medium">
                {usdcBalance ? parseFloat(usdcBalance.available).toFixed(2) : "0.00"} USDC
              </span>
            </div>
            {usdcBalance && parseFloat(usdcBalance.frozen) > 0 && (
              <div className="flex justify-between items-center mt-1">
                <span className="text-muted-foreground text-sm">Frozen</span>
                <span className="text-muted-foreground font-mono">
                  {parseFloat(usdcBalance.frozen).toFixed(2)} USDC
                </span>
              </div>
            )}
          </div>

          {/* Deposit / Approve */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">
              {useOnChain && useApproveMode
                ? "Enable USDC"
                : useOnChain
                  ? "Deposit (Vault)"
                  : "Deposit USDC"}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Amount"
                disabled={useOnChain ? depositLoading : devDepositLoading}
                className="flex-1 min-w-0 bg-input border border-border rounded-lg py-2.5 px-3 text-foreground font-mono text-base focus:outline-none focus:border-foreground/50 disabled:opacity-50"
              />
              <button
                onClick={useOnChain ? handleOnChainDeposit : handleDevDeposit}
                disabled={
                  useOnChain
                    ? depositLoading || !depositAmount || !isChainSupported
                    : devDepositLoading || !depositAmount
                }
                className="px-4 py-2.5 bg-success hover:bg-success/90 disabled:bg-muted disabled:cursor-not-allowed rounded-lg text-white font-medium transition whitespace-nowrap"
              >
                {useOnChain
                  ? depositLoading
                    ? "..."
                    : useApproveMode
                      ? "Approve"
                      : "Deposit"
                  : devDepositLoading
                  ? "..."
                  : "Deposit"}
              </button>
            </div>

            {/* On-chain deposit progress */}
            {useOnChain && depositStep !== "idle" && (
              <div className="mt-3 p-3 bg-secondary rounded-lg">
                <p className={`text-sm font-mono ${getDepositStepColor(depositStep)}`}>
                  {getDepositStepLabel(depositStep)}
                </p>
                {depositTxHash && (
                  <a
                    href={`${networkConfig?.blockExplorer}/tx/${depositTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-info hover:underline mt-1 block truncate font-mono"
                  >
                    View tx: {depositTxHash.slice(0, 10)}...{depositTxHash.slice(-8)}
                  </a>
                )}
                {depositResult && (
                  <p className="text-xs text-success mt-1 font-mono">
                    New balance: {parseFloat(depositResult.new_balance).toFixed(2)} USDC
                  </p>
                )}
                {depositError && (
                  <p className="text-xs text-destructive mt-1">{depositError}</p>
                )}
              </div>
            )}
          </div>

          {/* Withdraw */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">
              Withdraw USDC
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Amount"
                disabled={useOnChain ? withdrawLoading : devWithdrawLoading}
                className="flex-1 min-w-0 bg-input border border-border rounded-lg py-2.5 px-3 text-foreground font-mono text-base focus:outline-none focus:border-foreground/50 disabled:opacity-50"
              />
              <button
                onClick={useOnChain ? handleOnChainWithdraw : handleDevWithdraw}
                disabled={
                  useOnChain
                    ? withdrawLoading || !withdrawAmount || !isChainSupported
                    : devWithdrawLoading || !withdrawAmount
                }
                className="px-4 py-2.5 bg-destructive hover:bg-destructive/90 disabled:bg-muted disabled:cursor-not-allowed rounded-lg text-white font-medium transition whitespace-nowrap"
              >
                {useOnChain
                  ? withdrawLoading
                    ? "..."
                    : "Withdraw"
                  : devWithdrawLoading
                  ? "..."
                  : "Withdraw"}
              </button>
            </div>

            {/* On-chain withdraw progress */}
            {useOnChain && withdrawStep !== "idle" && (
              <div className="mt-3 p-3 bg-secondary rounded-lg">
                <p className={`text-sm font-mono ${getWithdrawStepColor(withdrawStep)}`}>
                  {getWithdrawStepLabel(withdrawStep)}
                </p>
                {withdrawTxHash && (
                  <a
                    href={`${networkConfig?.blockExplorer}/tx/${withdrawTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-info hover:underline mt-1 block truncate font-mono"
                  >
                    View tx: {withdrawTxHash.slice(0, 10)}...{withdrawTxHash.slice(-8)}
                  </a>
                )}
                {withdrawResult && (
                  <p className="text-xs text-success mt-1 font-mono">
                    New balance: {parseFloat(withdrawResult.new_balance).toFixed(2)} USDC
                  </p>
                )}
                {withdrawError && (
                  <p className="text-xs text-destructive mt-1">{withdrawError}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Message */}
        {message && (
          <p
            className={`mt-4 text-sm font-mono ${
              message.includes("failed") ? "text-destructive" : "text-success"
            }`}
          >
            {message}
          </p>
        )}

        {/* Mode description - Hidden on mobile by default */}
        <p className="hidden md:block mt-4 text-xs text-muted-foreground">
          {useOnChain
            ? useApproveMode
              ? "Approve mode (Polymarket style): USDC stays in your wallet. You approve CTFExchange to spend it during trades. Gas-efficient!"
              : "Vault mode: USDC is transferred to the platform vault. Withdrawals return USDC to your wallet."
            : "Test mode: Instant deposits/withdrawals for development (no real transaction)."}
        </p>
      </div>
    </div>
  );
}
