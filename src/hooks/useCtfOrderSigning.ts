"use client";

import { useCallback } from "react";
import { useAccount, useSignTypedData, useChainId } from "wagmi";
import { getCtfExchangeAddress } from "@/lib/contracts";

// EIP-712 Domain for CTFExchange (must match contract constructor)
const getCtfDomain = (chainId: number, exchangeAddress: `0x${string}`) => ({
  name: "PolymarketCTFExchange",  // Must match contract: EIP712("PolymarketCTFExchange", "1")
  version: "1",
  chainId,
  verifyingContract: exchangeAddress,
});

// EIP-712 Types for CTFExchange Order (Polymarket style)
const CTF_ORDER_TYPES = {
  Order: [
    { name: "maker", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "sigType", type: "uint8" },
  ],
} as const;

// Side enum matching contract
export enum OrderSide {
  Buy = 0,
  Sell = 1,
}

// Signature type enum
export enum SignatureType {
  EOA = 0,
  PolyProxy = 1,
  PolyGnosisSafe = 2,
}

// CTF Order data (input from UI)
export interface CtfOrderInput {
  tokenId: bigint;        // CTF position token ID
  side: OrderSide;        // Buy or Sell
  price: string;          // Price in decimal (e.g., "0.65")
  amount: string;         // Amount in shares
  expirationMinutes?: number; // Order expiration (default: 60 minutes)
  feeRateBps?: number;    // Fee rate in basis points (default: 200 = 2%)
}

// Signed CTF Order (ready for backend/chain)
export interface SignedCtfOrder {
  maker: `0x${string}`;
  taker: `0x${string}`;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: OrderSide;
  sigType: SignatureType;
  signature: string;
}

// Helper: Calculate maker/taker amounts from price and amount
// For a BUY order at price P for A shares:
//   - makerAmount = A * P * 1e6 (USDC with 6 decimals)
//   - takerAmount = A * 1e6 (shares)
// For a SELL order at price P for A shares:
//   - makerAmount = A * 1e6 (shares)
//   - takerAmount = A * P * 1e6 (USDC)
function calculateAmounts(
  side: OrderSide,
  price: string,
  amount: string
): { makerAmount: bigint; takerAmount: bigint } {
  const priceNum = parseFloat(price);
  const amountNum = parseFloat(amount);

  // Use 6 decimals for USDC and shares
  const DECIMALS = 1000000;

  if (side === OrderSide.Buy) {
    // Buying shares: pay USDC, receive shares
    const usdcAmount = BigInt(Math.floor(priceNum * amountNum * DECIMALS));
    const shareAmount = BigInt(Math.floor(amountNum * DECIMALS));
    return {
      makerAmount: usdcAmount,
      takerAmount: shareAmount,
    };
  } else {
    // Selling shares: give shares, receive USDC
    const shareAmount = BigInt(Math.floor(amountNum * DECIMALS));
    const usdcAmount = BigInt(Math.floor(priceNum * amountNum * DECIMALS));
    return {
      makerAmount: shareAmount,
      takerAmount: usdcAmount,
    };
  }
}

export function useCtfOrderSigning() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();

  const ctfExchangeAddress = getCtfExchangeAddress(chainId);

  const signCtfOrder = useCallback(
    async (orderInput: CtfOrderInput): Promise<SignedCtfOrder> => {
      if (!isConnected || !address) {
        throw new Error("Wallet not connected");
      }

      if (!ctfExchangeAddress || ctfExchangeAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error("CTFExchange not deployed on this network");
      }

      // Calculate amounts
      const { makerAmount, takerAmount } = calculateAmounts(
        orderInput.side,
        orderInput.price,
        orderInput.amount
      );

      // Set expiration (default 60 minutes)
      const expirationMinutes = orderInput.expirationMinutes ?? 60;
      const expiration = BigInt(Math.floor(Date.now() / 1000) + expirationMinutes * 60);

      // Generate nonce (timestamp-based for uniqueness)
      const nonce = BigInt(Date.now());

      // Fee rate (default 200 bps = 2%)
      const feeRateBps = BigInt(orderInput.feeRateBps ?? 200);

      // Build order message
      const order = {
        maker: address,
        taker: "0x0000000000000000000000000000000000000000" as `0x${string}`, // Any taker
        tokenId: orderInput.tokenId,
        makerAmount,
        takerAmount,
        expiration,
        nonce,
        feeRateBps,
        side: orderInput.side,
        sigType: SignatureType.EOA,
      };

      // Sign with EIP-712
      const signature = await signTypedDataAsync({
        domain: getCtfDomain(chainId, ctfExchangeAddress),
        types: CTF_ORDER_TYPES,
        primaryType: "Order",
        message: order,
      });

      return {
        maker: address,
        taker: order.taker,
        tokenId: orderInput.tokenId.toString(),
        makerAmount: makerAmount.toString(),
        takerAmount: takerAmount.toString(),
        expiration: expiration.toString(),
        nonce: nonce.toString(),
        feeRateBps: feeRateBps.toString(),
        side: orderInput.side,
        sigType: SignatureType.EOA,
        signature,
      };
    },
    [address, isConnected, chainId, ctfExchangeAddress, signTypedDataAsync]
  );

  return {
    signCtfOrder,
    isConnected,
    address,
    ctfExchangeAddress,
    chainId,
  };
}

// Helper hook to calculate tokenId from market/outcome
// tokenId = getPositionId(collateral, getCollectionId(parentCollectionId, conditionId, indexSet))
// For Yes outcome: indexSet = 1 (binary 01)
// For No outcome: indexSet = 2 (binary 10)
export function useTokenId() {
  // This would need to call the ConditionalTokens contract
  // For now, return a helper function
  const calculateTokenId = useCallback(
    async (
      conditionId: `0x${string}`,
      isYes: boolean
    ): Promise<bigint> => {
      // In a real implementation, this would call:
      // 1. ConditionalTokens.getCollectionId(parentCollectionId, conditionId, indexSet)
      // 2. ConditionalTokens.getPositionId(collateral, collectionId)

      // For now, we'll use a simplified calculation
      // indexSet: 1 for Yes, 2 for No
      const indexSet = isYes ? BigInt(1) : BigInt(2);

      // Simplified token ID (in production, call contract)
      // This is placeholder - actual implementation needs contract calls
      const conditionIdBigInt = BigInt(conditionId);
      return conditionIdBigInt + indexSet;
    },
    []
  );

  return { calculateTokenId };
}
