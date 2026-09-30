-- Migration: Create carpool_rides table
CREATE TABLE IF NOT EXISTS `carpool_rides` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `user_phone` varchar(20) NOT NULL,
  `trek_id` char(36) DEFAULT NULL,
  `trek_name` varchar(150) NOT NULL,
  `departure_city` varchar(100) NOT NULL DEFAULT 'Bengaluru',
  `departure_location` varchar(200) NOT NULL,
  `departure_datetime` datetime NOT NULL,
  `available_seats` int NOT NULL DEFAULT '3',
  `price_per_seat` decimal(10,2) NOT NULL DEFAULT '0.00',
  `vehicle_model` varchar(100) DEFAULT NULL,
  `notes` text,
  `status` enum('active','full','completed','cancelled') NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_trek` (`trek_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
