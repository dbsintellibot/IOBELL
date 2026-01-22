# Sub-Prompt 3: Supabase Backend Logic

**Goal:** Configure Storage, Auth triggers, and any necessary backend logic.

**Instructions:**
1.  **Storage Configuration:**
    *   Create a storage bucket named `audio-files`.
    *   Set up storage policies:
        *   Authenticated users can upload/read files for their school.
        *   Devices can read files (public or signed URL strategy).
        *   Restrict file types to audio (MP3).

2.  **Database Triggers/Functions:**
    *   **User Creation Handler:** Create a PostgreSQL function and trigger to automatically insert a row into the `public.users` table when a new user signs up via `auth.users`.
    *   **Device Status Update:** (Optional) A function to update device status based on heartbeat.

3.  **Edge Functions (if needed):**
    *   Determine if any complex logic requires Supabase Edge Functions (e.g., processing a schedule change and notifying devices via push, or formatting the JSON for the device). If simple database polling is used by ESP32, this might not be needed yet, but consider it for "Emergency" push.

4.  **Seed Data:**
    *   Generate a `seed.sql` file with:
        *   1 Test School.
        *   1 Admin User, 1 Operator User.
        *   1 Test Device.
        *   Sample Profiles and Bell Times.

**Output:**
*   SQL scripts for Storage policies and Triggers.
*   `seed.sql` content.
