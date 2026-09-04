-- Migration: 20260726000001_enterprise_hardening.sql
-- Description: Enterprise Hardening - Audit Logging and Internal Ticketing System

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Super admins can view all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "School admins can view school audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Policies for audit_logs
CREATE POLICY "Super admins can view all audit logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "School admins can view school audit logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (
        school_id IN (
            SELECT school_id FROM public.users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Helper RPC for inserting audit log cleanly
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_action TEXT,
    p_resource_type TEXT,
    p_resource_id TEXT DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_log_id UUID;
BEGIN
    SELECT school_id INTO v_school_id FROM public.users WHERE id = auth.uid();
    
    INSERT INTO public.audit_logs (user_id, school_id, action, resource_type, resource_id, details)
    VALUES (auth.uid(), v_school_id, p_action, p_resource_type, p_resource_id, p_details)
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- 2. Create tickets table
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number SERIAL UNIQUE,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'bug' CHECK (type IN ('bug', 'feature_request', 'support')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'wont_fix')),
    error_stack TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- Enable RLS on tickets
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Policies for tickets
DROP POLICY IF EXISTS "Super admins full control on tickets" ON public.tickets;
DROP POLICY IF EXISTS "Users view their school tickets" ON public.tickets;
DROP POLICY IF EXISTS "Users create tickets for their school" ON public.tickets;
DROP POLICY IF EXISTS "Users update their school tickets" ON public.tickets;

CREATE POLICY "Super admins full control on tickets" ON public.tickets
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users view their school tickets" ON public.tickets
    FOR SELECT TO authenticated
    USING (
        school_id IN (
            SELECT school_id FROM public.users WHERE id = auth.uid()
        ) OR reporter_id = auth.uid()
    );

CREATE POLICY "Users create tickets for their school" ON public.tickets
    FOR INSERT TO authenticated
    WITH CHECK (
        school_id IN (
            SELECT school_id FROM public.users WHERE id = auth.uid()
        ) OR reporter_id = auth.uid()
    );

CREATE POLICY "Users update their school tickets" ON public.tickets
    FOR UPDATE TO authenticated
    USING (
        school_id IN (
            SELECT school_id FROM public.users WHERE id = auth.uid()
        ) OR reporter_id = auth.uid()
    );

-- 3. Create ticket_comments table
CREATE TABLE IF NOT EXISTS public.ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on ticket_comments
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins view all comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "Users view non-internal comments for their tickets" ON public.ticket_comments;
DROP POLICY IF EXISTS "Users insert comments for their tickets" ON public.ticket_comments;

CREATE POLICY "Super admins view all comments" ON public.ticket_comments
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Users view non-internal comments for their tickets" ON public.ticket_comments
    FOR SELECT TO authenticated
    USING (
        is_internal = false AND
        ticket_id IN (
            SELECT id FROM public.tickets WHERE school_id IN (
                SELECT school_id FROM public.users WHERE id = auth.uid()
            ) OR reporter_id = auth.uid()
        )
    );

CREATE POLICY "Users insert comments for their tickets" ON public.ticket_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        ticket_id IN (
            SELECT id FROM public.tickets WHERE school_id IN (
                SELECT school_id FROM public.users WHERE id = auth.uid()
            ) OR reporter_id = auth.uid()
        )
    );

-- Index creation for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON public.audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_school_id ON public.tickets(school_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id);
