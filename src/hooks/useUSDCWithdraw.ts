"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId } from "wagmi";
import { getNetworkConfig, isSupportedChain } from "@/lib/contracts";
import { API_BASE_URL } from "@/lib/wagmi";

// Withdrawal step enum
export type WithdrawStep =
  | "idle"
  | "requesting"
  | "processing"
  | "complete"
  | "error";

// Withdrawal result type
interface WithdrawResult {
  withdraw_id: string;
  tx_hash: string;
  amount: string;
  status: string;
  new_balance: string;
}

// Pending withdrawal type
interface PendingWithdrawal {
  id: string;
  token: string;
  amount: string;
  status: string;
  created_at: number;
}

export function useUSDCWithdraw() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const [step, setStep] = useState<WithdrawStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [withdrawResult, setWithdrawResult] = useState<WithdrawResult | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingWithdrawal[]>([]);

  const networkConfig = getNetworkConfig(chainId);
  const isChainSupported = isSupportedChain(chainId);

  // Request a withdrawal (freezes funds)
  const requestWithdraw = useCallback(
    async (amount: string): Promise<PendingWithdrawal | null> => {
      if (!address) throw new Error("Wallet not connected");

      const response = await fetch(`${API_BASE_URL}/api/v1/withdraw/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-Address": address,
        },
        body: JSON.stringify({ token: "USDC", amount }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to request withdrawal: ${response.status}`);
      }

      const data = await response.json();
      return {
        id: data.withdraw_id,
        token: data.token,
        amount: data.amount,
        status: data.status,
        created_at: data.created_at,
      };
    },
    [address]
  );

  // Process a pending withdrawal on-chain
  const processWithdraw = useCallback(
    async (withdrawId: string): Promise<WithdrawResult> => {
      if (!address) throw new Error("Wallet not connected");

      const response = await fetch(
        `${API_BASE_URL}/api/v1/withdraw/${withdrawId}/process`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Test-Address": address,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to process withdrawal: ${response.status}`);
      }

      return response.json();
    },
    [address]
  );

  // Fetch pending withdrawals
  const fetchPendingWithdrawals = useCallback(async () => {
    if (!address) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/withdraw/history`, {
        headers: {
          "X-Test-Address": address,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const pending = data.withdrawals.filter(
          (w: PendingWithdrawal) => w.status === "pending"
        );
        setPendingWithdrawals(pending);
      }
    } catch (e) {
      console.error("Failed to fetch pending withdrawals:", e);
    }
  }, [address]);

  // Main withdrawal function (request + process)
  const withdraw = useCallback(
    async (amount: string) => {
      if (!isConnected || !address) {
        setError("Please connect your wallet");
        return;
      }

      if (!isChainSupported) {
        setError("Please switch to a supported network (Polygon or Polygon Amoy)");
        return;
      }

      // Validate amount
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        setError("Please enter a valid amount");
        return;
      }

      try {
        setError(null);
        setStep("requesting");
        setTxHash(null);
        setWithdrawResult(null);

        // Step 1: Request withdrawal (freezes funds)
        const pendingWithdraw = await requestWithdraw(amount);
        if (!pendingWithdraw) {
          throw new Error("Failed to create withdrawal request");
        }

        // Step 2: Process withdrawal on-chain
        setStep("processing");

        const result = await processWithdraw(pendingWithdraw.id);

        setTxHash(result.tx_hash);
        setWithdrawResult(result);
        setStep("complete");

        return result;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Withdrawal failed";
        setError(errorMessage);
        setStep("error");
        throw e;
      }
    },
    [
      isConnected,
      address,
      isChainSupported,
      requestWithdraw,
      processWithdraw,
    ]
  );

  // Cancel a pending withdrawal
  const cancelWithdraw = useCallback(
    async (withdrawId: string) => {
      if (!address) throw new Error("Wallet not connected");

      const response = await fetch(
        `${API_BASE_URL}/api/v1/withdraw/${withdrawId}/cancel`,
        {
          method: "DELETE",
          headers: {
            "X-Test-Address": address,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to cancel withdrawal: ${response.status}`);
      }

      // Refresh pending withdrawals
      await fetchPendingWithdrawals();

      return response.json();
    },
    [address, fetchPendingWithdrawals]
  );

  // Reset state
  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setTxHash(null);
    setWithdrawResult(null);
  }, []);

  // Get step label for UI
  const getStepLabel = useCallback((currentStep: WithdrawStep): string => {
    switch (currentStep) {
      case "idle":
        return "Enter amount to withdraw";
      case "requesting":
        return "Creating withdrawal request...";
      case "processing":
        return "Processing on-chain withdrawal...";
      case "complete":
        return "Withdrawal complete!";
      case "error":
        return "Withdrawal failed";
      default:
        return "";
    }
  }, []);

  return {
    // State
    step,
    error,
    txHash,
    withdrawResult,
    isLoading: step !== "idle" && step !== "complete" && step !== "error",
    pendingWithdrawals,

    // Data
    isChainSupported,
    networkConfig,

    // Actions
    withdraw,
    requestWithdraw,
    processWithdraw,
    cancelWithdraw,
    fetchPendingWithdrawals,
    reset,

    // Helpers
    getStepLabel,
  };
}
