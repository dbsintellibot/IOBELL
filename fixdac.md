# Fix DAC / Scheduler Bug for Uploaded MP3 in TTS Audio Manager
## Summary
There is a scheduling bug in the TTS Audio manager related to the Audio (mp3) selection via dropdown .

- When we enter text into the TTS text field and schedule it, the audio plays on time as expected .
- When we instead select an uploaded MP3 file from the TTS Audio (mp3) dropdown , the scheduled playback does not run on time (or does not run at all) .
This document describes the expected behavior, the current broken behavior, and what needs to be fixed.

## Current Behavior
- In the Audio Manager / TTS scheduler:
  - Text-based TTS job :
    - User types text into the TTS text field.
    - User configures schedule (time/cron/whatever scheduling UI).
    - At the scheduled time, the TTS audio generated from the text is sent to the device and played correctly and on time .
  - Uploaded MP3 job via dropdown :
    - User uploads an MP3 file to the system and can see it listed in the TTS Audio (mp3) dropdown.
    - User selects the MP3 from the dropdown instead of entering text.
    - User configures the schedule similarly.
    - At the scheduled time:
      - The MP3 does not play , or
      - The job is not triggered correctly / not dispatched to the device, even though the schedule exists.
So: same schedule mechanism, but different source (text vs. dropdown MP3) . Text works, dropdown MP3 does not.

## Expected Behavior
- The scheduling system should treat both :
  - text-based TTS jobs, and
  - uploaded MP3 selection jobs
     in a consistent way.
- At the configured time:
  - If the job is text-based, generate or fetch the TTS audio and play it.
  - If the job is MP3-based (selected from TTS Audio (mp3) dropdown), fetch the corresponding MP3 and play it.
- From the user’s perspective:
  - It should not matter whether they typed text or selected an MP3 file; both must run on schedule reliably .
## Likely Problem Areas / Hypothesis
Please investigate and fix along these lines (these are hypotheses, not confirmed):

- The scheduler may only be wired up to text-based TTS jobs and might be ignoring or failing to create schedule entries for MP3-based jobs.
- The data model for scheduled items might:
  - save text jobs with a payload type like "tts_text" or similar,
  - but not properly store MP3 jobs with a correct "audio_file" / "mp3" type or file reference.
- The backend handler that executes scheduled jobs might:
  - only handle text-to-TTS flow,
  - skip or early-return when the job is configured to use an uploaded file.
- There could be a mismatch between:
  - the dropdown value (e.g., an ID, filename, or path), and
  - what the scheduler or device expects when it tries to play the audio.
## Requirements for the Fix
- Ensure that when a user selects an MP3 in TTS Audio (mp3) dropdown and sets a schedule:
  - A proper schedule entry is created (with all necessary metadata: file ID/path, type, etc.).
  - The job is picked up by the scheduler at the correct time.
  - The MP3 is actually sent to the device (e.g., ESP32 / DAC) and played as expected.
- Do not break existing behavior:
  - Text-based TTS schedules must continue to work exactly as they do now.
- If the code uses any “type” or “mode” field (e.g., sourceType: 'tts' | 'file' ), make sure:
  - both source types are supported end-to-end (creation, persistence, execution, logging).
## Acceptance Criteria
- Create at least two test scenarios (manual or automated):
  
  1. Text TTS Scenario
     
     - Enter text in TTS field.
     - Schedule it for a time in the near future.
     - Confirm it runs on time (this is the current working behavior; keep as regression test).
  2. Uploaded MP3 Scenario
     
     - Upload an MP3 file.
     - Select it from the TTS Audio (mp3) dropdown.
     - Schedule it for a time in the near future.
     - Confirm the MP3 plays on time, from the device, via the same scheduler.
- Add logging (or improve existing logging) around:
  
  - the creation of scheduled items for MP3 jobs,
  - scheduler pickup of MP3 jobs,
  - audio dispatch/playback for MP3 jobs.
- Verify that scheduled MP3 playback continues to work after a service restart (if applicable) and that jobs persist correctly.
## Implementation Notes (Guidance)
When implementing, please:

- Reuse the existing scheduling mechanism used for text-based TTS as much as possible.
- Only add special-case logic where absolutely required (e.g., selecting between generating TTS vs. loading an MP3 file).
- Keep the interface/UX unchanged for the user:
  - They choose between typing text or selecting an MP3; everything else should “just work”.
- Make sure any reference to the MP3 (ID, URL, path) is:
  - stored,
  - resolved correctly at execution time,
  - and compatible with the playback pipeline (ESP32 / DAC, etc.).