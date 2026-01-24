# Auto-Connect & Provisioning Prompt for ESP32 AutoBell

## Objective
Implement a "Plug & Play" auto-registration workflow for the ESP32 AutoBell firmware. The device should automatically connect to the backend, register itself as an unassigned device, and wait for assignment by a Super Admin before entering normal operation.

## Current State Analysis (`main.cpp`)
- **WiFi Connectivity**: Handled via `WiFiManager`.
- **Registration**: Uses `fetchDeviceDetails()` calling RPC `register_device_from_esp`.
- **Parameters**: Sends `p_mac_address`, `p_school_code`, `p_device_name`.
- **Issue**: Currently assumes a `school_code` might be present or pre-configured. We need to explicitly handle the "Unassigned" state.

## Required Implementation Steps

### 1. Firmware Logic Updates (`main.cpp`)

#### A. Initial Registration (Boot)
1.  **WiFi Connect**: Connect to WiFi (existing logic).
2.  **Register**: Call `register_device_from_esp` with:
    - `p_mac_address`: Device MAC.
    - `p_school_code`: Empty string `""` (if not yet saved in Preferences).
    - `p_device_name`: Default "AutoBell Device" (or from Preferences).

#### B. Handle Registration Response
The RPC should return the device status and configuration.
- **Scenario 1: Unassigned (New Device)**
    - API returns: `school_id` is null/empty.
    - Action:
        - Set internal state to `STATE_UNASSIGNED`.
        - **Visual Indication**: Blink LED slowly (e.g., 1s ON, 1s OFF) to indicate "Waiting for Assignment".
        - **Polling Loop**: Enter a polling loop (every 10-30 seconds) calling `fetchDeviceDetails()` or a lightweight `get_device_status` RPC.
        - **Do NOT** attempt to sync schedules or play bells.
- **Scenario 2: Assigned (Configured Device)**
    - API returns: Valid `school_id` (and optionally `school_code`).
    - Action:
        - Save `school_id` and `school_code` to **Preferences** (persistent storage).
        - Set internal state to `STATE_ACTIVE`.
        - **Visual Indication**: Solid LED (WiFi connected).
        - **Normal Operation**: Proceed to `syncSchedules()`, `pollCommands()`, etc.

#### C. Transition Logic
- Inside the polling loop (Unassigned State):
    - If a subsequent API call returns a valid `school_id`:
        - Update Preferences.
        - Transition to `STATE_ACTIVE`.
        - Immediately trigger `syncSchedules()`.

### 2. Backend Requirements (Supabase RPCs)

Ensure `register_device_from_esp` logic supports:
- **Input**: Allow `p_school_code` to be NULL or empty.
- **Logic**:
    - If device exists (MAC match): Update status to 'online', update IP/Version. Return current `school_id`.
    - If device is new: Create new record in `bell_devices` (or `inventory`) with `school_id = NULL` (or specific Inventory School ID), `status = 'online'`, `name = 'Unassigned Device'`.
- **Output**: Return JSON containing `id`, `school_id`, `school_code`, `status`.

### 3. Super Admin Workflow (Context)
- The Super Admin sees the device in the "Unassigned Devices" list (filtered by `school_id IS NULL`).
- Super Admin selects "Assign to School" -> Selects School -> Updates `bell_devices` table setting `school_id`.
- Next time ESP32 polls, it sees the new `school_id` and provisions itself.

## Prompt for Developer/AI
"Refactor `main.cpp` to implement the Unassigned/Provisioning state.
1. Modify `fetchDeviceDetails` to handle `school_id` being null in the response.
2. In `loop()`, if `schoolId` is empty, skip schedule checks and only run a 'Provisioning Poll' every 10s.
3. Once `schoolId` is received from the poll, save it to Preferences and enable full functionality.
4. Ensure `register_device_from_esp` is called with an empty string for school code if the device is factory reset or new."
