# Prompt: Unassign / Retire Bell Devices (Super Admin)

You are working on the AutoBell SaaS backend, web dashboard, and firmware. The goal is to give **Super Admin** users full control to **unassign** a physical bell device from a school and optionally **retire/delete** it when it is damaged or permanently out of service.

This feature must integrate cleanly with the existing **device_inventory → bell_devices → schools** flow and preserve the concept of **“detected unassigned devices”** that can later be claimed by a different school.

---

## High‑Level Goals

1. **Super Admin can unassign a device from its current school**
   - Break the association between a physical device and a specific school.
   - Return the hardware back to the global **unassigned device inventory** so it behaves as a newly detected device.
   - Ensure that, after unassignment, a different school admin can claim it again using the existing onboarding flow (serial number).

2. **Super Admin can retire/delete a device that is damaged or burnt**
   - If a device is physically destroyed or permanently unusable, Super Admin can remove it from active devices.
   - Retired devices must not appear in:
     - The list of active devices for any school.
     - The “detected unassigned devices” list.
   - Historical data (logs, audit trails) should be preserved as much as is practical, even if the active device record is removed.

3. **Respect existing multi‑tenant and RLS rules**
   - Only **Super Admin** users can perform unassign or retire actions across tenants.
   - Regular school admins and operators cannot unassign a device from their school or retire it.
   - All new functions must align with existing helpers like `is_super_admin()` and existing RLS policies.

---

## Current Model (Reference)

Use the existing schema and functions as the baseline:

- `public.device_inventory`
  - Contains factory‑level hardware records.
  - `serial_number`, `mac_address`, `claimed_at`, `claimed_by_school_id`.
  - Unassigned devices are those with `claimed_at IS NULL` and `claimed_by_school_id IS NULL`.

- `public.bell_devices`
  - Live devices attached to a particular school.
  - `mac_address`, `name`, `status`, `school_id`, `last_heartbeat`, etc.
  - Tied into schedules, command queue, and device logs.

- `claim_device(p_serial_number, p_device_name)`
  - For a school **admin** to claim a device from `device_inventory`.
  - Marks the inventory row as claimed and creates a `bell_devices` row.

- Super Admin access is already granted via:
  - `is_super_admin()` helper.
  - Policies: `"Super admin full access bell_devices"`, `"Super admin full access device_inventory"`, etc.

The new unassign/retire flows should **reuse and complement** this design.

---

## Feature 1: Unassign Device Back to Unassigned Inventory

### Behavior

When a Super Admin unassigns a device:

- The device is **removed from the school** while keeping the hardware available for future use.
- The corresponding `device_inventory` row is reset to the “unassigned” state.
- The bell device **no longer appears** in that school’s device list.
- The hardware **reappears** wherever “detected unassigned devices” are surfaced (e.g. claim/register screen) and can later be claimed by another school.

### Backend Requirements

1. **New RPC: `unassign_device(p_device_id uuid)`**
   - Security:
     - `SECURITY DEFINER`.
     - Only callable when `is_super_admin()` returns true.
   - Inputs:
     - `p_device_id`: ID from `public.bell_devices.id`.
   - Steps:
     1. Look up the bell device:
        - Get `mac_address`, `school_id`, and any other relevant fields.
     2. Look up the corresponding `device_inventory` row by `mac_address`.
        - If none exists, raise a descriptive error (data integrity issue).
     3. Reset inventory record to “unassigned”:
        - `claimed_at = NULL`.
        - `claimed_by_school_id = NULL`.
     4. Delete or detach the `bell_devices` row:
        - Preferred: **delete** from `public.bell_devices` so that school‑scoped queries no longer see it.
        - Rely on `ON DELETE CASCADE` to clean up related rows (e.g. `device_logs`, `command_queue`) as defined in the schema.
     5. Optionally, return a JSON payload summarizing:
        - The previous school.
        - The device that was unassigned.
        - The updated inventory state.

2. **RLS & Permissions**
   - Do not weaken existing RLS policies.
   - The function runs as `SECURITY DEFINER` and enforces `is_super_admin()` internally.
   - School admins **must not** be able to call this function directly.

3. **Edge Cases**
   - If a device is already unassigned or missing from `bell_devices`, return a safe, clear error.
   - If `device_inventory` is inconsistent (no matching row), log or raise an explicit error for manual intervention.

### Web Dashboard UX

Update the **Super Admin** views (or create a new page if needed) so that:

- Super Admin can see a **global list of devices** (across all schools).
- For each device that is currently assigned to a school:
  - Show an **“Unassign”** action.
  - Clicking the action should:
    - Show a confirmation dialog such as:
      - “Unassign this device from School X? It will return to the unassigned inventory and can be claimed by another school.”
    - On confirm, call the `unassign_device` RPC.
    - On success, refresh the list and show a success notification.
- After unassignment:
  - The device should no longer appear under the school’s “Bell Management” page.
  - It should appear in the **unassigned devices**/claiming UI.

---

## Feature 2: Retire / Delete Damaged or Burnt Devices

### Behavior

When a physical unit is damaged, burnt, or permanently out of service:

- Super Admin can **retire** the device so it will never be offered for claiming again.
- Retired devices should not be visible in:
  - School device lists.
  - Unassigned/detected device lists.
- Historical information (logs, audit trails) should be preserved as is practical for debugging and bookkeeping.

### Backend Requirements

1. **Inventory‑Level Retirement**
   - Extend `public.device_inventory` with a simple retirement mechanism, for example:
     - Add columns:
       - `retired_at timestamp with time zone`.
       - `retired_reason text` (optional, e.g. "burnt", "damaged", "lost").
   - A device is considered **retired** when `retired_at IS NOT NULL`.
   - Retired devices:
     - Must be excluded from any “unassigned/detected” list.
     - Should not be claimable by `claim_device`.

2. **New RPC: `retire_device(p_device_id uuid, p_reason text)`**
   - Security:
     - `SECURITY DEFINER`, `is_super_admin()` check.
   - Inputs:
     - `p_device_id`: ID in `public.bell_devices`.
     - `p_reason`: free‑form reason, nullable but recommended.
   - Steps:
     1. Look up the bell device and associated inventory row by `mac_address`.
     2. If the device is currently assigned to a school:
        - Optionally reuse the unassign logic (or perform equivalent steps inline) to detach from the school.
     3. Update the inventory row:
        - Set `retired_at = now()` (if not already set).
        - Set `retired_reason = p_reason`.
        - Set `claimed_at = NULL` and `claimed_by_school_id = NULL` to fully detach it.
     4. Delete the bell device row from `public.bell_devices`.
     5. Return a JSON summary including the reason and prior associations.

3. **Blocking Claims on Retired Devices**
   - Update `claim_device(p_serial_number, p_device_name)` so that:
     - If the inventory record has `retired_at IS NOT NULL`, raise an error such as `"Device has been retired and cannot be claimed"`.
   - Ensure any UI that lists unassigned devices filters out retired ones.

### Web Dashboard UX

- Super Admin UI should offer a **“Retire/Delete Device”** action, separate from “Unassign”.
- Recommended UX:
  - For each device, show:
    - “Unassign from school” (returns hardware to unassigned pool).
    - “Retire/Delete (damaged/burnt)” (permanent).
  - Retire action flow:
    - Ask for confirmation with clear warnings:
      - “This device will be retired and can no longer be assigned to any school.”
    - Optionally collect a short reason (dropdown or text input).
    - Call `retire_device` RPC and show success/failure feedback.

---

## Integration with “Detected Unassigned Devices”

Wherever you currently list “detected unassigned devices” (e.g. the registration/claim flow):

- **Include** devices that:
  - Exist in `device_inventory`.
  - Have `claimed_at IS NULL` and `claimed_by_school_id IS NULL`.
  - Have `retired_at IS NULL` (if the retirement fields are added).

- **Exclude** devices that:
  - Are already claimed (`claimed_at IS NOT NULL`).
  - Are retired (`retired_at IS NOT NULL`).

After implementing `unassign_device` and `retire_device`, verify that:

- Unassigned devices reappear correctly in this list.
- Retired devices never appear again, regardless of prior state.

---

## Validation Checklist

1. As Super Admin:
   - Unassign a device from School A.
   - Confirm:
     - It disappears from School A’s device list.
     - It appears in the unassigned/detected devices list.
     - A different school admin can claim it successfully.

2. As Super Admin:
   - Retire a device (damaged/burnt).
   - Confirm:
     - It disappears from all school device lists.
     - It does not appear in the unassigned/detected devices list.
     - `claim_device` rejects attempts to reclaim it.

3. Permissions:
   - Confirm that regular admins/operators cannot call unassign/retire RPCs.
   - Confirm that existing RLS policies remain effective and Super Admin access is preserved.

