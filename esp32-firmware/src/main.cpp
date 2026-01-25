#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <RTClib.h>
#include "DFRobotDFPlayerMini.h"
#include <LittleFS.h>
#include <vector>

// ==========================================
// CONFIGURATION
// ==========================================

// Supabase Configuration
const char* SUPABASE_URL = "https://zelpaafberhmslyoegzu.supabase.co";
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbHBhYWZiZXJobXNseW9lZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTkxNTYsImV4cCI6MjA4NDU5NTE1Nn0.LOuknCbvzw5CryGX2eta2vgkx5IvrE1mxPaUDBBeDD8";

// Pin Definitions
#define PIN_DFPLAYER_RX 16 // Connect to DFPlayer TX
#define PIN_DFPLAYER_TX 17 // Connect to DFPlayer RX
#define PIN_LED_WIFI    25 // WiFi LED (ON = Connected)
#define PIN_LED_ERROR   26 // Error LED
#define PIN_BUZZER      27 // Buzzer Pin
#define PIN_RTC_SDA     21 // RTC SDA
#define PIN_RTC_SCL     22 // RTC SCL

// Settings
const long  UTC_OFFSET_SEC = 18000; // GMT+5 for Pakistan
const unsigned long SCHEDULE_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const unsigned long COMMAND_POLL_INTERVAL = 5 * 1000;      // 5 seconds
const unsigned long HEARTBEAT_INTERVAL = 60 * 1000;        // 60 seconds
const unsigned long PROVISION_POLL_INTERVAL = 10 * 1000;   // 10 seconds

// ==========================================
// GLOBALS
// ==========================================

WiFiUDP ntpUDP;
RTC_DS3231 rtc;
bool rtcFound = false;
DFRobotDFPlayerMini myDFPlayer;
HardwareSerial dfPlayerSerial(2); // Use UART2
NTPClient timeClient(ntpUDP, "pool.ntp.org", UTC_OFFSET_SEC);

Preferences preferences;
char deviceName[40] = "AutoBell Device";
char schoolId[40]   = "";
bool shouldSaveConfig = false; // Flag for saving data from WiFiManager

String deviceMacAddress;
String deviceDbId = "";
unsigned long lastScheduleSync = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastProvisionPoll = 0;
unsigned long buzzerStartTime = 0;
bool buzzerActive = false;

enum DeviceState {
    STATE_BOOT,
    STATE_UNASSIGNED,
    STATE_ACTIVE
};
DeviceState currentState = STATE_BOOT;

struct ScheduleItem {
    int hour;
    int minute;
    std::vector<int> days; // 1=Mon, 7=Sun
};
std::vector<ScheduleItem> activeSchedules;

// ==========================================
// FUNCTION PROTOTYPES
// ==========================================
void fetchDeviceDetails();
void syncSchedules();
void pollCommands();
void sendHeartbeat();
void loadSchedulesFromStorage();
void saveSchedulesToStorage(const String& jsonContent);
void playBell();
void testBuzzer();
void parseSchedules(const String& jsonString);
void getCurrentTime(int &h, int &m, int &s, int &d);
void saveConfigCallback();
void performOTAUpdate(const String& url);

// ==========================================
// SETUP
// ==========================================
void setup() {
    Serial.begin(115200);
    
    // Load Custom Params from Preferences
    preferences.begin("autobell", false);
    String storedName = preferences.getString("dev_name", "AutoBell Device");
    String storedSchool = preferences.getString("school_id", "");
    storedName.toCharArray(deviceName, 40);
    storedSchool.toCharArray(schoolId, 40);
    
    pinMode(PIN_LED_WIFI, OUTPUT);
    pinMode(PIN_LED_ERROR, OUTPUT);
    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_LED_WIFI, LOW);
    digitalWrite(PIN_BUZZER, LOW);
    
    // Init RTC
    Wire.begin(PIN_RTC_SDA, PIN_RTC_SCL);
    if (!rtc.begin()) {
        Serial.println("Couldn't find RTC");
    } else {
        rtcFound = true;
        Serial.println("RTC Found");
        if (rtc.lostPower()) {
            Serial.println("RTC lost power, waiting for NTP sync...");
        }
    }

    // Init LittleFS
    if(!LittleFS.begin(true)){
        Serial.println("LittleFS Mount Failed");
        digitalWrite(PIN_LED_ERROR, HIGH);
    }
    
    // Init DFPlayer
    dfPlayerSerial.begin(9600, SERIAL_8N1, PIN_DFPLAYER_RX, PIN_DFPLAYER_TX);
    if (!myDFPlayer.begin(dfPlayerSerial)) {
        Serial.println(F("Unable to begin DFPlayer:"));
        Serial.println(F("1.Please recheck the connection!"));
        Serial.println(F("2.Please insert the SD card!"));
    } else {
        Serial.println(F("DFPlayer Mini online."));
        myDFPlayer.volume(20);  // Set volume value. From 0 to 30
    }

    // Initialize WiFi to Station Mode to ensure MAC is readable
    WiFi.mode(WIFI_STA);
    delay(100);

    // Get MAC Address
    deviceMacAddress = WiFi.macAddress();
    
    // Retry if MAC is invalid
    if (deviceMacAddress == "00:00:00:00:00:00") {
        Serial.println("MAC is zero, retrying WiFi init...");
        WiFi.disconnect(true);
        delay(100);
        WiFi.mode(WIFI_STA);
        delay(500);
        deviceMacAddress = WiFi.macAddress();
    }
    
    Serial.print("Device MAC: ");
    Serial.println(deviceMacAddress);

    // Load cached schedules first
    loadSchedulesFromStorage();

    // WiFiManager
    WiFiManager wm;
    wm.setSaveConfigCallback(saveConfigCallback);
    
    // Custom params
    WiFiManagerParameter custom_device_name("name", "Device Name", deviceName, 40);
    WiFiManagerParameter custom_school_id("school", "School ID (Optional)", schoolId, 40);
    
    wm.addParameter(&custom_device_name);
    wm.addParameter(&custom_school_id);
    
    // Connect
    if (!wm.autoConnect("AutoBell-Setup")) {
        Serial.println("Failed to connect and hit timeout");
        delay(3000);
        ESP.restart();
    }

    // If we get here, we are connected
    Serial.println("\nWiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    digitalWrite(PIN_LED_WIFI, HIGH);
    
    // Save params if updated
    if (shouldSaveConfig) {
        strcpy(deviceName, custom_device_name.getValue());
        strcpy(schoolId, custom_school_id.getValue());
        preferences.putString("dev_name", deviceName);
        preferences.putString("school_id", schoolId);
        Serial.println("Saved custom parameters");
    }
    
    // Initial Device Fetch
    fetchDeviceDetails();

    // Init NTP
    timeClient.setUpdateInterval(86400000); // Sync every 24 hours
    timeClient.begin();
    
    // Force initial sync to ensure RTC is set
    if (rtcFound) {
        Serial.println("Attempting initial NTP sync...");
        if (timeClient.forceUpdate()) {
            rtc.adjust(DateTime(timeClient.getEpochTime()));
            Serial.println("Initial NTP Sync Success -> RTC Set");
        } else {
            Serial.println("Initial NTP Sync Failed");
        }
    }
    
    if (currentState == STATE_ACTIVE) {
        syncSchedules();
    }
}

// ==========================================
// LOOP
// ==========================================
void loop() {
    // Buzzer Logic (Non-blocking)
    if (buzzerActive && (millis() - buzzerStartTime >= 5000)) {
        noTone(PIN_BUZZER);
        digitalWrite(PIN_BUZZER, LOW);
        buzzerActive = false;
        Serial.println("Buzzer OFF");
    }

    // 1. WiFi Management
    if (WiFi.status() != WL_CONNECTED) {
        digitalWrite(PIN_LED_WIFI, LOW);
        Serial.println("WiFi lost, reconnecting...");
        WiFi.reconnect();
        delay(5000);
        return;
    }

    // 2. State-Based Logic
    if (currentState == STATE_UNASSIGNED) {
        // Blink LED to indicate "Waiting for Assignment"
        bool ledOn = (millis() / 1000) % 2 == 0;
        digitalWrite(PIN_LED_WIFI, ledOn ? HIGH : LOW);
        
        // Poll for assignment
        if (millis() - lastProvisionPoll >= PROVISION_POLL_INTERVAL) {
            lastProvisionPoll = millis();
            fetchDeviceDetails();
            
            // If we just got assigned, sync immediately
            if (currentState == STATE_ACTIVE) {
                Serial.println("Device Assigned! Switching to Active Mode.");
                preferences.putString("school_id", schoolId); // Save the new school ID
                syncSchedules();
            }
        }
        return; // Skip active tasks
    }

    // --- ACTIVE STATE ---
    digitalWrite(PIN_LED_WIFI, HIGH); // Solid ON

    // 3. Update Time & Sync RTC
    // If NTP receives a new time packet, update the RTC
    if (timeClient.update()) {
        if (rtcFound) {
            rtc.adjust(DateTime(timeClient.getEpochTime()));
            Serial.println("NTP Sync -> RTC Adjusted");
        }
    }

    // 4. Scheduler Logic (Run every second)
    static unsigned long lastTick = 0;
    static int lastCheckedMinute = -1; // Track the last minute we processed

    if (millis() - lastTick >= 1000) {
        lastTick = millis();
        
        int currentH, currentM, currentS, currentDay;
        getCurrentTime(currentH, currentM, currentS, currentDay);
        int dbDay = currentDay;

        // Print time periodically (every 10s) for debugging
        if (currentS % 10 == 0) {
             Serial.printf("Current Time: %02d:%02d:%02d (Day: %d)\n", currentH, currentM, currentS, dbDay);
        }

        // Robust Check: Run only once per minute, but don't rely on currentS == 0
        if (currentM != lastCheckedMinute) {
            lastCheckedMinute = currentM;
            
            Serial.printf("Checking Schedules for %02d:%02d (Day: %d)...\n", currentH, currentM, dbDay);
            
            for (const auto& sch : activeSchedules) {
                if (sch.hour == currentH && sch.minute == currentM) {
                    bool dayMatch = false;
                    for(int d : sch.days) {
                        if(d == dbDay) {
                            dayMatch = true;
                            break;
                        }
                    }
                    if(dayMatch) {
                        Serial.println("MATCH! Ringing Bell...");
                        playBell();
                    } else {
                         // Optional: Log that time matched but day didn't (useful for debug)
                         // Serial.println("Time matched, but day did not.");
                    }
                }
            }
        }
    }

    // 5. Poll Commands (Every 5s)
    if (millis() - lastCommandPoll >= COMMAND_POLL_INTERVAL) {
        lastCommandPoll = millis();
        pollCommands();
    }

    // 6. Sync Schedules (Every 5m)
    if (millis() - lastScheduleSync >= SCHEDULE_SYNC_INTERVAL) {
        lastScheduleSync = millis();
        syncSchedules();
    }

    // 7. Send Heartbeat (Every 60s)
    if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        lastHeartbeat = millis();
        sendHeartbeat();
    }
}

// ==========================================
// HELPERS
// ==========================================

void saveConfigCallback() {
    Serial.println("Should save config");
    shouldSaveConfig = true;
}

void performOTAUpdate(const String& url) {
    Serial.println("OTA Update requested from: " + url);
    // TODO: Implement OTA
}

void playBell() {
    myDFPlayer.play(1);

    // Activate Buzzer with Tone (Works for Passive & Active)
    tone(PIN_BUZZER, 1000); // 1kHz signal
    buzzerStartTime = millis();
    buzzerActive = true;
    Serial.println("Buzzer ON (Tone 1000Hz)");
}

void testBuzzer() {
    // Activate Buzzer with Tone
    tone(PIN_BUZZER, 1000); // 1kHz signal
    buzzerStartTime = millis();
    buzzerActive = true;
    Serial.println("Buzzer Test ON (Tone 1000Hz)");
}

void getCurrentTime(int &h, int &m, int &s, int &d) {
    if (rtcFound) {
        DateTime now = rtc.now();
        h = now.hour();
        m = now.minute();
        s = now.second();
        d = now.dayOfTheWeek(); // 0=Sun, 1=Mon, etc.
    } else {
        // Fallback to NTP if RTC not present
        timeClient.update();
        h = timeClient.getHours();
        m = timeClient.getMinutes();
        s = timeClient.getSeconds();
        d = timeClient.getDay();
    }
}

// -------------------------------------------------------------------------
// API FUNCTIONS
// -------------------------------------------------------------------------

void fetchDeviceDetails() {
    if (WiFi.status() != WL_CONNECTED) return;
    
    Serial.println("--- Fetching Device Details ---");
    Serial.print("My MAC: ");
    Serial.println(deviceMacAddress);

    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/rpc/register_device_from_esp";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    
    JsonDocument reqDoc;
    reqDoc["p_mac_address"] = deviceMacAddress;
    reqDoc["p_school_code"] = String(schoolId); // Sends "" if empty
    reqDoc["p_device_name"] = String(deviceName);
    
    String body;
    serializeJson(reqDoc, body);
    
    int code = http.POST(body);
    
    if (code == 200) {
        String resp = http.getString();
        Serial.print("Registration Response: ");
        Serial.println(resp);

        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, resp);
        
        if (!error && doc.size() > 0) {
            deviceDbId = doc[0]["id"].as<String>();
            String status = doc[0]["status"].as<String>();
            
            // Handle server messages (e.g. warnings about invalid code)
            bool forceUnassigned = false;
            if (doc[0].containsKey("message")) {
                String msg = doc[0]["message"].as<String>();
                if (msg != "OK") {
                    Serial.println("Server Message: " + msg);
                    // If invalid code was sent, clear it from preferences
                    if (msg.indexOf("Invalid School Code") >= 0 || msg.indexOf("Unassigned") >= 0) {
                        Serial.println("Clearing invalid School ID/Code from preferences.");
                        preferences.putString("school_id", "");
                        strcpy(schoolId, "");
                        forceUnassigned = true;
                    }
                }
            }

            // Check assignment
            bool isAssigned = false;
            if (!forceUnassigned && doc[0]["school_id"].is<String>()) {
                String sId = doc[0]["school_id"].as<String>();
                if (sId.length() > 0) {
                    sId.toCharArray(schoolId, 40);
                    isAssigned = true;
                }
            }
            
            if (isAssigned) {
                currentState = STATE_ACTIVE;
                Serial.println("State: ACTIVE (Assigned to School)");
                if (doc[0]["school_code"].is<String>()) {
                    Serial.println("School Code: " + doc[0]["school_code"].as<String>());
                }
            } else {
                currentState = STATE_UNASSIGNED;
                Serial.println("State: UNASSIGNED (Waiting for Super Admin)");
            }
            
            Serial.println("Device ID: " + deviceDbId);
        } else {
            Serial.println("JSON Parse Error or Empty Response");
            currentState = STATE_UNASSIGNED;
        }
    } else {
        Serial.print("Registration Error: ");
        Serial.println(code);
        Serial.println(http.getString());
        // Keep current state (don't reset to Boot)
    }
    http.end();
}

void syncSchedules() {
    if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE) return;
    
    Serial.println("Syncing Schedules via get_device_config...");
    
    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/rpc/get_device_config";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    
    String body = "{\"device_mac\": \"" + deviceMacAddress + "\"}";
    
    int code = http.POST(body);
    
    if (code == 200) {
        String resp = http.getString();
        
        // Basic validation
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, resp);
        
        if (!error && doc.containsKey("schedules")) {
             Serial.println("Sync Success. Saving...");
             saveSchedulesToStorage(resp);
             parseSchedules(resp);
             digitalWrite(PIN_LED_ERROR, LOW);
        } else {
             Serial.println("Invalid Config Response");
             digitalWrite(PIN_LED_ERROR, HIGH);
        }
    } else {
        Serial.print("Sync Config Failed: ");
        Serial.println(code);
        Serial.println(http.getString());
        digitalWrite(PIN_LED_ERROR, HIGH);
    }
    http.end();
}

void pollCommands() {
    if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE) return;
    
    Serial.println("Polling for commands...");

    HTTPClient http;
    // Use RPC to bypass RLS
    String url = String(SUPABASE_URL) + "/rest/v1/rpc/get_next_command";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    
    String body = "{\"p_device_id\": \"" + deviceDbId + "\"}";
    
    int code = http.POST(body);

    if (code == 200) {
        String resp = http.getString();
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, resp);

        if (error) {
            Serial.print("Command JSON Parse Error: ");
            Serial.println(error.c_str());
            digitalWrite(PIN_LED_ERROR, HIGH);
            http.end();
            return;
        }

        // Handle both single object and array
        JsonVariant cmdData = doc.as<JsonVariant>();
        if (cmdData.is<JsonArray>()) {
            if (cmdData.size() == 0) {
                // This is normal, no commands pending
                http.end();
                return;
            }
            // If it's an array, process the first element
            cmdData = cmdData[0];
        }
        
        if (cmdData.is<JsonObject>()) {
            JsonObject cmdObj = cmdData.as<JsonObject>();
            String cmdId = cmdObj["id"].as<String>();
            const char* cmd = cmdObj["command"];
            
            if (!cmd) {
                Serial.println("Received command object without 'command' field.");
                digitalWrite(PIN_LED_ERROR, HIGH);
                http.end();
                return;
            }
            
            Serial.print("*** COMMAND RECEIVED: ");
            Serial.print(cmd);
            Serial.println(" ***");
            
            // Execute
            bool executed = false;
            if (strcmp(cmd, "RING") == 0) {
                Serial.println("Executing command: RING");
                playBell();
                executed = true;
            } else if (strcmp(cmd, "TEST_BUZZER") == 0) {
                Serial.println("Executing command: TEST_BUZZER");
                testBuzzer();
                executed = true;
            } else if (strcmp(cmd, "SYNC_TIME") == 0) {
                Serial.println("Executing command: SYNC_TIME");
                timeClient.forceUpdate();
                Serial.println("Time Synced via Command");
                executed = true;
            } else if (strcmp(cmd, "CONFIG") == 0) {
                Serial.println("Config Command Received. Refreshing details...");
                fetchDeviceDetails();
                syncSchedules();
                executed = true;
            } else if (strcmp(cmd, "REBOOT") == 0) {
                Serial.println("Reboot Command Received. Restarting in 1s...");
                executed = true; 
            } else if (strcmp(cmd, "UPDATE_FIRMWARE") == 0) {
                Serial.println("Firmware Update Command Received.");
                executed = true;
            }
            
            // Ack
            if (executed) {
                if (cmdId.length() == 0) {
                     Serial.println("Warning: No Command ID, skipping Ack.");
                } else {
                    HTTPClient ackHttp;
                    // Use RPC to bypass RLS for Ack
                    String ackUrl = String(SUPABASE_URL) + "/rest/v1/rpc/ack_command";
                    ackHttp.begin(ackUrl);
                    ackHttp.addHeader("Content-Type", "application/json");
                    ackHttp.addHeader("apikey", SUPABASE_KEY);
                    ackHttp.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
                    
                    String patchBody = "{\"p_command_id\": " + cmdId + "}";
                    int ackCode = ackHttp.POST(patchBody);
                    ackHttp.end();
                    
                    if (ackCode == 200 || ackCode == 204) {
                         Serial.printf("Command Acknowledged (ID: %s, Status: %d)\n", cmdId.c_str(), ackCode);
                         digitalWrite(PIN_LED_ERROR, LOW);
                    } else {
                         Serial.printf("Ack Failed (ID: %s, Status: %d)\n", cmdId.c_str(), ackCode);
                         digitalWrite(PIN_LED_ERROR, HIGH);
                    }
                }
                
                if (strcmp(cmd, "REBOOT") == 0) {
                    delay(1000);
                    ESP.restart();
                }
                if (strcmp(cmd, "UPDATE_FIRMWARE") == 0) {
                    String fwUrl = cmdObj["payload"]["url"];
                    if (fwUrl.length() > 0) performOTAUpdate(fwUrl);
                }
            }
        }
    } else {
        Serial.print("Poll Failed. Code: ");
        Serial.println(code);
        if (code != 200) Serial.println(http.getString());
        digitalWrite(PIN_LED_ERROR, HIGH);
    }
    http.end();
}

void sendHeartbeat() {
    if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE) return;
    
    Serial.println("Sending Heartbeat...");

    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/rpc/update_heartbeat";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    http.addHeader("Content-Type", "application/json");
    
    String payload = "{\"p_device_id\": \"" + deviceDbId + "\", \"p_status\": \"online\"}";
    
    int code = http.POST(payload);
    
    if (code == 200 || code == 204) {
        Serial.println("Heartbeat sent successfully (RPC)");
        digitalWrite(PIN_LED_ERROR, LOW);
    } else {
        Serial.print("Heartbeat failed: ");
        Serial.println(code);
        Serial.println(http.getString());
        digitalWrite(PIN_LED_ERROR, HIGH);
    }
    http.end();
}

// ==========================================
// STORAGE & PARSING
// ==========================================

void saveSchedulesToStorage(const String& jsonContent) {
    File file = LittleFS.open("/schedules.json", "w");
    if (!file) {
        Serial.println("Failed to open file for writing");
        return;
    }
    file.print(jsonContent);
    file.close();
    Serial.println("Schedules cached to LittleFS");
}

void loadSchedulesFromStorage() {
    if (!LittleFS.exists("/schedules.json")) {
        Serial.println("No cached schedules found");
        return;
    }
    
    File file = LittleFS.open("/schedules.json", "r");
    if (!file) {
        Serial.println("Failed to open file for reading");
        return;
    }
    
    String content = file.readString();
    file.close();
    Serial.println("Loaded cached schedules");
    parseSchedules(content);
}

void parseSchedules(const String& jsonString) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, jsonString);
    
    if (error) {
        Serial.print("deserializeJson() failed: ");
        Serial.println(error.c_str());
        return;
    }
    
    activeSchedules.clear();
    JsonArray arr = doc["schedules"];
    
    for (JsonObject obj : arr) {
        const char* timeStr = obj["bell_time"];
        
        ScheduleItem item;
        int h, m, s;
        // Robust parsing: Initialize s to 0 in case it's missing
        s = 0; 
        int parsed = sscanf(timeStr, "%d:%d:%d", &h, &m, &s);
        
        item.hour = h;
        item.minute = m;
        
        JsonArray days = obj["days_of_week"];
        Serial.printf("  + Schedule: %02d:%02d (Parsed %d items) Days: ", h, m, parsed);
        for(int d : days) {
            item.days.push_back(d);
            Serial.print(d);
            Serial.print(" ");
        }
        Serial.println();
        
        activeSchedules.push_back(item);
    }
    
    Serial.print("Parsed ");
    Serial.print(activeSchedules.size());
    Serial.println(" schedules.");
}
