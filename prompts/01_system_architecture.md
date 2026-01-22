# Sub-Prompt 1: System Architecture

**Goal:** Define the high-level architecture, data flow, and security model for the SaaS Bell Management System.

**Instructions:**
1.  **Architecture Diagram:**
    *   Create a Mermaid.js diagram showing the relationship between:
        *   **Clients:** Web App (React), Mobile App (React Native).
        *   **Backend:** Supabase (Auth, DB, Storage, Edge Functions).
        *   **IoT Devices:** ESP32 Bell Controllers.
        *   **External Services:** NTP Server.

2.  **Data Flow Description:**
    *   Explain how a bell schedule update flows from the Web/Mobile App to the ESP32.
    *   Explain how an "Emergency Trigger" flows from App to ESP32 (priority handling).
    *   Explain how the ESP32 authenticates and retrieves its config.

3.  **Security Strategy:**
    *   **User Auth:** How are School Admins and Operators authenticated?
    *   **Device Auth:** How does the ESP32 securely identify itself to Supabase? (e.g., Token-based, RLS).
    *   **Data Isolation:** Ensure one school cannot access another school's bells or schedules.

4.  **Tech Stack Confirmation:**
    *   **Frontend:** React (Vite), Tailwind CSS, Shadcn UI.
    *   **Mobile:** React Native (Expo).
    *   **Backend:** Supabase (PostgreSQL, GoTrue, Storage).
    *   **Firmware:** C++ (PlatformIO/Arduino) for ESP32.

**Output:**
*   A comprehensive `ARCHITECTURE.md` file in the root directory containing the diagrams and explanations.
*   Update `README.md` with a brief project overview.
