# Admin Panel Fixes & Improvements

## Overview
The goal is to differentiate the Super Admin panel from the School Panel, enable school creation with user assignment, and allow assigning devices to schools directly from the Admin Panel. Additionally, we need to fix the Config/Reboot buttons and Last Seen status.

## Plan

### 1. Device Assignment in Admin Panel
- **Current State:** Devices in `device_inventory` can be seen but not assigned to schools manually by Admin. They are only assigned when a School "claims" them via Serial Number.
- **Fix:** Update `InventoryManagement.tsx` to include an "Assign to School" feature.
  - Fetch list of schools.
  - Add "Assign" button next to unassigned devices.
  - Action: Update `bell_devices` (or create if missing) with the selected `school_id` and link to `device_inventory`.

### 2. School & User Management
- **Current State:** `SchoolManagement` only creates a school record. No user is associated.
- **Fix:** 
  - Enhance `SchoolManagement` to optionally create a School Admin user during school creation or link an existing user.
  - Display "Admin User" for each school.

### 3. Fix "Devices not showing in School"
- **Root Cause:** Devices likely have `school_id` as NULL or mismatched.
- **Fix:** The "Assign to School" feature will ensure `school_id` is correctly set, making them appear in the School Panel.

### 4. Fix Config/Reboot Buttons
- **Current State:** Buttons exist but reported as "not working".
- **Verification:** Ensure `command_queue` table exists and permissions allow insertion.
- **Improvement:** Add visual feedback (toast/loading) and maybe a "Command History" to verify it was sent.

### 5. Fix "Last Seen"
- **Current State:** Uses `last_heartbeat`.
- **Fix:** Ensure the field is being updated by the device/backend. If it's a timezone issue, use a proper date formatter (e.g., `date-fns`).

## Implementation Steps

1.  **Modify `InventoryManagement.tsx`**:
    - Fetch `schools`.
    - Add `AssignDeviceModal` or inline dropdown.
    - Implement assignment logic (Update `device_inventory` and `bell_devices`).

2.  **Modify `SchoolManagement.tsx`**:
    - Add "Create User" functionality.

3.  **Review `BellManagement.tsx`**:
    - Verify RLS policies for `command_queue`.
