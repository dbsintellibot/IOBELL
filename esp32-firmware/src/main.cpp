#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include "DFRobotDFPlayerMini.h"
#include <LittleFS.h>
#include <vector>

// ==========================================
// CONFIGURATION
// ==========================================

// WiFi Credentials are now handled by WiFiManager

// Supabase Configuration
const char* SUPABASE_URL = "https://zelpaafberhmslyoegzu.supabase.co";
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbHBhYWZiZXJobXNseW9lZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTkxNTYsImV4cCI6MjA4NDU5NTE1Nn0.LOuknCbvzw5CryGX2eta2vgkx5IvrE1mxPaUDBBeDD8";

// Pin Definitions
#define PIN_DFPLAYER_RX 16 // Connect to DFPlayer TX
#define PIN_DFPLAYER_TX 17 // Connect to DFPlayer RX
#define PIN_LED_WIFI    2  // Built-in LED (ON = Connected)
#define PIN_LED_ERROR   4  // Error LED

// Settings
const long  UTC_OFFSET_SEC = 0; // Adjust timezone here or fetch from API
const unsigned long SCHEDULE_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const unsigned long COMMAND_POLL_INTERVAL = 5 * 1000;      // 5 seconds

// ==========================================
// GLOBALS
// ==========================================

WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", UTC_OFFSET_SEC);
DFRobotDFPlayerMini myDFPlayer;
HardwareSerial dfPlayerSerial(2); // Use UART2

Preferences preferences;
char deviceName[40] = "AutoBell Device";
char schoolId[40]   = "";
bool shouldSaveConfig = false; // Flag for saving data from WiFiManager

String deviceMacAddress;
String deviceDbId = "";
unsigned long lastScheduleSync = 0;
unsigned long lastCommandPoll = 0;

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
void loadSchedulesFromStorage();
void saveSchedulesToStorage(const String& jsonContent);
void playBell();
void parseSchedules(const String& jsonString);
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
    digitalWrite(PIN_LED_WIFI, LOW);
    
    // Init LittleFS
    if(!LittleFS.begin(true)){
        Serial.println("LittleFS Mount Failed");
        digitalWrite(PIN_LED_ERROR, HIGH);
        // We continue, but storage won't work
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

    // Get MAC Address
    deviceMacAddress = WiFi.macAddress();
    Serial.print("Device MAC: ");
    Serial.println(deviceMacAddress);

    // Load cached schedules first (in case of no WiFi)
    loadSchedulesFromStorage();

    // WiFiManager
    WiFiManager wm;
    wm.setSaveConfigCallback(saveConfigCallback);
    
    // Custom params
    WiFiManagerParameter custom_device_name("name", "Device Name", deviceName, 40);
    WiFiManagerParameter custom_school_id("school", "School ID", schoolId, 40);
    
    wm.addParameter(&custom_device_name);
    wm.addParameter(&custom_school_id);
    
    // Connect
    if (!wm.autoConnect("AutoBell-Setup")) {
        Serial.println("Failed to connect and hit timeout");
        delay(3000);
        ESP.restart(); // Reset and try again
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
    preferences.end(); // Close preferences

    // Initial Sync
    syncSchedules();

    // Init NTP
    timeClient.begin();
}

// ==========================================
// LOOP
// ==========================================
void loop() {
    // 1. WiFi Management
    if (WiFi.status() != WL_CONNECTED) {
        digitalWrite(PIN_LED_WIFI, LOW);
        Serial.println("WiFi lost, reconnecting...");
        WiFi.reconnect();
        delay(5000); // Wait a bit before retry
        return;
    } else {
        digitalWrite(PIN_LED_WIFI, HIGH);
    }

    // 2. Update Time
    timeClient.update();

    // 3. Scheduler Logic (Run every second)
    static unsigned long lastTick = 0;
    if (millis() - lastTick >= 1000) {
        lastTick = millis();
        
        int currentDay = timeClient.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        // Convert NTP day (0-6, Sun-Sat) to Database day (1-7, Mon-Sun)
        // NTP: 0(Sun), 1(Mon), 2(Tue), 3(Wed), 4(Thu), 5(Fri), 6(Sat)
        // DB:  7(Sun), 1(Mon), 2(Tue), 3(Wed), 4(Thu), 5(Fri), 6(Sat)
        int dbDay = (currentDay == 0) ? 7 : currentDay;
        
        int currentH = timeClient.getHours();
        int currentM = timeClient.getMinutes();
        int currentS = timeClient.getSeconds();

        // Only check at the start of the minute (00 seconds)
        if (currentS == 0) {
            Serial.printf("Time: %02d:%02d (Day: %d)\n", currentH, currentM, dbDay);
            for (const auto& sch : activeSchedules) {
                if (sch.hour == currentH && sch.minute == currentM) {
                    // Check if today is in the active days
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
                    }
                }
            }
        }
    }

    // 4. Poll Commands (Every 5s)
    if (millis() - lastCommandPoll >= COMMAND_POLL_INTERVAL) {
        lastCommandPoll = millis();
        pollCommands();
    }

    // 5. Sync Schedules (Every 5m)
    if (millis() - lastScheduleSync >= SCHEDULE_SYNC_INTERVAL) {
        lastScheduleSync = millis();
        syncSchedules();
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
    // This requires HTTPUpdate library and logic
}

void playBell() {
    myDFPlayer.play(1); // Play the first mp3 on SD card
}

// -------------------------------------------------------------------------
// API FUNCTIONS
// -------------------------------------------------------------------------

void fetchDeviceDetails() {
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    // URL encode is good practice, but for simple MAC it's fine
    String url = String(SUPABASE_URL) + "/rest/v1/bell_devices?select=id,school_id&mac_address=eq." + deviceMacAddress;
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    
    int code = http.GET();
    if (code == 200) {
        String resp = http.getString();
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, resp);
        
        if (!error && doc.size() > 0) {
            deviceDbId = doc[0]["id"].as<String>();
            String sId = doc[0]["school_id"].as<String>();
            sId.toCharArray(schoolId, 40); 
            Serial.println("Fetched Device ID: " + deviceDbId);
        } else {
            Serial.println("Device not found in DB or JSON error");
        }
    } else {
        Serial.print("fetchDeviceDetails Error: ");
        Serial.println(code);
    }
    http.end();
}

void syncSchedules() {
    if (WiFi.status() != WL_CONNECTED) return;
    
    if (deviceDbId == "") {
        fetchDeviceDetails();
        if (deviceDbId == "") return;
    }

    // 1. Get Profile (assume first one for now)
    String profileId = "";
    {
        HTTPClient http;
        String url = String(SUPABASE_URL) + "/rest/v1/bell_profiles?select=id&school_id=eq." + String(schoolId) + "&limit=1";
        http.begin(url);
        http.addHeader("apikey", SUPABASE_KEY);
        http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
        if (http.GET() == 200) {
             JsonDocument doc;
             deserializeJson(doc, http.getString());
             if (doc.size() > 0) profileId = doc[0]["id"].as<String>();
        }
        http.end();
    }
    
    if (profileId == "") {
        Serial.println("No profile found for school");
        return;
    }

    // 2. Get Times
    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/bell_times?select=bell_time,day_of_week&profile_id=eq." + profileId;
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    
    int code = http.GET();
    if (code == 200) {
        String resp = http.getString();
        
        // Transform DB format to Local format
        // DB: [ { "bell_time": "08:00:00", "day_of_week": [1,2,3] }, ... ]
        // Local: { "schedules": [ { "bell_time": "...", "days_of_week": [...] } ] }
        
        JsonDocument dbDoc;
        DeserializationError error = deserializeJson(dbDoc, resp);
        
        if (!error) {
            JsonDocument localDoc;
            JsonArray schedules = localDoc["schedules"].to<JsonArray>();
            
            for (JsonObject item : dbDoc.as<JsonArray>()) {
                JsonObject newSch = schedules.add<JsonObject>();
                newSch["bell_time"] = item["bell_time"];
                newSch["days_of_week"] = item["day_of_week"];
            }
            
            String finalJson;
            serializeJson(localDoc, finalJson);
            
            Serial.println("Sync Response: " + finalJson);
            saveSchedulesToStorage(finalJson);
            parseSchedules(finalJson);
        }
    } else {
         Serial.print("syncSchedules Error: ");
         Serial.println(code);
    }
    http.end();
}

void pollCommands() {
    if (WiFi.status() != WL_CONNECTED) return;
    
    if (deviceDbId == "") {
        fetchDeviceDetails();
        if (deviceDbId == "") return;
    }

    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/command_queue?select=id,command,payload&status=eq.pending&device_id=eq." + deviceDbId + "&limit=1&order=created_at.asc";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    
    int code = http.GET();
    if (code == 200) {
        String resp = http.getString();
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, resp);
        
        if (!error && doc.size() > 0) {
            JsonObject cmdObj = doc[0];
            String cmdId = cmdObj["id"].as<String>();
            const char* cmd = cmdObj["command"];
            
            Serial.print("Received Command: ");
            Serial.println(cmd);
            
            // Execute
            bool executed = false;
            if (strcmp(cmd, "RING") == 0) {
                playBell();
                executed = true;
            } else if (strcmp(cmd, "SYNC_TIME") == 0) {
                timeClient.forceUpdate();
                executed = true;
            } else if (strcmp(cmd, "REBOOT") == 0) {
                executed = true; 
            } else if (strcmp(cmd, "UPDATE_FIRMWARE") == 0) {
                executed = true;
            }
            
            // Ack
            if (executed) {
                HTTPClient ackHttp;
                String ackUrl = String(SUPABASE_URL) + "/rest/v1/command_queue?id=eq." + cmdId;
                ackHttp.begin(ackUrl);
                ackHttp.addHeader("Content-Type", "application/json");
                ackHttp.addHeader("apikey", SUPABASE_KEY);
                ackHttp.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
                
                String patchBody = "{\"status\": \"executed\"}"; // Timestamp handled by DB trigger or we can add it
                // Using sendRequest for PATCH to be safe across ESP32 cores
                int ackCode = ackHttp.sendRequest("PATCH", patchBody);
                ackHttp.end();
                Serial.printf("Ack sent: %d\n", ackCode);
                
                if (strcmp(cmd, "REBOOT") == 0) {
                    delay(500);
                    ESP.restart();
                }
                if (strcmp(cmd, "UPDATE_FIRMWARE") == 0) {
                    String fwUrl = cmdObj["payload"]["url"];
                    if (fwUrl.length() > 0) performOTAUpdate(fwUrl);
                }
            }
        }
    }
    http.end();
}

// -------------------------------------------------------------------------
// STORAGE & PARSING
// -------------------------------------------------------------------------

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
    // Response format from RPC: { "status": "ok", "schedules": [ { "bell_time": "08:30:00", "days_of_week": [1,2,3,4,5] }, ... ] }
    
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
        const char* timeStr = obj["bell_time"]; // "08:30:00"
        
        ScheduleItem item;
        // Parse HH:MM:SS
        int h, m, s;
        sscanf(timeStr, "%d:%d:%d", &h, &m, &s);
        item.hour = h;
        item.minute = m;
        
        JsonArray days = obj["days_of_week"];
        for(int d : days) {
            item.days.push_back(d);
        }
        
        activeSchedules.push_back(item);
    }
    
    Serial.print("Parsed ");
    Serial.print(activeSchedules.size());
    Serial.println(" schedules.");
}
