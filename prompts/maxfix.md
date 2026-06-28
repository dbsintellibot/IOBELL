# MAX98357A Rename

**Goal:** Rename every occurrence of MAX98357 to MAX98357A across the entire app and ESP32 C++ firmware.

**Scope:**
- Web Dashboard: d:/My Drive/AutoBell/web-dashboard (TypeScript/React)
- Mobile App: d:/My Drive/AutoBell/mobile-app (TypeScript/React Native)
- Firmware: d:/My Drive/AutoBell/esp32-firmware/src/*.cpp (Arduino/PlatformIO)
- Documentation and configs: root README/TROUBLESHOOTING/API_CONTRACT, prompts/, platformio.ini

**Instructions:**
- Replace text MAX98357 with MAX98357A using the safe rule: only when MAX98357 is not immediately followed by A.
- Use regex for replacement: MAX98357(?!A) -> MAX98357A
- Apply to file types: .ts, .tsx, .js, .json, .md, .cpp, .h, .ini
- Keep case as-is; the part number is uppercase.
- Do not change variable behavior; this is a textual/device-name correction only.

**Verification:**
- Web Dashboard: npm run build
- Mobile App: npm run typecheck && npm run test
- Firmware: Build maintained variants in PlatformIO (main_40pin.cpp, main_wroom.cpp, main_s3.cpp)
- Spot-check UI pages and device logs for corrected part number display.

**Output:**
- All references updated to MAX98357A across app and firmware.
- Provide a concise change summary in commit message: "Rename MAX98357 to MAX98357A across app and firmware"
