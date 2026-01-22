# AutoBell ESP32 Firmware

## Hardware Wiring

### DFPlayer Mini
- **VCC** -> 5V (Important: 3.3V might not be enough for audio)
- **GND** -> GND
- **RX**  -> GPIO 17 (TX2 on ESP32)
- **TX**  -> GPIO 16 (RX2 on ESP32)
- **SPK1** -> Speaker +
- **SPK2** -> Speaker -

### Status LEDs
- **WiFi Status (Built-in)**: GPIO 2
- **Error LED (Optional)**: GPIO 4

## Setup

1. **SD Card**: Format a microSD card as FAT32. Add an MP3 file named `0001.mp3` to the root or `mp3` folder.
2. **WiFi**: Update `WIFI_SSID` and `WIFI_PASS` in `src/main.cpp`.
3. **Upload**: 
   - Open in VS Code with PlatformIO extension.
   - Click "Upload and Monitor".

## Features
- **WiFi Manager**: Auto-reconnects.
- **NTP Time**: Syncs time automatically.
- **Smart Scheduler**: Caches schedule from Supabase to `LittleFS` (works offline).
- **Emergency Mode**: Polls Supabase command queue every 5s for `RING`, `REBOOT`, etc.
