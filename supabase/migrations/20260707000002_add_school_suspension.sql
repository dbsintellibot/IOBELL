-- Migration: 20260707000002_add_school_suspension.sql
-- Description: Add is_suspended column to schools table

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS is_suspended boolean DEFAULT false;
