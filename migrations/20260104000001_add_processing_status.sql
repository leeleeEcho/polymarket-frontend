-- Add 'processing' status to withdrawal_status enum for on-chain withdrawal processing
ALTER TYPE withdrawal_status ADD VALUE IF NOT EXISTS 'processing' BEFORE 'completed';
