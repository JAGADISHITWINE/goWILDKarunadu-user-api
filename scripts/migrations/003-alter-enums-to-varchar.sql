-- Migration: Convert rigid ENUM columns on treks and posts to VARCHAR for dynamic Dropdown Manager support
ALTER TABLE treks MODIFY COLUMN category VARCHAR(100) NOT NULL;
ALTER TABLE treks MODIFY COLUMN difficulty VARCHAR(100) NOT NULL;
ALTER TABLE treks MODIFY COLUMN fitness_level VARCHAR(100) NOT NULL;
ALTER TABLE posts MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'draft';
