const pg = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../web-dashboard/.env.local') });

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Find school matching 'hbs'
    const schoolRes = await client.query(`
      SELECT id, name, school_code FROM public.schools 
      WHERE name ILIKE '%hbs%' OR name ILIKE '%harvard%' OR name ILIKE '%business%';
    `);

    if (schoolRes.rows.length === 0) {
      console.log('No school found matching "hbs"');
    } else {
      console.table(schoolRes.rows);
      
      const schoolIds = schoolRes.rows.map(r => r.id);
      
      // Find users for these schools
      // Note: We need to join with auth.users to get emails, but we can't query auth.users directly easily from here if permissions are tight.
      // However, we are using the postgres connection string, which usually has full access (postgres user).
      
      // Let's try to query public.users and see if we can get email from auth.users via join or if public.users has email (it doesn't usually, but let's check schema).
      // Wait, public.users usually stores profile info. The schema I saw earlier:
      // CREATE TABLE IF NOT EXISTS public.users (
      //     id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
      //     full_name text, ...
      
      // It doesn't have email. I need to join with auth.users.
      
      const usersRes = await client.query(`
        SELECT u.id, u.full_name, u.role, u.school_id, au.email 
        FROM public.users u
        JOIN auth.users au ON u.id = au.id
        WHERE u.school_id = ANY($1::uuid[])
      `, [schoolIds]);
      
      console.log('Users for HBS schools:');
      console.table(usersRes.rows);
    }

  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await client.end();
  }
}

run();
