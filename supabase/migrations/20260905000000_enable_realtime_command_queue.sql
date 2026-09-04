-- Migration: 20260905000000_enable_realtime_command_queue.sql
-- Description: Enable Supabase Realtime publication on command_queue and bell_times for instant server-push notifications

-- 1. Ensure REPLICA IDENTITY is set to FULL for accurate change tracking
ALTER TABLE IF EXISTS public.command_queue REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.bell_times REPLICA IDENTITY FULL;

-- 2. Add tables to supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'command_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.command_queue;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'bell_times'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bell_times;
  END IF;
END $$;

-- 3. Policy to allow anon to receive realtime events for command_queue
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'command_queue' 
    AND policyname = 'Allow anon to view command queue for realtime'
  ) THEN
    CREATE POLICY "Allow anon to view command queue for realtime" 
    ON public.command_queue 
    FOR SELECT 
    TO anon 
    USING (true);
  END IF;
END $$;

-- 4. Policy to allow anon to view bell times for realtime sync updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bell_times' 
    AND policyname = 'Allow anon to view bell times for realtime'
  ) THEN
    CREATE POLICY "Allow anon to view bell times for realtime" 
    ON public.bell_times 
    FOR SELECT 
    TO anon 
    USING (true);
  END IF;
END $$;
