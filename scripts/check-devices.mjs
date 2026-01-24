import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../web-dashboard/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log('--- Bell Devices ---');
  const { data: devices, error: devError } = await supabase.from('bell_devices').select('*');
  if (devError) console.error(devError);
  else console.table(devices);

  console.log('\n--- Device Inventory ---');
  const { data: inventory, error: invError } = await supabase.from('device_inventory').select('*');
  if (invError) console.error(invError);
  else console.table(inventory);

  if (devices && inventory) {
    const invMacs = new Set(inventory.map(i => i.mac_address));
    const orphans = devices.filter(d => !invMacs.has(d.mac_address));
    console.log('\n--- Detected Unassigned (Orphan) Devices ---');
    console.table(orphans);
  }
}

checkData();
