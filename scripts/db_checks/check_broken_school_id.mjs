import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const schoolId = '1988ab4a-2947-404d-8c2b-64a25fa384ba';
  
  const school = await client.query('SELECT * FROM public.schools WHERE id = $1', [schoolId]);
  console.log('Does school 1988ab4a-2947-404d-8c2b-64a25fa384ba exist?:', school.rows);

  // Check what useAuth queries:
  // SELECT *, schools(*) FROM users WHERE id = '20ab9558-8c4d-4d5c-a8f1-f19d43efdcc9'
  const userWithSchool = await client.query(`
    SELECT u.*, s.name as school_name, s.is_suspended
    FROM public.users u
    LEFT JOIN public.schools s ON u.school_id = s.id
    WHERE u.id = '20ab9558-8c4d-4d5c-a8f1-f19d43efdcc9'
  `);
  console.log('User with school join:', userWithSchool.rows[0]);

  await client.end();
}

main().catch(console.error);
