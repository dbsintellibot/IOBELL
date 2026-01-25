const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function applyMigration() {
  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Add is_active column
    console.log('Adding is_active column...');
    await client.query(`
      ALTER TABLE public.bell_profiles 
      ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false;
    `);

    // 2. Create function
    console.log('Creating ensure_single_active_profile function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION public.ensure_single_active_profile()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.is_active = true THEN
          UPDATE public.bell_profiles
          SET is_active = false
          WHERE school_id = NEW.school_id 
          AND id != NEW.id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);

    // 3. Create Trigger
    console.log('Creating trigger...');
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_single_active_profile ON public.bell_profiles;
      
      CREATE TRIGGER trigger_single_active_profile
      BEFORE INSERT OR UPDATE OF is_active ON public.bell_profiles
      FOR EACH ROW
      WHEN (NEW.is_active = true)
      EXECUTE FUNCTION public.ensure_single_active_profile();
    `);

    // 4. Create RPC
    console.log('Creating get_active_schedule RPC...');
    await client.query(`
      CREATE OR REPLACE FUNCTION public.get_active_schedule(p_school_id uuid)
      RETURNS TABLE (
          bell_time time,
          day_of_week integer[],
          audio_url text,
          duration integer
      ) AS $$
      BEGIN
          RETURN QUERY
          SELECT 
              bt.bell_time,
              bt.day_of_week,
              af.storage_path as audio_url,
              af.duration
          FROM public.bell_times bt
          JOIN public.bell_profiles bp ON bt.profile_id = bp.id
          LEFT JOIN public.audio_files af ON bt.audio_file_id = af.id
          WHERE bp.school_id = p_school_id
          AND bp.is_active = true;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);

    console.log('Migration applied successfully.');

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

applyMigration();
