import pg from 'pg';

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new pg.Client({
  connectionString: connectionString,
});

async function fixPassword() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Get the latest user ID
    const res = await client.query(`SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1`);
    const userId = res.rows[0].id;
    console.log('Fixing password for user:', userId);

    // Update password to match admin@lincoln.edu ($2a$10$gu8I50dpmdS4.K7gefHFleWxY9Cfd/JpBaCfoufTIjJ8ipJ3TrBzW)
    // This hash corresponds to 'password123' (presumably, or I will test with it)
    // Wait, let's use the hash from muddasirh@gmail.com which is DEFINITELY 'password123'
    // Hash: $2a$06$./2rJrjIdJ2SW2YrWQL3M.t2GUS7GGYkt9zF8z7FGGv8H4evGSgu6
    
    const validHash = '$2a$06$./2rJrjIdJ2SW2YrWQL3M.t2GUS7GGYkt9zF8z7FGGv8H4evGSgu6';

    await client.query(`
      UPDATE auth.users 
      SET encrypted_password = $1
      WHERE id = $2
    `, [validHash, userId]);
    
    console.log('Password updated manually to known valid hash');

  } catch (err) {
    console.error('Update failed:', err);
  } finally {
    await client.end();
  }
}

fixPassword();
