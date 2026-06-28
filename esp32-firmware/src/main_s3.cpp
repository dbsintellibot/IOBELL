#include "Audio.h"
#include "esp_log.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
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
#include <time.h>
#include <vector>

// ==========================================
// LCD DISPLAY CONFIGURATION
// ==========================================
#include <LiquidCrystal_I2C.h>

// ==========================================
// CONFIGURATION
// ==========================================

// Supabase Configuration
// Supabase Configuration (Dynamically Loaded)
char SUPABASE_URL[100] = "";
char SUPABASE_KEY[300] = "";

// Firmware Version
#define FIRMWARE_VERSION "1.0.1"

// Hardware Board Type Identifier
#define BOARD_TYPE "ESP32-S3 N16R8"

// #define PIN_RELAY       4    // Relay Pin (Unused)
#define PIN_LED_STATUS 2 // Status LED
#define PIN_LED_POWER 12 // System On/Off LED
#define PIN_BUZZER 15    // Buzzer Pin (S3)
#define PIN_RTC_SDA 8    // RTC SDA (S3)
#define PIN_RTC_SCL 9    // RTC SCL (S3)

#ifndef AUDIO_OUT_PCM5102
#define AUDIO_OUT_PCM5102 1
#endif

// Input Voltage Sense (VIN monitor): ADC GPIO 3 via 2:1 divider (ratio=2.0)

// I2S Pins for S3
// Pins chosen to avoid Flash/USB/JTAG conflicts
#ifndef I2S_DOUT
#define I2S_DOUT 14
#endif
#ifndef I2S_BCLK
#define I2S_BCLK 38
#endif
#ifndef I2S_LRC
#define I2S_LRC 4
#endif

#if !AUDIO_OUT_PCM5102
#ifndef PIN_AMP_SD
#define PIN_AMP_SD 4
#endif
#if defined(PIN_AMP_SD) && (PIN_AMP_SD == I2S_LRC)
#undef PIN_AMP_SD
#endif
#endif

// Settings
const long UTC_OFFSET_SEC = 18000; // GMT+5 for Pakistan
const unsigned long SCHEDULE_SYNC_INTERVAL = 5 * 60 * 1000;
const unsigned long COMMAND_POLL_INTERVAL = 5 * 1000;
const unsigned long HEARTBEAT_INTERVAL = 60 * 1000;
const unsigned long PROVISION_POLL_INTERVAL = 10 * 1000;
const unsigned long AUDIO_CACHE_SYNC_INTERVAL = 10 * 60 * 1000;

// NTP Servers (Multiple for redundancy)
const char *NTP_SERVERS[] = {"pk.pool.ntp.org", "pool.ntp.org",
                             "time.google.com"};

// ==========================================
// GLOBALS
// ==========================================

RTC_DS3231 rtc;
bool rtcFound = false;

LiquidCrystal_I2C lcd(0x27, 16, 4); // Address 0x27 for 16x4 I2C LCD (Shares RTC SDA/SCL pins 8 and 9)

String lcdPlayingType = "";
String lcdPlayingDetail = "";

Audio *audio = NULL; // I2S Audio Object (Dynamic for RAM optimization)
int systemVolume = 30;
bool quietHoursEnabled = false;
int quietHoursDisableFromMins = 21 * 60;
int quietHoursEnableAtMins = 7 * 60;

static int getI2SVolumeFromSystem(int sysVol) {
  (void)sysVol;
  const int maxV = 21;
  return maxV;
}

static bool isQuietHoursNow();

void initAudio();
void enableAmp();
void disableAmp();

void initAudio() {
  if (audio == NULL) {
    audio = new Audio();
    audio->setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
    audio->setVolume(getI2SVolumeFromSystem(systemVolume));
    Serial.println("Audio Initialized (Heap Allocated with PSRAM Buffers)");
  }
}

void deinitAudio() {
  if (audio != NULL) {
    delete audio;
    audio = NULL;
    Serial.println("Audio Deinitialized (Heap Freed)");
  }
}

Ticker timer1s;
volatile bool scheduleTick = false;
bool timeSynced = false;

Preferences preferences;
char deviceName[40] = "AutoBell Device";
char schoolId[40] = "";
bool shouldSaveConfig = false; // Flag for saving data from WiFiManager

String deviceMacAddress;
String deviceDbId = "";
unsigned long lastScheduleSync = 0;
unsigned long lastCommandPoll = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastProvisionPoll = 0;
unsigned long lastAudioCacheSync = 0;
bool locationSentThisBoot = false;

// Playback State Machine
enum PlayState {
  PLAY_IDLE,
  PLAY_BUZZER,
  PLAY_STREAMING // New state for I2S streaming
};

PlayState playState = PLAY_IDLE;
unsigned long playStateStartTime = 0;

bool streamModeActive = false;
bool streamBypassOtherAudio = false;
String streamModeUrl = "";
unsigned long lastStreamRestartAttemptMs = 0;
unsigned long streamingTimeoutMs = 0;

enum DeviceState { STATE_BOOT, STATE_UNASSIGNED, STATE_ACTIVE };
DeviceState currentState = STATE_BOOT;

struct ScheduleItem {
  int hour;
  int minute;
  int second;
  std::vector<int> days; // 1=Mon, 7=Sun
  String type;
  String ttsMessage;
  String audioUrl;
  String audioId;
  time_t lastRung; // Timestamp of last execution
};
std::vector<ScheduleItem> activeSchedules;

// ==========================================
// FUNCTION PROTOTYPES
// ==========================================
void fetchDeviceDetails();
void initLCD();
void lcdPrintLine(int row, String text);
ScheduleItem* getNextBell(int h, int m, int s, int d);
void updateLCD();
void syncSchedules();
void pollCommands();
void sendHeartbeat();
void loadSchedulesFromStorage();
void updateDeviceLocationOnce();
void syncAudioCache();

void playBell();
void startStreamPlayback(const String &url);
void stopStreamPlayback();
void stopBuzzer(); // Helper to force stop
void testBuzzer();
void parseSchedules(const JsonDocument &doc);
void getCurrentTime(int &h, int &m, int &s, int &d);
void saveConfigCallback();
bool hasRungThisTime(int d, int h, int m, int s); // Persistence check
void markRung(int d, int h, int m, int s);        // Save ring state
void checkSerialCommands();                       // New: Handle Serial input
void checkSchedule();                             // New: Check bell schedule
void timeSyncCallback(struct timeval *tv);        // New: SNTP callback
void onSecondTick();                              // New: Timer ISR
void performOTAUpdate(const String &url);
void enableAmp();
void disableAmp();
String getLocalAudioPathForId(const String &audioId);
bool downloadFileToLittleFS(const String &url, const String &localPath);

// ==========================================
// AUDIO CALLBACKS (DEBUG)
// ==========================================
void audio_info(const char *info) {
  Serial.print("I2S Info: ");
  Serial.println(info);
}
void audio_id3data(const char *info) {
  Serial.print("I2S ID3: ");
  Serial.println(info);
}
void audio_eof_mp3(const char *info) {
  Serial.print("I2S EOF: ");
  Serial.println(info);
  playState = PLAY_IDLE;
}
void audio_showstation(const char *info) {
  Serial.print("I2S Station: ");
  Serial.println(info);
}
void audio_showstreamtitle(const char *info) {
  Serial.print("I2S Title: ");
  Serial.println(info);
}
void audio_bitrate(const char *info) {
  Serial.print("I2S Bitrate: ");
  Serial.println(info);
}
void audio_commercial(const char *info) {
  Serial.print("I2S Commercial: ");
  Serial.println(info);
}
void audio_icyurl(const char *info) {
  Serial.print("I2S ICY URL: ");
  Serial.println(info);
}
void audio_lasthost(const char *info) {
  Serial.print("I2S Last Host: ");
  Serial.println(info);
}
void audio_eof_speech(const char *info) {
  Serial.print("I2S EOF Speech: ");
  Serial.println(info);
  playState = PLAY_IDLE;
}
void audio_error_msg(const char *info) {
  Serial.print("I2S ERROR: ");
  Serial.println(info);
}

// ==========================================
// SETUP
// ==========================================

void timeSyncCallback(struct timeval *tv) {
  Serial.println("SNTP Sync Event Detected");
  if (rtcFound) {
    rtc.adjust(DateTime(tv->tv_sec));
    Serial.println("RTC Updated from SNTP");
  }
  timeSynced = true;
}

// System Health Monitor
void printSystemHealth() {
  Serial.printf(
      "HEALTH: Heap: %u | Uptime: %lu s | WiFi: %d dBm | WDT: Enabled (60s)\n",
      ESP.getFreeHeap(), millis() / 1000, WiFi.RSSI());
}

void onSecondTick() { scheduleTick = true; }

void setup() {
  Serial.begin(115200);
  Serial.println("\n\n--- AUTO-BELL BOOT ---");
  esp_log_level_set("*", ESP_LOG_WARN);
  esp_log_level_set("i2s_common", ESP_LOG_NONE);
  esp_log_level_set("i2s_std", ESP_LOG_NONE);

  // Watchdog Timer (WDT) Configuration moved to after WiFi connection to
  // prevent boot loops

  Serial.printf("Total Heap: %d, Free Heap: %d\n", ESP.getHeapSize(),
                ESP.getFreeHeap());
  Serial.printf("Total PSRAM: %d, Free PSRAM: %d\n", ESP.getPsramSize(),
                ESP.getFreePsram());
  Serial.print("Supabase URL: ");
  Serial.println(SUPABASE_URL);

  // Ensure Maximum Performance
  setCpuFrequencyMhz(240);
  // WiFi.setSleep(false); // Moved to after WiFi.mode(WIFI_STA)

  preferences.begin("autobell", false);
  String storedName = preferences.getString("dev_name", "AutoBell Device");
  String storedSchool = preferences.getString("school_id", "");
  bool wifiInitialized = preferences.getBool("wifi_initialized", false);
  storedName.toCharArray(deviceName, 40);
  storedSchool.toCharArray(schoolId, 40);
  String storedSupaUrl = preferences.getString("supa_url", "");
  String storedSupaKey = preferences.getString("supa_key", "");
  storedSupaUrl.toCharArray(SUPABASE_URL, 100);
  storedSupaKey.toCharArray(SUPABASE_KEY, 300);

  pinMode(PIN_LED_STATUS, OUTPUT);
  pinMode(PIN_LED_POWER, OUTPUT);
  digitalWrite(PIN_LED_POWER, HIGH);

  pinMode(PIN_BUZZER, OUTPUT);
#if defined(PIN_AMP_SD)
  pinMode(PIN_AMP_SD, OUTPUT);
  digitalWrite(PIN_AMP_SD, LOW);
#endif

  digitalWrite(PIN_LED_STATUS, LOW);
  stopBuzzer(); // Ensure buzzer is OFF at boot

  // Init RTC
  Wire.begin(PIN_RTC_SDA, PIN_RTC_SCL);
  initLCD();
  lcdPrintLine(0, "   Welcome to   ");
  lcdPrintLine(1, "  AutoBell v1.0 ");
  lcdPrintLine(2, "  A product of  ");
  lcdPrintLine(3, "Digitap Biz Sol.");
  delay(3000);

  if (!rtc.begin()) {
    Serial.println("Couldn't find RTC");
  } else {
    rtcFound = true;
    Serial.println("RTC Found");

    if (rtc.lostPower()) {
      Serial.println("RTC lost power, waiting for NTP sync...");
    } else {
      // Load RTC time into ESP32 System Time immediately
      DateTime now = rtc.now();
      struct timeval tv = {.tv_sec = now.unixtime(), .tv_usec = 0};
      settimeofday(&tv, NULL);
      Serial.printf("System Time set from RTC: %04d-%02d-%02d %02d:%02d:%02d\n",
                    now.year(), now.month(), now.day(), now.hour(),
                    now.minute(), now.second());
    }
  }

  // Init LittleFS
  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS Mount Failed");
    // digitalWrite(PIN_LED_POWER, HIGH); // Already ON
  }

  // Init I2S Audio
  // audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT); // Handled in initAudio()
  // audio.setVolume(21); // Handled in initAudio()
  // Serial.println("I2S Audio Initialized");

  // Initialize WiFi to Station Mode to ensure MAC is readable
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // Disable Modem Sleep (Must be called after WiFi init)
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
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

  if (!wifiInitialized) {
    lcdPrintLine(0, "WiFi Config Mode");
    lcdPrintLine(1, "AP:");
    lcdPrintLine(2, "AutoBell-Setup  ");
    lcdPrintLine(3, "IP: 192.168.4.1 ");

    WiFiManager wm;
    wm.setSaveConfigCallback(saveConfigCallback);

    WiFiManagerParameter custom_device_name("name", "Device Name", deviceName,
                                            40);
    WiFiManagerParameter custom_school_id("school", "School ID (Optional)",
                                          schoolId, 40);

    wm.addParameter(&custom_device_name);
    wm.addParameter(&custom_school_id);
    wm.addParameter(&custom_supa_url);
    wm.addParameter(&custom_supa_key);

    if (!wm.autoConnect("AutoBell-Setup")) {
      Serial.println("Failed to connect and hit timeout");
      lcdPrintLine(0, "Setup Timeout   ");
      lcdPrintLine(1, "Restarting...   ");
      lcdPrintLine(2, "                ");
      lcdPrintLine(3, "                ");
      delay(3000);
      ESP.restart();
    }

    Serial.println("\nWiFi connected (initial setup)");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    lcdPrintLine(0, "WiFi Connected! ");
    lcdPrintLine(1, "IP:             ");
    lcdPrintLine(2, WiFi.localIP().toString());
    lcdPrintLine(3, "                ");
    delay(2000);
    digitalWrite(PIN_LED_STATUS, HIGH);

    String currentSsid = WiFi.SSID();
    String currentPass = WiFi.psk();
    preferences.putString("wifi_ssid", currentSsid);
    preferences.putString("wifi_pass", currentPass);
    Serial.print("Persisted WiFi SSID: ");
    Serial.println(currentSsid);

    if (shouldSaveConfig) {
      strcpy(deviceName, custom_device_name.getValue());
      strcpy(schoolId, custom_school_id.getValue());
      strcpy(SUPABASE_URL, custom_supa_url.getValue());
      strcpy(SUPABASE_KEY, custom_supa_key.getValue());
      preferences.putString("dev_name", deviceName);
      preferences.putString("school_id", schoolId);
      preferences.putString("supa_url", SUPABASE_URL);
      preferences.putString("supa_key", SUPABASE_KEY);
      Serial.println("Saved custom parameters");
    }
    preferences.putBool("wifi_initialized", true);
  } else {
    Serial.println("WiFi already initialized, trying stored WiFi");
    lcdPrintLine(0, "Connecting to   ");
    lcdPrintLine(1, "WiFi...         ");
    lcdPrintLine(2, "                ");
    lcdPrintLine(3, "                ");

    String storedSsid = preferences.getString("wifi_ssid", "");
    String storedPass = preferences.getString("wifi_pass", "");
    if (storedSsid.length() > 0) {
      Serial.print("Using stored WiFi SSID: ");
      Serial.println(storedSsid);
      WiFi.begin(storedSsid.c_str(), storedPass.c_str());
    } else {
      Serial.println("No stored WiFi credentials found in preferences");
    }

    unsigned long startWait = millis();
    while (WiFi.status() != WL_CONNECTED &&
           millis() - startWait < 10000) {
      delay(500);
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWiFi reconnected using stored credentials");
      Serial.print("IP address: ");
      Serial.println(WiFi.localIP());
      lcdPrintLine(0, "WiFi Connected! ");
      lcdPrintLine(1, "IP:             ");
      lcdPrintLine(2, WiFi.localIP().toString());
      lcdPrintLine(3, "                ");
      delay(2000);
      digitalWrite(PIN_LED_STATUS, HIGH);
    } else {
      Serial.println("Stored WiFi credentials failed, starting AutoBell-Setup portal");
      lcdPrintLine(0, "WiFi Config Mode");
      lcdPrintLine(1, "AP:");
      lcdPrintLine(2, "AutoBell-Setup  ");
      lcdPrintLine(3, "IP: 192.168.4.1 ");

      WiFiManager wm;
      wm.setSaveConfigCallback(saveConfigCallback);

      WiFiManagerParameter custom_device_name("name", "Device Name", deviceName,
                                              40);
      WiFiManagerParameter custom_school_id("school", "School ID (Optional)",
                                            schoolId, 40);

      wm.addParameter(&custom_device_name);
      wm.addParameter(&custom_school_id);
    wm.addParameter(&custom_supa_url);
    wm.addParameter(&custom_supa_key);

      if (!wm.autoConnect("AutoBell-Setup")) {
        Serial.println("Failed to connect and hit timeout");
        lcdPrintLine(0, "Setup Timeout   ");
        lcdPrintLine(1, "Restarting...   ");
        lcdPrintLine(2, "                ");
        lcdPrintLine(3, "                ");
        delay(3000);
        ESP.restart();
      }

      Serial.println("\nWiFi connected via recovery portal");
      Serial.print("IP address: ");
      Serial.println(WiFi.localIP());
      lcdPrintLine(0, "WiFi Connected! ");
      lcdPrintLine(1, "IP:             ");
      lcdPrintLine(2, WiFi.localIP().toString());
      lcdPrintLine(3, "                ");
      delay(2000);
      digitalWrite(PIN_LED_STATUS, HIGH);

      String currentSsid = WiFi.SSID();
      String currentPass = WiFi.psk();
      preferences.putString("wifi_ssid", currentSsid);
      preferences.putString("wifi_pass", currentPass);

      if (shouldSaveConfig) {
        strcpy(deviceName, custom_device_name.getValue());
        strcpy(schoolId, custom_school_id.getValue());
      strcpy(SUPABASE_URL, custom_supa_url.getValue());
      strcpy(SUPABASE_KEY, custom_supa_key.getValue());
        preferences.putString("dev_name", deviceName);
        preferences.putString("school_id", schoolId);
      preferences.putString("supa_url", SUPABASE_URL);
      preferences.putString("supa_key", SUPABASE_KEY);
      }
      preferences.putBool("wifi_initialized", true);
    }
  }

// Watchdog Timer (WDT) Configuration
// Moved here to prevent reset loop during WiFiManager (AP Mode) which is
// blocking Enabled with 60s timeout to prevent hangs during normal operation
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t twdt_config = {
      .timeout_ms = 60000,
      .idle_core_mask = (1 << 0), // Watch Core 0 Idle
      .trigger_panic = true,
  };
  // Try to reconfigure first (suppress 'already initialized' error)
  if (esp_task_wdt_reconfigure(&twdt_config) != ESP_OK) {
    esp_task_wdt_init(&twdt_config);
  }
#else
  esp_task_wdt_init(60, true);
#endif
  esp_task_wdt_add(NULL); // Add current task (loop) to WDT

  // Initial Device Fetch
  fetchDeviceDetails();

  // Init SNTP (Native ESP32 Time)
  Serial.println("Initializing SNTP...");
  sntp_set_time_sync_notification_cb(timeSyncCallback);
  configTime(UTC_OFFSET_SEC, 0, NTP_SERVERS[0], NTP_SERVERS[1], NTP_SERVERS[2]);

  // Start 1Hz Timer for Scheduler
  timer1s.attach(1.0, onSecondTick);

  if (currentState == STATE_ACTIVE) {
    syncSchedules();
  }

  Serial.printf("I2S Pins: BCLK=%d LRC=%d DOUT=%d\n", I2S_BCLK, I2S_LRC, I2S_DOUT);

  // Pre-initialize Audio to avoid driver state issues later
  initAudio();
}

// ==========================================
// LOOP
// ==========================================
void loop() {
  esp_task_wdt_reset();
  // 0. Audio Loop (Must be called frequently)
  if (audio)
    audio->loop();

  // Periodic LCD Update (1Hz)
  static unsigned long lastLcdUpdate = 0;
  if (millis() - lastLcdUpdate >= 1000) {
    lastLcdUpdate = millis();
    updateLCD();
  }

  // 1. Playback Logic
  switch (playState) {
  case PLAY_IDLE:
    if (streamModeActive && streamModeUrl.length() > 0) {
      if (!isQuietHoursNow() && millis() - lastStreamRestartAttemptMs > 5000) {
        lastStreamRestartAttemptMs = millis();
        startStreamPlayback(streamModeUrl);
      }
    }
    break;

  case PLAY_STREAMING:
    // Add a grace period of 2000ms before checking isRunning()
    // This prevents premature stop during initial buffering or short gaps
    if (millis() - playStateStartTime > 2000) {
      if (streamingTimeoutMs > 0 && millis() - playStateStartTime > streamingTimeoutMs) {
        Serial.println("Streaming Timeout. Force Stop.");
        if (audio && audio->isRunning())
          audio->stopSong();
        disableAmp();
        playState = PLAY_IDLE;
        streamingTimeoutMs = 0;
        updateLCD();
        break;
      }
      if (audio && !audio->isRunning()) {
        Serial.println("Streaming Finished.");
        disableAmp();
        playState = PLAY_IDLE;
        streamingTimeoutMs = 0;
        updateLCD();
        // deinitAudio(); // Free memory when done (Disabled for S3)
      }
    }
    break;

  case PLAY_BUZZER:
    if (millis() - playStateStartTime >= 3000) {
      // digitalWrite(PIN_BUZZER, LOW);
      noTone(PIN_BUZZER);
      digitalWrite(PIN_BUZZER, LOW);
      playState = PLAY_IDLE;
      playStateStartTime = millis();
      Serial.println("Buzzer Done.");
      updateLCD();
    }
    break;
  }

  // 2. Schedule Check (1Hz Tick)
  if (scheduleTick) {
    scheduleTick = false;
    checkSchedule();
  }
  // 3. WiFi Reconnect (Non-blocking)
  static unsigned long lastWiFiCheck = 0;

  if (millis() - lastWiFiCheck > 10000) {
    lastWiFiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      static bool ledState = false;
      ledState = !ledState;
      digitalWrite(PIN_LED_STATUS, ledState ? HIGH : LOW);
      Serial.println("WiFi lost, attempting reconnect...");
      WiFi.reconnect();
    } else {
      digitalWrite(PIN_LED_STATUS, HIGH);
    }
  }

  // 4. State Logic
  if (currentState == STATE_UNASSIGNED || currentState == STATE_BOOT) {
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
    return;
  }

  updateDeviceLocationOnce();

  // 5. Active State Tasks
  if (millis() - lastCommandPoll >= COMMAND_POLL_INTERVAL) {
    lastCommandPoll = millis();
    pollCommands();
  }

  checkSerialCommands();

  if (millis() - lastScheduleSync >= SCHEDULE_SYNC_INTERVAL) {
    lastScheduleSync = millis();
    syncSchedules();
  }

  if (millis() - lastAudioCacheSync >= AUDIO_CACHE_SYNC_INTERVAL) {
    lastAudioCacheSync = millis();
    syncAudioCache();
  }

  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    sendHeartbeat();
  }

  // 6. System Health Monitor (Every 60s)
  static unsigned long lastHealthCheck = 0;
  if (millis() - lastHealthCheck > 60000) {
    lastHealthCheck = millis();
    printSystemHealth();
  }
}

void initLCD() {
  lcd.init();
  lcd.backlight();
}

void lcdPrintLine(int row, String text) {
  if (row < 0 || row >= 4) return;
  if (text.length() > 16) {
    text = text.substring(0, 16);
  }
  while (text.length() < 16) {
    text += " ";
  }
  lcd.setCursor(0, row);
  lcd.print(text);
}

ScheduleItem* getNextBell(int h, int m, int s, int d) {
  ScheduleItem* nextSch = nullptr;
  long minDiff = 86400 * 8; // Default to > 7 days in seconds
  
  for (auto &sch : activeSchedules) {
    for (int schDay : sch.days) {
      int dayDiff = schDay - d;
      if (dayDiff < 0) {
        dayDiff += 7;
      }
      
      long schTimeSecs = sch.hour * 3600 + sch.minute * 60 + sch.second;
      long curTimeSecs = h * 3600 + m * 60 + s;
      long totalDiffSecs = dayDiff * 86400 + schTimeSecs - curTimeSecs;
      
      if (totalDiffSecs <= 0) {
        totalDiffSecs += 7 * 86400;
      }
      
      if (totalDiffSecs < minDiff) {
        minDiff = totalDiffSecs;
        nextSch = &sch;
      }
    }
  }
  return nextSch;
}

void updateLCD() {
  if (currentState == STATE_BOOT || currentState == STATE_UNASSIGNED) {
    return;
  }
  
  if (playState == PLAY_BUZZER) {
    lcdPrintLine(0, "Buzzer Ringing! ");
    lcdPrintLine(1, "Manual Bell     ");
    lcdPrintLine(2, "Active          ");
    lcdPrintLine(3, "                ");
  } else if (playState == PLAY_STREAMING) {
    lcdPrintLine(0, lcdPlayingType + " Playing");
    if (lcdPlayingType == "TTS") {
      lcdPrintLine(1, "TTS Running...  ");
      lcdPrintLine(2, lcdPlayingDetail.substring(0, 16));
      lcdPrintLine(3, lcdPlayingDetail.substring(16, 32));
    } else if (lcdPlayingType == "Voice Note") {
      lcdPrintLine(1, "Playing note... ");
      String name = lcdPlayingDetail;
      int lastSlash = name.lastIndexOf('/');
      if (lastSlash >= 0) name = name.substring(lastSlash + 1);
      lcdPrintLine(2, name.substring(0, 16));
      lcdPrintLine(3, name.substring(16, 32));
    } else { // "Streaming"
      lcdPrintLine(1, "Streaming Link: ");
      String host = "";
      int startIdx = lcdPlayingDetail.indexOf("://");
      if (startIdx >= 0) {
        int endIdx = lcdPlayingDetail.indexOf('/', startIdx + 3);
        if (endIdx >= 0) {
          host = lcdPlayingDetail.substring(startIdx + 3, endIdx);
        } else {
          host = lcdPlayingDetail.substring(startIdx + 3);
        }
      } else {
        host = lcdPlayingDetail;
      }
      lcdPrintLine(2, host.substring(0, 16));
      int pathStart = (startIdx >= 0) ? lcdPlayingDetail.indexOf('/', startIdx + 3) : -1;
      String path = (pathStart >= 0) ? lcdPlayingDetail.substring(pathStart) : "";
      lcdPrintLine(3, path.substring(0, 16));
    }
  } else { // PLAY_IDLE
    int h, m, s, d;
    getCurrentTime(h, m, s, d);
    
    char timeStr[17];
    const char* dayNames[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
    if (d >= 0 && d < 7) {
      sprintf(timeStr, "%s %02d:%02d:%02d", dayNames[d], h, m, s);
    } else {
      sprintf(timeStr, "%02d:%02d:%02d", h, m, s);
    }
    lcdPrintLine(0, timeStr);
    
    char line2[17];
    if (WiFi.status() == WL_CONNECTED) {
      sprintf(line2, "IP:%s", WiFi.localIP().toString().c_str());
    } else {
      sprintf(line2, "WiFi: Disconnect");
    }
    lcdPrintLine(1, line2);
    
    char line3[17];
    sprintf(line3, "Vol:%d | QH:%s", systemVolume, quietHoursEnabled ? (isQuietHoursNow() ? "Act" : "On") : "Off");
    lcdPrintLine(2, line3);
    
    ScheduleItem* next = getNextBell(h, m, s, d);
    if (next) {
      char line4[17];
      sprintf(line4, "Next: %02d:%02d (%s)", next->hour, next->minute, next->type.c_str());
      lcdPrintLine(3, line4);
    } else {
      lcdPrintLine(3, "Next: None      ");
    }
  }
}

void saveConfigCallback() {
  Serial.println("Should save config");
  shouldSaveConfig = true;
}

void enableAmp() {
#if defined(PIN_AMP_SD)
  digitalWrite(PIN_AMP_SD, HIGH);
  delay(10);
#endif
}

void disableAmp() {
#if defined(PIN_AMP_SD)
  digitalWrite(PIN_AMP_SD, LOW);
#endif
}

String getLocalAudioPathForId(const String &audioId) {
  if (audioId.length() == 0)
    return "";
  String path = "/audio/";
  path += audioId;
  path += ".mp3";
  return path;
}

bool downloadFileToLittleFS(const String &url, const String &localPath) {
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(30000);

  HTTPClient http;
  http.setTimeout(30000);
  if (!http.begin(client, url))
    return false;

  int code = http.GET();
  if (code != 200) {
    http.end();
    return false;
  }

  WiFiClient *stream = http.getStreamPtr();
  File file = LittleFS.open(localPath, "w");
  if (!file) {
    http.end();
    return false;
  }

  uint8_t buffer[512];
  while (http.connected()) {
    size_t available = stream->available();
    if (available) {
      int toRead = available;
      if (toRead > (int)sizeof(buffer))
        toRead = sizeof(buffer);
      int read = stream->readBytes((char *)buffer, toRead);
      if (read > 0)
        file.write(buffer, read);
    } else {
      if (!stream->connected())
        break;
      delay(1);
    }
  }

  file.close();
  http.end();
  return true;
}

void playBell() {
  Serial.println("--- playBell() START ---");

  // Stop any streaming audio safely
  if (audio && playState == PLAY_STREAMING) {
    if (audio->isRunning())
      audio->stopSong();
  }

  // 1. Activate Buzzer
  // digitalWrite(PIN_BUZZER, HIGH);
  tone(PIN_BUZZER, 3000); // Use higher frequency for louder buzzer

  playState = PLAY_BUZZER;
  playStateStartTime = millis();
  updateLCD();

  Serial.println("Buzzer ON. Waiting 3s...");
}

void startStreamPlayback(const String &url) {
  String trimmedUrl = url;
  trimmedUrl.trim();
  if (trimmedUrl.length() == 0) {
    Serial.println("startStreamPlayback: empty URL");
    return;
  }

  streamingTimeoutMs = 0;

  int schemeIdx = trimmedUrl.indexOf("://");
  if (schemeIdx >= 0) {
    int pathIdx = trimmedUrl.indexOf('/', schemeIdx + 3);
    if (pathIdx < 0) {
      trimmedUrl += "/;";
    } else {
      String pathPart = trimmedUrl.substring(pathIdx);
      if (pathPart == "/") {
        trimmedUrl += ";";
      }
    }
  }

  if (audio && audio->isRunning())
    audio->stopSong();

  enableAmp();
  initAudio();

  Serial.println("Starting Stream Playback: " + trimmedUrl);
  lcdPlayingType = "Streaming";
  lcdPlayingDetail = trimmedUrl;
  audio->connecttohost(trimmedUrl.c_str());
  audio->setVolume(getI2SVolumeFromSystem(systemVolume));

  playState = PLAY_STREAMING;
  playStateStartTime = millis();
  updateLCD();
}

void stopStreamPlayback() {
  Serial.println("Stopping Stream Playback");
  if (audio && audio->isRunning())
    audio->stopSong();
  disableAmp();
  playState = PLAY_IDLE;
  playStateStartTime = millis();
  streamingTimeoutMs = 0;
  updateLCD();
}

String resolveTtsLanguageForGender(String lang, String voiceGender) {
  lang.trim();
  lang.toLowerCase();
  voiceGender.trim();
  voiceGender.toLowerCase();

  if (voiceGender == "male") {
    if (lang == "en") {
      return "en-us";
    }
  }

  if (voiceGender == "female") {
    if (lang == "en-us") {
      return "en";
    }
  }

  return lang;
}

String urlEncode(const String &input) {
  String out;
  out.reserve(input.length() * 3);
  const char *hex = "0123456789ABCDEF";
  for (size_t i = 0; i < input.length(); i++) {
    unsigned char c = (unsigned char)input.charAt(i);
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' ||
        c == '~') {
      out += (char)c;
    } else if (c == ' ') {
      out += "%20";
    } else {
      out += '%';
      out += hex[(c >> 4) & 0x0F];
      out += hex[c & 0x0F];
    }
  }
  return out;
}

static unsigned long estimateMaleTtsTimeoutMs(const String &text) {
  unsigned long ms = (unsigned long)text.length() * 70;
  if (ms < 12000)
    ms = 12000;
  if (ms > 60000)
    ms = 60000;
  return ms;
}

void playTTS(String text, String lang, String voiceGender) {
  text.trim(); // Critical: Remove \n that can break the URL
  voiceGender.trim();
  voiceGender.toLowerCase();
  lang = resolveTtsLanguageForGender(lang, voiceGender);
  Serial.println("Playing TTS: [" + text + "] (" + lang + ") gender=" +
                 voiceGender);

  // Stop any existing audio safely
  if (audio && playState == PLAY_STREAMING) {
    if (audio->isRunning())
      audio->stopSong();
  }

  enableAmp();

  // Ensure Audio is initialized (safeguard)
  initAudio();

  // ALWAYS use StreamElements for reliability. Google Translate TTS frequently 403s on ESP32.
  String voice = "Brian"; // Default male
  if (voiceGender == "female") {
      voice = "Amy"; // StreamElements female English voice
  } else if (lang.startsWith("es")) {
      voice = "Mia"; // Spanish female
  } else if (lang.startsWith("fr")) {
      voice = "Celine"; // French female
  }

  streamingTimeoutMs = estimateMaleTtsTimeoutMs(text);
  String url = "https://api.streamelements.com/kappa/v2/speech?voice=" + voice + "&text=" + urlEncode(text);
  
  lcdPlayingType = "TTS";
  lcdPlayingDetail = text;
  audio->connecttohost(url.c_str());
  audio->setVolume(getI2SVolumeFromSystem(systemVolume));
  playState = PLAY_STREAMING;
  playStateStartTime = millis(); // IMPORTANT: Reset start time
  updateLCD();
}

void playTTS(String text, String lang) { playTTS(text, lang, ""); }

void testBuzzer() {
  Serial.println("--- testBuzzer() START ---");
  // Activate Buzzer
  // digitalWrite(PIN_BUZZER, HIGH);
  tone(PIN_BUZZER, 3000);

  playState = PLAY_BUZZER;
  playStateStartTime = millis();
  updateLCD();

  Serial.println("Buzzer Test ON (digitalWrite HIGH)");
  Serial.println("--- testBuzzer() END ---");
}

void getCurrentTime(int &h, int &m, int &s, int &d) {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 500)) { // 500ms timeout for stability
    h = timeinfo.tm_hour;
    m = timeinfo.tm_min;
    s = timeinfo.tm_sec;
    d = timeinfo.tm_wday; // 0=Sun...6=Sat
  } else {
    // Fallback to RTC directly if system time is unset
    if (rtcFound) {
      DateTime now = rtc.now();
      h = now.hour();
      m = now.minute();
      s = now.second();
      d = now.dayOfTheWeek(); // 0=Sun...6=Sat
    } else {
      // No time source
      h = 0;
      m = 0;
      s = 0;
      d = 0;
    }
  }
}

static int timeStringToMins(const String &value) {
  if (value.length() < 5)
    return -1;
  int h = (value.charAt(0) - '0') * 10 + (value.charAt(1) - '0');
  int m = (value.charAt(3) - '0') * 10 + (value.charAt(4) - '0');
  if (h < 0 || h > 23 || m < 0 || m > 59)
    return -1;
  return h * 60 + m;
}

static bool isQuietHoursNow() {
  if (!quietHoursEnabled)
    return false;
  if (quietHoursDisableFromMins == quietHoursEnableAtMins)
    return false;
  int h, m, s, d;
  getCurrentTime(h, m, s, d);
  int nowMins = h * 60 + m;
  if (quietHoursDisableFromMins < quietHoursEnableAtMins) {
    return nowMins >= quietHoursDisableFromMins &&
           nowMins < quietHoursEnableAtMins;
  }
  return nowMins >= quietHoursDisableFromMins ||
         nowMins < quietHoursEnableAtMins;
}

static bool isSoundCommand(const char *cmd) {
  if (!cmd)
    return false;
  return strcmp(cmd, "RING") == 0 || strcmp(cmd, "PLAY_URL") == 0 ||
         strcmp(cmd, "TTS") == 0 || strcmp(cmd, "VOICE_NOTE") == 0 ||
         strcmp(cmd, "STREAM_START") == 0 ||
         strcmp(cmd, "TEST_AUDIO") == 0 || strcmp(cmd, "TEST_BUZZER") == 0;
}

// -------------------------------------------------------------------------
// API FUNCTIONS
// -------------------------------------------------------------------------

void fetchDeviceDetails() {
  // Don't interrupt playback
  if (playState != PLAY_IDLE)
    return;

  // deinitAudio(); // Free heap before SSL connection (Disabled for S3)

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("fetchDeviceDetails: WiFi not connected!");
    return;
  }

  Serial.println("--- Fetching Device Details ---");
  lcdPrintLine(0, "Connecting      ");
  lcdPrintLine(1, "To Server...    ");
  lcdPrintLine(2, "Please wait...  ");
  lcdPrintLine(3, "                ");
  Serial.printf("Free Heap: %d\n", ESP.getFreeHeap());
  Serial.print("My MAC: ");
  Serial.println(deviceMacAddress);

  WiFiClientSecure client;
  client.setInsecure();
  // client.setBufferSizes(4096, 1024); // Removed in ESP32 Core 3.0. Scoped
  // WiFiManager to free heap instead.
  client.setHandshakeTimeout(30000); // Increase timeout to 30s

  HTTPClient http;
  http.setConnectTimeout(30000); // Increase timeout to 30s
  http.setUserAgent("ESP32-AutoBell/1.0");

  String url = String(SUPABASE_URL) + "/rest/v1/rpc/register_device_from_esp";

  if (!http.begin(client, url)) {
    Serial.println("HTTP Begin failed!");
    currentState = STATE_UNASSIGNED; // Retry
    return;
  }

  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");

  JsonDocument reqDoc;
  reqDoc["p_mac_address"] = deviceMacAddress;
  reqDoc["p_school_code"] = String(schoolId); // Sends "" if empty
  reqDoc["p_device_name"] = String(deviceName);
  reqDoc["p_firmware_version"] = FIRMWARE_VERSION;
  reqDoc["p_board_type"] = BOARD_TYPE;

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
          if (msg.indexOf("Invalid School Code") >= 0 ||
              msg.indexOf("Unassigned") >= 0) {
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
    Serial.print("Error String: ");
    Serial.println(http.errorToString(code));

    if (code > 0) {
      Serial.println(http.getString());
    } else if (code == -1) {
      Serial.println(
          "Hint: Connection Refused. Check DNS, Firewall, or Supabase Status.");
    }

    // Retry registration if failed
    currentState = STATE_UNASSIGNED;
  }
  http.end();
}

void stopBuzzer() {
  // digitalWrite(PIN_BUZZER, LOW);
  noTone(PIN_BUZZER);
  digitalWrite(PIN_BUZZER, LOW); // Ensure pin is low
  // If we were in buzzer state, this forces us out, but usually loop handles
  // transitions
  if (playState == PLAY_BUZZER) {
    playState = PLAY_IDLE;
  }
  Serial.println("Buzzer Stopped (Force)");
  updateLCD();
}

// Key format: "d-h-m" e.g., "1-14-30"
bool hasRungThisTime(int d, int h, int m, int s) {
  char key[30];
  sprintf(key, "lr_%d_%d_%d_%d", d, h, m, s);
  // Check if this key exists and is true
  // Actually, we can just store the LAST rung key
  // But saving a boolean for every minute is too much.
  // Better: Store "last_ring_key" string.

  String lastKey = preferences.getString("last_ring", "");
  String currentKey = String(key);

  if (lastKey == currentKey) {
    return true;
  }
  return false;
}

void markRung(int d, int h, int m, int s) {
  char key[30];
  sprintf(key, "lr_%d_%d_%d_%d", d, h, m, s);
  preferences.putString("last_ring", String(key));
  Serial.println("Marked as Rung: " + String(key));
}

void checkSerialCommands() {
  if (Serial.available() > 0) {
    Serial.setTimeout(5000); // Increase timeout for long TTS strings
    String input = Serial.readStringUntil('\n');
    Serial.setTimeout(1000); // Restore default
    input.trim();

    if (input.length() == 0)
      return;

    Serial.println("Received Serial Command: " + input);

    if (input.startsWith("SET_TIME:")) {
      // Format: SET_TIME:1706362000
      String epochStr = input.substring(9);
      long epoch = epochStr.toInt();
      if (epoch > 1600000000) { // Valid recent epoch (approx 2020+)
        struct timeval tv = {.tv_sec = epoch, .tv_usec = 0};
        settimeofday(&tv, NULL);
        if (rtcFound) {
          rtc.adjust(DateTime(epoch));
          Serial.printf("RTC & System Adjusted to: %ld\n", epoch);
        } else {
          Serial.printf("System Time Adjusted to: %ld (No RTC)\n", epoch);
        }
      } else {
        Serial.println("Invalid Epoch Time (must be > 1600000000).");
      }
    } else if (input == "FORCE_SYNC") {
      Serial.println("Forcing SNTP Restart...");
      esp_sntp_stop();
      esp_sntp_init();
    } else if (input == "DEBUG_TIME") {
      time_t now;
      time(&now);
      struct tm timeinfo;
      localtime_r(&now, &timeinfo);
      Serial.printf("System Time: %s", asctime(&timeinfo));

      if (rtcFound) {
        DateTime dt = rtc.now();
        Serial.printf("RTC Time: %04d-%02d-%02d %02d:%02d:%02d (Day: %d)\n",
                      dt.year(), dt.month(), dt.day(), dt.hour(), dt.minute(),
                      dt.second(), dt.dayOfTheWeek());
      } else {
        Serial.println("No RTC found.");
      }
    } else if (input == "TEST_BUZZER") {
      Serial.println("Executing Serial Command: TEST_BUZZER");
      testBuzzer();
    } else if (input == "TEST_I2S") {
      Serial.println("Executing Serial Command: TEST_I2S");
      Serial.println("Playing Test Stream "
                     "(http://stream.antenne1.de/a1stg/livestream1.mp3)...");

      if (audio) {
        if (audio->isRunning())
          audio->stopSong(); /* deinitAudio(); */
      }
      enableAmp();
      initAudio();
      lcdPlayingType = "Streaming";
      lcdPlayingDetail = "http://stream.antenne1.de/a1stg/livestream1.mp3";
      audio->connecttohost("http://stream.antenne1.de/a1stg/livestream1.mp3");
      audio->setVolume(getI2SVolumeFromSystem(systemVolume));
      playState = PLAY_STREAMING;
      playStateStartTime = millis();
      updateLCD();
    } else if (input.startsWith("TEST_TTS:")) {
      String ttsText = input.substring(9);
      Serial.println("Executing Serial Command: TEST_TTS:" + ttsText);
      playTTS(ttsText, "en");
    } else if (input == "TTS:") {
      String text = input.substring(4);
      playTTS(text, "en");
    } else if (input.startsWith("PLAY_URL:")) {
      String url = input.substring(9);
      url.trim();
      Serial.println("Executing Serial Command: PLAY_URL:" + url);

      if (audio && audio->isRunning())
        audio->stopSong();
      // deinitAudio(); // Disabled for S3
      enableAmp();
      initAudio();
      lcdPlayingType = "Streaming";
      lcdPlayingDetail = url;
      audio->connecttohost(url.c_str());
      audio->setVolume(getI2SVolumeFromSystem(systemVolume));
      playState = PLAY_STREAMING;
      playStateStartTime = millis();
      updateLCD();
    } else if (input.startsWith("VOICE_NOTE:")) {
      String url = input.substring(11);
      url.trim();
      Serial.println("Executing Serial Command: VOICE_NOTE:" + url);

      if (audio && audio->isRunning())
        audio->stopSong();
      // deinitAudio(); // Disabled for S3
      enableAmp();
      initAudio();
      lcdPlayingType = "Voice Note";
      lcdPlayingDetail = url;
      audio->connecttohost(url.c_str());
      audio->setVolume(getI2SVolumeFromSystem(systemVolume));
      playState = PLAY_STREAMING;
      playStateStartTime = millis();
      updateLCD();
    } else if (input == "DEBUG_AUDIO") {
      Serial.println("--- DEBUG_AUDIO ---");
      Serial.printf("systemVolume=%d i2sVol=%d\n", systemVolume,
                    getI2SVolumeFromSystem(systemVolume));
      Serial.printf("audio=%p isRunning=%s\n", (void *)audio,
                    (audio && audio->isRunning()) ? "YES" : "NO");
      Serial.printf("playState=%d\n", (int)playState);
      Serial.printf("I2S Pins: BCLK=%d LRC=%d DOUT=%d\n", I2S_BCLK, I2S_LRC,
                    I2S_DOUT);
      Serial.printf("WiFi=%s RSSI=%d IP=%s\n",
                    WiFi.status() == WL_CONNECTED ? "CONNECTED"
                                                  : "DISCONNECTED",
                    WiFi.RSSI(), WiFi.localIP().toString().c_str());
      Serial.printf("Heap=%u\n", ESP.getFreeHeap());
      Serial.println("--- END DEBUG_AUDIO ---");
    } else if (input == "DUMP_SCHEDULES") {
      Serial.println("--- SCHEDULE DUMP ---");
      int h, m, s, d;
      getCurrentTime(h, m, s, d);
      Serial.printf("System Time: %02d:%02d:%02d, Day: %d (0=Sun)\n", h, m, s,
                    d);

      if (rtcFound) {
        DateTime now = rtc.now();
        Serial.printf("RTC Time:    %02d:%02d:%02d, Day: %d (0=Sun)\n",
                      now.hour(), now.minute(), now.second(),
                      now.dayOfTheWeek());
      }

      Serial.printf("Active Schedules: %d\n", activeSchedules.size());
      for (int i = 0; i < (int)activeSchedules.size(); i++) {
        ScheduleItem &sch = activeSchedules[i];
        Serial.printf("#%d: %02d:%02d:%02d Type: %s, Track: %d, Days: [", i + 1,
                      sch.hour, sch.minute, sch.second, sch.type.c_str(),
                      sch.trackNumber);
        for (int j = 0; j < (int)sch.days.size(); j++) {
          Serial.printf("%d%s", sch.days[j],
                        (j < (int)sch.days.size() - 1) ? "," : "");
        }
        Serial.println("]");
      }
      Serial.println("--- END DUMP ---");
    } else if (input == "SHOW_RAW_CONFIG") {
      if (LittleFS.exists("/schedules.json")) {
        File file = LittleFS.open("/schedules.json", "r");
        if (file) {
          Serial.println("--- RAW SCHEDULE JSON ---");
          while (file.available()) {
            Serial.print((char)file.read());
          }
          Serial.println("\n--- END RAW JSON ---");
          file.close();
        } else {
          Serial.println("Error: Could not open /schedules.json");
        }
      } else {
        Serial.println("Error: /schedules.json does not exist");
      }
    }
  }
}

void syncSchedules() {
  // Don't interrupt playback with blocking WiFi operations
  if (playState != PLAY_IDLE)
    return;

  // SMART SYNC: Check if a bell is coming up in < 2 minutes to prevent blocking
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    int currentMinOfDay = timeinfo.tm_hour * 60 + timeinfo.tm_min;
    for (const auto &item : activeSchedules) {
      bool dayMatch = false;
      for (int d : item.days)
        if (d == timeinfo.tm_wday)
          dayMatch = true;
      if (!dayMatch)
        continue;

      int bellMinOfDay = item.hour * 60 + item.minute;
      int diff = bellMinOfDay - currentMinOfDay;
      // If bell is imminent (-1 to 2 mins), skip sync
      if (diff >= -1 && diff <= 2) {
        Serial.println("Skipping sync: Bell imminent or active");
        return;
      }
    }
  }

  // deinitAudio(); // Free heap before SSL connection (Disabled for S3 to
  // prevent I2S init errors)
  if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE)
    return;

  Serial.println("Syncing Schedules via get_device_config...");
  lcdPrintLine(0, "Syncing         ");
  lcdPrintLine(1, "Schedules...    ");
  lcdPrintLine(2, "Please wait...  ");
  lcdPrintLine(3, "                ");

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(30000);
  client.setTimeout(30000);

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

    // Save raw
    File file = LittleFS.open("/schedules.json", "w");
    if (file) {
      file.print(response);
      file.close();
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (!error && doc.containsKey("schedules")) {
      Serial.println("Sync Success. Parsed directly.");
      parseSchedules(doc);
      // digitalWrite(PIN_LED_POWER, LOW); // Removed for Power LED
    } else {
      Serial.println("Invalid Config Response");
      // digitalWrite(PIN_LED_POWER, HIGH); // Already ON
    }
  } else {
    Serial.print("Sync Config Failed: ");
    Serial.println(code);
    Serial.println(http.getString());
    // digitalWrite(PIN_LED_POWER, HIGH); // Already ON
  }
  http.end();
}

void syncAudioCache() {
  if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE)
    return;
  if (playState != PLAY_IDLE)
    return;
  if (strlen(schoolId) == 0)
    return;

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(30000);

  HTTPClient http;
  http.setTimeout(30000);

  String url = String(SUPABASE_URL) +
               "/rest/v1/audio_files?select=id,storage_path&school_id=eq." +
               String(schoolId);

  Serial.println("Syncing audio cache from Supabase");

  if (!http.begin(client, url)) {
    Serial.println("Failed to begin HTTP for audio cache");
    return;
  }

  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");

  int code = http.GET();
  if (code != 200) {
    Serial.print("Audio cache sync failed: ");
    Serial.println(code);
    http.end();
    return;
  }

  String body = http.getString();
  http.end();

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.print("Audio cache JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

  if (!doc.is<JsonArray>()) {
    Serial.println("Audio cache response is not an array");
    return;
  }

  JsonArray arr = doc.as<JsonArray>();
  Serial.printf("Audio cache manifest has %d items\n", arr.size());

  for (JsonObject obj : arr) {
    const char *id = obj["id"];
    const char *storagePath = obj["storage_path"];
    if (!id || !storagePath)
      continue;

    String audioId = String(id);
    String localPath = getLocalAudioPathForId(audioId);

    if (LittleFS.exists(localPath)) {
      continue;
    }

    String fullUrl = String(SUPABASE_URL) +
                     "/storage/v1/object/public/audio-files/" +
                     String(storagePath);

    Serial.print("Downloading audio file to ");
    Serial.println(localPath);
    bool ok = downloadFileToLittleFS(fullUrl, localPath);
    if (!ok) {
      Serial.println("Download failed");
    } else {
      Serial.println("Download succeeded");
    }
  }
}

void ackCommand(String cmdId) {
  Serial.println("Sending Ack for " + cmdId + "...");
  WiFiClientSecure ackClient;
  ackClient.setInsecure();
  ackClient.setTimeout(10000);

  HTTPClient ackHttp;
  ackHttp.begin(ackClient, String(SUPABASE_URL) + "/rest/v1/rpc/ack_command");
  ackHttp.addHeader("apikey", SUPABASE_KEY);
  ackHttp.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  ackHttp.addHeader("Content-Type", "application/json");
  ackHttp.POST("{\"p_command_id\": " + cmdId + ", \"p_device_mac\": \"" + deviceMacAddress + "\"}");
  ackHttp.end();
}

void performOTAUpdate(const String &url) {
  Serial.println("OTA Update requested from: " + url);
  lcdPrintLine(0, "OTA Update      ");
  lcdPrintLine(1, "Running...      ");
  lcdPrintLine(2, "Do Not Power Off");
  lcdPrintLine(3, "                ");

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(30000); // Increase timeout for large download

  // Note: httpUpdate.update() returns only on error or success.
  // If success, it restarts automatically by default.
  t_httpUpdate_return ret = httpUpdate.update(client, url);

  switch (ret) {
  case HTTP_UPDATE_FAILED:
    Serial.printf("HTTP_UPDATE_FAILED Error (%d): %s\n",
                  httpUpdate.getLastError(),
                  httpUpdate.getLastErrorString().c_str());
    break;

  case HTTP_UPDATE_NO_UPDATES:
    Serial.println("HTTP_UPDATE_NO_UPDATES");
    break;

  case HTTP_UPDATE_OK:
    Serial.println("HTTP_UPDATE_OK");
    break;
  }
}

void pollCommands() {
  // Don't interrupt playback with blocking WiFi operations
  if (playState != PLAY_IDLE) {
    if (!(playState == PLAY_STREAMING && streamModeActive))
      return;
  }

  // SMART SYNC: Check if a bell is coming up in < 2 minutes to prevent blocking
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    int currentMinOfDay = timeinfo.tm_hour * 60 + timeinfo.tm_min;
    for (const auto &item : activeSchedules) {
      bool dayMatch = false;
      for (int d : item.days)
        if (d == timeinfo.tm_wday)
          dayMatch = true;
      if (!dayMatch)
        continue;

      int bellMinOfDay = item.hour * 60 + item.minute;
      int diff = bellMinOfDay - currentMinOfDay;
      // If bell is imminent (-1 to 2 mins), skip poll
      if (diff >= -1 && diff <= 2) {
        return;
      }
    }
  }

  // deinitAudio(); // Free heap before SSL connection (Disabled for S3 to
  // prevent I2S init errors)
  if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE)
    return;

  Serial.println("Polling for commands...");

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(30000);
  client.setTimeout(30000);
  // client.setBufferSizes(4096, 1024); // Removed in ESP32 Core 3.0. Scoped
  // WiFiManager to free heap instead.

  HTTPClient http;
  http.setTimeout(30000);
  http.setUserAgent("ESP32-AutoBell/1.0");
  // Use RPC to bypass RLS - Updated to use poll_commands which supports MAC
  // address
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/poll_commands";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");

  // Use deviceMacAddress instead of deviceDbId
  String body = "{\"device_mac\": \"" + deviceMacAddress + "\"}";

  int code = http.POST(body);

  if (code == 200) {
    String response = http.getString();

    // Close connection IMMEDIATELY to free SSL buffers (essential for
    // subsequent ACK)
    http.end();

    if (response.length() == 0) {
      // Empty response is fine if no command, but usually RPC returns valid
      // JSON If it returns truly empty string, deserializeJson will fail with
      // InvalidInput anyway But let's handle it gracefully
      return;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (error) {
      Serial.print("Command JSON Parse Error: ");
      Serial.println(error.c_str());
      Serial.println("Raw Response: " + response);
      return;
    }

    // New Response Format: { "has_command": true, "id": ..., "command": ...,
    // "payload": ... }
    if (doc["has_command"].as<bool>() == true) {
      // DEBUG: Print full JSON
      String jsonDump;
      serializeJson(doc, jsonDump);
      Serial.println("JSON Received: " + jsonDump);

      String cmdId = doc["id"].as<String>();
      const char *cmd = doc["command"];

      // Create a temporary object to match existing logic if needed,
      // or just use 'doc' directly.
      JsonObject cmdObj = doc.as<JsonObject>();

      if (!cmd) {
        Serial.println("Received command object without 'command' field.");
        return;
      }

      Serial.print("*** COMMAND RECEIVED: ");
      Serial.print(cmd);
      Serial.println(" ***");

      // --- PAYLOAD NORMALIZATION ---
      // Handle cases where payload is a JSON Object OR a Stringified JSON
      JsonVariant rawPayload = doc["payload"];
      JsonDocument payloadDoc; // Buffer for parsed string payload
      JsonObject payload;      // The unified payload object

      if (rawPayload.is<JsonObject>()) {
        payload = rawPayload.as<JsonObject>();
      } else if (rawPayload.is<String>()) {
        String pStr = rawPayload.as<String>();
        if (pStr.startsWith("{")) {
          DeserializationError err = deserializeJson(payloadDoc, pStr);
          if (!err) {
            payload = payloadDoc.as<JsonObject>();
            Serial.println("Parsed Stringified Payload.");
          } else {
            Serial.print("Failed to parse payload string: ");
            Serial.println(err.c_str());
          }
        }
      }

      // Debug: Print Payload Keys
      if (!payload.isNull()) {
        Serial.println("Payload Keys:");
        for (JsonPair kv : payload) {
          Serial.println(kv.key().c_str());
        }
      } else {
        Serial.println("Payload is NULL or Empty");
      }
      // -----------------------------

      // Execute
      bool executed = false;

      bool quietOverride = false;
      if (!payload.isNull() && payload.containsKey("quiet_hours_override")) {
        quietOverride = payload["quiet_hours_override"].as<bool>();
      }
      if (!quietOverride && isSoundCommand(cmd) && isQuietHoursNow()) {
        Serial.println("Quiet Hours active. Ignoring sound command.");
        ackCommand(cmdId);
        return;
      }

      if (streamModeActive && streamBypassOtherAudio && isSoundCommand(cmd) &&
          strcmp(cmd, "STREAM_START") != 0) {
        Serial.println(
            "Stream bypass enabled. Ignoring sound command during stream.");
        ackCommand(cmdId);
        return;
      }

      if (strcmp(cmd, "STREAM_START") == 0) {
        Serial.println("Executing command: STREAM_START");
        String url = "";
        bool bypassOther = false;

        if (!payload.isNull()) {
          if (payload.containsKey("url")) {
            url = payload["url"].as<String>();
          }
          if (payload.containsKey("bypass_other_audio")) {
            bypassOther = payload["bypass_other_audio"].as<bool>();
          } else if (payload.containsKey("allow_other_audio")) {
            bypassOther = !payload["allow_other_audio"].as<bool>();
          }
        }

        url.trim();
        if (url.length() > 0) {
          streamModeActive = true;
          streamBypassOtherAudio = bypassOther;
          streamModeUrl = url;
          lastStreamRestartAttemptMs = 0;

          ackCommand(cmdId); // Ack FIRST
          executed = false;
          startStreamPlayback(streamModeUrl);
        } else {
          Serial.println("Error: No URL provided for STREAM_START");
        }
      } else if (strcmp(cmd, "STREAM_STOP") == 0) {
        Serial.println("Executing command: STREAM_STOP");
        ackCommand(cmdId); // Ack FIRST
        executed = false;
        streamModeActive = false;
        streamBypassOtherAudio = false;
        streamModeUrl = "";
        stopStreamPlayback();
      } else if (strcmp(cmd, "RING") == 0) {
        Serial.println("Executing command: RING");
        playBell();
        executed = true;
      } else if (strcmp(cmd, "PLAY_URL") == 0) {
        Serial.println("Executing command: PLAY_URL");
        String url = "";
        if (!payload.isNull()) {
          if (payload.containsKey("url")) {
            url = payload["url"].as<String>();
          } else if (payload.containsKey("audio_url")) {
            url = payload["audio_url"].as<String>();
          }
        }

        if (url.length() > 0) {
          url.trim();
          Serial.println("Streaming URL: " + url);
          ackCommand(cmdId); // Ack FIRST to avoid SSL conflict
          executed = false;
          streamingTimeoutMs = 0;

          // Stop any existing I2S sound
          if (audio && audio->isRunning())
            audio->stopSong();

          enableAmp();
          initAudio(); // Allocate Audio Object
          lcdPlayingType = "Streaming";
          lcdPlayingDetail = url;
          audio->connecttohost(url.c_str());
          audio->setVolume(getI2SVolumeFromSystem(systemVolume));
          playState = PLAY_STREAMING;
          playStateStartTime = millis();
          updateLCD();
        } else {
          Serial.println("Error: No URL provided in payload");
        }
      } else if (strcmp(cmd, "TTS") == 0) {
        Serial.println("Executing command: TTS");
        String text = "";
        String url = "";
        String lang = "en";
        String voiceGender = "";

        if (!payload.isNull()) {
          if (payload.containsKey("text")) {
            text = payload["text"].as<String>();
          }
          if (payload.containsKey("language")) {
            lang = payload["language"].as<String>();
          }
          if (payload.containsKey("voice_gender")) {
            voiceGender = payload["voice_gender"].as<String>();
          } else if (payload.containsKey("gender")) {
            voiceGender = payload["gender"].as<String>();
          }
          // Fallback: Check for URL if text is missing (Camb.ai might send URL
          // in TTS command)
          if (payload.containsKey("url")) {
            url = payload["url"].as<String>();
          }
        }

        if (text.length() > 0) {
          ackCommand(cmdId); // Ack FIRST
          executed = false;
          playTTS(text, lang, voiceGender);
        } else if (url.length() > 0) {
          Serial.println("TTS Command contains URL. Playing as Voice Note...");
          ackCommand(cmdId); // Ack FIRST
          executed = false;
          streamingTimeoutMs = 0;

          // Logic similar to VOICE_NOTE
          if (audio && audio->isRunning())
            audio->stopSong();
          enableAmp();
          initAudio();
          lcdPlayingType = "Voice Note";
          lcdPlayingDetail = url;
          audio->connecttohost(url.c_str());
          audio->setVolume(getI2SVolumeFromSystem(systemVolume));
          playState = PLAY_STREAMING;
          playStateStartTime = millis(); // Reset timer for grace period
          updateLCD();
        } else {
          Serial.println("Error: No text or url provided for TTS");
        }
      } else if (strcmp(cmd, "VOICE_NOTE") == 0) {
        Serial.println("Executing command: VOICE_NOTE");
        String url = "";
        if (!payload.isNull() && payload.containsKey("url")) {
          url = payload["url"].as<String>();
        }

        if (url.length() > 0) {
          url.trim();
          Serial.println("Playing Voice Note: " + url);
          ackCommand(cmdId); // Ack FIRST
          executed = false;
          streamingTimeoutMs = 0;

          if (audio && audio->isRunning())
            audio->stopSong();
          enableAmp();
          initAudio();
          lcdPlayingType = "Voice Note";
          lcdPlayingDetail = url;
          audio->connecttohost(url.c_str());
          audio->setVolume(getI2SVolumeFromSystem(systemVolume));
          playStateStartTime = millis();
          playState = PLAY_STREAMING;
          updateLCD();
        } else {
          Serial.println("Error: No URL provided for Voice Note");
        }
      } else if (strcmp(cmd, "TEST_BUZZER") == 0) {
        Serial.println("Executing command: TEST_BUZZER");
        testBuzzer();
        executed = true;
      } else if (strcmp(cmd, "SYNC_TIME") == 0) {
        Serial.println("Executing command: SYNC_TIME");
        esp_sntp_stop();
        esp_sntp_init();
        Serial.println("Time Synced via Command");
        executed = true;
      } else if (strcmp(cmd, "CONFIG") == 0 ||
                 strcmp(cmd, "SYNC_SCHEDULES") == 0) {
        Serial.println("Config/Sync Command Received. Refreshing details...");
        fetchDeviceDetails();
        syncSchedules();
        executed = true;
      } else if (strcmp(cmd, "SET_VOLUME") == 0) {
        Serial.println("Executing command: SET_VOLUME");
        if (!payload.isNull() && payload.containsKey("volume")) {
          int newVol = payload["volume"].as<int>();
          if (newVol >= 0 && newVol <= 30) {
            systemVolume = newVol;
            preferences.putInt("volume", systemVolume);

            if (audio) {
              audio->setVolume(getI2SVolumeFromSystem(systemVolume));
            }
            Serial.printf("Volume set to %d\n", systemVolume);
            executed = true;
          } else {
            Serial.println("Invalid volume range (0-30)");
          }
        }
      } else if (strcmp(cmd, "REBOOT") == 0) {
        Serial.println("Reboot Command Received. Restarting in 1s...");
        executed = true;
      } else if (strcmp(cmd, "UPDATE_FIRMWARE") == 0) {
        String url = "";
        if (!payload.isNull() && payload.containsKey("url")) {
          url = payload["url"].as<String>();
        }

        if (url.length() > 0) {
          Serial.println("Starting OTA Update from: " + url);
          // Ack FIRST to avoid SSL conflict and ensure server knows we got it
          // We must manually ack here because update() will reboot
          WiFiClientSecure ackClient;
          ackClient.setInsecure();
          HTTPClient ackHttp;
          ackHttp.begin(ackClient,
                        String(SUPABASE_URL) + "/rest/v1/rpc/ack_command");
          ackHttp.addHeader("apikey", SUPABASE_KEY);
          ackHttp.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
          ackHttp.addHeader("Content-Type", "application/json");
          ackHttp.POST("{\"p_command_id\": " + cmdId + "}");
          ackHttp.end();

          executed = false; // Prevent double ack

          performOTAUpdate(url);
        } else {
          Serial.println("Error: No URL provided for Firmware Update");
        }
      }

      // Ack
      if (executed) {
        Serial.println("Command Executed. Sending Ack...");
        HTTPClient ackHttp;
        ackHttp.begin(String(SUPABASE_URL) + "/rest/v1/rpc/ack_command");
        ackHttp.addHeader("apikey", SUPABASE_KEY);
        ackHttp.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
        ackHttp.addHeader("Content-Type", "application/json");
        ackHttp.POST("{\"p_command_id\": " + cmdId + "}");
        ackHttp.end();

        if (strcmp(cmd, "REBOOT") == 0) {
          delay(1000);
          ESP.restart();
        }
      }
    } else {
      // Debug: No command found (optional, can be noisy)
      // Serial.println("No pending commands.");
    }
  } else {
    Serial.print("Poll Error: ");
    Serial.println(code);
    if (code > 0) {
      Serial.println(http.getString());
    }
  }
}

void sendHeartbeat() {
  if (playState != PLAY_IDLE)
    return;
  if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE)
    return;

  int inputVoltageMv = -1;

#ifdef INPUT_VOLTAGE_ADC_PIN
  int raw = analogRead(INPUT_VOLTAGE_ADC_PIN);
  float vAdc = (raw / 4095.0f) * 3.3f;
  float vIn = vAdc * INPUT_VOLTAGE_DIVIDER_RATIO;
  inputVoltageMv = (int)(vIn * 1000.0f + 0.5f);
#endif

  String body = "{\"p_device_id\": \"" + deviceDbId +
                "\", \"p_status\": \"online\"";
  if (inputVoltageMv >= 0) {
    body += ", \"p_input_voltage_mv\": " + String(inputVoltageMv);
  }
  body += "}";

  HTTPClient http;
  http.begin(String(SUPABASE_URL) +
             "/rest/v1/rpc/update_heartbeat_with_power");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.POST(body);
  http.end();
}

void updateDeviceLocationOnce() {
  if (playState != PLAY_IDLE)
    return;
  if (locationSentThisBoot)
    return;
  if (WiFi.status() != WL_CONNECTED)
    return;
  if (deviceDbId.length() == 0)
    return;

  HTTPClient httpGeo;
  httpGeo.setConnectTimeout(8000);
  httpGeo.setUserAgent("ESP32-AutoBell/1.0");

  if (!httpGeo.begin("https://ipapi.co/json/")) {
    httpGeo.end();
    return;
  }

  int codeGeo = httpGeo.GET();
  if (codeGeo != 200) {
    httpGeo.end();
    return;
  }

  String geoBody = httpGeo.getString();
  httpGeo.end();

  JsonDocument geoDoc;
  DeserializationError geoErr = deserializeJson(geoDoc, geoBody);
  if (geoErr)
    return;

  String area = geoDoc["city"].as<String>();
  if (area.length() == 0)
    area = geoDoc["region"].as<String>();
  String city = geoDoc["city"].as<String>();
  String country = geoDoc["country_name"].as<String>();
  area.trim();
  city.trim();
  country.trim();

  if (city.length() == 0 && country.length() == 0)
    return;

  JsonDocument reqDoc;
  reqDoc["p_device_id"] = deviceDbId;
  reqDoc["p_location_area"] = area;
  reqDoc["p_location_city"] = city;
  reqDoc["p_location_country"] = country;

  String body;
  serializeJson(reqDoc, body);

  HTTPClient http;
  http.begin(String(SUPABASE_URL) +
             "/rest/v1/rpc/update_device_location");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();

  if (code == 200 || code == 204)
    locationSentThisBoot = true;
}

void parseSchedules(const JsonDocument &doc) {
  if (doc.containsKey("timezone_offset")) {
    int offsetMins = doc["timezone_offset"] | 300;
    long offsetSecs = (long)offsetMins * 60;
    Serial.printf("Updating Timezone Offset: %ld seconds (from server)\n",
                  offsetSecs);
    configTime(offsetSecs, 0, NTP_SERVERS[0], NTP_SERVERS[1], NTP_SERVERS[2]);
  }

  if (doc.containsKey("profile_name")) {
    String pName = doc["profile_name"].as<String>();
    Serial.printf("Active Profile: %s\n", pName.c_str());
  }

  if (doc.containsKey("qh")) {
    JsonObjectConst qh = doc["qh"].as<JsonObjectConst>();
    if (!qh.isNull()) {
      quietHoursEnabled = qh["en"] | false;
      String disableFrom = (qh["df"] | "21:00:00");
      String enableAt = (qh["ea"] | "07:00:00");
      int dfMins = timeStringToMins(disableFrom);
      int eaMins = timeStringToMins(enableAt);
      if (dfMins >= 0)
        quietHoursDisableFromMins = dfMins;
      if (eaMins >= 0)
        quietHoursEnableAtMins = eaMins;
      Serial.printf("Quiet Hours: %s (%02d:%02d -> %02d:%02d)\n",
                    quietHoursEnabled ? "ENABLED" : "DISABLED",
                    quietHoursDisableFromMins / 60,
                    quietHoursDisableFromMins % 60,
                    quietHoursEnableAtMins / 60, quietHoursEnableAtMins % 60);
    }
  }

  if (doc.containsKey("schedules")) {
    activeSchedules.clear();
    for (JsonObjectConst obj : doc["schedules"].as<JsonArrayConst>()) {
      ScheduleItem item;
      int h = 0, m = 0, s = 0;

      const char *timeStr = obj["t"];
      if (!timeStr)
        timeStr = obj["bell_time"];

      if (timeStr)
        sscanf(timeStr, "%d:%d:%d", &h, &m, &s);
      else {
        h = 0;
        m = 0;
      }

      item.hour = h;
      item.minute = m;
      item.second = s;

      const char *typeStr = obj["ty"];
      if (!typeStr)
        typeStr = obj["type"];
      item.type = typeStr ? String(typeStr) : "mp3";

      const char *ttsStr = obj["tt"];
      if (!ttsStr)
        ttsStr = obj["tts_text"];
      item.ttsMessage = ttsStr ? String(ttsStr) : "";
      const char *audioUrlStr = obj["audio_url"];
      item.audioUrl = audioUrlStr ? String(audioUrlStr) : "";
      const char *audioIdStr = obj["audio_id"];
      item.audioId = audioIdStr ? String(audioIdStr) : "";
      item.lastRung = 0;

      JsonVariantConst dField = obj["d"];
      if (dField.is<int>()) {
        int dInt = dField.as<int>();
        Serial.printf("  [Parsing] Found d as int: %d\n", dInt);
        if (dInt == 7)
          dInt = 0;
        item.days.push_back(dInt);
      } else if (dField.is<JsonArrayConst>()) {
        JsonArrayConst days = dField.as<JsonArrayConst>();
        Serial.printf("  [Parsing] Found d as array, size: %d\n", days.size());
        for (JsonVariantConst v : days) {
          if (v.is<int>()) {
            int dEntry = v.as<int>();
            if (dEntry == 7)
              dEntry = 0;
            item.days.push_back(dEntry);
          } else if (v.is<JsonArrayConst>()) {
            JsonArrayConst inner = v.as<JsonArrayConst>();
            for (JsonVariantConst innerVal : inner) {
              int dEntry = innerVal.as<int>();
              if (dEntry == 7)
                dEntry = 0;
              item.days.push_back(dEntry);
            }
          }
        }
      } else {
        JsonArrayConst legacyDays = obj["days_of_week"];
        if (!legacyDays.isNull()) {
          Serial.printf("  [Parsing] Found legacy days_of_week, size: %d\n",
                        legacyDays.size());
          for (int dLegacy : legacyDays) {
            if (dLegacy == 7)
              dLegacy = 0;
            item.days.push_back(dLegacy);
          }
        } else {
          Serial.println(
              "  [Parsing] WARNING: No day information found for this item!");
        }
      }
      activeSchedules.push_back(item);

      Serial.printf("Parsed Schedule: %02d:%02d:%02d (Final Days: ", item.hour,
                    item.minute, item.second);
      if (item.days.empty())
        Serial.print("NONE ");
      for (int dFin : item.days)
        Serial.printf("%d ", dFin);
      Serial.println(")");
    }

    Serial.printf("Parsed %d schedules\n", activeSchedules.size());
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
      } else {
        Serial.println("Failed to parse stored schedules");
      }
    }
  }
}

void checkSchedule() {
  if (playState != PLAY_IDLE) {
    if (!(playState == PLAY_STREAMING && streamModeActive))
      return;
  }
  int h, m, s, d;
  getCurrentTime(h, m, s, d);
  time_t now = time(NULL);

  // Diagnostic Log (Every 10s)
  static unsigned long lastDebug = 0;
  if (millis() - lastDebug > 10000) {
    Serial.printf("[SchDebug] Time: %02d:%02d:%02d Day: %d, Schedules: %d\n", h,
                  m, s, d, activeSchedules.size());
    lastDebug = millis();
  }

  // Removed strict (s == 0) check to allow precise second scheduling
  for (auto &sch : activeSchedules) {
    long diff = (h * 3600 + m * 60 + s) -
                (sch.hour * 3600 + sch.minute * 60 + sch.second);

    // RELAXED WINDOW: Allow 59 second window (catch-up)
    if (diff >= 0 && diff <= 59) {
      bool dayMatch = false;
      for (int day : sch.days)
        if (day == d)
          dayMatch = true;

      // Check if rung recently (Cooldown 60s)
      if (!dayMatch) {
        // Log if time matches but day doesn't (limited to avoid spam)
        static unsigned long lastDayMismatchLog = 0;
        if (millis() - lastDayMismatchLog > 10000) {
          Serial.printf("[Scheduler] Time match for %02d:%02d:%02d! But today "
                        "is Day %d and schedule expects: [",
                        sch.hour, sch.minute, sch.second, d);
          for (int k = 0; k < (int)sch.days.size(); k++)
            Serial.printf("%d%s", sch.days[k],
                          (k < (int)sch.days.size() - 1) ? "," : "");
          Serial.println("]");
          lastDayMismatchLog = millis();
        }
      }

      // Check if rung recently (Cooldown 60s)
      if (dayMatch) {
        if (now - sch.lastRung > 60) {
          Serial.printf("Executing Schedule: %02d:%02d:%02d (Day %d)\n",
                        sch.hour, sch.minute, sch.second, d);

          if (streamModeActive && streamBypassOtherAudio) {
            Serial.println("Stream bypass enabled. Skipping scheduled sound.");
            sch.lastRung = now;
            continue;
          }

          if (isQuietHoursNow()) {
            Serial.println("Quiet Hours active. Skipping scheduled sound.");
            sch.lastRung = now;
            continue;
          }

          if (sch.type == "tts") {
            if (sch.ttsMessage.length() > 0) {
              playTTS(sch.ttsMessage, "en");
            } else if (sch.audioUrl.length() > 0) {
              // Play audio URL if type is TTS but message is empty (e.g. voice
              // note scheduled)
              String fullUrl = String(SUPABASE_URL) +
                               "/storage/v1/object/public/audio-files/" +
                               sch.audioUrl;
              startStreamPlayback(fullUrl);
            } else {
              playBell();
            }
          } else if (sch.type == "mp3") {
            if (sch.audioUrl.length() > 0) {
              String localPath = "";
              if (sch.audioId.length() > 0)
                localPath = getLocalAudioPathForId(sch.audioId);

              bool playedLocal = false;
              if (localPath.length() > 0 && LittleFS.exists(localPath)) {
                streamingTimeoutMs = 0;
                if (audio && audio->isRunning())
                  audio->stopSong();
                enableAmp();
                initAudio();
                lcdPlayingType = "Voice Note";
                lcdPlayingDetail = sch.audioUrl;
                audio->connecttoFS(LittleFS, localPath.c_str());
                audio->setVolume(getI2SVolumeFromSystem(systemVolume));
                playState = PLAY_STREAMING;
                playStateStartTime = millis();
                playedLocal = true;
                updateLCD();
              }

              if (!playedLocal) {
                String fullUrl = String(SUPABASE_URL) +
                                 "/storage/v1/object/public/audio-files/" +
                                 sch.audioUrl;
                startStreamPlayback(fullUrl);
              }
            } else {
              playBell();
            }
          } else {
            playBell();
          }
          sch.lastRung = now;
        }
      }
    }
  }
}
