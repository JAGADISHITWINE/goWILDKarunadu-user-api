-- Migration: Create trek_coupons and coupon_usages tables
CREATE TABLE IF NOT EXISTS `trek_coupons` (
  `id` char(36) NOT NULL,
  `trek_id` char(36) DEFAULT NULL,
  `code` varchar(60) NOT NULL,
  `discount_type` enum('percentage','flat') NOT NULL DEFAULT 'percentage',
  `discount_value` decimal(10,2) NOT NULL,
  `min_booking_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `max_discount_amount` decimal(10,2) DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `usage_limit` int DEFAULT NULL,
  `usage_count` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_trek_coupon_code` (`trek_id`,`code`),
  KEY `idx_trek_coupons_trek_id` (`trek_id`),
  KEY `idx_trek_coupons_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `coupon_usages` (
  `id` char(36) NOT NULL,
  `coupon_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `booking_id` char(36) NOT NULL,
  `used_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coupon_user_once` (`coupon_id`,`user_id`),
  KEY `idx_coupon_usages_user` (`user_id`),
  KEY `idx_coupon_usages_booking` (`booking_id`),
  CONSTRAINT `fk_coupon_usages_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_coupon_usages_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `trek_coupons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_coupon_usages_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
