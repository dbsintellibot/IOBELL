# Prompt: Fix ESP32 Restart Hang and WiFi Reconnect Behavior

You are working on an ESP32 firmware project with multiple variants:
- `main_wroom.cpp`
- `main_40pin.cpp`
- `main_s3.cpp`
- `main_wemos.cpp` (Wemos D1 mini ESP32, reusing wroom logic)

All versions have two problems:
1. The device sometimes **hangs** after reset/restart.
2. After **every** restart/reset, the device asks to **reconnect WiFi** instead of reusing saved credentials.

Your task is to update the firmware so that:
- Hanging issues on restart are fixed.
- WiFi credentials are properly saved and reused.
- The device only asks for WiFi setup when **really needed**.

---

## High‑Level Goals

1. **Reliably reuse WiFi credentials across resets**
   - On normal restart or power cycle:
     - Reuse **previously saved WiFi credentials** automatically.
     - Do **not** show any WiFi configuration portal or “connect WiFi” prompt if valid credentials are present.
   - Only ask to reconnect WiFi when:
     - The device has just been **reflashed** or memory has been wiped and no WiFi credentials exist, or
     - There are **no valid saved credentials** at all (first‑time setup).
   - Optional (if already supported in code): allow a **manual trigger** (e.g. long button press) to clear WiFi and re-open the WiFi config portal. This must not happen automatically on every reboot.

2. **Fix hanging issues on boot and during normal operation**
   - The firmware must **not hang** during:
     - WiFi connection
     - HTTP/HTTPS requests
     - Supabase or other backend calls
     - OTA or other long operations
   - The main loop must remain responsive and must **not block indefinitely** on:
     - `while (!WiFi.isConnected()) { ... }` loops with no timeout/yield
     - WiFiManager configuration portal calls that never return
     - Network operations with no timeout
   - The watchdog (WDT), if used, should be configured correctly and should be **reset regularly** in long-running loops to avoid unintended resets, but you must not use “disable WDT” as the fix.

3. **Apply the fix consistently to all maintained firmware variants**
   - Ensure behavior is consistent in:
     - `main_wroom.cpp`
     - `main_40pin.cpp`
     - `main_s3.cpp`
     - `main_wemos.cpp` (Wemos D1 mini ESP32)
   - After your changes:
     - All variants should **boot and reconnect automatically** to WiFi using stored credentials.
     - None of them should show the WiFi portal/prompt on every reset.
     - Hanging behavior should be eliminated or reduced to the extent reasonably possible.

---

## Detailed Requirements

### 1. WiFi Credentials Handling

- If the project uses **WiFiManager** (or similar library):
  - Confirm that credentials are stored in **non-volatile storage** (NVS / flash) and **not cleared** on each reboot.
  - Do **not** call functions like `resetSettings()` or their equivalents at boot unless explicitly requested by the user.
  - Boot behavior:
    - First, attempt to connect using **previously saved credentials** without user interaction.
    - If saved credentials exist and connect successfully, skip any config portal and move on to normal firmware logic.
    - If **no saved credentials** are present, or the connection fails after a reasonable timeout (e.g., 20–30 seconds of retries), then:
      - Open the WiFi configuration portal or prompt to let the user configure WiFi.
- If the project uses plain `WiFi.begin(ssid, password)`:
  - Ensure SSID and password are stored in a persistent way (NVS or other flash-based storage) and **not overwritten with empty values** on boot.
  - On startup:
    - Load the stored credentials.
    - If they exist, call `WiFi.begin()` with them and wait with timeouts, not infinite loops.
    - Only show a configuration mode if there are no stored credentials or all retries/timeouts fail.

**Critical constraint:**
- Do **not** ask the user to reconnect WiFi after every reset/restart.
- Only show WiFi setup when:
  - Firmware has been reflashed (and flash was erased so credentials are gone), or
  - There are no valid stored credentials.

---

### 2. Preventing Hanging on Restart

Analyze the boot and main loop logic in all main firmware files and fix possible causes of hanging, including but not limited to:

- **Blocking WiFi connect loops**
  - Replace endless loops waiting for WiFi with **bounded loops** that:
    - Have a clear timeout or maximum retry count.
    - Call `delay()` or `yield()` and, if WDT is active, reset the watchdog within the loop.
  - Example patterns to avoid:
    - `while (WiFi.status() != WL_CONNECTED) { /* no delay, no timeout */ }`
    - WiFiManager config portal calls that never return if user does nothing, unless that behavior is explicitly desired and documented.

- **Network and backend calls**
  - Ensure HTTP/HTTPS requests have **timeouts** and failure handling.
  - The absence of network or backend should not cause the whole device to hang; it should:
    - Fail gracefully,
    - Possibly retry with backoff,
    - But keep the main loop responsive.

- **Watchdog cooperation**
  - If a task watchdog (esp_task_wdt) is used:
    - Make sure any long-running operations call the watchdog reset function periodically.
    - Avoid long, blocking operations without watchdog resets.
  - Do not fix “hang” by just disabling the watchdog entirely.

- **Common loops**
  - Check any long loops in `setup()` and `loop()` across all variants and:
    - Add `delay()` / `yield()` where appropriate.
    - Ensure they can exit or time out in error conditions.

---

### 3. Consistent Behavior Across All ESP32 Variants

For each variant (`main_wroom.cpp`, `main_40pin.cpp`, `main_s3.cpp`, `main_wemos.cpp`):

- Implement the **same WiFi persistence logic**:
  - Try reconnecting with saved credentials first, silently.
  - Only open WiFi configuration if no credentials or repeated failure.
- Implement the **same anti-hang patterns**:
  - Bounded retries and timeouts.
  - Non-blocking or minimally blocking loops.
  - Proper watchdog handling where applicable.

Verify behavior by simulating these scenarios for each variant:

1. **First boot (no credentials stored)**
   - Device should start WiFi configuration / portal and request WiFi credentials.
   - After user saves credentials and device connects, those credentials should persist.

2. **Normal restart / power cycle (credentials already stored)**
   - Device should automatically reconnect to the previously saved WiFi.
   - Device should **not** open the WiFi setup portal.
   - Device should not hang during this process.

3. **Reflash with flash erase (no credentials)**
   - Flash erase removes credentials.
   - On boot, device should behave like first boot and ask for WiFi setup.

4. **Failed network / backend but WiFi OK**
   - Device connected to WiFi but backend (e.g. server) is down.
   - Device should not hang; should handle failures gracefully and keep loop responsive.

---

### 4. Code Quality and Safety

- Do not introduce global state that is difficult to reason about for WiFi or connection status.
- Keep any new configuration constants (timeouts, retries) clearly named so they can be tuned later.
- Ensure your changes do not break existing OTA or scheduling features.
- Prefer small, clear helper functions for:
  - “Connect to WiFi using saved credentials with timeout”
  - “Start WiFi configuration portal if no credentials or connection fails”
  - “Handle reconnect logic without blocking the main loop”

---

## Deliverables

1. Updated versions of:
   - `main_wroom.cpp`
   - `main_40pin.cpp`
   - `main_s3.cpp`
   - `main_wemos.cpp`
2. A short summary (in comments or a separate note) of:
   - How WiFi credentials are now persisted and reused.
   - When the device will ask for WiFi configuration.
   - What was changed to prevent hanging on restart.

Remember:  
**Do not ask the user to reconnect WiFi on every reset or restart. Only ask when reflashed/erased or when no valid stored WiFi credentials are available.**