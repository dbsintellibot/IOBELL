import fs from 'fs'
import path from 'path'
import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

const SERIAL = 'TEST-SERIAL-001'
const MAC = 'AA:BB:CC:DD:EE:01'

async function run() {
  try {
    await client.connect()

    const beforeDev = await client.query(
      'SELECT id, mac_address, name, school_id FROM public.bell_devices WHERE mac_address = $1',
      [MAC]
    )

    const beforeInv = await client.query(
      'SELECT id, serial_number, mac_address, claimed_at, claimed_by_school_id FROM public.device_inventory WHERE serial_number = $1 OR mac_address = $2',
      [SERIAL, MAC]
    )

    console.log('bell_devices before:')
    console.table(beforeDev.rows)
    console.log('device_inventory before:')
    console.table(beforeInv.rows)

    await client.query('BEGIN')

    await client.query(
      'DELETE FROM public.bell_devices WHERE mac_address = $1',
      [MAC]
    )

    await client.query(
      'DELETE FROM public.device_inventory WHERE serial_number = $1 OR mac_address = $2',
      [SERIAL, MAC]
    )

    await client.query('COMMIT')

    const afterDev = await client.query(
      'SELECT id, mac_address, name, school_id FROM public.bell_devices WHERE mac_address = $1',
      [MAC]
    )

    const afterInv = await client.query(
      'SELECT id, serial_number, mac_address, claimed_at, claimed_by_school_id FROM public.device_inventory WHERE serial_number = $1 OR mac_address = $2',
      [SERIAL, MAC]
    )

    console.log('bell_devices after:')
    console.table(afterDev.rows)
    console.log('device_inventory after:')
    console.table(afterInv.rows)
  } catch (err) {
    console.error('Error cleaning up test device:', err)
    try {
      await client.query('ROLLBACK')
    } catch {
    }
  } finally {
    await client.end()
  }
}

run()

