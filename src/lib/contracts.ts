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

// Network configuration type
export interface NetworkConfig {
  chainId: number;
  name: string;
  usdcAddress: `0x${string}`;
  vaultAddress: `0x${string}`;
  ctfExchangeAddress: `0x${string}`; // CTFExchange for Polymarket-style approve mode
  conditionalTokensAddress: `0x${string}`; // ConditionalTokens contract
  decimals: number;
  blockExplorer: string;
}

// Network configurations
export const NETWORK_CONFIG: Record<number, NetworkConfig> = {
  // Ethereum Sepolia Testnet (Primary) - v3 contracts deployed 2026-01-07
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    usdcAddress: "0xAb9e58c737b56b6fa4D1cfC53f8a09E07f3ebcB3", // Mock USDC on Sepolia (v3)
    vaultAddress: "0x6538469807e019E05c9ec4Bd158b12afB1DA50F3", // Admin wallet
    ctfExchangeAddress: "0xB49b59457B5B0642e8d1d23c2CF601b9ECB51bDD", // CTFExchange on Sepolia (v3)
    conditionalTokensAddress: "0xdec2dd853880ADB871762AbBC99642B49B905Eb0", // ConditionalTokens on Sepolia (v3)
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
