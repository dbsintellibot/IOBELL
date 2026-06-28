## Admin OTA Rights & Device Renaming

### Goal
Define behavior changes so that:
- OTA update rights move from the Admin panel to the Super Admin panel.
- Device names (both assigned and unassigned devices) can be renamed only from the Super Admin panel.

### 1. OTA Update Rights Transfer
- OTA update actions must be available only in the Super Admin panel.
- Admin panel must not expose any control to trigger OTA updates.
- If an Admin user previously had access to OTA:
  - Remove or hide the OTA menu item/button from the Admin UI.
  - If any deep-link or legacy route is opened by an Admin, show an error/permission message:
    - "OTA updates can only be performed from the Super Admin panel."
- Super Admin panel must provide full OTA functionality:
  - List eligible devices for OTA.
  - Select one or multiple devices.
  - Trigger OTA update.
  - View update status and history, as supported by the backend.

### 2. Device Name Renaming in Super Admin
- Super Admin panel must allow renaming device names for:
  - Assigned devices (linked to customers/users).
  - Unassigned devices (not yet linked).
- Renaming behavior:
  - Device list in Super Admin shows a name field for each device.
  - Super Admin can edit the name inline or via an edit dialog.
  - On save, the new name is persisted via the backend API.
  - Validation: name must be non-empty and within allowed length/characters as defined by the existing system rules.
- Admin panel:
  - Must not allow device name changes anymore if such an option previously existed.
  - Device names shown in Admin must always reflect the latest name set by Super Admin.

### 3. Permissions Summary
- Super Admin:
  - Can trigger OTA updates for devices.
  - Can rename any device (assigned or unassigned).
- Admin:
  - Cannot trigger OTA updates.
  - Cannot rename devices.
