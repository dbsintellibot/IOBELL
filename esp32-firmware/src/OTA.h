#ifndef OTA_H
#define OTA_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>

// Function to perform OTA update from a URL
// Returns true if successful, false otherwise
bool performOTAUpdate(const String& binUrl) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("OTA: WiFi not connected");
        return false;
    }

    Serial.println("OTA: Starting update from " + binUrl);

    HTTPClient http;
    // Follow redirects is important for some hosting providers (like GitHub releases)
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    
    http.begin(binUrl);
    int httpCode = http.GET();

    if (httpCode != HTTP_CODE_OK) {
        Serial.printf("OTA: HTTP Failed, error: %s\n", http.errorToString(httpCode).c_str());
        http.end();
        return false;
    }

    int contentLength = http.getSize();
    Serial.printf("OTA: Firmware size: %d\n", contentLength);

    bool canBegin = Update.begin(contentLength);
    if (!canBegin) {
        Serial.println("OTA: Not enough space to begin OTA");
        http.end();
        return false;
    }

    WiFiClient* stream = http.getStreamPtr();
    size_t written = Update.writeStream(*stream);

    if (written == contentLength) {
        Serial.println("OTA: Written : " + String(written) + " successfully");
    } else {
        Serial.println("OTA: Written only : " + String(written) + "/" + String(contentLength) + ". Retry?");
    }

    if (Update.end()) {
        Serial.println("OTA: OTA done!");
        if (Update.isFinished()) {
            Serial.println("OTA: Update successfully completed. Rebooting...");
            http.end();
            return true;
        } else {
            Serial.println("OTA: Update not finished? Something went wrong!");
        }
    } else {
        Serial.printf("OTA: Error Occurred. Error #: %d\n", Update.getError());
    }

    http.end();
    return false;
}

#endif
