# AutoBell - SaaS Bell Management System

AutoBell is a smart IoT solution designed to modernize school bell systems. It allows school administrators to manage bell schedules remotely via a web dashboard or mobile app, with reliable execution by ESP32-based controllers installed on-site.

**Live Dashboard:** [https://iobell.web.app/](https://iobell.web.app/)

## System Overview

The system connects physical bells to the cloud using secure IoT devices, enabling:
*   **Remote Scheduling:** Create and modify schedules from anywhere.
*   **Emergency Triggers:** Instantly ring bells for emergencies via the app.
*   **Multi-School Management:** SaaS architecture supporting multiple independent schools.
*   **Offline Reliability:** Devices store schedules locally to ensure operation even during internet outages.
*   **Backup & Restore:** Complete data safety with full database, schedule, log, and MP3 media backup and restore functionality.
*   **Hardware Watchdog:** Unmatched reliability with automatic freeze recovery.

## Architecture

For a deep dive into the system architecture, data flow diagrams, and security strategy, please see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Technology Stack

*   **Frontend Web:** React (Vite) + Tailwind CSS + Shadcn UI
*   **Mobile App:** React Native (Expo)
*   **Backend:** Supabase (PostgreSQL, GoTrue, Edge Functions)
*   **IoT Firmware:** C++ (PlatformIO / Arduino) for ESP32

## Project Structure

*   `esp32-firmware/`: C++ firmware for the IoT bell controller (PlatformIO/Arduino).
*   `mobile-app/`: React Native (Expo) application for mobile management.
*   `web-dashboard/`: React (Vite) web application for administrators and super admins.
*   `supabase/`: Database migrations, schema definitions, and Edge Functions.
*   `voice files/`: Pre-recorded voice announcements and bell sounds.
*   `prompts/`: Documentation and historical design prompts used for AI generation.
*   `ARCHITECTURE.md`: Detailed system architecture and data flow documentation.
*   `API_CONTRACT.md`: Communication protocol between IoT devices and the backend.
*   `USER_MANUAL.md`: Guide for end-users on how to use the system.
*   `TROUBLESHOOTING.md`: Guide for diagnosing and fixing common issues.
*   `AutoBell_Features_20Feb2026.md`: Detailed list of system features and modules.

