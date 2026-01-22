# SaaS Transformation & Super Admin Implementation Prompt

## Context
The current AutoBell system has a basic multi-tenant structure (`schools` table exists), but it lacks a centralized management layer for a SaaS business model. We need to introduce a **Super Admin** role to manage schools, users, and device inventory, and enforce a "sold by us" device provisioning policy.

## Objectives
1.  **SaaS Architecture**: rigorous enforcement of multi-tenancy with a central Super Admin.
2.  **User Management**: Super Admin controls the creation of Schools and School Admins (one per school).
3.  **Device Provisioning**: School Admins can only register devices that exist in the system's inventory (added by Super Admin).
4.  **Subscription Management**: Super Admin tracks yearly payments and controls access based on subscription status.

## Detailed Requirements

### 1. Database Schema Updates
*   **Users Table**:
    *   Update `role` column to support `'super_admin'`.
    *   Existing roles: `'admin'` (School Admin), `'operator'` (School Staff).
*   **Schools Table**:
    *   Add `subscription_end_date` (date/timestamp).
    *   Add `max_devices` (integer) - optional limit on devices per school.
    *   Add `payment_status` (text) - e.g., 'paid', 'due', 'overdue'.
*   **Device Inventory Table** (New):
    *   Table Name: `device_inventory`
    *   Columns:
        *   `id` (uuid, PK)
        *   `serial_number` (text, unique, user-facing claim code)
        *   `mac_address` (text, unique, technical identifier)
        *   `batch_id` (text, optional for tracking)
        *   `claimed_at` (timestamp)
        *   `claimed_by_school_id` (uuid, FK to schools)
        *   `created_at` (timestamp)
    *   **Logic**: When a School Admin "registers" a device, they input the `serial_number`. The system checks this table. If valid and unclaimed, it creates the entry in `bell_devices` (or updates a unified table) and links it to the school.

### 2. Authentication & Roles
*   **Super Admin**:
    *   Has access to a new **Super Admin Dashboard**.
    *   Can see all schools, users, and devices.
    *   Can create new Schools.
    *   Can create the initial "School Admin" user for a school.
    *   Can update subscription details.
*   **School Admin** (One per school):
    *   Existing `admin` role.
    *   Can manage bells, schedules, and profiles for their school.
    *   **Restriction**: Cannot create other admins (enforce "one user per school" policy for admin access, though `operator` accounts for staff might be allowed later, focus on 1 admin for now).

### 3. Workflows

#### A. School & User Creation (Super Admin Only)
1.  Super Admin logs in.
2.  Goes to "School Management".
3.  Clicks "Create School".
4.  Enters: School Name, Address, Subscription Details.
5.  Enters: School Admin Email & Initial Password.
6.  System creates `school` record -> creates `auth.user` -> creates `public.user` linked to school with `role='admin'`.

#### B. Device Provisioning (Sold by Us)
1.  **Inventory Stocking (Super Admin)**:
    *   Super Admin uploads/enters a list of `{ SerialNumber, MacAddress }`.
    *   stored in `device_inventory`.
2.  **Device Claiming (School Admin)**:
    *   School Admin logs in.
    *   Goes to "Bells" -> "Add Bell".
    *   **Old Flow**: Enter Name + MAC.
    *   **New Flow**: Enter Name + **Serial Number**.
    *   System validates `Serial Number` in `device_inventory`.
        *   If invalid: Error "Invalid Serial Number".
        *   If claimed: Error "Device already claimed".
        *   If valid:
            *   Mark `device_inventory` as claimed by this school.
            *   Create entry in `bell_devices` with the retrieved `mac_address` and input `name`.

### 4. Frontend Changes (Web Dashboard)
*   **Routes**:
    *   `/super-admin/*` (Protected, requires `super_admin` role).
    *   `/dashboard/*` (Existing, for School Admins).
*   **Super Admin Pages**:
    *   `Overview`: Stats (Total Schools, Active Subs, Total Devices).
    *   `Schools`: List, Create, Edit (manage sub).
    *   `Inventory`: List unclaimed/claimed devices, Add new stock.
*   **School Admin Pages**:
    *   Update `DeviceRegistrationModal` to ask for Serial Number instead of MAC.

### 5. Security (RLS)
*   Update RLS policies to allow `super_admin` to view/edit ALL records.
*   Ensure `device_inventory` is only readable/writable by `super_admin` (except for the "claim" function which might be a Postgres function with `SECURITY DEFINER` to allow school admins to claim safely without direct table access).

## Implementation Steps Plan
1.  Create migration for schema changes (`device_inventory`, `schools` updates, `users` role check).
2.  Create "claim_device" database function (secure transaction).
3.  Update RLS policies.
4.  Build Super Admin Dashboard Layout & Pages.
5.  Refactor `DeviceRegistrationModal` for Serial Number flow.
6.  Seed a Super Admin user.
