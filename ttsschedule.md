# Feature Requirement: Schedule Text-to-Speech (TTS) Integration

## Overview
This feature enables the bell schedule to support Text-to-Speech (TTS) as an alternative to playing MP3 files. This allows the system to speak a specific text message at a scheduled time, potentially bypassing the need for the DFPlayer hardware module for those specific events.

## Goals
1.  **Database:** Store TTS preferences (type and message) for each bell schedule item.
2.  **UI/UX:** Allow users to toggle between "MP3 Audio" and "Text-to-Speech" in the Schedule Editor.
3.  **API:** Deliver TTS data to the ESP32 firmware via the device configuration RPC.

## 1. Database Schema Changes
We need to modify the `bell_times` table to store the playback type and the optional text message.

**Action:** Create a migration to add the following columns to `bell_times`:
-   `play_type`: text (Check constraint: `'mp3'` or `'tts'`), Default `'mp3'`.
-   `tts_message`: text (Nullable).

**SQL Snippet:**
```sql
ALTER TABLE bell_times 
ADD COLUMN play_type text CHECK (play_type IN ('mp3', 'tts')) DEFAULT 'mp3',
ADD COLUMN tts_message text;
```

## 2. Web Dashboard Implementation
**File:** `web-dashboard/src/pages/ProfileEditor.tsx`

### UI Changes
In the schedule list item rendering loop:
1.  **Add a Radio Group** (or Segmented Control) with two options:
    -   🔘 **MP3 File** (Default)
    -   ⚪ **Text to Speech**
2.  **Conditional Rendering:**
    -   **If MP3 is selected:** Render the existing `audio_file_id` dropdown.
    -   **If TTS is selected:** Render a `<input type="text" />` or `<textarea>` for `tts_message`.
        -   Placeholder: "Enter text to announce (e.g., 'Recess is over')..."
        -   Max length validation (e.g., 100 characters).

### State Management
-   Update the `ScheduleItem` interface to include `play_type` and `tts_message`.
-   When switching from MP3 to TTS, clear or ignore `audio_file_id`.
-   When switching from TTS to MP3, clear or ignore `tts_message`.
-   Update `handleAddItem` to initialize `play_type: 'mp3'`.

### Data Persistence (`handleSaveProfile`)
-   Ensure the `insert` payload includes `play_type` and `tts_message`.
-   Handle the logic where `audio_file_id` might be `null` if `play_type` is `'tts'`.

## 3. Backend RPC Updates
**File:** `supabase/migrations/...` (Update `get_device_config` function)

The firmware needs to receive this new data to know whether to play a track or speak text.

**Action:** Update `get_device_config` to select the new columns.

**JSON Payload Output Example:**
```json
[
  {
    "bell_time": "08:00:00 AM",
    "days_of_week": [1, 2, 3, 4, 5],
    "type": "mp3",           // New field
    "track_number": 12,      // Used if type='mp3'
    "tts_text": null,
    "duration": 5
  },
  {
    "bell_time": "09:00:00 AM",
    "days_of_week": [1, 2, 3, 4, 5],
    "type": "tts",           // New field
    "track_number": null,
    "tts_text": "Assembly will begin in 5 minutes", // New field
    "duration": 10
  }
]
```

## 4. Firmware Considerations
-   The firmware will receive `type` and `tts_text` in the configuration JSON.
-   **Logic:**
    -   If `type == 'tts'`: The ESP32 should use its TTS engine to speak the `tts_text`.
    -   If `type == 'mp3'`: The ESP32 should use the DFPlayer to play `track_number`.
