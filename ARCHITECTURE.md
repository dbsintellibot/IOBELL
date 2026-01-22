# AutoBell System Architecture

## 1. High-Level Architecture

The AutoBell system is a SaaS-based IoT solution for managing school bells. It consists of a frontend web dashboard, a mobile application, a backend powered by Supabase, and ESP32-based IoT controllers installed in schools.

### Architecture Diagram

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

    %% Client Interactions
    Web -->|REST / Realtime| Backend
    Mobile -->|REST / Realtime| Backend

    %% IoT Interactions
    ESP32 -->|HTTPS / WSS| Backend
    ESP32 -->|GPIO| Bell
    ESP32 -->|UDP| NTP

    %% Backend Internals
    Auth -.->|Secures| DB
    Auth -.->|Secures| Storage
    Edge -.->|Logic| DB
```

## 2. Data Flow

### A. Bell Schedule Update
1.  **Creation:** A School Admin creates or modifies a bell schedule via the **Web App** or **Mobile App**.
2.  **Storage:** The application sends the schedule data to the **Supabase PostgreSQL Database**.
3.  **Notification:** Supabase **Realtime** (or an Edge Function) detects the database change.
4.  **Sync:**
    *   The **ESP32** device, subscribed to its specific configuration channel via Supabase Realtime, receives the update payload immediately.
    *   Alternatively, the ESP32 polls the database periodically (fallback) to fetch the latest `schedule_json`.
5.  **Action:** The ESP32 parses the JSON schedule, updates its local scheduler, and persists it to non-volatile storage (SPIFFS/LittleFS) for offline reliability.

### B. Emergency Trigger (Priority Handling)
1.  **Trigger:** An authorized user presses the "Emergency Ring" button on the **Mobile/Web App**.
2.  **Transmission:** The app invokes a Supabase **Edge Function** (or writes to a specific `commands` table) with high priority.
3.  **Propagation:**
    *   The command is pushed to the target ESP32 via **WebSockets (Supabase Realtime)** for sub-second latency.
4.  **Execution:**
    *   The ESP32 receives the command, overrides any active schedule, and immediately triggers the physical bell relay.
    *   The device reports the execution status ("Success" or "Error") back to the database.

### C. ESP32 Authentication & Configuration
1.  **Boot:** The ESP32 powers up and connects to Wi-Fi.
2.  **Time Sync:** The device queries an **NTP Server** to establish accurate system time.
3.  **Authentication:**
    *   The device sends a request to Supabase Auth (or an Edge Function) using a **Device ID** and a **Secret Token** (provisioned during manufacturing/setup).
    *   Upon verification, it receives a **Session Token (JWT)**.
4.  **Config Retrieval:**
    *   Using the JWT, the ESP32 queries the `devices` and `schedules` tables via the Supabase API (REST/Graphql).
    *   **Row Level Security (RLS)** ensures the device can only read its own configuration.

## 3. Security Strategy

### User Authentication
*   **Role-Based Access:**
    *   **School Admins:** Can manage schedules, devices, and invite operators for their specific school.
    *   **Operators:** Can trigger manual bells/emergencies but cannot modify schedules.
    *   **Super Admins:** Platform management (SaaS owner).
*   **Implementation:** Supabase Auth (GoTrue) handling Email/Password logins.

### Device Authentication
*   **Identity:** Each ESP32 is assigned a unique `device_id` and a secure `api_key` or `device_secret`.
*   **Mechanism:**
    *   Devices authenticate via a secure Edge Function or direct Auth API to exchange credentials for a scoped JWT.
    *   Alternatively, simple RLS policies can check the `device_id` and `secret` headers if using direct DB access (though JWT exchange is preferred for better security).
*   **Transport:** All communication occurs over **TLS (HTTPS/WSS)** to prevent eavesdropping.

### Data Isolation (Multi-Tenancy)
*   **School ID:** Every table (`schedules`, `devices`, `logs`) includes a `school_id` column.
*   **Row Level Security (RLS):**
    *   PostgreSQL RLS policies enforce isolation.
    *   Example Policy: `auth.uid() IN (SELECT user_id FROM school_users WHERE school_id = current_row.school_id)`.
    *   This ensures User A from School X cannot read or write data belonging to School Y.

## 4. Technology Stack

*   **Frontend (Web):** React (Vite), Tailwind CSS, Shadcn UI.
*   **Mobile App:** React Native (Expo).
*   **Backend:** Supabase (PostgreSQL, GoTrue Auth, Storage, Edge Functions).
*   **Firmware:** C++ (PlatformIO / Arduino Framework) for ESP32.
