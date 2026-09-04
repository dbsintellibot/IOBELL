import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const email = 'dbstrovear@gmail.com';
  console.log(`Diagnosing auth issue for: ${email}`);

  // 1. Check auth.users
  const authUser = await client.query('SELECT id, email, role, instance_id, aud, confirmed_at, encrypted_password FROM auth.users WHERE LOWER(email) = LOWER($1)', [email]);
  console.log('auth.users record:', authUser.rows);

  // 2. Check public.users
  const pubUser = await client.query('SELECT id, email, role, school_id FROM public.users WHERE LOWER(email) = LOWER($1)', [email]);
  console.log('public.users record:', pubUser.rows);

  // 3. List all triggers on auth.users
  const triggers = await client.query(`
    SELECT t.tgname, p.proname, pg_get_functiondef(p.oid) as func_def
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE n.nspname = 'auth' AND c.relname = 'users';
  `);
  console.log('\n--- TRIGGERS ON auth.users ---');
  for (const trg of triggers.rows) {
    console.log(`Trigger Name: ${trg.tgname}, Function Name: ${trg.proname}`);
    console.log(`Function Definition:\n${trg.func_def}\n----------------------------------`);
  }

  // 4. List all triggers on public.users
  const pubTriggers = await client.query(`
    SELECT t.tgname, p.proname, pg_get_functiondef(p.oid) as func_def
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE n.nspname = 'public' AND c.relname = 'users';
  `);
  console.log('\n--- TRIGGERS ON public.users ---');
  for (const trg of pubTriggers.rows) {
    console.log(`Trigger Name: ${trg.tgname}, Function Name: ${trg.proname}`);
    console.log(`Function Definition:\n${trg.func_def}\n----------------------------------`);
  }

  await client.end();
}

main().catch(console.error);
