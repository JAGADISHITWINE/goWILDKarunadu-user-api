-- Migration: create payments table
CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL,
  order_id VARCHAR(128) DEFAULT NULL,
  payment_id VARCHAR(128) DEFAULT NULL,
  receipt VARCHAR(128) DEFAULT NULL,
  booking_id CHAR(36) DEFAULT NULL,
  user_id CHAR(36) DEFAULT NULL,
  amount BIGINT DEFAULT 0,
  currency VARCHAR(8) DEFAULT 'INR',
  status VARCHAR(32) DEFAULT 'created',
  meta JSON DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_id (order_id),
  KEY idx_booking_id (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
