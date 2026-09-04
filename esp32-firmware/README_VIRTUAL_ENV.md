# 🎮 AutoBell ESP32-S3 Virtual Simulation Environment

This virtual environment allows you to test your ESP32-S3 firmware logic **instantly** without connecting physical hardware every time you edit your C++ code.

---

## 🔌 Virtual Hardware Wiring Diagram

The virtual environment schematics in [`diagram.json`](diagram.json) are mapped directly to your [`src/main_s3.cpp`](src/main_s3.cpp) hardware definitions:

| Hardware Component | Virtual Module | ESP32-S3 Pin / Protocol | Notes |
| :--- | :--- | :--- | :--- |
| **Microcontroller** | `wokwi-esp32-s3-devkitc-1` | ESP32-S3 Board | 16MB Flash / 8MB PSRAM |
| **LCD Display (16x2)** | `wokwi-lcd1602` + `wokwi-pcf8574` | **GPIO 8** (SDA) / **GPIO 9** (SCL) | Address `0x27` (I2C) |
| **RTC Clock** | `wokwi-ds3231` | **GPIO 8** (SDA) / **GPIO 9** (SCL) | Address `0x68` (I2C) |
| **Power LED** | `wokwi-led` (Red) | **GPIO 13** | Red LED with 220Ω resistor |
| **WiFi Status LED** | `wokwi-led` (Green) | **GPIO 2** | Green LED with 220Ω resistor |
| **Buzzer** | `wokwi-buzzer` | **GPIO 15** | Piezo Buzzer |
| **PCM5102A I2S DAC + Amp** | `wokwi-i2s-dac` + `wokwi-speaker` | **GPIO 14** (DOUT), **GPIO 38** (BCLK), **GPIO 4** (LRC) | Audio DAC output to speaker |

---

## 🚀 How to Run the Virtual Environment

### Method 1: VS Code (Recommended)
1. Install the **[Wokwi Simulator Extension](https://marketplace.visualstudio.com/items?itemName=Wokwi.wokwi-vscode)** in VS Code.
2. Build the firmware for simulation:
   ```bash
   node esp32-firmware/run-virtual-sim.mjs
   ```
3. Open [`esp32-firmware/diagram.json`](diagram.json) in VS Code.
4. Press `F1` (or `Ctrl+Shift+P`), type **`Wokwi: Start Simulator`**, and hit Enter!
5. Watch the virtual ESP32-S3 boot up, display text on the 16x2 LCD, toggle the Power/WiFi LEDs, set time on the DS3231 RTC, and output sound via I2S.

---

## 🔁 Rapid Iteration Workflow (Every time you edit code)
1. Edit your C++ files in `esp32-firmware/src/`.
2. Run `node esp32-firmware/run-virtual-sim.mjs` (or run `pio run` inside `esp32-firmware/`).
3. The virtual simulator will automatically reload with your newest firmware!
