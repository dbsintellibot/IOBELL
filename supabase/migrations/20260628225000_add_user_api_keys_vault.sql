-- Enable the Supabase Vault extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

-- Create user_api_keys table using vault
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL, -- e.g., 'openai', 'elevenlabs', 'cambai', 'topmediai'
  secret_id uuid REFERENCES vault.secrets(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can manage their own API keys
CREATE POLICY "Users can view their own api keys" ON public.user_api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own api keys" ON public.user_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own api keys" ON public.user_api_keys
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own api keys" ON public.user_api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Create a helper function to set an API key securely via RPC
-- This ensures the secret is stored in vault and linked to user_api_keys
CREATE OR REPLACE FUNCTION set_user_api_key(p_provider text, p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_existing_secret_id uuid;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- See if we already have an entry
  SELECT secret_id INTO v_existing_secret_id FROM public.user_api_keys WHERE user_id = auth.uid() AND provider = p_provider;

  IF v_existing_secret_id IS NOT NULL THEN
    -- Delete old secret from vault
    DELETE FROM vault.secrets WHERE id = v_existing_secret_id;
  END IF;

  -- Insert new secret into vault
  -- We use vault.create_secret
  SELECT vault.create_secret(
    p_secret,
    p_provider || ' key for ' || auth.uid()::text,
    p_provider || ' key for ' || auth.uid()::text
  ) INTO v_secret_id;

  -- Upsert into user_api_keys
  INSERT INTO public.user_api_keys (user_id, provider, secret_id)
  VALUES (auth.uid(), p_provider, v_secret_id)
  ON CONFLICT (user_id, provider) DO UPDATE SET secret_id = EXCLUDED.secret_id, updated_at = now();
END;
$$;

-- Helper function to get decrypted secret for Edge Functions
CREATE OR REPLACE FUNCTION get_user_api_key(p_provider text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT vds.decrypted_secret INTO v_secret
  FROM public.user_api_keys uak
  JOIN vault.decrypted_secrets vds ON uak.secret_id = vds.id
  WHERE uak.user_id = auth.uid() AND uak.provider = p_provider;

  RETURN v_secret;
END;
$$;
