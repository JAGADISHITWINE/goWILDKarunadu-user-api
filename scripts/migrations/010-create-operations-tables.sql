-- Migration: Create operations tables (audit_logs, gear_inventory, batch_expenses, basecamp_checkins)
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` char(36) NOT NULL,
  `action_type` varchar(80) NOT NULL,
  `entity_type` varchar(80) NOT NULL,
  `entity_id` varchar(120) DEFAULT NULL,
  `summary` varchar(255) NOT NULL,
  `before_data` longtext,
  `after_data` longtext,
  `metadata` longtext,
  `created_by` char(36) DEFAULT NULL,
  `created_by_email` varchar(191) DEFAULT NULL,
  `created_by_role` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_created_at` (`created_at`),
  KEY `idx_audit_entity` (`entity_type`,`entity_id`),
  KEY `idx_audit_action` (`action_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `gear_inventory` (
  `id` char(36) NOT NULL,
  `item_name` varchar(150) NOT NULL,
  `category` varchar(100) NOT NULL,
  `total_quantity` int NOT NULL DEFAULT '10',
  `rented_quantity` int NOT NULL DEFAULT '0',
  `rental_rate_per_day` decimal(10,2) NOT NULL DEFAULT '100.00',
  `item_condition` varchar(100) NOT NULL DEFAULT 'Good Condition',
  `location` varchar(100) NOT NULL DEFAULT 'Main Basecamp Gear Store',
  `status` enum('active','maintenance','retired') NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `batch_expenses` (
  `id` char(36) NOT NULL,
  `batch_id` varchar(100) NOT NULL,
  `expense_category` varchar(150) NOT NULL,
  `description` varchar(255) NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `paid_to` varchar(150) DEFAULT NULL,
  `payment_mode` varchar(100) NOT NULL DEFAULT 'UPI',
  `receipt_ref` varchar(100) DEFAULT NULL,
  `recorded_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_expense_batch` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `basecamp_checkins` (
  `id` char(36) NOT NULL,
  `booking_id` varchar(100) NOT NULL,
  `batch_id` varchar(100) DEFAULT NULL,
  `pass_reference` varchar(100) NOT NULL,
  `lead_customer_name` varchar(150) NOT NULL,
  `participants_count` int NOT NULL DEFAULT '1',
  `checked_in_count` int NOT NULL DEFAULT '1',
  `verified_by` varchar(100) NOT NULL DEFAULT 'Basecamp Coordinator',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_checkin_booking` (`booking_id`),
  KEY `idx_checkin_batch` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
