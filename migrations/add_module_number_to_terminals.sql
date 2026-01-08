-- Migration: Add module_number to terminals
-- Description: Adds a new column 'module_number' to the terminals table to identify the physical counter number (e.g., '05', 'B-12').

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'terminals'
        AND column_name = 'module_number'
    ) THEN
        ALTER TABLE terminals ADD COLUMN module_number VARCHAR(50);
    END IF;
END $$;
