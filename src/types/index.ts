// Market Types
export interface Market {
  id: string;
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
