import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.hjlwzkwiweocnfztshmy:Tiger%401979%23%23%23@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function main() {
  await client.connect();
  const deviceId = '7fb2fb94-1318-47fe-8498-2cbfe005cbd2';
  
  // Let's find all log tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%log%'
  `);
  console.log('Log tables found:', tablesRes.rows);

  let output = '=== Log Tables Data ===\n';

  for (const row of tablesRes.rows) {
    const tableName = row.table_name;
    output += `\n--- Table: ${tableName} ---\n`;
    try {
      // Query recent logs for this device
      let query = `SELECT * FROM public.${tableName} `;
      const columnsRes = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
      `, [tableName]);
      const cols = columnsRes.rows.map(c => c.column_name);
      
      if (cols.includes('device_id')) {
        query += `WHERE device_id = '${deviceId}' `;
      } else if (cols.includes('mac_address')) {
        query += `WHERE mac_address = '1C:DB:D4:4B:0B:48' `;
      }
      
      if (cols.includes('created_at')) {
        query += `ORDER BY created_at DESC LIMIT 50`;
      } else {
        query += `LIMIT 50`;
      }

      const res = await client.query(query);
      output += JSON.stringify(res.rows, null, 2) + '\n';
    } catch (e) {
      output += `Error reading table ${tableName}: ${e.message}\n`;
    }
  }

  fs.writeFileSync('device_logs_output.txt', output);
  console.log('Done! Full logs output written to device_logs_output.txt');
  await client.end();
}

main().catch(console.error);
