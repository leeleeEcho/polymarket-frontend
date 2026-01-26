"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  ERC20_ABI,
  getNetworkConfig,
  getUsdcAddress,
  getVaultAddress,
  getCtfExchangeAddress,
  isSupportedChain,
  toUsdcUnits,
  fromUsdcUnits,
  MAX_UINT256,
} from "@/lib/contracts";
import { API_BASE_URL } from "@/lib/wagmi";

// Deposit step enum
export type DepositStep = "idle" | "checking" | "approving" | "transferring" | "confirming" | "complete" | "error";

// Deposit result type
interface DepositResult {
  deposit_id: string;
  amount: string;
  status: string;
  new_balance: string;
}

export function useUSDCDeposit() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const [step, setStep] = useState<DepositStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [depositResult, setDepositResult] = useState<DepositResult | null>(null);
  const [useApproveMode, setUseApproveMode] = useState(true); // Default to Polymarket-style approve mode

  const usdcAddress = getUsdcAddress(chainId);
  const vaultAddress = getVaultAddress(chainId);
  const ctfExchangeAddress = getCtfExchangeAddress(chainId);
  const networkConfig = getNetworkConfig(chainId);

  // Determine the spender address based on mode
  const spenderAddress = useApproveMode ? ctfExchangeAddress : vaultAddress;

  // Read USDC balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!usdcAddress,
    },
  });

  // Read allowance for CTFExchange (Polymarket mode) or Vault (legacy mode)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && spenderAddress ? [address, spenderAddress] : undefined,
    query: {
      enabled: !!address && !!usdcAddress && !!spenderAddress,
    },
  });

  // Write contract hook for approve and transfer
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();

  // Wait for transaction receipt
  const { isLoading: isWaitingTx, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  });

  // Check if chain is supported
  const isChainSupported = isSupportedChain(chainId);

  // Format balance for display
  const formattedBalance = usdcBalance ? fromUsdcUnits(usdcBalance as bigint) : "0.00";

  // Confirm deposit with backend
  const confirmDeposit = useCallback(async (hash: string): Promise<DepositResult> => {
    if (!address) throw new Error("Wallet not connected");

    const response = await fetch(`${API_BASE_URL}/api/v1/deposit/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Address": address,
      },
      body: JSON.stringify({ tx_hash: hash }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to confirm deposit: ${response.status}`);
    }

    return response.json();
  }, [address]);

  // Main deposit function - supports two modes:
  // 1. Approve mode (Polymarket style): Just approve CTFExchange, no transfer
  // 2. Legacy mode: Transfer USDC to vault
  const deposit = useCallback(async (amount: string) => {
    if (!isConnected || !address) {
      setError("Please connect your wallet");
      return;
    }

    if (!isChainSupported) {
      setError(`Please switch to a supported network (Sepolia for testnet)`);
      return;
    }

    if (!usdcAddress) {
      setError("Network configuration error: USDC address not found");
      return;
    }

    // For approve mode, we need CTFExchange address
    if (useApproveMode && !ctfExchangeAddress) {
      setError("CTFExchange not deployed on this network");
      return;
    }

    // For legacy mode, we need vault address
    if (!useApproveMode && !vaultAddress) {
      setError("Vault address not configured");
      return;
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    const amountInUnits = toUsdcUnits(amount);

    // Check balance
    if (usdcBalance && amountInUnits > (usdcBalance as bigint)) {
      setError("Insufficient USDC balance");
      return;
    }

    try {
      setError(null);
      setStep("checking");
      setTxHash(null);
      setDepositResult(null);

      // Refresh allowance
      await refetchAllowance();

      const currentAllowance = allowance as bigint | undefined;

      if (useApproveMode) {
        // ===== POLYMARKET APPROVE MODE =====
        // Just approve CTFExchange to spend USDC (unlimited approval)
        // No transfer needed - USDC stays in user's wallet until trade execution

        // Check if we already have sufficient allowance
        if (currentAllowance && currentAllowance >= amountInUnits) {
          // Already approved enough
          setStep("complete");
          setDepositResult({
            deposit_id: "approve-" + Date.now(),
            amount: amount,
            status: "approved",
            new_balance: fromUsdcUnits(usdcBalance as bigint),
          });
          return;
        }

        setStep("approving");

        // Approve CTFExchange with MAX_UINT256 for unlimited trading (Polymarket style)
        const approveTx = await writeContractAsync({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ctfExchangeAddress!, MAX_UINT256],
        });

        setTxHash(approveTx);
        setStep("confirming");

        // Wait for approval confirmation
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          // Re-fetch allowance to check if approved
          const { data: newAllowance } = await refetchAllowance();
          if (newAllowance && (newAllowance as bigint) >= amountInUnits) {
            break;
          }
        }

        setStep("complete");
        setDepositResult({
          deposit_id: "approve-" + Date.now(),
          amount: amount,
          status: "approved",
          new_balance: fromUsdcUnits(usdcBalance as bigint),
        });

        return;
      }

      // ===== LEGACY VAULT TRANSFER MODE =====
      // Step 1: Check and approve if needed
      if (!currentAllowance || currentAllowance < amountInUnits) {
        setStep("approving");

        // Approve the vault to spend USDC
        const approveTx = await writeContractAsync({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [vaultAddress!, amountInUnits],
        });

        // Wait for approval confirmation
        setTxHash(approveTx);

        // Poll for transaction confirmation
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const receipt = await fetch(
            `${networkConfig?.blockExplorer}/api?module=transaction&action=gettxreceiptstatus&txhash=${approveTx}`
          ).catch(() => null);
          if (receipt) {
            break;
          }
        }

        // Refresh allowance after approval
        await refetchAllowance();
      }

      // Step 2: Transfer USDC to vault
      setStep("transferring");

      const transferTx = await writeContractAsync({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [vaultAddress!, amountInUnits],
      });

      setTxHash(transferTx);

      // Wait for transfer confirmation (poll backend)
      setStep("confirming");

      // Retry confirmation a few times
      let result: DepositResult | null = null;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((r) => setTimeout(r, 3000)); // Wait 3 seconds between attempts

        try {
          result = await confirmDeposit(transferTx);
          break;
        } catch (e) {
          lastError = e as Error;
          // If it's a "needs more confirmations" error, keep retrying
          if (!lastError.message.includes("confirmations") && !lastError.message.includes("not found")) {
            break;
          }
        }
      }

      if (!result) {
        throw lastError || new Error("Failed to confirm deposit after multiple attempts");
      }

      setDepositResult(result);
      setStep("complete");

      // Refresh balances
      await refetchBalance();

      return result;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Deposit failed";
      setError(errorMessage);
      setStep("error");
      throw e;
    }
  }, [
    isConnected,
    address,
    isChainSupported,
    usdcAddress,
    vaultAddress,
    ctfExchangeAddress,
    usdcBalance,
    allowance,
    useApproveMode,
    writeContractAsync,
    confirmDeposit,
    refetchAllowance,
    refetchBalance,
    networkConfig,
  ]);

  // Reset state
  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setTxHash(null);
    setDepositResult(null);
  }, []);

  // Get step label for UI
  const getStepLabel = useCallback((currentStep: DepositStep): string => {
    if (useApproveMode) {
      // Polymarket approve mode labels
      switch (currentStep) {
        case "idle":
          return "Enter amount to enable for trading";
        case "checking":
          return "Checking current allowance...";
        case "approving":
          return "Approving USDC for CTFExchange... (confirm in wallet)";
        case "confirming":
          return "Confirming approval on-chain...";
        case "complete":
          return "USDC approved for trading!";
        case "error":
          return "Approval failed";
        default:
          return "";
      }
    } else {
      // Legacy vault transfer mode labels
      switch (currentStep) {
        case "idle":
          return "Enter amount to deposit";
        case "checking":
          return "Checking allowance...";
        case "approving":
          return "Approving USDC... (confirm in wallet)";
        case "transferring":
          return "Transferring USDC... (confirm in wallet)";
        case "confirming":
          return "Confirming deposit on-chain...";
        case "complete":
          return "Deposit complete!";
        case "error":
          return "Deposit failed";
        default:
          return "";
      }
    }
  }, [useApproveMode]);

  return {
    // State
    step,
    error,
    txHash,
    depositResult,
    isLoading: step !== "idle" && step !== "complete" && step !== "error",

    // Data
    usdcBalance: formattedBalance,
    allowance: allowance ? fromUsdcUnits(allowance as bigint) : "0",
    isChainSupported,
    networkConfig,
    ctfExchangeAddress,

    // Mode
    useApproveMode,
    setUseApproveMode,

    // Actions
    deposit,
    reset,
    refetchBalance,
    refetchAllowance,

    // Helpers
    getStepLabel,
  };
}
