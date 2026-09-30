-- Migration: Create notification tables (notifications, admin_notification_state, admin_notification_reads)
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `type` varchar(50) DEFAULT 'weather',
  `trek_id` varchar(64) DEFAULT NULL,
  `trek_name` varchar(255) DEFAULT NULL,
  `severity` varchar(50) DEFAULT 'Advisory (Yellow)',
  `channel` varchar(50) DEFAULT 'WhatsApp + SMS Broadcast',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `admin_notification_state` (
  `admin_id` char(36) NOT NULL,
  `last_read_all_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `admin_notification_reads` (
  `id` char(36) NOT NULL,
  `admin_id` char(36) NOT NULL,
  `notification_id` varchar(120) NOT NULL,
  `read_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_notification_read` (`admin_id`,`notification_id`),
  KEY `idx_admin_notification_read_admin` (`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
