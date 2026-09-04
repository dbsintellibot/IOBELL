-- Add 'partner' to users role check
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'admin', 'operator', 'partner'));

-- 1. Partner Tiers Table
CREATE TABLE public.partner_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    min_sales_volume NUMERIC NOT NULL DEFAULT 0,
    commission_rate NUMERIC NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Partner Tiers
INSERT INTO public.partner_tiers (name, min_sales_volume, commission_rate) VALUES
('Bronze', 0, 10),
('Silver', 5000, 15),
('Gold', 20000, 20)
ON CONFLICT (name) DO NOTHING;

-- 2. Partners Table
CREATE TABLE public.partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    company_name TEXT NOT NULL,
    region TEXT NOT NULL,
    tier_id UUID REFERENCES public.partner_tiers(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
    payout_information JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Leads Table (with Deal Locking)
CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    school_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL CHECK (status IN ('new', 'contacted', 'qualified', 'lost', 'converted_to_deal')) DEFAULT 'new',
    locked_until TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + interval '90 days') NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Prevent two partners from locking the same active school name (leads status not lost/won)
CREATE UNIQUE INDEX UNIQUE_ACTIVE_SCHOOL_NAME ON public.leads (school_name) 
WHERE status NOT IN ('lost', 'converted_to_deal');

-- 4. Deals Table
CREATE TABLE public.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE UNIQUE,
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
    status TEXT NOT NULL CHECK (status IN ('negotiation', 'won', 'lost')) DEFAULT 'negotiation',
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Deal Followups Table
CREATE TABLE public.deal_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    notes TEXT NOT NULL,
    follow_up_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_followup_target CHECK (
        (deal_id IS NOT NULL AND lead_id IS NULL) OR 
        (deal_id IS NULL AND lead_id IS NOT NULL)
    )
);

-- 6. Payments Table
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
    payment_method TEXT NOT NULL,
    confirmation_ref TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Commissions Table
CREATE TABLE public.commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid')) DEFAULT 'pending',
    payout_date TIMESTAMP WITH TIME ZONE,
    payout_ref TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.partner_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Helper to check if user is partner and get their partner ID
CREATE OR REPLACE FUNCTION public.get_my_partner_id()
RETURNS UUID AS $$
    SELECT id FROM public.partners WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Policies for Partner Tiers
CREATE POLICY "Anyone can read partner tiers" 
ON public.partner_tiers FOR SELECT USING (true);

CREATE POLICY "Super admins can manage partner tiers" 
ON public.partner_tiers FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);

-- Policies for Partners
CREATE POLICY "Partners can read/update their own profile" 
ON public.partners FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Partners can update their payout info" 
ON public.partners FOR UPDATE USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can manage partners" 
ON public.partners FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);

-- Policies for Leads
CREATE POLICY "Partners can view and modify their own leads" 
ON public.leads FOR ALL USING (partner_id = public.get_my_partner_id());

CREATE POLICY "Super admins can manage all leads" 
ON public.leads FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);

-- Policies for Deals
CREATE POLICY "Partners can view and modify their own deals" 
ON public.deals FOR ALL USING (partner_id = public.get_my_partner_id());

CREATE POLICY "Super admins can manage all deals" 
ON public.deals FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);

-- Policies for Deal Followups
CREATE POLICY "Partners can manage their own followups" 
ON public.deal_followups FOR ALL USING (
    EXISTS (SELECT 1 FROM public.leads WHERE id = lead_id AND partner_id = public.get_my_partner_id()) OR
    EXISTS (SELECT 1 FROM public.deals WHERE id = deal_id AND partner_id = public.get_my_partner_id())
);

CREATE POLICY "Super admins can manage all followups" 
ON public.deal_followups FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);

-- Policies for Payments
CREATE POLICY "Partners can view payments on their deals" 
ON public.payments FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.deals WHERE id = deal_id AND partner_id = public.get_my_partner_id())
);

CREATE POLICY "Partners can insert payments for confirmation"
ON public.payments FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.deals WHERE id = deal_id AND partner_id = public.get_my_partner_id())
);

CREATE POLICY "Super admins can manage all payments" 
ON public.payments FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);

-- Policies for Commissions
CREATE POLICY "Partners can view their own commissions" 
ON public.commissions FOR SELECT USING (partner_id = public.get_my_partner_id());

CREATE POLICY "Super admins can manage all commissions" 
ON public.commissions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);

-- Trigger to calculate commission automatically when deal is won or updated
CREATE OR REPLACE FUNCTION public.calculate_deal_commission()
RETURNS TRIGGER AS $$
DECLARE
    v_tier_rate NUMERIC;
    v_partner_id UUID;
    v_amount NUMERIC;
BEGIN
    IF NEW.status = 'won' AND (OLD.status IS NULL OR OLD.status != 'won') THEN
        -- Get the partner's tier commission rate
        SELECT pt.commission_rate, p.id INTO v_tier_rate, v_partner_id
        FROM public.partners p
        JOIN public.partner_tiers pt ON p.tier_id = pt.id
        WHERE p.id = NEW.partner_id;

        IF v_tier_rate IS NOT NULL THEN
            v_amount := (NEW.amount * v_tier_rate) / 100;
            
            INSERT INTO public.commissions (partner_id, deal_id, amount, status)
            VALUES (NEW.partner_id, NEW.id, v_amount, 'pending')
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_deal_won
    AFTER UPDATE OF status ON public.deals
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_deal_commission();
