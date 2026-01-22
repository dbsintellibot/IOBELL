# ESP32 Implementation & Setup Procedure

This guide details how to set up the ESP32 hardware, flash the firmware, register the device, and perform the first test.

## 1. Hardware Setup

### Components Required
- **ESP32 Development Board** (e.g., ESP32 DevKit V1)
- **DFPlayer Mini** (MP3 Player Module)
- **Micro SD Card** (Formatted as FAT32)
- **Speaker** (Connected to DFPlayer)
- **Jumper Wires**
- **Breadboard** (Optional)

### Wiring Connections
| ESP32 Pin | DFPlayer Pin | Description |
|-----------|--------------|-------------|
| 5V / VIN  | VCC          | Power       |
| GND       | GND          | Ground      |
| GPIO 16   | TX           | Serial TX -> RX |
| GPIO 17   | RX           | Serial RX -> TX |
| GPIO 2    | -            | Built-in WiFi LED |
| GPIO 4    | -            | Error LED |

*Note: Connect the Speaker to the SPK_1 and SPK_2 pins on the DFPlayer Mini.*

### SD Card Preparation
1. Format the Micro SD card to **FAT32**.
2. Create a folder named `mp3` (optional, but good practice).
3. Place your bell sound file on the root or in the folder.
4. Rename the file to `0001.mp3` (DFPlayer requires 4-digit numbering).

## 2. Software Prerequisites

1. **VS Code**: Install Visual Studio Code.
2. **PlatformIO Extension**: Install the PlatformIO IDE extension for VS Code.
3. **Driver**: Install the CP210x or CH340 USB to UART Bridge driver (depending on your ESP32 board).

## 3. Flashing the Firmware

1. **Open Project**: Open the `AutoBell` folder in VS Code.
2. **Navigate**: Go to the `esp32-firmware` directory.
3. **Build**: Click the Checkmark icon (Build) in the PlatformIO toolbar to compile the code.
4. **Upload**: Connect your ESP32 via USB and click the Arrow icon (Upload).
5. **Monitor**: Click the Plug icon (Serial Monitor) to view the output. Set baud rate to **115200**.

## 4. Device Registration

### Concept: Device Identity
You might wonder: *"Isn't a MAC address just for the local network?"*
While MAC addresses are used for local routing, they are also **globally unique hardware identifiers**. In AutoBell, we use the MAC address like a **Serial Number** or **Username** for the device.
- **Physical Device**: Has a permanent ID (e.g., `A1:B2:C3...`).
- **Cloud Database**: Has a "Whitelist" of allowed IDs.
- **Connection**: When the device connects to the internet, it sends its ID to the Cloud. If the ID is on the whitelist (registered), the Cloud accepts it.

### Registration Steps
Before the device can receive commands, it must be registered in the AutoBell system.

1. **Get MAC Address**: 
   - After flashing, watch the Serial Monitor.
   - The device will print its MAC Address (e.g., `Device MAC: A1:B2:C3:D4:E5:F6`).
   - Copy this address.

2. **Register on Web Dashboard**:
   - Log in to the AutoBell Web Dashboard.
   - Navigate to **Bell Management** or **Devices**.
   - Click **"Register New Device"**.
   - Enter a **Device Name** (e.g., "Main Hall Bell").
   - Paste the **MAC Address**.
   - Click **Register**.

## 5. Connecting to Internet (WiFi Setup)

The ESP32 uses a captive portal for WiFi configuration.

1. **Power On**: Ensure the ESP32 is powered on.
2. **Connect to AP**: 
   - On your phone or laptop, search for WiFi networks.
   - Connect to the network named **"AutoBell-Setup"**.
3. **Configure WiFi**:
   - A captive portal should automatically open (if not, go to `http://192.168.4.1` in your browser).
   - Click **"Configure WiFi"**.
   - Select your local WiFi network.
   - Enter your WiFi Password.
   - (Optional) You can also set a custom Device Name and School ID here.
   - Click **Save**.
4. **Verification**:
   - The ESP32 will reboot and attempt to connect.
   - The **Blue LED (GPIO 2)** will turn **ON** when connected.
   - The Serial Monitor will show `WiFi connected` and the assigned IP address.

## 6. First Test

Once the device is online and registered, verify it works.

### Test 1: Manual Ring
1. Go to the Web Dashboard or Mobile App.
2. Navigate to the **Manual Trigger** section.
3. Select the registered device.
4. Click **"Ring Bell"**.
5. **Observation**:
   - The ESP32 Serial Monitor should show: `Received Command: RING`.
   - The Speaker should play the `0001.mp3` sound.
   - The command status in the dashboard should update to "Executed".

### Test 2: Scheduled Ring
1. Create a Bell Profile (e.g., "Test Schedule").
2. Add a Bell Time for **1 minute from now**.
3. Assign the profile to the current day.
4. Wait for the time to pass.
5. **Observation**:
   - The ESP32 syncs schedules every 5 minutes (or on reboot). 
   - *Tip: Reboot the ESP32 to force an immediate schedule sync.*
   - At the scheduled time, the bell should ring automatically.

## Troubleshooting

- **No Sound**: Check DFPlayer wiring and SD card format/filenames. Ensure the SD card is inserted correctly.
- **Not Connecting to WiFi**: Check credentials. Ensure the network is 2.4GHz (ESP32 does not support 5GHz).
- **Not Showing in Dashboard**: Verify the MAC address matches exactly. Check the Serial Monitor for "Fetch Device Details" logs.
