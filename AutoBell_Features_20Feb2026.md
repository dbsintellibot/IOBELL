 # AutoBell – Feature & Module Overview  
 **Version:** 20 Feb 2026  

 ---

 ## 1. Product Snapshot

 - Cloud-based, multi-tenant **School Bell Management System** (SaaS).
 - Controls **ESP32-based AutoBell devices** that ring bells and announcements.
 - Includes both **Web Dashboard** (desktop) and **Mobile App** (Android via Expo).
 - Designed for **reliability, safety, and ease of use** for schools and madrasas.

 ### Core Value Propositions
 - **Automate all daily bells** with flexible profiles and schedules.
 - **Trigger emergency alerts instantly** from web or mobile.
 - **Monitor devices in real time** (online/offline, health, heartbeats).
 - **Stream or play stored audio** (announcements, Azaan, reminders, etc.).
 - **Multi-school, multi-user**: Super admin portal plus per‑school admins/operators.
 - **Full Data Backup & Restore:** Secure schedules, logs, and audio media from the web dashboard.
 - **Hardware Watchdog:** Auto-recovers the device from freezes to ensure maximum reliability.
 - Optional **backup device service** available with yearly agreement for minimal downtime.

 ---

 ## 2. Platform Components

 ### 2.1 Web Admin Dashboard (React + Supabase)

 - Modern web app for **school admins and operators**.
 - Built with React (Vite, Tailwind, shadcn UI) and Supabase.

 #### Key Dashboard Features
 - **Secure login & roles**
   - Email/password login via Supabase Auth.
   - Roles: **Super Admin**, **School Admin**, **Operator**.
   - Route-level protection so users only see what they are allowed to manage.

 - **Overview Page**
   - At-a-glance metrics:
     - Number of devices, profiles, schools, storage usage.
     - Primary bell device (name, MAC address, location).
     - Online vs total devices.

 - **Bell Management**
   - List of all devices for the school.
   - Status badges: **online / offline / unknown**.
   - Shows MAC address, last heartbeat, volume, and other properties.
   - Device registration (claiming device from inventory or adding new).
   - Device settings configuration via modal dialogs.

 - **Profiles & Schedules**
   - Manage **bell profiles** (e.g. “Normal Day”, “Exam Day”, “Ramadan”, “Weekend”).
   - Configure **per-day schedules**:
     - Time (HH:MM 24‑hour format).
     - Day of week.
     - Linked audio track.
   - Mark one profile as **active** – devices follow the active profile.

 - **Audio Manager**
   - Upload MP3 audio directly from the dashboard.
   - Files stored in **Supabase Storage** with metadata in the database.
   - List view with name, duration and playback preview.
   - Used for bells, announcements, Azaan, reminders, etc.

 - **Broadcast Module**
   - Send **one‑off announcements** to one or many devices.
   - Uses command queue / realtime events for fast delivery.
   - Ideal for school‑wide messages, short reminders, or special events.

 - **School Settings**
   - Manage school details: name, address, contact info, logo/branding.
   - Theme selection (dashboard color palette).
   - Hooks to advanced features:
     - Text-to-Speech (TTS) announcements.
     - OTA firmware updates (if enabled).
     - **Backup & Restore:** Full system backup capabilities (database, schedules, logs, and MP3 media).
     - **Separate Logins:** Segregated access levels for Admin and User roles.

 ### 2.2 Super Admin Portal

 - Dedicated area for **platform owners / SaaS provider**.
 - Access controlled via `super_admin` role.

 #### Super Admin Features
 - **School Management**
   - Create and manage schools.
   - Configure subscription details (end date, max devices, payment status).
 - **User Management**
   - Manage admins and operators across all schools.
   - Adjust roles and assignments.
 - **Inventory Management**
   - Central table of all manufactured devices:
     - Serial number, MAC address, batch ID.
     - Claim status and assigned school.
   - “Claim device” workflow:
     - Admin enters device serial number.
     - Device is linked to a school and becomes a bell device in that tenant.

 ---

 ## 3. Mobile App (React Native + Expo)

 - Companion mobile app for **Android** (Expo EAS builds configured).
 - Designed for **on‑the‑go control** by admins and operators.

 ### Main Tabs
 - **Dashboard**
   - Shows active profile and next bell time.
   - Quick buttons:
     - Change Profile.
     - Manual Trigger.
     - Emergency.
 - **Profiles**
   - Manage profiles list (create, delete).
   - Tap to open full editor.
 - **Audio**
   - Access audio library similar to the web Audio Manager.
 - **Broadcast**
   - Send broadcasts from mobile (for quick announcements).
 - **Devices**
   - List all devices with status and last heartbeat.
   - Per-device actions: CONFIG, TEST_BUZZER, TEST_AUDIO, REBOOT.
 - **Settings**
   - Manage school information (name, logo, address).
   - Controls:
     - Switch Active Profile.
     - Manual Trigger.
     - Emergency Stop.
   - Sign out from app.

 ### Extra Mobile Screens
 - **Profile Editor**
   - Full schedule editor optimized for touch.
   - Edit times, days, and audio assignments.
 - **Profile Switcher**
   - Quickly change which profile is active.
 - **Manual Trigger**
   - Trigger immediate bell rings on selected devices.
 - **Emergency Screen**
   - High‑priority emergency stop or alarm commands from phone.

 ---

 ## 4. Supabase Cloud Backend

 - Powered by **Supabase** (Postgres, Auth, Storage, Edge Functions).
 - Multi‑tenant design with strict **Row Level Security (RLS)**.

 ### Core Data Model
 - **schools**
   - Name, address, branding.
   - Subscription fields:
     - `subscription_end_date`
     - `max_devices`
     - `payment_status`
 - **users**
   - Linked to Supabase Auth users.
   - Role: `super_admin`, `admin`, `operator`.
   - `school_id` for tenant isolation.
 - **bell_devices**
   - ESP32 device instances.
   - MAC address, name, status, last heartbeat, location.
 - **bell_profiles** & **bell_times**
   - Profiles and detailed bell times.
   - Connect times to audio tracks and days.
 - **audio_files**
   - Metadata for uploaded MP3 files.
   - Storage paths in Supabase Storage.
 - **device_logs**
   - Diagnostic logs sent from devices for troubleshooting.
 - **command_queue**
   - Commands sent from apps to devices:
     - Manual ring, emergency, config update, reboot, test audio, etc.

 ### Advanced Backend Features
 - **Text-to-Speech (TTS)**
   - Edge Function (`generate-speech`) turns text into audio files.
   - Stored in dedicated buckets for playback as announcements.
 - **OTA Firmware Updates**
   - Firmware images stored in firmware bucket.
   - Devices can receive OTA update commands and pull new firmware via HTTPS.
 - **Heartbeats & Device Config**
   - RPCs for:
     - Updating device heartbeat (status, last seen).
     - Serving full device configuration / schedules.
   - Devices poll periodically and update local cache when needed.

 ### Security & Multi-Tenancy
 - Every record tied to a **school_id**.
 - RLS guarantees a school only sees its own data.
 - Super Admin policies allow platform-wide management.
 - Device authentication via MAC address and secure Edge Functions.

 ---

 ## 5. Smart Bell Devices (ESP32 Firmware)

 - Custom firmware for **ESP32-based AutoBell controllers**.
 - Multiple board variants (40‑pin, Wemos, S3) supported.

 ### Device Features
 - **Wi‑Fi Manager**
   - First-time setup via AutoBell access point.
   - Auto‑reconnect and recovery on network loss.
 - **Accurate Timekeeping**
   - NTP-based time sync for precise ringing.
 - **Local Schedule Cache**
   - Downloads schedule JSON from backend.
   - Stores in LittleFS/SPIFFS so bells run even if internet is down.
 - **Smart Scheduler**
   - Compares current time vs schedule every second.
   - Plays mapped MP3 tracks via DFPlayer or I2S amplifier.
 - **Emergency Handling**
   - Polls command queue and/or realtime channels for urgent commands.
   - Supports emergency alarm, stop, manual ring, reboot, test modes.
 - **OTA Updates**
   - Secure HTTPS firmware download and self‑update.
 - **Health Monitoring**
   - Tracks heap, uptime, Wi‑Fi strength.
   - Can send diagnostic info to backend for support.

 ---

 ## 6. Subscription & Backup Device Service

 ### SaaS Subscription Model
 - Each **school** is a tenant with:
   - Subscription end date.
   - Maximum device limit.
   - Payment status.
 - Super Admin portal allows:
   - Managing subscriptions.
   - Monitoring device usage vs plan.

 ### Backup Device Service (Yearly Agreement)
 - Optionally, with the **yearly agreement**, AutoBell can include a:
   - **Backup device service**, using the central **device inventory**.
 - How it works:
   - A pool of **spare AutoBell controllers** is held in inventory.
   - For subscribed schools:
     - If a primary device fails, a spare device from inventory is shipped / provided.
     - School admin “claims” the replacement device via serial number.
     - The system links it to the school and loads existing schedules and audio.
   - Result: **Minimal downtime** – classes and prayers continue without disruption.

 ### Marketing Message Ideas
 - “AutoBell gives you **web and mobile control** of your entire bell system.”
 - “Designed for **schools & madrasas** that need **reliable, precise** bell automation.”
 - “With our **optional yearly backup device service**, hardware failures don’t stop the day.”
 - “From daily bells to emergency alerts, AutoBell keeps your campus in sync.”

