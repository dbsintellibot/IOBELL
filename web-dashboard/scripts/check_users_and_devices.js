import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    const emails = [
      'digitapisms@gmail.com',
      'digitapbs@gmail.com',
      'dbsintellibot@gmail.com',
      'muddasirh@gmail.com'
    ];

    const res = await client.query(
      `
      SELECT id, email, role, school_id, ota_enabled, tts_enabled
      FROM public.users
      WHERE email = ANY($1::text[])
      ORDER BY email
      `,
      [emails]
    );

    console.log('Users before role correction:');
    console.table(res.rows);

    const schoolAdminEmails = [
      'digitapisms@gmail.com',
      'digitapbs@gmail.com',
      'dbsintellibot@gmail.com'
    ];

    for (const email of schoolAdminEmails) {
      console.log(`\nEnsuring ${email} is admin (not super_admin)...`);
      await client.query(
        `
        UPDATE public.users
        SET role = 'admin'
        WHERE email = $1 AND role = 'super_admin'
        `,
        [email]
      );
    }

    const verifyRes = await client.query(
      `
      SELECT email, role, school_id
      FROM public.users
      WHERE email = ANY($1::text[])
      ORDER BY email
      `,
      [emails]
    );

    console.log('\nVerified roles after correction:');
    console.table(verifyRes.rows);
  } catch (err) {
    console.error('Error checking users and devices:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
