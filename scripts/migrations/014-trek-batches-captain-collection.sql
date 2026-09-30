-- Migration: Add captain and collection columns to trek_batches
ALTER TABLE `trek_batches` ADD COLUMN `captain_name` VARCHAR(100) DEFAULT NULL;
ALTER TABLE `trek_batches` ADD COLUMN `captain_phone` VARCHAR(20) DEFAULT NULL;
ALTER TABLE `trek_batches` ADD COLUMN `is_collection` TINYINT(1) DEFAULT 0;
