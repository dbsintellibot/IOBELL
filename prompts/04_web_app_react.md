# Sub-Prompt 4: Web App (React.js)

**Goal:** Build the React.js Admin Dashboard for School Managers.

**Instructions:**
1.  **Project Setup:**
    *   Initialize a React project using Vite (TypeScript).
    *   Install dependencies: `@supabase/supabase-js`, `react-router-dom`, `tanstack-query` (React Query), `lucide-react`.
    *   Setup UI Library: Install `shadcn/ui` and `tailwindcss`.

2.  **Authentication UI:**
    *   Create a clean Login page.
    *   Implement Auth Context/Provider to handle session state.
    *   Protect routes (Redirect unauthenticated users to Login).

3.  **Dashboard Features:**
    *   **Overview:** Show active bells, next scheduled ring, and system status.
    *   **Bell Management:** List registered ESP32 devices and their online/offline status.
    *   **Profile Editor:**
        *   CRUD operations for `bell_profiles` (e.g., Normal, Exam).
        *   UI to set times for each day of the week within a profile.
    *   **Audio Manager:**
        *   File upload interface for announcements.
        *   List uploaded files with playback preview.
    *   **Emergency Trigger:**
        *   A prominent "PANIC / EMERGENCY" button that sends an immediate override command.

4.  **State Management:**
    *   Use React Query for fetching data from Supabase.
    *   Ensure real-time updates (optional: use Supabase Realtime for device status).

**Output:**
*   Project structure.
*   Key component code (Auth, Dashboard, Scheduler).
*   Routing configuration.
