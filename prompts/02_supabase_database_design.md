# Sub-Prompt 2: Supabase Database Design

**Goal:** Design and implement the database schema in Supabase with Row Level Security (RLS).

**Instructions:**
1.  **Schema Definition:**
    *   Create a SQL migration file (`supabase/migrations/0000_initial_schema.sql`) defining the following tables:
        *   `schools`: Stores school details (name, address, subscription_status).
        *   `users`: Extends `auth.users` (full_name, role [admin/operator], school_id).
        *   `bell_devices`: ESP32 devices (mac_address, name, status, last_heartbeat, school_id).
        *   `bell_profiles`: Schedule profiles (e.g., "Normal Day", "Exam Day").
        *   `bell_times`: Specific bell timings linked to a profile (time, day_of_week, audio_file_id).
        *   `audio_files`: Metadata for uploaded MP3s (name, storage_path, duration, school_id).
        *   `device_logs`: Logs from ESP32 for debugging (device_id, message, level).

2.  **Relationships:**
    *   Define foreign keys to link Users -> Schools, Devices -> Schools, etc.
    *   Ensure `ON DELETE CASCADE` is used where appropriate (e.g., deleting a profile deletes its times).

3.  **Row Level Security (RLS):**
    *   Enable RLS on all tables.
    *   Write policies that ensure:
        *   Users can only access data belonging to their assigned `school_id`.
        *   School Admins can manage users within their school.
        *   Devices can only read their own configuration and write their own logs.

4.  **Indexes:**
    *   Add indexes for frequently queried fields (e.g., `school_id`, `device_id`).

**Output:**
*   The complete SQL file content.
*   Instructions on how to apply it to the Supabase project.
