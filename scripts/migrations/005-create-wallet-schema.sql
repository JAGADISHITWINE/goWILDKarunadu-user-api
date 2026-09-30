-- Migration: Create wallet and wallet_transactions tables
CREATE TABLE IF NOT EXISTS `user_wallets` (
  `user_id` char(36) NOT NULL,
  `balance` decimal(10,2) NOT NULL DEFAULT '0.00',
  `bonus_balance` decimal(10,2) NOT NULL DEFAULT '0.00',
  `currency` varchar(10) NOT NULL DEFAULT 'INR',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `wallet_transactions` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `bonus_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `transaction_type` enum('credit','debit') NOT NULL,
  `reason` varchar(255) NOT NULL,
  `reference_id` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
