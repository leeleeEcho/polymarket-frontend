/**
 * CTF (Conditional Token Framework) utility functions
 *
 * This module provides correct implementation of token ID calculation
 * following Polymarket's CTF specification.
 */

import { keccak256, encodePacked, Address, Hex } from "viem";

/**
 * Calculate the condition ID from oracle, question ID, and outcome count.
 *
 * conditionId = keccak256(oracle, questionId, outcomeSlotCount)
 *
 * @param oracle - The oracle address that will resolve this condition
 * @param questionId - The unique identifier for the question (32 bytes hex)
 * @param outcomeSlotCount - Number of possible outcomes (2 for binary markets)
 * @returns The condition ID as a hex string
 */
export function calculateConditionId(
  oracle: Address,
  questionId: Hex,
  outcomeSlotCount: number
): Hex {
  return keccak256(
    encodePacked(
      ["address", "bytes32", "uint256"],
      [oracle, questionId, BigInt(outcomeSlotCount)]
    )
  );
}

/**
 * Calculate the collection ID for a specific outcome set.
 *
 * collectionId = keccak256(parentCollectionId, conditionId, indexSet)
 *
 * For binary markets:
 * - YES outcome: indexSet = 1 (binary: 01)
 * - NO outcome: indexSet = 2 (binary: 10)
 *
 * @param parentCollectionId - Parent collection ID (0x0 for root positions)
 * @param conditionId - The condition ID
 * @param indexSet - Bitmap of outcome indices (1 for YES, 2 for NO in binary markets)
 * @returns The collection ID as a hex string
 */
export function calculateCollectionId(
  parentCollectionId: Hex,
  conditionId: Hex,
  indexSet: bigint
): Hex {
  return keccak256(
    encodePacked(
      ["bytes32", "bytes32", "uint256"],
      [parentCollectionId, conditionId, indexSet]
    )
  );
}

/**
 * Calculate the position ID (token ID) for a specific position.
 *
 * positionId = keccak256(collateralToken, collectionId)
 *
 * This is the actual ERC-1155 token ID used in the ConditionalTokens contract.
 *
 * @param collateralToken - The collateral token address (e.g., USDC)
 * @param collectionId - The collection ID for this position
 * @returns The position ID as a bigint
 */
export function calculatePositionId(
  collateralToken: Address,
  collectionId: Hex
): bigint {
  const hash = keccak256(
    encodePacked(["address", "bytes32"], [collateralToken, collectionId])
  );
  return BigInt(hash);
}

/**
 * Calculate YES and NO token IDs for a binary market.
 *
 * This is the main function to use when working with a binary market.
 *
 * @param conditionId - The condition ID for this market
 * @param collateralToken - The collateral token address (e.g., USDC)
 * @returns An object with yesTokenId and noTokenId as bigint
 */
export function calculateBinaryTokenIds(
  conditionId: Hex,
  collateralToken: Address
): { yesTokenId: bigint; noTokenId: bigint } {
  // Parent collection ID is 0 for root positions
  const parentCollectionId =
    "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

  // YES outcome has index set = 1 (binary: 01)
  const yesIndexSet = 1n;
  const yesCollectionId = calculateCollectionId(
    parentCollectionId,
    conditionId,
    yesIndexSet
  );
  const yesTokenId = calculatePositionId(collateralToken, yesCollectionId);

  // NO outcome has index set = 2 (binary: 10)
  const noIndexSet = 2n;
  const noCollectionId = calculateCollectionId(
    parentCollectionId,
    conditionId,
    noIndexSet
  );
  const noTokenId = calculatePositionId(collateralToken, noCollectionId);

  return { yesTokenId, noTokenId };
}

/**
 * Calculate token ID for a specific outcome index.
 *
 * @param conditionId - The condition ID for this market
 * @param collateralToken - The collateral token address
 * @param outcomeIndex - The outcome index (0-based)
 * @returns The token ID as a bigint
 */
export function calculateTokenIdForOutcome(
  conditionId: Hex,
  collateralToken: Address,
  outcomeIndex: number
): bigint {
  const parentCollectionId =
    "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
  // Index set for outcome i is 2^i
  const indexSet = BigInt(1 << outcomeIndex);
  const collectionId = calculateCollectionId(
    parentCollectionId,
    conditionId,
    indexSet
  );
  return calculatePositionId(collateralToken, collectionId);
}

/**
 * Convert a token ID to a hex string (for display or API calls).
 * Pads to 64 characters (256 bits).
 */
export function tokenIdToHex(tokenId: bigint): Hex {
  return `0x${tokenId.toString(16).padStart(64, "0")}` as Hex;
}

/**
 * Parse a token ID from a hex string.
 */
export function tokenIdFromHex(hex: string): bigint {
  const normalized = hex.startsWith("0x") ? hex : `0x${hex}`;
  return BigInt(normalized);
}

/**
 * Generate a question ID from market parameters.
 *
 * This creates a deterministic question ID based on the market details.
 *
 * @param marketType - Type of market (e.g., "binary", "sports", "crypto")
 * @param eventId - Unique identifier for the event
 * @param resolutionTime - Unix timestamp when the market should resolve
 * @returns The question ID as a hex string
 */
export function generateQuestionId(
  marketType: string,
  eventId: string,
  resolutionTime: number
): Hex {
  return keccak256(
    encodePacked(
      ["string", "string", "string", "uint256"],
      [marketType, ":", eventId, BigInt(resolutionTime)]
    )
  );
}

/**
 * Validate that a token ID matches expected values for a market.
 *
 * @param tokenId - The token ID to validate
 * @param conditionId - The expected condition ID
 * @param collateralToken - The collateral token address
 * @param isYes - Whether this is the YES token
 * @returns true if the token ID is valid
 */
export function validateTokenId(
  tokenId: bigint,
  conditionId: Hex,
  collateralToken: Address,
  isYes: boolean
): boolean {
  const { yesTokenId, noTokenId } = calculateBinaryTokenIds(
    conditionId,
    collateralToken
  );
  return isYes ? tokenId === yesTokenId : tokenId === noTokenId;
}

// Default contract addresses (Sepolia testnet)
export const DEFAULT_USDC_ADDRESS =
  "0x43954707B63e4bbb777c81771A5853031cFB901d" as Address;
export const DEFAULT_CONDITIONAL_TOKENS_ADDRESS =
  "0xd7a05df3CD0f963DA444c7FB251Ea7ebb541E2F2" as Address;
export const DEFAULT_CTF_EXCHANGE_ADDRESS =
  "0x15b0d7db6137F6cAaB4c4E8CA8318Cb46e46C19B" as Address;
