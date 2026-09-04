# Task: Remove RC (433MHz) Sending and Receiving from All ESP32 Firmware Variants

You are working in the `esp32-firmware` project. The goal is to **completely remove the RC / 433MHz RF sending and receiving feature from all ESP32 firmware variants**, while keeping the rest of the system fully functional.

---

## Context

- The project has multiple maintained firmware variants, including at least:
  - `src/main_s3.cpp`
  - `src/main_wroom.cpp`
  - `src/main_40pin.cpp`
- RC / 433MHz functionality is implemented around a TX pin (for example, S3 uses `RF_TX` on pin 6) and may use a library such as `RCSwitch` (or similar) for RF send/receive.
- There may be:
  - Pin definitions for RF TX/RX
  - Initialization code for RF/RC
  - Command handlers that send or receive RF codes
  - Any helper functions/utilities specifically for RC

Your job is to **remove this feature completely, cleanly, and consistently** across all maintained ESP32 variants.

---

## High-Level Goals

- Remove **all RC / 433MHz RF sending and receiving support** from the firmware.
- Ensure **all maintained variants build successfully** after the change.
- Avoid leaving unused code, dead macros, or unused pins/configs behind.

---

## Step 1: Codebase Recon

1. Search the firmware for RC / RF related identifiers. Look for:
   - Library includes:
     - `#include <RCSwitch.h>`
     - `#include "RCSwitch.h"`
     - Any other RF/RC specific header
   - Type names and objects:
     - `RCSwitch`
     - `rcSwitch`, `mySwitch`, `rfSwitch`, etc.
   - Pin and macro definitions:
     - `RF_TX`, `RF_RX`, `RC_TX`, `RC_RX`, `REMOTE_TX`, etc.
   - Comment hints and strings:
     - `"RC"`, `"RF"`, `"433"`, `"remote"`, `"RCSwitch"`
   - Command handlers or functions with names like:
     - `handleRfSend`, `handleRcSend`, `handleRcReceive`
     - Any command names that obviously relate to RC / RF.

2. Confirm that you have identified **all** places where RC functionality is present in:
   - `src/main_s3.cpp`
   - `src/main_wroom.cpp`
   - `src/main_40pin.cpp`
   - Any other firmware files referring to RC / RF / 433MHz.

---

## Step 2: Remove Library Dependencies and Globals

For every firmware variant file:

1. **Remove RC-related includes**:
   - Delete `#include <RCSwitch.h>` or any equivalent RC library include.
   - If removing the include causes no remaining references to that library, it is safe.

2. **Remove RC-related global objects and variables**:
   - Delete global instances of RC classes, e.g. `RCSwitch mySwitch;`
   - Delete any RC-specific state variables (last code, receive buffer, etc.) that are only used for RC.

3. **Clean up build dependencies** (if present):
   - If the project has library references for RCSwitch (e.g. in `platformio.ini` or similar config) and they are no longer used anywhere, remove them.
   - Ensure that **no firmware environment** depends on a removed library.

---

## Step 3: Remove RC Pin Configuration and Setup

1. **Remove RC pin definitions**:
   - In pin mapping sections (e.g. for S3: `RF_TX`, possibly on GPIO 6), remove RC pins that are only used for RF.
   - If the pin macro is only used for RC, remove the macro and any related enum/struct entries.

2. **Remove pinMode and initialization**:
   - Remove any `pinMode(RF_TX, OUTPUT)` or similar.
   - Remove any library initialization calls, e.g. `mySwitch.enableTransmit(RF_TX);`, `mySwitch.enableReceive(...)` etc.

3. Ensure that **no remaining code** references these RC pins.

---

## Step 4: Remove RC Command Handlers / Logic

1. Identify all **command handling** logic that deals with RC send/receive:
   - Command names may include `RC`, `RF`, `REMOTE`, `433`, or similar.
   - Look in command dispatch / message handling blocks in each `main_*.cpp`.

2. For each RC-related command:
   - Remove the entire **case / if block** that implements the RC function.
   - Remove any helper functions that are only used by RC commands.
   - If a command is part of a larger structure (e.g. an enum of command types), remove or comment out the RC-specific entry so the command is no longer considered valid.

3. If there is any **JSON payload** or message format used exclusively for RC:
   - Remove the parsing and handling of those fields.
   - Ensure this does not break other commands (keep parsing for non-RC commands intact).

4. Verify command dispatch code compiles without the RC branches.

---

## Step 5: Clean Up Leftovers

1. Remove any **RC-related logging** or debug prints:
   - Lines like `Serial.println("Sending RF code")`, `Serial.println("Received RF code")`, etc.
   - Any `LOG_*` macros that refer only to RC.

2. Remove any **comments** and **TODOs** that relate exclusively to RC functionality.

3. After removal, search again for:
   - `"RCSwitch"`, `"RC "`, `" RF "`, `"433"`, `"rf_"`, `"rc_"` (use both case-sensitive and insensitive searches).
   - Ensure no references to RC remain in the firmware code.

---

## Step 6: Build and Verify Each Variant

1. Build all maintained ESP32 firmware variants:
   - The environments that use:
     - `src/main_s3.cpp`
     - `src/main_wroom.cpp`
     - `src/main_40pin.cpp`
     - Any additional ESP32 environment that previously had RC support.

2. Fix any compilation errors by:
   - Removing leftover references to RC types, functions, or pins.
   - Removing now-unused variables that were only present for RC.

3. Ensure that:
   - The firmware still initializes correctly.
   - Non-RC features (audio, relay, WiFi, schedules, OTA, etc.) remain intact and unaffected.

---

## Acceptance Criteria

- No RC / 433MHz RF **sending or receiving** code remains in the firmware.
- No RC-specific:
  - Libraries
  - Global objects
  - Pin definitions
  - Command handlers
  - Logging or comments
  - Helper functions
- All maintained ESP32 environments build successfully without RC-related libraries.
- The rest of the firmware behavior is unchanged.

If you are unsure whether a piece of code is used for RC, prefer to:
- Trace how it is used (search for call sites or references).
- If it is only referenced by clearly RC-specific code that is being removed, you may safely remove it as well.