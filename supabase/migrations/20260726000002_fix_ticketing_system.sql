-- Migration: 20260726000002_fix_ticketing_system.sql
-- Description: Fix RLS policies and foreign keys for tickets and ticket_comments to ensure comments work for both Super Admins and School Admins.

-- 1. Ensure foreign key constraint between ticket_comments and public.users
ALTER TABLE public.ticket_comments
    DROP CONSTRAINT IF EXISTS ticket_comments_user_id_fkey;

ALTER TABLE public.ticket_comments
    ADD CONSTRAINT ticket_comments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Drop all existing RLS policies on tickets and ticket_comments
DROP POLICY IF EXISTS "Super admins full control on tickets" ON public.tickets;
DROP POLICY IF EXISTS "Users view their school tickets" ON public.tickets;
DROP POLICY IF EXISTS "Users create tickets for their school" ON public.tickets;
DROP POLICY IF EXISTS "Users update their school tickets" ON public.tickets;

DROP POLICY IF EXISTS "Super admins view all comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "Users view non-internal comments for their tickets" ON public.ticket_comments;
DROP POLICY IF EXISTS "Users insert comments for their tickets" ON public.ticket_comments;

-- 3. Re-enable RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- 4. Unified, Bulletproof RLS Policy for tickets
CREATE POLICY "Tickets full access policy" ON public.tickets
    FOR ALL TO authenticated
    USING (
        -- Super admins have unrestricted access
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
        OR
        -- Users can access tickets belonging to their school or reported by them
        school_id IN (
            SELECT school_id FROM public.users WHERE id = auth.uid()
        )
        OR reporter_id = auth.uid()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
        OR
        school_id IN (
            SELECT school_id FROM public.users WHERE id = auth.uid()
        )
        OR reporter_id = auth.uid()
        OR school_id IS NULL
    );

-- 5. Unified, Bulletproof RLS Policy for ticket_comments
CREATE POLICY "Ticket comments full access policy" ON public.ticket_comments
    FOR ALL TO authenticated
    USING (
        -- Super admins have unrestricted access
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
        OR
        -- Users can view/manage comments for tickets belonging to their school or reported by them
        ticket_id IN (
            SELECT id FROM public.tickets WHERE
                school_id IN (
                    SELECT school_id FROM public.users WHERE id = auth.uid()
                )
                OR reporter_id = auth.uid()
        )
    )
    WITH CHECK (
        -- Super admins can insert/update any comment
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
        OR
        -- Authenticated users can insert/update comments on valid accessible tickets
        ticket_id IN (
            SELECT id FROM public.tickets WHERE
                school_id IN (
                    SELECT school_id FROM public.users WHERE id = auth.uid()
                )
                OR reporter_id = auth.uid()
        )
    );

-- 6. Grant permissions to authenticated and service_role
GRANT ALL ON public.tickets TO authenticated, service_role;
GRANT ALL ON public.ticket_comments TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
