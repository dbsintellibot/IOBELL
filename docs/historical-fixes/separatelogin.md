## Separate Super Admin and Admin Logins

### Goal
Define clear, independent, and secure behavior for:
- Super Admin login: **muddasirh@gmail.com**
- School Admin login: **digitapbs@gmail.com**

So that:
- Each account has its own permissions and data scope.
- Dashboards, actions, and data never mix between the two roles.

---

### 1. Accounts and Roles (Supabase)

- **Super Admin (platform owner)**
  - Email: `muddasirh@gmail.com`
  - Role in `public.users.role`: `super_admin`
  - Must be promoted using:
    - `SELECT setup_super_admin('muddasirh@gmail.com');`
  - This account manages:
    - Global schools
    - Global users
    - Global device inventory (assigned + unassigned)
    - OTA updates and device retirement/unassignment

- **School Admin (tenant-level admin)**
  - Email: `digitapbs@gmail.com`
  - Role in `public.users.role`: `admin`
  - Must be created/linked via one of:
    - `register_new_school(...)` (creates school + admin)
    - `create_school_admin(...)` (creates admin for an existing school)
  - This account manages only its **own school** data.

- **Important rules**
  - Never reuse the same email for both roles.
  - Each email must appear once in `auth.users` and once in `public.users` with a single role.

---

### 2. Web Dashboard Login Flow

- There is **one login form** (email + password) using Supabase Auth.
- After login, the frontend reads `public.users.role` for the current user and:
  - If role = `super_admin` → redirect to `/super-admin`
  - Else (`admin` or `operator`) → redirect to `/dashboard`

- Route protection:
  - `/super-admin/**` routes require `role === 'super_admin'`.
  - `/dashboard/**` routes are for `admin` / `operator`.
  - If an admin tries to open a super admin route:
    - They are redirected to `/dashboard`.
  - If a super admin tries to open any `/dashboard` route:
    - They are redirected to `/super-admin`.

Result: **UI for both accounts is completely separated** even though they share the same login screen.

---

### 3. Data Isolation and Devices

Backend (Supabase) enforces isolation:

- **Super Admin**
  - Has dedicated policies: `Super admin full access ...` on:
    - `users`, `schools`, `device_inventory`, `bell_devices`,
    - `audio_files`, `bell_profiles`, `bell_times`,
    - `device_logs`, `command_queue`.
  - Can see:
    - All schools and users.
    - All devices across schools.
    - All **unassigned** inventory (`device_inventory` where `claimed_at IS NULL`).

- **School Admin**
  - Policies restrict access using `get_my_school_id()` and `role = 'admin'`.
  - Can see and manage:
    - Only users in their school.
    - Only devices (`bell_devices`) where `school_id = get_my_school_id()`.
    - Only their school’s profiles, times, audio files, and logs.
  - **Cannot** see global unassigned inventory.

Frontend pages follow this split:

- Super Admin:
  - `/super-admin/inventory` shows:
    - Unassigned inventory for all schools.
    - All bell devices across all schools.
    - Actions: assign, unassign, retire, rename, OTA.
- School Admin:
  - `/dashboard/**` pages show only their school’s devices and schedules.
  - No global inventory, no cross-tenant data.

---

### 4. Independence and Security Notes

- Each login session is tied to a single Supabase user ID.
- When logging out, the web app:
  - Clears the Supabase session.
  - Clears cached `role`, `school_id`, and permissions.
- Logging in again with a different email creates a clean, separate session.

To keep logins independent and secure:
- Ensure `muddasirh@gmail.com` is always `super_admin`.
- Ensure `digitapbs@gmail.com` is always `admin` for exactly one school.
- Do not share passwords between accounts.
- Do not manually change roles in the database in ways that conflict with this document.

If **Super Admin cannot see devices (assigned or unassigned)**:
- Verify that:
  - `setup_super_admin('muddasirh@gmail.com')` has been run.
  - Latest migrations are applied, especially:
    - `20260122000011_saas_features.sql`
    - `20260220000001_unassign_retire_devices.sql`
  - `public.users.role` for `muddasirh@gmail.com` is exactly `super_admin`.

