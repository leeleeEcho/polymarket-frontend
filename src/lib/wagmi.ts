import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http, createConfig } from "wagmi";
import { mainnet, polygon, polygonAmoy, sepolia, localhost } from "wagmi/chains";

// Custom localhost chain for development
const localChain = {
  ...localhost,
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
};

const chains = [sepolia, polygon, polygonAmoy, localChain, mainnet] as const;

// Create config - only initialize WalletConnect on client
export const config = getDefaultConfig({
  appName: "Polymarket",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",
  chains,
  transports: {
    [sepolia.id]: http("https://1rpc.io/sepolia"),
    [polygon.id]: http(),
    [polygonAmoy.id]: http(),
    [localChain.id]: http("http://127.0.0.1:8545"),
    [mainnet.id]: http(),
  },
  ssr: false, // Disable SSR for WalletConnect
});

// API configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws";

// EIP-712 Domain for legacy order signing (off-chain only)
export const EIP712_DOMAIN = {
  name: "Polymarket",
  version: "1",
  chainId: 11155111, // Sepolia (primary testnet)
  verifyingContract: "0x023c3986F25A7e36357bb290c4CE040C602A0e77" as `0x${string}`, // CTFExchange on Sepolia
};

// EIP-712 Types for legacy order signing (off-chain only)
export const ORDER_TYPES = {
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

// ===============================================
// CTFExchange EIP-712 Configuration (Polymarket style)
// ===============================================

// EIP-712 Domain for CTFExchange on-chain orders
export const CTF_EIP712_DOMAIN = {
  name: "CTFExchange",
  version: "1",
  chainId: 11155111, // Sepolia
  verifyingContract: "0x023c3986F25A7e36357bb290c4CE040C602A0e77" as `0x${string}`, // CTFExchange
};

// EIP-712 Types for CTFExchange Order (matches on-chain struct)
export const CTF_ORDER_TYPES = {
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
