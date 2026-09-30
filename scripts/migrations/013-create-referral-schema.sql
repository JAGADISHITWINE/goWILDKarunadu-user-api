-- Migration: Create referral schema (settings, referrals, redemptions) and user/booking columns
CREATE TABLE IF NOT EXISTS `referral_settings` (
  `id` char(36) NOT NULL,
  `base_discount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `bonus_discount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `bonus_participant_threshold` int NOT NULL DEFAULT '0',
  `free_slot_threshold` int NOT NULL DEFAULT '0',
  `free_slot_value` int NOT NULL DEFAULT '0',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `updated_by` char(36) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `booking_referrals` (
  `id` char(36) NOT NULL,
  `booking_id` char(36) NOT NULL,
  `referrer_user_id` char(36) NOT NULL,
  `referred_user_id` char(36) NOT NULL,
  `referral_code` varchar(16) NOT NULL,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `participants` int NOT NULL DEFAULT '0',
  `status` enum('pending','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_booking_referrals_booking` (`booking_id`),
  KEY `idx_booking_referrals_referrer` (`referrer_user_id`),
  KEY `idx_booking_referrals_referred` (`referred_user_id`),
  CONSTRAINT `fk_booking_referrals_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_booking_referrals_referred` FOREIGN KEY (`referred_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_booking_referrals_referrer` FOREIGN KEY (`referrer_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `referral_reward_redemptions` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `booking_id` char(36) NOT NULL,
  `slots_used` int NOT NULL DEFAULT '0',
  `value_per_slot` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_referral_reward_booking` (`booking_id`),
  KEY `idx_referral_reward_user` (`user_id`),
  CONSTRAINT `fk_referral_reward_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_referral_reward_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `users` ADD COLUMN `referral_code` VARCHAR(16) NULL;
ALTER TABLE `users` ADD COLUMN `referred_by_user_id` CHAR(36) NULL;
ALTER TABLE `users` ADD COLUMN `referral_success_count` INT NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `referral_total_discount` DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `users` ADD COLUMN `referral_free_slots_available` INT NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `referral_free_slots_redeemed` INT NOT NULL DEFAULT 0;

ALTER TABLE `bookings` ADD COLUMN `referral_code` VARCHAR(16) NULL;
ALTER TABLE `bookings` ADD COLUMN `referral_discount` DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `bookings` ADD COLUMN `referral_reward_discount` DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `bookings` ADD COLUMN `referral_reward_slots_used` INT NOT NULL DEFAULT 0;
