-- Migration: Add library reorganization tracking columns
-- Adds last_reorganized_at and reorganized_by columns to plex_library table

ALTER TABLE plex_library 
ADD COLUMN last_reorganized_at TIMESTAMP,
ADD COLUMN reorganized_by UUID;
