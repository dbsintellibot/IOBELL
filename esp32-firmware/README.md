# AutoBell ESP32 Firmware

## Hardware Wiring

### ESP32-S3 (Main Unit)
- **Buzzer**: GPIO 15
- **Relay**: GPIO 4
- **DFPlayer RX**: GPIO 16
- **DFPlayer TX**: GPIO 17
- **I2S DOUT**: GPIO 14
- **I2S BCLK**: GPIO 38
- **I2S LRC**: GPIO 4
- **RTC SDA**: GPIO 8
- **RTC SCL**: GPIO 9



## Installation

### Option A: PlatformIO (Recommended)
This project is configured for PlatformIO, which manages dependencies automatically.
1. Open the folder in VS Code.
2. Ensure the "PlatformIO IDE" extension is installed.
3. Select the environment:
   - `env:esp32_s3` for the ESP32-S3 Main Unit.
   - `env:esp32_wroom` for the ESP32 WROOM (30-pin DevKit).
   - `env:esp32_40pin` for the ESP32 40-pin variant.
4. Click "Upload".

### Option B: Arduino IDE
If you prefer using Arduino IDE, you must install the following libraries via **Sketch > Include Library > Manage Libraries**:

1. **ArduinoJson** by Benoit Blanchon
2. **DFRobotDFPlayerMini** by DFRobot
3. **WiFiManager** by tzapu
4. **RTClib** by Adafruit
5. **ESP32-audioI2S** by Schreibfaul1

## Setup

1. **SD Card Setup**: 
   - Format a microSD card as FAT32.
   - Naming Convention: Files must be named with 4-digit numbers, e.g., `0001.mp3`, `0002.mp3`.
   - Place files in the root directory or inside an `mp3` folder.
   
2. **Web Dashboard Mapping**:
   - Upload an MP3 file to the Audio Manager in the web dashboard.
   - **Crucial**: Edit the "Track Number" in the dashboard to match the file number on the SD card (e.g., set Track Number to `1` for `0001.mp3`).
   - The ESP32 will receive the track number and play the corresponding file from the SD card.

3. **WiFi**: 
   - Connect to the `AutoBell-Setup` Access Point on first boot to configure WiFi credentials.

## Features
- **WiFi Manager**: Auto-reconnects.
- **NTP Time**: Syncs time automatically.
- **Smart Scheduler**: Caches schedule from Supabase to `LittleFS` (works offline).
- **Emergency Mode**: Polls Supabase command queue every 5s for `RING`, `REBOOT`, etc.
