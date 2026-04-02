-- Fix: DB column "active" → "is_active" to match application code
ALTER TABLE chino_routine RENAME COLUMN active TO is_active;
