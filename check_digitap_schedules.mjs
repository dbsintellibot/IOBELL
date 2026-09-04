import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const schoolId = 'deeb76f3-7d81-41a7-bac7-3ae94732b84b';
  
  console.log(`=== Auditing Schedules for School: ${schoolId} ===`);
  
  // 1. Get profiles
  const profilesRes = await client.query('SELECT * FROM public.bell_profiles WHERE school_id = $1', [schoolId]);
  console.log('Profiles Count:', profilesRes.rows.length);
  console.log('Profiles:', JSON.stringify(profilesRes.rows, null, 2));

  // 2. Get bell times for each profile
  for (const profile of profilesRes.rows) {
    const timesRes = await client.query('SELECT * FROM public.bell_times WHERE profile_id = $1 ORDER BY bell_time ASC', [profile.id]);
    console.log(`\n--- Profile: ${profile.name} (${profile.id}) ---`);
    console.log(`Bell Times Count: ${timesRes.rows.length}`);
    console.log('Bell Times:', JSON.stringify(timesRes.rows, null, 2));
  }

  await client.end();
}

main().catch(console.error);
