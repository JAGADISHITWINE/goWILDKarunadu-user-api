-- Migration: create webhook_events table for idempotency
CREATE TABLE IF NOT EXISTS webhook_events (
  id CHAR(36) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  payload_hash VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_id (event_id),
  UNIQUE KEY uq_payload_hash (payload_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
