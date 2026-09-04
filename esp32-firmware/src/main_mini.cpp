#include "esp_log.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <Update.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <RTClib.h>
#include <Ticker.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <Wire.h>
#include <esp_sntp.h>
#include <esp_task_wdt.h>
#include <esp_wifi.h>
#include <time.h>
#include <vector>

// LCD Display
#include <LiquidCrystal_I2C.h>

// ==========================================
// CONFIGURATION
// ==========================================

// Supabase Configuration
char SUPABASE_URL[100] = "https://hjlwzkwiweocnfztshmy.supabase.co";
char SUPABASE_KEY[300] =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbHd6a3dpd2VvY25menRzaG15Iiwicm9sZSI6Im"
    "Fub24iLCJpYXQiOjE3ODMzNjEyNDEsImV4cCI6MjA5ODkzNzI0MX0."
    "OUx-ZWTdA-_BCW8sbIMw8E13CONOh5IjcjLko87RRC0";

#define FIRMWARE_VERSION "1.0.1"
#define BOARD_TYPE "ESP32-C3 Mini"

// Pin configuration for ESP32-C3 Mini
#define PIN_LED_WIFI        2
#define PIN_LED_POWER       3
#define PIN_BUZZER          10
#define PIN_RELAY_1         4
#define PIN_RELAY_2         5
#define PIN_RTC_SDA         8
#define PIN_RTC_SCL         9
#define PIN_MANUAL_BUTTON   6   // Physical manual ring button on GPIO 6 (Active LOW / Pullup)

// Relay Logic: Active LOW (LOW = Relay ON/Energized, HIGH = Relay OFF/De-energized)
#define RELAY_ACTIVE        LOW
#define RELAY_INACTIVE      HIGH

// Interval Settings
const long UTC_OFFSET_SEC = 18000; // GMT+5 default
const unsigned long SCHEDULE_SYNC_INTERVAL = 5 * 60 * 1000; // 5 min
const unsigned long COMMAND_POLL_INTERVAL = 5 * 1000;       // 5 sec
const unsigned long HEARTBEAT_INTERVAL = 60 * 1000;         // 1 min
const unsigned long PROVISION_POLL_INTERVAL = 10 * 1000;     // 10 sec

const char *NTP_SERVERS[] = {"pk.pool.ntp.org", "pool.ntp.org", "time.google.com"};

// ==========================================
// GLOBALS
// ==========================================

RTC_DS3231 rtc;
bool rtcFound = false;

LiquidCrystal_I2C lcd(0x27, 16, 2);
bool lcdFound = false;

String currentEventLabel = "";
bool relayActive = false;
unsigned long relayOffTime = 0;
bool buzzerActive = false;
unsigned long buzzerOffTime = 0;

Preferences preferences;
char deviceName[40] = "AutoBell Mini";
char schoolId[40] = "";
bool shouldSaveConfig = false;

String deviceMacAddress;
String deviceDbId = "";
unsigned long lastScheduleSync = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastProvisionPoll = 0;

enum DeviceState { STATE_BOOT, STATE_UNASSIGNED, STATE_PENDING_ACTIVATION, STATE_ACTIVE, STATE_EXPIRED };
DeviceState currentState = STATE_BOOT;

struct ScheduleItem {
  int hour;
  int minute;
  int second;
  std::vector<int> days; // 0=Sun, ..., 6=Sat
  String label;
  time_t lastRung;
  int durationSeconds;
};
std::vector<ScheduleItem> activeSchedules;

Ticker timer1s;
volatile bool scheduleTick = false;
bool timeSynced = false;

// ==========================================
// FUNCTION PROTOTYPES
// ==========================================
void fetchDeviceDetails();
void initLCD();
void lcdPrintLine(int row, String text);
void updateLCD();
void syncSchedules();
void pollCommands();
void sendHeartbeat();
void loadSchedulesFromStorage();
void triggerRelay(int durationSeconds);
void triggerBuzzer(int durationMs);
void testBuzzer();
void parseSchedules(const JsonDocument &doc);
void getCurrentTime(int &h, int &m, int &s, int &d);
void saveConfigCallback();
void checkSerialCommands();
void checkSchedule();
void timeSyncCallback(struct timeval *tv);
void onSecondTick();
void performOTAUpdate(const String &url);
void logToDatabase(String level, String message);
void ackCommand(String cmdId);

// ==========================================
// CALLBACKS & TIMERS
// ==========================================
void timeSyncCallback(struct timeval *tv) {
  Serial.println("SNTP Sync Event Detected");
  if (rtcFound) {
    rtc.adjust(DateTime(tv->tv_sec));
    Serial.println("RTC Updated from SNTP");
  }
  timeSynced = true;
}

void onSecondTick() {
  scheduleTick = true;
}

void printSystemHealth() {
  Serial.printf("HEALTH: Heap: %u | Uptime: %lu s | WiFi: %d dBm\n",
                ESP.getFreeHeap(), millis() / 1000, WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0);
}

// ==========================================
// INITIAL SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n\n--- AUTO-BELL MINI BOOT ---");
  esp_log_level_set("*", ESP_LOG_WARN);

  // Maintain native 160MHz clock for ESP32-C3 Wi-Fi stability & RF timing
  setCpuFrequencyMhz(160);

  bool prefOpened = preferences.begin("autobell_mini", false);
  Serial.printf("[NVS-Debug] Preferences open status: %s\n", prefOpened ? "SUCCESS" : "FAILED");
  String storedName = preferences.getString("dev_name", "AutoBell Mini");
  String storedSchool = preferences.getString("school_id", "");
  bool wifiInitialized = preferences.getBool("wifi_init", false);
  bool storedIsActive = preferences.getBool("is_active", false);
  Serial.printf("[NVS-Debug] loaded wifi_initialized: %d\n", wifiInitialized);
  Serial.printf("[NVS-Debug] loaded dev_name: '%s', school_id: '%s'\n", storedName.c_str(), storedSchool.c_str());
  storedName.toCharArray(deviceName, 40);
  storedSchool.toCharArray(schoolId, 40);
  if (storedSchool.length() > 0 || storedIsActive) {
    currentState = STATE_ACTIVE;
  }

  String storedSupaUrl = preferences.getString("supa_url", "");
  String storedSupaKey = preferences.getString("supa_key", "");
  if (storedSupaUrl.length() > 0) {
    storedSupaUrl.toCharArray(SUPABASE_URL, 100);
  }
  if (storedSupaKey.length() > 0) {
    storedSupaKey.toCharArray(SUPABASE_KEY, 300);
  }

  // Initialize GPIO pins (Ensure active-low relays stay HIGH / OFF on power up)
  digitalWrite(PIN_RELAY_1, RELAY_INACTIVE);
  digitalWrite(PIN_RELAY_2, RELAY_INACTIVE);
  pinMode(PIN_RELAY_1, OUTPUT);
  pinMode(PIN_RELAY_2, OUTPUT);
  digitalWrite(PIN_RELAY_1, RELAY_INACTIVE);
  digitalWrite(PIN_RELAY_2, RELAY_INACTIVE);

  pinMode(PIN_LED_POWER, OUTPUT);
  pinMode(PIN_LED_WIFI, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_MANUAL_BUTTON, INPUT_PULLUP);

  digitalWrite(PIN_LED_POWER, HIGH);  // Power indicator solid ON
  digitalWrite(PIN_LED_WIFI, LOW);    // Blinks during connection
  digitalWrite(PIN_BUZZER, LOW);

  // Initialize I2C Bus for LCD & RTC
  Wire.begin(PIN_RTC_SDA, PIN_RTC_SCL);
  
  // Scan for LCD at address 0x27 to prevent blocking hangs if LCD is missing
  Wire.beginTransmission(0x27);
  if (Wire.endTransmission() == 0) {
    lcdFound = true;
    initLCD();
    char verLine[17];
    snprintf(verLine, sizeof(verLine), "AutoBell Mini v%s", FIRMWARE_VERSION);
    lcdPrintLine(0, verLine);
    lcdPrintLine(1, "Digitap Biz Sol.");
    delay(2000);
  } else {
    lcdFound = false;
    Serial.println("LCD not found at address 0x27 - skipping LCD prints");
  }

  // Init RTC
  if (!rtc.begin()) {
    Serial.println("Couldn't find RTC");
  } else {
    rtcFound = true;
    Serial.println("RTC Found");
    DateTime now = rtc.now();
    Serial.printf("RTC Raw Time: %04d-%02d-%02d %02d:%02d:%02d (lostPower: %s)\n",
                  now.year(), now.month(), now.day(), now.hour(),
                  now.minute(), now.second(), rtc.lostPower() ? "YES" : "NO");
    if (now.year() >= 2024 && now.year() <= 2050) {
      struct timeval tv = {.tv_sec = (time_t)now.unixtime(), .tv_usec = 0};
      settimeofday(&tv, NULL);
      Serial.printf("System Time set from RTC: %04d-%02d-%02d %02d:%02d:%02d\n",
                    now.year(), now.month(), now.day(), now.hour(),
                    now.minute(), now.second());
    }
  }

  // Mount LittleFS for local schedule caching
  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS Mount Failed");
  }

  // Initialize WiFi to Station Mode for Diagnostics & MAC extraction
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  
  // Lock TX power to 8.5 dBm to prevent brownouts/stability issues on C3 SuperMini on boot connection
  esp_wifi_set_max_tx_power(34); 
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  
  delay(100);

  deviceMacAddress = WiFi.macAddress();
  Serial.print("Device MAC: ");
  Serial.println(deviceMacAddress);

  // Perform a test scan to verify 2.4GHz RF hardware health, then immediately delete scan cache
  // Serial.println("\n--- Scanning 2.4GHz Wi-Fi Networks ---");
  // int scanCount = WiFi.scanNetworks();
  // Serial.printf("Scan complete: %d networks found in the area:\n", scanCount);
  // for (int i = 0; i < scanCount; i++) {
  //   Serial.printf("  [%d] SSID: '%s' | RSSI: %d dBm | Ch: %d | Enc: %d\n",
  //                 i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i), WiFi.encryptionType(i));
  // }
  // Serial.println("--------------------------------------\n");
  // WiFi.scanDelete(); // Release memory and reset Wi-Fi core state
  delay(100);

  // Load schedule cache
  loadSchedulesFromStorage();

  WiFiManager wm;
  wm.setSaveConfigCallback(saveConfigCallback);

  if (!wifiInitialized) {
    wm.setConfigPortalTimeout(60); // 1 minute timeout for AP setup on boot
    lcdPrintLine(0, "AP:AutoBell-Setup");
    lcdPrintLine(1, "IP: 192.168.4.1 ");
  } else {
    wm.setConfigPortalTimeout(60); // 60s timeout on subsequent boot failure
    lcdPrintLine(0, "Connecting to   ");
    lcdPrintLine(1, "WiFi...         ");
  }

  wm.setAPCallback([](WiFiManager *myWiFiManager) {
    Serial.println("\n==========================================");
    Serial.println("[WiFiManager] SoftAP Broadcast STARTED!");
    Serial.println("  SSID: " + myWiFiManager->getConfigPortalSSID());
    Serial.println("  IP:   " + WiFi.softAPIP().toString());
    Serial.println("==========================================\n");

    lcdPrintLine(0, "AP:AutoBell-Setup");
    lcdPrintLine(1, "IP: 192.168.4.1 ");

    esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);
    esp_wifi_set_protocol(WIFI_IF_AP, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);
    esp_wifi_set_max_tx_power(34); // 8.5 dBm
    WiFi.setTxPower(WIFI_POWER_8_5dBm);
  });

  WiFiManagerParameter custom_device_name("name", "Device Name", deviceName, 40);
  WiFiManagerParameter custom_school_id("school", "School ID (Optional)", schoolId, 40);
  WiFiManagerParameter custom_supa_url("supa_url", "Supabase URL", SUPABASE_URL, 100);
  WiFiManagerParameter custom_supa_key("supa_key", "Supabase Key", SUPABASE_KEY, 300);

  wm.addParameter(&custom_device_name);
  wm.addParameter(&custom_school_id);
  wm.addParameter(&custom_supa_url);
  wm.addParameter(&custom_supa_key);

  Serial.println("Attempting connection / starting config portal...");
  if (!wm.autoConnect("AutoBell-Setup")) {
    Serial.println("Config portal timed out (60s). Continuing in offline mode.");
    lcdPrintLine(0, "Setup Timeout   ");
    lcdPrintLine(1, "Offline Mode... ");
    delay(2000);
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
  }

  WiFi.softAPdisconnect(true); // Cleanly stop AP (C3 fix)
  WiFi.mode(WIFI_STA);         // Set station mode only

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected successfully!");
    lcdPrintLine(0, "WiFi Connected! ");
    lcdPrintLine(1, WiFi.localIP().toString());
    delay(2000);
    digitalWrite(PIN_LED_WIFI, HIGH);
    preferences.putBool("wifi_init", true);
  } else {
    Serial.println("\nRunning in Offline Mode.");
    lcdPrintLine(0, "WiFi Offline    ");
    lcdPrintLine(1, "Running Offline ");
    delay(1500);
    digitalWrite(PIN_LED_WIFI, LOW);
  }

  if (shouldSaveConfig) {
    strcpy(deviceName, custom_device_name.getValue());
    strcpy(schoolId, custom_school_id.getValue());
    if (strlen(custom_supa_url.getValue()) > 0) {
      strcpy(SUPABASE_URL, custom_supa_url.getValue());
      preferences.putString("supa_url", SUPABASE_URL);
    }
    if (strlen(custom_supa_key.getValue()) > 0) {
      strcpy(SUPABASE_KEY, custom_supa_key.getValue());
      preferences.putString("supa_key", SUPABASE_KEY);
    }
    preferences.putString("dev_name", deviceName);
    if (strlen(schoolId) > 0) {
      preferences.putString("school_id", schoolId);
      preferences.putBool("is_active", true);
    }
  }

  // Watchdog configuration
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t twdt_config = {
      .timeout_ms = 60000,
      .idle_core_mask = (1 << 0),
      .trigger_panic = true,
  };
  if (esp_task_wdt_reconfigure(&twdt_config) != ESP_OK) {
    esp_task_wdt_init(&twdt_config);
  }
#else
  esp_task_wdt_init(60, true);
#endif
  esp_task_wdt_add(NULL);

  fetchDeviceDetails();

  // Initialize SNTP Time Server Setup
  Serial.println("Initializing SNTP...");
  sntp_set_time_sync_notification_cb(timeSyncCallback);
  configTime(UTC_OFFSET_SEC, 0, NTP_SERVERS[0], NTP_SERVERS[1], NTP_SERVERS[2]);

  // Tick schedule checks at 1Hz
  timer1s.attach(1.0, onSecondTick);

  if (currentState == STATE_ACTIVE) {
    syncSchedules();
  }
}

// ==========================================
// MAIN POLLING LOOP
// ==========================================
void loop() {
  esp_task_wdt_reset();

  // Periodic LCD Refresh (1Hz)
  static unsigned long lastLcdUpdate = 0;
  if (millis() - lastLcdUpdate >= 1000) {
    lastLcdUpdate = millis();
    updateLCD();
  }

  // Non-blocking Relay Cooldown Tracker
  if (relayActive && millis() >= relayOffTime) {
    digitalWrite(PIN_RELAY_1, RELAY_INACTIVE);
    delay(50); // Stagger relay off to reduce inductive spike
    digitalWrite(PIN_RELAY_2, RELAY_INACTIVE);
    relayActive = false;
    currentEventLabel = "";
    Serial.println("[Relays] Dual Relays Deactivated (Active LOW: HIGH level).");
    updateLCD();
  }

  // Non-blocking Buzzer Cooldown Tracker
  if (buzzerActive && millis() >= buzzerOffTime) {
    noTone(PIN_BUZZER);
    digitalWrite(PIN_BUZZER, LOW);
    buzzerActive = false;
    Serial.println("[Buzzer] Buzzer Deactivated.");
    updateLCD();
  }

  // Physical Manual Ring Button Check (Active LOW with debounce)
  static unsigned long lastBtnPress = 0;
  if (digitalRead(PIN_MANUAL_BUTTON) == LOW) {
    if (millis() - lastBtnPress > 2000) { // 2s debounce window
      lastBtnPress = millis();
      Serial.println("[Button] Physical Manual Ring Button Pressed!");
      if (currentState == STATE_ACTIVE) {
        currentEventLabel = "Manual Button";
        triggerRelay(5);       // Activate dual relays for 5s
        triggerBuzzer(1500);   // Alert buzzer locally for 1.5s
      } else {
        Serial.println("[Button] Inactive: Ring inhibited until product activation.");
        triggerBuzzer(300);    // Short beep to indicate unactivated state
      }
      updateLCD();
    }
  }

  // Check schedules every second
  if (scheduleTick) {
    scheduleTick = false;
    checkSchedule();
  }

  // WiFi Connectivity Maintenance & 1s LED Blink
  static unsigned long lastWiFiCheck = 0;
  static unsigned long lastLedToggle = 0;

  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastLedToggle >= 1000) {
      lastLedToggle = millis();
      static bool ledState = false;
      ledState = !ledState;
      digitalWrite(PIN_LED_WIFI, ledState ? HIGH : LOW);
    }

    if (millis() - lastWiFiCheck >= 10000) {
      lastWiFiCheck = millis();
      Serial.println("WiFi disconnected, retrying...");
      WiFi.reconnect();
    }
  } else {
    digitalWrite(PIN_LED_WIFI, HIGH); // Solid ON when connected
  }

  // Handle Unassigned / Pending Activation / Expired Device polling
  if (currentState == STATE_UNASSIGNED || currentState == STATE_BOOT || currentState == STATE_PENDING_ACTIVATION || currentState == STATE_EXPIRED) {
    if (millis() - lastProvisionPoll >= PROVISION_POLL_INTERVAL) {
      lastProvisionPoll = millis();
      fetchDeviceDetails();
      if (currentState == STATE_ACTIVE) {
        preferences.putString("school_id", schoolId);
        preferences.putString("supa_url", SUPABASE_URL);
        preferences.putString("supa_key", SUPABASE_KEY);
        syncSchedules();
      }
    }
    updateLCD();
    return;
  }

  // Sync tasks (Active Device State Only)
  if (millis() - lastCommandPoll >= COMMAND_POLL_INTERVAL) {
    lastCommandPoll = millis();
    pollCommands();
  }

  checkSerialCommands();

  if (millis() - lastScheduleSync >= SCHEDULE_SYNC_INTERVAL) {
    lastScheduleSync = millis();
    syncSchedules();
  }

  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    sendHeartbeat();
  }

  static unsigned long lastHealthCheck = 0;
  if (millis() - lastHealthCheck > 60000) {
    lastHealthCheck = millis();
    printSystemHealth();
  }
}

// ==========================================
// SCHEDULE CHECKS & TRIGGER ENGINE
// ==========================================
void checkSchedule() {
  int h, m, s, d;
  getCurrentTime(h, m, s, d);
  time_t now = time(NULL);

  static unsigned long lastDebug = 0;
  if (millis() - lastDebug > 10000) {
    Serial.printf("[SchDebug] Time: %02d:%02d:%02d Day: %d, Schedules: %d\n", h, m, s, d, activeSchedules.size());
    lastDebug = millis();
  }

  for (auto &sch : activeSchedules) {
    long diff = (h * 3600 + m * 60 + s) - (sch.hour * 3600 + sch.minute * 60 + sch.second);

    // Sync match check (Allowing 59s catchup window)
    if (diff >= 0 && diff <= 59) {
      bool dayMatch = false;
      for (int day : sch.days) {
        if (day == d) dayMatch = true;
      }

      if (dayMatch) {
        if (now - sch.lastRung > 60) {
          Serial.printf("[Scheduler] Executing Relay Bell Trigger: %02d:%02d:%02d (Day %d) - '%s' for %ds\n",
                        sch.hour, sch.minute, sch.second, d, sch.label.c_str(), sch.durationSeconds);
          
          currentEventLabel = sch.label;
          triggerRelay(sch.durationSeconds);       // Activate Dual Relays for configured duration
          triggerBuzzer(1500);   // Buzzer alerts locally for 1.5s
          
          sch.lastRung = now;
        }
      }
    }
  }
}

void triggerRelay(int durationSeconds) {
  if (durationSeconds <= 0) return;
  digitalWrite(PIN_RELAY_1, RELAY_ACTIVE);
  delay(50); // Stagger relay activation to prevent brownout reset
  digitalWrite(PIN_RELAY_2, RELAY_ACTIVE);
  relayOffTime = millis() + durationSeconds * 1000;
  relayActive = true;
  Serial.printf("[Relay] Dual Relays Activated (Active LOW: LOW level). Triggering gong bell for %ds...\n", durationSeconds);
}

void triggerBuzzer(int durationMs) {
  if (durationMs <= 0) return;
  tone(PIN_BUZZER, 3000);
  buzzerOffTime = millis() + durationMs;
  buzzerActive = true;
}

// ==========================================
// SUPABASE API SYNC & REGISTER
// ==========================================
void fetchDeviceDetails() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("fetchDeviceDetails: WiFi not connected!");
    return;
  }

  Serial.println("--- Fetching Device Details ---");
  if (currentState == STATE_BOOT) {
    lcdPrintLine(0, "Connecting      ");
    lcdPrintLine(1, "To Server...    ");
  }

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(30000);

  HTTPClient http;
  http.setConnectTimeout(30000);
  http.setUserAgent("ESP32-AutoBell/1.0");

  String url = String(SUPABASE_URL) + "/rest/v1/rpc/register_device_from_esp";

  if (!http.begin(client, url)) {
    Serial.println("HTTP Begin failed!");
    currentState = STATE_UNASSIGNED;
    return;
  }

  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");

  JsonDocument reqDoc;
  reqDoc["p_mac_address"] = deviceMacAddress;
  reqDoc["p_school_code"] = String(schoolId);
  reqDoc["p_device_name"] = String(deviceName);
  reqDoc["p_firmware_version"] = FIRMWARE_VERSION;
  reqDoc["p_board_type"] = BOARD_TYPE;

  String body;
  serializeJson(reqDoc, body);

  int code = http.POST(body);

  if (code == 200) {
    String resp = http.getString();
    Serial.println("Registration Response: " + resp);

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, resp);

    if (!error && doc.size() > 0) {
      deviceDbId = doc[0]["id"].as<String>();
      bool forceUnassigned = false;

      if (doc[0].containsKey("message")) {
        String msg = doc[0]["message"].as<String>();
        if (msg != "OK") {
          Serial.println("Server Message: " + msg);
          if (msg.indexOf("Invalid School Code") >= 0 || msg.indexOf("Unassigned") >= 0) {
            preferences.putString("school_id", "");
            strcpy(schoolId, "");
            forceUnassigned = true;
          }
        }
      }

      bool isAssigned = false;
      if (!forceUnassigned && doc[0]["school_id"].is<String>()) {
        String sId = doc[0]["school_id"].as<String>();
        if (sId.length() > 0) {
          sId.toCharArray(schoolId, 40);
          isAssigned = true;
          preferences.putString("school_id", schoolId);
          preferences.putBool("is_active", true);
        }
      }

      bool isActivated = doc[0]["is_activated"] | false;
      String actStatus = doc[0]["activation_status"] | "unactivated";

      if (isAssigned) {
        if (isActivated) {
          currentState = STATE_ACTIVE;
          Serial.println("State: ACTIVE (1-Year Free Subscription Active)");
        } else if (actStatus == "expired") {
          currentState = STATE_EXPIRED;
          activeSchedules.clear();
          Serial.println("State: EXPIRED (Subscription Expired - Renewal Due)");
        } else {
          currentState = STATE_PENDING_ACTIVATION;
          activeSchedules.clear();
          Serial.println("State: PENDING ACTIVATION (Awaiting Super Admin Approval)");
        }
      } else {
        currentState = STATE_UNASSIGNED;
        activeSchedules.clear();
        Serial.println("State: UNASSIGNED (Pending Claim / Super Admin)");
      }
    } else {
      currentState = STATE_UNASSIGNED;
      activeSchedules.clear();
    }
  } else {
    Serial.printf("Registration Error code: %d\n", code);
    currentState = STATE_UNASSIGNED;
  }
  http.end();
}

void syncSchedules() {
  if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE) return;

  // Imminent schedule check (Don't sync within a 2-minute window of a bell)
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    int currentMinOfDay = timeinfo.tm_hour * 60 + timeinfo.tm_min;
    for (const auto &item : activeSchedules) {
      bool dayMatch = false;
      for (int d : item.days) {
        if (d == timeinfo.tm_wday) dayMatch = true;
      }
      if (!dayMatch) continue;

      int bellMinOfDay = item.hour * 60 + item.minute;
      int diff = bellMinOfDay - currentMinOfDay;
      if (diff >= -1 && diff <= 2) {
        Serial.println("Skipping Sync: Scheduled bell is imminent.");
        return;
      }
    }
  }

  Serial.println("Syncing Schedules...");
  lcdPrintLine(0, "Syncing         ");
  lcdPrintLine(1, "Schedules...    ");

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(30000);

  HTTPClient http;
  http.setTimeout(30000);
  http.setUserAgent("ESP32-AutoBell/1.0");

  String url = String(SUPABASE_URL) + "/rest/v1/rpc/get_device_config";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"device_mac\": \"" + deviceMacAddress + "\"}";
  int code = http.POST(body);

  if (code == 200) {
    String response = http.getString();
    Serial.printf("Config Response Length: %d\n", response.length());

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (!error) {
      bool isConfigActivated = doc["is_activated"] | false;
      String actStatus = doc["activation_status"] | "active";

      if (!isConfigActivated) {
        activeSchedules.clear();
        LittleFS.remove("/schedules.json");
        if (actStatus == "expired") {
          currentState = STATE_EXPIRED;
          Serial.println("Device Subscription Expired. Schedules cleared.");
        } else {
          currentState = STATE_PENDING_ACTIVATION;
          Serial.println("Device Pending Activation. Schedules cleared.");
        }
      } else {
        // Cache locally for active device
        File file = LittleFS.open("/schedules.json", "w");
        if (file) {
          file.print(response);
          file.close();
        }

        if (doc.containsKey("schedules")) {
          Serial.println("Schedules Synchronized.");
          parseSchedules(doc);
        } else {
          Serial.println("No schedules returned in config schema.");
        }
      }
    } else {
      Serial.println("Failed to parse config schema.");
    }
  } else {
    Serial.printf("Sync Schedules Failed: %d\n", code);
  }
  http.end();
  updateLCD();
}

void parseSchedules(const JsonDocument &doc) {
  if (doc.containsKey("timezone_offset")) {
    int offsetMins = doc["timezone_offset"] | 300;
    long offsetSecs = (long)offsetMins * 60;
    configTime(offsetSecs, 0, NTP_SERVERS[0], NTP_SERVERS[1], NTP_SERVERS[2]);
  }

  if (doc.containsKey("schedules")) {
    activeSchedules.clear();
    for (JsonObjectConst obj : doc["schedules"].as<JsonArrayConst>()) {
      ScheduleItem item;
      int h = 0, m = 0, s = 0;

      const char *timeStr = obj["t"];
      if (!timeStr) timeStr = obj["bell_time"];

      if (timeStr) {
        sscanf(timeStr, "%d:%d:%d", &h, &m, &s);
      }
      item.hour = h;
      item.minute = m;
      item.second = s;
      item.lastRung = 0;
      item.durationSeconds = obj["ds"] | 5;
      if (item.durationSeconds <= 0) item.durationSeconds = 5;

      const char *lbStr = obj["lb"];
      if (!lbStr) lbStr = obj["label"];
      item.label = lbStr ? String(lbStr) : "Bell Event";

      JsonVariantConst dField = obj["d"];
      if (dField.is<int>()) {
        int dInt = dField.as<int>();
        if (dInt == 7) dInt = 0;
        item.days.push_back(dInt);
      } else if (dField.is<JsonArrayConst>()) {
        JsonArrayConst days = dField.as<JsonArrayConst>();
        for (JsonVariantConst v : days) {
          if (v.is<int>()) {
            int dEntry = v.as<int>();
            if (dEntry == 7) dEntry = 0;
            item.days.push_back(dEntry);
          }
        }
      }

      activeSchedules.push_back(item);
    }
    Serial.printf("Parsed %d Mini Schedules.\n", activeSchedules.size());
  }
}

void loadSchedulesFromStorage() {
  if (LittleFS.exists("/schedules.json")) {
    File file = LittleFS.open("/schedules.json", "r");
    if (file) {
      JsonDocument doc;
      DeserializationError error = deserializeJson(doc, file);
      file.close();
      if (!error) {
        parseSchedules(doc);
        if (activeSchedules.size() > 0 || strlen(schoolId) > 0) {
          currentState = STATE_ACTIVE;
          Serial.printf("Loaded %d cached schedules from LittleFS. State set to ACTIVE.\n", activeSchedules.size());
        }
      }
    }
  }
}

// ==========================================
// COMMAND QUEUE POLLING & EXECUTION
// ==========================================
void pollCommands() {
  if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE) return;

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(30000);

  HTTPClient http;
  http.setTimeout(30000);
  http.setUserAgent("ESP32-AutoBell/1.0");

  String url = String(SUPABASE_URL) + "/rest/v1/rpc/poll_commands";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"device_mac\": \"" + deviceMacAddress + "\"}";
  int code = http.POST(body);

  if (code == 200) {
    String response = http.getString();
    http.end();

    if (response.length() == 0) return;

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);
    if (error) return;

    if (doc["has_command"].as<bool>() == true) {
      String cmdId = doc["id"].as<String>();
      const char *cmd = doc["command"];
      bool executed = false;

      if (!cmd) return;

      Serial.println("[Command] Received queue command: " + String(cmd));

      if (strcmp(cmd, "REBOOT") == 0) {
        executed = true;
      } else if (strcmp(cmd, "SYNC_SCHEDULES") == 0 || strcmp(cmd, "CONFIG") == 0) {
        syncSchedules();
        executed = true;
      } else if (strcmp(cmd, "TEST_BUZZER") == 0) {
        testBuzzer();
        executed = true;
      } else if (strcmp(cmd, "RING") == 0) {
        int duration = 5;
        if (!doc["payload"].isNull()) {
          if (doc["payload"].is<JsonObject>() && doc["payload"].containsKey("duration")) {
            duration = doc["payload"]["duration"].as<int>();
          }
        }
        if (duration <= 0) duration = 5;
        currentEventLabel = "Manual Ring";
        triggerRelay(duration);
        triggerBuzzer(1500);
        executed = true;
      } else if (strcmp(cmd, "EMERGENCY_STOP") == 0 || strcmp(cmd, "STOP") == 0) {
        digitalWrite(PIN_RELAY_1, RELAY_INACTIVE);
        delay(50); // Stagger relay off
        digitalWrite(PIN_RELAY_2, RELAY_INACTIVE);
        relayActive = false;
        noTone(PIN_BUZZER);
        digitalWrite(PIN_BUZZER, LOW);
        buzzerActive = false;
        currentEventLabel = "";
        Serial.println("[Relays] Emergency Stop - Relays & Buzzer Deactivated.");
        updateLCD();
        executed = true;
      } else if (strcmp(cmd, "UPDATE_FIRMWARE") == 0) {
        String otaUrl = doc["payload"]["url"] | "";
        if (otaUrl.length() > 0) {
          ackCommand(cmdId);
          delay(300);
          performOTAUpdate(otaUrl);
        }
      }

      if (executed) {
        ackCommand(cmdId);
        if (strcmp(cmd, "REBOOT") == 0) {
          delay(1000);
          ESP.restart();
        }
      }
    }
  } else {
    http.end();
  }
}

void ackCommand(String cmdId) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/rpc/ack_command");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.POST("{\"p_command_id\": " + cmdId + ", \"p_device_mac\": \"" + deviceMacAddress + "\"}");
  http.end();
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE) return;

  String body = "{\"p_device_id\": \"" + deviceDbId + "\", \"p_status\": \"online\"}";

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/rpc/update_heartbeat_with_power");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.POST(body);
  http.end();
}

void performOTAUpdate(const String &url) {
  lcdPrintLine(0, "OTA Update Start");
  lcdPrintLine(1, "Connecting...   ");

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

  if (!http.begin(client, url)) {
    lcdPrintLine(0, "OTA Connect Fail");
    delay(2000);
    return;
  }

  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    http.end();
    return;
  }

  int contentLength = http.getSize();
  if (contentLength <= 0) {
    http.end();
    return;
  }

  if (Update.begin(contentLength, U_FLASH)) {
    lcdPrintLine(0, "OTA Updating... ");
    lcdPrintLine(1, "Flashing FW...  ");

    WiFiClient *stream = http.getStreamPtr();
    uint8_t buff[1024];
    int written = 0;

    while (http.connected() && (written < contentLength)) {
      esp_task_wdt_reset();
      size_t avail = stream->available();
      if (avail) {
        int readBytes = stream->readBytes(buff, min((size_t)avail, sizeof(buff)));
        if (readBytes > 0) {
          Update.write(buff, readBytes);
          written += readBytes;
        }
      }
      delay(1);
    }

    if (Update.end() && Update.isFinished()) {
      lcdPrintLine(0, "OTA COMPLETE!   ");
      lcdPrintLine(1, "Rebooting Now...");
      delay(2000);
      ESP.restart();
    }
  }
  http.end();
}

// ==========================================
// LCD & UTILITIES
// ==========================================
void initLCD() {
  if (!lcdFound) return;
  lcd.init();
  lcd.backlight();
}

void lcdPrintLine(int row, String text) {
  if (!lcdFound) return;
  if (row < 0 || row >= 2) return;
  if (text.length() > 16) {
    text = text.substring(0, 16);
  }
  while (text.length() < 16) {
    text += " ";
  }
  lcd.setCursor(0, row);
  lcd.print(text);
}

void updateLCD() {
  if (currentState == STATE_BOOT) return;

  if (currentState == STATE_UNASSIGNED) {
    lcdPrintLine(0, "AutoBell Mini   ");
    if (WiFi.status() == WL_CONNECTED) {
      char line1[17];
      snprintf(line1, sizeof(line1), "IP:%s", WiFi.localIP().toString().c_str());
      lcdPrintLine(1, line1);
    } else {
      lcdPrintLine(1, "Unclaimed Stock ");
    }
    return;
  }

  if (currentState == STATE_PENDING_ACTIVATION) {
    lcdPrintLine(0, "Pending Act.    ");
    lcdPrintLine(1, "Call Support    ");
    return;
  }

  if (currentState == STATE_EXPIRED) {
    lcdPrintLine(0, "License Expired ");
    lcdPrintLine(1, "Renew Subscript ");
    return;
  }

  if (relayActive) {
    lcdPrintLine(0, "Relay Triggered!");
    lcdPrintLine(1, currentEventLabel.substring(0, 16));
  } else {
    int h, m, s, d;
    getCurrentTime(h, m, s, d);

    char timeStr[17];
    const char* dayNames[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
    if (d >= 0 && d < 7) {
      snprintf(timeStr, sizeof(timeStr), "%s %02d:%02d:%02d", dayNames[d], h, m, s);
    } else {
      snprintf(timeStr, sizeof(timeStr), "%02d:%02d:%02d", h, m, s);
    }
    lcdPrintLine(0, timeStr);

    // Get Next Scheduled bell time to display
    ScheduleItem* next = nullptr;
    long minDiff = 86400 * 8;
    for (auto &sch : activeSchedules) {
      for (int schDay : sch.days) {
        int dayDiff = schDay - d;
        if (dayDiff < 0) dayDiff += 7;

        long schTimeSecs = sch.hour * 3600 + sch.minute * 60 + sch.second;
        long curTimeSecs = h * 3600 + m * 60 + s;
        long totalDiffSecs = dayDiff * 86400 + schTimeSecs - curTimeSecs;

        if (totalDiffSecs <= 0) totalDiffSecs += 7 * 86400;

        if (totalDiffSecs < minDiff) {
          minDiff = totalDiffSecs;
          next = &sch;
        }
      }
    }

    if (next) {
      char line2[17];
      snprintf(line2, sizeof(line2), "Next:%02d:%02d Relay", next->hour, next->minute);
      lcdPrintLine(1, line2);
    } else {
      if (WiFi.status() == WL_CONNECTED) {
        char line2[17];
        snprintf(line2, sizeof(line2), "IP:%s", WiFi.localIP().toString().c_str());
        lcdPrintLine(1, line2);
      } else {
        lcdPrintLine(1, "Next: None      ");
      }
    }
  }
}

void testBuzzer() {
  tone(PIN_BUZZER, 3000);
  buzzerOffTime = millis() + 1500;
  buzzerActive = true;
}

void syncTimeFromHttpDate(const String &dateStr) {
  if (dateStr.length() < 20) return;
  int firstSpace = dateStr.indexOf(' ');
  if (firstSpace < 0) return;
  String rest = dateStr.substring(firstSpace + 1);
  rest.trim();
  
  int day = 0, year = 0, hour = 0, minute = 0, second = 0;
  char monthStr[4] = {0};
  if (sscanf(rest.c_str(), "%d %3s %d %d:%d:%d", &day, monthStr, &year, &hour, &minute, &second) != 6) {
    return;
  }
  const char *months[] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
  int month = 0;
  for (int i = 0; i < 12; i++) {
    if (strcasecmp(monthStr, months[i]) == 0) {
      month = i + 1;
      break;
    }
  }
  if (month == 0 || year < 2024 || year > 2050) return;
  DateTime dt(year, month, day, hour, minute, second);
  time_t epoch = (time_t)dt.unixtime();
  if (epoch > 1700000000) {
    struct timeval tv = {.tv_sec = epoch, .tv_usec = 0};
    settimeofday(&tv, NULL);
    if (rtcFound) {
      rtc.adjust(dt);
      Serial.printf("[HTTP-TimeSync] RTC & System Time Synced: %04d-%02d-%02d %02d:%02d:%02d UTC (%ld)\n",
                    year, month, day, hour, minute, second, epoch);
    }
  }
}

void getCurrentTime(int &h, int &m, int &s, int &d) {
  time_t nowSec = time(NULL);
  int effTzOffset = preferences.getInt("tz_offset", UTC_OFFSET_SEC);

  if (nowSec >= 1700000000) {
    struct tm timeinfo;
    time_t localSec = nowSec + effTzOffset;
    gmtime_r(&localSec, &timeinfo);
    h = timeinfo.tm_hour;
    m = timeinfo.tm_min;
    s = timeinfo.tm_sec;
    d = timeinfo.tm_wday;
  } else if (rtcFound) {
    DateTime now = rtc.now();
    if (now.year() >= 2024 && now.year() <= 2050) {
      time_t rtcSec = (time_t)now.unixtime();
      struct timeval tv = {.tv_sec = rtcSec, .tv_usec = 0};
      settimeofday(&tv, NULL);
      struct tm timeinfo;
      time_t localSec = rtcSec + effTzOffset;
      gmtime_r(&localSec, &timeinfo);
      h = timeinfo.tm_hour;
      m = timeinfo.tm_min;
      s = timeinfo.tm_sec;
      d = timeinfo.tm_wday;
    } else {
      h = now.hour();
      m = now.minute();
      s = now.second();
      d = now.dayOfTheWeek();
    }
  } else {
    h = m = s = d = 0;
  }
}

void saveConfigCallback() {
  shouldSaveConfig = true;
}

void checkSerialCommands() {
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.length() == 0) return;

    if (input.startsWith("WIFI:")) {
      String rest = input.substring(5);
      int firstComma = rest.indexOf(',');
      if (firstComma > 0) {
        String s_ssid = rest.substring(0, firstComma);
        String s_pass = "";
        String s_school = "";
        int secondComma = rest.indexOf(',', firstComma + 1);
        if (secondComma > 0) {
          s_pass = rest.substring(firstComma + 1, secondComma);
          s_school = rest.substring(secondComma + 1);
        } else {
          s_pass = rest.substring(firstComma + 1);
        }
        s_ssid.trim();
        s_pass.trim();
        s_school.trim();

        Serial.println("\n[SerialConfig] Saving Wi-Fi credentials via Serial:");
        Serial.println("  SSID: " + s_ssid);
        Serial.println("  Pass: " + s_pass);
        if (s_school.length() > 0) Serial.println("  School: " + s_school);

        preferences.putString("wifi_ssid", s_ssid);
        preferences.putString("wifi_pass", s_pass);
        if (s_school.length() > 0) {
          preferences.putString("school_id", s_school);
          s_school.toCharArray(schoolId, 40);
        }
        preferences.putBool("wifi_init", true);
        Serial.println("[SerialConfig] Saved! Rebooting in 1s to connect...\n");
        delay(1000);
        ESP.restart();
      } else {
        Serial.println("[SerialConfig] Usage: WIFI:SSID,PASSWORD or WIFI:SSID,PASSWORD,SCHOOL_ID");
      }
    } else if (input == "CLEAR_WIFI") {
      preferences.remove("wifi_ssid");
      preferences.remove("wifi_pass");
      preferences.putBool("wifi_init", false);
      Serial.println("[SerialConfig] Wi-Fi cleared. Rebooting...");
      delay(1000);
      ESP.restart();
    } else if (input == "SCAN_WIFI") {
      Serial.println("\n--- Scanning 2.4GHz Wi-Fi Networks ---");
      int n = WiFi.scanNetworks();
      Serial.printf("Found %d networks:\n", n);
      for (int i = 0; i < n; i++) {
        Serial.printf("  [%d] SSID: '%s' | RSSI: %d dBm | Ch: %d\n", i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i));
      }
      Serial.println("--------------------------------------\n");
    } else if (input == "REBOOT") {
      Serial.println("Rebooting...");
      delay(500);
      ESP.restart();
    } else if (input == "TEST_BUZZER") {
      testBuzzer();
    } else if (input == "FORCE_SYNC") {
      syncSchedules();
    } else if (input == "DEBUG_TIME") {
      int h, m, s, d;
      getCurrentTime(h, m, s, d);
      Serial.printf("Current system time: %02d:%02d:%02d (Day %d)\n", h, m, s, d);
      if (rtcFound) {
        DateTime now = rtc.now();
        Serial.printf("RTC time: %02d:%02d:%02d\n", now.hour(), now.minute(), now.second());
      }
    } else if (input == "DUMP_SCHEDULES") {
      Serial.printf("Schedules loaded: %d\n", activeSchedules.size());
      for (size_t i = 0; i < activeSchedules.size(); i++) {
        Serial.printf("#%d: %02d:%02d:%02d Label: %s Duration: %ds\n", i, activeSchedules[i].hour, activeSchedules[i].minute, activeSchedules[i].second, activeSchedules[i].label.c_str(), activeSchedules[i].durationSeconds);
      }
    }
  }
}
