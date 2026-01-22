# AutoBell Troubleshooting Guide

This guide helps diagnose and fix common issues with the AutoBell system.

## Status LED Codes
The device has two LEDs:
- **WiFi LED (Green):**
  - **Solid On:** Connected to WiFi successfully.
  - **Off:** Not connected to WiFi.
  - **Blinking:** Attempting to connect.
- **Error LED (Red):**
  - **Off:** Normal operation.
  - **Solid On:** Critical error (e.g., Storage failure).
  - **Blinking:** Minor error or lost connection to server.

## Common Issues

### 1. Device is Offline (Green LED is Off)
**Symptoms:** The dashboard shows the device as "Offline", bells don't ring.
**Possible Causes:**
- Power outage.
- WiFi credentials changed.
- Router is too far away.
**Fixes:**
1. **Check Power:** Ensure the USB cable is plugged in firmly.
2. **Reboot:** Unplug the device, wait 10 seconds, and plug it back in.
3. **Check WiFi:** If you changed your WiFi password, the device needs to be reconfigured (refer to "Reconfiguring WiFi" section).

### 2. Bell Doesn't Ring at Scheduled Time
**Symptoms:** Schedule is set on dashboard, but silence at the bell time.
**Possible Causes:**
- Device time is incorrect (NTP sync failed).
- Schedule hasn't synced yet (takes up to 5 minutes).
- Volume is too low.
- Audio file is missing or corrupted.
**Fixes:**
1. **Check Dashboard:** Ensure the schedule is active for today's day of the week.
2. **Manual Test:** Use the Mobile App "Manual Trigger" to see if sound works at all.
   - *If Manual works:* It's a scheduling/time issue. Reboot device to force time sync.
   - *If Manual fails:* Speaker might be disconnected or volume is zero.

### 3. Audio Sounds Distorted or "Skipping"
**Symptoms:** Bell sound is crackly or cuts out.
**Fixes:**
1. Check the speaker wire connections.
2. Ensure the power supply provides enough current (at least 2A recommended).
3. Try a different MP3 file.

### 4. Cannot Log In to Dashboard/App
**Symptoms:** "Invalid login credentials".
**Fixes:**
1. Ensure you are using the correct email.
2. Ask an admin to reset your password or verify your account is active.

## Advanced Maintenance

### Reconfiguring WiFi
If the device cannot connect, it may enter "Access Point Mode" (if configured).
1. Look for a WiFi network named `AutoBell-Setup`.
2. Connect to it with your phone.
3. A portal should open (or go to `192.168.4.1`).
4. Enter new WiFi credentials and save.

### Factory Reset
*Only do this if instructed by support.*
1. Hold the physical "BOOT" button on the device for 10 seconds while powered on.
2. The device will wipe local settings and restart.

---
**Need more help?**
Contact support at: support@autobell.com
