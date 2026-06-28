# AutoBell Firmware & Performance Fixes

## 1. Issue Analysis
The user reported three main issues with the HBS device (`digitapbs@gmail.com`):
1.  **Incomplete Schedule Parsing**: Only 20 out of 50 schedules were being parsed.
2.  **Missed Bells**: Bells were not running on time.
3.  **Watchdog Timer (WDT) Confusion**: User disabled WDT, but suspected it was still active.

### Root Causes Identified
*   **JSON Parsing Limit**: The `ArduinoJson` library on ESP32 has a finite memory buffer. The original verbose JSON payload (using full keys like `bell_time`, `days_of_week`, `track_number`) for 50 schedules exceeded this buffer, causing truncation and partial parsing.
*   **Blocking Sync Operations**: The `syncSchedules()` function performs a blocking HTTPS request to Supabase. If this sync occurs right when a bell is due (every 5 minutes), it delays the main loop, causing the bell trigger window (0-5 seconds) to be missed.
*   **Misleading Health Report**: The `printSystemHealth()` function hardcoded the string "WDT: Active" even though `esp_task_wdt_deinit()` was successfully called in `setup()`.

## 2. Solutions Implemented

### A. Compact JSON Payload (Fixes Parsing Limit)
We optimized the `get_device_config` RPC in Supabase to return a minified JSON structure. This significantly reduces the payload size, allowing 50+ schedules to fit within the ESP32's JSON buffer.

**New Compact Keys:**
*   `t` (Time) instead of `bell_time`
*   `tr` (Track) instead of `track_number`
*   `tr2` (Track 2) instead of `track_number_2`
*   `d` (Days) instead of `days_of_week`
*   `ds` (Delay) instead of `delay_seconds`
*   `ty` (Type) instead of `type`
*   `tt` (TTS Text) instead of `tts_text`

**Firmware Update:**
Maintained firmware variants (`main_40pin.cpp`, `main_wroom.cpp`, `main_s3.cpp`) support both legacy and compact keys in `parseSchedules()`.

### B. Smart Schedule Sync (Fixes Missed Bells)
We implemented a "Smart Sync" mechanism in `syncSchedules()`. Before initiating the blocking WiFi download, the system now checks if any bell is scheduled within the next **2 minutes**.

*   **Logic**: If a bell is imminent, the sync is skipped ("Skipping sync: Bell imminent").
*   **Benefit**: Ensures the main loop remains free to trigger the bell exactly on time.

### C. WDT Status Correction (Fixes Confusion)
The `printSystemHealth()` function in `main_40pin.cpp` was updated to accurately reflect the WDT state.
*   **Before**: `WDT: Active` (Hardcoded)
*   **After**: `WDT: Disabled`

## 3. Files Updated
The following files were modified to apply these fixes:
1.  `esp32-firmware/src/main_40pin.cpp`
2.  `esp32-firmware/src/main_wroom.cpp`
3.  `esp32-firmware/src/main_s3.cpp`
4.  `supabase/migrations/20260213000000_optimize_get_device_config.sql` (Database RPC)

## 4. Verification Steps
To verify the fixes:
1.  **Monitor Serial Output**: Look for `Parsed 50 schedules` (or the correct total count) after a sync.
2.  **Check Health Log**: Confirm the log prints `HEALTH: ... | WDT: Disabled`.
3.  **Test Critical Timing**: Schedule a bell 1 minute before a sync interval (e.g., if sync is every 5 mins at :00, :05, schedule a bell at :04). Verify the log says `Skipping sync: Bell imminent` and the bell rings on time.
