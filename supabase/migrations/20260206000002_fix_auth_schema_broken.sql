-- Fix auth.sessions id default value (Critical for login)
ALTER TABLE auth.sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Fix auth.refresh_tokens user_id data type mismatch (varchar -> uuid)
-- We need to handle potential casting errors if bad data exists, but assuming valid UUID strings
ALTER TABLE auth.refresh_tokens ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- Verify/Add FK for refresh_tokens -> users if missing (Optional but good practice)
-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_user_id_fkey') THEN
--         ALTER TABLE auth.refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--     END IF;
-- END $$;
