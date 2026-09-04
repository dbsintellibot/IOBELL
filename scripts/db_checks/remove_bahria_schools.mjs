import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const schoolIds = [
    'e00cc773-65c7-4537-9775-1d944d0617d1', // BAHRIA DEFENCE CAMPUS
    'ac618114-fc5a-4db2-bcd3-83f53b8947b0'  // BAHRIA Gulshan Campus
  ];
  const userEmails = ['hamzamuddasir12@gmail.com', 'dbstrovear@gmail.com'];

  console.log('Beginning deletion of the 2 Bahria schools and associated temporary users...');

  try {
    await client.query('BEGIN');

    // 1. Delete associated users in public.users
    const pubUsersRes = await client.query(`
      DELETE FROM public.users
      WHERE school_id = ANY($1) OR LOWER(email) = ANY($2)
      RETURNING id, email, role;
    `, [schoolIds, userEmails.map(e => e.toLowerCase())]);
    console.log('Deleted public.users rows:', pubUsersRes.rows);

    // 2. Delete associated users in auth.users
    const authUsersRes = await client.query(`
      DELETE FROM auth.users
      WHERE LOWER(email) = ANY($1)
      RETURNING id, email;
    `, [userEmails.map(e => e.toLowerCase())]);
    console.log('Deleted auth.users rows:', authUsersRes.rows);

    // 3. Delete from public.schools
    const schoolsRes = await client.query(`
      DELETE FROM public.schools
      WHERE id = ANY($1)
      RETURNING id, name, address;
    `, [schoolIds]);
    console.log('Deleted public.schools rows:', schoolsRes.rows);

    await client.query('COMMIT');
    console.log('\nSuccessfully removed 2 Bahria schools!');

    // Verification check
    const remainingSchools = await client.query('SELECT id, name, address FROM public.schools ORDER BY created_at DESC');
    console.log('\n--- REMAINING SCHOOLS IN SYSTEM ---');
    console.dir(remainingSchools.rows, { depth: null });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to delete Bahria schools:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
