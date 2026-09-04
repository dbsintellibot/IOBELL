# AutoBell – Complete Feature & Module Overview  
**Version:** Updated 2026

---

## 1. Product Snapshot

- **Product Category:** Cloud-Managed Multi-Tenant SaaS IoT Bell & Audio Management System.
- **Hardware Integration:** Controls ESP32-based AutoBell smart controllers (40-pin, Wemos, ESP32-S3).
- **Client Platforms:** Web Admin Dashboard (React + Vite + Tailwind + Shadcn UI) & Android Mobile App (Expo React Native).
- **Target Institutions:** K-12 Schools, Colleges, Universities, Madrasas, Vocational Institutes, and Educational Campuses.
- **Live Platform URL:** [https://iobell.web.app/](https://iobell.web.app/)

### Core Value Propositions
- **Complete Bell Automation:** Effortlessly manage recurring daily schedules with unlimited profiles (Normal, Exam, Ramadan, Event).
- **Pre-Announcement Audio Jingle & Custom Delay:** Automatically play a signature pre-announcement chime followed by a 2–5 second delay before any bell or announcement.
- **Instant Emergency Alerts:** Trigger school-wide alarms or lockdowns with single-slide action on web or mobile.
- **Text-to-Speech (TTS) Spoken Notices:** Generate professional audio broadcasts from plain text in seconds.
- **Offline-First Resilience:** Local SPIFFS/LittleFS caching guarantees schedule execution during internet/Wi-Fi outages.
- **Hardware Watchdog Protection:** Auto-recovers hardware from freezes for 100% uptime.
- **Full System Backup & Restore:** Complete data safety for schedules, database records, diagnostic logs, and MP3 audio files.
- **B2B Reseller & Partner Portal:** Built-in portal for distributors and IT vendors to manage leads, deals, payouts, and commissions.
- **Zero-Downtime Backup Device Service:** Optional yearly SaaS agreement providing immediate hardware replacement from central inventory.

---

## 2. Web Admin Dashboard

### 2.1 Multi-Tenant SaaS Architecture & Access Control
- **Super Admin Portal (`/super-admin`)**:
  - School Tenant Management (subscription terms, device caps, payment status).
  - Serial Number Inventory Management & Claiming workflow.
  - Global Pre-Announcement Audio Library (manage 3 to 10 jingle sounds).
  - Platform User Management & Role Assignments.
  - Platform-Wide Backup & Restore management.
  - Partner & Reseller Program Oversight.
- **School Admin Portal (`/dashboard`)**:
  - Active Profile & Daily Schedule Management.
  - Pre-Announcement Audio Selection & Delay Slider (2 to 5 seconds).
  - Period Bells & Audio Manager (MP3 uploads & playback previews).
  - Broadcast Module (TTS generation, live voice notes, instant chimes).
  - Device Management (status monitoring, remote reboot, test buzzer/audio).
  - School Settings & User Invitations (Admin & Operator roles).
  - Full School Backup & Disaster Recovery (`/dashboard/backups`).
- **Operator Access**:
  - Restricted view permitting manual bell triggers and emergency alarms without access to alter schedules or settings.

---

## 3. Partner & Reseller Portal (`/partner`)

Designed for educational equipment distributors, school IT contractors, and system integrators:
- **Partner Dashboard Overview:** Real-time visibility into total leads, active client school subscriptions, closed deals, and earned commissions.
- **Lead & Deal Tracking:** Register prospective schools, log deal stages, and monitor customer onboarding.
- **Commissions & Payout Management:** Transparent ledger of earned referral commissions, payment status, and payout histories.
- **White-Label Partner Settings:** Customize partner contact details and branding options.

---

## 4. Mobile App (React Native Expo)

- **WebView Native Shell:** Embedded WebView pointing to `https://iobell.web.app` with native hardware integration.
- **Android Support:** Android APK and EAS build integration with status bar optimization and hardware back-button handling.
- **Mobile Capabilities:**
  - One-tap Profile Switcher (*Normal*, *Exam*, *Ramadan*).
  - Manual Trigger screen for instant bell ringing.
  - Red Emergency Lockdown screen with slide-to-activate security protection.
  - Instant live audio broadcast and mobile TTS output.
  - Real-time device heartbeat and status checking.

---

## 5. Supabase Cloud Backend & Infrastructure

- **Database Engine:** PostgreSQL with Row Level Security (RLS) for tenant isolation.
- **Authentication:** Supabase Auth (GoTrue) handling secure JWT tokens and role claims (`super_admin`, `admin`, `operator`, `partner`).
- **Storage Buckets:**
  - `audio-files`: Uploaded school MP3 audio tracks.
  - `pre-announcements`: Global pre-announcement jingle library.
  - `firmware`: ESP32 OTA binary images.
  - `backups`: Structured system backup manifests.
- **Edge Functions & RPCs:**
  - `generate-speech`: AI Text-to-Speech audio generator.
  - `get_device_config`: High-performance RPC serving device configs and schedule JSON to ESP32 controllers.
  - `update_device_heartbeat`: Device telemetry and online status tracking.

---

## 6. ESP32 Smart Bell Hardware & Firmware

- **Board Support:** Multi-variant Support (ESP32 40-pin, Wemos D1, ESP32-S3).
- **Wi-Fi Manager:** Initial AP captive portal for seamless local Wi-Fi provisioning.
- **Precision Time:** NTP network time protocol synchronization with fallback real-time clock.
- **Local Storage:** Schedules cached in SPIFFS/LittleFS for offline-first reliability.
- **Audio Output:** DFPlayer Mini serial interface or I2S DAC amplifier playback.
- **Hardware Watchdog:** Internal hardware watchdog timer preventing system lockups.
- **HTTPS OTA Updates:** Secure remote firmware over-the-air upgrades.

---

## 7. Subscription & Replacement Guarantee

- **SaaS Licensing:** Tiered school plans based on device caps, duration, and feature access.
- **Yearly Backup Device Service:** Optional SLA providing pre-configured replacement controllers dispatched immediately upon hardware fault reports, eliminating campus downtime.
