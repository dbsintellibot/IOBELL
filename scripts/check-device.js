const { Client } = require('pg');

const connectionString = "postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function checkDevice() {
  try {
    await client.connect();
    console.log('Connected to database.');

    // Check Inventory
    console.log('\n--- Checking Device Inventory (Target: 0001 / D0:70:26:E8:1F:84) ---');
    let inventoryItem = null;
    try {
        const inventoryRes = await client.query(
            "SELECT * FROM device_inventory WHERE serial_number = '0001' OR mac_address = 'D0:70:26:E8:1F:84'"
        );
        
        if (inventoryRes.rows.length > 0) {
            inventoryItem = inventoryRes.rows[0];
            console.log('✅ Device found in inventory:', inventoryItem);
            
            if (inventoryItem.claimed_at) {
                console.log('⚠️ Status: CLAIMED (Not available to connect)');
                console.log('Claimed at:', inventoryItem.claimed_at);
            } else {
                console.log('✅ Status: UNCLAIMED (Available to connect)');
            }
        } else {
            console.log('❌ Device NOT found in inventory.');
            console.log('Attempting to add device to inventory...');
            
            const insertRes = await client.query(
                "INSERT INTO device_inventory (serial_number, mac_address) VALUES ($1, $2) RETURNING *",
                ['0001', 'D0:70:26:E8:1F:84']
            );
            
            if (insertRes.rows.length > 0) {
                console.log('✅ Device successfully added to inventory:', insertRes.rows[0]);
                console.log('✅ Status: UNCLAIMED (Available to connect)');
            }
        }

    } catch (e) {
        console.error("Error querying/modifying device_inventory:", e.message);
    }

    // Check Registered Devices (bell_devices view/table)
    console.log('\n--- Checking Registered Devices (bell_devices) ---');
    try {
        const devicesRes = await client.query("SELECT * FROM bell_devices LIMIT 5");
        console.log(`Found ${devicesRes.rows.length} registered devices.`);
         if (devicesRes.rows.length > 0) {
            console.log('First few devices:', devicesRes.rows);
        }

        const hbsRes = await client.query("SELECT * FROM bell_devices WHERE name = 'hbs'");
        if (hbsRes.rows.length > 0) {
            console.log('✅ Device found in bell_devices by name "hbs":', hbsRes.rows[0]);
        } else {
            console.log('❌ Device "hbs" NOT found in bell_devices.');
        }
    } catch (e) {
        console.error("Error querying bell_devices:", e.message);
    }

  } catch (err) {
    console.error('Connection Error:', err);
  } finally {
    await client.end();
  }
}

checkDevice();
