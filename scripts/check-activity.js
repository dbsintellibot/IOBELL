const { Client } = require('pg');

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function checkActivity() {
  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Check bell_devices for recent heartbeats
    console.log('\n--- Recent Activity in bell_devices ---');
    const devicesRes = await client.query(`
        SELECT name, status, last_heartbeat, updated_at, mac_address 
        FROM bell_devices 
        ORDER BY last_heartbeat DESC NULLS LAST, updated_at DESC 
        LIMIT 5
    `);
    if (devicesRes.rows.length > 0) {
        console.table(devicesRes.rows);
    } else {
        console.log('No devices found.');
    }

    // 2. Check command_queue for recent executions
    console.log('\n--- Recent Activity in command_queue ---');
    try {
        const commandsRes = await client.query(`
            SELECT command, status, created_at, device_id 
            FROM command_queue 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        if (commandsRes.rows.length > 0) {
            console.table(commandsRes.rows);
        } else {
            console.log('No recent commands found.');
        }
    } catch (e) {
        console.error("Error checking command_queue:", e.message);
    }
    
    // 3. Check if there is a logs table
    console.log('\n--- Checking for logs table ---');
    const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    
    if (tables.includes('device_logs')) {
         console.log('Found "device_logs" table. Querying recent logs...');
         const logsRes = await client.query('SELECT * FROM device_logs ORDER BY created_at DESC LIMIT 5');
         if (logsRes.rows.length > 0) {
            console.table(logsRes.rows);
         } else {
            console.log('No recent device logs found.');
         }
    } else {
        console.log('No known logs table found. Tables:', tables.join(', '));
    }

  } catch (err) {
    console.error('Connection Error:', err);
  } finally {
    await client.end();
  }
}

checkActivity();
