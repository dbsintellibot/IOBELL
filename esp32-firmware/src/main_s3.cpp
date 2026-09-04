#include "Audio.h"
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
#include <esp_wifi.h>
#include <esp_system.h>
#include <esp_mac.h>
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
// Supabase Configuration (Dynamic with working default fallbacks)
char SUPABASE_URL[100] = "https://hjlwzkwiweocnfztshmy.supabase.co";
char SUPABASE_KEY[300] =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbHd6a3dpd2VvY25menRzaG15Iiwicm9sZSI6Im"
    "Fub24iLCJpYXQiOjE3ODMzNjEyNDEsImV4cCI6MjA5ODkzNzI0MX0."
    "OUx-ZWTdA-_BCW8sbIMw8E13CONOh5IjcjLko87RRC0";

// Firmware Version
#define FIRMWARE_VERSION "1.0.1"

// Hardware Board Type Identifier
#define BOARD_TYPE "ESP32-S3 N16R8"

// #define PIN_RELAY       4    // Relay Pin (Unused)
#define PIN_LED_STATUS 2 // Status LED
#define PIN_LED_POWER 13 // System On/Off LED
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
const unsigned long COMMAND_POLL_INTERVAL = 15 * 1000; // 15s (optimized to reduce TLS memory fragmentation & RF power surges)
const unsigned long HEARTBEAT_INTERVAL = 60 * 1000;
const unsigned long PROVISION_POLL_INTERVAL = 10 * 1000;
const unsigned long AUDIO_CACHE_SYNC_INTERVAL = 10 * 60 * 1000;

// NTP Servers (Multiple for redundancy)
const char *NTP_SERVERS[] = {"pk.pool.ntp.org", "pool.ntp.org",
                             "time.google.com"};

// ==========================================
// GLOBALS & BOOT DIAGNOSTICS
// ==========================================

esp_reset_reason_t bootResetReason = ESP_RST_UNKNOWN;
String bootResetReasonStr = "";
bool bootReasonLogged = false;

String getResetReasonString(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON:   return "POWERON_RESET (Cold boot / Power connected)";
    case ESP_RST_EXT:       return "EXTERNAL_RESET (External reset pin / button)";
    case ESP_RST_SW:        return "SW_RESET (Software restart via esp_restart)";
    case ESP_RST_PANIC:     return "PANIC_RESET (Software crash / Guru Meditation / Exception)";
    case ESP_RST_INT_WDT:   return "INT_WDT_RESET (Interrupt Watchdog timeout)";
    case ESP_RST_TASK_WDT:  return "TASK_WDT_RESET (Task Watchdog timeout)";
    case ESP_RST_WDT:       return "OTHER_WDT_RESET (Other Watchdog reset)";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP_RESET (Wake from deep sleep)";
    case ESP_RST_BROWNOUT:  return "BROWNOUT_RESET (Voltage dip below ~2.8V - power supply sag)";
    case ESP_RST_SDIO:      return "SDIO_RESET (Reset over SDIO)";
    default:                return "UNKNOWN_RESET (" + String((int)reason) + ")";
  }
}

RTC_DS3231 rtc;
bool rtcFound = false;

LiquidCrystal_I2C lcd(0x27, 16, 2); // Address 0x27 for 16x2 I2C LCD (Shares RTC SDA/SCL pins 8 and 9)

String lcdPlayingType = "";
String lcdPlayingDetail = "";
String lcdBuzzerDetail = "Manual Bell";

Audio *audio = NULL; // I2S Audio Object (Dynamic for RAM optimization)
int systemVolume = 30;
bool quietHoursEnabled = false;
int quietHoursDisableFromMins = 21 * 60;
int quietHoursEnableAtMins = 7 * 60;

bool preAnnouncementEnabled = true;
String preAnnouncementUrl = "";
int preAnnouncementDelaySeconds = 3;

void logToDatabase(String level, String message);
bool playLocalPreAnnouncementChime(bool forcePlay = false);

static int getI2SVolumeFromSystem(int sysVol) {
  if (sysVol < 0) sysVol = 0;
  if (sysVol <= 21) return sysVol;
  int v = (sysVol * 21) / 100;
  if (v > 21) v = 21;
  return v;
}

static bool isQuietHoursNow();

void initAudio();
void enableAmp();
void disableAmp();

const uint32_t MIN_HEAP_FOR_AUDIO = 50000;

void initAudio() {
  if (audio == NULL) {
    if (ESP.getFreeHeap() < MIN_HEAP_FOR_AUDIO) {
      Serial.printf("initAudio: SKIPPED — free heap %u < %u\n",
                    ESP.getFreeHeap(), MIN_HEAP_FOR_AUDIO);
      return;
    }
    audio = new Audio();
    audio->setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
    audio->setVolume(getI2SVolumeFromSystem(systemVolume));
    Serial.println("Audio Initialized (Heap Allocated with PSRAM Buffers)");
  }
}

void deinitAudio() {
  // Intentional no-op — Audio object is kept alive for the entire firmware lifetime
  // to prevent heap fragmentation from repeated alloc/free cycles.
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
int pendingCommandCount = 0; // Number of pending commands in server queue

// Playback State Machine
enum PlayState {
  PLAY_IDLE,
  PLAY_BUZZER,
  PLAY_STREAMING // New state for I2S streaming
};

volatile PlayState playState = PLAY_IDLE;
unsigned long playStateStartTime = 0;
volatile bool isLocalPlayback = false;
volatile bool audioHasStarted = false;

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
  int trackNumber;
  std::vector<int> days; // 1=Mon, 7=Sun
  String type;
  String ttsMessage;
  String audioUrl;
  String audioId;
  time_t lastRung; // Timestamp of last execution
  bool precombined;
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

void playBell(String label = "Manual Bell");
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

// ==========================================
// WIFI DIAGNOSTICS & HARDWARE CONFIGURATION
// ==========================================

const char *getWiFiDisconnectReason(uint8_t reason) {
  switch (reason) {
  case 1:   return "UNSPECIFIED";
  case 2:   return "AUTH_EXPIRE";
  case 3:   return "AUTH_LEAVE";
  case 4:   return "ASSOC_EXPIRE";
  case 5:   return "ASSOC_TOOMANY (Router Client Limit Reached)";
  case 6:   return "NOT_AUTHED";
  case 7:   return "NOT_ASSOCED";
  case 8:   return "ASSOC_LEAVE";
  case 9:   return "ASSOC_NOT_AUTHED";
  case 10:  return "DISASSOC_PWRCAP_BAD";
  case 11:  return "DISASSOC_SUPCHAN_BAD";
  case 12:  return "IE_INVALID";
  case 13:  return "MIC_FAILURE";
  case 14:  return "4WAY_HANDSHAKE_TIMEOUT (Password Mismatch or WPA3/PMF issue)";
  case 15:  return "GROUP_KEY_UPDATE_TIMEOUT";
  case 16:  return "IE_IN_4WAY_DIFFERS";
  case 17:  return "GROUP_CIPHER_INVALID";
  case 18:  return "PAIRWISE_CIPHER_INVALID";
  case 19:  return "AKMP_INVALID";
  case 20:  return "UNSUPP_RSN_IE_VERSION";
  case 21:  return "INVALID_RSN_IE_CAP";
  case 22:  return "802_1X_AUTH_FAILED";
  case 23:  return "CIPHER_SUITE_REJECTED";
  case 200: return "BEACON_TIMEOUT (Weak signal or AP disappeared)";
  case 201: return "NO_AP_FOUND (SSID not found - check 2.4GHz vs 5GHz or Channel 12/13)";
  case 202: return "AUTH_FAIL (Incorrect password or WPA authentication failed)";
  case 203: return "ASSOC_FAIL (Association failed)";
  case 204: return "HANDSHAKE_TIMEOUT (Handshake timed out - WPA3 / PMF issue)";
  case 205: return "CONNECTION_FAIL";
  case 206: return "AP_TSF_RESET";
  case 207: return "ROAMING";
  default:  return "UNKNOWN_REASON";
  }
}

void configureWiFiCountryAndPower() {
  uint8_t customMac[6] = {0xE4, 0x05, 0x92, 0x7B, 0x0F, 0xFC};
  esp_wifi_set_mac(WIFI_IF_STA, customMac);

  wifi_country_t country;
  memset(&country, 0, sizeof(country));
  strcpy(country.cc, "PK");
  country.schan = 1;
  country.nchan = 13;
  country.max_tx_power = 20;
  country.policy = WIFI_COUNTRY_POLICY_AUTO;
  esp_err_t err = esp_wifi_set_country(&country);
  if (err == ESP_OK) {
    Serial.println("[WiFiDiag] Country code set to PK (Channels 1-13 unlocked)");
  } else {
    Serial.printf("[WiFiDiag] Note: esp_wifi_set_country returned 0x%x\n", err);
  }

  // Ensure 802.11 b/g/n protocols are all enabled
  esp_wifi_set_protocol(WIFI_IF_STA, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);

  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
}

void onWiFiDiagnosticEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    uint8_t reason = info.wifi_sta_disconnected.reason;
    Serial.printf("[WiFiDiag] Disconnected! Reason %d: %s\n", reason, getWiFiDisconnectReason(reason));
  } else if (event == ARDUINO_EVENT_WIFI_STA_CONNECTED) {
    Serial.printf("[WiFiDiag] Associated with AP successfully (Channel: %d)\n", WiFi.channel());
  } else if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    Serial.print("[WiFiDiag] IP Address acquired: ");
    Serial.println(WiFi.localIP());
  }
}

void onSecondTick() { scheduleTick = true; }

void setup() {
  uint8_t customBaseMac[6] = {0xE4, 0x05, 0x92, 0x7B, 0x0F, 0xFC};
  esp_base_mac_addr_set(customBaseMac);

  Serial.begin(115200);
  bootResetReason = esp_reset_reason();
  bootResetReasonStr = getResetReasonString(bootResetReason);

  Serial.println("\n\n==========================================");
  Serial.println("           AUTO-BELL S3 BOOT               ");
  Serial.println("==========================================");
  Serial.printf("[DIAGNOSTIC] Boot Reset Reason: %s\n", bootResetReasonStr.c_str());
  Serial.printf("[DIAGNOSTIC] Total Heap: %d, Free Heap: %d\n", ESP.getHeapSize(), ESP.getFreeHeap());
  Serial.printf("[DIAGNOSTIC] Total PSRAM: %d, Free PSRAM: %d\n", ESP.getPsramSize(), ESP.getFreePsram());
  Serial.println("==========================================");

  esp_log_level_set("*", ESP_LOG_WARN);
  esp_log_level_set("i2s_common", ESP_LOG_NONE);
  esp_log_level_set("i2s_std", ESP_LOG_NONE);

  // Watchdog Timer (WDT) Configuration moved to after WiFi connection to
  // prevent boot loops

  Serial.print("Supabase URL: ");
  Serial.println(SUPABASE_URL);

  // Ensure Maximum Performance
  setCpuFrequencyMhz(240);
  // WiFi.setSleep(false); // Moved to after WiFi.mode(WIFI_STA)

  preferences.begin("autobell", false);
  String storedName = preferences.getString("dev_name", "AutoBell Device");
  String storedSchool = preferences.getString("school_id", "");
  bool wifiInitialized = preferences.getBool("wifi_init", false);
  bool storedIsActive = preferences.getBool("is_active", false);
  int storedTzOffset = preferences.getInt("tz_offset", UTC_OFFSET_SEC);
  storedName.toCharArray(deviceName, 40);
  storedSchool.toCharArray(schoolId, 40);
  systemVolume = preferences.getInt("volume", 21);
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

  preAnnouncementEnabled = preferences.getBool("pa_en", true);
  preAnnouncementUrl = preferences.getString("pa_url", "");
  preAnnouncementDelaySeconds = preferences.getInt("pa_delay", 3);

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

  // Init SNTP BEFORE RTC restore so RTC's settimeofday() takes precedence
  // (configTime resets system clock to epoch; without WiFi, NTP never syncs)
  Serial.println("Initializing SNTP...");
  sntp_set_time_sync_notification_cb(timeSyncCallback);
  int effTzOffset = preferences.getInt("tz_offset", UTC_OFFSET_SEC);
  configTime(effTzOffset, 0, NTP_SERVERS[0], NTP_SERVERS[1], NTP_SERVERS[2]);

  // Init RTC
  Wire.begin(PIN_RTC_SDA, PIN_RTC_SCL);
  Wire.setTimeOut(100); // Guard against floating I2C bus lines

  // Scan I2C to see if LCD at address 0x27 is present before initializing
  Wire.beginTransmission(0x27);
  byte lcdErr = Wire.endTransmission();
  if (lcdErr == 0) {
    Serial.println("LCD found at I2C address 0x27. Initializing LCD...");
    initLCD();
    char verLine[17];
    snprintf(verLine, sizeof(verLine), "AutoBell v%-5s", FIRMWARE_VERSION);
    lcdPrintLine(0, verLine);
    lcdPrintLine(1, "Digitap Biz Sol.");
    delay(3000);
  } else {
    Serial.println("LCD not found at I2C address 0x27. Skipping LCD init.");
  }

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
    } else {
      Serial.println("[WARNING] RTC time uninitialized (Year < 2024). Will sync via SNTP when online.");
    }
  }

  // NVS Time Fallback: If system time is still at epoch (RTC battery dead / RTC not found),
  // restore the last known good time saved to flash. It won't be exact but far better than epoch 0.
  {
    time_t checkSec = time(NULL);
    if (checkSec < 1700000000) {
      time_t savedEpoch = (time_t)preferences.getLong("last_epoch", 0);
      if (savedEpoch > 1700000000) {
        struct timeval tv = {.tv_sec = savedEpoch, .tv_usec = 0};
        settimeofday(&tv, NULL);
        Serial.printf("[NVS-Fallback] System Time restored from NVS: %ld\n", savedEpoch);
        if (rtcFound) {
          rtc.adjust(DateTime((uint32_t)savedEpoch));
          Serial.println("[NVS-Fallback] RTC also updated from NVS epoch.");
        }
      } else {
        Serial.println("[WARNING] No valid time source available (RTC/NTP/NVS all failed).");
      }
    }
  }

  // Init LittleFS
  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS Mount Failed");
    // digitalWrite(PIN_LED_POWER, HIGH); // Already ON
  } else {
    if (!LittleFS.exists("/chimes")) {
      LittleFS.mkdir("/chimes");
    }
    if (!LittleFS.exists("/audio")) {
      LittleFS.mkdir("/audio");
    }
  }

  // Init I2S Audio
  // audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT); // Handled in initAudio()
  // audio.setVolume(21); // Handled in initAudio()
  // Serial.println("I2S Audio Initialized");

  // Initialize WiFi to Station Mode to ensure MAC is readable
  WiFi.mode(WIFI_STA);
  uint8_t customStaMac[6] = {0xE4, 0x05, 0x92, 0x7B, 0x0F, 0xFC};
  esp_wifi_set_mac(WIFI_IF_STA, customStaMac);
  WiFi.onEvent(onWiFiDiagnosticEvent);
  configureWiFiCountryAndPower();
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
    lcdPrintLine(0, "AP:AutoBell-Setup");
    lcdPrintLine(1, "IP: 192.168.4.1 ");

    WiFiManager wm;
    wm.setSaveConfigCallback(saveConfigCallback);
    wm.setConfigPortalTimeout(60); // 1 minute portal timeout on initial setup boot

    WiFiManagerParameter custom_device_name("name", "Device Name", deviceName,
                                            40);
    WiFiManagerParameter custom_school_id("school", "School ID (Optional)",
                                          schoolId, 40);
    WiFiManagerParameter custom_supa_url("supa_url", "Supabase URL", SUPABASE_URL, 100);
    WiFiManagerParameter custom_supa_key("supa_key", "Supabase Key", SUPABASE_KEY, 300);

    wm.addParameter(&custom_device_name);
    wm.addParameter(&custom_school_id);
    wm.addParameter(&custom_supa_url);
    wm.addParameter(&custom_supa_key);

    if (!wm.autoConnect("AutoBell-Setup")) {
      Serial.println("Initial setup AP portal timed out (60s). Continuing in offline mode.");
      lcdPrintLine(0, "Setup Timeout   ");
      lcdPrintLine(1, "Offline Mode... ");
      delay(2000);
      WiFi.softAPdisconnect(true);
      WiFi.mode(WIFI_STA);
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWiFi connected (initial setup)");
      Serial.print("IP address: ");
      Serial.println(WiFi.localIP());
      lcdPrintLine(0, "WiFi Connected! ");
      lcdPrintLine(1, WiFi.localIP().toString());
      delay(2000);
      digitalWrite(PIN_LED_STATUS, HIGH);

      String currentSsid = WiFi.SSID();
      String currentPass = WiFi.psk();
      if (currentSsid.length() > 0) {
        preferences.putString("wifi_ssid", currentSsid);
        preferences.putString("wifi_pass", currentPass);
        Serial.print("Persisted WiFi SSID: ");
        Serial.println(currentSsid);
      }
      preferences.putBool("wifi_init", true);
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
      Serial.println("Saved custom parameters");
    }
  } else {
    Serial.println("WiFi configured, trying stored credentials");
    lcdPrintLine(0, "Connecting to   ");
    lcdPrintLine(1, "WiFi...         ");

    String storedSsid = preferences.getString("wifi_ssid", "");
    String storedPass = preferences.getString("wifi_pass", "");
    if (storedSsid.length() > 0) {
      Serial.print("Using stored WiFi SSID: ");
      Serial.println(storedSsid);
      configureWiFiCountryAndPower();
      WiFi.begin(storedSsid.c_str(), storedPass.c_str());

      unsigned long startWait = millis();
      while (WiFi.status() != WL_CONNECTED &&
             millis() - startWait < 25000) {
        delay(500);
      }
    } else {
      Serial.println("No stored WiFi credentials found in preferences");
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWiFi reconnected using stored credentials");
      Serial.print("IP address: ");
      Serial.println(WiFi.localIP());
      lcdPrintLine(0, "WiFi Connected! ");
      lcdPrintLine(1, WiFi.localIP().toString());
      delay(2000);
      digitalWrite(PIN_LED_STATUS, HIGH);
    } else {
      Serial.println("Stored WiFi credentials failed, starting AutoBell-Setup portal (60s timeout)");
      lcdPrintLine(0, "AP:AutoBell-Setup");
      lcdPrintLine(1, "IP: 192.168.4.1 ");

      WiFi.disconnect(true);
      delay(100);
      WiFi.mode(WIFI_AP);
      delay(100);

      WiFiManager wm;
      wm.setSaveConfigCallback(saveConfigCallback);
      wm.setConfigPortalTimeout(60); // 1 minute portal timeout on boot recovery

      WiFiManagerParameter custom_device_name("name", "Device Name", deviceName,
                                              40);
      WiFiManagerParameter custom_school_id("school", "School ID (Optional)",
                                            schoolId, 40);
      WiFiManagerParameter custom_supa_url("supa_url", "Supabase URL", SUPABASE_URL, 100);
      WiFiManagerParameter custom_supa_key("supa_key", "Supabase Key", SUPABASE_KEY, 300);

      wm.addParameter(&custom_device_name);
      wm.addParameter(&custom_school_id);
      wm.addParameter(&custom_supa_url);
      wm.addParameter(&custom_supa_key);

      if (!wm.startConfigPortal("AutoBell-Setup")) {
        Serial.println("Recovery Portal timed out (60s). Continuing in offline mode.");
        lcdPrintLine(0, "Setup Timeout   ");
        lcdPrintLine(1, "Offline Mode... ");
        delay(2000);
        WiFi.softAPdisconnect(true);
        WiFi.mode(WIFI_STA);
      }

      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected via recovery portal");
        Serial.print("IP address: ");
        Serial.println(WiFi.localIP());
        lcdPrintLine(0, "WiFi Connected! ");
        lcdPrintLine(1, WiFi.localIP().toString());
        delay(2000);
        digitalWrite(PIN_LED_STATUS, HIGH);

        String currentSsid = WiFi.SSID();
        String currentPass = WiFi.psk();
        if (currentSsid.length() > 0) {
          preferences.putString("wifi_ssid", currentSsid);
          preferences.putString("wifi_pass", currentPass);
          Serial.print("Persisted new WiFi SSID: ");
          Serial.println(currentSsid);
        }
      } else {
        Serial.println("Running in Offline Mode (stored credentials preserved).");
        lcdPrintLine(0, "WiFi Offline    ");
        lcdPrintLine(1, "Running Offline ");
        delay(1500);
        WiFi.softAPdisconnect(true);
        WiFi.mode(WIFI_STA);
        // CRITICAL FIX: WiFi.disconnect(true) at portal entry erased flash credentials.
        // Re-initiate WiFi.begin() with NVS-stored credentials so the background
        // reconnect loop in loop() can actually reconnect.
        if (storedSsid.length() > 0) {
          WiFi.begin(storedSsid.c_str(), storedPass.c_str());
          Serial.println("Re-initiated WiFi.begin() with stored credentials for background reconnect.");
        }
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
    }
  }

// Watchdog Timer (WDT) Configuration
// Refined: idle_core_mask set to 0 so WiFi/TLS network processing on Core 0 does not trigger false watchdog panics
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t twdt_config = {
      .timeout_ms = 60000,
      .idle_core_mask = 0, // 0 = Do NOT monitor Core 0/1 idle tasks to prevent false panics from WiFi/TLS
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

  // SNTP already initialized before RTC restore (see above)

  // Start 1Hz Timer for Scheduler
  timer1s.attach(1.0, onSecondTick);

  if (currentState == STATE_ACTIVE) {
    if (!bootReasonLogged && WiFi.status() == WL_CONNECTED) {
      bootReasonLogged = true;
      String logLvl = (bootResetReason == ESP_RST_POWERON || bootResetReason == ESP_RST_SW) ? "INFO" : "WARN";
      logToDatabase(logLvl, "Device Booted. Reset Reason: " + bootResetReasonStr + " | FreeHeap: " + String(ESP.getFreeHeap()) + " B");
    }
    syncSchedules();
    syncAudioCache();
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
    {
      if (audio && audio->isRunning()) {
        audioHasStarted = true;
      }

      if (audioHasStarted) {
        if (audio && !audio->isRunning()) {
          Serial.println(isLocalPlayback ? "Local Playback Finished." : "Streaming Finished.");
          disableAmp();
          playState = PLAY_IDLE;
          isLocalPlayback = false;
          audioHasStarted = false;
          streamingTimeoutMs = 0;
          updateLCD();
        }
      } else {
        // Startup buffer / grace period before audio decoding begins
        unsigned long startupTimeout = isLocalPlayback ? 3000 : 10000;
        if (millis() - playStateStartTime > startupTimeout) {
          Serial.println(isLocalPlayback ? "Local Playback Failed to Start (Timeout)." : "Stream Buffering Timeout.");
          if (audio && audio->isRunning())
            audio->stopSong();
          disableAmp();
          playState = PLAY_IDLE;
          isLocalPlayback = false;
          audioHasStarted = false;
          streamingTimeoutMs = 0;
          updateLCD();
        }
      }

      if (!streamModeActive && playState == PLAY_STREAMING) {
        unsigned long effectiveTimeout = (streamingTimeoutMs > 0) ? streamingTimeoutMs : 45000;
        if (millis() - playStateStartTime > effectiveTimeout) {
          Serial.println("Streaming Timeout / Watchdog Triggered. Force Stop.");
          if (audio && audio->isRunning())
            audio->stopSong();
          disableAmp();
          playState = PLAY_IDLE;
          isLocalPlayback = false;
          audioHasStarted = false;
          streamingTimeoutMs = 0;
          updateLCD();
        }
      }
    }
    break;

  case PLAY_BUZZER:
    if (millis() - playStateStartTime >= 3000) {
      if (audio && audio->isRunning()) {
        audio->stopSong();
      }
      noTone(PIN_BUZZER);
      digitalWrite(PIN_BUZZER, LOW);
      disableAmp();
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
  // 3. WiFi Reconnect (Non-blocking runtime search) & 1s LED Blink
  static unsigned long lastWiFiCheck = 0;
  static unsigned long lastLedToggle = 0;
  static unsigned long wifiDisconnectedSince = 0;

  if (WiFi.status() != WL_CONNECTED) {
    if (wifiDisconnectedSince == 0) {
      wifiDisconnectedSince = millis();
    }

    // Blink Status LED 1 sec ON, 1 sec OFF when disconnected
    if (millis() - lastLedToggle >= 1000) {
      lastLedToggle = millis();
      static bool ledState = false;
      ledState = !ledState;
      digitalWrite(PIN_LED_STATUS, ledState ? HIGH : LOW);
    }

    // WiFi reconnect check every 10 seconds
    if (millis() - lastWiFiCheck >= 10000) {
      lastWiFiCheck = millis();
      unsigned long elapsedSecs = (millis() - wifiDisconnectedSince) / 1000;
      if (elapsedSecs <= 60) {
        Serial.printf("WiFi lost for %lu s, searching for WiFi...\n", elapsedSecs);
      } else {
        Serial.printf("WiFi offline for %lu s, running offline (reconnect active)...\n", elapsedSecs);
      }

      // WiFi.reconnect() fails if credentials were erased by WiFi.disconnect(true)
      // during AP portal setup. Use WiFi.begin() with NVS-stored credentials instead.
      String rSsid = preferences.getString("wifi_ssid", "");
      String rPass = preferences.getString("wifi_pass", "");
      if (rSsid.length() > 0) {
        configureWiFiCountryAndPower();
        WiFi.begin(rSsid.c_str(), rPass.c_str());
      } else {
        configureWiFiCountryAndPower();
        WiFi.reconnect();
      }
    }
  } else {
    wifiDisconnectedSince = 0;
    digitalWrite(PIN_LED_STATUS, HIGH);
  }

  // 4. State Logic
  if (currentState == STATE_UNASSIGNED || currentState == STATE_BOOT) {
    if (millis() - lastProvisionPoll >= PROVISION_POLL_INTERVAL) {
      lastProvisionPoll = millis();
      fetchDeviceDetails();
      if (currentState == STATE_ACTIVE) {
        if (!bootReasonLogged && WiFi.status() == WL_CONNECTED) {
          bootReasonLogged = true;
          String logLvl = (bootResetReason == ESP_RST_POWERON || bootResetReason == ESP_RST_SW) ? "INFO" : "WARN";
          logToDatabase(logLvl, "Device Booted. Reset Reason: " + bootResetReasonStr + " | FreeHeap: " + String(ESP.getFreeHeap()) + " B");
        }
        preferences.putString("school_id", schoolId);
        preferences.putBool("is_active", true);
        preferences.putString("supa_url", SUPABASE_URL);
        preferences.putString("supa_key", SUPABASE_KEY);
        syncSchedules();
        syncAudioCache();
        lastAudioCacheSync = millis();
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

  // Keep RTC synced with valid system time every 60s + persist epoch to NVS every 5 min
  static unsigned long lastRtcSync = 0;
  static unsigned long lastNvsTimeSave = 0;
  if (millis() - lastRtcSync > 60000) {
    lastRtcSync = millis();
    time_t nowSec = time(NULL);
    if (nowSec > 1700000000) {
      if (rtcFound) {
        rtc.adjust(DateTime((uint32_t)nowSec));
      }
      // Save epoch to NVS every 5 minutes (survives power cycles even with dead RTC battery)
      if (millis() - lastNvsTimeSave > 300000) {
        lastNvsTimeSave = millis();
        preferences.putLong("last_epoch", (long)nowSec);
        Serial.printf("[NVS] Persisted epoch: %ld\n", nowSec);
      }
    }
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

bool lcdInitialized = false;

void initLCD() {
  lcd.init();
  lcd.clear();     // Clear display RAM to prevent garbled characters
  lcd.backlight();
  lcdInitialized = true;
}

void lcdPrintLine(int row, String text) {
  if (!lcdInitialized) return;
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
  if (currentState == STATE_BOOT) {
    lcdPrintLine(0, "AutoBell S3 Boot");
    lcdPrintLine(1, "Starting up...  ");
    return;
  }

  if (currentState == STATE_UNASSIGNED) {
    lcdPrintLine(0, "Unassigned Dev  ");
    if (WiFi.status() == WL_CONNECTED) {
      char line1[17];
      snprintf(line1, sizeof(line1), "IP:%s", WiFi.localIP().toString().c_str());
      lcdPrintLine(1, line1);
    } else {
      lcdPrintLine(1, "WiFi: Disconnect");
    }
    return;
  }
  
  if (playState == PLAY_BUZZER) {
    lcdPrintLine(0, "Buzzer Ringing! ");
    String bLabel = lcdBuzzerDetail.length() > 0 ? lcdBuzzerDetail : "Manual Bell";
    lcdPrintLine(1, bLabel);
  } else if (playState == PLAY_STREAMING) {
    lcdPrintLine(0, lcdPlayingType + " Playing");
    if (lcdPlayingType == "TTS") {
      lcdPrintLine(1, lcdPlayingDetail.substring(0, 16));
    } else if (lcdPlayingType == "Voice Note") {
      String name = lcdPlayingDetail;
      int lastSlash = name.lastIndexOf('/');
      if (lastSlash >= 0) name = name.substring(lastSlash + 1);
      lcdPrintLine(1, name.substring(0, 16));
    } else { // "Streaming"
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
      lcdPrintLine(1, host.substring(0, 16));
    }
  } else { // PLAY_IDLE
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
    
    // Show pending command count if any commands are queued
    if (pendingCommandCount > 0) {
      char line2[17];
      snprintf(line2, sizeof(line2), "Cmds Queued: %d", pendingCommandCount);
      lcdPrintLine(1, line2);
    } else {
      ScheduleItem* next = getNextBell(h, m, s, d);
      if (next) {
        char line2[17];
        snprintf(line2, sizeof(line2), "Nxt:%02d:%02d (%s)", next->hour, next->minute, next->type.c_str());
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

  String filename = audioId;
  // Hash IDs longer than 20 characters (like UUIDs) to fit LittleFS name limit
  if (audioId.length() > 20) {
    uint32_t hash = 2166136261U;
    for (size_t i = 0; i < audioId.length(); i++) {
      hash ^= (uint32_t)audioId.charAt(i);
      hash *= 16777619U;
    }
    char hex[9];
    sprintf(hex, "%08x", hash);
    filename = String(hex);
  }

  String path = "/audio/";
  path += filename;
  path += ".mp3";
  return path;
}

bool downloadFileToLittleFS(const String &url, const String &localPath) {
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(30000);

  HTTPClient http;
  http.setTimeout(30000);
  if (!http.begin(client, url)) {
    Serial.println("Failed to begin HTTP download for: " + url);
    client.stop();
    return false;
  }

  int code = http.GET();
  if (code != 200) {
    Serial.println("HTTP GET failed with code: " + String(code) + " for URL: " + url);
    http.end();
    client.stop();
    return false;
  }

  int contentLength = http.getSize();
  size_t freeSpace = LittleFS.totalBytes() - LittleFS.usedBytes();
  if (contentLength > 0 && freeSpace < (size_t)contentLength + 8192) {
    Serial.printf("LittleFS FULL! Free: %u, Required: %d\n", freeSpace, contentLength);
    http.end();
    client.stop();
    return false;
  }

  WiFiClient *stream = http.getStreamPtr();
  int lastSlash = localPath.lastIndexOf('/');
  if (lastSlash > 0) {
    String dir = localPath.substring(0, lastSlash);
    if (!LittleFS.exists(dir)) {
      LittleFS.mkdir(dir);
    }
  }
  File file = LittleFS.open(localPath, "w");
  if (!file) {
    Serial.println("Failed to open local path for writing: " + localPath);
    http.end();
    client.stop();
    return false;
  }

  uint8_t buffer[1024];
  size_t totalBytesWritten = 0;
  unsigned long startDownloadMs = millis();
  bool timedOut = false;
  while (http.connected()) {
    esp_task_wdt_reset();
    if (millis() - startDownloadMs > 30000) {
      Serial.println("Download timeout (30s limit exceeded): " + localPath);
      timedOut = true;
      break;
    }
    size_t available = stream->available();
    if (available) {
      int toRead = available;
      if (toRead > (int)sizeof(buffer))
        toRead = sizeof(buffer);
      int read = stream->readBytes((char *)buffer, toRead);
      if (read > 0) {
        file.write(buffer, read);
        totalBytesWritten += read;
        // Break early if we've received the entire file (prevents keep-alive timeouts)
        if (contentLength > 0 && totalBytesWritten >= (size_t)contentLength) {
          break;
        }
      }
    } else {
      if (!stream->connected())
        break;
      delay(1);
    }
  }

  file.close();
  http.end();
  client.stop();

  if (timedOut || (contentLength > 0 && totalBytesWritten < (size_t)contentLength) || totalBytesWritten == 0) {
    Serial.printf("Download failed/incomplete! Written: %u, Expected: %d. Removing file: %s\n",
                  totalBytesWritten, contentLength, localPath.c_str());
    LittleFS.remove(localPath);
    return false;
  }

  Serial.println("Download complete: " + localPath + ", size: " + String(totalBytesWritten) + " bytes");
  return true;
}

bool playLocalPreAnnouncementChime(bool forcePlay) {
  if (!forcePlay && !preAnnouncementEnabled)
    return false;

  String chimePath = "/chimes/pre_announcement.mp3";
  bool isLocal = false;
  size_t localSize = 0;
  if (LittleFS.exists(chimePath)) {
    File f = LittleFS.open(chimePath, "r");
    if (f) {
      localSize = f.size();
      if (localSize > 0) {
        isLocal = true;
      }
      f.close();
    }
  }

  Serial.println("Pre-chime verification: forcePlay=" + String(forcePlay ? "true" : "false") + 
                         ", preAnnouncementEnabled=" + String(preAnnouncementEnabled ? "true" : "false") +
                         ", localSize=" + String(localSize) + " bytes" +
                         ", isLocal=" + String(isLocal ? "true" : "false"));

  if (!isLocal && (preAnnouncementUrl.length() == 0 || WiFi.status() != WL_CONNECTED)) {
    Serial.println("Pre-announcement chime not found locally or online. Playing buzzer chime fallback.");
    tone(PIN_BUZZER, 2500);
    delay(200);
    noTone(PIN_BUZZER);
    delay(100);
    tone(PIN_BUZZER, 3000);
    delay(300);
    noTone(PIN_BUZZER);
    if (preAnnouncementDelaySeconds > 0) {
      delay(preAnnouncementDelaySeconds * 1000);
    }
    return true;
  }

  if (audio && playState == PLAY_STREAMING) {
    if (audio->isRunning())
      audio->stopSong();
  }

  enableAmp();
  initAudio();
  if (!audio) {
    Serial.println("playLocalPreChime: audio object NULL after initAudio — aborting");
    return false;
  }
  lcdPlayingType = "Pre-Chime";
  lcdPlayingDetail = "Announcement";

  if (isLocal) {
    Serial.println("Playing Pre-Announcement Chime from LittleFS: " + chimePath + " (" + String(localSize) + " bytes)");
    audio->connecttoFS(LittleFS, chimePath.c_str());
    isLocalPlayback = true;
  } else {
    String fullUrl = preAnnouncementUrl;
    if (!fullUrl.startsWith("http")) {
      String cleanPath = preAnnouncementUrl;
      if (cleanPath.startsWith("pre-announcements/")) {
        cleanPath = cleanPath.substring(18);
      } else if (cleanPath.startsWith("/pre-announcements/")) {
        cleanPath = cleanPath.substring(19);
      }
      while (cleanPath.startsWith("/")) {
        cleanPath = cleanPath.substring(1);
      }
      fullUrl = String(SUPABASE_URL) + "/storage/v1/object/public/pre-announcements/" + cleanPath;
    }
    Serial.println("Playing Pre-Announcement Chime from Online URL: " + fullUrl);
    audio->connecttohost(fullUrl.c_str());
    isLocalPlayback = false;
  }

  audio->setVolume(getI2SVolumeFromSystem(systemVolume));
  playState = PLAY_STREAMING;
  playStateStartTime = millis();
  updateLCD();

  unsigned long startWait = millis();
  bool audioHasStarted = false;
  unsigned long bufferTimeout = isLocal ? 1000 : 8000;
  while (audio && (millis() - startWait < 15000)) {
    esp_task_wdt_reset();
    audio->loop();
    if (audio->isRunning()) {
      audioHasStarted = true;
    } else if (audioHasStarted) {
      break;
    }

    if (!audioHasStarted && (millis() - startWait > bufferTimeout)) {
      Serial.println("Pre-chime buffering timeout.");
      break;
    }
    yield();
  }

  if (audioHasStarted) {
    Serial.println("Pre-chime played successfully.");
  } else {
    Serial.println("Pre-chime failed to start playing.");
  }

  if (audio) {
    audio->stopSong();
    // Do NOT deinitAudio() on S3 to prevent I2S driver corruption / heap crash
    delay(100);
  }

  playState = PLAY_IDLE;
  isLocalPlayback = false;

  if (preAnnouncementDelaySeconds > 0) {
    esp_task_wdt_reset();
    delay(preAnnouncementDelaySeconds * 1000);
  }
  return true;
}

void playBell(String label) {
  Serial.println("--- playBell() START --- (" + label + ")");

  // Stop any streaming audio safely
  if (audio && playState == PLAY_STREAMING) {
    if (audio->isRunning())
      audio->stopSong();
  }

  // Activate Buzzer
  tone(PIN_BUZZER, 3000);

  lcdBuzzerDetail = label;
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

  if (audio) {
    audio->stopSong();
    delay(100);
  }

  enableAmp();
  initAudio();
  delay(100);

  if (!audio) {
    Serial.println("startStreamPlayback: audio object NULL after initAudio — aborting");
    return;
  }

  Serial.println("Starting Stream Playback: " + trimmedUrl);
  lcdPlayingType = "Streaming";
  lcdPlayingDetail = trimmedUrl;
  audio->connecttohost(trimmedUrl.c_str());
  audio->setVolume(getI2SVolumeFromSystem(systemVolume));
  isLocalPlayback = false;
  audioHasStarted = false;
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
  isLocalPlayback = false;
  audioHasStarted = false;
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

  // ALWAYS use StreamElements for reliability. Google Translate TTS frequently 403s on ESP32.
  String voice = "Brian"; // Default male
  if (voiceGender == "female") {
      voice = "Amy"; // StreamElements female English voice
  } else if (lang.startsWith("es")) {
      voice = "Mia"; // Spanish female
  } else if (lang.startsWith("fr")) {
      voice = "Celine"; // French female
  }

  String url = "https://api.streamelements.com/kappa/v2/speech?voice=" + voice + "&text=" + urlEncode(text);
  String cachePath = "/chimes/tts_cache.mp3";

  // Download the TTS file to LittleFS first (before initializing Audio object to maximize free heap)
  Serial.println("Downloading TTS to cache: " + url);
  bool downloadOk = downloadFileToLittleFS(url, cachePath);
  
  if (!downloadOk) {
    Serial.println("Failed to download TTS file. Aborting TTS playback.");
    return;
  }

  enableAmp();

  // Ensure Audio is initialized (safeguard)
  initAudio();
  delay(100);

  if (!audio) {
    Serial.println("playTTS: audio object NULL after initAudio — aborting");
    return;
  }

  streamingTimeoutMs = estimateMaleTtsTimeoutMs(text);
  
  lcdPlayingType = "TTS";
  lcdPlayingDetail = text;
  audio->connecttoFS(LittleFS, cachePath.c_str());
  audio->setVolume(getI2SVolumeFromSystem(systemVolume));
  isLocalPlayback = true;
  audioHasStarted = false;
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
    d = timeinfo.tm_wday; // 0=Sun...6=Sat
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
    h = 0;
    m = 0;
    s = 0;
    d = 0;
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
  if (currentState == STATE_BOOT) {
    lcdPrintLine(0, "Connecting      ");
    lcdPrintLine(1, "To Server...    ");
  }
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

  const char *headerKeys[] = {"Date"};
  http.collectHeaders(headerKeys, 1);

  int code = http.POST(body);
  if (http.hasHeader("Date")) {
    syncTimeFromHttpDate(http.header("Date"));
  }

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
          preferences.putString("school_id", schoolId);
          preferences.putBool("is_active", true);
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
  if (audio && audio->isRunning()) {
    audio->stopSong();
  }
  noTone(PIN_BUZZER);
  digitalWrite(PIN_BUZZER, LOW); // Ensure pin is low
  disableAmp();
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
    } else if (input == "LIST_CACHED_FILES") {
      Serial.println("--- CACHED FILES ---");
      auto listDir = [](const char* dirPath) {
        File root = LittleFS.open(dirPath);
        if (!root || !root.isDirectory()) {
          Serial.printf("Directory %s not found\n", dirPath);
          return;
        }
        File f = root.openNextFile();
        while (f) {
          Serial.printf("  %s (%d bytes)\n", f.name(), f.size());
          f = root.openNextFile();
        }
      };
      Serial.println("Audio Directory:");
      listDir("/audio");
      Serial.println("Chimes Directory:");
      listDir("/chimes");
      Serial.println("--- END CACHED FILES ---");
    } else if (input == "CHECK_LITTLEFS") {
      Serial.printf("LittleFS Total: %u bytes, Used: %u bytes, Free: %u bytes\n",
                    LittleFS.totalBytes(), LittleFS.usedBytes(),
                    LittleFS.totalBytes() - LittleFS.usedBytes());
    } else if (input == "SHOW_PA_CONFIG") {
      Serial.printf("PA Enabled: %s, URL: %s, Delay: %ds\n",
                    preAnnouncementEnabled ? "true" : "false",
                    preAnnouncementUrl.c_str(), preAnnouncementDelaySeconds);
    } else if (input == "TEST_PA_CHIME") {
      Serial.println("Triggering Manual Pre-Announcement Playback...");
      playLocalPreAnnouncementChime(true);
    } else if (input == "TEST_OFFLINE_AUDIO" || input == "TEST_LOCAL_AUDIO") {
      Serial.println("--- TESTING OFFLINE AUDIO PLAYBACK ---");
      File root = LittleFS.open("/audio");
      String firstFile = "";
      if (root && root.isDirectory()) {
        File f = root.openNextFile();
        while (f) {
          String fname = String(f.name());
          if (!f.isDirectory() && fname.endsWith(".mp3") && !fname.startsWith("temp_")) {
            firstFile = "/audio/" + fname;
            f.close();
            break;
          }
          f = root.openNextFile();
        }
        root.close();
      }
      if (firstFile.length() > 0) {
        Serial.printf("Testing playback of: %s\n", firstFile.c_str());
        if (audio) {
          audio->stopSong();
          delay(100);
        }
        enableAmp();
        initAudio();
        if (audio) {
          audio->connecttoFS(LittleFS, firstFile.c_str());
          audio->setVolume(getI2SVolumeFromSystem(systemVolume));
          isLocalPlayback = true;
          audioHasStarted = false;
          playState = PLAY_STREAMING;
          playStateStartTime = millis();
          updateLCD();
          Serial.println("Offline audio started via connecttoFS.");
        }
      } else {
        Serial.println("No MP3 files found in /audio directory to test.");
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

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(15000);
  client.setTimeout(15000);

  HTTPClient http;
  http.setTimeout(15000);
  http.setUserAgent("ESP32-AutoBell/1.0");

  String url = String(SUPABASE_URL) + "/rest/v1/rpc/get_device_config";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"device_mac\": \"" + deviceMacAddress + "\"}";

  const char *headerKeys[] = {"Date"};
  http.collectHeaders(headerKeys, 1);

  esp_task_wdt_reset();
  int code = http.POST(body);
  esp_task_wdt_reset();
  if (http.hasHeader("Date")) {
    syncTimeFromHttpDate(http.header("Date"));
  }

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
  updateLCD();
}
void syncAudioCache() {
  if (WiFi.status() != WL_CONNECTED || currentState != STATE_ACTIVE)
    return;
  if (playState != PLAY_IDLE)
    return;

  std::vector<String> validLocalAudioPaths;

  // 1. Sync pre-announcement chime to LittleFS /chimes/pre_announcement.mp3
  if (preAnnouncementUrl.length() > 0) {
    String chimeLocalPath = "/chimes/pre_announcement.mp3";
    String tempChimePath = "/chimes/temp_chime.mp3";
    String cachedChimeUrl = preferences.getString("cached_chime", "");
    bool needsChimeDownload = true;

    if (LittleFS.exists(chimeLocalPath) && cachedChimeUrl == preAnnouncementUrl) {
      File f = LittleFS.open(chimeLocalPath, "r");
      if (f) {
        if (f.size() > 0) {
          needsChimeDownload = false;
        }
        f.close();
      }
    }

    if (needsChimeDownload) {
      String fullChimeUrl = preAnnouncementUrl;
      if (!fullChimeUrl.startsWith("http")) {
        String cleanPath = preAnnouncementUrl;
        if (cleanPath.startsWith("pre-announcements/")) {
          cleanPath = cleanPath.substring(18);
        } else if (cleanPath.startsWith("/pre-announcements/")) {
          cleanPath = cleanPath.substring(19);
        }
        while (cleanPath.startsWith("/")) {
          cleanPath = cleanPath.substring(1);
        }
        fullChimeUrl = String(SUPABASE_URL) + "/storage/v1/object/public/pre-announcements/" + cleanPath;
      }
      Serial.println("Syncing pre-announcement chime to LittleFS from: " + fullChimeUrl);
      if (LittleFS.exists(tempChimePath)) {
        LittleFS.remove(tempChimePath);
      }
      bool okChime = downloadFileToLittleFS(fullChimeUrl, tempChimePath);
      if (okChime && LittleFS.exists(tempChimePath)) {
        File tf = LittleFS.open(tempChimePath, "r");
        size_t tfSize = tf ? tf.size() : 0;
        if (tf) tf.close();
        if (tfSize > 0) {
          if (LittleFS.exists(chimeLocalPath)) {
            LittleFS.remove(chimeLocalPath);
          }
          LittleFS.rename(tempChimePath, chimeLocalPath);
          preferences.putString("cached_chime", preAnnouncementUrl);
          Serial.printf("Pre-announcement chime cached successfully (%u bytes)\n", tfSize);
        } else {
          LittleFS.remove(tempChimePath);
          Serial.println("Pre-announcement chime temp file was empty");
        }
      } else {
        if (LittleFS.exists(tempChimePath)) {
          LittleFS.remove(tempChimePath);
        }
        Serial.println("Failed to cache pre-announcement chime locally");
      }
      esp_task_wdt_reset();
      delay(100);
    }
  }

  // 2. Cache all Audio Manager files listed in /schedules.json (all_audio_files)
  if (LittleFS.exists("/schedules.json")) {
    File file = LittleFS.open("/schedules.json", "r");
    if (file) {
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, file);
      file.close();
      if (!err && doc.containsKey("all_audio_files")) {
        for (JsonObjectConst aud : doc["all_audio_files"].as<JsonArrayConst>()) {
          esp_task_wdt_reset();
          String audioId = aud["id"] | aud["audio_id"] | aud["ai"] | "";
          String audioUrl = aud["audio_url"] | aud["storage_path"] | aud["au"] | aud["url"] | "";
          if (audioId.length() == 0 && audioUrl.length() > 0) {
            String idFromUrl = audioUrl;
            int lastSlash = idFromUrl.lastIndexOf('/');
            if (lastSlash >= 0) idFromUrl = idFromUrl.substring(lastSlash + 1);
            int dotIdx = idFromUrl.lastIndexOf('.');
            if (dotIdx >= 0) idFromUrl = idFromUrl.substring(0, dotIdx);
            audioId = idFromUrl;
          }
          if (audioId.length() > 0 && audioUrl.length() > 0) {
            String localPath = getLocalAudioPathForId(audioId);
            validLocalAudioPaths.push_back(localPath);

            bool fileExists = false;
            if (LittleFS.exists(localPath)) {
              File f = LittleFS.open(localPath, "r");
              if (f) {
                if (f.size() > 0) {
                  fileExists = true;
                }
                f.close();
              }
            }

            if (!fileExists) {
              String filename = audioId;
              if (audioId.length() > 20) {
                uint32_t hash = 2166136261U;
                for (size_t i = 0; i < audioId.length(); i++) {
                  hash ^= (uint32_t)audioId.charAt(i);
                  hash *= 16777619U;
                }
                char hex[9];
                sprintf(hex, "%08x", hash);
                filename = String(hex);
              }
              String tempPath = "/audio/temp_" + filename + ".mp3";

              String fullUrl = audioUrl;
              if (!fullUrl.startsWith("http")) {
                String cleanUrl = audioUrl;
                if (cleanUrl.startsWith("audio-files/")) {
                  cleanUrl = cleanUrl.substring(12);
                } else if (cleanUrl.startsWith("/audio-files/")) {
                  cleanUrl = cleanUrl.substring(13);
                }
                while (cleanUrl.startsWith("/")) {
                  cleanUrl = cleanUrl.substring(1);
                }
                fullUrl = String(SUPABASE_URL) + "/storage/v1/object/public/audio-files/" + cleanUrl;
              }
              Serial.println("Caching audio manager file: " + fullUrl + " -> " + localPath);
              if (LittleFS.exists(tempPath)) {
                LittleFS.remove(tempPath);
              }
              bool ok = downloadFileToLittleFS(fullUrl, tempPath);
              if (ok && LittleFS.exists(tempPath)) {
                File tf = LittleFS.open(tempPath, "r");
                size_t tfSize = tf ? tf.size() : 0;
                if (tf) tf.close();
                if (tfSize > 0) {
                  if (LittleFS.exists(localPath)) {
                    LittleFS.remove(localPath);
                  }
                  LittleFS.rename(tempPath, localPath);
                  Serial.printf("Cached audio manager file successfully: %s (%u bytes)\n", localPath.c_str(), tfSize);
                } else {
                  LittleFS.remove(tempPath);
                  Serial.println("Downloaded audio manager temp file was empty: " + tempPath);
                }
              } else {
                if (LittleFS.exists(tempPath)) {
                  LittleFS.remove(tempPath);
                }
                Serial.println("Download failed for audio manager file: " + fullUrl);
              }

              esp_task_wdt_reset();
              delay(100);
            }
          }
        }
      }
    }
  }

  // 3. Cache any scheduled MP3 files or pre-combined files directly from activeSchedules
  for (auto &sch : activeSchedules) {
    esp_task_wdt_reset();
    if (sch.audioUrl.length() > 0) {
      if (sch.audioId.length() == 0) {
        String idFromUrl = sch.audioUrl;
        int lastSlash = idFromUrl.lastIndexOf('/');
        if (lastSlash >= 0) idFromUrl = idFromUrl.substring(lastSlash + 1);
        int dotIdx = idFromUrl.lastIndexOf('.');
        if (dotIdx >= 0) idFromUrl = idFromUrl.substring(0, dotIdx);
        sch.audioId = idFromUrl;
      }
      String localPath = getLocalAudioPathForId(sch.audioId);
      validLocalAudioPaths.push_back(localPath);

      bool fileExists = false;
      if (LittleFS.exists(localPath)) {
        File f = LittleFS.open(localPath, "r");
        if (f) {
          if (f.size() > 0) {
            fileExists = true;
          }
          f.close();
        }
      }

      if (!fileExists) {
        String filename = sch.audioId;
        if (sch.audioId.length() > 20) {
          uint32_t hash = 2166136261U;
          for (size_t i = 0; i < sch.audioId.length(); i++) {
            hash ^= (uint32_t)sch.audioId.charAt(i);
            hash *= 16777619U;
          }
          char hex[9];
          sprintf(hex, "%08x", hash);
          filename = String(hex);
        }
        String tempPath = "/audio/temp_" + filename + ".mp3";

        String fullUrl = sch.audioUrl;
        if (!fullUrl.startsWith("http")) {
          String cleanUrl = sch.audioUrl;
          if (cleanUrl.startsWith("audio-files/")) {
            cleanUrl = cleanUrl.substring(12);
          } else if (cleanUrl.startsWith("/audio-files/")) {
            cleanUrl = cleanUrl.substring(13);
          }
          while (cleanUrl.startsWith("/")) {
            cleanUrl = cleanUrl.substring(1);
          }
          fullUrl = String(SUPABASE_URL) + "/storage/v1/object/public/audio-files/" + cleanUrl;
        }
        Serial.println("Caching scheduled audio file: " + fullUrl + " -> " + localPath);
        if (LittleFS.exists(tempPath)) {
          LittleFS.remove(tempPath);
        }
        bool ok = downloadFileToLittleFS(fullUrl, tempPath);
        if (ok && LittleFS.exists(tempPath)) {
          File tf = LittleFS.open(tempPath, "r");
          size_t tfSize = tf ? tf.size() : 0;
          if (tf) tf.close();
          if (tfSize > 0) {
            if (LittleFS.exists(localPath)) {
              LittleFS.remove(localPath);
            }
            LittleFS.rename(tempPath, localPath);
            Serial.printf("Cached scheduled audio file successfully: %s (%u bytes)\n", localPath.c_str(), tfSize);
          } else {
            LittleFS.remove(tempPath);
            Serial.println("Downloaded scheduled audio temp file was empty: " + tempPath);
          }
        } else {
          if (LittleFS.exists(tempPath)) {
            LittleFS.remove(tempPath);
          }
          Serial.println("Failed to cache scheduled audio file: " + fullUrl);
        }

        esp_task_wdt_reset();
        delay(100);
      }
    }
  }

  // 4. Orphaned file garbage collection
  File dir = LittleFS.open("/audio");
  if (dir && dir.isDirectory()) {
    std::vector<String> filesToDelete;
    File f = dir.openNextFile();
    while (f) {
      String fname = f.name();
      String fullPath = fname;
      if (!fullPath.startsWith("/")) fullPath = "/" + fullPath;
      if (!fullPath.startsWith("/audio/")) {
        fullPath = "/audio/" + fullPath.substring(fullPath.lastIndexOf('/') + 1);
      }

      bool keep = false;
      // Stale temporary files (temp_*) should always be cleaned up
      if (fullPath.indexOf("temp_") == -1) {
        for (const auto &vPath : validLocalAudioPaths) {
          if (fullPath.equalsIgnoreCase(vPath)) {
            keep = true;
            break;
          }
        }
      }
      if (!keep) {
        filesToDelete.push_back(fullPath);
      }
      f = dir.openNextFile();
    }
    dir.close();

    for (const auto &p : filesToDelete) {
      Serial.println("Removing orphaned/stale audio file: " + p);
      LittleFS.remove(p);
    }
  }

  updateLCD();
}

void logToDatabase(String level, String message) {
  Serial.println("[" + level + "] " + message);
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(5000);
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/rpc/insert_device_log");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  String body = "{\"p_device_mac\": \"" + deviceMacAddress + "\", \"p_message\": \"" + message + "\", \"p_level\": \"" + level + "\"}";
  http.POST(body);
  http.end();
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

  // Stop & deinit audio engine to free heap for SSL connection
  if (audio) {
    if (audio->isRunning())
      audio->stopSong();
    deinitAudio();
    delay(200);
  }

  lcdPrintLine(0, "OTA Update Start");
  lcdPrintLine(1, "Connecting...   ");

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(30000);

  HTTPClient http;
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.setTimeout(60000);

  if (!http.begin(client, url)) {
    Serial.println("OTA HTTP Begin Failed!");
    lcdPrintLine(0, "OTA Connect Fail");
    lcdPrintLine(1, "Restarting...   ");
    delay(3000);
    return;
  }

  int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("OTA HTTP GET Failed, code: %d\n", httpCode);
    lcdPrintLine(0, "OTA HTTP Error  ");
    char errStr[17];
    snprintf(errStr, sizeof(errStr), "HTTP Code: %d", httpCode);
    lcdPrintLine(1, errStr);
    http.end();
    delay(3000);
    return;
  }

  int contentLength = http.getSize();
  Serial.printf("OTA Firmware Size: %d bytes\n", contentLength);

  if (contentLength <= 0) {
    Serial.println("OTA Error: Invalid Content-Length");
    lcdPrintLine(0, "OTA Size Error  ");
    lcdPrintLine(1, "Invalid Length  ");
    http.end();
    delay(3000);
    return;
  }

  bool canBegin = Update.begin(contentLength, U_FLASH);
  if (!canBegin) {
    Serial.printf("OTA Error: Not enough space (Error %d: %s)\n", Update.getError(), Update.errorString());
    lcdPrintLine(0, "OTA Flash Fail  ");
    lcdPrintLine(1, "Not Enough Space");
    http.end();
    delay(3000);
    return;
  }

  lcdPrintLine(0, "OTA Updating... ");
  lcdPrintLine(1, "Flashing FW...  ");

  WiFiClient *stream = http.getStreamPtr();
  uint8_t buff[2048];
  int written = 0;
  int lastPercent = -1;

  while (http.connected() && (written < contentLength)) {
    esp_task_wdt_reset();
    size_t avail = stream->available();
    if (avail) {
      int readBytes = stream->readBytes(buff, min((size_t)avail, sizeof(buff)));
      if (readBytes > 0) {
        Update.write(buff, readBytes);
        written += readBytes;

        int percent = (written * 100) / contentLength;
        if (percent != lastPercent) {
          lastPercent = percent;
          Serial.printf("OTA Progress: %d%% (%d / %d bytes)\n", percent, written, contentLength);

          char progLine[17];
          int numBars = (percent * 8) / 100;
          char barBuf[9];
          for (int i = 0; i < 8; i++) {
            barBuf[i] = (i < numBars) ? '=' : ' ';
          }
          barBuf[8] = '\0';
          snprintf(progLine, sizeof(progLine), "%3d%% [%-8s]", percent, barBuf);
          lcdPrintLine(1, String(progLine));
        }
      }
    }
    delay(1);
  }

  if (Update.end()) {
    if (Update.isFinished()) {
      Serial.println("OTA Success! Rebooting...");
      lcdPrintLine(0, "OTA COMPLETE!   ");
      lcdPrintLine(1, "Rebooting Now...");
      http.end();
      delay(2000);
      ESP.restart();
    } else {
      Serial.println("OTA Update Not Finished");
      lcdPrintLine(0, "OTA Unfinished  ");
      lcdPrintLine(1, "Restarting...   ");
      delay(3000);
    }
  } else {
    Serial.printf("OTA Update Error: #%d\n", Update.getError());
    lcdPrintLine(0, "OTA Flash Error ");
    char errStr[17];
    snprintf(errStr, sizeof(errStr), "Error Code: %d", Update.getError());
    lcdPrintLine(1, errStr);
    delay(3000);
  }

  http.end();
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

  // Heap Guard: ensure at least 35KB free heap before initiating TLS handshake
  if (ESP.getFreeHeap() < 35000) {
    Serial.printf("pollCommands: SKIPPED due to low heap (%u bytes < 35000)\n", ESP.getFreeHeap());
    return;
  }

  esp_task_wdt_reset();

  Serial.println("Polling for commands...");

  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(15000);
  client.setTimeout(15000);

  HTTPClient http;
  http.setTimeout(15000);
  http.setUserAgent("ESP32-AutoBell/1.0");
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/poll_commands";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");

  // Use deviceMacAddress instead of deviceDbId
  String body = "{\"device_mac\": \"" + deviceMacAddress + "\"}";

  const char *headerKeys[] = {"Date"};
  http.collectHeaders(headerKeys, 1);

  int code = http.POST(body);
  esp_task_wdt_reset();
  if (http.hasHeader("Date")) {
    syncTimeFromHttpDate(http.header("Date"));
  }

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

    if (doc.containsKey("pending_count")) {
      pendingCommandCount = doc["pending_count"].as<int>();
    } else {
      pendingCommandCount = 0;
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
        bool playPreChime = preAnnouncementEnabled;

        if (!payload.isNull()) {
          if (payload.containsKey("url")) {
            url = payload["url"].as<String>();
          }
          if (payload.containsKey("bypass_other_audio")) {
            bypassOther = payload["bypass_other_audio"].as<bool>();
          } else if (payload.containsKey("allow_other_audio")) {
            bypassOther = !payload["allow_other_audio"].as<bool>();
          }
          if (payload.containsKey("play_pre_announcement")) {
            playPreChime = payload["play_pre_announcement"].as<bool>();
          } else if (payload.containsKey("pre_announcement_enabled")) {
            playPreChime = payload["pre_announcement_enabled"].as<bool>();
          }
          if (payload.containsKey("pre_announcement_url") && payload["pre_announcement_url"].as<String>().length() > 0) {
            preAnnouncementUrl = payload["pre_announcement_url"].as<String>();
          }
          if (payload.containsKey("pre_announcement_delay_seconds")) {
            preAnnouncementDelaySeconds = payload["pre_announcement_delay_seconds"].as<int>();
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
          if (playPreChime) {
            playLocalPreAnnouncementChime(playPreChime);
          }
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
      } else if (strcmp(cmd, "EMERGENCY_STOP") == 0) {
        Serial.println("Executing command: EMERGENCY_STOP");
        streamModeActive = false;
        streamBypassOtherAudio = false;
        streamModeUrl = "";
        stopStreamPlayback();
        stopBuzzer();
        executed = true;
      } else if (strcmp(cmd, "RING") == 0) {
        Serial.println("Executing command: RING");
        ackCommand(cmdId); // Ack FIRST to release HTTPS connection and avoid SSL conflict
        delay(50); // Yield to lwIP network stack to release TCP/TLS socket
        executed = false;
        playLocalPreAnnouncementChime(true); // Play selected pre-announcement chime
        playBell("Manual Ring"); // Play actual bell chime/buzzer after pre-chime
      } else if (strcmp(cmd, "PLAY_URL") == 0) {
        Serial.println("Executing command: PLAY_URL");
        String url = "";
        bool playPreChime = preAnnouncementEnabled;
        if (!payload.isNull()) {
          if (payload.containsKey("url")) {
            url = payload["url"].as<String>();
          } else if (payload.containsKey("audio_url")) {
            url = payload["audio_url"].as<String>();
          }
          if (payload.containsKey("play_pre_announcement")) {
            playPreChime = payload["play_pre_announcement"].as<bool>();
          } else if (payload.containsKey("pre_announcement_enabled")) {
            playPreChime = payload["pre_announcement_enabled"].as<bool>();
          }
          if (payload.containsKey("pre_announcement_url") && payload["pre_announcement_url"].as<String>().length() > 0) {
            preAnnouncementUrl = payload["pre_announcement_url"].as<String>();
          }
          if (payload.containsKey("pre_announcement_delay_seconds")) {
            preAnnouncementDelaySeconds = payload["pre_announcement_delay_seconds"].as<int>();
          }
        }

        if (url.length() > 0) {
          url.trim();
          Serial.println("Streaming URL: " + url);
          ackCommand(cmdId); // Ack FIRST to avoid SSL conflict
          delay(50); // Yield to lwIP network stack to release TCP/TLS socket
          executed = false;
          streamingTimeoutMs = 45000;

          if (playPreChime) {
            playLocalPreAnnouncementChime(playPreChime);
          }

          // Stop any existing I2S sound
          if (audio) {
            if (audio->isRunning())
              audio->stopSong();
          }

          enableAmp();
          initAudio(); // Allocate Audio Object
          delay(50);
          if (!audio) {
            Serial.println("PLAY_URL: audio object NULL - aborting");
            return;
          }
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
        bool playPreChime = preAnnouncementEnabled;

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
          if (payload.containsKey("play_pre_announcement")) {
            playPreChime = payload["play_pre_announcement"].as<bool>();
          } else if (payload.containsKey("pre_announcement_enabled")) {
            playPreChime = payload["pre_announcement_enabled"].as<bool>();
          }
          if (payload.containsKey("pre_announcement_url") && payload["pre_announcement_url"].as<String>().length() > 0) {
            preAnnouncementUrl = payload["pre_announcement_url"].as<String>();
          }
          if (payload.containsKey("pre_announcement_delay_seconds")) {
            preAnnouncementDelaySeconds = payload["pre_announcement_delay_seconds"].as<int>();
          }
          // Fallback: Check for URL if text is missing (Camb.ai might send URL
          // in TTS command)
          if (payload.containsKey("url")) {
            url = payload["url"].as<String>();
          }
        }

        if (text.length() > 0) {
          ackCommand(cmdId); // Ack FIRST
          delay(150); // Yield to lwIP network stack to release TCP/TLS socket
          executed = false;
          if (playPreChime) {
            playLocalPreAnnouncementChime(playPreChime);
          }
          playTTS(text, lang, voiceGender);
        } else if (url.length() > 0) {
          Serial.println("TTS Command contains URL. Playing as Voice Note...");
          ackCommand(cmdId); // Ack FIRST
          delay(150); // Yield to lwIP network stack to release TCP/TLS socket
          executed = false;
          streamingTimeoutMs = 45000;

          if (playPreChime) {
            playLocalPreAnnouncementChime(playPreChime);
          }

          // Logic similar to VOICE_NOTE
          if (audio && audio->isRunning())
            audio->stopSong();
          enableAmp();
          initAudio();
          if (!audio) {
            Serial.println("TTS URL: audio object NULL - aborting");
            return;
          }
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
        bool playPreChime = preAnnouncementEnabled;
        if (!payload.isNull()) {
          if (payload.containsKey("url")) {
            url = payload["url"].as<String>();
          }
          if (payload.containsKey("play_pre_announcement")) {
            playPreChime = payload["play_pre_announcement"].as<bool>();
          } else if (payload.containsKey("pre_announcement_enabled")) {
            playPreChime = payload["pre_announcement_enabled"].as<bool>();
          }
          if (payload.containsKey("pre_announcement_url") && payload["pre_announcement_url"].as<String>().length() > 0) {
            preAnnouncementUrl = payload["pre_announcement_url"].as<String>();
          }
          if (payload.containsKey("pre_announcement_delay_seconds")) {
            preAnnouncementDelaySeconds = payload["pre_announcement_delay_seconds"].as<int>();
          }
        }

        if (url.length() > 0) {
          url.trim();
          Serial.println("Playing Voice Note: " + url);
          ackCommand(cmdId); // Ack FIRST
          delay(50); // Yield to lwIP network stack to release TCP/TLS socket

          streamingTimeoutMs = 45000; // 45s safety timeout for Voice Notes

          if (playPreChime) {
            playLocalPreAnnouncementChime(playPreChime);
          }

          if (audio) {
            if (audio->isRunning())
              audio->stopSong();
          }
          enableAmp();
          initAudio();
          delay(50);
          if (!audio) {
            Serial.println("VOICE_NOTE: audio object NULL - aborting");
            return;
          }
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
      } else if (strcmp(cmd, "TEST_AUDIO") == 0) {
        Serial.println("Executing command: TEST_AUDIO");
        ackCommand(cmdId);
        delay(50);
        executed = false;
        playLocalPreAnnouncementChime(true);
        playBell("Test Audio");
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
        syncAudioCache();
        executed = true;
      } else if (strcmp(cmd, "SET_VOLUME") == 0) {
        Serial.println("Executing command: SET_VOLUME");
        if (!payload.isNull() && payload.containsKey("volume")) {
          int newVol = payload["volume"].as<int>();
          if (newVol >= 0 && newVol <= 100) {
            systemVolume = newVol;
            preferences.putInt("volume", systemVolume);

            if (audio) {
              audio->setVolume(getI2SVolumeFromSystem(systemVolume));
            }
            Serial.printf("Volume set to %d (I2S=%d)\n", systemVolume, getI2SVolumeFromSystem(systemVolume));
            executed = true;
          } else {
            Serial.println("Invalid volume range (0-100)");
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
          delay(300); // Yield to lwIP network stack to release SSL socket

          executed = false; // Prevent double ack

          performOTAUpdate(url);
        } else {
          Serial.println("Error: No URL provided for Firmware Update");
        }
      }

      // Ack
      if (executed) {
        Serial.println("Command Executed. Sending Ack...");
        WiFiClientSecure ackClient;
        ackClient.setInsecure();
        HTTPClient ackHttp;
        ackHttp.begin(ackClient, String(SUPABASE_URL) + "/rest/v1/rpc/ack_command");
        ackHttp.addHeader("apikey", SUPABASE_KEY);
        ackHttp.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
        ackHttp.addHeader("Content-Type", "application/json");
        ackHttp.POST("{\"p_command_id\": " + cmdId + ", \"p_device_mac\": \"" + deviceMacAddress + "\"}");
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
  const char *headerKeys[] = {"Date"};
  http.collectHeaders(headerKeys, 1);
  http.POST(body);
  if (http.hasHeader("Date")) {
    syncTimeFromHttpDate(http.header("Date"));
  }
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
    preferences.putInt("tz_offset", offsetSecs);
    Serial.printf("Updating Timezone Offset: %ld seconds (from server)\n",
                  offsetSecs);
    configTime(offsetSecs, 0, NTP_SERVERS[0], NTP_SERVERS[1], NTP_SERVERS[2]);
  }

  if (doc.containsKey("school_id")) {
    String sId = doc["school_id"].as<String>();
    if (sId.length() > 0) {
      sId.toCharArray(schoolId, 40);
      preferences.putString("school_id", schoolId);
      preferences.putBool("is_active", true);
      currentState = STATE_ACTIVE;
    }
  }

  if (doc.containsKey("profile_name")) {
    String pName = doc["profile_name"].as<String>();
    Serial.printf("Active Profile: %s\n", pName.c_str());
  }

  if (doc.containsKey("volume")) {
    int v = doc["volume"].as<int>();
    if (v >= 0 && v <= 100) {
      systemVolume = v;
      preferences.putInt("volume", systemVolume);
      if (audio) {
        audio->setVolume(getI2SVolumeFromSystem(systemVolume));
      }
      Serial.printf("Device Config Volume Updated: %d\n", systemVolume);
    }
  } else if (doc.containsKey("vol")) {
    int v = doc["vol"].as<int>();
    if (v >= 0 && v <= 100) {
      systemVolume = v;
      preferences.putInt("volume", systemVolume);
      if (audio) {
        audio->setVolume(getI2SVolumeFromSystem(systemVolume));
      }
      Serial.printf("Device Config Volume Updated: %d\n", systemVolume);
    }
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

  if (doc.containsKey("pa_en")) {
    preAnnouncementEnabled = doc["pa_en"].as<bool>();
  } else if (doc.containsKey("pre_announcement_enabled")) {
    preAnnouncementEnabled = doc["pre_announcement_enabled"].as<bool>();
  }

  if (doc.containsKey("pa_url")) {
    preAnnouncementUrl = doc["pa_url"].as<String>();
  } else if (doc.containsKey("pre_announcement_url")) {
    preAnnouncementUrl = doc["pre_announcement_url"].as<String>();
  }

  if (doc.containsKey("pa_delay")) {
    preAnnouncementDelaySeconds = doc["pa_delay"].as<int>();
  } else if (doc.containsKey("pre_announcement_delay_seconds")) {
    preAnnouncementDelaySeconds = doc["pre_announcement_delay_seconds"].as<int>();
  }

  preferences.putBool("pa_en", preAnnouncementEnabled);
  preferences.putString("pa_url", preAnnouncementUrl);
  preferences.putInt("pa_delay", preAnnouncementDelaySeconds);

  Serial.printf("Pre-Announcement: %s, Delay: %ds, URL: %s\n",
                preAnnouncementEnabled ? "ENABLED" : "DISABLED",
                preAnnouncementDelaySeconds, preAnnouncementUrl.c_str());

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
      if (!audioUrlStr) audioUrlStr = obj["au"];
      item.audioUrl = audioUrlStr ? String(audioUrlStr) : "";
      const char *audioIdStr = obj["audio_id"];
      if (!audioIdStr) audioIdStr = obj["ai"];
      item.audioId = audioIdStr ? String(audioIdStr) : "";

      if (item.audioId.length() == 0 && item.audioUrl.length() > 0) {
        String idFromUrl = item.audioUrl;
        int lastSlash = idFromUrl.lastIndexOf('/');
        if (lastSlash >= 0) idFromUrl = idFromUrl.substring(lastSlash + 1);
        int dotIdx = idFromUrl.lastIndexOf('.');
        if (dotIdx >= 0) idFromUrl = idFromUrl.substring(0, dotIdx);
        item.audioId = idFromUrl;
      }

      item.lastRung = 0;
      item.precombined = obj["pc"] | false;

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
        if (activeSchedules.size() > 0 || strlen(schoolId) > 0) {
          currentState = STATE_ACTIVE;
          Serial.printf("Loaded %d cached schedules from LittleFS. State set to ACTIVE.\n", activeSchedules.size());
        }
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

          bool isOnline = (WiFi.status() == WL_CONNECTED);

          if (sch.type == "tts") {
            if (isOnline && sch.ttsMessage.length() > 0) {
              if (!sch.precombined) {
                playLocalPreAnnouncementChime();
              }
              playTTS(sch.ttsMessage, "en");
            } else {
              if (!isOnline) {
                Serial.println("[Offline Mode] Internet unavailable. Skipping online TTS, playing Pre-Chime + Audio Manager MP3.");
              }
              if (!sch.precombined) {
                playLocalPreAnnouncementChime();
              }

              String localPath = "";
              if (sch.audioId.length() > 0)
                localPath = getLocalAudioPathForId(sch.audioId);

              bool playedLocal = false;
              if (localPath.length() > 0 && LittleFS.exists(localPath)) {
                streamingTimeoutMs = 0;
                if (audio) {
                  audio->stopSong();
                  delay(100);
                }
                enableAmp();
                initAudio();
                if (!audio) {
                  Serial.println("[Scheduler] Audio object NULL - falling back to buzzer");
                  playBell("Schedule Bell");
                  sch.lastRung = now;
                  continue;
                }
                lcdPlayingType = "Voice Note";
                lcdPlayingDetail = sch.audioUrl;
                audio->connecttoFS(LittleFS, localPath.c_str());
                audio->setVolume(getI2SVolumeFromSystem(systemVolume));
                isLocalPlayback = true;
                audioHasStarted = false;
                playState = PLAY_STREAMING;
                playStateStartTime = millis();
                playedLocal = true;
                updateLCD();
              } else if (isOnline && sch.audioUrl.length() > 0) {
                String fullUrl = String(SUPABASE_URL) +
                                 "/storage/v1/object/public/audio-files/" +
                                 sch.audioUrl;
                startStreamPlayback(fullUrl);
                playedLocal = true;
              }

              if (!playedLocal) {
                playBell("Schedule Bell");
              }
            }
          } else if (sch.type == "mp3") {
            if (!sch.precombined) {
              playLocalPreAnnouncementChime();
            }

            if (sch.audioUrl.length() > 0) {
              String localPath = "";
              if (sch.audioId.length() == 0 && sch.audioUrl.length() > 0) {
                String idFromUrl = sch.audioUrl;
                int lastSlash = idFromUrl.lastIndexOf('/');
                if (lastSlash >= 0) idFromUrl = idFromUrl.substring(lastSlash + 1);
                int dotIdx = idFromUrl.lastIndexOf('.');
                if (dotIdx >= 0) idFromUrl = idFromUrl.substring(0, dotIdx);
                sch.audioId = idFromUrl;
              }
              if (sch.audioId.length() > 0)
                localPath = getLocalAudioPathForId(sch.audioId);

              bool playedLocal = false;
              if (localPath.length() > 0 && LittleFS.exists(localPath)) {
                streamingTimeoutMs = 0;
                if (audio) {
                  audio->stopSong();
                  delay(100);
                }
                enableAmp();
                initAudio();
                if (!audio) {
                  Serial.println("[Scheduler] Audio object NULL - falling back to buzzer");
                  playBell("Schedule Bell");
                  sch.lastRung = now;
                  continue;
                }
                lcdPlayingType = "Voice Note";
                lcdPlayingDetail = sch.audioUrl;
                audio->connecttoFS(LittleFS, localPath.c_str());
                audio->setVolume(getI2SVolumeFromSystem(systemVolume));
                isLocalPlayback = true;
                audioHasStarted = false;
                playState = PLAY_STREAMING;
                playStateStartTime = millis();
                playedLocal = true;
                updateLCD();
              }

              if (!playedLocal) {
                if (isOnline) {
                  String fullUrl = String(SUPABASE_URL) +
                                   "/storage/v1/object/public/audio-files/" +
                                   sch.audioUrl;
                  startStreamPlayback(fullUrl);
                } else {
                  playBell("Schedule Bell");
                }
              }
            } else {
              playBell("Schedule Bell");
            }
          } else {
            if (!sch.precombined) {
              playLocalPreAnnouncementChime();
            }
            playBell("Schedule Bell");
          }
          sch.lastRung = now;
        }
      }
    }
  }
}
