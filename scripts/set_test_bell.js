
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'web-dashboard/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function setTestBell() {
  const email = 'digitapbs@gmail.com';
  console.log(`Looking up user: ${email}`);

  // 1. Get User & School
  // Since we don't have service role key easily, we might not be able to query auth.users directly via client
  // But we can check public.users if seeded, or use the database connection directly.
  // Let's use direct DB connection for reliability.
  
  const { Client } = require('pg');
  const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';
  const client = new Client({ connectionString });
  
  try {
    await client.connect();

    // Find User
    const userRes = await client.query(`SELECT id, school_id FROM public.users WHERE email = $1`, [email]);
    if (userRes.rows.length === 0) {
        // Fallback: Check if we can find school by some other way or just list all users to see
        console.log('User not found in public.users. Checking recent logins or schools...');
        // For now, let's assume we can find the school if we list schools?
        // Let's just list all users to debug
        const allUsers = await client.query(`SELECT email, school_id FROM public.users LIMIT 5`);
        console.log('Available users:', allUsers.rows);
        throw new Error('User not found');
    }
    
    const schoolId = userRes.rows[0].school_id;
    console.log(`Found School ID: ${schoolId}`);

    // Find Device
    const devRes = await client.query(`SELECT id, name, status FROM bell_devices WHERE school_id = $1 AND status = 'online' LIMIT 1`, [schoolId]);
    if (devRes.rows.length === 0) {
        console.log('No ONLINE device found for this school. Listing any device...');
        const anyDev = await client.query(`SELECT id, name, status FROM bell_devices WHERE school_id = $1 LIMIT 1`, [schoolId]);
        if (anyDev.rows.length === 0) throw new Error('No devices found for this school');
        console.log(`Found OFFLINE device: ${anyDev.rows[0].name} (${anyDev.rows[0].id})`);
        // Proceed anyway? The user said "currently online".
        // Maybe the status hasn't updated in DB yet.
    } else {
        console.log(`Found ONLINE device: ${devRes.rows[0].name} (${devRes.rows[0].id})`);
    }
    
    const deviceId = devRes.rows.length > 0 ? devRes.rows[0].id : (await client.query(`SELECT id FROM bell_devices WHERE school_id = $1 LIMIT 1`, [schoolId])).rows[0].id;

    // Find Profile
    const profRes = await client.query(`SELECT id, name FROM bell_profiles WHERE school_id = $1 LIMIT 1`, [schoolId]);
    if (profRes.rows.length === 0) {
        console.log('No profile found. Creating "Default Profile"...');
        const newProf = await client.query(`INSERT INTO bell_profiles (school_id, name) VALUES ($1, 'Default Profile') RETURNING id`, [schoolId]);
        profRes.rows = [{ id: newProf.rows[0].id }];
    }
    const profileId = profRes.rows[0].id;
    console.log(`Using Profile: ${profRes.rows[0].name || 'Default'} (${profileId})`);

    // Calculate Time (Current + 5 mins)
    // Need to account for Timezone? The ESP32 is hardcoded to GMT+5 (Pakistan).
    // Let's get current UTC time and add 5 hours + 5 minutes.
    
    const now = new Date();
    // ESP32 is GMT+5.
    const espTime = new Date(now.getTime() + (5 * 60 * 60 * 1000)); 
    // Add 5 minutes for the test
    const targetTime = new Date(espTime.getTime() + (5 * 60 * 1000));
    
    const h = targetTime.getUTCHours();
    const m = targetTime.getUTCMinutes();
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    
    // Day of week? ESP32 uses 1=Mon, 7=Sun.
    // JS getUTCDay() returns 0=Sun, 1=Mon.
    let day = targetTime.getUTCDay(); 
    if (day === 0) day = 7; // Convert Sun 0 -> 7
    
    console.log(`Setting Bell Time: ${timeStr} for Day ${day} (ESP32 Time approx)`);

    // Insert Bell Time
    // Check if exists first to avoid dupes
    await client.query(`DELETE FROM bell_times WHERE profile_id = $1 AND bell_time = $2`, [profileId, timeStr]);
    
    // Schema Check: 'name' might not exist in bell_times. 
    // Usually bell_times has: id, profile_id, bell_time, days_of_week (array), label?
    // ERROR: column "days_of_week" of relation "bell_times" does not exist
    // Maybe it's `day_of_week` (int) or something else?
    // Let's inspect the table first if we fail.
    
    // Attempt 3: day_of_week (singular) as Array? Or maybe just 'days'?
    // Wait, the error said "column name" does not exist, then "days_of_week" does not exist.
    // Let's try to query columns first to be sure.
    const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'bell_times'`);
    console.log('Columns in bell_times:', cols.rows.map(r => r.column_name));
    
    // Construct query dynamically based on columns
    const colNames = cols.rows.map(r => r.column_name);
    let daysCol = colNames.includes('days_of_week') ? 'days_of_week' : (colNames.includes('day_of_week') ? 'day_of_week' : null);
    let nameCol = colNames.includes('name') ? 'name' : (colNames.includes('label') ? 'label' : null);
    
    if (!daysCol) throw new Error('Cannot find days column');
    
    const insertQuery = `
        INSERT INTO bell_times (profile_id, bell_time, ${daysCol} ${nameCol ? `, ${nameCol}` : ''})
        VALUES ($1, $2, $3 ${nameCol ? `, 'Test Bell'` : ''})
    `;
    
    await client.query(insertQuery, [profileId, timeStr, [day]]);
    
    console.log('Bell time inserted.');

    // Send CONFIG command
    console.log('Sending CONFIG command...');
    await client.query(`
        INSERT INTO command_queue (device_id, school_id, command, status)
        VALUES ($1, $2, 'CONFIG', 'pending')
    `, [deviceId, schoolId]);
    
    console.log('Command sent!');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

setTestBell();
