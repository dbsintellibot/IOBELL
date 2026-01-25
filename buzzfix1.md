# Fix for Buzzer, Config, Reboot Buttons & Serial Logs

## Problem
- **Issue**: "Test Buzzer", "Config", and "Reboot" buttons in Bell Management UI do not trigger actions on ESP32.
- **Symptom**: No serial logs appear on the ESP32 when these buttons are clicked.
- **Root Cause**: The `command_queue` table has Row Level Security (RLS) enabled. The ESP32 connects using the **Anon Key**, which (by default) cannot read rows in `command_queue` unless a specific policy exists. Direct REST API calls (`/rest/v1/command_queue...`) return an empty list because the RLS policy filters out the rows.

## Solution

### 1. Database Side (Bypass RLS securely)
Instead of direct table access, we will use a **Postgres Function (RPC)** marked as `SECURITY DEFINER`.
- **Function**: `get_next_command(p_device_id)`
- **Behavior**: Fetches the oldest `pending` command for the given device ID.
- **Security**: Runs with owner privileges, bypassing RLS, but strictly filters by the provided `device_id`.

### 2. Firmware Side (Update Polling Logic)
- **Poll Mechanism**: Change `pollCommands()` to call the new RPC (`/rest/v1/rpc/get_next_command`) instead of selecting from the table.
- **Command Handling**:
    - **TEST_BUZZER**: Already fixed to use `tone()`.
    - **CONFIG**: Add handler (e.g., fetch device details again or just log).
    - **REBOOT**: Ensure it calls `ESP.restart()`.
- **Logging**: Add `Serial.println` statements for:
    - Polling start/result.
    - Command received.
    - Command execution status.

## Implementation Steps
1.  Create `scripts/create_rpc.js` to deploy the database function.
2.  Run the script to update the database.
3.  Modify `esp32-firmware/src/main.cpp` to use the new RPC and add logging.
