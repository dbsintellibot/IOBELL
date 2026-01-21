/*
 * AutoBell ESP32 Controller - SaaS Connected Version
 * 
 * Features:
 * - Connects to Wi-Fi
 * - Connects to Supabase (via REST API)
 * - Fetches Schedule from Cloud
 * - Polls for Real-time Commands (Manual Ring)
 * - Offline Fallback (RTC + Cached Schedule)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> // Make sure to install ArduinoJson library
#include <Wire.h>
#include <RTClib.h>
#include <Preferences.h>

// ==========================================
// User Configuration
// ==========================================
// WiFi Credentials
const char* WIFI_SSID = "Your_WiFi_SSID";
const char* WIFI_PASS = "Your_WiFi_Password";

// Supabase Configuration
const char* SUPABASE_URL = "https://zelpaafberhmslyoegzu.supabase.co"; 
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbHBhYWZiZXJobXNseW9lZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTkxNTYsImV4cCI6MjA4NDU5NTE1Nn0.LOuknCbvzw5CryGX2eta2vgkx5IvrE1mxPaUDBBeDD8"; // Or use a Service Role key cautiously if RLS allows

// Device Identity
// In production, this might be derived from ESP.getEfuseMac()
String DEVICE_MAC_ADDRESS = "AA:BB:CC:DD:EE:FF"; 

// ==========================================
// Hardware Configuration
// ==========================================
#define PIN_RELAY_1 32
#define PIN_RELAY_2 33
#define PIN_LED_1   25
#define PIN_LED_2   26
#define PIN_BUZZER  27
#define PIN_SDA 21
#define PIN_SCL 22

#define BELL_DURATION_MS 5000
#define NUM_SLOTS 50 // Increased slot capacity

// ==========================================
// Global Objects
// ==========================================
RTC_DS3231 rtc;
Preferences preferences;

struct BellSlot {
  int hour;
  int minute;
  bool active;
  // byte days; // Bitmask for days? Keeping simple for now
};

BellSlot schedule[NUM_SLOTS];

// State
bool bellActive = false;
unsigned long bellStartTime = 0;
int lastTriggerMinute = -1;
int lastTriggerDay = -1;
unsigned long lastPollTime = 0;
unsigned long lastScheduleSyncTime = 0;

// Timing Intervals
const unsigned long CMD_POLL_INTERVAL = 5000;    // Check commands every 5s
const unsigned long SCHEDULE_SYNC_INTERVAL = 3600000; // Sync schedule every 1h (or on boot)

// ==========================================
// Forward Declarations
// ==========================================
void connectWiFi();
void syncSchedule();
void pollCommands();
void checkBell();
void triggerBell();
void stopBell();
void loadScheduleFromNVS();
void saveScheduleToNVS();

// ==========================================
// Setup
// ==========================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n\n=== AutoBell SaaS Controller ===");

  // 1. Init GPIO
  pinMode(PIN_RELAY_1, OUTPUT);
  pinMode(PIN_RELAY_2, OUTPUT);
  pinMode(PIN_LED_1, OUTPUT);
  pinMode(PIN_LED_2, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  
  digitalWrite(PIN_RELAY_1, LOW);
  digitalWrite(PIN_RELAY_2, LOW);
  digitalWrite(PIN_LED_1, LOW);
  digitalWrite(PIN_LED_2, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  // 2. Init RTC
  Wire.begin(PIN_SDA, PIN_SCL);
  if (!rtc.begin()) {
    Serial.println("Error: RTC not found!");
  }
  if (rtc.lostPower()) {
    Serial.println("RTC lost power, setting default.");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  // 3. Load Offline Schedule
  loadScheduleFromNVS();

  // 4. Connect to Cloud
  connectWiFi();
  
  // 5. Initial Cloud Sync
  if (WiFi.status() == WL_CONNECTED) {
    syncSchedule();
  }
}

// ==========================================
// Main Loop
// ==========================================
void loop() {
  // Reconnect WiFi if lost
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWiFiCheck = 0;
    if (millis() - lastWiFiCheck > 30000) {
      connectWiFi();
      lastWiFiCheck = millis();
    }
  }

  // Poll Commands (Manual Ring, etc.)
  if (millis() - lastPollTime > CMD_POLL_INTERVAL) {
    if (WiFi.status() == WL_CONNECTED) {
      pollCommands();
    }
    lastPollTime = millis();
  }

  // Sync Schedule Periodic
  if (millis() - lastScheduleSyncTime > SCHEDULE_SYNC_INTERVAL) {
    if (WiFi.status() == WL_CONNECTED) {
      syncSchedule();
    }
    lastScheduleSyncTime = millis();
  }

  // Core Bell Logic
  checkBell();

  delay(100);
}

// ==========================================
// Cloud Functions
// ==========================================

void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    // Sync RTC with NTP here if needed
  } else {
    Serial.println("\nWiFi Connection Failed. Running Offline.");
  }
}

// Call Supabase RPC: get_device_config
void syncSchedule() {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/get_device_config";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  // Payload: { "device_mac": "..." }
  String payload = "{\"device_mac\": \"" + DEVICE_MAC_ADDRESS + "\"}";
  
  int httpResponseCode = http.POST(payload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Sync Response: " + response);
    
    // Parse JSON
    DynamicJsonDocument doc(4096);
    DeserializationError error = deserializeJson(doc, response);

    if (!error) {
      JsonArray slots = doc["schedules"].as<JsonArray>();
      
      // Clear current schedule
      for(int i=0; i<NUM_SLOTS; i++) schedule[i].active = false;
      
      int idx = 0;
      for (JsonObject slot : slots) {
        if (idx >= NUM_SLOTS) break;
        
        const char* timeStr = slot["bell_time"]; // "08:30:00"
        
        // Parse "HH:MM:SS"
        int h, m, s;
        sscanf(timeStr, "%d:%d:%d", &h, &m, &s);
        
        schedule[idx].hour = h;
        schedule[idx].minute = m;
        schedule[idx].active = true;
        idx++;
      }
      
      saveScheduleToNVS();
      Serial.println("Schedule updated from Cloud.");
    } else {
      Serial.println("JSON Parse Error");
    }
  } else {
    Serial.print("Error on sending POST: ");
    Serial.println(httpResponseCode);
  }
  
  http.end();
}

// Call Supabase RPC: poll_commands
void pollCommands() {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/poll_commands";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  String payload = "{\"device_mac\": \"" + DEVICE_MAC_ADDRESS + "\"}";
  
  int httpResponseCode = http.POST(payload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    // Expected: { "has_command": true, "command": "RING", "payload": ... }
    
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, response);
    
    if (doc["has_command"] == true) {
      String cmd = doc["command"].as<String>();
      Serial.println("Received Command: " + cmd);
      
      if (cmd == "RING") {
        triggerBell();
      } else if (cmd == "REBOOT") {
        ESP.restart();
      }
    }
  }
  
  http.end();
}

// ==========================================
// Logic Implementation
// ==========================================

void checkBell() {
  if (bellActive) {
    if (millis() - bellStartTime >= BELL_DURATION_MS) {
      stopBell();
    }
    return;
  }

  DateTime now = rtc.now();

  // Safety: Once per minute
  if (now.minute() == lastTriggerMinute && now.day() == lastTriggerDay) {
    return;
  }

  for (int i = 0; i < NUM_SLOTS; i++) {
    if (!schedule[i].active) continue;

    if (now.hour() == schedule[i].hour && now.minute() == schedule[i].minute) {
      triggerBell();
      lastTriggerMinute = now.minute();
      lastTriggerDay = now.day();
      
      Serial.print("BELL TRIGGERED at ");
      Serial.print(now.hour());
      Serial.print(":");
      Serial.println(now.minute());
      break;
    }
  }
}

void triggerBell() {
  bellActive = true;
  bellStartTime = millis();
  
  digitalWrite(PIN_RELAY_1, HIGH);
  digitalWrite(PIN_RELAY_2, HIGH);
  digitalWrite(PIN_LED_1, HIGH);
  digitalWrite(PIN_LED_2, HIGH);
  digitalWrite(PIN_BUZZER, HIGH);
}

void stopBell() {
  bellActive = false;
  digitalWrite(PIN_RELAY_1, LOW);
  digitalWrite(PIN_RELAY_2, LOW);
  digitalWrite(PIN_LED_1, LOW);
  digitalWrite(PIN_LED_2, LOW);
  digitalWrite(PIN_BUZZER, LOW);
}

// ==========================================
// NVS Storage (Offline Support)
// ==========================================
void loadScheduleFromNVS() {
  preferences.begin("sched", true); // Read-only
  int count = preferences.getInt("count", 0);
  
  for (int i = 0; i < count; i++) {
    if (i >= NUM_SLOTS) break;
    char keyH[8], keyM[8];
    sprintf(keyH, "h%d", i);
    sprintf(keyM, "m%d", i);
    
    schedule[i].hour = preferences.getInt(keyH, 0);
    schedule[i].minute = preferences.getInt(keyM, 0);
    schedule[i].active = true;
  }
  preferences.end();
  Serial.println("Loaded offline schedule.");
}

void saveScheduleToNVS() {
  preferences.begin("sched", false); // Read-write
  
  int activeCount = 0;
  for (int i = 0; i < NUM_SLOTS; i++) {
    if (schedule[i].active) {
      char keyH[8], keyM[8];
      sprintf(keyH, "h%d", activeCount);
      sprintf(keyM, "m%d", activeCount);
      
      preferences.putInt(keyH, schedule[i].hour);
      preferences.putInt(keyM, schedule[i].minute);
      activeCount++;
    }
  }
  preferences.putInt("count", activeCount);
  preferences.end();
  Serial.println("Schedule saved to NVS.");
}
