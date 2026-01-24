# AutoBell Feature Request: Buzzer Test & Time Sync

## 1. Buzzer Test Button
**Goal:** Add a "Test Buzzer" button to the web application to verify communication with the ESP32 device.

**Requirements:**
- **Web App:**
  - Add a "Test Buzzer" button in the device management interface (Bell Management).
  - When clicked, send a `TEST_BUZZER` command to the specific device via the `command_queue`.
- **ESP32 Firmware:**
  - Handle the `TEST_BUZZER` command.
  - When received, activate the buzzer for **5 seconds** and then turn it off automatically.
  - This should be a silent test (buzzer only) or standard ring, but strictly verifying the buzzer hardware and command latency.

## 2. Daily Time Sync
**Goal:** Ensure the ESP32 maintains accurate time by syncing with the internet daily.

**Requirements:**
- **ESP32 Firmware:**
  - Sync time via NTP immediately upon startup (boot).
  - Configure the NTP client to re-sync automatically once every **24 hours** (daily).
  - This ensures that if the internal clock drifts, it is corrected daily.
