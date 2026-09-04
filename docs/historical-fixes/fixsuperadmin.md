# Instruction Guide: AutoBell Super Admin Panel Fixes & Enhancements

This document details the step-by-step specifications for correcting the deficiencies, UX flaws, and security gaps identified in the Super Admin Audit. 

---

## Phase 1: Database & RPC Security Upgrades

### 1.1 Bulk Device Provisioning RPC
Create a migration `supabase/migrations/20260707000001_bulk_device_inventory.sql` containing an RPC function to register a list of hardware devices:
* **Function**: `bulk_register_inventory(p_devices jsonb)`
* **Security**: Enforce `is_super_admin()` check.
* **Logic**: Iterates over a JSON array of `{serial_number, mac_address}`. Uses `INSERT INTO public.device_inventory ... ON CONFLICT (mac_address) DO NOTHING`. Returns counts of inserted, skipped, and invalid records.

### 1.2 User Invitation / Re-creation Trigger
Create an RPC `recreate_auth_user_record(p_user_id uuid, p_email text)`:
* **Security**: `SECURITY DEFINER`, restricted to `is_super_admin()`.
* **Logic**: Re-inserts corresponding entries into `auth.users` and `auth.identities` with a randomized password hash if they are missing after a platform restore. This resolves the **Auth Synchronization Gap**.

---

## Phase 2: Overview Dashboard Refinement

Modify [Overview.tsx](file:///c:/My%20Drive/My%20Drive/AutoBell/web-dashboard/src/pages/super-admin/Overview.tsx):

### 2.1 Correct Device Metrics
* Change statistics query to pull both total registered devices and active online devices:
  ```typescript
  const [
    { count: schoolsCount },
    { count: totalDevicesCount },
    { data: activeDevicesData },
    { count: inventoryCount },
    { count: usersCount }
  ] = await Promise.all([
    supabase.from('schools').select('*', { count: 'exact', head: true }),
    supabase.from('bell_devices').select('*', { count: 'exact', head: true }),
    supabase.from('bell_devices').select('id, status, last_heartbeat'),
    supabase.from('device_inventory').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true })
  ])
  ```
* Calculate the actual count of online devices using:
  ```typescript
  const onlineCount = activeDevicesData?.filter(d => {
    const isOnlineByStatus = d.status === 'online'
    const isOnlineByHeartbeat = d.last_heartbeat 
      ? Date.now() - new Date(d.last_heartbeat).getTime() <= 5 * 60 * 1000 
      : false
    return isOnlineByStatus || isOnlineByHeartbeat
  }).length || 0
  ```
* Split the device stat card to show: `"Active Devices: {onlineCount} / {totalDevicesCount}"`.

### 2.2 Dynamic Network Health Widget
* Replace the hardcoded "Network Healthy" badge with a dynamic indicator:
  * If percentage of online devices = 100%: **Network Optimal** (Green).
  * If percentage between 75% and 99%: **Network Healthy** (Green).
  * If percentage between 40% and 74%: **Degraded Service** (Amber).
  * If percentage < 40%: **Critical Network Outage** (Red).

### 2.3 Global Live Activity Log
* Add a scrolling log feed at the bottom of the overview showing the latest 10 rows from the `device_logs` table (across all schools).
* Implement real-time subscription via Supabase real-time channel (`supabase.channel('public:device_logs')`) to append new logs as they occur.

---

## Phase 3: School Management Overhaul

Modify [SchoolManagement.tsx](file:///c:/My%20Drive/My%20Drive/AutoBell/web-dashboard/src/pages/super-admin/SchoolManagement.tsx):

### 3.1 School Search, Filtering & Pagination
* Add a search input at the top of the school list to filter results by name, address, or campus.
* Add subscription status filters (`Active`, `Suspended`).
* Implement pagination (10 schools per page).

### 3.2 School Edit & Tier Limits Dialog
* Add an "Edit Settings" button on each school list item.
* Clicking it opens a modal allowing the Super Admin to:
  * Update School Name, Campus, and Address.
  * Adjust `max_devices` limit (number input).
  * Update `payment_status` (dropdown: `paid`, `unpaid`, `trial`).
  * Suspend/Deactivate School: A toggle that flips a boolean `is_suspended` in the database.

---

## Phase 4: User Administration Panel Enhancements

Modify [UserManagement.tsx](file:///c:/My%20Drive/My%20Drive/AutoBell/web-dashboard/src/pages/super-admin/UserManagement.tsx):

### 4.1 Search, Role Modification & Deletion
* Add search (by email, name, or school name) and pagination.
* In the table actions, add:
  * **Role Selector**: A dropdown to switch role between `admin` and `operator`.
  * **Password Reset**: A button triggering Supabase's `auth.resetPasswordForEmail`.
  * **Delete User**: A button calling a confirmation dialog and deleting the user from both `public.users` and `auth.users` tables securely.

---

## Phase 5: Inventory Provisioning & OTA Tracking

Modify [InventoryManagement.tsx](file:///c:/My%20Drive/My%20Drive/AutoBell/web-dashboard/src/pages/super-admin/InventoryManagement.tsx):

### 5.1 Bulk Import UI
* Add a "Bulk Upload CSV" panel.
* Add drag-and-drop file interface parsing CSV data matching:
  ```csv
  serial_number,mac_address
  AB-1001,00:1A:2B:3C:4D:5E
  AB-1002,00:1A:2B:3C:4D:5F
  ```
* Highlight formatting issues or invalid MACs before sending them to the `bulk_register_inventory` RPC.

### 5.2 Device Search & Table Layout
* Convert card-grid into a clean, searchable datatable.
* Add filtering by **Online/Offline Status**, **Assigned School**, and **Device Board Type**.

---

## Phase 6: School Admin Impersonation

Implement impersonation in the routing and state management:

### 6.1 Auth Context Integration
Update [AuthContext.tsx](file:///c:/My%20Drive/My%20Drive/AutoBell/web-dashboard/src/context/AuthContext.tsx) to support temporary impersonation:
* Add state: `impersonatedSchoolId: string | null` and `isImpersonating: boolean`.
* Add functions:
  ```typescript
  impersonateSchool: (targetSchoolId: string) => {
    setImpersonatedSchoolId(targetSchoolId)
    setRole('admin') // Emulate school admin role
  },
  stopImpersonation: () => {
    setImpersonatedSchoolId(null)
    // Refetch original super_admin details
    fetchUserDetails(user.id)
  }
  ```
* Make all pages (e.g. `Overview`, `BellManagement`, `AudioManager`) query tables using `impersonatedSchoolId ?? schoolId` so they display mock tenant data.

### 6.2 Frontend Impersonation Controls
* On [SchoolManagement.tsx](file:///c:/My%20Drive/My%20Drive/AutoBell/web-dashboard/src/pages/super-admin/SchoolManagement.tsx), add a "Login As" (Impersonate) button next to each school.
* When active, display a persistent, floating alert banner at the top of the viewport:
  > **⚠️ Impersonating [School Name]**. You are viewing the dashboard as a school administrator. [Return to Super Admin Panel]
* Clicking the return button triggers `stopImpersonation()` and redirects back to `/super-admin`.

---

## Phase 7: Verification Plan

### Automated Tests
Run script-based validation or custom console checks:
* Verify MAC Address formats in CSV uploads.
* Verify user role changes propagate to RLS evaluations.

### Manual Verification
* Register a duplicate MAC address in CSV and verify the inline validator blocks it.
* Trigger impersonation for a school and confirm only that school's devices, profiles, and audio directories are accessible.
* Unassign a device and confirm it immediately drops off the school view and populates the unassigned inventory.
