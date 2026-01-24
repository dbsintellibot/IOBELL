# Super Admin Enhancement: User Creation & Management

## Objective
Enhance the Super Admin Panel to support the creation and management of "School/Factory Users" (School Admins). These users must be able to:
1.  Log in with a specific email and password.
2.  Manage bell schedules (timing).
3.  Manage at least 5 bell profiles.
4.  Upload MP3 files for each bell.

## Requirements

### 1. UI Enhancements (Web Dashboard)
-   **Location**: `src/pages/super-admin/`
-   **New Component/Page**: Create `UserManagement.tsx` (or enhance `SchoolManagement.tsx`) to handle user creation.
-   **Form Fields**:
    -   **Email**: The login email for the new user.
    -   **Password**: The initial login password.
    -   **School/Factory Name**: Select an existing school or create a new one.
    -   **Role**: Default to `school_admin`.
-   **List View**: Display existing users, their associated school, and role.

### 2. Backend Logic (Supabase)
-   **User Creation**:
    -   Since the client-side `supabase.auth.signUp` logs the user in immediately (which we don't want for a Super Admin creating *other* users), we need a secure method.
    -   **Solution**: Create a Supabase Edge Function `create-user` (or a PostgreSQL Database Function `setup_school_admin`) that:
        1.  Accepts `email`, `password`, `school_name` (or `school_id`).
        2.  Creates the user in `auth.users`.
        3.  Creates the `schools` entry (if new).
        4.  Inserts the user into `public.users` with the correct `school_id` and `role = 'school_admin'`.
-   **Permissions**: Ensure only users with `role = 'super_admin'` can call this function.

### 3. Verification & Capabilities
-   **Bell Profiles**: Ensure the `bell_profiles` table and UI supports creating at least 5 profiles per school.
-   **Audio Files**: Ensure `audio_files` table allows MP3 uploads linked to the user's `school_id`.
-   **Schedules**: Ensure the `BellManagement` page works correctly for these new users (filtering by their `school_id`).

## Implementation Steps
1.  **Database**: Verify `public.users` has `school_id` and `role`.
2.  **Edge Function / RPC**: Implement the user creation logic.
3.  **Frontend**: Build the UI in the Super Admin panel to call this logic.
4.  **Testing**:
    -   Create a user "factory1@test.com".
    -   Log in as this user.
    -   Create 5 bell profiles.
    -   Upload an MP3.
    -   Set a schedule.

## Example Prompt for Developer
"Please implement the User Creation feature for the Super Admin panel. Create a secure Database Function or Edge Function to allow Super Admins to create new 'School Admin' users with a predefined email and password. Update the `SchoolManagement` page to include a form for this, automatically linking the new user to a school. Verify that these new users can log in and manage their own bell schedules and audio files."
