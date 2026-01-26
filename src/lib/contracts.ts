/**
 * Smart Contract Configuration for nextX
 *
 * This file contains contract addresses and ABIs for on-chain interactions.
 */

// ERC20 ABI (minimal for approve and transfer)
export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "transferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

// TimeLockEscrow ABI (P2P Escrow System)
export const TIME_LOCK_ESCROW_ABI = [
  // Core Functions
  {
    name: "createPayment",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_receiver", type: "address" },
      { name: "_token", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_lockDuration", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "manualRelease",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_paymentId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "autoRelease",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_paymentId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "raiseDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_paymentId", type: "uint256" },
      { name: "_reason", type: "string" },
    ],
    outputs: [],
  },
  // View Functions
  {
    name: "getPayment",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_paymentId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "sender", type: "address" },
          { name: "receiver", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "unlockTime", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "autoReleaseEnabled", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getUserPayments",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_user", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    name: "getPaymentStatus",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_paymentId", type: "uint256" }],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "isUnlocked",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_paymentId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "isMerchant",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_address", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "merchants",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "paymentCounter",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "escrowFeePercent",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "minEscrowAmount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "maxTransferAmount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getRemainingDailyLimit",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  // Events
  {
    name: "PaymentCreated",
    type: "event",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "unlockTime", type: "uint256", indexed: false },
    ],
  },
  {
    name: "PaymentReleased",
    type: "event",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    name: "PaymentRefunded",
    type: "event",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "DisputeRaised",
    type: "event",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "initiator", type: "address", indexed: true },
      { name: "reason", type: "string", indexed: false },
    ],
  },
  {
    name: "MerchantAdded",
    type: "event",
    inputs: [{ name: "merchant", type: "address", indexed: true }],
  },
  {
    name: "MerchantRemoved",
    type: "event",
    inputs: [{ name: "merchant", type: "address", indexed: true }],
  },
] as const;

// Payment Status enum (matches contract)
export enum PaymentStatus {
  PENDING = 0,
  DISPUTED = 1,
  RELEASED = 2,
  REFUNDED = 3,
}

// Network configuration type
export interface NetworkConfig {
  chainId: number;
  name: string;
  usdcAddress: `0x${string}`;
  vaultAddress: `0x${string}`;
  ctfExchangeAddress: `0x${string}`; // CTFExchange for Polymarket-style approve mode
  conditionalTokensAddress: `0x${string}`; // ConditionalTokens contract
  // P2P Escrow System
  timeLockEscrowAddress: `0x${string}`; // TimeLockEscrow for P2P fiat-to-crypto
  p2pUsdcAddress: `0x${string}`; // USDC for P2P system (may differ from trading USDC)
  arbitrationAddress: `0x${string}`; // Arbitration contract for disputes
  decimals: number;
  blockExplorer: string;
}

// Network configurations
export const NETWORK_CONFIG: Record<number, NetworkConfig> = {
  // Ethereum Sepolia Testnet (Primary) - v3 contracts deployed 2026-01-07
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    usdcAddress: "0xAb9e58c737b56b6fa4D1cfC53f8a09E07f3ebcB3", // Mock USDC on Sepolia (v3) for trading
    vaultAddress: "0x6538469807e019E05c9ec4Bd158b12afB1DA50F3", // Admin wallet
    ctfExchangeAddress: "0xB49b59457B5B0642e8d1d23c2CF601b9ECB51bDD", // CTFExchange on Sepolia (v3)
    conditionalTokensAddress: "0xdec2dd853880ADB871762AbBC99642B49B905Eb0", // ConditionalTokens on Sepolia (v3)
    // P2P Escrow System - deployed 2026-01-16
    timeLockEscrowAddress: "0x0Fa86e0D5ccB43921c75ba8Ab6aa8232c6949daf", // TimeLockEscrow
    p2pUsdcAddress: "0x318eF19220936C0239533E98Da66d103f915F6De", // Mock USDC for P2P
    arbitrationAddress: "0x468f03e6B9595D4520288ba0e084fD5c97D2F670", // MockArbitration
    decimals: 6,
    blockExplorer: "https://sepolia.etherscan.io",
  },
  // Polygon Amoy Testnet
  80002: {
    chainId: 80002,
    name: "Polygon Amoy",
    usdcAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // Mock USDC on Amoy
    vaultAddress: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", // Test vault (can be updated)
    ctfExchangeAddress: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Amoy
    conditionalTokensAddress: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Amoy
    timeLockEscrowAddress: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Amoy
    p2pUsdcAddress: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Amoy
    arbitrationAddress: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Amoy
    decimals: 6,
    blockExplorer: "https://amoy.polygonscan.com",
  },
  // Polygon PoS Mainnet
  137: {
    chainId: 137,
    name: "Polygon",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Native USDC on Polygon
    vaultAddress: "0x0000000000000000000000000000000000000000", // TODO: Set production vault
    ctfExchangeAddress: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Polygon
    conditionalTokensAddress: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Polygon
    timeLockEscrowAddress: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Polygon
    p2pUsdcAddress: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Polygon
    arbitrationAddress: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Polygon
    decimals: 6,
    blockExplorer: "https://polygonscan.com",
  },
  // Localhost (for development with Hardhat/Anvil)
  31337: {
    chainId: 31337,
    name: "Localhost",
    usdcAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Local deployment
    vaultAddress: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", // Local test account
    ctfExchangeAddress: "0x0000000000000000000000000000000000000000", // Local deployment
    conditionalTokensAddress: "0x0000000000000000000000000000000000000000", // Local deployment
    timeLockEscrowAddress: "0x0000000000000000000000000000000000000000", // Local deployment
    p2pUsdcAddress: "0x0000000000000000000000000000000000000000", // Local deployment
    arbitrationAddress: "0x0000000000000000000000000000000000000000", // Local deployment
    decimals: 6,
    blockExplorer: "",
  },
};

// Get network config by chain ID
export function getNetworkConfig(chainId: number): NetworkConfig | undefined {
  return NETWORK_CONFIG[chainId];
}

// Get USDC address for a chain
export function getUsdcAddress(chainId: number): `0x${string}` | undefined {
  return NETWORK_CONFIG[chainId]?.usdcAddress;
}

// Get vault address for a chain
export function getVaultAddress(chainId: number): `0x${string}` | undefined {
  return NETWORK_CONFIG[chainId]?.vaultAddress;
}

// Get CTFExchange address for a chain
export function getCtfExchangeAddress(chainId: number): `0x${string}` | undefined {
  return NETWORK_CONFIG[chainId]?.ctfExchangeAddress;
}

// Get ConditionalTokens address for a chain
export function getConditionalTokensAddress(chainId: number): `0x${string}` | undefined {
  return NETWORK_CONFIG[chainId]?.conditionalTokensAddress;
}

// Get TimeLockEscrow address for a chain
export function getTimeLockEscrowAddress(chainId: number): `0x${string}` | undefined {
  return NETWORK_CONFIG[chainId]?.timeLockEscrowAddress;
}

// Get P2P USDC address for a chain
export function getP2pUsdcAddress(chainId: number): `0x${string}` | undefined {
  return NETWORK_CONFIG[chainId]?.p2pUsdcAddress;
}

// Get Arbitration address for a chain
export function getArbitrationAddress(chainId: number): `0x${string}` | undefined {
  return NETWORK_CONFIG[chainId]?.arbitrationAddress;
}

// Max uint256 for unlimited approval (Polymarket style)
export const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

// Check if a chain is supported
export function isSupportedChain(chainId: number): boolean {
  return chainId in NETWORK_CONFIG;
}

// Get supported chain IDs
export function getSupportedChainIds(): number[] {
  return Object.keys(NETWORK_CONFIG).map(Number);
}

// USDC decimals (standard for all networks)
export const USDC_DECIMALS = 6;

// Convert human-readable amount to USDC units (with 6 decimals)
export function toUsdcUnits(amount: string | number): bigint {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return BigInt(Math.floor(num * 10 ** USDC_DECIMALS));
}

// Convert USDC units to human-readable amount
export function fromUsdcUnits(units: bigint): string {
  const num = Number(units) / 10 ** USDC_DECIMALS;
  return num.toFixed(2);
}
