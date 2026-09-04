#ifndef REALTIME_CLIENT_H
#define REALTIME_CLIENT_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <esp_websocket_client.h>
#include <functional>

/**
 * Supabase Realtime WebSocket Client for AutoBell ESP32-S3
 * 
 * Implements the Phoenix Channels protocol over WSS to receive:
 * 1. Instant commands (Voice notes, TTS broadcasts, manual bell triggers)
 * 2. Schedule update alerts (triggers one-time sync instead of constant polling)
 * 
 * Drastically reduces network activity and CPU load by replacing continuous
 * 15-second HTTP polling with a single persistent, event-driven WebSocket.
 */

typedef std::function<void(const char* command, JsonObject& payload)> RealtimeCommandCallback;
typedef std::function<void()> RealtimeScheduleUpdateCallback;

class RealtimeClient {
public:
    static RealtimeClient& getInstance() {
        static RealtimeClient instance;
        return instance;
    }

    void begin(const char* supabaseUrl, const char* anonKey, const String& macAddress, const String& schoolId) {
        _supabaseUrl = supabaseUrl;
        _anonKey = anonKey;
        _macAddress = macAddress;
        _cleanMac = macAddress;
        _cleanMac.replace(":", "");
        _cleanMac.replace("-", "");
        _cleanMac.toUpperCase();
        _schoolId = schoolId;

        // Build WebSocket URI: wss://<host>/realtime/v1/websocket?apikey=<key>&vsn=2.0.0
        String host = _supabaseUrl;
        if (host.startsWith("https://")) {
            host = host.substring(8);
        } else if (host.startsWith("http://")) {
            host = host.substring(7);
        }
        int slashIdx = host.indexOf('/');
        if (slashIdx > 0) {
            host = host.substring(0, slashIdx);
        }

        _wsUri = "wss://" + host + "/realtime/v1/websocket?apikey=" + String(_anonKey) + "&vsn=2.0.0";
        Serial.printf("[Realtime] Configured URI: wss://%s/realtime/v1/websocket\n", host.c_str());

        esp_websocket_client_config_t ws_cfg = {};
        ws_cfg.uri = _wsUri.c_str();
        ws_cfg.disable_auto_reconnect = false;
        ws_cfg.reconnect_timeout_ms = 10000;
        ws_cfg.network_timeout_ms = 15000;
        ws_cfg.buffer_size = 4096;

        if (_client) {
            esp_websocket_client_destroy(_client);
            _client = nullptr;
        }

        _client = esp_websocket_client_init(&ws_cfg);
        esp_websocket_register_events(_client, WEBSOCKET_EVENT_ANY, _eventHandler, this);
        esp_websocket_client_start(_client);
        _isRunning = true;
        Serial.println("[Realtime] WebSocket client started in background task");
    }

    void onCommand(RealtimeCommandCallback cb) {
        _commandCallback = cb;
    }

    void onScheduleUpdate(RealtimeScheduleUpdateCallback cb) {
        _scheduleCallback = cb;
    }

    void setSchoolId(const String& schoolId) {
        _schoolId = schoolId;
        if (isConnected()) {
            joinChannels();
        }
    }

    bool isConnected() const {
        return _isConnected;
    }

    void loop() {
        if (!_isRunning || !_isConnected || !_client) return;

        // Send Phoenix heartbeat every 30 seconds
        if (millis() - _lastHeartbeat >= 30000) {
            _lastHeartbeat = millis();
            sendHeartbeat();
        }
    }

    void stop() {
        if (_client && _isRunning) {
            esp_websocket_client_stop(_client);
            esp_websocket_client_destroy(_client);
            _client = nullptr;
            _isRunning = false;
            _isConnected = false;
        }
    }

private:
    RealtimeClient() : _client(nullptr), _isConnected(false), _isRunning(false), _lastHeartbeat(0), _refCounter(1) {}

    esp_websocket_client_handle_t _client;
    String _supabaseUrl;
    const char* _anonKey;
    String _macAddress;
    String _cleanMac;
    String _schoolId;
    String _wsUri;
    bool _isConnected;
    bool _isRunning;
    unsigned long _lastHeartbeat;
    uint32_t _refCounter;

    RealtimeCommandCallback _commandCallback;
    RealtimeScheduleUpdateCallback _scheduleCallback;

    static void _eventHandler(void* handler_args, esp_event_base_t base, int32_t event_id, void* event_data) {
        RealtimeClient* self = static_cast<RealtimeClient*>(handler_args);
        esp_websocket_event_data_t* data = static_cast<esp_websocket_event_data_t*>(event_data);

        switch (event_id) {
            case WEBSOCKET_EVENT_CONNECTED:
                Serial.println("[Realtime] Connected to Supabase WebSocket!");
                self->_isConnected = true;
                self->_lastHeartbeat = millis();
                self->joinChannels();
                break;

            case WEBSOCKET_EVENT_DISCONNECTED:
                Serial.println("[Realtime] Disconnected from Supabase WebSocket (will auto-reconnect)");
                self->_isConnected = false;
                break;

            case WEBSOCKET_EVENT_DATA:
                if (data->op_code == 0x01 && data->data_len > 0) { // Text frame
                    self->handleMessage(data->data_ptr, data->data_len);
                }
                break;

            case WEBSOCKET_EVENT_ERROR:
                Serial.println("[Realtime] WebSocket error event encountered");
                break;
        }
    }

    void joinChannels() {
        if (!_client || !_isConnected) return;

        // 1. Join Device-specific channel
        String topicDevice = "realtime:device:" + _cleanMac;
        sendJoin(topicDevice);

        // 2. Join School-specific broadcast channel if available
        if (_schoolId.length() > 0) {
            String topicSchool = "realtime:school:" + _schoolId;
            sendJoin(topicSchool);
        }

        // 3. Join Postgres changes channel for command_queue
        sendJoin("realtime:public:command_queue");

        // 4. Join Postgres changes channel for bell_times
        sendJoin("realtime:public:bell_times");
    }

    void sendJoin(const String& topic) {
        JsonDocument doc;
        doc["topic"] = topic;
        doc["event"] = "phx_join";
        doc["payload"] = JsonObject();
        doc["ref"] = String(_refCounter++);

        String payloadStr;
        serializeJson(doc, payloadStr);
        esp_websocket_client_send_text(_client, payloadStr.c_str(), payloadStr.length(), portMAX_DELAY);
        Serial.printf("[Realtime] Joined topic: %s\n", topic.c_str());
    }

    void sendHeartbeat() {
        JsonDocument doc;
        doc["topic"] = "phoenix";
        doc["event"] = "heartbeat";
        doc["payload"] = JsonObject();
        doc["ref"] = String(_refCounter++);

        String payloadStr;
        serializeJson(doc, payloadStr);
        esp_websocket_client_send_text(_client, payloadStr.c_str(), payloadStr.length(), portMAX_DELAY);
    }

    void handleMessage(const char* data, int len) {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, data, len);
        if (err) {
            return;
        }

        const char* event = doc["event"];
        const char* topic = doc["topic"];
        if (!event || !topic) return;

        // Ignore Phoenix protocol acknowledgments and heartbeats
        if (strcmp(event, "phx_reply") == 0 || strcmp(topic, "phoenix") == 0) {
            return;
        }

        Serial.printf("[Realtime] Event received: %s on topic %s\n", event, topic);

        // Check if event is a command from broadcast channel or postgres insert
        JsonObject payload = doc["payload"];

        // Format A: Realtime Broadcast event ({ event: "command", payload: { command: "...", payload: { ... } } })
        if (strcmp(event, "command") == 0 || strcmp(event, "VOICE_NOTE") == 0 || strcmp(event, "TTS_BROADCAST") == 0) {
            const char* cmdName = event;
            if (payload.containsKey("command")) {
                cmdName = payload["command"];
            }
            JsonObject cmdPayload = payload.containsKey("payload") ? payload["payload"].as<JsonObject>() : payload;
            if (_commandCallback) {
                _commandCallback(cmdName, cmdPayload);
            }
            return;
        }

        // Format B: Postgres INSERT on command_queue
        if (strcmp(event, "INSERT") == 0 && String(topic).indexOf("command_queue") != -1) {
            JsonObject record = payload["record"];
            if (!record.isNull()) {
                const char* cmd = record["command"];
                JsonObject cmdPayload = record["payload"].as<JsonObject>();
                if (_commandCallback && cmd) {
                    _commandCallback(cmd, cmdPayload);
                }
            }
            return;
        }

        // Format C: Schedule or bell_times updated
        if (strcmp(event, "schedule_updated") == 0 || 
           ((strcmp(event, "INSERT") == 0 || strcmp(event, "UPDATE") == 0 || strcmp(event, "DELETE") == 0) && String(topic).indexOf("bell_times") != -1)) {
            Serial.println("[Realtime] Schedule modification detected! Triggering one-time sync...");
            if (_scheduleCallback) {
                _scheduleCallback();
            }
            return;
        }
    }
};

#endif // REALTIME_CLIENT_H
