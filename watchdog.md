# Prompt: Add Safe Watchdog Timer (WDT) to ESP32 Firmware

**Goal**: Implement a robust and safe Watchdog Timer (WDT) to prevent device hangs and missed schedules. The watchdog should reset the system **only** if the main loop is stuck or critical tasks are not executing.

**Constraints & Requirements**:
1.  **Safety First**: The WDT must have a sufficient timeout (recommended: **60 seconds**) to prevent false positives during network operations (WiFi connection, HTTP requests, SSL handshakes).
2.  **No WiFi Intervention**: The WDT must **NEVER** explicitly disable or turn off the WiFi radio. Its sole purpose is to reset the CPU if it hangs.
3.  **Missed Schedule Prevention**: The primary reason for this WDT is to ensure the device is always responsive to trigger bells. A hang causes missed schedules; a reset recovers the system.
4.  **Multi-Device Application**: The changes must be compatible with maintained firmware variants (`main_40pin.cpp`, `main_s3.cpp`, `main_wroom.cpp`).

**Implementation Plan**:

1.  **Re-enable WDT**:
    *   Remove `esp_task_wdt_deinit()` from `setup()`.
    *   Initialize WDT with a 60-second timeout: `esp_task_wdt_init(60, true);`.
    *   Add the current task (main loop) to WDT: `esp_task_wdt_add(NULL);`.

2.  **Feed the Dog**:
    *   In the `loop()` function, uncomment or add `esp_task_wdt_reset();` at the very beginning.
    *   Ensure this is the **only** place where the dog is fed, so that any blocking code in the loop (that exceeds 60s) correctly triggers a reset.

3.  **Review Blocking Operations**:
    *   Verify that `HTTPClient` and `WiFiClientSecure` timeouts are set well below the WDT timeout (e.g., 10-15 seconds).
    *   Current code has ~8s timeouts, which is safe for a 60s WDT.

4.  **Verification**:
    *   The system health print (`printSystemHealth`) should be updated to show "WDT: Enabled (60s)" instead of "Disabled".

**Instruction to Developer/AI**:
Apply the above changes to `src/main_40pin.cpp`, `src/main_s3.cpp`, and `src/main_wroom.cpp`. Ensure that the WDT initialization happens *after* potentially long setup delays (like initial WiFi connection) or ensure the dog is fed during setup loops if they are long.
