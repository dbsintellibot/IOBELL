# Sub-Prompt 6: IoT API Contract

**Goal:** Define the exact communication protocol between the ESP32 and Supabase.

**Instructions:**
1.  **JSON Payload Definitions:**
    *   Define the JSON structure for the **Heartbeat** (Device -> Backend).
        *   Include: `mac_address`, `uptime`, `wifi_signal`, `current_profile_hash` (to check for updates).
    *   Define the JSON structure for the **Schedule Sync** (Backend -> Device).
        *   Include: `profile_name`, `timings` array (HH:MM, audio_url, duration).

2.  **Communication Flow:**
    *   **Polling vs Push:** Decide on the primary method.
        *   *Recommendation:* Polling every X minutes for schedule updates + Realtime channel (MQTT/Websocket) for immediate "Emergency" or "Manual Ring" commands.
    *   **Emergency Protocol:** How the device receives the emergency command with minimal latency.

3.  **Device Authentication:**
    *   Define how the ESP32 authenticates (e.g., sending a pre-shared secret or checking MAC address against the `bell_devices` table via an Edge Function or RLS-friendly query).

**Output:**
*   `API_CONTRACT.md` file containing JSON examples and sequence diagrams (Mermaid).
