// P2P Escrow System Types

// ============ Enums ============

export type P2POrderStatus =
  | "PENDING"
  | "PAID"
  | "RELEASED"
  | "DISPUTED"
  | "REFUNDED"
  | "CANCELLED"
  | "EXPIRED";

export type MerchantStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "BANNED";

export type DisputeStatus = "PENDING" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";

export type PaymentMethodType = "ALIPAY" | "WECHAT" | "BANK_CARD" | "OTHER";

// ============ Merchant Types ============

export interface Merchant {
  id: string;
  user_id: string;
  wallet_address: string;
  merchant_name: string;
  status: MerchantStatus;
  supported_currencies: string[];
  supported_payment_methods: string[];
  min_order_amount: string;
  max_order_amount: string;
  daily_limit: string;
  payment_info?: PaymentInfo;
  total_orders: number;
  completed_orders: number;
  disputed_orders: number;
  total_volume: string;
  average_release_time?: number;
  rating?: string;
  rating_count: number;
  is_whitelisted: boolean;
  whitelist_tx_hash?: string;
  created_at: string;
  updated_at: string;
  approved_at?: string;
  approved_by?: string;
}

export interface MerchantListItem {
  id: string;
  merchant_name: string;
  wallet_address: string;
  status: MerchantStatus;
  supported_currencies: string[];
  supported_payment_methods: string[];
  min_order_amount: string;
  max_order_amount: string;
  total_orders: number;
  completed_orders: number;
  completion_rate: string;
  rating?: string;
  rating_count: number;
  is_whitelisted: boolean;
}

export interface PaymentInfo {
  alipay?: {
    account: string;
    qr_code_url?: string;
  };
  wechat?: {
    account: string;
    qr_code_url?: string;
  };
  bank_card?: {
    bank_name: string;
    card_number: string;
    holder_name: string;
  };
}

export interface CreateMerchantRequest {
  merchant_name: string;
  wallet_address: string;
  supported_currencies: string[];
  supported_payment_methods: string[];
  min_order_amount?: string;
  max_order_amount?: string;
  daily_limit?: string;
  payment_info?: PaymentInfo;
}

// ============ P2P Order Types ============

export interface P2PEscrowOrder {
  id: string;
  contract_payment_id: number;
  chain_id: number;
  escrow_contract_address: string;
  merchant_id: string;
  buyer_id: string;
  merchant_address: string;
  buyer_address: string;
  token_address: string;
  token_symbol: string;
  token_decimals: number;
  token_amount: string;
  fiat_amount: string;
  fiat_currency: string;
  exchange_rate: string;
  fee_amount: string;
  fee_percent: string;
  payment_method: PaymentMethodType;
  payment_details?: PaymentInfo;
  status: P2POrderStatus;
  lock_duration: number;
  unlock_time: string;
  paid_at?: string;
  payment_proof_urls?: string[];
  confirmed_at?: string;
  released_at?: string;
  release_type?: string;
  create_tx_hash: string;
  create_block_number?: number;
  release_tx_hash?: string;
  release_block_number?: number;
  dispute_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface P2POrderListItem {
  id: string;
  contract_payment_id: number;
  chain_id: number;
  merchant_name?: string;
  merchant_address: string;
  buyer_address: string;
  token_amount: string;
  fiat_amount: string;
  fiat_currency: string;
  exchange_rate: string;
  payment_method: PaymentMethodType;
  status: P2POrderStatus;
  unlock_time: string;
  created_at: string;
}

export interface P2POrderDetail {
  id: string;
  contract_payment_id: number;
  chain_id: number;
  escrow_contract_address: string;
  merchant: MerchantListItem;
  buyer_address: string;
  token_address: string;
  token_symbol: string;
  token_amount: string;
  fiat_amount: string;
  fiat_currency: string;
  exchange_rate: string;
  fee_amount: string;
  fee_percent: string;
  payment_method: PaymentMethodType;
  payment_details?: PaymentInfo;
  status: P2POrderStatus;
  lock_duration: number;
  unlock_time: string;
  paid_at?: string;
  payment_proof_urls?: string[];
  confirmed_at?: string;
  released_at?: string;
  release_type?: string;
  create_tx_hash: string;
  release_tx_hash?: string;
  dispute?: P2PDisputeResponse;
  created_at: string;
  updated_at: string;
}

export interface CreateP2POrderRequest {
  merchant_id: string;
  fiat_amount: string;
  fiat_currency: string;
  payment_method: PaymentMethodType;
  lock_duration?: number; // Default: 3600 (1 hour)
}

export interface ConfirmPaymentRequest {
  payment_proof_urls?: string[];
}

// ============ Dispute Types ============

export interface P2PDispute {
  id: string;
  escrow_order_id: string;
  initiator_id: string;
  initiator_role: string;
  reason: string;
  description: string;
  evidence_urls?: string[];
  status: DisputeStatus;
  resolution_notes?: string;
  resolution_action?: string;
  resolved_at?: string;
  resolved_by?: string;
  arbitration_tx_hash?: string;
  arbitration_refund?: boolean;
  created_at: string;
  updated_at: string;
}

export interface P2PDisputeResponse {
  id: string;
  escrow_order_id: string;
  initiator_id: string;
  initiator_role: string;
  reason: string;
  description: string;
  evidence_urls?: string[];
  status: DisputeStatus;
  resolution_notes?: string;
  resolution_action?: string;
  resolved_at?: string;
  arbitration_tx_hash?: string;
  arbitration_refund?: boolean;
  created_at: string;
}

export interface CreateDisputeRequest {
  reason: string;
  description: string;
  evidence_urls?: string[];
}

export interface ResolveDisputeRequest {
  resolution_action: "release_to_buyer" | "refund_to_merchant" | "no_action";
  resolution_notes: string;
  execute_on_chain: boolean;
}

// ============ Rating Types ============

export interface MerchantRating {
  id: string;
  merchant_id: string;
  escrow_order_id: string;
  rater_id: string;
  rating: string;
  comment?: string;
  created_at: string;
}

export interface CreateRatingRequest {
  rating: string; // 1-5
  comment?: string;
}

// ============ Stats Types ============

export interface MerchantDailyStats {
  id: string;
  merchant_id: string;
  date: string;
  total_volume: string;
  fiat_volume: string;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  disputed_orders: number;
  average_release_time?: number;
  created_at: string;
  updated_at: string;
}

// ============ Query Parameters ============

export interface MerchantQueryParams {
  status?: MerchantStatus;
  currency?: string;
  payment_method?: PaymentMethodType;
  min_amount?: string;
  max_amount?: string;
  sort_by?: "rating" | "completion_rate" | "volume";
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface P2POrderQueryParams {
  status?: P2POrderStatus;
  role?: "buyer" | "merchant";
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export interface DisputeQueryParams {
  status?: DisputeStatus;
  page?: number;
  page_size?: number;
}

// ============ API Response Types ============

export interface MerchantListResponse {
  merchants: MerchantListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface P2POrderListResponse {
  orders: P2POrderListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface DisputeListResponse {
  disputes: P2PDisputeResponse[];
  total: number;
  page: number;
  page_size: number;
}

// ============ On-Chain Types ============

export interface EscrowCreatedEvent {
  payment_id: number;
  merchant: string;
  buyer: string;
  token: string;
  amount: string;
  unlock_time: number;
  tx_hash: string;
  block_number: number;
}

export interface EscrowReleasedEvent {
  payment_id: number;
  release_type: "merchant_release" | "auto_release";
  tx_hash: string;
  block_number: number;
}

export interface ArbitrationEvent {
  payment_id: number;
  refund_to_merchant: boolean;
  tx_hash: string;
  block_number: number;
}
