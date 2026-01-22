# Sub-Prompt 7: ESP32 Firmware (Arduino/PlatformIO)

**Goal:** Write the C++ firmware for the ESP32 Bell Controller.

**Instructions:**
1.  **Environment:**
    *   Use **PlatformIO** (VS Code).
    *   Framework: Arduino.
    *   Libraries: `WiFi`, `HTTPClient`, `ArduinoJson`, `DFRobotDFPlayerMini`, `NTPClient`.

2.  **Core Features:**
    *   **WiFi Manager:** Connect to WiFi (hardcoded or SmartConfig). Auto-reconnect on failure.
    *   **Time Sync:** Fetch time via NTP. Handle Timezones (if needed, or assume server sends UTC).
    *   **API Client:**
        *   Poll Supabase (or Edge Function) every X minutes for schedule updates.
        *   Download/cache the schedule JSON to SPIFFS/LittleFS (so it works offline).
    *   **Scheduler:**
        *   Check current time against the cached schedule every second.
        *   Trigger DFPlayer Mini to play specific MP3 when time matches.
    *   **Emergency Mode:**
        *   Listen for immediate override commands (via WebSocket or frequent polling state).

3.  **Hardware Abstraction:**
    *   Define pins for DFPlayer (RX/TX).
    *   Define pins for status LEDs (Power, WiFi, Error).

**Output:**
*   `src/main.cpp` code.
*   `platformio.ini` configuration.
*   Instructions for wiring the hardware.
