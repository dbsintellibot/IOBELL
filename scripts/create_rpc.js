const { Client } = require('pg');

const connectionString = 'postgresql://postgres.zelpaafberhmslyoegzu:Tiger%401979%23%23%23@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
});

async function createRpc() {
  try {
    await client.connect();
    console.log('Connected to database.');

    const sql = `
      -- Drop ambiguous versions
      DROP FUNCTION IF EXISTS get_next_command(text);
      DROP FUNCTION IF EXISTS get_next_command(uuid);
      
      CREATE OR REPLACE FUNCTION get_next_command(p_device_id uuid)
      RETURNS TABLE (
        id bigint,
        command text,
        payload jsonb
      ) 
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
        RETURN QUERY
        SELECT c.id, c.command, c.payload
        FROM command_queue c
        WHERE c.device_id = p_device_id
          AND c.status = 'pending'
        ORDER BY c.created_at ASC
        LIMIT 1;
      END;
      $$;

      GRANT EXECUTE ON FUNCTION get_next_command(uuid) TO anon;
      GRANT EXECUTE ON FUNCTION get_next_command(uuid) TO authenticated;
      GRANT EXECUTE ON FUNCTION get_next_command(uuid) TO service_role;

      -- ack_command
      DROP FUNCTION IF EXISTS ack_command(bigint);
      
      CREATE OR REPLACE FUNCTION ack_command(p_command_id bigint)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
        UPDATE command_queue
        SET status = 'executed',
            executed_at = now()
        WHERE id = p_command_id;
      END;
      $$;

      GRANT EXECUTE ON FUNCTION ack_command(bigint) TO anon;
      GRANT EXECUTE ON FUNCTION ack_command(bigint) TO authenticated;
      GRANT EXECUTE ON FUNCTION ack_command(bigint) TO service_role;
    `;

    await client.query(sql);
    console.log('RPC function get_next_command created successfully.');

  } catch (e) {
    console.error('Error creating RPC:', e);
  } finally {
    await client.end();
  }
}

createRpc();
