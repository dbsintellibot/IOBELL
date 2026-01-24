# AutoBell Mobile App Feature Parity & Build Prompt

You are an expert React Native and Supabase developer. Your goal is to bring the AutoBell Mobile App (`mobile-app/`) to feature parity with the Web Dashboard (`web-dashboard/`) for School Admin users.

## Project Context
- **Web App:** React (Vite) + Supabase. Source: `web-dashboard/src`
- **Mobile App:** React Native (Expo) + Supabase. Source: `mobile-app/src`
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime).
- **Auth:** Both apps use the same Supabase project. Mobile app uses `AsyncStorage` for persistence.

## Missing Features to Implement in Mobile App

Please implement the following features in the mobile app, referencing the web app's logic where necessary.

### 1. Profile Management (Full CRUD)
**Reference:** `web-dashboard/src/pages/ProfileEditor.tsx`
- **Current State:** Mobile only has a placeholder or simple switcher.
- **Requirement:**
  - Create a `ProfileManagementScreen`.
  - **List Profiles:** Show all `bell_profiles` for the school.
  - **Create/Edit Profile:** Allow adding a new profile name.
  - **Schedule Editor:** Within a profile, allow adding/editing `bell_times`.
    - Fields: Time (TimePicker), Audio File (Dropdown from `audio_files`), Days of Week (Multi-select: Mon-Sun).
  - **Delete Profile:** Remove profile and associated times.
- **Supabase Tables:** `bell_profiles`, `bell_times`.

### 2. Audio File Management
**Reference:** `web-dashboard/src/pages/AudioManager.tsx`
- **Current State:** Missing in mobile.
- **Requirement:**
  - Create an `AudioManagerScreen`.
  - **List Files:** Fetch from `audio_files` table.
  - **Play Preview:** Allow playing the audio file (using `expo-av`).
  - **Upload:** Use `expo-document-picker` to select audio files and upload to Supabase Storage (`audio-files` bucket) and insert record into `audio_files` table.
  - **Delete:** Remove from storage and DB.

### 3. Device Management
**Reference:** `web-dashboard/src/pages/BellManagement.tsx`
- **Current State:** Missing in mobile.
- **Requirement:**
  - Create a `DeviceListScreen`.
  - **List Devices:** Show `bell_devices` (Name, Status, Last Heartbeat).
  - **Register Device:** Implement a modal/screen to claim a device by Serial Number (call `claim_device` RPC).
  - **Status Indicators:** Show Online/Offline based on heartbeat.

### 4. Navigation Updates
- Update `AppNavigator.tsx` to include these new screens.
- Add a bottom tab bar or drawer to access these new sections easily (Dashboard, Profiles, Audio, Devices, Settings).

## Build Instructions (APK)

After implementing the features, prepare the app for an Android APK build.

1. **Configuration:**
   - Ensure `app.json` / `eas.json` is configured correctly.
   - Package name: `com.autobell.app` (or similar).

2. **Build Command:**
   - Provide the command to build the APK using EAS:
     ```bash
     eas build -p android --profile preview
     ```
   - Or locally if preferred:
     ```bash
     npx expo prebuild
     cd android && ./gradlew assembleRelease
     ```

## Execution Plan
1. Analyze `web-dashboard` code for the specific logic of the features above.
2. Install necessary React Native dependencies (e.g., `expo-document-picker`, `expo-av`, `datetimepicker`).
3. Implement the screens one by one.
4. Verify functionality against Supabase.
5. Generate the APK.

Please proceed with the implementation.
