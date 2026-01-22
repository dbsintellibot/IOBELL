# AutoBell - SaaS Bell Management System

AutoBell is a smart IoT solution designed to modernize school bell systems. It allows school administrators to manage bell schedules remotely via a web dashboard or mobile app, with reliable execution by ESP32-based controllers installed on-site.

## System Overview

The system connects physical bells to the cloud using secure IoT devices, enabling:
*   **Remote Scheduling:** Create and modify schedules from anywhere.
*   **Emergency Triggers:** Instantly ring bells for emergencies via the app.
*   **Multi-School Management:** SaaS architecture supporting multiple independent schools.
*   **Offline Reliability:** Devices store schedules locally to ensure operation even during internet outages.

## Architecture

For a deep dive into the system architecture, data flow diagrams, and security strategy, please see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Technology Stack

*   **Frontend Web:** React (Vite) + Tailwind CSS + Shadcn UI
*   **Mobile App:** React Native (Expo)
*   **Backend:** Supabase (PostgreSQL, GoTrue, Edge Functions)
*   **IoT Firmware:** C++ (PlatformIO / Arduino) for ESP32

## Project Structure

*   `web-dashboard/`: Web application source code.
*   `prompts/`: Documentation and system design prompts.
*   `ARCHITECTURE.md`: Detailed system architecture documentation.
