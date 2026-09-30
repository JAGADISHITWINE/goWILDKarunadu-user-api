-- Migration: Create trek_ratings and trek_engagement tables
CREATE TABLE IF NOT EXISTS `trek_ratings` (
  `id` char(36) NOT NULL,
  `trek_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `booking_id` char(36) DEFAULT NULL,
  `rating` tinyint unsigned NOT NULL,
  `title` varchar(150) DEFAULT NULL,
  `review` text,
  `is_verified` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ratings_trek` (`trek_id`),
  KEY `idx_ratings_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `trek_engagement` (
  `id` char(36) NOT NULL,
  `trek_id` char(36) NOT NULL,
  `views_count` int unsigned NOT NULL DEFAULT '0',
  `likes_count` int unsigned NOT NULL DEFAULT '0',
  `shares_count` int unsigned NOT NULL DEFAULT '0',
  `inquiries_count` int unsigned NOT NULL DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_engagement_trek` (`trek_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
