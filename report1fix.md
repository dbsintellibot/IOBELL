# AutoBell Project Fixes & Completion Prompt (report1fix.md)

## Objective
This prompt guides the implementation of the remaining missing features, minor gaps, and application errors identified in the `report1.md` completeness audit. The primary focus is on completing and hardening the **Data Backup and Restore System** for Super Admins, as well as addressing any lingering edge cases across the platform.

## Context
Based on the `report1.md` audit, the core MVP is highly mature and physical hardware testing has been successfully conducted. The major outstanding item is the completion of the Super Admin backup functionalities and ensuring that the existing School Admin backup/restore system is robust against edge cases and potential errors.

## Tasks to Complete

### 1. Implement Platform-Wide Backup Route (Super Admin)
**Current State**: Only School Admins can export/import backups scoped to their specific `school_id`.
**Required Action**: 
* Follow the specifications in `backup.md` (Section 6.B) to implement the `/super-admin/backups` route.
* **Platform Backup**: Create functionality to fetch and combine all schools' files and databases schema-wide.
* **Targeted Backup**: Add a school selector dropdown so the Super Admin can download a standard school backup identical to the School Admin's version, bypassing the need for specific school logins.
* **System Restore**: Implement the logic to restore the entire platform database securely.

### 2. Audit & Fix Backup Restore System Errors
**Current State**: The School Admin backup/restore (`BackupSettingsPanel` and `restore_school_data` RPC) is implemented but needs hardening against potential failures and edge cases.
**Required Action**:
* **MAC Address Conflicts**: Verify and fix logic to prevent or properly handle MAC address collisions during a restore if a device is already registered to another school.
* **Orphaned Records & Cascading Deletes**: Ensure that when a backup is restored in "Overwrite mode", all cascading deletes function correctly without leaving orphaned `bell_times`, `device_logs`, or `command_queue` records.
* **Storage Path Resolution**: Validate that restored audio and branding files correctly rewrite their relative storage paths (`[school_id]/[file_id].mp3`) to the target school's directory without breaking dashboard playback.
* **Active Profile Fallbacks**: Ensure the restore logic guarantees exactly *one* profile is marked as active. If none are active in the backup, default the first chronological profile to active to maintain ESP32 schedule heartbeats.
* Fix any other silent errors or UI glitches present during the extraction and upload of `.abk` files in `backupService.ts`.

### 3. Verify Hardware & Mobile Readiness
**Current State**: Firmware has persistent debounce and buzzer logic, and the mobile app has an APK profile.
**Required Action**:
* Conduct a final review of the ESP32 code to ensure no memory leaks (Heap usage) occur during prolonged network disconnections or continuous audio playback.
* Verify the React Native mobile app correctly handles OTA profile synchronization and optimistic updates without crashing.

## Instructions for AI Assistant
1. Read the implementation details in `backup.md` to understand the precise requirements for the Super Admin backup page and PostgreSQL RPCs.
2. Review `web-dashboard/src/lib/backupService.ts` and `supabase/migrations/` for existing backup/restore logic.
3. Apply the fixes and implementations described above.
4. If modifying database schemas or RPCs, create the appropriate Supabase migration files.
5. Provide a summary of the fixes applied and any manual testing steps required to verify the backup restoration's integrity.
