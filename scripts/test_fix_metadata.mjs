import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new pg.Client({
  connectionString: connectionString,
});

async function fixMetadata() {
  try {
    await client.connect();
    
    // Get the latest user ID
    const res = await client.query(`SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 1`);
    const user = res.rows[0];
    console.log('Fixing metadata for user:', user.email);

    const metadata = {
      sub: user.id,
      email: user.email,
      full_name: "Fixed User",
      email_verified: true,
      phone_verified: false
    };

    await client.query(`
      UPDATE auth.users 
      SET raw_user_meta_data = $1
      WHERE id = $2
    `, [JSON.stringify(metadata), user.id]);
    
    console.log('Metadata updated');

  } catch (err) {
    console.error('Update failed:', err);
  } finally {
    await client.end();
  }
}

fixMetadata();
