// Market Types
export interface Market {
  id: string;
  slug?: string;                 // URL-friendly slug (e.g., "super-bowl-champion-2026-731")
  question: string;
  description: string;
  category: string;
  status: "open" | "active" | "paused" | "closed" | "resolved" | "cancelled";
  resolution_time: string;
  end_time?: number;
  resolution_source?: string;
  outcomes: Outcome[];
  volume_24h: string;
  total_volume?: string;
  liquidity?: string;
  created_at: string;
  // CTF on-chain fields
  condition_id?: string;        // Gnosis CTF condition ID (bytes32)
  yes_token_id?: string;        // ERC1155 token ID for Yes outcome
  no_token_id?: string;         // ERC1155 token ID for No outcome
}

// Generate a Polymarket-style slug from market question
export function generateSlug(question: string, id: string): string {
  // Take first 50 chars of question, convert to lowercase, replace spaces and special chars
  const cleanQuestion = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special characters
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/-+/g, '-')            // Replace multiple hyphens with single
    .slice(0, 50)                   // Limit length
    .replace(/-$/, '');             // Remove trailing hyphen

  // Append last 3 chars of ID for uniqueness (like Polymarket's "731")
  const idSuffix = id.replace(/-/g, '').slice(-3);

  return `${cleanQuestion}-${idSuffix}`;
}

// Get market URL path (for linking)
export function getMarketUrl(market: Market): string {
  const slug = market.slug || generateSlug(market.question, market.id);
  return `/event/${slug}`;
}

export interface Outcome {
  id: string;
  name: string;
  probability: number | string;
}

// Order Types
export interface OrderRequest {
  market_id: string;
  outcome_id: string;
  side: "buy" | "sell";
  order_type: "limit" | "market";
  price: string;
  amount: string;
  share_type: "yes" | "no";
  signature: string;
  timestamp: number;
  nonce: number;
}

export interface Order {
  id: string;
  market_id: string;
  outcome_id: string;
  user_address: string;
  side: "buy" | "sell";
  order_type: "limit" | "market";
  price: string;
  amount: string;
  filled_amount: string;
  share_type: "yes" | "no";
  status: "open" | "filled" | "partially_filled" | "cancelled";
  created_at: string;
}

// Orderbook Types
export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface Orderbook {
  market_id: string;
  outcome_id: string;
  share_type: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

// Balance Types
export interface Balance {
  token: string;
  available: string;
  frozen: string;
  total: string;
}

// Trade Types
export interface Trade {
  id: string;
  market_id: string;
  outcome_id: string;
  share_type: string;
  price: string;
  amount: string;
  side: string;
  match_type: string;
  timestamp: number;
}

// Position Types
export interface Position {
  market_id: string;
  outcome_id: string;
  share_type: string;
  shares: string;
  avg_price: string;
  unrealized_pnl: string;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  code?: string;
}

// P2P Types
export * from "./p2p";
