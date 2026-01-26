"use client";

import { useCallback } from "react";
import { useAccount, useSignTypedData, useChainId } from "wagmi";

// EIP-712 Domain
const getDomain = (chainId: number) => ({
  name: "Polymarket",
  version: "1",
  chainId,
  verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
});

// EIP-712 Types for Order
const ORDER_TYPES = {
  Order: [
    { name: "market_id", type: "string" },
    { name: "outcome_id", type: "string" },
    { name: "side", type: "string" },
    { name: "order_type", type: "string" },
    { name: "price", type: "string" },
    { name: "amount", type: "string" },
    { name: "share_type", type: "string" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export interface OrderData {
  market_id: string;
  outcome_id: string;
  side: "buy" | "sell";
  order_type: "limit" | "market";
  price: string;
  amount: string;
  share_type: "yes" | "no";
}

export interface SignedOrder extends OrderData {
  signature: string;
  timestamp: number;
  nonce: number;
}

export function useOrderSigning() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();

  const signOrder = useCallback(
    async (orderData: OrderData): Promise<SignedOrder> => {
      if (!isConnected || !address) {
        throw new Error("Wallet not connected");
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = Date.now();

      const message = {
        market_id: orderData.market_id,
        outcome_id: orderData.outcome_id,
        side: orderData.side,
        order_type: orderData.order_type,
        price: orderData.price,
        amount: orderData.amount,
        share_type: orderData.share_type,
        timestamp: BigInt(timestamp),
        nonce: BigInt(nonce),
      };

      const signature = await signTypedDataAsync({
        domain: getDomain(chainId),
        types: ORDER_TYPES,
        primaryType: "Order",
        message,
      });

      return {
        ...orderData,
        signature,
        timestamp,
        nonce,
      };
    },
    [address, isConnected, chainId, signTypedDataAsync]
  );

  return {
    signOrder,
    isConnected,
    address,
  };
}

// Hook for WebSocket authentication signing
export function useWsAuthSigning() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();

  const WS_AUTH_TYPES = {
    WebSocketAuth: [
      { name: "wallet", type: "address" },
      { name: "timestamp", type: "uint256" },
    ],
  } as const;

  const signWsAuth = useCallback(async () => {
    if (!isConnected || !address) {
      throw new Error("Wallet not connected");
    }

    const timestamp = Math.floor(Date.now() / 1000);

    const signature = await signTypedDataAsync({
      domain: getDomain(chainId),
      types: WS_AUTH_TYPES,
      primaryType: "WebSocketAuth",
      message: {
        wallet: address,
        timestamp: BigInt(timestamp),
      },
    });

    return {
      address,
      signature,
      timestamp,
    };
  }, [address, isConnected, chainId, signTypedDataAsync]);

  return {
    signWsAuth,
    isConnected,
    address,
  };
}
