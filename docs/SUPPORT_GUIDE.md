# AutoBell Support Team Guide

This document is designed for the AutoBell Support and IT Operations teams. It contains technical troubleshooting workflows, common client issues, database query recipes, and explanations of system mechanics to ensure fast and effective client resolution.

---

## 1. System Components & Architecture

The AutoBell ecosystem consists of four main parts:

```mermaid
graph TD
    subgraph Clients
        Web[Web App (React + Vite)]
        Mobile[Mobile App (React Native)]
    end

    subgraph Backend [Supabase Backend]
        Auth[GoTrue Auth]
        DB[(PostgreSQL Database)]
        Storage[File Storage]
        Edge[Edge Functions]
        Realtime[Realtime Engine]
    end

    subgraph IoT [IoT Ecosystem]
        ESP32[ESP32 Bell Controller]
        Bell[Physical Bell/Siren]
    end

    subgraph External [External Services]
        NTP[NTP Server (Time Sync)]
    end

    Web -->|REST / Realtime| Backend
    Mobile -->|REST / Realtime| Backend
    ESP32 -->|HTTPS / WSS| Backend
    ESP32 -->|GPIO| Bell
    ESP32 -->|UDP| NTP
    Auth -.->|Secures| DB
    Auth -.->|Secures| Storage
    Edge -.->|Logic| DB
```

*   **Web Dashboard (React + Vite):** Hosted at [https://iobell.web.app/](https://iobell.web.app/). School admins manage schedules, audio files, and user access. Super Admins manage global inventory, schools, and partner accounts.
*   **Mobile Application (React Native / Expo):** Used by school staff for manual bell triggers, broadcasts, and Emergency Mode.
*   **Supabase Cloud Backend:** Handles database records (PostgreSQL), file storage (buckets: `audio-files`, `voice-notes`, `school-branding`, `firmware`), realtime push updates via WebSockets, and serverless Edge Functions.
*   **Smart Bell Devices (ESP32 Firmware):** Physical controllers connected to speakers/amplifiers. Connects via WiFi, syncs time via NTP, polls backend for schedules (stored in local LittleFS/SPIFFS cache for offline resilience), and listens to WebSockets (Supabase Realtime) for manual/emergency triggers.

---

## 2. User Roles & Account Configurations

AutoBell is a multi-tenant system. Strict Row-Level Security (RLS) ensures schools only see their own data.

1.  **Super Admin (Platform Owner):**
    *   **Access:** Managed through the `super_admin` role. Promoted using `SELECT setup_super_admin('email')`.
    *   **Core Functions:** Full CRUD on all tables, global inventory management, claiming/unassigning/retiring devices, uploading OTA firmware.
    *   **Primary Account:** `muddasirh@gmail.com`
2.  **School Admin (Tenant Owner):**
    *   **Access:** Managed through the `admin` role. Assigned to exactly one `school_id`.
    *   **Core Functions:** Manage school profiles, bell schedules, user management (inviting operators), and backup/restore.
    *   **Example Account:** `digitapbs@gmail.com`
3.  **Operator (School Staff):**
    *   **Access:** Managed through the `operator` role. Scoped to a `school_id`.
    *   **Core Functions:** Read-only schedule views, manual triggers, emergency overrides.
4.  **Partner Portal Users:**
    *   **Access:** Third-party partners/resellers who onboard schools and manage initial device registrations.

---

## 3. Device Lifecycle Management

Devices follow a strict progression to ensure physical inventory is kept in sync:

1.  **Factory Phase:** Devices are manufactured and added to `device_inventory` (mac_address, serial_number).
2.  **Claiming/Registration:** When a school buys a device, the School Admin enters the serial number via the Dashboard. The `claim_device` RPC is called, linking the device to the school's `school_id` and creating a row in `bell_devices`.
3.  **Unassigning Devices (Super Admin Only):** If a device is moved to a new school, the Super Admin calls `unassign_device(p_device_id)`. This resets `claimed_at` and `claimed_by_school_id` in `device_inventory`, and deletes the `bell_devices` row (cleaning up logs and command history via cascading deletes). The device can then be claimed again by another school.
4.  **Retiring Devices (Super Admin Only):** If a device is damaged or destroyed, the Super Admin calls `retire_device(p_device_id, p_reason)`. This marks it as retired (`retired_at` timestamp set) in `device_inventory`, ensuring it can never be claimed again, and deletes the `bell_devices` row.
5.  **Backup Device Service:** Clients with a yearly agreement get spare devices in case of failure. The replacement device can be claimed via serial number to automatically inherit the existing school schedule and audio files.

---

## 4. Troubleshooting Common Client Issues

### A. Device is Offline / Dashboard status is "Offline"
1.  **Green LED Status:**
    *   **Off:** No power or WiFi issue. Ensure power supply is connected (5V/2A).
    *   **Blinking:** Attempting to connect to WiFi. If it keeps blinking, WiFi credentials might have changed or router is out of range.
    *   **Solid On:** WiFi connected. If the dashboard still says offline, it's a websocket/API handshake issue.
2.  **Action Plan:**
    *   Ask the client to power-cycle the device (unplug for 10 seconds, plug back in).
    *   Verify if NTP sync works (rebooting forces NTP sync).
    *   If WiFi changed, use the **WiFi Setup Portal**:
        1. Search for a WiFi network named `AutoBell-Setup` on a phone/laptop.
        2. Connect to it and navigate to `192.168.4.1` in a browser.
        3. Enter the new SSID and Password, then click save.

### B. Bell Does Not Ring at Scheduled Time
1.  **Verify Schedule & Profile:**
    *   Check if the correct profile is marked as **Active** (e.g., "Regular Day" vs "Exam Day").
    *   Ensure the schedule entry is set for the correct day of the week.
    *   *Note:* Changes to schedules can take up to 5 minutes to sync to the device.
2.  **Perform Manual Test:**
    *   Ask the user to tap "Manual Trigger" in the mobile app or dashboard.
    *   *If manual trigger works:* The speaker connection, power, and audio file are fine. The issue is schedule syncing or incorrect system time. Reboot the device to force NTP time synchronization.
    *   *If manual trigger fails:* Check if the speaker wire is loose, device volume is set to 0, or the audio file is missing/corrupted.

### C. Audio Sounds Crackly, Cuts Out, or "Skips"
1.  **Power Supply Issue:** ESP32 and speakers draw high current. A standard phone charger (< 2A) will cause voltage drops, leading to crackling audio or unexpected reboots.
    *   *Fix:* Ensure the client is using a high-quality 5V/2A power adapter.
2.  **Audio File Issue:**
    *   Keep MP3 files short (under 30 seconds) for optimal performance.
    *   Test playing the file via the Audio Manager preview to check for corruption.
3.  **Hardware Variant:** Check if the device is using a DFPlayer Mini vs I2S amplifier. If it's a DFPlayer, ensure the SD card is seated properly.

### D. Device Randomly Restarts
1.  **Watchdog Timer (WDT):** The device firmware includes a 60-second hardware watchdog. If the system hangs or freezes (e.g., during network drops or memory exhaustion), the WDT triggers a reset to ensure 100% uptime.
2.  **Action Plan:**
    *   If it happens rarely, reassure the client this is normal auto-recovery.
    *   If it happens constantly, check the power supply stability or review the device's diagnostic logs on the dashboard for repeating errors.

### E. "Failed to Fetch" or Login Failures
1.  **Client Browser Console:** Check if there are CORS errors or network blocks (common on school networks with strict firewalls).
2.  **Account Verification:**
    *   Ensure the user's email has been confirmed in `auth.users`.
    *   Verify if the user's school has been suspended (`suspended = true`).
    *   Check if their role is correctly set (`admin` or `operator`) in `public.users`.

---

## 5. Support Diagnostics and CLI Scripts

As a support engineer, you can run diagnostic scripts from the `web-dashboard` directory to query and troubleshoot issues without manual SQL operations:

*   **Check basic database connectivity & user status:**
    ```bash
    node scripts/diagnostic_check.js
    ```
*   **Check active schedules & registered devices for a school:**
    ```bash
    node scripts/check_db_schedules.js
    ```
*   **Verify users, roles, and correct admin roles:**
    ```bash
    node scripts/check_users_and_devices.js
    ```
*   **Test TTS engine by sending a message to a device:**
    ```bash
    node scripts/send_tts.js
    ```
*   **Recreate/repair Super Admin profile configuration:**
    ```bash
    node scripts/recreate-super-admin-profile.js
    ```

---

## 6. DB Query Reference for Support Engineers

Run these queries directly in the Supabase SQL Editor to resolve account and hardware issues:

### A. Promote user to Super Admin
```sql
SELECT setup_super_admin('support.engineer@autobell.com');
```

### B. Register/Claim a device manually for a school
```sql
-- Replace with the correct serial number and desired device name, executed as the school admin
SELECT claim_device('AB-123456', 'Main Campus Bell');
```

### C. Find a device by MAC Address or Serial
```sql
SELECT * FROM device_inventory WHERE mac_address = '24:6F:28:A1:B2:C3';
SELECT * FROM bell_devices WHERE mac_address = '24:6F:28:A1:B2:C3';
```

### D. Clear device claim status (Manual fallback for unassigning)
```sql
UPDATE device_inventory
SET claimed_at = NULL, claimed_by_school_id = NULL
WHERE serial_number = 'AB-123456';

DELETE FROM bell_devices WHERE mac_address = '24:6F:28:A1:B2:C3';
```

### E. View device heartbeats and diagnostic logs
```sql
SELECT mac_address, last_heartbeat, status, input_power, firmware_version
FROM bell_devices
ORDER BY last_heartbeat DESC LIMIT 50;

SELECT * FROM device_logs ORDER BY created_at DESC LIMIT 100;
```

### F. Check if a school is suspended
```sql
SELECT id, name, suspended FROM schools WHERE name ILIKE '%School Name%';
```

---

## 7. Backup & Restore Operations

1.  **Process Details:**
    *   School admins can back up all schedules, logs, and MP3 files from settings. The file downloaded has a `.abk` extension (actually a standard ZIP package containing `metadata.json`, `database.json`, and the binary files from storage folders).
    *   When restoring, the dashboard extracts this zip, uploads the files to storage, and calls the PostgreSQL transaction `restore_school_backup(p_payload jsonb)`.
2.  **Common Failures:**
    *   **Corrupted Backup File:** Ensure the file extension is `.abk` or `.zip` and can be opened with standard extraction tools.
    *   **Schema Mismatches:** If new columns were added to the database since the backup was made, the restore RPC might fail. Verify schema versions in `metadata.json`.
