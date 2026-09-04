-- 1. Exclusivity check and releasing expired locks on public.leads
CREATE OR REPLACE FUNCTION public.check_lead_lock_exclusivity()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_lead public.leads%ROWTYPE;
BEGIN
    -- Look for any existing active lead with the same school name
    SELECT * INTO v_existing_lead
    FROM public.leads
    WHERE LOWER(TRIM(school_name)) = LOWER(TRIM(NEW.school_name))
      AND status NOT IN ('lost', 'converted_to_deal')
    LIMIT 1;

    IF v_existing_lead.id IS NOT NULL THEN
        IF v_existing_lead.locked_until >= now() THEN
            -- Exclusivity lock is active, raise exception
            RAISE EXCEPTION 'This school is locked by another partner until %', v_existing_lead.locked_until;
        ELSE
            -- Lock has expired, update the old lead's status to 'lost'
            UPDATE public.leads
            SET status = 'lost', updated_at = now()
            WHERE id = v_existing_lead.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS check_leads_lock_exclusivity ON public.leads;
CREATE TRIGGER check_leads_lock_exclusivity
    BEFORE INSERT ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.check_lead_lock_exclusivity();


-- 2. Atomic Lead-to-Deal Conversion RPC
CREATE OR REPLACE FUNCTION public.convert_lead_to_deal(p_lead_id UUID, p_amount NUMERIC)
RETURNS JSONB
SECURITY DEFINER
AS $$
DECLARE
    v_partner_id UUID;
    v_lead_partner_id UUID;
    v_lead_status TEXT;
    v_deal_id UUID;
    v_is_super_admin BOOLEAN;
BEGIN
    -- Check if user is super admin
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'super_admin'
    ) INTO v_is_super_admin;

    -- Get the lead's owner and status
    SELECT partner_id, status INTO v_lead_partner_id, v_lead_status
    FROM public.leads
    WHERE id = p_lead_id;

    IF v_lead_partner_id IS NULL THEN
        RAISE EXCEPTION 'Lead not found';
    END IF;

    -- Get caller's partner ID
    v_partner_id := public.get_my_partner_id();

    -- Authorization check: caller must be the lead's partner or a super admin
    IF NOT (v_is_super_admin OR (v_partner_id = v_lead_partner_id)) THEN
        RAISE EXCEPTION 'Access Denied: You do not own this lead';
    END IF;

    -- State validation: can only convert leads that are active
    IF v_lead_status IN ('lost', 'converted_to_deal') THEN
        RAISE EXCEPTION 'Cannot convert lead: current status is %', v_lead_status;
    END IF;

    -- Insert Deal
    INSERT INTO public.deals (lead_id, partner_id, amount, status)
    VALUES (p_lead_id, v_lead_partner_id, p_amount, 'negotiation')
    RETURNING id INTO v_deal_id;

    -- Update Lead Status
    UPDATE public.leads
    SET status = 'converted_to_deal', updated_at = now()
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
        'deal_id', v_deal_id,
        'lead_id', p_lead_id,
        'status', 'success'
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.convert_lead_to_deal(UUID, NUMERIC) TO authenticated;


-- 3. Safety trigger to prevent lead deletion if an associated deal exists
CREATE OR REPLACE FUNCTION public.check_lead_deletion_safety()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.deals WHERE lead_id = OLD.id) THEN
        RAISE EXCEPTION 'Cannot delete lead: Active deals or financial records are associated with it.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS check_lead_deletion_safety_trigger ON public.leads;
CREATE TRIGGER check_lead_deletion_safety_trigger
    BEFORE DELETE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.check_lead_deletion_safety();


-- 4. Automated Tier Progression Trigger
CREATE OR REPLACE FUNCTION public.evaluate_partner_tier_promotion()
RETURNS TRIGGER AS $$
DECLARE
    v_total_sales NUMERIC;
    v_new_tier_id UUID;
    v_current_tier_min NUMERIC;
    v_new_tier_min NUMERIC;
BEGIN
    -- Only evaluate on status changing to 'won'
    IF NEW.status = 'won' AND (OLD.status IS NULL OR OLD.status != 'won') THEN
        -- Calculate total sales of won deals for the partner
        SELECT COALESCE(SUM(amount), 0) INTO v_total_sales
        FROM public.deals
        WHERE partner_id = NEW.partner_id AND status = 'won';

        -- Find the highest tier they qualify for based on sales volume
        SELECT id, min_sales_volume INTO v_new_tier_id, v_new_tier_min
        FROM public.partner_tiers
        WHERE min_sales_volume <= v_total_sales
        ORDER BY min_sales_volume DESC
        LIMIT 1;

        -- Get current tier's min sales volume (if they have one)
        SELECT pt.min_sales_volume INTO v_current_tier_min
        FROM public.partners p
        LEFT JOIN public.partner_tiers pt ON p.tier_id = pt.id
        WHERE p.id = NEW.partner_id;

        -- Update their tier only if it is a promotion (new tier has higher min_sales_volume)
        -- OR if they currently have no tier
        IF v_new_tier_id IS NOT NULL AND (v_current_tier_min IS NULL OR v_new_tier_min > v_current_tier_min) THEN
            UPDATE public.partners
            SET tier_id = v_new_tier_id, updated_at = now()
            WHERE id = NEW.partner_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS evaluate_partner_tier_promotion_trigger ON public.deals;
CREATE TRIGGER evaluate_partner_tier_promotion_trigger
    AFTER UPDATE OF status ON public.deals
    FOR EACH ROW
    EXECUTE FUNCTION public.evaluate_partner_tier_promotion();
