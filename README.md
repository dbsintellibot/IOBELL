# AutoBell - Smart Cloud-Based Bell Management System

AutoBell is an enterprise-grade IoT solution designed to modernize school bell schedules, automated announcements, emergency alerts, and audio broadcasting. School administrators manage daily operations remotely via a sleek Web Dashboard or Android Mobile App, with offline-first execution handled by ESP32-based controllers installed on-site.

**Live Dashboard:** [https://iobell.web.app/](https://iobell.web.app/)

---

## 🌟 Key Features & Core Capabilities

*   **Cloud-Based Remote Scheduling:** Create, manage, and switch profile schedules (Normal Day, Exam Mode, Ramadan, Weekend) from anywhere.
*   **System-Wide Pre-Announcement Audio Jingle & Delay:** School Admins can select a signature pre-announcement chime from a global library and set a custom pause delay (2–5 seconds) before any bell, TTS notice, voice note, or announcement plays.
*   **Text-to-Speech (TTS) & Live Broadcasts:** Schedule automated TTS spoken announcements or broadcast live/recorded voice messages instantly from web or mobile.
*   **Offline-First Reliability:** ESP32 controllers cache all profiles and schedule JSON locally in LittleFS/SPIFFS. Bells ring on time even during Wi-Fi or internet outages.
*   **Hardware Watchdog (100% Uptime):** Built-in automatic hardware freeze recovery ensures zero manual restarts or downtime.
*   **Instant Emergency Triggers:** Dedicated lockdown and emergency alarm modes accessible via authorized mobile apps and web dashboards.
*   **Full Data Backup & Restore:** Complete data safety with 1-click backup and restore for database records, active schedules, diagnostic logs, and uploaded MP3 audio media.
*   **Partner & Reseller Portal:** Dedicated portal for school IT vendors and distributors to manage leads, deals, payments, commissions, and customer onboarding.
*   **Multi-Tenant SaaS Security:** Powered by Supabase PostgreSQL with strict Row Level Security (RLS) and Role-Based Access Control (Super Admin, School Admin, Operator, Partner).
*   **Zero-Downtime Backup Device Guarantee:** Optional yearly SaaS agreement providing immediate hardware replacement from central inventory.

---

## 🏗️ System Architecture

For detailed architectural diagrams, data flow specifications, and security policies, see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## 💻 Technology Stack

*   **Frontend Web Dashboard:** React (Vite) + Tailwind CSS + Shadcn UI + React Router
*   **Mobile App:** React Native (Expo) Android WebView wrapper
*   **Backend Services:** Supabase (PostgreSQL, GoTrue Auth, Storage Buckets, Edge Functions)
*   **IoT Firmware:** C++ (PlatformIO / Arduino Framework) for ESP32 (40-pin, Wemos, ESP32-S3)

---

## 📁 Project Structure

*   `web-dashboard/`: React web dashboard for School Admins, Super Admins, Operators, and Reseller Partners.
*   `mobile-app/`: React Native (Expo) app for Android devices.
*   `esp32-firmware/`: C++ firmware for ESP32 IoT bell controllers.
*   `supabase/`: Database migrations, RLS policies, storage bucket rules, and Edge Functions.
*   `docs/`: Detailed feature snapshots, user manuals, troubleshooting guides, and marketing kits.
    *   `docs/AutoBell_Marketing_Kit.md`: Comprehensive marketing kit, ad copy, video scripts, and AI video prompts.
    *   `docs/AutoBell_Features_20Feb2026.md`: Complete feature & module snapshot.
*   `marketing.md`: Product positioning, value proposition, and core promotional messaging.
*   `USER_MANUAL.md`: Step-by-step operational guide for end users and administrators.
*   `ARCHITECTURE.md`: System architecture and data flow documentation.
*   `API_CONTRACT.md`: Device-to-backend communication protocol.
*   `TROUBLESHOOTING.md`: Diagnostic guide for troubleshooting.
