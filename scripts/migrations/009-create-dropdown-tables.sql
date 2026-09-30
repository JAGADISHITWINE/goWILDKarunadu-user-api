-- Migration: Create dropdown_groups and dropdown_options tables
CREATE TABLE IF NOT EXISTS `dropdown_groups` (
  `id` char(36) NOT NULL,
  `group_key` varchar(64) NOT NULL,
  `group_name` varchar(128) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dropdown_group_key` (`group_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dropdown_options` (
  `id` char(36) NOT NULL,
  `group_id` char(36) NOT NULL,
  `option_label` varchar(128) NOT NULL,
  `option_value` varchar(128) NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `meta` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_value` (`group_id`,`option_value`),
  KEY `idx_group_active_sort` (`group_id`,`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
