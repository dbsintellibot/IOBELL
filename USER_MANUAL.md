# AutoBell System User Manual

Welcome to **AutoBell**! This manual provides step-by-step instructions for School Administrators, IT Staff, Operators, and Reseller Partners to effectively manage the AutoBell Cloud SaaS System and IoT Bell Controllers.

---

## Table of Contents
1. [System Overview & Getting Started](#1-system-overview--getting-started)
2. [Web Dashboard](#2-web-dashboard)
   - [Logging In](#logging-in)
   - [Profiles & Bell Schedule Management](#profiles--bell-schedule-management)
   - [Pre-Announcement Jingle & Delay Settings](#pre-announcement-jingle--delay-settings)
   - [Text-to-Speech (TTS) & Announcements](#text-to-speech-tts--announcements)
   - [Audio Manager](#audio-manager)
   - [System Backup & Restore](#system-backup--restore)
   - [User & Role Management](#user--role-management)
3. [Mobile App](#3-mobile-app)
   - [Manual Bell Triggers](#manual-bell-triggers)
   - [Emergency Mode & Lockdown](#emergency-mode--lockdown)
4. [Device Management](#4-device-management)
   - [Claiming & Assigning Devices](#claiming--assigning-devices)
   - [Hardware Watchdog & Offline Mode](#hardware-watchdog--offline-mode)
5. [Partner & Reseller Portal](#5-partner--reseller-portal)
6. [Support & Helpdesk](#6-support--helpdesk)

---

## 1. System Overview & Getting Started

The AutoBell ecosystem consists of three key components:
*   **AutoBell IoT Controller:** Physical hardware box connected to your school's amplifiers, speakers, or bell relays.
*   **Web Admin Dashboard:** Accessible at [https://iobell.web.app/](https://iobell.web.app/) for comprehensive scheduling and administration.
*   **Mobile App:** Android application for quick management, manual triggers, live broadcasts, and instant emergency alarms.

---

## 2. Web Dashboard

### Logging In
1. Navigate to [https://iobell.web.app/](https://iobell.web.app/).
2. Enter your registered school email address and password.
3. Upon authentication, you will be directed to your school's Overview dashboard.

### Profiles & Bell Schedule Management
1. Go to the **Profiles** tab.
2. Select or create a bell profile (e.g., *Normal Day*, *Exam Schedule*, *Ramadan*, *Half-Day*).
3. Click **Add Bell**:
   - Set time in 24-hour format (HH:MM).
   - Select applicable days of the week.
   - Assign an MP3 audio track or chime from your audio library.
4. Mark your desired profile as **Active**. All linked devices will immediately receive the schedule update.

### Pre-Announcement Jingle & Delay Settings
AutoBell allows playing a signature chime or jingle before any bell or announcement rings, followed by a customizable pause.
1. Navigate to **Settings > Pre-Announcement**.
2. **Enable/Disable:** Toggle the pre-announcement switch on or off.
3. **Select Pre-Announcement Sound:** Browse the library of available pre-announcement sounds and click **Preview** to listen to them. Select your default sound.
4. **Configure Pause Delay:** Set the delay duration before the main bell audio starts (**2, 3, 4, or 5 seconds**).
5. Click **Save Settings**.

### Text-to-Speech (TTS) & Announcements
1. Go to **Broadcast** or **Period Bells & Announcements**.
2. Type your notice into the Text-to-Speech box (e.g., *"Attention students, morning assembly starts in 5 minutes."*).
3. Click **Generate & Broadcast**. The system converts the text into natural spoken audio and plays it across selected devices.

### Audio Manager
1. Go to the **Audio Manager** tab.
2. Click **Upload New Sound** and select an MP3 file (recommended duration: under 30 seconds).
3. Assign a friendly name (e.g., *"Dismissal Chime"*, *"Adhan"*, *"Assembly Jingle"*).

### System Backup & Restore
1. Navigate to the **Backups** tab (`/dashboard/backups`).
2. **Create Backup:** Click **Create Full System Backup**. This packages your database entries, profiles, schedule times, logs, and MP3 audio files.
3. **Restore Backup:** In case of data reset or device replacement, upload your backup file and click **Restore**.

### User & Role Management
1. Go to **Settings > Users**.
2. Click **Invite User** and enter their email address.
3. Select role:
   - **School Admin:** Full operational and configuration privileges.
   - **Operator:** Restricted privileges (allowed to use manual triggers and emergency alarms only).

---

## 3. Mobile App

### Manual Bell Triggers
1. Open the AutoBell mobile app on your Android device.
2. Tap **Manual Trigger**.
3. Select target devices and desired audio track, then tap **Ring Now**.

### Emergency Mode & Lockdown
> **CAUTION: Use only during genuine emergency situations.**
1. Tap the red **Emergency** tab at the bottom of the screen.
2. Slide the **Activate Emergency** slider.
3. All connected bell controllers will instantly sound continuous emergency alarms and override normal schedules.
4. To stop the alert, tap **Deactivate** and enter your PIN code.

---

## 4. Device Management

### Claiming & Assigning Devices
1. Go to **Bells / Devices** in the Web Dashboard.
2. Click **Claim Device**.
3. Enter the serial number printed on your AutoBell hardware box. The device will automatically link to your school tenant.

### Hardware Watchdog & Offline Mode
*   **Offline Capability:** Schedules are saved to local hardware storage. If internet connection drops, bells continue ringing accurately.
*   **Hardware Watchdog:** In the rare event of a hardware lockup, the device automatically reboots itself within seconds to maintain continuous operational readiness.

---

## 5. Partner & Reseller Portal

For educational equipment distributors, school IT vendors, and system integrators:
1. Log in at [https://iobell.web.app/login](https://iobell.web.app/login) using your partner credentials.
2. Access the **Partner Portal** (`/partner`):
   - **Overview:** Monitor total leads, deals closed, and active subscriptions.
   - **Leads & Deals:** Register new school prospects and track onboarding status.
   - **Commissions & Payments:** View earned commissions and payout history.

---

## 6. Support & Helpdesk

For technical assistance or warranty support:
*   **Email:** support@autobell.com
*   **Help Center & Docs:** [https://iobell.web.app/](https://iobell.web.app/)
